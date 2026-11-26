"""색 배경(매트) 위 바지락 자동 분리와 라벨링 초안 생성.

학습된 모델이 없는 초기 단계에서 쓰는 고전 영상처리 기반 1단계(개체 분리)다.
  1) 배경색(초록·청록 매트)이 아닌 픽셀을 전경으로 잡고
  2) 개체마다 크기에 맞춘 열림 연산으로 물기 반사·물방울 꼬리를 떼어낸 뒤
  3) 개체별 원본 해상도 ROI를 잘라 낱개 영상으로 저장한다.

출력은 사람이 검수할 라벨링 초안이다(외관 라벨은 모두 UNKNOWN).
COCO 파일에는 낱개 영상 기준 clam 폴리곤이 들어 있어, CVAT 등에서 불러와
결함 위치만 추가로 그리면 된다.

  python -m clam_inspect.bootstrap photo1.jpg photo2.jpg --batch-id B20261126 --out data/bootstrap
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

try:
    import cv2
except ImportError as e:  # pragma: no cover
    raise SystemExit("opencv-python-headless 필요: pip install -e .[bootstrap]") from e

from .labels import Observation, ExtLabel, Quality, decide_route
from .quality import QualityConfig, assess
from .roi import expand_box


@dataclass(frozen=True)
class MatConfig:
    hue_lo: int = 70  # OpenCV H(0~179) 기준 초록~청록
    hue_hi: int = 105
    sat_min: int = 90  # 배경은 채도가 높다
    val_min: int = 60  # 아주 어두운 픽셀은 색상이 불안정하므로 배경으로 보지 않음
    min_area_frac: float = 0.002  # 영상 면적 대비 최소 개체 면적
    open_frac: float = 0.35  # 개체 최대 내접 반경 대비 열림 반경
    border_px: int = 3
    roi_margin: float = 0.15


@dataclass
class Instance:
    idx: int
    box: tuple[int, int, int, int]  # x1, y1, x2, y2 (원본 좌표)
    area_px: int
    length_px: float  # 최소 외접 사각형 긴 변
    width_px: float
    solidity: float
    touches_border: bool
    contour: np.ndarray
    mask: np.ndarray  # 원본 크기 uint8


def segment_on_mat(img_bgr: np.ndarray, cfg: MatConfig = MatConfig()) -> list[Instance]:
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    H, S, V = cv2.split(hsv)
    bg = (H >= cfg.hue_lo) & (H <= cfg.hue_hi) & (S >= cfg.sat_min) & (V >= cfg.val_min)
    fg = (~bg).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

    h, w = fg.shape
    min_area = cfg.min_area_frac * h * w
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    out: list[Instance] = []
    for i in range(1, n):
        if st[i, 4] < min_area:
            continue
        m = (lab == i).astype(np.uint8)
        cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        m = np.zeros_like(m)
        cv2.drawContours(m, cnts, -1, 1, -1)  # 내부 구멍(무늬) 채움
        # 개체 크기에 비례한 열림: 가는 물줄기·반사 꼬리 제거
        r = max(3, int(cfg.open_frac * cv2.distanceTransform(m, cv2.DIST_L2, 5).max()))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
        nn, l2, s2, _ = cv2.connectedComponentsWithStats(m)
        if nn < 2:
            continue
        j = 1 + int(np.argmax(s2[1:, 4]))
        if s2[j, 4] < min_area:
            continue
        m = (l2 == j).astype(np.uint8)
        cnt = max(cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
        x, y, bw, bh = cv2.boundingRect(cnt)
        (_, _), (a, b), _ = cv2.minAreaRect(cnt)
        area = int(m.sum())
        hull = cv2.contourArea(cv2.convexHull(cnt))
        b_px = cfg.border_px
        out.append(Instance(
            idx=0, box=(x, y, x + bw, y + bh), area_px=area,
            length_px=float(max(a, b)), width_px=float(min(a, b)),
            solidity=min(1.0, cv2.contourArea(cnt) / max(hull, 1.0)),
            touches_border=x <= b_px or y <= b_px or x + bw >= w - b_px or y + bh >= h - b_px,
            contour=cnt, mask=m,
        ))
    # 읽는 순서(위→아래, 왼→오른쪽)로 번호: 행은 개체 높이의 절반 이내면 같은 줄
    out.sort(key=lambda o: (o.box[1] + o.box[3]) / 2)
    rows: list[list[Instance]] = []
    for o in out:
        cy = (o.box[1] + o.box[3]) / 2
        if rows and abs(cy - np.mean([(r.box[1] + r.box[3]) / 2 for r in rows[-1]])) < 0.5 * (o.box[3] - o.box[1]):
            rows[-1].append(o)
        else:
            rows.append([o])
    ordered = [o for row in rows for o in sorted(row, key=lambda o: o.box[0])]
    for k, o in enumerate(ordered, start=1):
        o.idx = k
    return ordered


def gap_to_nearest(insts: list[Instance]) -> dict[int, float]:
    """개체 윤곽 사이 최소 거리(px). 단독 분기 간격 판단(설계서 12장)의 근거."""
    res = {}
    for a in insts:
        best = float("inf")
        pa = a.contour.reshape(-1, 2)[::4].astype(np.float32)
        for b in insts:
            if a is b:
                continue
            pb = b.contour.reshape(-1, 2)[::4].astype(np.float32)
            d = np.sqrt(((pa[:, None, :] - pb[None, :, :]) ** 2).sum(-1)).min()
            best = min(best, float(d))
        res[a.idx] = best
    return res


def color_features(img_bgr: np.ndarray, inst: Instance) -> dict[str, float]:
    """Lab 평균색과 명암 대비(무늬 강도). 외관 그룹 차이(종 혼입·색 변이) 확인용."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    k = cv2.erode(inst.mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(bool)
    px = lab[k].astype(np.float32)
    L = px[:, 0] * 100 / 255
    return {
        "L_mean": float(L.mean()),
        "a_mean": float(px[:, 1].mean() - 128),
        "b_mean": float(px[:, 2].mean() - 128),
        "L_std": float(L.std()),
        "dark_frac": float((L < 35).mean()),
    }


def polygon(cnt: np.ndarray, eps_frac: float = 0.004) -> list[float]:
    eps = eps_frac * cv2.arcLength(cnt, True)
    p = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2)
    return [float(v) for xy in p for v in xy]


def draw_overlay(img_bgr: np.ndarray, insts: list[Instance], routes: dict[int, str] | None = None) -> np.ndarray:
    o = img_bgr.copy()
    tint = o.copy()
    for inst in insts:
        tint[inst.mask > 0] = (255, 0, 200)
    o = cv2.addWeighted(tint, 0.25, o, 0.75, 0)
    th = max(2, img_bgr.shape[1] // 400)
    for inst in insts:
        cv2.drawContours(o, [inst.contour], -1, (255, 0, 200), th)
        x1, y1, _, _ = inst.box
        label = f"#{inst.idx}"
        fs = max(0.6, img_bgr.shape[1] / 1400)
        (tw, tht), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, fs, 2)
        cv2.rectangle(o, (x1, max(0, y1 - tht - 10)), (x1 + tw + 8, y1), (20, 20, 20), -1)
        cv2.putText(o, label, (x1 + 4, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, fs, (255, 255, 255), 2, cv2.LINE_AA)
    return o


def process_image(path: Path, batch_id: str, out: Path, cfg: MatConfig, qcfg: QualityConfig,
                  mm_per_px: float | None, coco: dict, rows: list[dict], feats: list[dict]) -> list[Instance]:
    img = cv2.imread(str(path))
    if img is None:
        raise SystemExit(f"영상을 읽을 수 없음: {path}")
    H, W = img.shape[:2]
    insts = segment_on_mat(img, cfg)
    gaps = gap_to_nearest(insts)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    stem = path.stem
    (out / "objects").mkdir(parents=True, exist_ok=True)
    for inst in insts:
        oid = f"{batch_id}-{stem}-{inst.idx:02d}"
        crop = expand_box(inst.box, cfg.roi_margin, W, H)
        x1, y1, x2, y2 = crop
        name = f"objects/{oid}.png"
        cv2.imwrite(str(out / name), img[y1:y2, x1:x2])
        q, qm = assess(rgb, inst.box, qcfg)
        if inst.touches_border:
            q = Quality.TRUNCATED
        # 결함 모델이 없으므로 외관은 판독 보류 → 규칙상 정상 후보로 보내지 않는다.
        dec = decide_route(Observation(labels=frozenset({ExtLabel.UNKNOWN}), quality=q))
        im_id = len(coco["images"]) + 1
        coco["images"].append({"id": im_id, "file_name": name, "width": x2 - x1, "height": y2 - y1})
        poly = polygon(inst.contour)
        poly = [v - (x1 if i % 2 == 0 else y1) for i, v in enumerate(poly)]
        bx1, by1, bx2, by2 = inst.box
        coco["annotations"].append({
            "id": len(coco["annotations"]) + 1, "image_id": im_id, "category_id": 1,
            "bbox": [bx1 - x1, by1 - y1, bx2 - bx1, by2 - by1], "area": inst.area_px,
            "segmentation": [poly], "iscrowd": 0,
        })
        rows.append({
            "image_path": name, "object_id": oid, "batch_id": batch_id, "captured_at": "",
            "labels": "UNKNOWN", "quality_state": q.value, "lighting": "", "wet": "", "orientation": "",
            "exposure_us": "", "size_mm": f"{inst.length_px * mm_per_px:.1f}" if mm_per_px else "",
            "annotator": "auto", "note": f"source={path.name} box={list(inst.box)}",
        })
        f = {
            "object_id": oid, "source": path.name, "idx": inst.idx, "box": list(inst.box),
            "area_px": inst.area_px, "length_px": round(inst.length_px, 1), "width_px": round(inst.width_px, 1),
            "aspect": round(inst.width_px / max(inst.length_px, 1), 3), "solidity": round(inst.solidity, 3),
            "gap_px": round(gaps.get(inst.idx, float("inf")), 1), "touches_border": inst.touches_border,
            "quality_state": q.value, "lap_var": round(qm.get("lap_var", 0), 1),
            "glare_ratio": round(qm.get("glare_ratio", 0), 4), "route": dec.route.value, "route_reason": dec.reason,
        }
        f.update({k: round(v, 2) for k, v in color_features(img, inst).items()})
        if mm_per_px:
            f["length_mm"] = round(inst.length_px * mm_per_px, 1)
            f["width_mm"] = round(inst.width_px * mm_per_px, 1)
        feats.append(f)
    cv2.imwrite(str(out / f"{stem}_overlay.jpg"), draw_overlay(img, insts), [cv2.IMWRITE_JPEG_QUALITY, 90])
    return insts


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="매트 위 바지락 자동 분리 → 낱개 영상·라벨링 초안")
    ap.add_argument("images", nargs="+")
    ap.add_argument("--batch-id", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mm-per-px", type=float, help="눈금자로 잰 배율 (있으면 mm 크기 기록)")
    a = ap.parse_args(argv)

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    coco = {"images": [], "annotations": [],
            "categories": [{"id": 1, "name": "clam"}, {"id": 2, "name": "BROKEN"},
                           {"id": 3, "name": "CHIPPED"}, {"id": 4, "name": "CRACK_SUSPECT"}]}
    rows: list[dict] = []
    feats: list[dict] = []
    for p in a.images:
        insts = process_image(Path(p), a.batch_id, out, MatConfig(), QualityConfig(), a.mm_per_px, coco, rows, feats)
        print(f"{p}: 개체 {len(insts)}개")
    (out / "annotations_draft.json").write_text(json.dumps(coco, ensure_ascii=False), encoding="utf-8")
    with (out / "manifest_draft.csv").open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ["image_path"])
        w.writeheader()
        w.writerows(rows)
    with (out / "features.csv").open("w", newline="", encoding="utf-8-sig") as f:
        if feats:
            w = csv.DictWriter(f, fieldnames=list(feats[0]))
            w.writeheader()
            w.writerows(feats)
    print(f"저장: {out} (낱개 영상 {len(rows)}개, manifest_draft.csv, annotations_draft.json, features.csv)")


if __name__ == "__main__":
    main()

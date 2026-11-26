"""2단계 추론: 개체 분할 → 원본 해상도 ROI → 결함 점수.

출력은 판정 전의 원시 점수다. 경로 판정과 임계값 선택은 evaluate.py에서 한다.

예:
  python -m clam_inspect.predict --clam runs/clam/last.pt --defect runs/defect/last.pt \
      --manifest data/manifest.csv --split runs/split.json --which val --out runs/pred_val.json
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision.transforms.functional import pil_to_tensor

from .dataset import load_split, read_manifest
from .labels import Track
from .models import load_checkpoint, pick_device
from .quality import QualityConfig, assess
from .roi import expand_box


@torch.inference_mode()
def run_one(img: Image.Image, clam_m, defect_m, dev, roi_margin: float, clam_thr: float,
            qcfg: QualityConfig, defect_classes) -> dict:
    W, H = img.size
    t0 = time.perf_counter()
    x = (pil_to_tensor(img).float() / 255.0).to(dev)
    out = clam_m([x])[0]
    keep = out["scores"] >= clam_thr
    t1 = time.perf_counter()
    rec: dict = {"n_clams": int(keep.sum()), "clam_ms": (t1 - t0) * 1000}
    if not keep.any():
        rec.update(track_state=Track.LOST.value, quality_state=None, defect_scores={})
        return rec
    # 선별대 시험: 영상 1장 = 개체 1개. 가장 확실한 개체를 사용하고 다수 검출은 기록한다.
    i = int(out["scores"].argmax())
    box = tuple(float(v) for v in out["boxes"][i].tolist())
    q, qm = assess(np.asarray(img), box, qcfg)
    crop = expand_box(box, roi_margin, W, H)
    roi = img.crop(crop)
    xr = (pil_to_tensor(roi).float() / 255.0).to(dev)
    dout = defect_m([xr])[0]
    t2 = time.perf_counter()
    scores = {c: 0.0 for c in defect_classes}
    dets = []
    for b, l, s in zip(dout["boxes"].tolist(), dout["labels"].tolist(), dout["scores"].tolist()):
        c = defect_classes[l - 1]
        scores[c] = max(scores[c], s)
        if s >= 0.05:
            dets.append({"label": c, "score": round(s, 4),
                         "box": [round(b[0] + crop[0], 1), round(b[1] + crop[1], 1),
                                 round(b[2] + crop[0], 1), round(b[3] + crop[1], 1)]})
    rec.update(
        track_state=Track.VALID.value if rec["n_clams"] == 1 else Track.AMBIGUOUS.value,
        clam_box=[round(v, 1) for v in box],
        clam_score=float(out["scores"][i]),
        quality_state=q.value,
        quality_metrics=qm,
        defect_scores=scores,
        detections=dets,
        defect_ms=(t2 - t1) * 1000,
    )
    return rec


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clam", required=True)
    ap.add_argument("--defect", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--split", required=True)
    ap.add_argument("--which", choices=("train", "val", "test"), required=True)
    ap.add_argument("--root")
    ap.add_argument("--out", required=True)
    ap.add_argument("--clam-thr", type=float, default=0.5)
    ap.add_argument("--device", default="auto")
    a = ap.parse_args(argv)

    dev = pick_device(a.device)
    clam_m, ck_c = load_checkpoint(Path(a.clam), dev)
    defect_m, ck_d = load_checkpoint(Path(a.defect), dev)
    root = Path(a.root or Path(a.manifest).parent)
    split = load_split(a.split)
    rows = [r for r in read_manifest(a.manifest) if split.get(r.object_id) == a.which]

    results = []
    lat = []
    for r in rows:
        img = Image.open(root / r.image_path).convert("RGB")
        rec = run_one(img, clam_m, defect_m, dev, ck_d["cfg"]["roi_margin"], a.clam_thr,
                      QualityConfig(), ck_d["classes"])
        rec.update(image_path=r.image_path, object_id=r.object_id, batch_id=r.batch_id,
                   captured_at=r.captured_at)
        lat.append(rec["clam_ms"] + rec.get("defect_ms", 0.0))
        results.append(rec)

    model_version = f'{ck_c["cfg"]["model_version"]}+{ck_d["cfg"]["model_version"]}'
    lat_np = np.array(lat) if lat else np.zeros(1)
    summary = {
        "split": a.which,
        "images": len(results),
        "model_version": model_version,
        "device": str(dev),
        "latency_ms": {"mean": float(lat_np.mean()), "p50": float(np.percentile(lat_np, 50)),
                       "p95": float(np.percentile(lat_np, 95)), "p99": float(np.percentile(lat_np, 99)),
                       "max": float(lat_np.max())},
    }
    Path(a.out).write_text(json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=1),
                           encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

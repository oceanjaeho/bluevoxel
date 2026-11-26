"""파이프라인 점검용 가짜 데이터 생성.

실제 바지락이 아니다. 설치 확인과 코드 흐름 점검에만 쓰고,
이 데이터의 성능 수치는 아무 의미가 없다.

  python scripts/make_synthetic.py --out data/synthetic --objects 60
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W, H = 640, 480


def ellipse_poly(cx, cy, rx, ry, rot, n=48):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts += [cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)]
    return pts


def bbox(poly):
    xs, ys = poly[0::2], poly[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def draw_object(rng: random.Random, label: str):
    bg = tuple(rng.randint(20, 40) for _ in range(3))
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    cx, cy = rng.randint(220, 420), rng.randint(180, 300)
    rx, ry, rot = rng.randint(110, 150), rng.randint(80, 105), rng.uniform(0, math.pi)
    shell = ellipse_poly(cx, cy, rx, ry, rot)
    base = (rng.randint(150, 200), rng.randint(130, 170), rng.randint(100, 140))
    d.polygon(shell, fill=base)
    for k in range(1, 7):  # 성장선
        s = k / 7
        d.line(ellipse_poly(cx, cy + ry * (1 - s) * 0.6, rx * s, ry * s, rot) + ellipse_poly(cx, cy + ry * (1 - s) * 0.6, rx * s, ry * s, rot)[:2],
               fill=tuple(max(0, c - 35) for c in base), width=2)
    defects = []
    if label == "BROKEN":
        t = rng.uniform(0, 2 * math.pi)
        ex, ey = cx + rx * 0.95 * math.cos(t), cy + ry * 0.95 * math.sin(t)
        r = rng.randint(25, 40)
        wedge = ellipse_poly(ex, ey, r, r * 0.7, rng.uniform(0, math.pi), n=12)
        d.polygon(wedge, fill=bg)
        defects.append(("BROKEN", wedge))
    elif label == "CRACK_SUSPECT":
        x0, y0 = cx + rng.randint(-40, 40), cy + rng.randint(-30, 30)
        x1, y1 = x0 + rng.randint(-60, 60), y0 + rng.randint(30, 60)
        d.line([x0, y0, x1, y1], fill=(40, 30, 25), width=2)
        defects.append(("CRACK_SUSPECT", [x0 - 3, y0 - 3, x1 + 3, y0 - 3, x1 + 3, y1 + 3, x0 - 3, y1 + 3]))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    return img, shell, defects


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--objects", type=int, default=60)
    ap.add_argument("--shots", type=int, default=2, help="개체당 반복 촬영 수")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()

    rng = random.Random(a.seed)
    out = Path(a.out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    cats = ["clam", "BROKEN", "CHIPPED", "CRACK_SUSPECT"]
    coco = {"images": [], "annotations": [], "categories": [{"id": i + 1, "name": c} for i, c in enumerate(cats)]}
    rows = []
    ann_id = 1
    for o in range(a.objects):
        label = rng.choices(["NORMAL_EXT", "BROKEN", "CRACK_SUSPECT"], [0.5, 0.35, 0.15])[0]
        batch = f"B{1 + o * 3 // a.objects}"
        for s in range(a.shots):
            img, shell, defects = draw_object(rng, label)
            name = f"images/O{o:04d}_{s}.png"
            img.save(out / name)
            im_id = len(coco["images"]) + 1
            coco["images"].append({"id": im_id, "file_name": name, "width": W, "height": H})
            for cat, poly in [("clam", shell)] + defects:
                x1, y1, x2, y2 = bbox(poly)
                coco["annotations"].append({
                    "id": ann_id, "image_id": im_id, "category_id": cats.index(cat) + 1,
                    "bbox": [x1, y1, x2 - x1, y2 - y1], "area": (x2 - x1) * (y2 - y1),
                    "segmentation": [poly], "iscrowd": 0,
                })
                ann_id += 1
            rows.append({"image_path": name, "object_id": f"O{o:04d}", "batch_id": batch,
                         "captured_at": f"2026-12-01T10:{o % 60:02d}:{s:02d}", "labels": label,
                         "quality_state": "ok", "lighting": "synthetic"})
    (out / "annotations.json").write_text(json.dumps(coco), encoding="utf-8")
    with (out / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"{a.objects} objects, {len(rows)} images -> {out}")


if __name__ == "__main__":
    main()

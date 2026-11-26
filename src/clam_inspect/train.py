"""모델 학습.

예:
  python -m clam_inspect.train --task clam   --manifest data/manifest.csv \
      --coco data/annotations.json --split runs/split.json --out runs/clam
  python -m clam_inspect.train --task defect --manifest data/manifest.csv \
      --coco data/annotations.json --split runs/split.json --out runs/defect

임계값·모델 선택은 val로만 한다(evaluate.py). test는 마지막에 한 번만 쓴다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import torch

from .coco import load_coco
from .dataset import load_split, read_manifest
from .models import DetDataset, TASKS, build_items, build_model, collate, pick_device, save_checkpoint


def file_hash(p: str | Path) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()[:12]


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", choices=TASKS, required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--coco", required=True)
    ap.add_argument("--split", required=True)
    ap.add_argument("--root", help="영상 경로 기준 폴더 (기본: manifest 폴더)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch", type=int, default=2)
    ap.add_argument("--lr", type=float, default=0.01)
    ap.add_argument("--min-size", type=int, help="입력 짧은 변 (clam 800, defect 1024 기본)")
    ap.add_argument("--max-size", type=int, default=1600)
    ap.add_argument("--roi-margin", type=float, default=0.1)
    ap.add_argument("--no-pretrained", action="store_true", help="COCO 사전학습 가중치 미사용")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--max-iters", type=int, default=0, help="스모크 테스트용 반복 제한")
    a = ap.parse_args(argv)

    min_size = a.min_size or (800 if a.task == "clam" else 1024)
    root = Path(a.root or Path(a.manifest).parent)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    rows = read_manifest(a.manifest)
    split = load_split(a.split)
    coco = load_coco(a.coco)
    train_paths = [r.image_path for r in rows if split.get(r.object_id) == "train"]
    items = build_items(a.task, train_paths, root, coco, a.roi_margin)
    if not items:
        raise SystemExit("학습 항목이 없음: split/coco 확인")
    n_pos = sum(1 for it in items if it.anns)
    print(f"[{a.task}] 학습 항목 {len(items)} (주석 있음 {n_pos}, 음성 {len(items) - n_pos})")

    ds = DetDataset(items, TASKS[a.task], masks=a.task == "clam", augment=True)
    dl = torch.utils.data.DataLoader(
        ds, batch_size=a.batch, shuffle=True, num_workers=a.workers, collate_fn=collate
    )
    dev = pick_device(a.device)
    model = build_model(a.task, min_size, a.max_size, pretrained=not a.no_pretrained).to(dev)
    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.SGD(params, lr=a.lr, momentum=0.9, weight_decay=1e-4)
    total = a.epochs * len(dl)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=max(total, 1), pct_start=0.1)

    cfg = {
        "min_size": min_size,
        "max_size": a.max_size,
        "roi_margin": a.roi_margin,
        "manifest_sha": file_hash(a.manifest),
        "coco_sha": file_hash(a.coco),
        "split_sha": file_hash(a.split),
        "epochs": a.epochs,
        "lr": a.lr,
        "pretrained": not a.no_pretrained,
    }
    version = f"{a.task}-{time.strftime('%Y%m%d-%H%M%S')}"
    cfg["model_version"] = version

    it_n = 0
    model.train()
    for ep in range(a.epochs):
        t0, run = time.time(), 0.0
        for imgs, targets in dl:
            imgs = [i.to(dev) for i in imgs]
            targets = [{k: v.to(dev) for k, v in t.items()} for t in targets]
            losses = model(imgs, targets)
            loss = sum(losses.values())
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            run += loss.item()
            it_n += 1
            if a.max_iters and it_n >= a.max_iters:
                break
        print(f"epoch {ep + 1}/{a.epochs} loss {run / max(1, len(dl)):.4f} ({time.time() - t0:.0f}s)")
        save_checkpoint(out / "last.pt", model, a.task, cfg)
        if a.max_iters and it_n >= a.max_iters:
            break
    (out / "train_config.json").write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    print(f"저장: {out / 'last.pt'} (model_version={version})")


if __name__ == "__main__":
    main()

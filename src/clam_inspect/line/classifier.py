"""낱개 개체 사진 → 상태 분류 (정상 / 깨짐 / 금 감 / 다른 조개·이물).

'누가 봐도 구분되는 상태'를 사진 한 장 단위로 고르는 분류 모델이다(설계서 10장 '개체 분류').
결함 위치까지 내는 탐지 모델(models.py)은 데이터가 쌓인 뒤의 다음 단계다.
'모르겠음' 라벨은 학습에 쓰지 않는다.

학습:
  python -m clam_inspect.line.classifier train --labels runs/line/labels.db --out runs/line/cls.pt
"""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import cv2
import numpy as np

from ..labels import ExtLabel
from .config import Thresholds

CLASSES = (ExtLabel.NORMAL_EXT, ExtLabel.BROKEN, ExtLabel.CRACK_SUSPECT, ExtLabel.FOREIGN)
SIZE = 224


def _prep(crop_bgr: np.ndarray, size: int = SIZE) -> np.ndarray:
    """종횡비를 지키며 정사각형으로 맞춘다(빈 곳은 가장자리 색으로 채움)."""
    h, w = crop_bgr.shape[:2]
    s = size / max(h, w)
    img = cv2.resize(crop_bgr, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    out = cv2.copyMakeBorder(img, 0, size - img.shape[0], 0, size - img.shape[1], cv2.BORDER_REPLICATE)
    rgb = cv2.cvtColor(out, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    mean, std = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225])
    return ((rgb - mean) / std).transpose(2, 0, 1).astype(np.float32)


def labels_from_probs(probs: dict[str, float], th: Thresholds) -> frozenset[ExtLabel]:
    """확률 → 외관 라벨. 확신이 없으면 UNKNOWN(→ 재검사). 정상은 가장 엄격하게."""
    out = set()
    for lab in (ExtLabel.BROKEN, ExtLabel.FOREIGN):
        if probs.get(lab.value, 0.0) >= th.defect:
            out.add(lab)
    if probs.get(ExtLabel.CRACK_SUSPECT.value, 0.0) >= th.crack:
        out.add(ExtLabel.CRACK_SUSPECT)
    if out:
        return frozenset(out)
    if probs.get(ExtLabel.NORMAL_EXT.value, 0.0) >= th.normal:
        return frozenset({ExtLabel.NORMAL_EXT})
    return frozenset({ExtLabel.UNKNOWN})


def _build(n: int, pretrained: bool):
    import torch.nn as nn
    from torchvision.models import ResNet18_Weights, resnet18

    m = resnet18(weights=ResNet18_Weights.DEFAULT if pretrained else None)
    m.fc = nn.Linear(m.fc.in_features, n)
    return m


class ClamClassifier:
    def __init__(self, path: str | Path, device: str = "auto"):
        import torch

        self.torch = torch
        ck = torch.load(path, map_location="cpu", weights_only=False)
        self.classes = [ExtLabel(c) for c in ck["classes"]]
        self.version = ck.get("model_version", Path(path).stem)
        self.model = _build(len(self.classes), pretrained=False)
        self.model.load_state_dict(ck["state_dict"])
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = torch.device(device)
        self.model.to(self.device).eval()

    def predict(self, crop_bgr: np.ndarray) -> dict[str, float]:
        x = self.torch.from_numpy(_prep(crop_bgr))[None].to(self.device)
        with self.torch.inference_mode():
            p = self.torch.softmax(self.model(x), dim=1)[0].cpu().numpy()
        return {c.value: float(v) for c, v in zip(self.classes, p)}


# ---------------- 학습 ----------------

def _augment(img: np.ndarray, rng: random.Random) -> np.ndarray:
    if rng.random() < 0.5:
        img = cv2.flip(img, 1)
    if rng.random() < 0.5:
        img = cv2.flip(img, 0)
    img = np.rot90(img, rng.randint(0, 3)).copy()
    a = rng.uniform(0.85, 1.15)
    b = rng.uniform(-15, 15)
    return np.clip(img.astype(np.float32) * a + b, 0, 255).astype(np.uint8)


def train(items: list[tuple[str, str, str]], out: Path, epochs: int = 15, pretrained: bool = True,
          val_frac: float = 0.2, seed: int = 0, device: str = "auto") -> dict:
    """items: (이미지 경로, object_id, 라벨). 같은 개체는 한쪽 분할에만 들어간다."""
    import torch

    cls_idx = {c.value: i for i, c in enumerate(CLASSES)}
    items = [it for it in items if it[2] in cls_idx]
    if len(items) < 8:
        raise SystemExit(f"학습할 라벨이 너무 적음: {len(items)}개 (모르겠음 제외)")
    rng = random.Random(seed)
    objs = sorted({o for _, o, _ in items})
    rng.shuffle(objs)
    val_objs = set(objs[: max(1, int(len(objs) * val_frac))])
    tr = [it for it in items if it[1] not in val_objs]
    va = [it for it in items if it[1] in val_objs]

    imgs = {p: cv2.imread(p) for p, _, _ in items}
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    dev = torch.device(device)
    model = _build(len(CLASSES), pretrained).to(dev)
    counts = np.bincount([cls_idx[l] for _, _, l in tr], minlength=len(CLASSES)).astype(np.float32)
    weight = torch.tensor(np.where(counts > 0, counts.sum() / np.maximum(counts, 1) / len(CLASSES), 0.0),
                          dtype=torch.float32, device=dev)  # 드문 불량을 덜 무시하도록
    lossf = torch.nn.CrossEntropyLoss(weight=weight)
    opt = torch.optim.AdamW(model.parameters(), lr=3e-4 if pretrained else 1e-3, weight_decay=1e-4)

    def batch(rows, aug):
        x = np.stack([_prep(_augment(imgs[p], rng) if aug else imgs[p]) for p, _, _ in rows])
        y = [cls_idx[l] for _, _, l in rows]
        return torch.from_numpy(x).to(dev), torch.tensor(y, device=dev)

    for ep in range(epochs):
        model.train()
        rng.shuffle(tr)
        tot = 0.0
        for i in range(0, len(tr), 16):
            x, y = batch(tr[i:i + 16], True)
            loss = lossf(model(x), y)
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot += loss.item() * len(y)
        print(f"epoch {ep + 1}/{epochs} loss {tot / max(1, len(tr)):.3f}")

    model.eval()
    conf = np.zeros((len(CLASSES), len(CLASSES)), int)
    with torch.inference_mode():
        for i in range(0, len(va), 32):
            x, y = batch(va[i:i + 32], False)
            pred = model(x).argmax(1)
            for t, p in zip(y.tolist(), pred.tolist()):
                conf[t, p] += 1
    version = f"cls-{time.strftime('%Y%m%d-%H%M%S')}"
    torch.save({"classes": [c.value for c in CLASSES], "state_dict": model.state_dict(),
                "model_version": version, "pretrained": pretrained,
                "train_items": len(tr), "val_items": len(va)}, out)
    report = {"model_version": version, "train": len(tr), "val": len(va),
              "classes": [c.value for c in CLASSES], "confusion": conf.tolist()}
    Path(out).with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--labels", required=True, help="라벨링 DB (labels.db)")
    t.add_argument("--out", required=True)
    t.add_argument("--epochs", type=int, default=15)
    t.add_argument("--no-pretrained", action="store_true")
    t.add_argument("--min-agree", type=int, default=1, help="이 수 이상 같은 라벨이 붙은 사진만 사용")
    a = ap.parse_args(argv)

    from .labeling import LabelStore

    store = LabelStore(a.labels)
    items = store.training_items(min_agree=a.min_agree)
    rep = train(items, Path(a.out), a.epochs, not a.no_pretrained)
    print(json.dumps(rep, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

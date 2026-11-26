"""모델 정의와 학습용 데이터셋 (torch 필요: pip install -e .[train]).

2단계 구조 (설계서 10장):
  A. clam   : 전체 영상에서 개체 인스턴스 분할 (Mask R-CNN)
  B. defect : 원본 해상도 개체 ROI에서 결함 탐지 (Faster R-CNN)

torchvision 구현(BSD-3)을 사용해 상용 탑재 시 AGPL 문제를 피한다.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from torchvision.models.detection import (
    FasterRCNN_ResNet50_FPN_V2_Weights,
    MaskRCNN_ResNet50_FPN_V2_Weights,
    fasterrcnn_resnet50_fpn_v2,
    maskrcnn_resnet50_fpn_v2,
)
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor
from torchvision.transforms.functional import pil_to_tensor

from .coco import CLAM, DEFECT_CATEGORIES, Ann, CocoIndex
from .roi import crop_anns, expand_box

TASKS = {"clam": (CLAM,), "defect": DEFECT_CATEGORIES}


@dataclass
class Item:
    image_path: Path
    anns: list[Ann]
    crop: tuple[int, int, int, int] | None = None
    meta: dict = field(default_factory=dict)


def build_items(
    task: str,
    image_paths: list[str],
    root: Path,
    coco: CocoIndex,
    roi_margin: float = 0.1,
) -> list[Item]:
    """manifest 영상 목록 → 학습 항목. defect 작업은 정답 clam 박스로 ROI를 자른다."""
    items: list[Item] = []
    for p in image_paths:
        if task == "clam":
            items.append(Item(root / p, coco.anns(p, CLAM)))
            continue
        W, H = coco.size[_key(p, coco)]
        defects = [a for a in coco.anns(p) if a.category in DEFECT_CATEGORIES]
        for clam in coco.anns(p, CLAM):
            crop = expand_box(clam.box, roi_margin, W, H)
            # 결함 없는 개체도 음성 표본으로 포함한다 (과검출 학습에 필요).
            items.append(Item(root / p, crop_anns(defects, crop), crop))
    return items


def _key(p: str, coco: CocoIndex) -> str:
    k = Path(p).as_posix().lstrip("./")
    if k not in coco.size:
        raise KeyError(f"COCO 파일에 영상 없음: {p}")
    return k


def _poly_mask(polys: list[list[float]], w: int, h: int) -> np.ndarray:
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        if len(p) >= 6:
            d.polygon(p, fill=1)
    return np.asarray(m, dtype=np.uint8)


class DetDataset(torch.utils.data.Dataset):
    def __init__(self, items: list[Item], classes: tuple[str, ...], masks: bool, augment: bool):
        self.items = items
        self.cls = {c: i + 1 for i, c in enumerate(classes)}  # 0 = background
        self.masks = masks
        self.augment = augment

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i: int):
        it = self.items[i]
        img = Image.open(it.image_path).convert("RGB")
        if it.crop:
            img = img.crop(it.crop)
        w, h = img.size
        anns = [a for a in it.anns if a.category in self.cls]
        boxes = torch.tensor([a.box for a in anns], dtype=torch.float32).reshape(-1, 4)
        target = {
            "boxes": boxes,
            "labels": torch.tensor([self.cls[a.category] for a in anns], dtype=torch.int64),
        }
        if self.masks:
            ms = [_poly_mask(a.polygons, w, h) for a in anns]
            target["masks"] = torch.from_numpy(np.stack(ms)) if ms else torch.zeros((0, h, w), dtype=torch.uint8)
        x = pil_to_tensor(img).float() / 255.0
        if self.augment:
            x, target = _flip(x, target, w, h)
        return x, target


def _flip(x, t, w, h):
    if random.random() < 0.5:
        x = x.flip(-1)
        b = t["boxes"].clone()
        t["boxes"][:, 0], t["boxes"][:, 2] = w - b[:, 2], w - b[:, 0]
        if "masks" in t:
            t["masks"] = t["masks"].flip(-1)
    if random.random() < 0.5:
        x = x.flip(-2)
        b = t["boxes"].clone()
        t["boxes"][:, 1], t["boxes"][:, 3] = h - b[:, 3], h - b[:, 1]
        if "masks" in t:
            t["masks"] = t["masks"].flip(-2)
    return x, t


def collate(batch):
    return tuple(zip(*batch))


def build_model(task: str, min_size: int, max_size: int, pretrained: bool):
    n = len(TASKS[task]) + 1
    kw = dict(min_size=min_size, max_size=max_size)
    if not pretrained:
        kw.update(weights=None, weights_backbone=None)
    if task == "clam":
        if pretrained:
            kw["weights"] = MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT
        m = maskrcnn_resnet50_fpn_v2(**kw)
        m.roi_heads.box_predictor = FastRCNNPredictor(m.roi_heads.box_predictor.cls_score.in_features, n)
        m.roi_heads.mask_predictor = MaskRCNNPredictor(
            m.roi_heads.mask_predictor.conv5_mask.in_channels, 256, n
        )
    else:
        if pretrained:
            kw["weights"] = FasterRCNN_ResNet50_FPN_V2_Weights.DEFAULT
        m = fasterrcnn_resnet50_fpn_v2(**kw)
        m.roi_heads.box_predictor = FastRCNNPredictor(m.roi_heads.box_predictor.cls_score.in_features, n)
    return m


def pick_device(name: str = "auto") -> torch.device:
    if name != "auto":
        return torch.device(name)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def save_checkpoint(path: Path, model, task: str, cfg: dict) -> None:
    torch.save({"task": task, "classes": TASKS[task], "cfg": cfg, "state_dict": model.state_dict()}, path)


def load_checkpoint(path: Path, device: torch.device):
    ck = torch.load(path, map_location=device, weights_only=False)
    cfg = ck["cfg"]
    m = build_model(ck["task"], cfg["min_size"], cfg["max_size"], pretrained=False)
    m.load_state_dict(ck["state_dict"])
    return m.to(device).eval(), ck

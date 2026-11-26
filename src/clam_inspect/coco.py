"""COCO 형식 어노테이션 읽기.

CVAT·Label Studio 등에서 COCO(폴리곤)로 내보낸 파일을 그대로 쓴다.
카테고리: clam(개체 영역) + 결함 라벨(BROKEN, CHIPPED, CRACK_SUSPECT).
결함은 개체 영역 안의 위치만 표시하고, 개체 전체의 외관 라벨은 manifest가 정답이다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

CLAM = "clam"
DEFECT_CATEGORIES = ("BROKEN", "CHIPPED", "CRACK_SUSPECT")


@dataclass
class Ann:
    category: str
    box: tuple[float, float, float, float]  # x1, y1, x2, y2
    polygons: list[list[float]] = field(default_factory=list)


@dataclass
class CocoIndex:
    by_file: dict[str, list[Ann]]
    size: dict[str, tuple[int, int]]  # file_name -> (W, H)
    categories: list[str]

    def anns(self, file_name: str, category: str | None = None) -> list[Ann]:
        anns = self.by_file.get(_norm(file_name), [])
        return [a for a in anns if category is None or a.category == category]


def _norm(p: str) -> str:
    return Path(p).as_posix().lstrip("./")


def load_coco(path: str | Path) -> CocoIndex:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    cats = {c["id"]: c["name"] for c in data["categories"]}
    images = {im["id"]: im for im in data["images"]}
    by_file: dict[str, list[Ann]] = {_norm(im["file_name"]): [] for im in images.values()}
    size = {_norm(im["file_name"]): (im["width"], im["height"]) for im in images.values()}
    for a in data["annotations"]:
        im = images[a["image_id"]]
        x, y, w, h = a["bbox"]
        seg = a.get("segmentation") or []
        if isinstance(seg, dict):
            raise ValueError("RLE segmentation은 지원하지 않음: 폴리곤으로 내보낼 것")
        by_file[_norm(im["file_name"])].append(
            Ann(cats[a["category_id"]], (x, y, x + w, y + h), [list(map(float, p)) for p in seg])
        )
    return CocoIndex(by_file, size, sorted(set(cats.values())))

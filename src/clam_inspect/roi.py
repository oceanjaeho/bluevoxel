"""원본 해상도 ROI 추출 (설계서 10장).

전체 영상을 축소하면 미세 결함 픽셀이 사라지므로, 개체 영역을 원본 해상도로
잘라 결함 모델에 넣는다.
"""

from __future__ import annotations

from .coco import Ann

Box = tuple[float, float, float, float]


def expand_box(box: Box, margin: float, W: int, H: int) -> tuple[int, int, int, int]:
    """박스를 변 길이의 margin 비율만큼 넓히고 영상 경계로 자른다."""
    x1, y1, x2, y2 = box
    mx, my = (x2 - x1) * margin, (y2 - y1) * margin
    return (
        max(0, int(x1 - mx)),
        max(0, int(y1 - my)),
        min(W, int(round(x2 + mx))),
        min(H, int(round(y2 + my))),
    )


def touches_border(box: Box, W: int, H: int, px: float = 2.0) -> bool:
    x1, y1, x2, y2 = box
    return x1 <= px or y1 <= px or x2 >= W - px or y2 >= H - px


def crop_anns(anns: list[Ann], crop: tuple[int, int, int, int], min_keep: float = 0.3) -> list[Ann]:
    """crop 영역으로 결함 박스를 옮긴다. 잘린 뒤 원래 면적의 min_keep 미만이면 버린다."""
    cx1, cy1, cx2, cy2 = crop
    out = []
    for a in anns:
        x1, y1, x2, y2 = a.box
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        nx1, ny1 = max(x1, cx1), max(y1, cy1)
        nx2, ny2 = min(x2, cx2), min(y2, cy2)
        if nx2 <= nx1 or ny2 <= ny1 or area <= 0:
            continue
        if (nx2 - nx1) * (ny2 - ny1) < min_keep * area:
            continue
        polys = [
            [v - (cx1 if i % 2 == 0 else cy1) for i, v in enumerate(p)] for p in a.polygons
        ]
        out.append(Ann(a.category, (nx1 - cx1, ny1 - cy1, nx2 - cx1, ny2 - cy1), polys))
    return out

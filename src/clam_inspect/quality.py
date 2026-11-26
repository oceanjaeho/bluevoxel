"""영상 품질 자동 판정 (quality_state).

외관 불량과 분리해 "이 영상으로 판정해도 되는가"를 본다.
임계값 기본값은 출발점일 뿐이며, T01 광학 시험 영상으로 보정해야 한다.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .labels import Quality
from .roi import touches_border


@dataclass(frozen=True)
class QualityConfig:
    blur_min_lap_var: float = 30.0  # Laplacian 분산이 이보다 작으면 흐림
    glare_level: int = 250  # 이 값 이상인 RGB 픽셀을 포화로 봄
    glare_max_ratio: float = 0.03  # ROI 중 포화 픽셀 비율 상한
    border_px: float = 2.0  # 박스가 영상 가장자리에 닿으면 잘림


def laplacian_var(gray: np.ndarray) -> float:
    g = gray.astype(np.float32)
    lap = (
        -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    )
    return float(lap.var()) if lap.size else 0.0


def assess(
    img: np.ndarray,
    box: tuple[float, float, float, float],
    cfg: QualityConfig = QualityConfig(),
) -> tuple[Quality, dict[str, float]]:
    """img: H×W×3 uint8 (원본), box: 개체 박스 (원본 좌표)."""
    H, W = img.shape[:2]
    x1, y1, x2, y2 = (int(round(v)) for v in box)
    roi = img[max(0, y1) : min(H, y2), max(0, x1) : min(W, x2)]
    if roi.size == 0:
        return Quality.TRUNCATED, {}
    gray = roi.mean(axis=2) if roi.ndim == 3 else roi
    lv = laplacian_var(gray)
    sat = roi.min(axis=2) >= cfg.glare_level if roi.ndim == 3 else roi >= cfg.glare_level
    glare = float(sat.mean())
    m = {"lap_var": lv, "glare_ratio": glare}
    if touches_border(box, W, H, cfg.border_px):
        return Quality.TRUNCATED, m
    if glare > cfg.glare_max_ratio:
        return Quality.GLARE, m
    if lv < cfg.blur_min_lap_var:
        return Quality.BLUR, m
    return Quality.OK, m

"""한 프레임 검사: 개체 분리 → 원본 해상도 ROI → 품질 → 분류 → 판정 입력.

시제품은 색 벨트(초록·청록) 위 개체를 고전 영상처리로 분리한다(bootstrap.segment_on_mat).
벨트 색이 다르면 MatConfig 색 범위를 바꾸거나, 학습한 개체 분할 모델로 교체한다.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import cv2
import numpy as np

from ..bootstrap import Instance, MatConfig, segment_on_mat
from ..labels import ExtLabel, Quality
from ..quality import QualityConfig, assess
from ..roi import expand_box
from .classifier import labels_from_probs
from .config import LineConfig


@dataclass
class ObjectResult:
    inst: Instance
    crop: np.ndarray
    quality: Quality
    quality_metrics: dict
    probs: dict[str, float]
    labels: frozenset[ExtLabel]
    center_px: tuple[float, float]


@dataclass
class FrameResult:
    objects: list[ObjectResult]
    seg_ms: float
    cls_ms: float
    shape: tuple[int, int]


class Inspector:
    def __init__(self, cfg: LineConfig, classifier=None, mat: MatConfig = MatConfig(),
                 qcfg: QualityConfig = QualityConfig()):
        self.cfg, self.classifier, self.mat, self.qcfg = cfg, classifier, mat, qcfg

    @property
    def model_version(self) -> str:
        return getattr(self.classifier, "version", "none")

    def inspect(self, frame: np.ndarray) -> FrameResult:
        t0 = time.perf_counter()
        insts = segment_on_mat(frame, self.mat)
        t1 = time.perf_counter()
        H, W = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        out = []
        for inst in insts:
            x1, y1, x2, y2 = expand_box(inst.box, self.mat.roi_margin, W, H)
            crop = frame[y1:y2, x1:x2].copy()
            q, qm = assess(rgb, inst.box, self.qcfg)
            if inst.touches_border:
                q = Quality.TRUNCATED
            if self.classifier is not None and q is Quality.OK:
                probs = self.classifier.predict(crop)
                labels = labels_from_probs(probs, self.cfg.thresholds)
            else:
                probs, labels = {}, frozenset({ExtLabel.UNKNOWN})
            m = cv2.moments(inst.mask, binaryImage=True)
            c = (m["m10"] / max(m["m00"], 1), m["m01"] / max(m["m00"], 1))
            out.append(ObjectResult(inst, crop, q, qm, probs, labels, c))
        t2 = time.perf_counter()
        return FrameResult(out, (t1 - t0) * 1000, (t2 - t1) * 1000, (H, W))

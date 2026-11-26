"""라벨 체계와 판정 규칙 (설계서 11장·12장).

외관 라벨, 영상 품질, 추적 상태, 최종 경로를 서로 다른 필드로 분리한다.
한 개체가 여러 외관 라벨을 가질 수 있지만 최종 경로는 하나다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable, Mapping


class ExtLabel(str, Enum):
    """관찰된 상부 표면의 외관 라벨 (5종)."""

    NORMAL_EXT = "NORMAL_EXT"  # 정상 후보 (가시 표면 기준)
    BROKEN = "BROKEN"  # 명확한 파손
    CHIPPED = "CHIPPED"  # 허용 범위를 넘은 결손
    CRACK_SUSPECT = "CRACK_SUSPECT"  # 균열 의심 (성장선과 구분 불가)
    UNKNOWN = "UNKNOWN"  # 판독 보류


# 즉시 불량으로 분리하는 라벨
DEFECT_LABELS = frozenset({ExtLabel.BROKEN, ExtLabel.CHIPPED})
# 재검사로 보내는 불확실 라벨
UNCERTAIN_LABELS = frozenset({ExtLabel.CRACK_SUSPECT, ExtLabel.UNKNOWN})


class Quality(str, Enum):
    """영상 검사 가능성. 외관 불량과 분리해 기록한다."""

    OK = "ok"
    BLUR = "blur"
    GLARE = "glare"
    OCCLUDED = "occluded"
    TRUNCATED = "truncated"


class Track(str, Enum):
    """판정 결과와 실물 개체의 연결 상태."""

    VALID = "valid"
    LOST = "lost"
    AMBIGUOUS = "ambiguous"


class Route(str, Enum):
    PASS = "normal_candidate"
    REJECT = "defect"
    RECHECK = "recheck"


@dataclass(frozen=True)
class Decision:
    route: Route
    reason: str


@dataclass
class Observation:
    """한 개체의 1회 검사 결과 (판정 입력)."""

    labels: frozenset[ExtLabel]
    quality: Quality = Quality.OK
    track: Track = Track.VALID
    isolated: bool = True  # 단독 분기 가능한 간격 확보 여부
    deadline_ok: bool = True  # 판정 메시지가 유효 기한 안에 도착했는지
    scores: Mapping[str, float] = field(default_factory=dict)


def decide_route(obs: Observation) -> Decision:
    """12장 판정 규칙.

    1) 추적·간격·기한 → 2) 영상 품질 → 3) 명백한 파손·결손 → 4) 불확실 라벨
    → 5) 모든 조건을 충족한 경우에만 정상 후보.
    """
    if obs.track is not Track.VALID:
        return Decision(Route.RECHECK, f"track_{obs.track.value}")
    if not obs.isolated:
        return Decision(Route.RECHECK, "not_isolated")
    if not obs.deadline_ok:
        return Decision(Route.RECHECK, "deadline_exceeded")
    if obs.quality is not Quality.OK:
        return Decision(Route.RECHECK, f"quality_{obs.quality.value}")

    defects = obs.labels & DEFECT_LABELS
    if defects:
        return Decision(Route.REJECT, "+".join(sorted(d.value for d in defects)))

    uncertain = obs.labels & UNCERTAIN_LABELS
    if uncertain:
        return Decision(Route.RECHECK, "+".join(sorted(u.value for u in uncertain)))

    if obs.labels == {ExtLabel.NORMAL_EXT}:
        return Decision(Route.PASS, "normal_ext")
    # 라벨이 비었거나 예상하지 못한 조합: 정상으로 보내지 않는다.
    return Decision(Route.RECHECK, "no_valid_label")


def labels_from_scores(
    scores: Mapping[str, float],
    thresholds: Mapping[str, float],
) -> frozenset[ExtLabel]:
    """모델 점수를 운영 임계값과 비교해 외관 라벨 집합으로 바꾼다.

    점수는 확률로 해석하지 않는다. 임계값은 검증셋에서만 정한다.
    결함·불확실 라벨이 하나도 넘지 않으면 NORMAL_EXT.
    """
    out: set[ExtLabel] = set()
    for name, thr in thresholds.items():
        label = ExtLabel(name)
        if label is ExtLabel.NORMAL_EXT:
            continue
        if scores.get(name, 0.0) >= thr:
            out.add(label)
    return frozenset(out) if out else frozenset({ExtLabel.NORMAL_EXT})


def parse_labels(text: str | Iterable[str]) -> frozenset[ExtLabel]:
    """'BROKEN;CRACK_SUSPECT' 형태 또는 문자열 목록을 라벨 집합으로."""
    parts = text.split(";") if isinstance(text, str) else list(text)
    return frozenset(ExtLabel(p.strip()) for p in parts if p.strip())


def is_true_defect(labels: frozenset[ExtLabel]) -> bool | None:
    """정답 라벨 기준 불량 여부. 판독 보류만 있으면 None (집계 별도)."""
    if labels & DEFECT_LABELS:
        return True
    if labels == {ExtLabel.NORMAL_EXT}:
        return False
    return None

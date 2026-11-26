"""성능 지표 (설계서 16장).

재검사 개체를 분모에서 빼지 않는다. 모든 비율에 표본 수와
Wilson 95% 신뢰구간을 함께 낸다. 미검출 0건이어도 완전 검출로 보지 않는다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

from .labels import Route


@dataclass(frozen=True)
class Rate:
    k: int
    n: int
    lo: float
    hi: float

    @property
    def value(self) -> float:
        return self.k / self.n if self.n else float("nan")

    def __str__(self) -> str:
        if not self.n:
            return "n/a (n=0)"
        return f"{self.value:6.1%}  ({self.k}/{self.n}, 95% CI {self.lo:.1%}–{self.hi:.1%})"


def wilson(k: int, n: int, z: float = 1.959964) -> Rate:
    if n == 0:
        return Rate(0, 0, float("nan"), float("nan"))
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return Rate(k, n, max(0.0, centre - half), min(1.0, centre + half))


@dataclass(frozen=True)
class ObjectResult:
    """고유 개체 단위 첫 검사 결과. gt_defect=None은 정답 확인 불가."""

    object_id: str
    gt_defect: bool | None
    route: Route


def route_metrics(results: Iterable[ObjectResult]) -> dict[str, Rate]:
    res = list(results)
    defects = [r for r in res if r.gt_defect is True]
    normals = [r for r in res if r.gt_defect is False]
    n_all = len(res)

    def count(rs, route):
        return sum(1 for r in rs if r.route is route)

    return {
        "불량 자동 분리율": wilson(count(defects, Route.REJECT), len(defects)),
        "불량 유출률(자동)": wilson(count(defects, Route.PASS), len(defects)),
        "불량 재검사 전환율": wilson(count(defects, Route.RECHECK), len(defects)),
        "정상 오배출률": wilson(count(normals, Route.REJECT), len(normals)),
        "정상 재검사 전환율": wilson(count(normals, Route.RECHECK), len(normals)),
        "자동판정률": wilson(n_all - count(res, Route.RECHECK), n_all),
        "재검사율": wilson(count(res, Route.RECHECK), n_all),
    }


def format_report(metrics: dict[str, Rate], n_unknown_gt: int = 0) -> str:
    lines = [f"{k:<12} {v}" for k, v in metrics.items()]
    esc = metrics.get("불량 유출률(자동)")
    if esc and esc.n and esc.k == 0:
        lines.append(
            f"주의: 유출 0건이지만 n={esc.n}에서 95% 상한은 {esc.hi:.1%}. 완전 검출로 해석하지 않는다."
        )
    if n_unknown_gt:
        lines.append(f"정답 확인 불가(보류) 개체 {n_unknown_gt}개는 별도 집계")
    return "\n".join(lines)

"""광학·시간 예산 계산 (설계서 9장·13장).

g = W / N      샘플링 간격 (mm/px)
n = d / g      결함 폭이 영상에서 차지하는 픽셀 수
b = v * t / g  노출 중 이동 흐림 (px)

계산값은 설계 검토용이다. 실제 검출 가능 여부는 T01 광학 시험으로 확인한다.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass


@dataclass(frozen=True)
class OpticsResult:
    g_mm_per_px: float
    defect_px: float
    blur_px: float
    warnings: tuple[str, ...]


def optics(
    W_mm: float,
    N_px: int,
    d_mm: float,
    v_mm_s: float,
    t_s: float,
    min_defect_px: float = 3.0,
    max_blur_px: float = 1.0,
) -> OpticsResult:
    if min(W_mm, N_px, d_mm, t_s) <= 0 or v_mm_s < 0:
        raise ValueError("W, N, d, t는 양수, v는 0 이상이어야 한다")
    g = W_mm / N_px
    n = d_mm / g
    b = v_mm_s * t_s / g
    warns = []
    if n < min_defect_px:
        warns.append(f"결함 폭 {n:.2f}px < {min_defect_px}px: 해상도·시야 재검토")
    if b > max_blur_px:
        warns.append(f"이동 흐림 {b:.2f}px > {max_blur_px}px: 노출 단축·광량 증대 필요")
    if b > 0 and n / b < 2:
        warns.append("흐림이 결함 폭의 절반을 넘음: 결함 대비 저하 우려")
    return OpticsResult(g, n, b, tuple(warns))


@dataclass(frozen=True)
class TimingResult:
    budget_ms: float  # D / v
    used_ms: float
    margin_ms: float
    arrival_interval_ms: float  # p / v
    gate_cycle_ok: bool
    ok: bool


def timing_budget(
    D_mm: float,
    p_mm: float,
    v_mm_s: float,
    capture_ms: float,
    infer_p99_ms: float,
    comm_ms: float,
    gate_actuate_ms: float,
    gate_cycle_ms: float,
    safety_ms: float = 20.0,
) -> TimingResult:
    """촬영 지점→배출 지점 거리 D, 개체 간 피치 p 기준 시간 여유.

    추론 시간은 평균이 아닌 상위 백분위(p99)를 넣는다.
    gate_cycle_ms: 전환 후 복귀까지 걸리는 시간 (연속 개체 대응 여부).
    """
    if v_mm_s <= 0:
        raise ValueError("v는 양수여야 한다")
    budget = D_mm / v_mm_s * 1000
    used = capture_ms + infer_p99_ms + comm_ms + gate_actuate_ms + safety_ms
    arrival = p_mm / v_mm_s * 1000
    cycle_ok = gate_cycle_ms <= arrival
    return TimingResult(budget, used, budget - used, arrival, cycle_ok, used <= budget and cycle_ok)


def throughput_kg_h(v_mm_s: float, p_mm: float, mean_mass_g: float, lanes: int = 1) -> float:
    """단일 열 정렬 기준 이론 처리량 (공급 결손·재검사 제외 상한)."""
    per_s = v_mm_s / p_mm * lanes
    return per_s * mean_mass_g * 3600 / 1000


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="광학·시간 예산 계산")
    ap.add_argument("--W", type=float, required=True, help="시야 폭 mm")
    ap.add_argument("--N", type=int, required=True, help="같은 방향 유효 픽셀 수")
    ap.add_argument("--d", type=float, required=True, help="최소 결함 폭 mm")
    ap.add_argument("--v", type=float, required=True, help="벨트 속도 mm/s")
    ap.add_argument("--t", type=float, required=True, help="노출 시간 s")
    ap.add_argument("--pitch", type=float, help="개체 간 피치 mm (처리량 계산)")
    ap.add_argument("--mass", type=float, default=8.0, help="개당 평균 질량 g")
    a = ap.parse_args(argv)

    r = optics(a.W, a.N, a.d, a.v, a.t)
    print(f"g = {r.g_mm_per_px:.4f} mm/px")
    print(f"n = {r.defect_px:.2f} px  (결함 {a.d} mm)")
    print(f"b = {r.blur_px:.2f} px  (속도 {a.v} mm/s, 노출 {a.t * 1e6:.0f} us)")
    if a.pitch:
        print(f"이론 처리량 = {throughput_kg_h(a.v, a.pitch, a.mass):.0f} kg/h (1레인)")
    for w in r.warnings:
        print("경고:", w)


if __name__ == "__main__":
    main()

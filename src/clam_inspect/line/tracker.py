"""개체 위치 추적과 배출 예약 (설계서 13장).

엔코더 카운트로 각 개체가 게이트에 닿는 시점을 계산해 둔다.
- 판정이 기한(게이트 도착 - 여유) 안에 오면 그 경로로 배출
- 기한을 넘기거나 판정이 없으면 재검사 경로 (정상 후보로 내보내지 않는다)
- 촬영은 했는데 분석이 끝나지 않은 프레임은 그 구간 전체를 재검사로 우회
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..labels import Decision, Route


@dataclass
class Tracked:
    inspection_id: str
    object_id: str
    gate_count: int  # 개체 중심이 게이트에 닿는 엔코더 값
    deadline_count: int
    decision: Decision | None = None
    late: bool = False
    dispatched: bool = False
    final: Decision | None = None
    meta: dict = field(default_factory=dict)


@dataclass
class Window:
    """분석 대기 중인 촬영 구간. 기한까지 분석이 안 끝나면 구간 전체를 재검사로 보낸다."""

    frame_id: str
    start_count: int  # 이 구간 개체들이 게이트에 닿기 시작하는 값
    end_count: int
    deadline_count: int
    resolved: bool = False
    forced: bool = False


class Tracker:
    def __init__(self, gate_window_counts: int):
        self.objects: dict[str, Tracked] = {}
        self.windows: dict[str, Window] = {}
        self.half = gate_window_counts // 2

    # --- 촬영 구간 ---
    def open_window(self, frame_id: str, start: int, end: int, deadline: int) -> None:
        self.windows[frame_id] = Window(frame_id, start, end, deadline)

    def close_window(self, frame_id: str, now: int) -> bool:
        """분석 완료. 이미 기한을 넘겨 강제 우회됐으면 False."""
        w = self.windows.get(frame_id)
        if w is None:
            return False
        if w.forced or now > w.deadline_count:
            w.forced = True
            return False
        w.resolved = True
        return True

    # --- 개체 ---
    def register(self, t: Tracked) -> None:
        self.objects[t.inspection_id] = t

    def decide(self, inspection_id: str, decision: Decision, now: int) -> Decision:
        t = self.objects[inspection_id]
        if now > t.deadline_count:
            t.late = True
            t.decision = Decision(Route.RECHECK, "deadline_exceeded")
        else:
            t.decision = decision
        return t.decision

    def due(self, now: int) -> tuple[list[Tracked], list[Window]]:
        """게이트에 도착한 개체와, 기한을 넘긴 미분석 구간."""
        out = []
        for t in self.objects.values():
            if not t.dispatched and now >= t.gate_count - self.half:
                t.final = t.decision or Decision(Route.RECHECK, "no_decision")
                t.dispatched = True
                out.append(t)
        forced = []
        for w in self.windows.values():
            if not w.resolved and not w.forced and now > w.deadline_count:
                w.forced = True
                forced.append(w)
        return out, forced

    def flush_pending(self, reason: str) -> list[Tracked]:
        """정지·고장 시: 아직 배출 안 된 개체를 모두 재검사 처리."""
        out = []
        for t in self.objects.values():
            if not t.dispatched:
                t.final = Decision(Route.RECHECK, reason)
                t.dispatched = True
                out.append(t)
        return out

    def prune(self, now: int, keep_counts: int) -> None:
        for k in [k for k, t in self.objects.items() if t.dispatched and now - t.gate_count > keep_counts]:
            del self.objects[k]
        for k in [k for k, w in self.windows.items() if (w.resolved or w.forced) and now - w.end_count > keep_counts]:
            del self.windows[k]

    def pending(self) -> int:
        return sum(1 for t in self.objects.values() if not t.dispatched)

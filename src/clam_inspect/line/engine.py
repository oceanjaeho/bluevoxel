"""라인 운전 엔진: 촬영 트리거 → 검사 → 추적 → 배출 → 기록.

step() 한 번이 제어 주기 한 번이다. 실제 운전은 run_forever()가 별도 스레드에서
step()을 반복하고, 영상 분석은 다른 작업 스레드에서 돌아 제어 주기를 막지 않는다.
시험에서는 sync=True로 분석까지 step() 안에서 끝낸다.

안전: 비상정지와 구동부 차단은 이 프로그램과 독립된 하드웨어 안전 회로가 담당한다(설계서 4장).
화면의 '정지' 버튼은 소프트웨어 정지 요청일 뿐이다.
"""

from __future__ import annotations

import queue
import threading
import time
from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from ..bootstrap import gap_to_nearest
from ..events import EventLog, InspectionEvent, now_iso
from ..labels import KO_NAMES, Decision, ExtLabel, Observation, Route, decide_route
from .config import LineConfig
from .labeling import LabelStore
from .tracker import Tracked, Tracker

ROUTE_KO = {Route.PASS: "정상 후보", Route.REJECT: "불량", Route.RECHECK: "재검사"}
ROUTE_BGR = {Route.PASS: (90, 200, 60), Route.REJECT: (60, 60, 230), Route.RECHECK: (0, 170, 240)}
REASON_KO = {
    "normal_ext": "정상", "no_decision": "판정 없음", "deadline_exceeded": "판정 지연",
    "window_timeout": "분석 지연(구간 우회)", "not_isolated": "붙어 있음", "track_lost": "추적 상실",
    "quality_blur": "흐림", "quality_glare": "반사", "quality_truncated": "잘림", "quality_occluded": "가림",
    "stopped": "운전 정지", "fault": "장치 이상", "estop": "비상정지", "no_valid_label": "라벨 없음",
    **{k.value: v for k, v in KO_NAMES.items()},
    "UNKNOWN": "판독 보류",
}


def reason_ko(reason: str) -> str:
    return " + ".join(REASON_KO.get(r, r) for r in reason.split("+"))


@dataclass
class Pending:
    frame_id: str
    count: int
    frame: np.ndarray
    captured_at: str


class LineEngine:
    def __init__(self, cfg: LineConfig, camera, plc, inspector, sync: bool = False):
        self.cfg, self.camera, self.plc, self.inspector, self.sync = cfg, camera, plc, inspector, sync
        self.dir = Path(cfg.data_dir)
        (self.dir / "crops").mkdir(parents=True, exist_ok=True)
        self.log = EventLog(self.dir / "events.db")
        self.labels = LabelStore(self.dir / "labels.db")
        self.tracker = Tracker(cfg.counts(cfg.gate_window_mm))
        self.state = "STOPPED"
        self.fault = ""
        self.next_trigger: int | None = None
        self.seq = 0
        self.q: queue.Queue[Pending] = queue.Queue(maxsize=3)
        self.lock = threading.RLock()
        self.last_jpg: bytes | None = None
        self.recent: deque = deque(maxlen=60)
        self.counts = Counter()
        self.reasons = Counter()
        self.lat: deque = deque(maxlen=500)
        self.done_times: deque = deque(maxlen=2000)
        self.frames = self.dropped = self.forced_windows = self.mismatch = 0
        self.dispatch_routes: dict[str, str] = {}
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    # ---------------- 운전 명령 ----------------
    def start(self) -> str:
        with self.lock:
            if self.state in ("FAULT", "ESTOP"):
                return f"{self.state} 상태입니다. 원인을 확인한 뒤 '초기화'를 누르세요."
            if self.plc.estop_active():
                return "비상정지 회로가 눌려 있습니다."
            self.state = "RUNNING"
            self.plc.set_feeder(True)
            self.next_trigger = self.plc.encoder_count()
            return "운전 시작"

    def stop(self, reason: str = "stopped") -> str:
        with self.lock:
            self.plc.set_feeder(False)
            if self.state == "RUNNING":
                self.state = "STOPPED"
            self._flush(reason)
            return "운전 정지: 벨트 위 개체는 재검사로 처리됩니다. 잔류 개체를 회수하세요."

    def estop(self, why: str = "화면 비상정지") -> str:
        with self.lock:
            self.plc.set_feeder(False)
            self.state, self.fault = "ESTOP", why
            self._flush("estop")
            return "비상정지"

    def reset(self) -> str:
        with self.lock:
            if self.plc.estop_active():
                return "비상정지 회로가 아직 눌려 있습니다."
            self.state, self.fault = "STOPPED", ""
            return "초기화 완료"

    def _fail(self, why: str) -> None:
        self.plc.set_feeder(False)  # 상류 공급 중지
        self.state, self.fault = "FAULT", why
        self._flush("fault")

    def _flush(self, reason: str) -> None:
        for t in self.tracker.flush_pending(reason):
            self._dispatch(t)

    # ---------------- 제어 주기 ----------------
    def step(self) -> None:
        with self.lock:
            now = self.plc.encoder_count()
            if self.plc.estop_active() and self.state != "ESTOP":
                self.estop("비상정지 회로 동작")
            if self.state == "RUNNING" and self.next_trigger is not None and now >= self.next_trigger:
                self._capture(now)
            due, forced = self.tracker.due(now)
            for w in forced:
                self.forced_windows += 1
                self.plc.fire_gate(f"window:{w.frame_id}", Route.RECHECK)
            for t in due:
                self._dispatch(t)
            for iid, arrived in self.plc.poll_arrivals():
                if iid.startswith("window:"):
                    continue
                self.log.set_dispatch(iid, arrived)
                if self.dispatch_routes.pop(iid, arrived) != arrived:
                    self.mismatch += 1
            self.tracker.prune(now, self.cfg.counts(2000))
        if self.sync:
            while not self.q.empty():
                self._inspect(self.q.get_nowait())

    def _capture(self, now: int) -> None:
        try:
            frame = self.camera.grab()
        except Exception as e:  # noqa: BLE001
            self._fail(f"카메라 오류: {e}")
            return
        H = frame.shape[0]
        fov = H * self.cfg.mm_per_px
        D = self.cfg.camera_to_gate_mm
        self.seq += 1
        fid = f"F{self.seq:06d}"
        start = now + self.cfg.counts(D - fov / 2)
        end = now + self.cfg.counts(D + fov / 2)
        deadline = start - self.cfg.counts(self.cfg.decision_margin_mm + self.cfg.gate_window_mm / 2)
        self.tracker.open_window(fid, start, end, deadline)
        self.next_trigger = now + self.cfg.counts(max(fov - self.cfg.frame_overlap_mm, 1))
        self.frames += 1
        try:
            self.q.put_nowait(Pending(fid, now, frame, now_iso()))
        except queue.Full:
            self.dropped += 1  # 분석이 밀림: 이 구간은 기한이 지나면 재검사로 우회된다

    # ---------------- 분석 (작업 스레드) ----------------
    def _inspect(self, p: Pending) -> None:
        try:
            res = self.inspector.inspect(p.frame)
        except Exception as e:  # noqa: BLE001
            with self.lock:
                self._fail(f"분석 오류: {e}")
            return
        H, W = res.shape
        gaps = gap_to_nearest([o.inst for o in res.objects])
        with self.lock:
            now = self.plc.encoder_count()
            in_time = self.tracker.close_window(p.frame_id, now)
            vis = p.frame.copy()
            for o in res.objects:
                idx = o.inst.idx
                oid = f"{self.cfg.batch_id}-{p.frame_id}-{idx:02d}"
                along_mm = (o.center_px[1] - H / 2) * self.cfg.mm_per_px  # 아래쪽일수록 게이트에 가까움
                gate = p.count + self.cfg.counts(self.cfg.camera_to_gate_mm - along_mm)
                isolated = gaps.get(idx, float("inf")) * self.cfg.mm_per_px >= self.cfg.min_gap_mm
                dec = decide_route(Observation(labels=o.labels, quality=o.quality, isolated=isolated))
                crop_path = self._save_crop(oid, o)
                meta = {"frame_id": p.frame_id, "captured_at": p.captured_at, "quality": o.quality.value,
                        "labels": sorted(l.value for l in o.labels), "probs": o.probs, "crop": crop_path,
                        "latency_ms": res.seg_ms + res.cls_ms, "box": list(o.inst.box)}
                if in_time:
                    t = Tracked(oid, oid, gate, gate - self.cfg.counts(self.cfg.decision_margin_mm)
                                - self.tracker.half, meta=meta)
                    self.tracker.register(t)
                    dec = self.tracker.decide(oid, dec, now)
                else:
                    # 구간 전체가 이미 재검사로 우회됨: 기록만 남긴다
                    t = Tracked(oid, oid, gate, gate, decision=Decision(Route.RECHECK, "window_timeout"),
                                dispatched=True, final=Decision(Route.RECHECK, "window_timeout"), meta=meta)
                    self._record(t)
                    dec = t.final
                self._draw(vis, o, dec)
            self.lat.append(res.seg_ms + res.cls_ms)
            ok, buf = cv2.imencode(".jpg", _fit(vis, 960), [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ok:
                self.last_jpg = buf.tobytes()

    def _save_crop(self, oid: str, o) -> str | None:
        if not self.cfg.save_crops:
            return None
        p = self.dir / "crops" / f"{oid}.png"
        cv2.imwrite(str(p), o.crop)
        pred = max(o.probs.items(), key=lambda kv: kv[1]) if o.probs else (None, None)
        if self.cfg.queue_for_labeling:
            self.labels.add_item(oid, p, oid, self.cfg.batch_id, "line", pred[0], pred[1])
        return str(p)

    def _draw(self, vis, o, dec: Decision) -> None:
        col = ROUTE_BGR[dec.route]
        th = max(2, vis.shape[1] // 300)
        cv2.drawContours(vis, [o.inst.contour], -1, col, th)
        x1, y1 = o.inst.box[:2]
        cv2.putText(vis, f"#{o.inst.idx}", (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX,
                    max(0.6, vis.shape[1] / 1400), col, 2, cv2.LINE_AA)

    # ---------------- 배출·기록 ----------------
    def _dispatch(self, t: Tracked) -> None:
        route = t.final.route
        self.plc.fire_gate(t.inspection_id, route)
        self.dispatch_routes[t.inspection_id] = route.value
        self._record(t)

    def _record(self, t: Tracked) -> None:
        m, d = t.meta, t.final
        self.counts[d.route.value] += 1
        if d.route is not Route.PASS:
            self.reasons[d.reason] += 1
        self.done_times.append(time.monotonic())
        try:
            self.log.record(InspectionEvent(
                inspection_id=t.inspection_id, batch_id=self.cfg.batch_id, object_id=t.object_id,
                captured_at=m.get("captured_at", now_iso()), quality_state=m.get("quality", "ok"),
                track_state="valid" if not t.late else "late", defect_labels=m.get("labels", []),
                scores=m.get("probs", {}), route=d.route.value, model_version=self.inspector.model_version,
                config_version=self.cfg.config_version, trigger_id=m.get("frame_id"), frame_id=m.get("frame_id"),
                image_path=m.get("crop"), route_reason=d.reason, latency_ms=m.get("latency_ms")))
        except Exception:  # noqa: BLE001  (같은 ID 재기록 등은 운전을 멈추지 않는다)
            pass
        self.recent.appendleft({"id": t.inspection_id, "route": d.route.value, "route_ko": ROUTE_KO[d.route],
                                "reason": d.reason, "reason_ko": reason_ko(d.reason),
                                "probs": {k: round(v, 3) for k, v in m.get("probs", {}).items()},
                                "has_crop": bool(m.get("crop")), "ts": now_iso()})

    # ---------------- 상태 ----------------
    def snapshot(self) -> dict:
        with self.lock:
            lat = sorted(self.lat)
            pct = (lambda q: round(lat[min(len(lat) - 1, int(q * len(lat)))], 1)) if lat else (lambda q: None)
            t_now = time.monotonic()
            per_min = sum(1 for t in self.done_times if t_now - t <= 60)
            total = sum(self.counts.values())
            return {
                "state": self.state, "fault": self.fault, "encoder": self.plc.encoder_count(),
                "belt_mm_s": self.cfg.belt_speed_mm_s, "model": self.inspector.model_version,
                "counts": {r.value: self.counts.get(r.value, 0) for r in Route}, "total": total,
                "reasons": [{"reason": k, "reason_ko": reason_ko(k), "n": v} for k, v in self.reasons.most_common(8)],
                "frames": self.frames, "dropped": self.dropped, "forced_windows": self.forced_windows,
                "arrival_mismatch": self.mismatch, "pending": self.tracker.pending(), "per_min": per_min,
                "latency_ms": {"p50": pct(0.5), "p99": pct(0.99)}, "recent": list(self.recent)[:30],
                "labeling": self.labels.stats(),
            }

    # ---------------- 스레드 ----------------
    def run_forever(self, period_s: float = 0.005) -> None:
        def ctrl():
            while not self._stop.is_set():
                self.step()
                time.sleep(period_s)

        def work():
            while not self._stop.is_set():
                try:
                    p = self.q.get(timeout=0.2)
                except queue.Empty:
                    continue
                self._inspect(p)

        self._threads = [threading.Thread(target=ctrl, daemon=True), threading.Thread(target=work, daemon=True)]
        for t in self._threads:
            t.start()

    def shutdown(self) -> None:
        self.stop()
        self._stop.set()
        for t in self._threads:
            t.join(timeout=2)
        self.camera.close()
        self.plc.close()


def _fit(img: np.ndarray, width: int) -> np.ndarray:
    h, w = img.shape[:2]
    if w <= width:
        return img
    return cv2.resize(img, (width, int(h * width / w)), interpolation=cv2.INTER_AREA)

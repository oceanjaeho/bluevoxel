"""검사 이벤트 기록 (설계서 14장 필수 필드).

S1 선별대 시험부터 같은 스키마로 남겨 S2 벨트 연동까지 이어 쓴다.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS inspection_event (
    inspection_id   TEXT PRIMARY KEY,
    batch_id        TEXT NOT NULL,
    object_id       TEXT NOT NULL,
    attempt         INTEGER NOT NULL DEFAULT 1,  -- 재검사 차수
    trigger_id      TEXT,
    frame_id        TEXT,
    captured_at     TEXT NOT NULL,
    image_path      TEXT,
    quality_state   TEXT NOT NULL,
    track_state     TEXT NOT NULL,
    defect_labels   TEXT NOT NULL,   -- JSON 배열
    scores          TEXT NOT NULL,   -- JSON 객체
    route           TEXT NOT NULL,
    route_reason    TEXT,
    model_version   TEXT NOT NULL,
    config_version  TEXT NOT NULL,
    dispatch_result TEXT,            -- 실제 도착 통 / unconfirmed / NULL(벤치)
    latency_ms      REAL
);
CREATE INDEX IF NOT EXISTS ix_event_object ON inspection_event(batch_id, object_id);
"""


@dataclass
class InspectionEvent:
    inspection_id: str
    batch_id: str
    object_id: str
    captured_at: str
    quality_state: str
    track_state: str
    defect_labels: list[str]
    scores: dict[str, float]
    route: str
    model_version: str
    config_version: str
    attempt: int = 1
    trigger_id: str | None = None
    frame_id: str | None = None
    image_path: str | None = None
    route_reason: str | None = None
    dispatch_result: str | None = None
    latency_ms: float | None = None
    extra: dict = field(default_factory=dict, repr=False)


class EventLog:
    def __init__(self, path: str | Path):
        self.conn = sqlite3.connect(str(path))
        self.conn.executescript(SCHEMA)

    def record(self, ev: InspectionEvent) -> None:
        d = asdict(ev)
        d.pop("extra")
        d["defect_labels"] = json.dumps(d["defect_labels"], ensure_ascii=False)
        d["scores"] = json.dumps(d["scores"])
        cols = ", ".join(d)
        qs = ", ".join("?" for _ in d)
        self.conn.execute(f"INSERT INTO inspection_event ({cols}) VALUES ({qs})", tuple(d.values()))
        self.conn.commit()

    def set_dispatch(self, inspection_id: str, result: str) -> None:
        self.conn.execute(
            "UPDATE inspection_event SET dispatch_result=? WHERE inspection_id=?",
            (result, inspection_id),
        )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")

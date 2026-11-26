"""간이 라벨링 저장소 (SQLite).

사람은 낱개 사진을 보고 '정상 / 깨짐 / 금 감 / 다른 조개·이물 / 모르겠음' 중 하나만 고른다.
같은 사진에 여러 사람이 라벨을 달 수 있고, 의견이 갈리면 학습에서 빼고 따로 모아 본다.
"""

from __future__ import annotations

import csv
import sqlite3
import functools
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from ..labels import ExtLabel

CHOICES = (ExtLabel.NORMAL_EXT, ExtLabel.BROKEN, ExtLabel.CRACK_SUSPECT, ExtLabel.FOREIGN, ExtLabel.UNKNOWN)

SCHEMA = """
CREATE TABLE IF NOT EXISTS item (
    item_id    TEXT PRIMARY KEY,
    image_path TEXT NOT NULL,
    object_id  TEXT NOT NULL,
    batch_id   TEXT,
    source     TEXT,
    created_at TEXT,
    pred_label TEXT,
    pred_conf  REAL
);
CREATE TABLE IF NOT EXISTS label (
    item_id TEXT NOT NULL,
    labeler TEXT NOT NULL,
    label   TEXT NOT NULL,
    ts      TEXT NOT NULL,
    PRIMARY KEY (item_id, labeler)
);
"""


def _locked(fn):
    """웹 요청 스레드와 라인 엔진 스레드가 같은 연결을 쓰므로 모든 접근을 직렬화한다."""

    @functools.wraps(fn)
    def wrap(self, *a, **kw):
        with self.lock:
            return fn(self, *a, **kw)

    return wrap


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class LabelStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.root = self.path.parent
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.lock = threading.RLock()

    def _rel(self, p: str | Path) -> str:
        p = Path(p).resolve()
        try:
            return p.relative_to(self.root.resolve()).as_posix()
        except ValueError:
            return str(p)

    def abspath(self, stored: str) -> Path:
        p = Path(stored)
        return p if p.is_absolute() else self.root / p

    # --- 항목 ---
    @_locked
    def add_item(self, item_id: str, image_path: str | Path, object_id: str, batch_id: str = "",
                 source: str = "", pred_label: str | None = None, pred_conf: float | None = None) -> None:
        with self.lock:
            self.conn.execute(
                "INSERT OR IGNORE INTO item VALUES (?,?,?,?,?,?,?,?)",
                (item_id, self._rel(image_path), object_id, batch_id, source, _now(), pred_label, pred_conf),
            )
            self.conn.commit()

    def import_bootstrap(self, out_dir: str | Path) -> int:
        """bootstrap.py 출력 폴더(manifest_draft.csv)를 라벨링 대기열에 넣는다."""
        out_dir = Path(out_dir)
        n = 0
        with (out_dir / "manifest_draft.csv").open(encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                self.add_item(r["object_id"], out_dir / r["image_path"], r["object_id"], r["batch_id"], "bootstrap")
                n += 1
        return n

    @_locked
    def get(self, item_id: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM item WHERE item_id=?", (item_id,)).fetchone()
        return dict(r) if r else None

    # --- 라벨 ---
    @_locked
    def next_item(self, labeler: str) -> dict | None:
        """이 사람이 아직 안 본 사진 중, 라벨이 적고 모델이 덜 확신하는 것부터."""
        r = self.conn.execute(
            """SELECT i.*, (SELECT COUNT(*) FROM label l WHERE l.item_id=i.item_id) AS n_labels
               FROM item i
               WHERE NOT EXISTS (SELECT 1 FROM label l WHERE l.item_id=i.item_id AND l.labeler=?)
               ORDER BY n_labels ASC, COALESCE(i.pred_conf, 0) ASC, i.created_at ASC LIMIT 1""",
            (labeler,),
        ).fetchone()
        return dict(r) if r else None

    @_locked
    def submit(self, item_id: str, labeler: str, label: str) -> None:
        lab = ExtLabel(label)
        if lab not in CHOICES:
            raise ValueError(f"선택할 수 없는 라벨: {label}")
        if not labeler.strip():
            raise ValueError("라벨러 이름이 필요함")
        if self.get(item_id) is None:
            raise KeyError(item_id)
        with self.lock:
            self.conn.execute("INSERT OR REPLACE INTO label VALUES (?,?,?,?)", (item_id, labeler.strip(), lab.value, _now()))
            self.conn.commit()

    @_locked
    def undo(self, labeler: str) -> str | None:
        """이 사람의 마지막 라벨을 지우고 그 사진 ID를 돌려준다."""
        with self.lock:
            r = self.conn.execute(
                "SELECT item_id FROM label WHERE labeler=? ORDER BY ts DESC, rowid DESC LIMIT 1", (labeler,)
            ).fetchone()
            if not r:
                return None
            self.conn.execute("DELETE FROM label WHERE item_id=? AND labeler=?", (r["item_id"], labeler))
            self.conn.commit()
            return r["item_id"]

    @_locked
    def consensus(self, item_id: str) -> dict:
        labs = [r["label"] for r in self.conn.execute("SELECT label FROM label WHERE item_id=?", (item_id,))]
        if not labs:
            return {"label": None, "n": 0, "agree": 0, "conflict": False}
        c = Counter(labs).most_common()
        top, k = c[0]
        conflict = len(c) > 1 and c[1][1] == k
        return {"label": None if conflict else top, "n": len(labs), "agree": k, "conflict": len(c) > 1}

    @_locked
    def stats(self) -> dict:
        items = self.conn.execute("SELECT COUNT(*) FROM item").fetchone()[0]
        ids = [r[0] for r in self.conn.execute("SELECT DISTINCT item_id FROM label")]
        per = Counter()
        conflicts = 0
        for i in ids:
            c = self.consensus(i)
            if c["conflict"]:
                conflicts += 1
            per[c["label"] or "CONFLICT"] += 1
        by_labeler = {r[0]: r[1] for r in self.conn.execute("SELECT labeler, COUNT(*) FROM label GROUP BY labeler")}
        return {"items": items, "labeled": len(ids), "remaining": items - len(ids), "by_label": dict(per),
                "conflicts": conflicts, "by_labeler": by_labeler}

    @_locked
    def conflicts(self, limit: int = 50) -> list[dict]:
        out = []
        for (i,) in self.conn.execute("SELECT DISTINCT item_id FROM label"):
            c = self.consensus(i)
            if c["conflict"]:
                labs = {r["labeler"]: r["label"] for r in self.conn.execute(
                    "SELECT labeler, label FROM label WHERE item_id=?", (i,))}
                out.append({"item_id": i, "labels": labs})
            if len(out) >= limit:
                break
        return out

    @_locked
    def training_items(self, min_agree: int = 1) -> list[tuple[str, str, str]]:
        """(이미지 절대경로, object_id, 라벨). 의견이 갈린 것과 '모르겠음'은 뺀다."""
        out = []
        for r in self.conn.execute("SELECT item_id, image_path, object_id FROM item"):
            c = self.consensus(r["item_id"])
            if c["label"] and c["label"] != ExtLabel.UNKNOWN.value and c["agree"] >= min_agree:
                out.append((str(self.abspath(r["image_path"])), r["object_id"], c["label"]))
        return out

    @_locked
    def export_manifest(self, path: str | Path) -> int:
        """학습 도구(split.py 등)에서 쓰는 manifest 형식으로 내보낸다."""
        rows = []
        for r in self.conn.execute("SELECT * FROM item"):
            c = self.consensus(r["item_id"])
            if c["n"] == 0:
                continue
            rows.append({"image_path": str(self.abspath(r["image_path"])), "object_id": r["object_id"],
                         "batch_id": r["batch_id"] or "", "captured_at": r["created_at"] or "",
                         "labels": c["label"] or ExtLabel.UNKNOWN.value, "quality_state": "ok",
                         "annotator": f"{c['agree']}/{c['n']}", "note": "conflict" if c["conflict"] else ""})
        with Path(path).open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=["image_path", "object_id", "batch_id", "captured_at", "labels",
                                              "quality_state", "annotator", "note"])
            w.writeheader()
            w.writerows(rows)
        return len(rows)

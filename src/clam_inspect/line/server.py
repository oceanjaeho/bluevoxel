"""운영 화면 서버 (FastAPI). 같은 네트워크의 PC·태블릿·휴대폰 브라우저에서 접속한다.

  python -m clam_inspect.line.server --demo            # 샘플 사진 + 모의 PLC
  python -m clam_inspect.line.server --config line.json --host 0.0.0.0 --port 8000

화면: 운전 / 라벨링 / 이력 / 설정
"""

from __future__ import annotations

import argparse
import re
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel

from ..labels import KO_NAMES
from .config import LineConfig
from .devices import make_camera, make_plc
from .engine import LineEngine, reason_ko
from .inspector import Inspector
from .labeling import CHOICES

STATIC = Path(__file__).parent / "static"


class LabelIn(BaseModel):
    item_id: str
    labeler: str
    label: str


class Who(BaseModel):
    labeler: str


class ConfigIn(BaseModel):
    belt_speed_mm_s: float | None = None
    defect: float | None = None
    crack: float | None = None
    normal: float | None = None


def build_engine(cfg: LineConfig, manual_plc: bool = False, sync: bool = False) -> LineEngine:
    clf = None
    if cfg.model_path:
        from .classifier import ClamClassifier

        clf = ClamClassifier(cfg.model_path)
    return LineEngine(cfg, make_camera(cfg.camera), make_plc(cfg, manual=manual_plc), Inspector(cfg, clf), sync=sync)


def create_app(engine: LineEngine) -> FastAPI:
    app = FastAPI(title="바지락 선별 라인")
    app.state.engine = engine
    E = engine

    @app.get("/", response_class=HTMLResponse)
    def index():
        return (STATIC / "index.html").read_text(encoding="utf-8")

    # ---- 운전 ----
    @app.get("/api/state")
    def state():
        return E.snapshot()

    @app.post("/api/cmd/{cmd}")
    def command(cmd: str):
        fn = {"start": E.start, "stop": E.stop, "estop": E.estop, "reset": E.reset}.get(cmd)
        if fn is None:
            raise HTTPException(404)
        return {"message": fn(), "state": E.state}

    @app.get("/api/frame.jpg")
    def frame():
        if not E.last_jpg:
            raise HTTPException(404, "아직 촬영된 영상이 없습니다")
        return Response(E.last_jpg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.get("/api/crop/{item_id}")
    def crop(item_id: str):
        it = E.labels.get(item_id)
        if not it:
            raise HTTPException(404)
        p = E.labels.abspath(it["image_path"])
        if not p.exists():
            raise HTTPException(404)
        return FileResponse(p)

    @app.get("/api/object/{inspection_id}.png")
    def object_crop(inspection_id: str):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", inspection_id):
            raise HTTPException(400)
        p = E.dir / "crops" / f"{inspection_id}.png"
        if not p.exists():
            raise HTTPException(404)
        return FileResponse(p)

    # ---- 이력 ----
    @app.get("/api/events")
    def events(limit: int = 100, route: str | None = None):
        conn = sqlite3.connect(str(E.dir / "events.db"))
        conn.row_factory = sqlite3.Row
        q = "SELECT * FROM inspection_event"
        args: list = []
        if route:
            q += " WHERE route=?"
            args.append(route)
        q += " ORDER BY rowid DESC LIMIT ?"
        args.append(min(limit, 1000))
        rows = [dict(r) for r in conn.execute(q, args)]
        conn.close()
        for r in rows:
            r["reason_ko"] = reason_ko(r.get("route_reason") or "")
        return rows

    # ---- 설정 ----
    @app.get("/api/config")
    def get_config():
        return E.cfg.to_dict()

    @app.post("/api/config")
    def set_config(c: ConfigIn):
        if E.state == "RUNNING":
            raise HTTPException(409, "운전 중에는 설정을 바꿀 수 없습니다")
        if c.belt_speed_mm_s is not None:
            E.cfg.belt_speed_mm_s = c.belt_speed_mm_s
        for k in ("defect", "crack", "normal"):
            v = getattr(c, k)
            if v is not None:
                if not 0 < v <= 1:
                    raise HTTPException(400, f"{k}는 0~1 사이")
                setattr(E.cfg.thresholds, k, v)
        v = E.cfg.config_version.lstrip("v")
        E.cfg.config_version = f"v{int(v) + 1 if v.isdigit() else 2}"
        E.cfg.save(E.dir / "line_config.json")
        return E.cfg.to_dict()

    # ---- 라벨링 ----
    @app.get("/api/label/choices")
    def choices():
        return [{"value": c.value, "ko": KO_NAMES[c]} for c in CHOICES]

    @app.get("/api/label/next")
    def label_next(labeler: str):
        it = E.labels.next_item(labeler)
        return {"item": it, "stats": E.labels.stats()}

    @app.post("/api/label")
    def label_submit(x: LabelIn):
        try:
            E.labels.submit(x.item_id, x.labeler, x.label)
        except (ValueError, KeyError) as e:
            raise HTTPException(400, str(e)) from e
        return {"ok": True, "stats": E.labels.stats()}

    @app.post("/api/label/undo")
    def label_undo(w: Who):
        return {"item_id": E.labels.undo(w.labeler)}

    @app.get("/api/label/conflicts")
    def label_conflicts():
        return E.labels.conflicts()

    @app.post("/api/label/export")
    def label_export():
        p = E.dir / "labels_manifest.csv"
        n = E.labels.export_manifest(p)
        return {"rows": n, "path": str(p)}

    return app


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", help="라인 설정 JSON")
    ap.add_argument("--demo", action="store_true", help="샘플 사진 + 모의 PLC로 실행")
    ap.add_argument("--import-bootstrap", help="bootstrap 출력 폴더를 라벨링 대기열에 추가")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args(argv)

    cfg = LineConfig.load(a.config) if a.config else LineConfig()
    sample = Path(__file__).resolve().parents[3] / "samples" / "20261126_mat01"
    if a.demo:
        cfg.plc.kind, cfg.camera.kind = "sim", "folder"
        if not a.config:
            cfg.camera.path = str(sample / "IMG_29971.jpg")
            cfg.data_dir = "runs/demo"
            cfg.batch_id = "DEMO"
        cfg.queue_for_labeling = False  # 같은 사진 반복이라 라벨링 대기열에는 샘플 낱개 사진만
    eng = build_engine(cfg)
    if a.demo and not a.import_bootstrap and eng.labels.stats()["items"] == 0 and sample.exists():
        a.import_bootstrap = str(sample)
    if a.import_bootstrap:
        print(f"라벨링 대기열에 {eng.labels.import_bootstrap(a.import_bootstrap)}개 추가")
    eng.run_forever()
    import uvicorn

    print(f"운영 화면: http://{a.host}:{a.port}")
    try:
        uvicorn.run(create_app(eng), host=a.host, port=a.port, log_level="warning")
    finally:
        eng.shutdown()


if __name__ == "__main__":
    main()

from pathlib import Path

import pytest

pytest.importorskip("cv2")

from clam_inspect.labels import Decision, ExtLabel as L, Route
from clam_inspect.line.classifier import labels_from_probs
from clam_inspect.line.config import LineConfig, Thresholds
from clam_inspect.line.labeling import LabelStore
from clam_inspect.line.tracker import Tracked, Tracker

SAMPLE = Path(__file__).resolve().parents[1] / "samples/20261126_mat01/IMG_29971.jpg"


# ---- 추적·배출 (13장) ----

def test_tracker_routes_on_time_late_and_missing():
    tr = Tracker(gate_window_counts=20)
    tr.register(Tracked("a", "a", gate_count=1000, deadline_count=900))
    tr.register(Tracked("b", "b", gate_count=1100, deadline_count=1000))
    tr.register(Tracked("c", "c", gate_count=1200, deadline_count=1100))
    assert tr.decide("a", Decision(Route.PASS, "normal_ext"), now=850).route is Route.PASS
    assert tr.decide("b", Decision(Route.PASS, "normal_ext"), now=1050).reason == "deadline_exceeded"
    due, _ = tr.due(1300)
    final = {t.inspection_id: t.final for t in due}
    assert final["a"].route is Route.PASS
    assert final["b"].route is Route.RECHECK
    assert final["c"].route is Route.RECHECK and final["c"].reason == "no_decision"


def test_tracker_window_timeout_forces_recheck():
    tr = Tracker(20)
    tr.open_window("F1", start=500, end=800, deadline=400)
    _, forced = tr.due(401)
    assert [w.frame_id for w in forced] == ["F1"]
    assert tr.close_window("F1", now=420) is False  # 이미 우회됨


def test_flush_pending_on_stop():
    tr = Tracker(20)
    tr.register(Tracked("a", "a", 1000, 900, decision=Decision(Route.PASS, "normal_ext")))
    out = tr.flush_pending("stopped")
    assert out[0].final.route is Route.RECHECK


# ---- 확률 → 라벨 ----

def test_labels_from_probs_conservative():
    th = Thresholds(defect=0.8, crack=0.5, normal=0.9)
    assert labels_from_probs({"NORMAL_EXT": 0.95}, th) == {L.NORMAL_EXT}
    assert labels_from_probs({"NORMAL_EXT": 0.85, "BROKEN": 0.1}, th) == {L.UNKNOWN}
    assert labels_from_probs({"BROKEN": 0.85}, th) == {L.BROKEN}
    assert labels_from_probs({"NORMAL_EXT": 0.4, "CRACK_SUSPECT": 0.55}, th) == {L.CRACK_SUSPECT}
    assert labels_from_probs({"FOREIGN": 0.9}, th) == {L.FOREIGN}


# ---- 라벨링 ----

def test_label_store_flow(tmp_path):
    s = LabelStore(tmp_path / "l.db")
    for i in range(3):
        (tmp_path / f"{i}.png").write_bytes(b"x")
        s.add_item(f"I{i}", tmp_path / f"{i}.png", f"O{i}", pred_conf=0.9 - i * 0.3)
    first = s.next_item("kim")
    assert first["item_id"] == "I2"  # 모델이 가장 덜 확신하는 것부터
    s.submit("I2", "kim", "BROKEN")
    s.submit("I2", "lee", "NORMAL_EXT")  # 의견 갈림
    s.submit("I1", "kim", "NORMAL_EXT")
    s.submit("I0", "kim", "UNKNOWN")
    st = s.stats()
    assert st["labeled"] == 3 and st["conflicts"] == 1
    items = s.training_items()
    assert [(Path(p).name, l) for p, _, l in items] == [("1.png", "NORMAL_EXT")]
    assert s.undo("kim") == "I0"
    with pytest.raises(ValueError):
        s.submit("I1", "kim", "CHIPPED")  # 간이 라벨링에 없는 선택지
    assert s.export_manifest(tmp_path / "m.csv") == 2


# ---- 엔진 전체 흐름 (사진 폴더 카메라 + 모의 PLC) ----

def make_engine(tmp_path, clf=None, **kw):
    from clam_inspect.line.server import build_engine

    cfg = LineConfig(data_dir=str(tmp_path / "line"), **kw)
    cfg.camera.path = str(SAMPLE)
    eng = build_engine(cfg, manual_plc=True, sync=True)
    eng.inspector.classifier = clf
    return eng


class FakeClassifier:
    version = "fake"

    def __init__(self, probs):
        self.probs = probs

    def predict(self, crop):
        return dict(self.probs)


def run_one_frame(eng):
    assert eng.start() == "운전 시작"
    eng.step()  # 촬영 + 분석
    eng.next_trigger = 10**9  # 이 시험은 한 장만 촬영
    eng.plc.advance(eng.cfg.camera_to_gate_mm + 400)  # 모든 개체가 게이트를 지나도록
    eng.step()
    return eng.snapshot()


def test_engine_without_model_sends_everything_to_recheck(tmp_path):
    s = run_one_frame(make_engine(tmp_path))
    assert s["counts"] == {"normal_candidate": 0, "defect": 0, "recheck": 10}
    assert s["labeling"]["items"] == 10  # 낱개 사진이 라벨링 대기열로
    assert s["arrival_mismatch"] == 0


def test_engine_with_confident_model_passes(tmp_path):
    s = run_one_frame(make_engine(tmp_path, FakeClassifier({"NORMAL_EXT": 0.97})))
    assert s["counts"]["normal_candidate"] == 10


def test_engine_late_analysis_never_passes(tmp_path):
    eng = make_engine(tmp_path, FakeClassifier({"NORMAL_EXT": 0.97}))
    eng.sync = False
    eng.start()
    eng.step()  # 촬영만, 분석은 아직
    eng.next_trigger = 10**9
    eng.plc.advance(eng.cfg.camera_to_gate_mm + 400)
    eng.step()  # 기한 초과 → 구간 우회
    eng._inspect(eng.q.get_nowait())  # 늦게 끝난 분석
    s = eng.snapshot()
    assert s["forced_windows"] == 1
    assert s["counts"]["normal_candidate"] == 0 and s["counts"]["recheck"] == 10


def test_engine_camera_fault_stops_feeder(tmp_path):
    eng = make_engine(tmp_path)

    def boom():
        raise IOError("케이블 분리")

    eng.camera.grab = boom
    eng.start()
    eng.step()
    assert eng.state == "FAULT" and not eng.plc.feeder
    assert eng.start().startswith("FAULT")


# ---- 서버 API ----

def test_server_api(tmp_path):
    from fastapi.testclient import TestClient

    from clam_inspect.line.server import create_app

    eng = make_engine(tmp_path)
    c = TestClient(create_app(eng))
    assert c.get("/").status_code == 200
    assert c.post("/api/cmd/start").json()["state"] == "RUNNING"
    eng.step()
    assert c.get("/api/frame.jpg").headers["content-type"] == "image/jpeg"
    assert c.post("/api/config", json={"normal": 0.95}).status_code == 409  # 운전 중 변경 금지
    c.post("/api/cmd/stop")
    assert c.post("/api/config", json={"normal": 0.95}).json()["thresholds"]["normal"] == 0.95
    nxt = c.get("/api/label/next", params={"labeler": "kim"}).json()["item"]
    assert c.get(f"/api/crop/{nxt['item_id']}").status_code == 200
    assert c.post("/api/label", json={"item_id": nxt["item_id"], "labeler": "kim", "label": "NORMAL_EXT"}).json()["ok"]
    evs = c.get("/api/events").json()
    assert len(evs) == 10
    assert c.get(f"/api/object/{evs[0]['inspection_id']}.png").status_code == 200
    assert c.get("/api/object/..%2Fx.png").status_code in (400, 404)  # 정지 시 벨트 위 개체도 재검사로 기록


def test_classifier_train_and_load(tmp_path):
    pytest.importorskip("torchvision")
    from clam_inspect.line.classifier import ClamClassifier, train

    crops = sorted((SAMPLE.parent / "objects").glob("*.png"))
    labs = ["NORMAL_EXT", "BROKEN", "CRACK_SUSPECT", "FOREIGN", "NORMAL_EXT"] * 2
    items = [(str(p), p.stem, l) for p, l in zip(crops, labs)]
    rep = train(items, tmp_path / "cls.pt", epochs=1, pretrained=False, device="cpu")
    assert rep["train"] + rep["val"] == 10
    clf = ClamClassifier(tmp_path / "cls.pt", device="cpu")
    import cv2

    probs = clf.predict(cv2.imread(str(crops[0])))
    assert set(probs) == {"NORMAL_EXT", "BROKEN", "CRACK_SUSPECT", "FOREIGN"}
    assert abs(sum(probs.values()) - 1) < 1e-4

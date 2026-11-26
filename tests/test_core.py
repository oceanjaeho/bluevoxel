import csv
from pathlib import Path

import numpy as np
import pytest

from clam_inspect.coco import Ann
from clam_inspect.dataset import (
    assert_no_leakage,
    object_label,
    read_manifest,
    split_objects,
)
from clam_inspect.evaluate import evaluate, select_thresholds, thresholds_of
from clam_inspect.events import EventLog, InspectionEvent, now_iso
from clam_inspect.labels import (
    ExtLabel as L,
    Observation,
    Quality,
    Route,
    Track,
    decide_route,
    is_true_defect,
    labels_from_scores,
)
from clam_inspect.metrics import ObjectResult, route_metrics, wilson
from clam_inspect.optics import optics, throughput_kg_h, timing_budget
from clam_inspect.quality import assess
from clam_inspect.roi import crop_anns, expand_box


# ---- 판정 규칙 (12장) ----

def obs(*labels, **kw):
    return Observation(labels=frozenset(labels), **kw)


@pytest.mark.parametrize(
    "o, route",
    [
        (obs(L.NORMAL_EXT), Route.PASS),
        (obs(L.BROKEN), Route.REJECT),
        (obs(L.CHIPPED, L.CRACK_SUSPECT), Route.REJECT),
        (obs(L.CRACK_SUSPECT), Route.RECHECK),
        (obs(L.UNKNOWN), Route.RECHECK),
        (obs(), Route.RECHECK),
        (obs(L.NORMAL_EXT, quality=Quality.GLARE), Route.RECHECK),
        (obs(L.BROKEN, track=Track.LOST), Route.RECHECK),
        (obs(L.NORMAL_EXT, isolated=False), Route.RECHECK),
        (obs(L.NORMAL_EXT, deadline_ok=False), Route.RECHECK),
    ],
)
def test_decide_route(o, route):
    assert decide_route(o).route is route


def test_never_pass_without_all_conditions():
    for q in Quality:
        for t in Track:
            r = decide_route(obs(L.NORMAL_EXT, quality=q, track=t)).route
            assert (r is Route.PASS) == (q is Quality.OK and t is Track.VALID)


def test_labels_from_scores():
    th = thresholds_of(0.5, 0.3)
    assert labels_from_scores({"BROKEN": 0.6}, th) == {L.BROKEN}
    assert labels_from_scores({"BROKEN": 0.4, "CRACK_SUSPECT": 0.35}, th) == {L.CRACK_SUSPECT}
    assert labels_from_scores({}, th) == {L.NORMAL_EXT}


def test_true_defect():
    assert is_true_defect(frozenset({L.BROKEN, L.CRACK_SUSPECT})) is True
    assert is_true_defect(frozenset({L.NORMAL_EXT})) is False
    assert is_true_defect(frozenset({L.CRACK_SUSPECT})) is None


# ---- 데이터 분할 (11장) ----

def write_manifest(path: Path, n_obj=40, shots=3, batches=4):
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["image_path", "object_id", "batch_id", "captured_at", "labels", "quality_state"])
        for o in range(n_obj):
            lab = "BROKEN" if o % 5 == 0 else "NORMAL_EXT"
            for s in range(shots):
                w.writerow([f"i/{o}_{s}.png", f"O{o}", f"B{o % batches}", f"t{s}", lab, "ok"])
    return path


def test_split_no_leakage_and_holdout(tmp_path):
    rows = read_manifest(write_manifest(tmp_path / "m.csv"))
    asg = split_objects(rows, holdout_batches=["B3"], seed=1)
    assert_no_leakage(asg, rows)
    for r in rows:
        assert (asg[r.object_id] == "test") == (r.batch_id == "B3")
    # 소수 결함도 train/val 양쪽에 들어간다 (층화)
    by = {s: {r.object_id for r in rows if asg[r.object_id] == s and L.BROKEN in r.labels} for s in ("train", "val")}
    assert by["train"] and by["val"]


def test_split_stratified_three_way(tmp_path):
    rows = read_manifest(write_manifest(tmp_path / "m.csv"))
    asg = split_objects(rows, seed=0)
    assert set(asg.values()) == {"train", "val", "test"}


def test_manifest_rejects_object_in_two_batches(tmp_path):
    p = tmp_path / "m.csv"
    p.write_text("image_path,object_id,batch_id,captured_at,labels,quality_state\n"
                 "a,O1,B1,t,NORMAL_EXT,ok\nb,O1,B2,t,NORMAL_EXT,ok\n")
    with pytest.raises(ValueError):
        read_manifest(p)


def test_object_label_union():
    class R:  # noqa: D401
        def __init__(self, labels):
            self.labels = frozenset(labels)
    assert object_label([R({L.NORMAL_EXT}), R({L.BROKEN})]) == {L.BROKEN}


# ---- 지표 (16장) ----

def test_wilson_zero_events_has_upper_bound():
    r = wilson(0, 30)
    assert r.lo == 0 and 0.10 < r.hi < 0.13


def test_route_metrics_keeps_recheck_in_denominator():
    res = [ObjectResult("a", True, Route.REJECT), ObjectResult("b", True, Route.RECHECK),
           ObjectResult("c", False, Route.PASS), ObjectResult("d", False, Route.REJECT)]
    m = route_metrics(res)
    assert m["불량 자동 분리율"].value == 0.5
    assert m["재검사율"].value == 0.25
    assert m["정상 오배출률"].value == 0.5


# ---- 평가·운영점 ----

def preds_fixture():
    preds, gt = [], {}
    for i in range(20):
        d = i % 2 == 0
        gt[f"O{i}"] = d
        s = 0.9 if d else 0.1
        if i == 0:
            s = 0.4  # 약한 불량 하나
        preds.append({"object_id": f"O{i}", "captured_at": "t0", "track_state": "valid",
                      "quality_state": "ok", "defect_scores": {"BROKEN": s, "CRACK_SUSPECT": 0.0}})
    return preds, gt


def test_select_thresholds_minimises_escape():
    preds, gt = preds_fixture()
    th, ok = select_thresholds(preds, gt, max_recheck=0.2, max_false_reject=0.05)
    assert ok and th["BROKEN"] <= 0.4
    m, _, _ = evaluate(preds, gt, th)
    assert m["불량 유출률(자동)"].k == 0


def test_evaluate_lost_track_goes_recheck():
    preds = [{"object_id": "X", "track_state": "lost", "quality_state": None, "defect_scores": {}}]
    m, rows, _ = evaluate(preds, {"X": True}, thresholds_of(0.5, 0.5))
    assert rows[0]["route"] == Route.RECHECK.value


# ---- 광학·시간 (9장·13장) ----

def test_optics_doc_example():
    r = optics(200, 2000, 0.5, 200, 0.0005)
    assert r.defect_px == pytest.approx(5.0)
    assert r.blur_px == pytest.approx(1.0)
    assert not r.warnings


def test_timing_budget():
    t = timing_budget(D_mm=300, p_mm=50, v_mm_s=200, capture_ms=10, infer_p99_ms=80,
                      comm_ms=5, gate_actuate_ms=20, gate_cycle_ms=200)
    assert t.budget_ms == pytest.approx(1500) and t.ok
    assert not timing_budget(300, 50, 200, 10, 80, 5, 20, gate_cycle_ms=300).ok


def test_throughput():
    assert throughput_kg_h(200, 50, 8) == pytest.approx(115.2)


# ---- ROI·품질 ----

def test_expand_and_crop():
    crop = expand_box((100, 100, 200, 200), 0.1, 640, 480)
    assert crop == (90, 90, 210, 210)
    out = crop_anns([Ann("BROKEN", (180, 180, 220, 220)), Ann("BROKEN", (0, 0, 10, 10))], crop)
    assert len(out) == 1 and out[0].box == (90, 90, 120, 120)


def test_quality_assess():
    rng = np.random.default_rng(0)
    img = rng.integers(0, 200, (100, 100, 3), dtype=np.uint8)
    assert assess(img, (10, 10, 90, 90))[0] is Quality.OK
    assert assess(img, (0, 10, 90, 90))[0] is Quality.TRUNCATED
    flat = np.full((100, 100, 3), 120, np.uint8)
    assert assess(flat, (10, 10, 90, 90))[0] is Quality.BLUR
    glare = img.copy()
    glare[20:60, 20:60] = 255
    assert assess(glare, (10, 10, 90, 90))[0] is Quality.GLARE


# ---- 기록 (14장) ----

def test_event_log(tmp_path):
    log = EventLog(tmp_path / "e.db")
    log.record(InspectionEvent("I1", "B1", "O1", now_iso(), "ok", "valid", ["BROKEN"],
                               {"BROKEN": 0.9}, "defect", "m1", "c1"))
    log.set_dispatch("I1", "defect_bin")
    row = log.conn.execute("SELECT route, dispatch_result FROM inspection_event").fetchone()
    assert row == ("defect", "defect_bin")

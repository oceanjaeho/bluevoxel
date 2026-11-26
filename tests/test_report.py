import json

from PIL import Image

from clam_inspect.report import build


def test_report_bins_and_wrong_marks(tmp_path):
    (tmp_path / "i").mkdir()
    rows = ["image_path,object_id,batch_id,captured_at,labels,quality_state"]
    preds = []
    cases = [  # object, gt label, BROKEN score, track
        ("A", "BROKEN", 0.9, "valid"),  # 불량 → 불량
        ("B", "BROKEN", 0.1, "valid"),  # 불량 → 정상 후보 (유출)
        ("C", "NORMAL_EXT", 0.8, "valid"),  # 정상 → 불량 (오배출)
        ("D", "NORMAL_EXT", 0.1, "lost"),  # 재검사
    ]
    for oid, lab, s, tr in cases:
        Image.new("RGB", (64, 48), (90, 80, 70)).save(tmp_path / f"i/{oid}.png")
        rows.append(f"i/{oid}.png,{oid},B1,t0,{lab},ok")
        preds.append({"object_id": oid, "image_path": f"i/{oid}.png", "captured_at": "t0",
                      "track_state": tr, "quality_state": "ok" if tr == "valid" else None,
                      "clam_box": [5, 5, 60, 44], "defect_scores": {"BROKEN": s, "CHIPPED": 0, "CRACK_SUSPECT": 0},
                      "detections": [{"label": "BROKEN", "score": s, "box": [10, 10, 20, 20]}]})
    (tmp_path / "m.csv").write_text("\n".join(rows) + "\n")
    (tmp_path / "p.json").write_text(json.dumps({"summary": {"split": "test"}, "results": preds}))
    th = {"BROKEN": 0.5, "CHIPPED": 0.5, "CRACK_SUSPECT": 0.5}
    html = build(str(tmp_path / "m.csv"), str(tmp_path / "p.json"), th, tmp_path, note="<x>")
    assert "4개 중 불량 유출 1개, 정상 오배출 1개, 재검사 1개" in html
    assert html.count('class="card wrong"') == 2
    assert "&lt;x&gt;" in html and "<x>" not in html

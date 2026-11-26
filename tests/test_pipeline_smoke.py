"""가짜 데이터로 split → train → predict → evaluate 전체 흐름 점검 (torch 필요)."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("torchvision")

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    subprocess.run([sys.executable, *args], check=True, cwd=ROOT)


@pytest.mark.slow
def test_end_to_end(tmp_path):
    data = tmp_path / "syn"
    run("scripts/make_synthetic.py", "--out", str(data), "--objects", "18", "--shots", "2")
    m, coco, split = data / "manifest.csv", data / "annotations.json", tmp_path / "split.json"

    from clam_inspect import split as split_mod
    split_mod.main(["--manifest", str(m), "--out", str(split), "--ratios", "0.5", "0.25", "0.25"])

    from clam_inspect import evaluate, predict, train
    common = ["--manifest", str(m), "--coco", str(coco), "--split", str(split),
              "--epochs", "1", "--max-iters", "2", "--no-pretrained", "--workers", "0",
              "--min-size", "320", "--max-size", "640", "--device", "cpu"]
    train.main(["--task", "clam", "--out", str(tmp_path / "clam"), *common])
    train.main(["--task", "defect", "--out", str(tmp_path / "defect"), *common])

    for which in ("val", "test"):
        predict.main(["--clam", str(tmp_path / "clam/last.pt"), "--defect", str(tmp_path / "defect/last.pt"),
                      "--manifest", str(m), "--split", str(split), "--which", which,
                      "--out", str(tmp_path / f"pred_{which}.json"), "--clam-thr", "0.0", "--device", "cpu"])
    evaluate.main(["--manifest", str(m), "--val", str(tmp_path / "pred_val.json"),
                   "--test", str(tmp_path / "pred_test.json"), "--out", str(tmp_path / "eval")])
    th = json.loads((tmp_path / "eval/thresholds.json").read_text())
    assert th["selected_on"] == "val"
    assert (tmp_path / "eval/decisions_test.csv").exists()

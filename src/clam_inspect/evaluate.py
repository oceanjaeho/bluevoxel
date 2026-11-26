"""운영점 선택(val)과 독립 평가(test).

1) val 예측으로 임계값을 고른다: 재검사율·정상 오배출률 상한을 지키면서
   불량 유출을 최소화한다.
2) 고른 임계값을 고정해 test에 한 번 적용한다. test 결과를 보고 임계값을
   다시 바꿨다면 그 test는 더 이상 독립 평가가 아니다.

예:
  python -m clam_inspect.evaluate --manifest data/manifest.csv \
      --val runs/pred_val.json --test runs/pred_test.json --out runs/eval
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from itertools import product
from pathlib import Path
from typing import Iterable, Mapping

from .dataset import object_label, read_manifest
from .labels import (
    Decision,
    Observation,
    Quality,
    Route,
    Track,
    decide_route,
    is_true_defect,
    labels_from_scores,
)
from .metrics import ObjectResult, Rate, format_report, route_metrics, wilson

GRID = [round(0.05 * i, 2) for i in range(1, 20)]


def thresholds_of(t_def: float, t_unc: float) -> dict[str, float]:
    return {"BROKEN": t_def, "CHIPPED": t_def, "CRACK_SUSPECT": t_unc}


def decide(rec: Mapping, thresholds: Mapping[str, float]) -> Decision:
    track = Track(rec.get("track_state", "valid"))
    q = rec.get("quality_state")
    obs = Observation(
        labels=labels_from_scores(rec.get("defect_scores", {}), thresholds),
        quality=Quality(q) if q else Quality.OK,
        track=track,
    )
    return decide_route(obs)


def first_per_object(preds: Iterable[Mapping]) -> dict[str, list[Mapping]]:
    by: dict[str, list[Mapping]] = defaultdict(list)
    for p in preds:
        by[p["object_id"]].append(p)
    for v in by.values():
        v.sort(key=lambda p: (p.get("captured_at", ""), p.get("image_path", "")))
    return by


def evaluate(preds: list[Mapping], gt: Mapping[str, bool | None], thresholds: Mapping[str, float]):
    """첫 촬영 영상으로 고유 개체 성능, 반복 촬영으로 판정 일치율을 계산."""
    by = first_per_object(preds)
    results, rows = [], []
    agree = n_rep = 0
    for oid, recs in sorted(by.items()):
        ds = [decide(r, thresholds) for r in recs]
        results.append(ObjectResult(oid, gt.get(oid), ds[0].route))
        if len(ds) > 1:
            n_rep += 1
            agree += len({d.route for d in ds}) == 1
        rows.append({"object_id": oid, "gt_defect": gt.get(oid), "route": ds[0].route.value,
                     "reason": ds[0].reason, "image_path": recs[0].get("image_path"),
                     "scores": json.dumps(recs[0].get("defect_scores", {}))})
    known = [r for r in results if r.gt_defect is not None]
    m = route_metrics(known)
    m["반복 판정 일치율"] = wilson(agree, n_rep)
    return m, rows, len(results) - len(known)


def select_thresholds(preds, gt, max_recheck: float, max_false_reject: float, grid=GRID):
    """제약을 만족하는 조합 중 (유출 수, 재검사 수, 오배출 수) 사전식 최소."""
    best, best_key, feasible = None, None, False
    for t_def, t_unc in product(grid, grid):
        th = thresholds_of(t_def, t_unc)
        m, _, _ = evaluate(preds, gt, th)
        rc, fr, esc = m["재검사율"], m["정상 오배출률"], m["불량 유출률(자동)"]
        ok = _le(rc, max_recheck) and _le(fr, max_false_reject)
        violation = max(0.0, _val(rc) - max_recheck) + max(0.0, _val(fr) - max_false_reject)
        key = (not ok, violation if not ok else 0.0, esc.k, rc.k, fr.k, -t_def)
        if best_key is None or key < best_key:
            best, best_key, feasible = th, key, ok
    return best, feasible


def _val(r: Rate) -> float:
    return r.value if r.n else 0.0


def _le(r: Rate, cap: float) -> bool:
    return _val(r) <= cap


def gt_from_manifest(path: str) -> dict[str, bool | None]:
    by: dict[str, list] = defaultdict(list)
    for r in read_manifest(path):
        by[r.object_id].append(r)
    return {oid: is_true_defect(object_label(rs)) for oid, rs in by.items()}


def _load(p: str) -> tuple[list[dict], dict]:
    d = json.loads(Path(p).read_text(encoding="utf-8"))
    return d["results"], d.get("summary", {})


def _write_rows(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--val", required=True, help="val 예측 JSON (임계값 선택용)")
    ap.add_argument("--test", help="test 예측 JSON (고정 임계값으로 1회 평가)")
    ap.add_argument("--thresholds", help="이미 정한 임계값 JSON (지정 시 val 선택 생략)")
    ap.add_argument("--max-recheck", type=float, default=0.20)
    ap.add_argument("--max-false-reject", type=float, default=0.05)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    gt = gt_from_manifest(a.manifest)
    val, val_sum = _load(a.val)

    if a.thresholds:
        th = json.loads(Path(a.thresholds).read_text(encoding="utf-8"))["thresholds"]
        feasible = None
    else:
        th, feasible = select_thresholds(val, gt, a.max_recheck, a.max_false_reject)
        (out / "thresholds.json").write_text(json.dumps({
            "thresholds": th, "selected_on": "val", "feasible": feasible,
            "constraints": {"max_recheck": a.max_recheck, "max_false_reject": a.max_false_reject},
            "model_version": val_sum.get("model_version"),
        }, indent=2), encoding="utf-8")

    for name, preds, summ in [("val", val, val_sum)] + ([("test", *_load(a.test))] if a.test else []):
        m, rows, n_unk = evaluate(preds, gt, th)
        _write_rows(out / f"decisions_{name}.csv", rows)
        print(f"\n=== {name} (임계값 {th}) ===")
        print(format_report(m, n_unk))
        if summ.get("latency_ms"):
            l = summ["latency_ms"]
            print(f"추론 지연 p50 {l['p50']:.0f} ms / p99 {l['p99']:.0f} ms / max {l['max']:.0f} ms ({summ.get('device')})")
    if feasible is False:
        print("\n경고: 제약을 만족하는 임계값이 없음. 위반이 가장 작은 조합을 선택했다.")


if __name__ == "__main__":
    main()

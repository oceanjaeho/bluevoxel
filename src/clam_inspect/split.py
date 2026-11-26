"""데이터 분할 생성.

예:
  python -m clam_inspect.split --manifest data/manifest.csv --out runs/split.json \
      --holdout-batch B2026-12-10
"""

from __future__ import annotations

import argparse
import json

from .dataset import assert_no_leakage, read_manifest, save_split, split_objects, split_report


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ratios", type=float, nargs=3, default=(0.7, 0.15, 0.15))
    ap.add_argument("--holdout-batch", action="append", default=[],
                    help="최종 평가(test)로 통째로 뺄 수급 배치 (여러 번 지정 가능)")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args(argv)

    rows = read_manifest(a.manifest)
    asg = split_objects(rows, tuple(a.ratios), a.holdout_batch, a.seed)
    assert_no_leakage(asg, rows)
    rep = split_report(rows, asg)
    save_split(a.out, asg, {"ratios": a.ratios, "holdout_batches": a.holdout_batch,
                            "seed": a.seed, "report": rep})
    print(json.dumps(rep, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

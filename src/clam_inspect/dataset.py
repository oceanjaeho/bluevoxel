"""촬영 목록(manifest)과 누수 없는 데이터 분할 (설계서 11장).

manifest.csv 한 행 = 영상 한 장. 같은 개체(object_id)의 반복 촬영은
반드시 하나의 분할에만 들어간다. 가능하면 다른 수급 배치(batch_id)를
최종 평가셋으로 통째로 떼어낸다.
"""

from __future__ import annotations

import csv
import json
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

from .labels import ExtLabel, Quality, parse_labels

REQUIRED_COLUMNS = (
    "image_path",
    "object_id",
    "batch_id",
    "captured_at",
    "labels",
    "quality_state",
)
OPTIONAL_COLUMNS = (
    "lighting",  # diffuse / cross_pol / low_angle ...
    "wet",  # drained / wet / dry
    "orientation",  # up / down / side (보이는 패각 면)
    "exposure_us",
    "size_mm",
    "annotator",
    "note",
)
SPLITS = ("train", "val", "test")


@dataclass
class Record:
    image_path: str
    object_id: str
    batch_id: str
    captured_at: str
    labels: frozenset[ExtLabel]
    quality: Quality
    extra: dict[str, str] = field(default_factory=dict)


def read_manifest(path: str | Path) -> list[Record]:
    path = Path(path)
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path}: 필수 열 누락 {missing}")
        rows = []
        for i, row in enumerate(reader, start=2):
            try:
                labels = parse_labels(row["labels"])
                if not labels:
                    raise ValueError("labels 비어 있음")
                rows.append(
                    Record(
                        image_path=row["image_path"],
                        object_id=row["object_id"],
                        batch_id=row["batch_id"],
                        captured_at=row["captured_at"],
                        labels=labels,
                        quality=Quality(row["quality_state"] or "ok"),
                        extra={k: v for k, v in row.items() if k not in REQUIRED_COLUMNS},
                    )
                )
            except ValueError as e:
                raise ValueError(f"{path}:{i}행: {e}") from e
    _check_consistency(rows)
    return rows


def _check_consistency(rows: Sequence[Record]) -> None:
    """한 개체가 두 배치에 속하면 분할 누수의 원인이 되므로 오류로 처리."""
    batch_of: dict[str, str] = {}
    for r in rows:
        prev = batch_of.setdefault(r.object_id, r.batch_id)
        if prev != r.batch_id:
            raise ValueError(f"object_id {r.object_id}가 배치 {prev}, {r.batch_id}에 중복")


def object_label(rows: Iterable[Record]) -> frozenset[ExtLabel]:
    """개체의 반복 영상 라벨 합집합 (원인 라벨 복수 보존).

    단, 한 영상이라도 결함이 보이면 NORMAL_EXT는 제거한다.
    """
    labels: set[ExtLabel] = set()
    for r in rows:
        labels |= r.labels
    if len(labels) > 1:
        labels.discard(ExtLabel.NORMAL_EXT)
    return frozenset(labels)


def split_objects(
    rows: Sequence[Record],
    ratios: tuple[float, float, float] = (0.7, 0.15, 0.15),
    holdout_batches: Iterable[str] = (),
    seed: int = 0,
) -> dict[str, str]:
    """object_id → split. 외관 라벨별로 층화해 소수 결함도 각 분할에 들어가게 한다.

    holdout_batches에 지정한 배치는 모두 test로 보내고, 나머지는 train/val로만 나눈다.
    """
    if abs(sum(ratios) - 1) > 1e-6:
        raise ValueError("ratios 합은 1이어야 한다")
    holdout = set(holdout_batches)
    by_obj: dict[str, list[Record]] = defaultdict(list)
    for r in rows:
        by_obj[r.object_id].append(r)

    assignment: dict[str, str] = {}
    strata: dict[str, list[str]] = defaultdict(list)
    for oid, recs in by_obj.items():
        if recs[0].batch_id in holdout:
            assignment[oid] = "test"
        else:
            key = "+".join(sorted(l.value for l in object_label(recs)))
            strata[key].append(oid)

    if holdout:
        tr, va = ratios[0], ratios[1]
        ratios = (tr / (tr + va), va / (tr + va), 0.0)

    rng = random.Random(seed)
    for key in sorted(strata):
        oids = sorted(strata[key])
        rng.shuffle(oids)
        n = len(oids)
        n_tr = round(n * ratios[0])
        n_va = round(n * ratios[1])
        if ratios[2] == 0:
            n_va = n - n_tr
        for i, oid in enumerate(oids):
            assignment[oid] = "train" if i < n_tr else "val" if i < n_tr + n_va else "test"
    return assignment


def split_report(rows: Sequence[Record], assignment: dict[str, str]) -> dict:
    """분할별 고유 개체 수·영상 수·라벨 분포 (반복 영상 수와 구분해 보고)."""
    by_obj: dict[str, list[Record]] = defaultdict(list)
    for r in rows:
        by_obj[r.object_id].append(r)
    rep: dict = {}
    for s in SPLITS:
        oids = [o for o, sp in assignment.items() if sp == s]
        lab = Counter()
        for o in oids:
            for l in object_label(by_obj[o]):
                lab[l.value] += 1
        rep[s] = {
            "objects": len(oids),
            "images": sum(len(by_obj[o]) for o in oids),
            "batches": sorted({by_obj[o][0].batch_id for o in oids}),
            "object_labels": dict(sorted(lab.items())),
        }
    return rep


def assert_no_leakage(assignment: dict[str, str], rows: Sequence[Record]) -> None:
    seen: dict[str, str] = {}
    for r in rows:
        s = assignment[r.object_id]
        if seen.setdefault(r.object_id, s) != s:
            raise AssertionError(f"{r.object_id} 가 여러 분할에 포함됨")


def save_split(path: str | Path, assignment: dict[str, str], meta: dict | None = None) -> None:
    Path(path).write_text(
        json.dumps({"meta": meta or {}, "objects": assignment}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_split(path: str | Path) -> dict[str, str]:
    return json.loads(Path(path).read_text(encoding="utf-8"))["objects"]

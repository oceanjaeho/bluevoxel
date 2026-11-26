"""라인 설정. JSON 파일로 저장·불러오기.

모든 거리는 벨트 진행 방향 mm 기준. 실제 값은 S0 현장 조사(벨트 속도·거리·엔코더 분해능)로 채운다.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class CameraConfig:
    kind: str = "folder"  # folder | opencv
    path: str = "samples/20261126_mat01/IMG_29971.jpg"  # folder: 사진 파일 또는 폴더
    device: int = 0  # opencv: 장치 번호
    width: int = 0
    height: int = 0


@dataclass
class PlcConfig:
    kind: str = "sim"  # sim | modbus
    host: str = "192.168.0.10"
    port: int = 502
    unit: int = 1
    arrival_error_rate: float = 0.0  # sim: 배출 실패를 일부러 섞어 시험할 때


@dataclass
class Thresholds:
    defect: float = 0.80  # 깨짐·이물 확률이 이 이상이면 불량
    crack: float = 0.50  # 금 감 확률이 이 이상이면 재검사
    normal: float = 0.90  # 정상 확률이 이 이상일 때만 정상 후보


@dataclass
class LineConfig:
    belt_speed_mm_s: float = 200.0
    mm_per_count: float = 0.5  # 엔코더 1펄스당 이동 거리
    mm_per_px: float = 0.25  # 촬영면 배율 (눈금자로 보정)
    camera_to_gate_mm: float = 600.0  # 촬영 중심 → 분기 게이트
    gate_window_mm: float = 40.0  # 게이트를 열어 둘 길이 (개체 길이 + 여유)
    min_gap_mm: float = 15.0  # 이보다 붙은 개체는 단독 분기 불가 → 재검사
    decision_margin_mm: float = 60.0  # 게이트 도착 이만큼 전까지 판정이 와야 함
    frame_overlap_mm: float = 0.0  # 연속 촬영 간 겹침 (0 = 시야 길이마다 1장)
    batch_id: str = "LINE"
    data_dir: str = "runs/line"
    model_path: str = ""  # 비어 있으면 분류 모델 없이 운전 (전부 재검사)
    save_crops: bool = True
    queue_for_labeling: bool = True  # 같은 사진을 반복하는 시연에서는 끄기
    camera: CameraConfig = field(default_factory=CameraConfig)
    plc: PlcConfig = field(default_factory=PlcConfig)
    thresholds: Thresholds = field(default_factory=Thresholds)
    config_version: str = "v1"

    def counts(self, mm: float) -> int:
        return int(round(mm / self.mm_per_count))

    def to_dict(self) -> dict:
        return asdict(self)

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def from_dict(cls, d: dict) -> "LineConfig":
        d = dict(d)
        cam = CameraConfig(**d.pop("camera", {}))
        plc = PlcConfig(**d.pop("plc", {}))
        th = Thresholds(**d.pop("thresholds", {}))
        return cls(camera=cam, plc=plc, thresholds=th, **d)

    @classmethod
    def load(cls, path: str | Path) -> "LineConfig":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

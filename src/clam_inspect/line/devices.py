"""카메라와 PLC 연결부.

실제 장비가 정해지면 같은 메서드를 가진 클래스를 하나 더 만들면 된다.
- 카메라: grab() → BGR 영상
- PLC: encoder_count(), fire_gate(), set_feeder(), estop_active(), poll_arrivals()
"""

from __future__ import annotations

import threading
import time
from collections import deque
from pathlib import Path
import random

import cv2
import numpy as np

from ..labels import Route
from .config import CameraConfig, LineConfig, PlcConfig

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


# ---------------- 카메라 ----------------

class FolderCamera:
    """사진 파일·폴더를 순서대로 돌려주는 시험용 카메라."""

    def __init__(self, path: str, loop: bool = True):
        p = Path(path)
        files = [p] if p.is_file() else sorted(f for f in p.iterdir() if f.suffix.lower() in IMAGE_EXT)
        if not files:
            raise FileNotFoundError(f"사진이 없음: {path}")
        self.files, self.loop, self.i = files, loop, 0
        self._cache: dict[Path, np.ndarray] = {}

    def grab(self) -> np.ndarray:
        if self.i >= len(self.files):
            if not self.loop:
                raise StopIteration
            self.i = 0
        f = self.files[self.i]
        self.i += 1
        if f not in self._cache:
            img = cv2.imread(str(f))
            if img is None:
                raise IOError(f"사진을 읽을 수 없음: {f}")
            self._cache[f] = img
        return self._cache[f].copy()

    def close(self) -> None:
        pass


class OpenCVCamera:
    """USB 카메라·웹캠 (시제품 시험용). 산업용 카메라는 제조사 SDK로 같은 grab()을 구현."""

    def __init__(self, cfg: CameraConfig):
        self.cap = cv2.VideoCapture(cfg.device)
        if cfg.width:
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, cfg.width)
        if cfg.height:
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cfg.height)
        if not self.cap.isOpened():
            raise IOError(f"카메라 {cfg.device}를 열 수 없음")

    def grab(self) -> np.ndarray:
        ok, frame = self.cap.read()
        if not ok:
            raise IOError("카메라 영상 획득 실패")
        return frame

    def close(self) -> None:
        self.cap.release()


def make_camera(cfg: CameraConfig):
    if cfg.kind == "folder":
        return FolderCamera(cfg.path)
    if cfg.kind == "opencv":
        return OpenCVCamera(cfg)
    raise ValueError(f"알 수 없는 카메라 종류: {cfg.kind}")


# ---------------- PLC ----------------

class SimPLC:
    """모의 PLC. 운전 중에는 벨트 속도대로 엔코더가 올라가고, 배출 명령은 그대로 도착했다고 알린다.

    manual=True이면 시간과 무관하게 advance()로만 엔코더가 움직인다 (시험용).
    """

    def __init__(self, cfg: LineConfig, manual: bool = False):
        self.cfg = cfg
        self.manual = manual
        self.count = 0
        self.feeder = False
        self.estop = False
        self.gate_log: deque = deque(maxlen=500)
        self._arrivals: deque = deque()
        self._t = time.monotonic()
        self._lock = threading.Lock()
        self.rng = random.Random(0)

    def _update(self) -> None:
        now = time.monotonic()
        if not self.manual and self.feeder and not self.estop:
            self.count += int((now - self._t) * self.cfg.belt_speed_mm_s / self.cfg.mm_per_count)
        self._t = now

    def advance(self, mm: float) -> None:
        with self._lock:
            self.count += self.cfg.counts(mm)

    def encoder_count(self) -> int:
        with self._lock:
            self._update()
            return self.count

    def set_feeder(self, run: bool) -> None:
        with self._lock:
            self._update()
            self.feeder = run

    def estop_active(self) -> bool:
        return self.estop

    def fire_gate(self, inspection_id: str, route: Route) -> None:
        """정상 후보는 게이트를 움직이지 않고(직진), 불량·재검사는 각 게이트를 연다."""
        with self._lock:
            self.gate_log.append((self.count, inspection_id, route.value))
            arrived = route
            if self.rng.random() < self.cfg.plc.arrival_error_rate:
                arrived = Route.PASS if route is not Route.PASS else Route.RECHECK
            self._arrivals.append((inspection_id, arrived.value))

    def poll_arrivals(self) -> list[tuple[str, str]]:
        """배출 확인 센서: (검사 ID, 실제 도착 통)."""
        with self._lock:
            out = list(self._arrivals)
            self._arrivals.clear()
            return out

    def close(self) -> None:
        pass


class ModbusPLC:
    """Modbus TCP 연결 골격 (미시험). 레지스터 배치는 제어 업체와 합의해 아래 상수를 바꾼다.

    HR 0-1 : 엔코더 카운트 (32bit, 읽기)
    HR 10  : 피더 운전 1/정지 0 (쓰기)
    HR 11  : 비상정지 상태 (읽기)
    HR 20  : 배출 명령 경로 (1 불량, 2 재검사) / HR 21-22: 검사 ID 하위 32bit
    HR 30  : 배출 확인 큐 (PLC가 채우고 PC가 읽은 뒤 0으로)
    """

    ENC, FEEDER, ESTOP, CMD, CMD_ID, ARRIVAL = 0, 10, 11, 20, 21, 30

    def __init__(self, cfg: PlcConfig):
        try:
            from pymodbus.client import ModbusTcpClient
        except ImportError as e:
            raise SystemExit("pymodbus 필요: pip install pymodbus") from e
        self.cli = ModbusTcpClient(cfg.host, port=cfg.port)
        self.unit = cfg.unit
        if not self.cli.connect():
            raise IOError(f"PLC 연결 실패: {cfg.host}:{cfg.port}")

    def encoder_count(self) -> int:
        r = self.cli.read_holding_registers(self.ENC, count=2, slave=self.unit)
        return (r.registers[0] << 16) | r.registers[1]

    def set_feeder(self, run: bool) -> None:
        self.cli.write_register(self.FEEDER, 1 if run else 0, slave=self.unit)

    def estop_active(self) -> bool:
        return bool(self.cli.read_holding_registers(self.ESTOP, count=1, slave=self.unit).registers[0])

    def fire_gate(self, inspection_id: str, route: Route) -> None:
        if route is Route.PASS:
            return
        code = 1 if route is Route.REJECT else 2
        h = hash(inspection_id) & 0xFFFFFFFF
        self.cli.write_registers(self.CMD_ID, [h >> 16, h & 0xFFFF], slave=self.unit)
        self.cli.write_register(self.CMD, code, slave=self.unit)

    def poll_arrivals(self) -> list[tuple[str, str]]:
        return []  # 배출 확인 센서 프로토콜 합의 후 구현

    def close(self) -> None:
        self.cli.close()


def make_plc(cfg: LineConfig, manual: bool = False):
    if cfg.plc.kind == "sim":
        return SimPLC(cfg, manual=manual)
    if cfg.plc.kind == "modbus":
        return ModbusPLC(cfg.plc)
    raise ValueError(f"알 수 없는 PLC 종류: {cfg.plc.kind}")

# bluevoxel · 바지락 외관검사 S1 실현성 검증

설계서 **BV CLAM TD 03 v3.1**의 S1 단계(선별대 기반 촬영·라벨·모델 평가)를 위한 코드입니다.
선별대에서 촬영한 껍데기째 바지락 영상으로 다음 세 가지를 판단하는 것이 목표입니다.

1. 명확한 파손·결손이 **상부 가시 표면 기준**으로 충분히 잡히는가
2. 젖은 패각의 반사·흐림이 통제되는가 (`quality_state`)
3. 재검사율이 감당할 수준인가

벨트 연동(S2)과 공급 연계(S3)는 이 결과를 보고 진행합니다.

## 구성

| 모듈 | 설계서 | 역할 |
|---|---|---|
| `labels.py` | 11·12장 | 외관 라벨 5종, 품질·추적 상태, 경로 판정 규칙 |
| `dataset.py`, `split.py` | 11장 | manifest 검증, 개체 단위·배치 홀드아웃 분할 (누수 방지) |
| `coco.py`, `roi.py` | 10장 | COCO 폴리곤 주석, 원본 해상도 ROI 추출 |
| `quality.py` | 11장 | 흐림·반사·잘림 자동 판정 (임계값은 T01 영상으로 보정) |
| `models.py`, `train.py` | 10장 | A: 개체 분할(Mask R-CNN), B: ROI 결함 탐지(Faster R-CNN) |
| `predict.py` | 10·13장 | 2단계 추론, 지연시간 p50/p95/p99 기록 |
| `evaluate.py`, `metrics.py` | 16·18장 | val에서 운영점 선택 → test 1회 평가, Wilson 95% 신뢰구간 |
| `optics.py` | 9·13장 | g·n·b 계산, 시간 예산(D/v, p/v), 이론 처리량 |
| `events.py` | 14장 | 검사 이벤트 SQLite 기록 (S2에서 그대로 사용) |

모델은 torchvision 구현(BSD-3)을 사용합니다. Ultralytics(AGPL-3.0)는 상용 장비에 탑재하려면
별도 라이선스가 필요해서 기본값에서 제외했습니다.

## 설치

```bash
pip install -e ".[train,dev]"
```

GPU가 없어도 동작하지만 학습은 느립니다. VRAM 8GB급 GPU를 권장합니다.

## 데이터 준비

**S1 촬영 규칙: 영상 1장 = 바지락 1개.** 같은 개체를 조명·방향을 바꿔 여러 번 찍는 것은 권장하지만,
모두 같은 `object_id`로 기록해야 합니다.

```
data/
  manifest.csv        # 영상 1장당 1행 (data/manifest_template.csv 참고)
  annotations.json    # COCO 폴리곤: clam + BROKEN / CHIPPED / CRACK_SUSPECT
  images/...
```

- `labels`: 개체의 외관 라벨. 여러 개면 `;`로 구분합니다 (`BROKEN;CRACK_SUSPECT`).
  `NORMAL_EXT`, `BROKEN`, `CHIPPED`, `CRACK_SUSPECT`, `UNKNOWN` 중에서 씁니다.
- `quality_state`: `ok`, `blur`, `glare`, `occluded`, `truncated`
- `orientation`: 보이는 면(`up`/`down`). 하부 비가시 결함의 영향을 따로 분석할 때 사용합니다.
- 결함 위치는 CVAT 또는 Label Studio에서 폴리곤으로 그리고 **COCO 형식**으로 내보냅니다.
  결함이 없는 개체도 `clam` 폴리곤은 반드시 그려야 합니다 (음성 표본).

라벨이 애매한 시료는 `UNKNOWN`으로 두고 판정 예시집에 모읍니다.

## 실행 순서

```bash
# 0) 설치 점검용 가짜 데이터 (성능 수치는 의미 없음)
python scripts/make_synthetic.py --out data/synthetic --objects 60
```

```bash
# 1) 분할: 가능하면 다른 수급 배치를 최종 평가셋으로 통째로 뺀다
python -m clam_inspect.split --manifest data/manifest.csv --out runs/split.json --holdout-batch B20261217
```

```bash
# 2) 학습 (A: 개체, B: 결함)
python -m clam_inspect.train --task clam   --manifest data/manifest.csv --coco data/annotations.json --split runs/split.json --out runs/clam
python -m clam_inspect.train --task defect --manifest data/manifest.csv --coco data/annotations.json --split runs/split.json --out runs/defect
```

```bash
# 3) 추론 (val, test 각각)
python -m clam_inspect.predict --clam runs/clam/last.pt --defect runs/defect/last.pt --manifest data/manifest.csv --split runs/split.json --which val  --out runs/pred_val.json
python -m clam_inspect.predict --clam runs/clam/last.pt --defect runs/defect/last.pt --manifest data/manifest.csv --split runs/split.json --which test --out runs/pred_test.json
```

```bash
# 4) 운영점 선택(val) → 독립 평가(test)
python -m clam_inspect.evaluate --manifest data/manifest.csv --val runs/pred_val.json --test runs/pred_test.json --max-recheck 0.2 --max-false-reject 0.05 --out runs/eval
```

`runs/eval/decisions_*.csv`에 개체별 경로와 사유가 남으므로 실패 사례를 확인할 수 있습니다.
test 결과를 보고 임계값을 바꿨다면, 그 test는 더 이상 독립 평가가 아닙니다.

## 광학 계산

```bash
python -m clam_inspect.optics --W 200 --N 2448 --d 0.3 --v 200 --t 0.0008 --pitch 50
```

## 판정 규칙 (12장)

추적 유효 → 단독 간격 → 유효 기한 → 영상 품질 → BROKEN/CHIPPED면 **불량**
→ CRACK_SUSPECT/UNKNOWN이면 **재검사** → `NORMAL_EXT`만 남은 경우에만 **정상 후보**.

## 테스트

```bash
pytest
```

`tests/test_pipeline_smoke.py`는 가짜 데이터로 분할→학습→추론→평가 전체 흐름을 CPU에서 약 1분간 돌립니다.

## 알려진 한계

- 상부 카메라 1대로는 아래쪽 패각 결함을 보지 못합니다. 결과는 "가시 표면 기준"으로만 해석해야 합니다.
- `quality.py`의 흐림·반사 임계값은 출발값입니다. 실제 촬영 영상으로 보정해야 합니다.
- 운영점 탐색은 BROKEN과 CHIPPED에 같은 임계값을 씁니다. 데이터가 쌓이면 분리합니다.
- PatchCore 비교 모델은 아직 포함하지 않았습니다 (지도학습 기준선을 먼저 확보).

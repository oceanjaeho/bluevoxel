# 갯벌 수호대

손가락 하나로 움직이는 **갯벌 생존 액션 게임**이에요. 공격은 자동이고, 오염 몬스터를 쓰러뜨린 자리마다 갯벌이 되살아나요. (블루복셀 시리즈)

<img src="docs/images/gaetbeol-play.jpg" alt="한창 싸우는 장면: 쓰러뜨린 자리마다 회색 오염 갯벌이 초록 염습지로 바뀌어요" width="620"> <img src="docs/images/gaetbeol-title-phone.jpg" alt="휴대폰 타이틀 화면" width="150">

## 한눈에

| | |
|---|---|
| 장르 | 뱀서라이크(생존 액션), 한 판 5분, 화면 전체가 게임 |
| 조작 | 아무 데나 드래그(PC는 WASD·방향키), 공격은 자동, 레벨업 때 카드 3장 중 1장 |
| 재미 | 생물 무기 8종과 진화 8종, 패시브 8종, 보물 상자, 포위·미세플라스틱 떼·태풍, 보스 3종, 기지 강화 9종, 생물 4종 해금, 도감 34칸 |
| 배움 | 쓰러뜨린 자리 → 갯벌 → 염습지, 파란 결정 = 탄소(점수 = 블루카본 t), 염습지 위에서 회복, 매립 불도저가 지나가면 CO₂ |
| 환경 | 설치·로그인·광고·확률형 아이템 없음, 파일 하나(약 220KB), 휴대폰·태블릿·PC |

<img src="docs/images/gaetbeol-boss.jpg" alt="보스 매립 불도저가 돌진을 예고하는 붉은 길" width="400"> <img src="docs/images/gaetbeol-result.jpg" alt="결과 화면: 처음과 지금 지도 비교, 복원 100%" width="400">

## 실행

- `game/index.html`을 브라우저로 열어요.
- `npm run build` → `dist/gaetbeol.html` 한 파일로 나눠 줄 수 있어요.
- 토론 수업용 전략 버전(블루복셀: 갯벌마을 2050)은 `prototype/`에 있어요 (`npm run build:prototype`).

## 문서

| 문서 | 내용 |
|---|---|
| [05 캐주얼 전환](docs/05-casual-pivot.md) | 왜 바꿨는지, 장르 조사, 재미 구조, 글 없이 넣은 생태 메시지, 수치 |
| [04 상용화 계획](docs/04-commercial-plan.md) | 고객, 차별점, 출시 체크리스트 |
| [01 상위 게임 분석](docs/01-trend-analysis.md) · [02 기획서](docs/02-game-design.md) · [03 수업 가이드](docs/03-classroom-guide.md) | 전략 버전 문서 |

## 개발

```bash
npm test          # 게임 로직 테스트 (갯벌 수호대 + 전략 버전)
npm run balance   # 자동 조종으로 스테이지·캐릭터별 승률
npm run build     # 한 파일 빌드
```

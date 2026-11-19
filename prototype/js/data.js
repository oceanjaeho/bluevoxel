/*
 * 블루복셀: 갯벌마을 2050 — 게임 데이터
 * 지도, 타일, 도구, 생물 도감, 마을 회의 카드, 엔딩, 과학 노트, 픽셀 스프라이트.
 * 수치 근거는 docs/02-game-design.md 의 "과학적 근거" 절을 참고하세요.
 */
(function (BV) {
  'use strict';

  BV.CONFIG = {
    START_YEAR: 2026,
    END_YEAR: 2050,
    START_BUDGET: 10,        // 억 원
    START_SUPPORT: 55,       // 주민 지지도(0~100)
    START_WQ: 44,            // 바다 수질 지수(0~100)
    START_DEBRIS: 10,        // 처음 쓰레기 칸 수
    VILLAGE_EMISSION: 480,   // 2026년 마을 배출량 tCO2/년 (학습용 가상값)
    GRID_DECARB: 0.01,       // 국가 전력 전환에 따른 연 1% 자연 감소
    TIDE_MID: 2.35,
    TIDE_AMP: 0.95,
    TIDE_PERIOD: 26,         // 초(화면 속 물때 한 주기)
    SLR_PER_YEAR: 0.012,     // 해수면 상승(높이 단위/년, 화면 표현용)
    DEFAULT_CODE: 'MULTTAE'
  };

  /* ---------- 지도 (16 x 16, 1칸 = 1ha) ----------
   * H 뒷산  F 솔숲  g 들판  f 밭  V 마을  P 포구
   * W 제방  Q 배수갑문  R 간척 농지  O 폐양식장
   * u 상부 갯벌  m 염습지  M 갯벌  c 갯골  s 얕은 바다  G 잘피밭  D 깊은 바다  I 무인도
   */
  BV.MAP = [
    'HHHFFFgfRRRRRRfF',
    'HHFFFgfRRRRRRRRF',
    'HFFggfRRRRRRRRRg',
    'FFgVgRRROORROORg',
    'FgVVgROOOORROORg',
    'gVVVgWWWWQWWWWWW',
    'VVguuMMMMcMMMMss',
    'VVgumMMMMccMMsss',
    'gVgmuMMMMMcMssss',
    'VVgumccMMMcsssss',
    'gVPuuMcMMMsGGssD',
    'VgPuMMccMssGssDD',
    'FgguMMMcssssIIDD',
    'FFuMMMMsssssIDDD',
    'FuMMMMsssssDDDDD',
    'uMMMMsssssDDDDDD'
  ];

  BV.LEGEND = {
    H: 'hill', F: 'forest', g: 'land', f: 'farm', V: 'village', P: 'port',
    W: 'wall', Q: 'gate', R: 'field', O: 'pond', u: 'upper', m: 'marsh',
    M: 'mudflat', c: 'creek', s: 'shallow', G: 'seagrass', D: 'sea', I: 'island'
  };

  // 회의 카드가 바꾸는 미리 정해 둔 구역 [x, y]
  BV.ZONES = {
    industryA: [[11, 6], [12, 6], [13, 6], [11, 7], [12, 7], [11, 8]],
    industryC: [[12, 1], [13, 1], [12, 2], [13, 2]],
    resort: [[15, 3], [15, 4]],
    port: [[8, 13], [9, 13], [8, 14], [9, 14]]
  };

  BV.TIDAL = { sea: 1, shallow: 1, seagrass: 1, creek: 1, mudflat: 1, upper: 1, marsh: 1 };
  BV.ECO = { mudflat: 1, upper: 1, marsh: 1, seagrass: 1 };

  BV.TILES = {
    sea: { name: '깊은 바다', h: 0, zone: '조하대',
      desc: '썰물 때에도 늘 잠겨 있는 바다예요. 서해는 갯벌에서 흘러나온 고운 진흙 때문에 물빛이 탁한 편이에요.' },
    shallow: { name: '얕은 바다', h: 1, zone: '조하대(얕은 곳)',
      desc: '햇빛이 바닥까지 닿는 얕은 바다예요. 물이 맑으면 잘피를 옮겨 심을 수 있어요.' },
    seagrass: { name: '잘피밭', h: 1, zone: '조하대(얕은 곳)',
      desc: '거머리말 같은 잘피는 미역 같은 해조류가 아니라 바닷속에서 꽃을 피우는 식물이에요. 뿌리 주변 진흙에 탄소를 저장하고, 어린 물고기의 집이 돼요.' },
    creek: { name: '갯골', h: 1, zone: '갯벌의 물길',
      desc: '밀물과 썰물이 드나드는 갯벌의 물길이에요. 바닷물이 갯벌 깊숙이 들어오게 해 줘요.' },
    mudflat: { name: '갯벌', h: 2, zone: '조간대',
      desc: '밀물 때 잠기고 썰물 때 드러나는 땅이에요. 진흙 표면의 작은 조류가 광합성을 하고, 진흙 속에 탄소가 쌓여요. 우리나라 갯벌의 약 98%는 이렇게 식물이 없는 갯벌이에요.' },
    upper: { name: '상부 갯벌', h: 3, zone: '상부 조간대',
      desc: '큰 밀물 때만 잠기는 높은 갯벌이에요. 칠면초·퉁퉁마디 같은 염생식물이 자랄 수 있는 높이예요.' },
    marsh: { name: '염습지', h: 3, zone: '상부 조간대',
      desc: '소금기를 견디는 염생식물이 자라는 습지예요. 물에 잠긴 진흙은 산소가 부족해 식물 찌꺼기가 잘 썩지 않아요. 그래서 탄소가 수백 년 넘게 쌓여요.' },
    field: { name: '간척 농지', h: 3, zone: '제방 안쪽 간척지',
      desc: '예전에 갯벌을 막고 메워 만든 논이에요. 바닷물이 끊기면서 진흙 속 탄소의 상당 부분이 이미 공기 중으로 빠져나갔어요.' },
    pond: { name: '폐양식장', h: 3, zone: '제방 안쪽 간척지',
      desc: '운영을 멈춘 새우 양식장이에요. 고인 물이 썩어 바다까지 탁하게 만들어요. 물길을 다시 트면 갯벌로 되살릴 수 있어요.' },
    wall: { name: '제방', h: 4, zone: '해안 구조물',
      desc: '간척지를 바닷물로부터 막는 콘크리트 둑이에요. 바닷물의 흐름을 끊어서 둑 앞에는 염습지가 자랄 높은 갯벌이 남지 않았어요.' },
    gate: { name: '배수갑문', h: 4, zone: '해안 구조물',
      desc: '간척지의 물을 바다로 빼는 수문이에요.' },
    land: { name: '들판', h: 4, zone: '육지', desc: '마을 둘레의 풀밭이에요.' },
    farm: { name: '밭·비닐하우스', h: 4, zone: '육지',
      desc: '채소를 기르는 밭이에요. 비가 많이 오면 비료가 바다로 흘러들 수 있어요.' },
    village: { name: '마을', h: 4, zone: '육지',
      desc: '물때마을 주민들이 사는 집이에요. 태풍과 해일이 오면 앞바다의 갯벌과 염습지가 첫 번째 방패가 돼요.' },
    port: { name: '포구', h: 4, zone: '육지',
      desc: '고깃배가 드나드는 작은 포구예요. 썰물이면 배가 갯벌 위에 내려앉아요.' },
    forest: { name: '솔숲', h: 5, zone: '육지', desc: '바닷바람을 막아 주는 소나무 숲이에요.' },
    hill: { name: '뒷산', h: 6, zone: '육지', desc: '마을 뒤의 낮은 산이에요.' },
    island: { name: '무인도', h: 5, zone: '바다 위 섬',
      desc: '사람이 살지 않는 작은 바위섬이에요. 서해의 무인도는 멸종위기종 저어새가 둥지를 트는 곳이에요.' },
    industry: { name: '산업단지', h: 4, zone: '매립지',
      desc: '갯벌이나 바다를 메워 만든 공장 부지예요. 메워진 진흙 속 탄소가 몇 년에 걸쳐 공기 중으로 빠져나가요.' },
    resort: { name: '리조트', h: 4, zone: '해안 개발지',
      desc: '바닷가 리조트예요. 관광 수입이 생기지만 불빛과 사람들 때문에 무인도의 새들이 방해를 받아요.' },
    solar: { name: '태양광 발전소', h: 3, zone: '간척지',
      desc: '폐양식장 위에 지은 태양광 발전소예요. 마을이 쓰는 화석연료를 줄여 줘요.' }
  };

  /* ---------- 도구 ---------- */
  BV.TOOLS = [
    { id: 'inspect', name: '살펴보기', short: '보기', cost: 0, key: '1', icon: 'inspect',
      desc: '칸을 눌러 상태와 탄소 저장량을 확인해요.' },
    { id: 'marsh', name: '염생식물 심기', short: '염생식물', cost: 2, key: '2', icon: 'marsh',
      desc: '상부 갯벌에 칠면초·퉁퉁마디를 심어 염습지를 만들어요.', target: '상부 갯벌(쓰레기 없는 칸)' },
    { id: 'seagrass', name: '잘피 심기', short: '잘피', cost: 3, key: '3', icon: 'seagrass',
      desc: '얕은 바다에 거머리말(잘피)을 옮겨 심어요. 물이 맑아야 잘 자라요.', target: '얕은 바다' },
    { id: 'cleanup', name: '쓰레기 줍기', short: '줍기', cost: 1, key: '4', icon: 'cleanup',
      desc: '부서진 스티로폼 부표와 폐어구를 치워요.', target: '쓰레기가 있는 칸' },
    { id: 'restore', name: '갯벌 복원', short: '복원', cost: 4, key: '5', icon: 'restore',
      desc: '바닷물과 맞닿은 폐양식장·간척 농지에 물길을 터서 갯벌로 되돌려요.', target: '바닷물과 맞닿은 폐양식장·간척 농지' },
    { id: 'openwall', name: '제방 열기', short: '제방', cost: 5, key: '6', icon: 'openwall',
      desc: '제방 한 칸을 허물어 바닷물이 다시 드나들게 해요(해수유통).', target: '바닷물과 맞닿은 제방' },
    { id: 'boardwalk', name: '탐방로 놓기', short: '탐방로', cost: 2, key: '7', icon: 'boardwalk',
      desc: '나무 데크 탐방로를 놓아 생태관광 수입을 얻어요.', target: '육지나 다른 탐방로와 이어진 갯벌·염습지' },
    { id: 'develop', name: '매립 개발', short: '매립', cost: -5, key: '8', icon: 'develop',
      desc: '갯벌을 메워 개발 부지로 팔아요. 당장 5억 원과 매년 세금이 생기지만…', target: '육지와 맞닿은 갯벌·염습지' }
  ];

  /* ---------- 생물 도감 ----------
   * need: [조건 키, 기준값]
   *  flats 건강한 갯벌(갯벌+상부 갯벌, 건강도 50 이상) ≥ n
   *  marsh 염습지 ≥ n, seagrass 잘피밭 ≥ n, seagrassMature 무성한 잘피밭 ≥ n
   *  wq 수질 ≥ n, debrisMax 쓰레기 칸 ≤ n, devMax 개발지 ≤ n
   *  protect 보호 정책 있음, island 무인도 방해 없음
   */
  BV.SPECIES = [
    { id: 'worm', name: '갯지렁이', tag: '갯벌의 농부', habitat: '갯벌',
      fact: '진흙에 구멍을 파고 드나들며 갯벌 속에 산소를 넣고 영양분을 돌게 해요. 도요새의 중요한 먹이예요.',
      need: [['flats', 30]] },
    { id: 'mudcrab', name: '칠게', tag: '갯벌의 청소부', habitat: '갯벌',
      fact: '썰물 때 굴 밖으로 나와 진흙 속 유기물을 걸러 먹어요. 많은 바닷새가 칠게를 먹고 살아요.',
      need: [['flats', 40], ['debrisMax', 12]] },
    { id: 'suaeda', name: '칠면초', tag: '갯벌의 붉은 카펫', habitat: '염습지',
      fact: '여름에는 초록빛, 가을에는 붉은 자줏빛으로 변해요. 색이 여러 번 바뀐다고 해서 칠면초라는 이름이 붙었어요.',
      need: [['marsh', 2]] },
    { id: 'eelgrass', name: '거머리말', tag: '바닷속에서 꽃 피는 잘피', habitat: '얕은 바다',
      fact: '해조류가 아니라 뿌리·줄기·잎이 있고 꽃을 피우는 식물이에요. 잘피밭은 물고기의 산란장이자 탄소 저장고예요.',
      need: [['seagrass', 2]] },
    { id: 'clam', name: '바지락', tag: '맨손어업의 보물', habitat: '갯벌',
      fact: '바닷물을 빨아들여 플랑크톤을 걸러 먹어요. 바지락이 많을수록 바닷물이 맑아져요.',
      need: [['flats', 40], ['wq', 52]] },
    { id: 'fiddler', name: '농게', tag: '한쪽 집게가 큰 게', habitat: '염습지 가장자리',
      fact: '수컷은 한쪽 집게발이 몸통만큼 커요. 붉은 집게를 흔들어 짝을 부르고 영역을 지켜요.',
      need: [['marsh', 6], ['flats', 40]] },
    { id: 'mudskipper', name: '짱뚱어', tag: '갯벌 위를 뛰는 물고기', habitat: '부드러운 진흙 갯벌',
      fact: '물 밖에서도 피부와 입으로 숨을 쉬며 갯벌 위를 뛰어다녀요. 갯벌이 메워지면 함께 사라져요.',
      need: [['flats', 42], ['wq', 58], ['debrisMax', 5]] },
    { id: 'godwit', name: '큰뒷부리도요', tag: '대양을 건너는 철새', habitat: '넓은 갯벌(중간 기착지)',
      fact: '호주·뉴질랜드에서 알래스카로 가는 길에 서해 갯벌에 들러 갯지렁이를 먹고 몸무게를 불려요. 쉬어 갈 갯벌이 없으면 긴 여행을 마칠 수 없어요.',
      need: [['flats', 44], ['debrisMax', 4]] },
    { id: 'seahorse', name: '해마', tag: '잘피 숲의 숨바꼭질 선수', habitat: '무성한 잘피밭',
      fact: '꼬리로 잘피 잎을 감고 지내요. 잘피밭이 사라지면 해마도 살 곳을 잃어요.',
      need: [['seagrassMature', 4], ['wq', 62]] },
    { id: 'whitecrab', name: '흰발농게', tag: '멸종위기 야생생물 Ⅱ급', habitat: '모래 섞인 갯벌',
      fact: '하얀 집게발을 흔드는 작은 게예요. 매립과 오염에 약해 법으로 보호하고 있어요.',
      need: [['flats', 42], ['marsh', 10], ['debrisMax', 2], ['devMax', 4]] },
    { id: 'porpoise', name: '상괭이', tag: '웃는 얼굴의 토종 돌고래', habitat: '서해·남해 연안',
      fact: '등지느러미가 없고 웃는 얼굴을 닮은 작은 돌고래예요. 그물에 걸려 목숨을 잃는 일이 많아 해양보호생물로 지정됐어요.',
      need: [['seagrass', 10], ['wq', 70], ['debrisMax', 3]] },
    { id: 'spoonbill', name: '저어새', tag: '멸종위기 야생생물 Ⅰ급', habitat: '넓은 갯벌 + 조용한 무인도',
      fact: '주걱 같은 부리를 물속에서 좌우로 저으며 먹이를 찾아요. 1990년대에 수백 마리까지 줄었다가 보호 노력으로 2025년 약 7천 마리로 늘었어요. 그래도 번식지와 갯벌 보호가 계속 필요해요.',
      need: [['flats', 42], ['marsh', 8], ['protect', 1], ['island', 1]] }
  ];

  BV.NEED_LABEL = {
    flats: '건강한 갯벌', marsh: '염습지', seagrass: '잘피밭', seagrassMature: '무성한 잘피밭',
    wq: '수질', debrisMax: '쓰레기 칸', devMax: '개발지', protect: '갯벌 보호 정책', island: '무인도가 조용함'
  };

  /* ---------- 마을 사람들 ---------- */
  BV.PEOPLE = {
    mayor: { name: '정 이장', role: '마을 이장' },
    captain: { name: '박 선장', role: '어민 · 고깃배 선장' },
    grandma: { name: '순자 할머니', role: '맨손어업 50년' },
    scientist: { name: '윤 연구원', role: '해양생태 연구원' },
    ceo: { name: '최 대표', role: '개발회사 대표' },
    student: { name: '한별', role: '청소년 기후행동 · 중학생' }
  };

  /* ---------- 마을 회의·소식 카드 ----------
   * apply(s, A): A 는 BV.sim.api (예산·지지도·타일 변환 도우미)
   */
  BV.CARDS = {
    start: {
      kind: 'council', title: '물때마을 생태전환위원회 첫 회의',
      lead: '갯벌이 탄소를 저장한다는 연구가 알려지면서 마을에 생태전환위원회가 생겼어요. 청소년 위원인 당신이 첫 활동을 골라 주세요.',
      options: [
        { who: 'grandma', quote: '갯벌에 쓰레기가 너무 많아. 깨끗해야 생물이 돌아와.',
          label: '해안 정화의 날', effect: '쓰레기 4곳 정리 · 지지도 +3 · 예산 −1억',
          apply: function (s, A) { A.clearDebris(s, 4); A.support(s, 3); A.budget(s, -1); } },
        { who: 'scientist', quote: '대학 연구팀과 함께하면 잘피 옮겨심기 기술을 배울 수 있어요.',
          label: '연구팀과 협력', effect: '잘피 심기 비용 3억 → 2억 · 예산 +1억(연구 지원금)',
          apply: function (s, A) { s.flags.seagrassTech = true; A.budget(s, 1); } },
        { who: 'mayor', quote: '주민들이 먼저 알아야지요. 설명회부터 엽시다.',
          label: '주민 설명회', effect: '지지도 +8',
          apply: function (s, A) { A.support(s, 8); } }
      ]
    },
    ponds: {
      kind: 'council', title: '폐양식장, 어떻게 할까?',
      lead: '제방 안쪽의 폐양식장 10곳이 몇 년째 방치돼 있어요. 고인 물이 썩어 바다까지 탁해지고 있어요.',
      options: [
        { who: 'ceo', quote: '태양광 발전소를 지으면 마을 전기를 깨끗하게 만들 수 있습니다.',
          label: '태양광 발전소 짓기', effect: '폐양식장 → 태양광 · 마을 배출 −12% · 수입 +1억/년',
          long: '이 자리를 갯벌로 되돌릴 기회는 사라져요.',
          apply: function (s, A) { A.convertAll(s, 'pond', 'solar'); A.cut(s, 'pondSolar', 0.12); s.policies.pond = 'solar'; } },
        { who: 'scientist', quote: '원래 갯벌이던 곳이에요. 바닷물이 드나들면 탄소를 저장하는 갯벌로 돌아와요.',
          label: '갯벌 복원 계획 세우기', effect: '폐양식장 복원 비용 4억 → 2억 · 지지도 −2',
          long: '먼저 제방을 열어 물길이 닿게 해야 해요.',
          apply: function (s, A) { s.policies.pond = 'restore'; A.support(s, -2); } },
        { who: 'captain', quote: '양식장을 다시 돌리면 당장 일자리와 소득이 생기지.',
          label: '양식장 다시 운영', effect: '수입 +1.5억/년 · 지지도 +3',
          long: '사료와 배설물이 바다로 흘러가 수질이 나빠져요.',
          apply: function (s, A) { A.activatePonds(s); s.policies.pond = 'aqua'; A.support(s, 3); } }
      ]
    },
    industry: {
      kind: 'council', title: '산업단지 유치 제안',
      lead: '한 기업이 마을 앞 갯벌 6ha를 메워 산업단지를 짓자고 제안했어요. 일자리 200개를 약속하고 있어요.',
      options: [
        { who: 'ceo', quote: '투자금이 바로 들어오고 젊은 사람들이 마을에 남을 겁니다.',
          label: '찬성: 갯벌 매립', effect: '예산 +15억 · 수입 +2.4억/년 · 지지도 +4',
          long: '갯벌 6칸이 사라지고, 진흙 속 탄소가 몇 년에 걸쳐 빠져나가요.',
          apply: function (s, A) { A.developZone(s, 'industryA', 'industry'); A.budget(s, 15); A.support(s, 4); } },
        { who: 'grandma', quote: '그 갯벌에서 바지락 캐서 자식들 다 키웠어. 메우면 다시는 못 돌려.',
          label: '반대', effect: '지지도 −4',
          apply: function (s, A) { A.support(s, -4); } },
        { who: 'student', quote: '이미 메운 간척 농지에 지으면 갯벌은 안 건드려도 되잖아요?',
          label: '대안: 간척 농지에 짓기', effect: '간척 농지 4칸 → 산업단지 · 예산 +6억 · 수입 +1.6억/년',
          long: '농업 수입은 조금 줄어요.',
          apply: function (s, A) { A.developZone(s, 'industryC', 'industry'); A.budget(s, 6); } }
      ]
    },
    typhoon2: {
      kind: 'disaster', title: '태풍 예보', typhoon: 2,
      lead: '올여름 강한 태풍이 서해로 올라올 것으로 보여요. 갯벌과 염습지는 파도의 힘을 줄여 마을을 지켜 줘요. 마을 앞 상부 갯벌에 염생식물을 심어 두면 도움이 돼요.',
      options: [{ label: '대비할게요', effect: '연말에 태풍이 지나가요' }]
    },
    debris: {
      kind: 'council', title: '하얗게 덮인 갯벌',
      lead: '부서진 스티로폼 부표 조각이 갯벌을 덮고 있어요. 잘게 부서져 미세플라스틱이 되면 치우기도 어려워요.',
      options: [
        { who: 'captain', quote: '친환경 부표로 바꾸고 싶어도 값이 비싸. 지원이 있으면 바꾸지.',
          label: '친환경 부표 교체 지원', effect: '예산 −4억 · 매년 생기는 쓰레기 절반',
          apply: function (s, A) { A.budget(s, -4); s.policies.ecoBuoy = true; } },
        { who: 'grandma', quote: '한 달에 한 번은 다 같이 나가서 줍자고.',
          label: '주민 정화의 날 정례화', effect: '예산 −1억 · 지금 쓰레기 4곳 정리 · 매년 −1 · 지지도 +4',
          apply: function (s, A) { A.budget(s, -1); A.clearDebris(s, 4); s.policies.cleanupDay = true; A.support(s, 4); } },
        { who: 'mayor', quote: '예산이 빠듯하니 내년에 다시 봅시다.',
          label: '보류', effect: '변화 없음' }
      ]
    },
    boats: {
      kind: 'council', title: '전기·하이브리드 어선',
      lead: '마을 배출량의 큰 몫이 고깃배 연료에서 나와요. 어선을 바꾸려면 지원이 필요해요.',
      options: [
        { who: 'captain', quote: '기름값도 아끼고 바다 공기도 깨끗해지면 좋지.',
          label: '어선 전환 지원', effect: '예산 −5억 · 마을 배출 −10%',
          apply: function (s, A) { A.budget(s, -5); A.cut(s, 'boats', 0.10); } },
        { who: 'mayor', quote: '기술이 더 좋아지면 그때 합시다.',
          label: '나중에', effect: '변화 없음' }
      ]
    },
    protect: {
      kind: 'council', title: '갯벌을 어떻게 지킬까?',
      lead: '저어새와 철새가 쉬어 가려면 사람의 방해가 적은 넓은 갯벌이 필요해요.',
      options: [
        { who: 'scientist', quote: '해양보호구역으로 지정하면 매립을 법으로 막을 수 있어요.',
          label: '해양보호구역 지정', effect: '매립 개발 금지 · 관광 +1억/년 · 어업 수입 −15% · 지지도 −3',
          apply: function (s, A) { s.policies.protect = 'mpa'; A.support(s, -3); } },
        { who: 'grandma', quote: '우리 어촌계가 같이 지키면 되지. 캐는 시기랑 양을 우리가 정하자고.',
          label: '주민 공동관리(자율관리어업)', effect: '예산 −2억 · 어업 수입 +10% · 지지도 +5',
          long: '매립 개발은 여전히 할 수 있어요.',
          apply: function (s, A) { s.policies.protect = 'community'; A.budget(s, -2); A.support(s, 5); } },
        { who: 'ceo', quote: '규제가 늘면 투자가 끊깁니다.',
          label: '지정하지 않음', effect: '변화 없음' }
      ]
    },
    algae: {
      kind: 'council', title: '초록빛으로 변한 바다',
      lead: '장마 뒤에 밭과 논의 비료가 바다로 흘러들어 녹조가 생겼어요. 물이 탁하면 잘피가 햇빛을 받지 못해요.',
      options: [
        { who: 'mayor', quote: '농가에 친환경 비료와 완충 녹지를 지원합시다.',
          label: '친환경 농업 지원', effect: '예산 −3억 · 농경지 오염 절반 · 농업 수입 −10%',
          apply: function (s, A) { A.budget(s, -3); s.policies.ecoFarm = true; } },
        { who: 'scientist', quote: '마을 하수처리시설을 고치는 게 가장 확실해요.',
          label: '하수처리시설 개선', effect: '예산 −5억 · 수질 크게 개선(계속)',
          apply: function (s, A) { A.budget(s, -5); s.policies.sewage = true; } },
        { who: 'captain', quote: '비가 그치면 괜찮아지겠지.',
          label: '지켜보기', effect: '올해 수질 −8',
          apply: function (s) { s.wq = Math.max(0, s.wq - 8); } }
      ]
    },
    resort: {
      kind: 'council', title: '무인도 앞 리조트',
      lead: '바다 건너 무인도가 보이는 해안에 리조트를 짓자는 제안이 왔어요. 그 무인도는 저어새가 둥지를 트는 곳이에요.',
      options: [
        { who: 'ceo', quote: '전망이 최고입니다. 관광객이 몰려올 거예요.',
          label: '리조트 승인', effect: '예산 +10억 · 수입 +2억/년',
          long: '불빛과 소음 때문에 무인도의 저어새가 둥지를 떠나요.',
          apply: function (s, A) { A.developZone(s, 'resort', 'resort'); A.budget(s, 10); } },
        { who: 'student', quote: '새를 방해하지 않는 생태탐방센터는 어때요? 망원경으로 멀리서 보는 거예요.',
          label: '생태탐방센터로 대신하기', effect: '예산 −3억 · 관광 수입 +0.5억/년(생물이 많을수록 더)',
          apply: function (s, A) { A.budget(s, -3); s.policies.center = true; } },
        { who: 'scientist', quote: '번식지 근처 개발은 안 돼요.',
          label: '거절', effect: '지지도 −2',
          apply: function (s, A) { A.support(s, -2); } }
      ]
    },
    fund: {
      kind: 'news', title: '갯벌 탄소, 나라가 인정하다', tag: '가상 시나리오',
      lead: '정부가 식물이 없는 갯벌의 탄소 흡수량도 공식 통계에 넣기로 했다는 소식이에요. 지금은 염생식물이 자라는 연안습지만 국가 통계에 들어가 있어요. 마을이 지켜 온 블루카본을 어떻게 활용할까요?',
      options: [
        { who: 'mayor', quote: '생태계서비스 지불제에 참여합시다. 잘 관리한 만큼 지원금이 나와요.',
          label: '생태계서비스 지불제 참여', effect: '건강한 갯벌·염습지·잘피밭 1ha당 매년 0.05억 원',
          apply: function (s) { s.policies.fund = 'pes'; } },
        { who: 'ceo', quote: '우리 회사가 탄소 크레딧을 사겠습니다. 지금 바로 돈을 드리죠.',
          label: '탄소 크레딧 판매', effect: '예산 +6억',
          long: '판 흡수량은 회사의 몫이 돼요. 앞으로 마을 탄소중립 계산에서 흡수량의 절반이 빠져요(이중 계산 금지).',
          apply: function (s, A) { s.policies.fund = 'credit'; A.budget(s, 6); } },
        { who: 'student', quote: '돈보다 갯벌을 잘 지키는 게 먼저 아닐까요?',
          label: '그대로 두기', effect: '변화 없음' }
      ]
    },
    rooftop: {
      kind: 'council', title: '지붕 태양광 협동조합',
      lead: '주민들이 함께 돈을 모아 지붕과 주차장에 태양광을 올리자는 의견이 나왔어요.',
      options: [
        { who: 'student', quote: '갯벌이 아니라 지붕에 올리면 갯벌도 지키고 전기도 만들 수 있어요!',
          label: '협동조합 시작', effect: '예산 −4억 · 마을 배출 −15% · 수입 +0.5억/년',
          apply: function (s, A) { A.budget(s, -4); A.cut(s, 'rooftop', 0.15); } },
        { who: 'mayor', quote: '아직은 이른 것 같아요.',
          label: '보류', effect: '변화 없음' }
      ]
    },
    heatwave: {
      kind: 'disaster', title: '바다가 뜨거워졌어요', heat: true,
      lead: '여름 내내 바다 수온이 크게 올랐어요(해양 열파). 잘피밭이 스트레스를 받아요. 물이 맑을수록 잘 버텨요.',
      options: [{ label: '확인', effect: '연말에 잘피밭 건강도가 떨어져요' }]
    },
    school: {
      kind: 'council', title: '우리 학교 갯벌 수업',
      lead: '한별이 다니는 학교에서 해마다 갯벌 탐사 수업을 열고 싶어 해요.',
      options: [
        { who: 'student', quote: '친구들이랑 갯벌 생물도 조사하고 쓰레기도 치울게요!',
          label: '갯벌 학교 운영', effect: '예산 −1억 · 지지도 +6 · 쓰레기 줍기 비용 0원',
          apply: function (s, A) { A.budget(s, -1); A.support(s, 6); s.policies.school = true; } },
        { who: 'mayor', quote: '아이들 안전이 걱정이에요.',
          label: '보류', effect: '변화 없음' }
      ]
    },
    slr: {
      kind: 'council', title: '해수면이 오르고 있어요',
      lead: '해수면이 계속 오르고 있어요. 염습지는 육지 쪽으로 옮겨 가야 살아남는데 제방이 길을 막고 있어요. 이것을 ‘연안 압착’이라고 해요.',
      options: [
        { who: 'mayor', quote: '제방을 더 높고 튼튼하게 쌓읍시다.',
          label: '제방 높이기', effect: '예산 −6억 · 태풍 피해 −30%',
          long: '제방 바로 앞 염습지는 해마다 약해져요.',
          apply: function (s, A) { A.budget(s, -6); s.policies.slr = 'wall'; } },
        { who: 'scientist', quote: '바다에 길을 내주면 갯벌이 진흙을 쌓으며 스스로 따라 올라와요.',
          label: '관리된 후퇴', effect: '예산 −4억(보상금) · 남은 제방을 열고 맞닿은 간척지를 갯벌로 · 지지도 −4',
          apply: function (s, A) { A.budget(s, -4); A.retreat(s); s.policies.slr = 'retreat'; A.support(s, -4); } },
        { who: 'captain', quote: '당장 큰일은 없잖소.',
          label: '지켜보기', effect: '변화 없음' }
      ]
    },
    bus: {
      kind: 'council', title: '마을버스와 농기계 전기화',
      lead: '경유 마을버스와 낡은 농기계를 전기로 바꾸자는 계획이 나왔어요.',
      options: [
        { who: 'student', quote: '버스 기다릴 때 매연 냄새가 안 나면 좋겠어요.',
          label: '전기화 추진', effect: '예산 −3억 · 마을 배출 −8%',
          apply: function (s, A) { A.budget(s, -3); A.cut(s, 'bus', 0.08); } },
        { who: 'captain', quote: '나중에 해도 돼.',
          label: '나중에', effect: '변화 없음' }
      ]
    },
    typhoon3: {
      kind: 'disaster', title: '초강력 태풍 예보', typhoon: 3,
      lead: '아주 강한 태풍이 다가오고 있어요. 마을 앞 갯벌과 염습지가 얼마나 넓고 건강한지가 피해를 좌우해요.',
      options: [{ label: '대비할게요', effect: '연말에 태풍이 지나가요' }]
    },
    port: {
      kind: 'council', title: '신항만 건설 제안',
      lead: '큰 화물선이 드나드는 항만을 짓기 위해 앞바다 4ha를 메우자는 제안이 왔어요.',
      blockedBy: 'mpa',
      blockedLead: '앞바다를 메워 항만을 짓자는 제안이 있었지만, 해양보호구역이라서 제안이 철회됐어요. 보호구역 지정이 바다를 지켰어요.',
      options: [
        { who: 'ceo', quote: '물류 일자리가 생기고 마을이 커질 겁니다.',
          label: '찬성', effect: '예산 +12억 · 수입 +1.6억/년 · 지지도 +2',
          long: '얕은 바다와 잘피밭 4칸이 사라져요.',
          apply: function (s, A) { A.developZone(s, 'port', 'industry'); A.budget(s, 12); A.support(s, 2); } },
        { who: 'captain', quote: '잘피밭이 없어지면 물고기도 안 와.',
          label: '반대', effect: '지지도 −3',
          apply: function (s, A) { A.support(s, -3); } }
      ]
    },
    remodel: {
      kind: 'council', title: '집과 학교의 에너지 리모델링',
      lead: '오래된 집과 학교는 겨울에 열이 많이 새요. 단열 공사를 하면 에너지를 크게 아낄 수 있어요.',
      options: [
        { who: 'mayor', quote: '혼자 사는 어르신 집부터 지원합시다.',
          label: '리모델링 지원', effect: '예산 −4억 · 마을 배출 −12%',
          apply: function (s, A) { A.budget(s, -4); A.cut(s, 'remodel', 0.12); } },
        { who: 'ceo', quote: '돈이 너무 많이 들어요.',
          label: '보류', effect: '변화 없음' }
      ]
    },
    final: {
      kind: 'news', title: '2050년, 마지막 한 해',
      lead: '2050년이 밝았어요. 올해가 끝나면 마을 총회에서 25년의 결과를 함께 돌아봐요. 마지막으로 할 일을 마무리하세요.',
      options: [{ label: '마무리하러 가기', effect: '' }]
    },

    /* 무작위 소식 (수업 코드에 따라 순서가 정해짐) */
    migration: {
      kind: 'news', title: '철새가 돌아오는 계절', random: true,
      lead: '봄이 되자 먼 남쪽에서 도요새 무리가 날아왔어요. 넓고 깨끗한 갯벌이 있어야 쉬어 갈 수 있어요.',
      options: [{ label: '확인', effect: '큰뒷부리도요가 있으면 올해 관광 수입 +1억',
        apply: function (s) { s.flags.migrationYear = true; } }]
    },
    debrisWave: {
      kind: 'disaster', title: '떠밀려 온 쓰레기', random: true,
      lead: '큰비가 내린 뒤 강과 바다에서 쓰레기가 한꺼번에 떠밀려 왔어요.',
      options: [{ label: '확인', effect: '쓰레기 4곳이 늘어요',
        apply: function (s, A) { A.spawnDebris(s, 4); } }]
    },
    harvest: {
      kind: 'news', title: '바지락이 잘 자란 해', random: true,
      lead: '갯벌이 건강하고 물이 맑을수록 바지락이 잘 자라요. 올해 어촌계가 기대에 차 있어요.',
      options: [{ label: '좋아요', effect: '수질 55 이상이면 올해 어업 수입 +30%',
        apply: function (s) { s.flags.harvestYear = true; } }]
    },
    survey: {
      kind: 'news', title: '대학 연구팀의 갯벌 조사', random: true,
      lead: '연구팀이 갯벌 진흙을 1m 깊이까지 뚫어 기둥 모양으로 뽑아냈어요(코어 시료). 깊은 층에는 아주 오래전에 쌓인 탄소가 그대로 남아 있었어요.',
      options: [{ label: '확인', effect: '예산 +1억(연구 협력비)',
        apply: function (s, A) { A.budget(s, 1); } }]
    },
    smallTyphoon: {
      kind: 'disaster', title: '태풍 예보', random: true, typhoon: 1,
      lead: '중간 세기의 태풍이 올 것으로 보여요. 마을 앞 갯벌과 염습지가 파도를 막아 줄 거예요.',
      options: [{ label: '대비할게요', effect: '연말에 태풍이 지나가요' }]
    },
    redTide: {
      kind: 'disaster', title: '적조 발생', random: true,
      lead: '수온이 오르고 영양분이 넘치면서 적조가 생겼어요. 염습지가 넓으면 영양분을 걸러 피해를 줄여요.',
      options: [{ label: '확인', effect: '올해 수질이 떨어져요(염습지가 넓으면 덜)',
        apply: function (s, A) { A.redTide(s); } }]
    }
  };

  BV.SCHEDULE = {
    2026: 'start', 2027: 'ponds', 2028: 'industry', 2029: 'typhoon2', 2030: 'debris',
    2031: 'boats', 2032: 'protect', 2033: 'algae', 2034: 'resort', 2035: 'fund',
    2036: 'rooftop', 2037: 'heatwave', 2038: 'school', 2040: 'slr', 2042: 'bus',
    2044: 'typhoon3', 2046: 'port', 2048: 'remodel', 2050: 'final'
  };
  BV.RANDOM_POOL = ['migration', 'debrisWave', 'harvest', 'survey', 'smallTyphoon', 'redTide'];

  /* ---------- 엔딩 ---------- */
  BV.ENDINGS = {
    bluecarbon: {
      title: '블루카본 마을',
      summary: '갯벌을 되살리고 마을 배출을 줄여 2050년 마을 탄소중립을 이뤘어요. 생물과 주민이 함께 사는 바닷가가 되었어요.',
      real: '실제로 순천만은 폐염전과 새우 양식장을 연안습지로 되돌렸고, 저어새는 보호 노력으로 1990년대 수백 마리에서 2025년 약 7천 마리로 늘었어요. 복원과 보호는 실제로 효과가 있어요.',
      questions: [
        '탄소중립을 이루는 데 ‘배출 줄이기’와 ‘블루카본 늘리기’ 중 무엇이 더 큰 역할을 했나요? 마을 탭의 그래프로 확인해 보세요.',
        '우리나라 전체 배출량(연 약 6~7억 t)과 갯벌 흡수량(연 약 26만 t)을 비교하면 무엇을 알 수 있나요?',
        '우리 지역에서 비슷한 전환을 하려면 누구를 설득해야 할까요?'
      ]
    },
    revived: {
      title: '되살아난 갯벌, 남은 숙제',
      summary: '생물이 돌아오고 바닷가는 건강해졌지만 마을 배출이 흡수량보다 훨씬 많아요. 블루카본만으로는 탄소중립을 이룰 수 없어요.',
      real: '우리나라 갯벌 전체가 1년에 흡수하는 이산화탄소는 약 26만 t으로, 나라 전체 배출량의 0.1%도 되지 않아요. 갯벌은 지켜야 할 소중한 저장고이지만 배출을 줄이는 일이 먼저예요.',
      questions: [
        '흡수량을 늘리는 것과 배출을 줄이는 것 중 무엇이 더 어려웠나요? 왜 그랬을까요?',
        '마을 회의에서 에너지 전환 안건을 보류한 적이 있나요? 그때 무엇을 먼저 생각했나요?',
        '“나무나 갯벌을 늘리면 배출해도 괜찮다”는 주장에 어떻게 답할 수 있을까요?'
      ]
    },
    grey: {
      title: '회색 해안',
      summary: '매립과 개발로 당장 돈은 벌었지만 갯벌이 줄고 생물이 떠났어요. 메운 진흙에서는 오랫동안 탄소가 빠져나왔어요.',
      real: '우리나라 연안습지는 1987년 3,203㎢에서 2005년 2,550㎢로 약 20% 줄었어요. 새만금처럼 큰 간척 뒤에는 도요새와 짱뚱어가 크게 줄었다는 조사가 많아요.',
      questions: [
        '매립을 선택한 순간, 무엇을 얻고 무엇을 잃었나요? 잃은 것은 돈으로 계산할 수 있나요?',
        '쌓는 데 수백 년 걸린 탄소가 몇 년 만에 빠져나가는 것을 보고 어떤 생각이 들었나요?',
        '개발이 꼭 필요하다면 갯벌을 지키면서 할 방법은 없었을까요?'
      ]
    },
    neglect: {
      title: '지켜보기만 한 바다',
      summary: '큰 개발은 없었지만 쓰레기와 오염이 쌓이면서 생물이 하나둘 떠났어요. 아무것도 하지 않는 것도 하나의 선택이었어요.',
      real: '폐양식장과 폐염전처럼 버려진 땅은 그대로 두면 주변 갯벌까지 망가뜨려요. 그래서 해양수산부는 2010년부터 갯벌 복원 사업을 하고 있어요.',
      questions: [
        '아무 행동도 하지 않은 해에 바다에는 어떤 변화가 있었나요?',
        '쓰레기와 수질처럼 천천히 나빠지는 문제는 왜 알아차리기 어려울까요?',
        '지켜보기만 하는 것과 반대하는 것은 어떻게 다를까요?'
      ]
    },
    lonely: {
      title: '함께하지 못한 전환',
      summary: '바닷가를 바꾸려 애썼지만 주민들의 마음이 멀어졌어요. 생태전환은 혼자서가 아니라 함께해야 오래가요.',
      real: '갯벌을 함께 관리하는 어촌계의 자율관리어업처럼, 주민이 주인이 될 때 보호가 오래 지속돼요.',
      questions: [
        '주민 지지도가 떨어진 결정은 무엇이었나요? 그 결정을 다르게 설명할 수 있었을까요?',
        '어민, 기업, 연구자, 청소년의 생각이 다를 때 어떻게 합의할 수 있을까요?',
        '우리 학교나 동네에서 함께 시작할 수 있는 일은 무엇일까요?'
      ]
    },
    half: {
      title: '절반의 전환',
      summary: '바닷가와 마을 모두 조금씩 바뀌었지만 아직 갈 길이 남았어요. 다른 선택을 하면 결과가 어떻게 달라질까요?',
      real: '현실에서도 복원은 오래 걸리고, 결정은 늦어지기 쉬워요. 그래서 일찍 시작하는 것이 중요해요.',
      questions: [
        '가장 아쉬운 결정 하나를 고른다면 무엇인가요? 다시 한다면 어떻게 바꿀까요?',
        '생태계가 자라는 데 시간이 걸린다는 점이 전략에 어떤 영향을 주었나요?',
        '친구의 결과와 비교해 보세요. 가장 크게 다른 선택은 무엇이었나요?'
      ]
    }
  };

  /* ---------- 과학 노트 ---------- */
  BV.NOTES = [
    { title: '블루카본이 뭐예요?',
      body: '바닷가 생태계(염습지, 잘피밭, 맹그로브숲)가 흡수해서 진흙 속에 저장하는 탄소를 블루카본이라고 해요. 2009년 유엔환경계획(UNEP) 보고서로 널리 알려졌어요. IPCC가 공식 인정한 블루카본 생태계는 맹그로브, 염습지, 해초지(잘피밭) 세 가지예요.' },
    { title: '왜 진흙 속에 오래 남을까요?',
      body: '바닷물에 잠긴 진흙에는 산소가 거의 없어요. 산소가 없으면 미생물이 식물 찌꺼기를 아주 천천히 분해해요. 밀물이 실어 온 진흙이 그 위를 계속 덮어서, 탄소가 수백~수천 년 동안 갇혀 있을 수 있어요.' },
    { title: '숲과 비교하면요?',
      body: '나무 줄기에 쌓이는 탄소는 숲도 많아요. 하지만 흙 속에 묻히는 속도만 보면 염습지와 잘피밭이 육지 숲 토양보다 수십 배 빠르다는 연구가 있어요(McLeod 외, 2011). 바다 면적에서는 아주 작은 부분이지만, 바다 퇴적물에 묻히는 탄소의 절반 이상을 차지한다고 추정돼요.' },
    { title: '우리나라 갯벌',
      body: '서해와 남해의 갯벌은 세계적으로 손꼽히는 넓은 갯벌이에요. 2021년 ‘한국의 갯벌’(서천, 고창, 신안, 보성·순천)이 유네스코 세계자연유산이 되었어요. 우리 갯벌의 약 98%는 식물이 없는 갯벌이에요. 연구에 따르면 우리 갯벌은 약 1,300만 t의 탄소를 저장하고, 해마다 약 26만 t의 이산화탄소(승용차 약 11만 대의 배출량)를 흡수해요.' },
    { title: '국가 통계와 블루카본',
      body: '2022년부터 염생식물이 자라는 연안습지의 흡수량(2020년 기준 약 1.1만 t)이 국가 온실가스 통계에 들어갔어요. 미국, 호주에 이어 세 번째예요. 식물 없는 갯벌과 해조류(바다숲)는 아직 연구 중이고, 정부는 IPCC 인정 범위를 넓히려 노력하고 있어요.' },
    { title: '메우면 어떻게 될까요?',
      body: '갯벌을 메우거나 물을 빼면 진흙 속 탄소가 공기와 만나 이산화탄소로 빠져나가요(Pendleton 외, 2012). 우리나라 연안습지는 1987년 3,203㎢에서 2005년 2,550㎢로 약 20% 줄었어요. 게임에서는 메운 칸 저장량의 절반이 몇 년에 걸쳐 배출되도록 단순화했어요.' },
    { title: '갯벌이 주는 다른 선물',
      body: '갯벌과 염습지는 탄소만 저장하지 않아요. 조개와 물고기를 길러 주고, 오염 물질을 걸러 물을 맑게 하고, 태풍 때 파도의 힘을 줄여 마을을 지켜 줘요(Möller 외, 2014). 철새가 먼 길을 가다 쉬어 가는 곳이기도 해요. 이런 여러 혜택을 ‘공편익’이라고 해요.' },
    { title: '블루카본만으로 충분할까요?',
      body: '우리나라는 1년에 약 6~7억 t의 온실가스를 내보내요. 갯벌 전체의 흡수량(약 26만 t)은 그중 0.1%도 되지 않아요. 그래서 배출을 줄이는 것이 먼저이고, 블루카본은 망가뜨리지 말고 지켜야 할 저장고예요.' },
    { title: '게임 속 숫자 안내',
      body: '한 칸은 1ha(100m × 100m)예요. 다 자란 생태계의 연간 흡수량은 염습지 3.3, 잘피밭 1.6(IPCC 2013 습지 지침 기본값), 갯벌 1.0(우리나라 갯벌 연구값) tCO₂/ha로 정했어요. 마을 배출량, 예산, 생물이 나타나는 조건은 배우기 쉽게 만든 가상값이에요.' }
  ];

  /* ---------- 픽셀 스프라이트 (12 x 12) ---------- */
  BV.PALETTE = {
    k: '#1d1f22', w: '#f6f5ef', g: '#8e9499', G: '#5b6166', r: '#c8373f', R: '#8e1f35',
    p: '#e8909f', o: '#e08a2e', y: '#f2c94c', b: '#7a5a3e', B: '#3e2c20', t: '#c9ab7f',
    n: '#2f7d4f', N: '#1f5636', l: '#8bc06b', u: '#3a7fc1', U: '#24507e', c: '#9fd6e6',
    s: '#f1d2b6', S: '#d9a882', h: '#4a3426', m: '#a8977c', v: '#7b4f9e', e: '#e7e2d6'
  };

  BV.SPRITES = {
    worm: [
      '............', '........pp..', '.......pRpp.', '.......p..p.', '......pp....', '.....pRp....',
      '....pp......', '...pRp......', '..ppp.......', '.pkp........', '............', '............'],
    mudcrab: [
      '............', '..k......k..', '..g......g..', '...g....g...', '..gggggggg..', '.gGggggggGg.',
      '.gggggggggg.', '..gGggggGg..', '.g.g.gg.g.g.', 'g..g....g..g', '............', '............'],
    suaeda: [
      '............', '..r..r...r..', '..rr.r..rr..', '...rrr.rr...', '.r..rRrr..r.', '.rr..Rr..rr.',
      '..rrrRrrrr..', '....RRR.....', '.....R......', '.....R......', '...mmmmmm...', '............'],
    eelgrass: [
      '............', '..n.....n...', '..n..n..n...', '..nn.n.nn...', '...n.nn.n...', '...n.n..n.n.',
      '..nn.n.nn.n.', '..n..nn.n.n.', '..n..n..nnn.', '..nnnnnnn...', '.mmmmmmmmmm.', '............'],
    clam: [
      '............', '............', '....tttt....', '...tbtbtt...', '..ttbtbtbt..', '..tbtbtbtt..',
      '..ttbtbtbt..', '...tbtbtt...', '....tttt....', '............', '............', '............'],
    fiddler: [
      '............', '...k..k.....', '...b..b.....', '..bbbbbb....', '.bbbbbbbbrr.', '.bBbbbbbrrrr',
      '..bbbbbb.rrr', '.b.b..b.b...', 'b..b..b..b..', '............', '............', '............'],
    mudskipper: [
      '............', '...kk.......', '..kwwk......', '..bbbbb.....', '.bbubbbbbb..', '.bbbbbubbbbb',
      '..bbbbbbbbb.', '...t.....t..', '............', '............', '............', '............'],
    godwit: [
      '............', '....bb......', '...bkbb.....', 'k.ttbb......', '.kttt.......', '...ttbtb....',
      '...tbtbttt..', '....ttttt...', '.....S..S...', '.....S..S...', '............', '............'],
    seahorse: [
      '............', '.....oo.....', '....oooo....', '...oko.o....', '.....ooo....', '.....oo.....',
      '....ooo.....', '....ooo.....', '.....ooo....', '.......o....', '.....oo.....', '............'],
    whitecrab: [
      '............', '...k..k.....', '...t..t.....', '..tttttt....', '.tttttttttww', '.tbttttttwww',
      '..tttttt.www', '.t.t..t.t...', 't..t..t..t..', '............', '............', '............'],
    porpoise: [
      '............', '............', '....gggg....', '..gggggggg..', '.gkgggggggg.', '.ggggggggggg',
      '.wwgggggggg.', '..wwwwgggg.g', '....wwww..gg', '............', '............', '............'],
    spoonbill: [
      '............', '...ww.......', '..wkww......', '.kkkw.......', 'k..ww.......', 'kk.ww.......',
      '...wwww.....', '...wwwwww...', '....wwwww...', '.....k..k...', '.....k..k...', '............'],
    mayor: [
      '............', '...gggggg...', '..gggggggg..', '..gssssssg..', '..skkskks...', '..ssssssss..',
      '..ssskksss..', '...ssssss...', '....ssss....', '..uuuwwuuu..', '.uuuuwwuuuu.', '............'],
    captain: [
      '............', '...UUUUUU...', '..UUwwwwUU..', '.UUUUUUUUUU.', '...ssssss...', '...skssks...',
      '...ssssss...', '...hhhhhh...', '....hhhh....', '..wwuwwuww..', '.wwwwwwwwww.', '............'],
    grandma: [
      '............', '..pppppppp..', '.pppprpppp..', 'pppppppppppp', '...ssssss...', '...skssks...',
      '...ssssss...', '...sSkkSs...', '....ssss....', '..lllllll...', '.llllllllll.', '............'],
    scientist: [
      '............', '...yyyyyy...', '..yyyyyyyy..', '..yhhhhhhyyy', '..hssssssh..', '..skssssk...',
      '..ssssssss..', '...ssssss...', '....ssss....', '..ooowwooo..', '.oooowwoooo.', '............'],
    ceo: [
      '............', '...kkkkkk...', '..kkkkkkkk..', '..kssssssk..', '..sksssks...', '..ssssssss..',
      '...ssSSss...', '...ssssss...', '....ssss....', '..GGwrrwGG..', '.GGGwrrwGGG.', '............'],
    student: [
      '............', '...nnnnnn...', '..nnnnnnnn..', '..NNNNNNNN..', '..hssssssh..', '..skssssks..',
      '..ssssssss..', '...sspps....', '....ssss....', '..lllnnlll..', '.llllnnllll.', '............'],
    inspect: [
      '............', '...kkkk.....', '..kccccck...', '.kcwcccck...', '.kccccccck..', '.kccccccck..',
      '..kcccck....', '...kkkkkk...', '.......kkk..', '........kkk.', '.........kk.', '............'],
    marsh: [
      '............', '...r....r...', '..rr.r..rr..', '...r.rr.r...', '.r.rr.rrr.r.', '.rr.r.r.rr..',
      '..rrrRrrr...', '....RRR.....', '.mmmmmmmmmm.', '.mbmmmbmmmb.', '............', '............'],
    seagrass: [
      '............', '..n...n.....', '..nn..n..n..', '...n.nn..n..', '...n.n..nn..', '..nn.n..n...',
      '.ccccccccccc', 'cuuccuuccuuc', '.uuuuuuuuuu.', '.mmmmmmmmmm.', '............', '............'],
    cleanup: [
      '............', '.....kk.....', '....k..k....', '...GGGGGG...', '..GgggggGG..', '..GgwgggGG..',
      '..GggggwGG..', '..GgggggGG..', '...GGGGGG...', '............', '............', '............'],
    restore: [
      '............', '.........bb.', '........bb..', '.......bb...', '......bb....', '.....bb.....',
      '..ggGb......', '.ggggG......', '.gggGG......', '..gG........', '............', '............'],
    openwall: [
      '............', '............', '.GGG...GGGG.', '.gggcc.gggg.', '.GGGucuGGGG.', '.ggguucgggg.',
      '.GGGcuuGGGG.', '.cuucuucuuc.', '.uuuuuuuuuu.', '............', '............', '............'],
    boardwalk: [
      '............', '............', '..........bb', '........bbBb', '......bbBbb.', '....bbBbb...',
      '..bbBbb.....', 'bbBbb.......', '.b..b..b....', '.b..b..b....', '............', '............'],
    develop: [
      '............', '.yyyyyyyyy..', '.y......k...', '.y......k...', '.y.....GGG..', '.y.....GgG..',
      '.y...GGGgG..', '.y...GgGGG..', '.y...GgGgG..', 'GGGGGGGGGGGG', '............', '............']
  };
})(window.BV = window.BV || {});

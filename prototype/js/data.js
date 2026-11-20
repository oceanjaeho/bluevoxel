/*
 * 블루복셀: 갯벌마을 2050 — 게임 데이터 (v0.2)
 * 지도, 타일, 도구, 도감, 회의 카드, 미션, 업적, 엔딩, 과학 노트, 픽셀 스프라이트.
 * 수치 근거: docs/02-game-design.md
 */
(function (BV) {
  'use strict';

  BV.VERSION = '0.2.0';

  BV.CONFIG = {
    START_YEAR: 2026,
    END_YEAR: 2050,
    START_BUDGET: 10,
    START_SUPPORT: 55,
    START_WQ: 44,
    START_DEBRIS: 10,
    VILLAGE_EMISSION: 480,
    GRID_DECARB: 0.01,
    TIDE_MID: 2.35,
    TIDE_AMP: 0.95,
    TIDE_PERIOD: 26,
    SLR_PER_YEAR: 0.012,
    DEFAULT_CODE: 'MULTTAE'
  };

  BV.DIFFICULTY = {
    easy: { name: '쉬움', budget: 14, emission: 400, typhoon: 0.8, debris: 0, income: 1.15, sub: '예산 넉넉 · 배출 적음' },
    normal: { name: '보통', budget: 10, emission: 480, typhoon: 1, debris: 0, income: 1, sub: '추천' },
    hard: { name: '도전', budget: 8, emission: 560, typhoon: 1.3, debris: 1, income: 0.9, sub: '강한 태풍 · 배출 많음' }
  };

  /* ---------- 지도 (16 x 16, 1칸 = 1ha) ---------- */
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
  BV.ZONES = {
    industryA: [[11, 6], [12, 6], [13, 6], [11, 7], [12, 7], [11, 8]],
    industryC: [[12, 1], [13, 1], [12, 2], [13, 2]],
    resort: [[15, 3], [15, 4]],
    port: [[8, 13], [9, 13], [8, 14], [9, 14]]
  };
  BV.TIDAL = { sea: 1, shallow: 1, seagrass: 1, creek: 1, mudflat: 1, upper: 1, marsh: 1 };
  BV.ECO = { mudflat: 1, upper: 1, marsh: 1, seagrass: 1 };

  BV.TILES = {
    sea: { name: '깊은 바다', h: 0, zone: '조하대', desc: '늘 잠겨 있는 바다예요.' },
    shallow: { name: '얕은 바다', h: 1, zone: '조하대', desc: '햇빛이 바닥까지 닿아 잘피를 심을 수 있어요.' },
    seagrass: { name: '잘피밭', h: 1, zone: '조하대', desc: '바닷속에서 꽃 피는 식물. 뿌리 진흙에 탄소를 저장해요.' },
    creek: { name: '갯골', h: 1, zone: '갯벌 물길', desc: '밀물과 썰물이 드나드는 물길이에요.' },
    mudflat: { name: '갯벌', h: 2, zone: '조간대', desc: '밀물에 잠기고 썰물에 드러나요. 진흙에 탄소가 쌓여요.' },
    upper: { name: '상부 갯벌', h: 3, zone: '상부 조간대', desc: '큰 밀물 때만 잠겨요. 염생식물을 심을 수 있어요.' },
    marsh: { name: '염습지', h: 3, zone: '상부 조간대', desc: '산소가 적은 진흙 속에 탄소가 수백 년 쌓여요.' },
    field: { name: '간척 농지', h: 3, zone: '제방 안쪽', desc: '갯벌을 막아 만든 논. 탄소가 이미 많이 빠져나갔어요.' },
    pond: { name: '폐양식장', h: 3, zone: '제방 안쪽', desc: '고인 물이 바다를 탁하게 해요.' },
    wall: { name: '제방', h: 4, zone: '구조물', desc: '바닷물 흐름을 끊은 콘크리트 둑이에요.' },
    gate: { name: '배수갑문', h: 4, zone: '구조물', desc: '간척지의 물을 빼는 수문이에요.' },
    land: { name: '들판', h: 4, zone: '육지', desc: '마을 둘레 풀밭이에요.' },
    farm: { name: '비닐하우스', h: 4, zone: '육지', desc: '비가 오면 비료가 바다로 흘러가요.' },
    village: { name: '마을', h: 4, zone: '육지', desc: '태풍 때 앞바다 갯벌이 첫 번째 방패예요.' },
    port: { name: '포구', h: 4, zone: '육지', desc: '썰물이면 배가 갯벌 위에 내려앉아요.' },
    forest: { name: '솔숲', h: 5, zone: '육지', desc: '바닷바람을 막아 주는 숲이에요.' },
    hill: { name: '뒷산', h: 6, zone: '육지', desc: '마을 뒤 낮은 산이에요.' },
    island: { name: '무인도', h: 5, zone: '섬', desc: '저어새가 둥지를 트는 바위섬이에요.' },
    industry: { name: '산업단지', h: 4, zone: '매립지', desc: '메운 진흙에서 탄소가 빠져나가요.' },
    resort: { name: '리조트', h: 4, zone: '개발지', desc: '불빛과 소음이 새들을 방해해요.' },
    solar: { name: '태양광', h: 3, zone: '간척지', desc: '화석연료 사용을 줄여 줘요.' }
  };

  BV.TOOLS = [
    { id: 'inspect', name: '살펴보기', short: '보기', cost: 0, key: '1', icon: 'inspect', desc: '칸 정보 보기' },
    { id: 'marsh', name: '염생식물', short: '염생식물', cost: 2, key: '2', icon: 'marsh', desc: '상부 갯벌에 심기', target: '상부 갯벌' },
    { id: 'seagrass', name: '잘피', short: '잘피', cost: 3, key: '3', icon: 'seagrass', desc: '얕은 바다에 심기', target: '얕은 바다' },
    { id: 'cleanup', name: '쓰레기 줍기', short: '줍기', cost: 1, key: '4', icon: 'cleanup', desc: '쓰레기 치우기', target: '쓰레기 칸' },
    { id: 'restore', name: '갯벌 복원', short: '복원', cost: 4, key: '5', icon: 'restore', desc: '양식장·간척지를 갯벌로', target: '바다와 맞닿은 간척지' },
    { id: 'openwall', name: '제방 열기', short: '제방', cost: 5, key: '6', icon: 'openwall', desc: '바닷물 다시 흐르게', target: '제방' },
    { id: 'boardwalk', name: '탐방로', short: '탐방로', cost: 2, key: '7', icon: 'boardwalk', desc: '생태관광 수입', target: '이어진 갯벌' },
    { id: 'develop', name: '매립', short: '매립', cost: -5, key: '8', icon: 'develop', desc: '돈은 생기지만 탄소가 빠져나가요', target: '육지 옆 갯벌' }
  ];

  /* ---------- 생물 도감 ---------- */
  BV.SPECIES = [
    { id: 'worm', name: '갯지렁이', tag: '갯벌의 농부', habitat: '갯벌',
      fact: '굴을 파서 갯벌에 산소를 넣어요.', need: [['flats', 30]] },
    { id: 'mudcrab', name: '칠게', tag: '갯벌 청소부', habitat: '갯벌',
      fact: '진흙 속 찌꺼기를 걸러 먹어요.', need: [['flats', 40], ['debrisMax', 12]] },
    { id: 'suaeda', name: '칠면초', tag: '붉은 카펫', habitat: '염습지',
      fact: '계절 따라 초록에서 붉은 자줏빛으로 변해요.', need: [['marsh', 2]] },
    { id: 'eelgrass', name: '거머리말', tag: '꽃 피는 잘피', habitat: '얕은 바다',
      fact: '해조류가 아니라 꽃 피는 식물이에요.', need: [['seagrass', 2]] },
    { id: 'clam', name: '바지락', tag: '맨손어업의 보물', habitat: '갯벌',
      fact: '바닷물을 걸러 맑게 해요.', need: [['flats', 40], ['wq', 52]] },
    { id: 'fiddler', name: '농게', tag: '큰 집게발', habitat: '염습지 가장자리',
      fact: '수컷은 붉은 집게발 하나가 몸통만 해요.', need: [['marsh', 6], ['flats', 40]] },
    { id: 'mudskipper', name: '짱뚱어', tag: '뛰는 물고기', habitat: '진흙 갯벌',
      fact: '물 밖에서도 피부로 숨 쉬어요.', need: [['flats', 42], ['wq', 58], ['debrisMax', 5]] },
    { id: 'godwit', name: '큰뒷부리도요', tag: '대양 횡단 철새', habitat: '넓은 갯벌',
      fact: '알래스카로 가는 길에 서해 갯벌에서 쉬어 가요.', need: [['flats', 44], ['debrisMax', 4]] },
    { id: 'seahorse', name: '해마', tag: '잘피 숲 숨바꼭질', habitat: '무성한 잘피밭',
      fact: '꼬리로 잘피 잎을 감고 살아요.', need: [['seagrassMature', 4], ['wq', 62]] },
    { id: 'whitecrab', name: '흰발농게', tag: '멸종위기 Ⅱ급', habitat: '모래 갯벌',
      fact: '매립과 오염에 약해 법으로 보호해요.', need: [['flats', 42], ['marsh', 10], ['debrisMax', 2], ['devMax', 4]] },
    { id: 'porpoise', name: '상괭이', tag: '웃는 토종 돌고래', habitat: '서해·남해 연안',
      fact: '등지느러미가 없는 해양보호생물이에요.', need: [['seagrass', 10], ['wq', 70], ['debrisMax', 3]] },
    { id: 'spoonbill', name: '저어새', tag: '멸종위기 Ⅰ급', habitat: '갯벌 + 조용한 섬',
      fact: '수백 마리에서 약 7천 마리로 회복 중이에요.', need: [['flats', 42], ['marsh', 8], ['protect', 1], ['island', 1]] }
  ];

  BV.NEED_LABEL = {
    flats: '갯벌', marsh: '염습지', seagrass: '잘피밭', seagrassMature: '무성한 잘피',
    wq: '수질', debrisMax: '쓰레기', devMax: '개발지', protect: '보호 정책', island: '조용한 섬'
  };

  BV.PEOPLE = {
    mayor: { name: '정 이장', role: '이장' },
    captain: { name: '박 선장', role: '어민' },
    grandma: { name: '순자 할머니', role: '맨손어업 50년' },
    scientist: { name: '윤 연구원', role: '해양생태 연구원' },
    ceo: { name: '최 대표', role: '개발회사' },
    student: { name: '한별', role: '중학생' }
  };

  /* ---------- 회의·소식 카드 ----------
   * fx 칩: ['budget', ±억] ['yearly', '+n억/년'] ['support', ±] ['cut', %] ['wq', '+'/'−n']
   *        ['eco', 글] ['shield', 글] ['debris', 글] ['life', 글] ['tech', 글] ['warn', 글]
   * tag: eco / energy / people / dev / none (자동 플레이 성향)
   */
  BV.CARDS = {
    start: {
      kind: 'council', title: '생태전환위원회 첫 회의', lead: '청소년 위원으로서 첫 활동을 골라요.',
      options: [
        { who: 'grandma', quote: '쓰레기부터 치우자!', label: '해안 정화의 날', tag: 'eco',
          fx: [['debris', '쓰레기 −4'], ['support', 3], ['budget', -1]],
          apply: function (s, A) { A.clearDebris(s, 4); A.support(s, 3); A.budget(s, -1); } },
        { who: 'scientist', quote: '잘피 심는 법을 배워요.', label: '연구팀과 협력', tag: 'eco',
          fx: [['tech', '잘피 3억→2억'], ['budget', 1]],
          apply: function (s, A) { s.flags.seagrassTech = true; A.budget(s, 1); } },
        { who: 'mayor', quote: '주민 설명회부터!', label: '주민 설명회', tag: 'people',
          fx: [['support', 8]],
          apply: function (s, A) { A.support(s, 8); } }
      ]
    },
    ponds: {
      kind: 'council', title: '폐양식장, 어떻게 할까?', lead: '버려진 양식장 10곳이 바다를 탁하게 해요.',
      options: [
        { who: 'ceo', quote: '깨끗한 전기를 만들죠.', label: '태양광 발전소', tag: 'energy',
          fx: [['cut', 12], ['yearly', '+1억/년'], ['warn', '갯벌 복원 불가']],
          apply: function (s, A) { A.convertAll(s, 'pond', 'solar'); A.cut(s, 'pondSolar', 0.12); s.policies.pond = 'solar'; } },
        { who: 'scientist', quote: '원래 갯벌이었어요.', label: '갯벌 복원 계획', tag: 'eco',
          fx: [['eco', '복원비 4억→2억'], ['support', -2]],
          apply: function (s, A) { s.policies.pond = 'restore'; A.support(s, -2); } },
        { who: 'captain', quote: '일자리가 생기지.', label: '양식장 재가동', tag: 'dev',
          fx: [['yearly', '+1.5억/년'], ['support', 3], ['warn', '수질 ↓']],
          apply: function (s, A) { A.activatePonds(s); s.policies.pond = 'aqua'; A.support(s, 3); } }
      ]
    },
    industry: {
      kind: 'council', title: '산업단지 유치', lead: '갯벌 6ha를 메우면 일자리 200개가 생긴대요.',
      options: [
        { who: 'ceo', quote: '젊은이들이 남을 겁니다.', label: '갯벌 매립 찬성', tag: 'dev',
          fx: [['budget', 15], ['yearly', '+2.4억/년'], ['support', 4], ['warn', '갯벌 6칸 매립 · 탄소 배출']],
          apply: function (s, A) { A.developZone(s, 'industryA', 'industry'); A.budget(s, 15); A.support(s, 4); } },
        { who: 'grandma', quote: '메우면 다시는 못 돌려.', label: '반대', tag: 'eco',
          fx: [['support', -4]],
          apply: function (s, A) { A.support(s, -4); } },
        { who: 'student', quote: '이미 메운 땅에 지으면요?', label: '간척 농지에 짓기', tag: 'people',
          fx: [['budget', 6], ['yearly', '+1.6억/년'], ['eco', '갯벌 보전']],
          apply: function (s, A) { A.developZone(s, 'industryC', 'industry'); A.budget(s, 6); } }
      ]
    },
    typhoon2: {
      kind: 'disaster', title: '태풍이 온다', typhoon: 2, lead: '마을 앞 염습지가 파도를 막는 방패예요.',
      options: [{ label: '대비 완료', fx: [['shield', '연말에 태풍']] }]
    },
    debris: {
      kind: 'council', title: '하얗게 덮인 갯벌', lead: '부서진 스티로폼 부표가 쌓였어요.',
      options: [
        { who: 'captain', quote: '지원해 주면 바꾸지.', label: '친환경 부표 교체', tag: 'eco',
          fx: [['budget', -4], ['debris', '매년 쓰레기 ½']],
          apply: function (s, A) { A.budget(s, -4); s.policies.ecoBuoy = true; } },
        { who: 'grandma', quote: '다 같이 줍자고!', label: '정화의 날 정례화', tag: 'people',
          fx: [['budget', -1], ['debris', '쓰레기 −4'], ['support', 4]],
          apply: function (s, A) { A.budget(s, -1); A.clearDebris(s, 4); s.policies.cleanupDay = true; A.support(s, 4); } },
        { who: 'mayor', quote: '내년에 봅시다.', label: '보류', tag: 'none', fx: [] }
      ]
    },
    boats: {
      kind: 'council', title: '전기 어선', lead: '고깃배 연료가 마을의 큰 배출원이에요.',
      options: [
        { who: 'captain', quote: '기름값도 아끼고!', label: '어선 전환 지원', tag: 'energy',
          fx: [['budget', -5], ['cut', 10]],
          apply: function (s, A) { A.budget(s, -5); A.cut(s, 'boats', 0.10); } },
        { who: 'mayor', quote: '기술이 좋아지면요.', label: '나중에', tag: 'none', fx: [] }
      ]
    },
    protect: {
      kind: 'council', title: '갯벌 지키기', lead: '저어새는 넓고 조용한 갯벌이 필요해요.',
      options: [
        { who: 'scientist', quote: '법으로 지켜요.', label: '해양보호구역', tag: 'eco',
          fx: [['eco', '매립 금지'], ['yearly', '관광 +1억/년'], ['warn', '어업 −15%'], ['support', -3]],
          apply: function (s, A) { s.policies.protect = 'mpa'; A.support(s, -3); } },
        { who: 'grandma', quote: '우리가 같이 지키자.', label: '주민 공동관리', tag: 'people',
          fx: [['budget', -2], ['eco', '어업 +10%'], ['support', 5]],
          apply: function (s, A) { s.policies.protect = 'community'; A.budget(s, -2); A.support(s, 5); } },
        { who: 'ceo', quote: '투자가 끊깁니다.', label: '지정 안 함', tag: 'dev', fx: [] }
      ]
    },
    algae: {
      kind: 'council', title: '녹조 발생', lead: '비료가 흘러들어 바다가 탁해졌어요.',
      options: [
        { who: 'mayor', quote: '친환경 비료로!', label: '친환경 농업', tag: 'eco',
          fx: [['budget', -3], ['wq', '+'], ['warn', '농업 −10%']],
          apply: function (s, A) { A.budget(s, -3); s.policies.ecoFarm = true; } },
        { who: 'scientist', quote: '하수처리가 확실해요.', label: '하수처리 개선', tag: 'eco',
          fx: [['budget', -5], ['wq', '++']],
          apply: function (s, A) { A.budget(s, -5); s.policies.sewage = true; } },
        { who: 'captain', quote: '곧 괜찮아지겠지.', label: '지켜보기', tag: 'none',
          fx: [['wq', '−8']],
          apply: function (s) { s.wq = Math.max(0, s.wq - 8); } }
      ]
    },
    resort: {
      kind: 'council', title: '무인도 앞 리조트', lead: '저어새 번식지 앞에 리조트를 짓재요.',
      options: [
        { who: 'ceo', quote: '전망이 최고예요!', label: '리조트 승인', tag: 'dev',
          fx: [['budget', 10], ['yearly', '+2억/년'], ['warn', '저어새 번식 방해']],
          apply: function (s, A) { A.developZone(s, 'resort', 'resort'); A.budget(s, 10); } },
        { who: 'student', quote: '망원경으로 보면 돼요.', label: '생태탐방센터', tag: 'eco',
          fx: [['budget', -3], ['yearly', '관광 ↑']],
          apply: function (s, A) { A.budget(s, -3); s.policies.center = true; } },
        { who: 'scientist', quote: '번식지는 안 돼요.', label: '거절', tag: 'none',
          fx: [['support', -2]],
          apply: function (s, A) { A.support(s, -2); } }
      ]
    },
    fund: {
      kind: 'news', title: '갯벌 탄소, 나라가 인정', tag: '가상 시나리오', lead: '지켜 온 갯벌을 어떻게 활용할까요?',
      options: [
        { who: 'mayor', quote: '관리한 만큼 지원금!', label: '생태계서비스 지불제', tag: 'eco',
          fx: [['yearly', '건강한 1ha당 +0.03억/년']],
          apply: function (s) { s.policies.fund = 'pes'; } },
        { who: 'ceo', quote: '크레딧을 사겠습니다.', label: '탄소 크레딧 판매', tag: 'dev',
          fx: [['budget', 6], ['warn', '흡수량 절반은 기업 몫']],
          apply: function (s, A) { s.policies.fund = 'credit'; A.budget(s, 6); } },
        { who: 'student', quote: '지키는 게 먼저예요.', label: '그대로 두기', tag: 'none', fx: [] }
      ]
    },
    rooftop: {
      kind: 'council', title: '지붕 태양광', lead: '갯벌 대신 지붕에 태양광을 올리재요.',
      options: [
        { who: 'student', quote: '지붕에 올려요!', label: '협동조합 시작', tag: 'energy',
          fx: [['budget', -4], ['cut', 15], ['yearly', '+0.5억/년']],
          apply: function (s, A) { A.budget(s, -4); A.cut(s, 'rooftop', 0.15); } },
        { who: 'mayor', quote: '아직 이르다.', label: '보류', tag: 'none', fx: [] }
      ]
    },
    heatwave: {
      kind: 'disaster', title: '해양 열파', heat: true, lead: '바다가 뜨거워요. 물이 맑을수록 잘피가 버텨요.',
      options: [{ label: '확인', fx: [['warn', '연말에 잘피 피해']] }]
    },
    school: {
      kind: 'council', title: '갯벌 학교', lead: '학교에서 갯벌 탐사 수업을 열고 싶어요.',
      options: [
        { who: 'student', quote: '우리가 조사하고 치울게요!', label: '갯벌 학교 운영', tag: 'people',
          fx: [['budget', -1], ['support', 6], ['debris', '줍기 무료']],
          apply: function (s, A) { A.budget(s, -1); A.support(s, 6); s.policies.school = true; } },
        { who: 'mayor', quote: '안전이 걱정돼요.', label: '보류', tag: 'none', fx: [] }
      ]
    },
    slr: {
      kind: 'council', title: '해수면 상승', lead: '제방이 염습지의 갈 길을 막고 있어요(연안 압착).',
      options: [
        { who: 'mayor', quote: '제방을 높입시다.', label: '제방 높이기', tag: 'dev',
          fx: [['budget', -6], ['shield', '태풍 −30%'], ['warn', '제방 앞 염습지 약화']],
          apply: function (s, A) { A.budget(s, -6); s.policies.slr = 'wall'; } },
        { who: 'scientist', quote: '바다에 길을 내줘요.', label: '관리된 후퇴', tag: 'eco',
          fx: [['budget', -4], ['eco', '제방 개방 · 갯벌 복원'], ['support', -4]],
          apply: function (s, A) { A.budget(s, -4); A.retreat(s); s.policies.slr = 'retreat'; A.support(s, -4); } },
        { who: 'captain', quote: '당장은 괜찮소.', label: '지켜보기', tag: 'none', fx: [] }
      ]
    },
    bus: {
      kind: 'council', title: '마을버스 전기화', lead: '경유 버스와 농기계를 전기로 바꾸재요.',
      options: [
        { who: 'student', quote: '매연 없는 버스!', label: '전기화 추진', tag: 'energy',
          fx: [['budget', -3], ['cut', 8]],
          apply: function (s, A) { A.budget(s, -3); A.cut(s, 'bus', 0.08); } },
        { who: 'captain', quote: '나중에 해도 돼.', label: '나중에', tag: 'none', fx: [] }
      ]
    },
    typhoon3: {
      kind: 'disaster', title: '초강력 태풍', typhoon: 3, lead: '갯벌과 염습지가 넓을수록 마을이 안전해요.',
      options: [{ label: '대비 완료', fx: [['shield', '연말에 초강력 태풍']] }]
    },
    port: {
      kind: 'council', title: '신항만 건설', lead: '앞바다 4ha를 메워 항만을 짓재요.',
      blockedBy: 'mpa', blockedLead: '해양보호구역이라 제안이 철회됐어요!',
      options: [
        { who: 'ceo', quote: '물류 일자리!', label: '찬성', tag: 'dev',
          fx: [['budget', 12], ['yearly', '+1.6억/년'], ['support', 2], ['warn', '잘피밭 4칸 매립']],
          apply: function (s, A) { A.developZone(s, 'port', 'industry'); A.budget(s, 12); A.support(s, 2); } },
        { who: 'captain', quote: '잘피 없으면 고기도 없어.', label: '반대', tag: 'eco',
          fx: [['support', -3]],
          apply: function (s, A) { A.support(s, -3); } }
      ]
    },
    remodel: {
      kind: 'council', title: '에너지 리모델링', lead: '낡은 집과 학교에서 열이 새요.',
      options: [
        { who: 'mayor', quote: '어르신 집부터!', label: '리모델링 지원', tag: 'energy',
          fx: [['budget', -4], ['cut', 12]],
          apply: function (s, A) { A.budget(s, -4); A.cut(s, 'remodel', 0.12); } },
        { who: 'ceo', quote: '돈이 많이 들어요.', label: '보류', tag: 'none', fx: [] }
      ]
    },
    final: {
      kind: 'news', title: '마지막 한 해', lead: '올해가 끝나면 25년의 결과를 봐요.',
      options: [{ label: '마무리하기', fx: [] }]
    },
    migration: {
      kind: 'news', title: '철새 도래', random: true, lead: '도요새 무리가 쉬어 갈 갯벌을 찾아요.',
      options: [{ label: '확인', fx: [['life', '도요새가 있으면 관광 +1억']],
        apply: function (s) { s.flags.migrationYear = true; } }]
    },
    debrisWave: {
      kind: 'disaster', title: '쓰레기 유입', random: true, lead: '큰비 뒤 쓰레기가 밀려왔어요.',
      options: [{ label: '확인', fx: [['warn', '쓰레기 +4']],
        apply: function (s, A) { A.spawnDebris(s, 4); } }]
    },
    harvest: {
      kind: 'news', title: '바지락 풍년?', random: true, lead: '물이 맑으면 올해 어업 수입이 늘어요.',
      options: [{ label: '좋아요', fx: [['yearly', '수질 55↑면 어업 +30%']],
        apply: function (s) { s.flags.harvestYear = true; } }]
    },
    survey: {
      kind: 'news', title: '갯벌 코어 조사', random: true, lead: '1m 진흙 속에 오래된 탄소가 그대로 있었어요!',
      options: [{ label: '확인', fx: [['budget', 1]],
        apply: function (s, A) { A.budget(s, 1); } }]
    },
    smallTyphoon: {
      kind: 'disaster', title: '태풍 예보', random: true, typhoon: 1, lead: '중간 세기 태풍이 와요.',
      options: [{ label: '대비 완료', fx: [['shield', '연말에 태풍']] }]
    },
    redTide: {
      kind: 'disaster', title: '적조 발생', random: true, lead: '염습지가 넓으면 피해가 줄어요.',
      options: [{ label: '확인', fx: [['wq', '−4~8']],
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
  // 결과 코드에 담는 회의 순서 (바꾸면 코드 버전도 올려야 해요)
  BV.COUNCIL_ORDER = ['start', 'ponds', 'industry', 'debris', 'boats', 'protect', 'algae', 'resort', 'fund',
    'rooftop', 'school', 'slr', 'bus', 'port', 'remodel'];

  /* ---------- 미션 (3개씩 진행) ---------- */
  function act(id) { return function (s) { return s.stats.actions[id] || 0; }; }
  BV.MISSIONS = [
    { id: 'm_plant', icon: 'marsh', text: '염생식물 3칸 심기', goal: 3, metric: act('marsh'), reward: ['budget', 2] },
    { id: 'm_clean', icon: 'cleanup', text: '쓰레기 5곳 줍기', goal: 5, metric: act('cleanup'), reward: ['support', 3] },
    { id: 'm_wall', icon: 'openwall', text: '제방 1칸 열기', goal: 1, metric: act('openwall'), reward: ['budget', 3] },
    { id: 'm_grass', icon: 'seagrass', text: '잘피 3칸 심기', goal: 3, metric: act('seagrass'), reward: ['budget', 2] },
    { id: 'm_restore', icon: 'restore', text: '갯벌 4칸 복원', goal: 4, metric: act('restore'), reward: ['budget', 3] },
    { id: 'm_marsh', icon: 'suaeda', text: '염습지 10ha', goal: 10, metric: function (s, m) { return m.marsh; }, reward: ['budget', 4] },
    { id: 'm_wq', icon: 'i_drop', text: '수질 60', goal: 60, metric: function (s) { return Math.round(s.wq); }, reward: ['support', 4] },
    { id: 'm_walk', icon: 'boardwalk', text: '탐방로 2곳', goal: 2, metric: act('boardwalk'), reward: ['budget', 2] },
    { id: 'm_life8', icon: 'fiddler', text: '생물 8종 만나기', goal: 8, metric: function (s) { return s.present.length; }, reward: ['budget', 4] },
    { id: 'm_absorb', icon: 'i_leaf', text: '연간 흡수 150t', goal: 150, metric: function (s, m) { return Math.round(m.absorbRate); }, reward: ['support', 4] },
    { id: 'm_clean0', icon: 'i_trash', text: '쓰레기 0곳', goal: 1, metric: function (s, m) { return m.debris === 0 ? 1 : 0; }, reward: ['support', 4] },
    { id: 'm_neutral60', icon: 'i_cloud', text: '탄소중립 60%', goal: 60, metric: function (s, m) { return Math.round(m.neutrality * 100); }, reward: ['budget', 5] },
    { id: 'm_life11', icon: 'spoonbill', text: '생물 11종', goal: 11, metric: function (s) { return s.present.length; }, reward: ['budget', 5] },
    { id: 'm_neutral100', icon: 'i_cloud', text: '탄소중립 100%', goal: 100, metric: function (s, m) { return Math.round(m.neutrality * 100); }, reward: ['support', 6] }
  ];

  /* ---------- 업적 (기기에 저장) ---------- */
  BV.ACHIEVEMENTS = [
    { id: 'a_first', name: '첫 새싹', desc: '염생식물을 처음 심기', icon: 'marsh' },
    { id: 'a_wall', name: '물길을 열다', desc: '제방을 모두 열기', icon: 'openwall' },
    { id: 'a_clean', name: '깨끗한 갯벌', desc: '쓰레기 0곳 만들기', icon: 'cleanup' },
    { id: 'a_shield', name: '자연 방파제', desc: '태풍 피해 70% 이상 줄이기', icon: 'i_shield' },
    { id: 'a_spoonbill', name: '저어새의 귀환', desc: '저어새 만나기', icon: 'spoonbill' },
    { id: 'a_porpoise', name: '웃는 돌고래', desc: '상괭이 만나기', icon: 'porpoise' },
    { id: 'a_codex', name: '도감 완성', desc: '12종 모두 만나기', icon: 'seahorse' },
    { id: 'a_support', name: '모두의 마을', desc: '주민 지지도 80', icon: 'i_heart' },
    { id: 'a_neutral', name: '탄소중립 마을', desc: '2050년 탄소중립 100%', icon: 'i_cloud' },
    { id: 'a_nodev', name: '한 칸도 메우지 않았다', desc: '매립 없이 2050년', icon: 'i_leaf' },
    { id: 'a_hard', name: '도전 성공', desc: '도전 난이도 블루카본 마을', icon: 'i_star' },
    { id: 'a_endings', name: '여러 갈래 길', desc: '엔딩 3종 보기', icon: 'i_book' }
  ];

  /* ---------- 엔딩 ---------- */
  BV.ENDINGS = {
    bluecarbon: {
      title: '블루카본 마을', emblem: 'spoonbill',
      summary: '갯벌을 되살리고 배출을 줄여 탄소중립을 이뤘어요!',
      real: '순천만은 폐염전·양식장을 습지로 되돌렸고, 저어새는 약 7천 마리로 늘었어요.',
      questions: ['배출 줄이기와 블루카본 늘리기, 무엇이 더 큰 역할을 했나요?', '우리 지역에서 비슷한 전환을 하려면 누구를 설득해야 할까요?', '우리나라 배출(연 6~7억 t)과 갯벌 흡수(연 26만 t)를 비교해 보세요.']
    },
    revived: {
      title: '되살아난 갯벌, 남은 숙제', emblem: 'godwit',
      summary: '바닷가는 살아났지만 배출이 흡수보다 많아요.',
      real: '우리 갯벌 전체 흡수량은 나라 배출량의 0.1%도 되지 않아요. 감축이 먼저예요.',
      questions: ['흡수 늘리기와 배출 줄이기 중 무엇이 더 어려웠나요?', '에너지 전환 안건을 보류한 적이 있나요? 왜였나요?', '“갯벌을 늘리면 배출해도 된다”에 어떻게 답할까요?']
    },
    grey: {
      title: '회색 해안', emblem: 'develop',
      summary: '돈은 벌었지만 갯벌이 사라지고 생물이 떠났어요.',
      real: '우리 연안습지는 1987~2005년에 약 20% 줄었어요.',
      questions: ['매립으로 얻은 것과 잃은 것은 무엇인가요?', '수백 년 쌓인 탄소가 몇 년 만에 빠져나가는 걸 보고 어땠나요?', '갯벌을 지키면서 개발할 방법은 없었을까요?']
    },
    neglect: {
      title: '지켜보기만 한 바다', emblem: 'cleanup',
      summary: '쓰레기와 오염이 쌓이며 생물이 하나둘 떠났어요.',
      real: '버려진 양식장과 염전은 주변 갯벌까지 망가뜨려요. 그래서 복원 사업을 해요.',
      questions: ['아무것도 하지 않은 해에 바다는 어떻게 변했나요?', '천천히 나빠지는 문제는 왜 알아차리기 어려울까요?', '지켜보기와 반대하기는 어떻게 다를까요?']
    },
    lonely: {
      title: '함께하지 못한 전환', emblem: 'mayor',
      summary: '바닷가는 바뀌었지만 주민들의 마음이 멀어졌어요.',
      real: '어촌계의 자율관리어업처럼 주민이 주인이 될 때 보호가 오래가요.',
      questions: ['지지도가 떨어진 결정은 무엇이었나요?', '생각이 다른 사람들과 어떻게 합의할 수 있을까요?', '우리 학교에서 함께 시작할 일은 무엇일까요?']
    },
    half: {
      title: '절반의 전환', emblem: 'restore',
      summary: '조금씩 바뀌었지만 아직 갈 길이 남았어요.',
      real: '복원은 오래 걸려요. 그래서 일찍 시작하는 게 중요해요.',
      questions: ['가장 아쉬운 결정 하나는 무엇인가요?', '생태계가 자라는 시간이 전략에 어떤 영향을 줬나요?', '친구와 가장 다르게 고른 것은 무엇인가요?']
    }
  };

  /* ---------- 과학 노트 ---------- */
  BV.NOTES = [
    { title: '블루카본이란?', body: '바닷가 생태계가 흡수해 진흙 속에 저장하는 탄소예요. IPCC 공식 인정: 맹그로브·염습지·해초지.', src: 'UNEP 2009 · IPCC 2013' },
    { title: '왜 오래 남을까?', body: '물에 잠긴 진흙은 산소가 거의 없어 분해가 아주 느려요. 수백~수천 년 갇혀요.', src: 'McLeod 외 2011' },
    { title: '우리 갯벌', body: '약 1,300만 t 탄소 저장, 해마다 약 26만 tCO₂ 흡수(승용차 11만 대분). 2021년 세계유산.', src: '김종성 교수팀 2021' },
    { title: '국가 통계', body: '2022년부터 염생식물 습지 흡수량(1.1만 t)을 반영. 식물 없는 갯벌은 연구 중이에요.', src: '해양수산부 2022' },
    { title: '메우면?', body: '진흙 속 탄소가 공기와 만나 배출돼요. 연안습지는 1987~2005년 약 20% 줄었어요.', src: 'Pendleton 외 2012 · 국토부' },
    { title: '감축이 먼저', body: '갯벌 전체 흡수량은 나라 배출(연 6~7억 t)의 0.1%도 안 돼요.', src: '온실가스 통계' },
    { title: '게임 숫자', body: '1칸 = 1ha. 흡수: 염습지 3.3 · 잘피 1.6 · 갯벌 1.0 tCO₂/년. 마을 배출·예산은 가상값.', src: 'IPCC 기본값 · 국내 연구' }
  ];

  /* ---------- 픽셀 스프라이트 (12 x 12) ---------- */
  BV.PALETTE = {
    k: '#1d1f22', w: '#f6f5ef', g: '#8e9499', G: '#5b6166', r: '#c8373f', R: '#8e1f35',
    p: '#e8909f', o: '#e08a2e', y: '#f2c94c', b: '#7a5a3e', B: '#3e2c20', t: '#c9ab7f',
    n: '#2f7d4f', N: '#1f5636', l: '#8bc06b', u: '#3a7fc1', U: '#24507e', c: '#9fd6e6',
    s: '#f1d2b6', S: '#d9a882', h: '#4a3426', m: '#a8977c', v: '#7b4f9e', e: '#e7e2d6'
  };

  BV.SPRITES = {
    worm: ['............', '........pp..', '.......pRpp.', '.......p..p.', '......pp....', '.....pRp....', '....pp......', '...pRp......', '..ppp.......', '.pkp........', '............', '............'],
    mudcrab: ['............', '..k......k..', '..g......g..', '...g....g...', '..gggggggg..', '.gGggggggGg.', '.gggggggggg.', '..gGggggGg..', '.g.g.gg.g.g.', 'g..g....g..g', '............', '............'],
    suaeda: ['............', '..r..r...r..', '..rr.r..rr..', '...rrr.rr...', '.r..rRrr..r.', '.rr..Rr..rr.', '..rrrRrrrr..', '....RRR.....', '.....R......', '.....R......', '...mmmmmm...', '............'],
    eelgrass: ['............', '..n.....n...', '..n..n..n...', '..nn.n.nn...', '...n.nn.n...', '...n.n..n.n.', '..nn.n.nn.n.', '..n..nn.n.n.', '..n..n..nnn.', '..nnnnnnn...', '.mmmmmmmmmm.', '............'],
    clam: ['............', '............', '....tttt....', '...tbtbtt...', '..ttbtbtbt..', '..tbtbtbtt..', '..ttbtbtbt..', '...tbtbtt...', '....tttt....', '............', '............', '............'],
    fiddler: ['............', '...k..k.....', '...b..b.....', '..bbbbbb....', '.bbbbbbbbrr.', '.bBbbbbbrrrr', '..bbbbbb.rrr', '.b.b..b.b...', 'b..b..b..b..', '............', '............', '............'],
    mudskipper: ['............', '...kk.......', '..kwwk......', '..bbbbb.....', '.bbubbbbbb..', '.bbbbbubbbbb', '..bbbbbbbbb.', '...t.....t..', '............', '............', '............', '............'],
    godwit: ['............', '....bb......', '...bkbb.....', 'k.ttbb......', '.kttt.......', '...ttbtb....', '...tbtbttt..', '....ttttt...', '.....S..S...', '.....S..S...', '............', '............'],
    seahorse: ['............', '.....oo.....', '....oooo....', '...oko.o....', '.....ooo....', '.....oo.....', '....ooo.....', '....ooo.....', '.....ooo....', '.......o....', '.....oo.....', '............'],
    whitecrab: ['............', '...k..k.....', '...t..t.....', '..tttttt....', '.tttttttttww', '.tbttttttwww', '..tttttt.www', '.t.t..t.t...', 't..t..t..t..', '............', '............', '............'],
    porpoise: ['............', '............', '....gggg....', '..gggggggg..', '.gkgggggggg.', '.ggggggggggg', '.wwgggggggg.', '..wwwwgggg.g', '....wwww..gg', '............', '............', '............'],
    spoonbill: ['............', '...ww.......', '..wkww......', '.kkkw.......', 'k..ww.......', 'kk.ww.......', '...wwww.....', '...wwwwww...', '....wwwww...', '.....k..k...', '.....k..k...', '............'],
    mayor: ['............', '...gggggg...', '..gggggggg..', '..gssssssg..', '..skkskks...', '..ssssssss..', '..ssskksss..', '...ssssss...', '....ssss....', '..uuuwwuuu..', '.uuuuwwuuuu.', '............'],
    captain: ['............', '...UUUUUU...', '..UUwwwwUU..', '.UUUUUUUUUU.', '...ssssss...', '...skssks...', '...ssssss...', '...hhhhhh...', '....hhhh....', '..wwuwwuww..', '.wwwwwwwwww.', '............'],
    grandma: ['............', '..pppppppp..', '.pppprpppp..', 'pppppppppppp', '...ssssss...', '...skssks...', '...ssssss...', '...sSkkSs...', '....ssss....', '..lllllll...', '.llllllllll.', '............'],
    scientist: ['............', '...yyyyyy...', '..yyyyyyyy..', '..yhhhhhhyyy', '..hssssssh..', '..skssssk...', '..ssssssss..', '...ssssss...', '....ssss....', '..ooowwooo..', '.oooowwoooo.', '............'],
    ceo: ['............', '...kkkkkk...', '..kkkkkkkk..', '..kssssssk..', '..sksssks...', '..ssssssss..', '...ssSSss...', '...ssssss...', '....ssss....', '..GGwrrwGG..', '.GGGwrrwGGG.', '............'],
    student: ['............', '...nnnnnn...', '..nnnnnnnn..', '..NNNNNNNN..', '..hssssssh..', '..skssssks..', '..ssssssss..', '...sspps....', '....ssss....', '..lllnnlll..', '.llllnnllll.', '............'],
    inspect: ['............', '...kkkk.....', '..kccccck...', '.kcwcccck...', '.kccccccck..', '.kccccccck..', '..kcccck....', '...kkkkkk...', '.......kkk..', '........kkk.', '.........kk.', '............'],
    marsh: ['............', '...r....r...', '..rr.r..rr..', '...r.rr.r...', '.r.rr.rrr.r.', '.rr.r.r.rr..', '..rrrRrrr...', '....RRR.....', '.mmmmmmmmmm.', '.mbmmmbmmmb.', '............', '............'],
    seagrass: ['............', '..n...n.....', '..nn..n..n..', '...n.nn..n..', '...n.n..nn..', '..nn.n..n...', '.ccccccccccc', 'cuuccuuccuuc', '.uuuuuuuuuu.', '.mmmmmmmmmm.', '............', '............'],
    cleanup: ['............', '.....kk.....', '....k..k....', '...GGGGGG...', '..GgggggGG..', '..GgwgggGG..', '..GggggwGG..', '..GgggggGG..', '...GGGGGG...', '............', '............', '............'],
    restore: ['............', '.........bb.', '........bb..', '.......bb...', '......bb....', '.....bb.....', '..ggGb......', '.ggggG......', '.gggGG......', '..gG........', '............', '............'],
    openwall: ['............', '............', '.GGG...GGGG.', '.gggcc.gggg.', '.GGGucuGGGG.', '.ggguucgggg.', '.GGGcuuGGGG.', '.cuucuucuuc.', '.uuuuuuuuuu.', '............', '............', '............'],
    boardwalk: ['............', '............', '..........bb', '........bbBb', '......bbBbb.', '....bbBbb...', '..bbBbb.....', 'bbBbb.......', '.b..b..b....', '.b..b..b....', '............', '............'],
    develop: ['............', '.yyyyyyyyy..', '.y......k...', '.y......k...', '.y.....GGG..', '.y.....GgG..', '.y...GGGgG..', '.y...GgGGG..', '.y...GgGgG..', 'GGGGGGGGGGGG', '............', '............'],
    i_coin: ['............', '....yyyy....', '...yooooy...', '..yoyyyyoy..', '..yoyooyoy..', '..yoyooyoy..', '..yoyooyoy..', '..yoyyyyoy..', '...yooooy...', '....yyyy....', '............', '............'],
    i_heart: ['............', '............', '..rr....rr..', '.rrrr..rrrr.', '.rwrrrrrrrr.', '.rrrrrrrrrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....rr.....', '............', '............'],
    i_cloud: ['............', '............', '.....GG.....', '....GggG.GG.', '..GGgggGGggG', '.GgggggggggG', '.GgggggggggG', '..GGGGGGGGG.', '............', '..k..k..k...', '.k..k..k....', '............'],
    i_drop: ['............', '.....u......', '....uu......', '....uuu.....', '...uuuuu....', '...ucuuu....', '..uucuuuu...', '..uucuuuu...', '..uuuuuuu...', '...uuuuu....', '....uuu.....', '............'],
    i_leaf: ['............', '.........nn.', '.......nnnn.', '.....nnnnln.', '....nnnnlnn.', '...nnnnlnnn.', '...nnnlnnn..', '..nnnlnnn...', '..nnlnnn....', '.n.nnn......', 'n...........', '............'],
    i_warn: ['............', '.....yy.....', '....yyyy....', '....ykky....', '...yykkyy...', '...yykkyy...', '..yyykkyyy..', '..yyyyyyyy..', '.yyyykkyyyy.', '.yyyyyyyyyy.', '............', '............'],
    i_shield: ['............', '..uuuuuuuu..', '..ucccccuu..', '..ucccccuu..', '..ucccccuu..', '..ucccccuu..', '...uccccu...', '...uccccu...', '....uccu....', '.....uu.....', '............', '............'],
    i_bird: ['............', '............', '.......kk...', '......kwwk..', '..kkkkwwwwyy', '.kwwwwwwwk..', '..kwwwwwk...', '...kkkkk....', '....k..k....', '............', '............', '............'],
    i_tool: ['............', '.......gg...', '......g..g..', '......g.gg..', '.....ggg....', '....ggg.....', '...ggg......', '..ggg.......', '.gGg........', '.Gg.........', '............', '............'],
    i_trash: ['............', '....GGGG....', '..GGGGGGGG..', '...gggggg...', '...gGggGg...', '...gGggGg...', '...gGggGg...', '...gGggGg...', '...gggggg...', '....gggg....', '............', '............'],
    i_star: ['............', '.....yy.....', '.....yy.....', '....yyyy....', 'yyyyyyyyyyyy', '.yyyyyyyyyy.', '..yyyyyyyy..', '..yyyyyyyy..', '.yyyy..yyyy.', '.yy......yy.', '............', '............'],
    i_book: ['............', '.uuuuu.uuuu.', '.uwwwu.uwwu.', '.uwwwu.uwwu.', '.uwwwu.uwwu.', '.uwwwu.uwwu.', '.uwwwu.uwwu.', '.uuuuuuuuuu.', '..UUUUUUUU..', '............', '............', '............'],
    i_lock: ['............', '....gggg....', '...g....g...', '...g....g...', '..GGGGGGGG..', '..GggggggG..', '..Gggkk.gG..', '..GgggkggG..', '..GggggggG..', '..GGGGGGGG..', '............', '............']
  };
})(window.BV = window.BV || {});

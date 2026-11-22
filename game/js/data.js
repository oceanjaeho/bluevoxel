// 갯벌 수호대 — 게임 데이터 (수치·생물·오염 몬스터·스테이지·상점·도감)
(function (root) {
  'use strict';
  const GS = root.GS;

  const C = GS.CONFIG = {
    T: 32, MAP_W: 60, MAP_H: 60,
    VIEW_AREA: 660 * 660,          // 화면에 보이는 월드 넓이(px²) — 기기와 상관없이 비슷하게
    DT: 1 / 60,
    PLAYER: { hp: 100, speed: 122, r: 11, magnet: 58, inv: 0.5 },
    MAX_W: 6, MAX_P: 6, MAX_LV: 5,
    ENEMY_CAP: 260, GEM_CAP: 300,
    CRIT: 0.06, CRIT_MUL: 2,
    MARSH_REGEN: 2.2,              // 복원된 염습지·잘피 위에서 초당 회복
    MARSH_HASTE: 1.2,              // 초록 갯벌 위에서 공격이 빨라지는 배율
    MARSH_SLOW: 0.8,               // 초록 갯벌 위에서 몬스터가 느려지는 배율
    EMERGE: 0.35,                  // 화면 안 회색 땅에서 솟아나는 몬스터 비율
    PROPS: 14, PROP_MAX: 16, PROP_EVERY: 22,
    GROW_MIN: 4, GROW_MAX: 9,      // 갯벌 → 염습지로 자라는 시간(초)
    RESTORE_R: 30,                 // 처치 지점 복원 반경(px) — 몬스터 크기만큼 더해져요
  };

  // 타일
  const TILE = GS.TILE = { SEA: 0, CREEK: 1, DIRTY: 2, MUD: 3, MARSH: 4, POOL: 5, CONCRETE: 6 };
  GS.TILE_H = [-7, -3, 0, 0, 3, -3, 7];        // 타일 높이(px)
  GS.TILE_SLOW = [0.7, 0.78, 1, 1, 1, 0.9, 1]; // 이동 속도 배율
  GS.isClean = t => t === TILE.MUD || t === TILE.MARSH || t === TILE.POOL;

  // ── 캐릭터 ──────────────────────────────────────────────
  const CHARS = [
    { id: 'crab', name: '칠게', weapon: 'claw', hp: 110, speed: 1.0, armor: 1, tag: '단단해요',
      unlock: null },
    { id: 'seal', name: '점박이물범', weapon: 'ball', hp: 118, speed: 1.0, tag: '통통 튀는 공',
      unlock: { kind: 'runs', v: 1, text: '한 판 하기' } },
    { id: 'spoonbill', name: '저어새', weapon: 'sweep', hp: 108, speed: 1.12, tag: '빨라요',
      unlock: { kind: 'time', v: 180, text: '3분 버티기' } },
    { id: 'mudskipper', name: '짱뚱어', weapon: 'jump', hp: 100, speed: 1.0, area: 1.12, tag: '범위가 넓어요',
      unlock: { kind: 'kills', v: 5000, text: '누적 5,000 처치' } },
    { id: 'porpoise', name: '상괭이', weapon: 'wave', hp: 100, speed: 1.05, magnet: 1.4, tag: '잘 끌어당겨요',
      unlock: { kind: 'clear', v: 2, text: '바다숲 스테이지 클리어' } },
  ];

  // ── 무기(함께 싸우는 생물) ────────────────────────────────
  // lv: 1~5단계 능력치(앞 단계에 덮어써요), evo: 진화
  const WEAPONS = {
    claw: { name: '칠게 집게', kind: 'orbit', model: 'crab', pair: 'oyster',
      lv: [{ n: 2, dmg: 10, rad: 54, spd: 3.0, size: 11, hit: 0.45, kb: 70 },
           { n: 3 }, { dmg: 13, rad: 56, spd: 3.3 }, { n: 4 }, { n: 5, dmg: 17, spd: 3.8, rad: 60 }],
      d: ['주위를 도는 칠게', '칠게 +1', '공격 ↑ 반경 ↑', '칠게 +1', '칠게 +1 · 빠르게'],
      evo: { name: '칠게 대군', n: 7, dmg: 24, rad: 64, spd: 4.2, size: 14, hit: 0.33, kb: 120, pulse: true, d: '칠게 7마리가 크게 휘몰아쳐요' } },
    jet: { name: '바지락 물총', kind: 'shoot', model: 'clam', pair: 'flow', follower: true,
      lv: [{ cd: 1.0, dmg: 12, spd: 420, pierce: 1, n: 1, size: 5, life: 1.0 },
           { n: 2 }, { dmg: 17 }, { pierce: 2, cd: 0.85 }, { n: 3, dmg: 21 }],
      d: ['가까운 적에게 물총', '물줄기 +1', '공격 ↑', '관통 ↑ 빠르게', '물줄기 +1 · 공격 ↑'],
      evo: { name: '바지락 분수', cd: 0.14, n: 1, dmg: 16, pierce: 4, spd: 560, size: 6, life: 0.9, stream: true, d: '물줄기가 끊임없이 쏟아져요' } },
    grass: { name: '잘피 숲', kind: 'aura', model: 'seagrass', pair: 'reed',
      lv: [{ rad: 54, dmg: 6, tick: 0.5, slow: 0.25 },
           { rad: 62 }, { dmg: 9 }, { rad: 70, slow: 0.32 }, { dmg: 12, tick: 0.4 }],
      d: ['주변 적을 느리게', '범위 ↑', '공격 ↑', '범위 ↑ 더 느리게', '공격 ↑ 빠르게'],
      evo: { name: '바다숲', rad: 96, dmg: 15, tick: 0.35, slow: 0.45, heal: 0.35, d: '넓은 숲이 나를 치유해요' } },
    jump: { name: '짱뚱어 점프', kind: 'lob', model: 'mudskipper', pair: 'sun', follower: true,
      lv: [{ cd: 2.1, n: 1, dmg: 26, area: 42, range: 240, flight: 0.55 },
           { n: 2 }, { dmg: 36 }, { n: 3, area: 50 }, { cd: 1.7, dmg: 46 }],
      d: ['적에게 뛰어들어 쾅', '짱뚱어 +1', '공격 ↑', '짱뚱어 +1 · 범위 ↑', '빠르게 · 공격 ↑'],
      evo: { name: '짱뚱어 폭격', cd: 1.2, n: 5, dmg: 55, area: 62, range: 290, flight: 0.5, puddle: true, d: '다섯 마리가 진흙 폭탄을 터뜨려요' } },
    sweep: { name: '저어새 부리', kind: 'arc', model: 'spoonbill', pair: 'current',
      lv: [{ cd: 1.05, dmg: 21, w: 122, h: 52, both: false, kb: 90 },
           { both: true }, { dmg: 29 }, { w: 150, h: 62 }, { cd: 0.85, dmg: 36 }],
      d: ['앞쪽을 휩쓸어요', '앞뒤로 휩쓸기', '공격 ↑', '범위 ↑', '빠르게 · 공격 ↑'],
      evo: { name: '저어새 군무', cd: 0.8, dmg: 40, w: 176, h: 74, both: true, kb: 150, birds: 2, d: '저어새 떼가 함께 날아요' } },
    wave: { name: '상괭이 물결', kind: 'dash', model: 'porpoise', pair: 'plankton', follower: true,
      lv: [{ cd: 2.5, n: 1, dmg: 26, spd: 440, dist: 380, size: 16 },
           { n: 2 }, { dmg: 36 }, { size: 21, dist: 460 }, { n: 3, cd: 2.1 }],
      d: ['돌아오는 상괭이', '상괭이 +1', '공격 ↑', '크게 · 멀리', '상괭이 +1 · 빠르게'],
      evo: { name: '상괭이 떼', cd: 1.7, n: 6, dmg: 46, spd: 480, dist: 460, size: 22, ring: true, d: '여섯 마리가 사방으로 헤엄쳐요' } },
    worm: { name: '갯지렁이 함정', kind: 'mine', model: 'lugworm', pair: 'mud', follower: true,
      lv: [{ cd: 1.3, n: 1, dmg: 34, area: 46, life: 9, trig: 22 },
           { n: 2 }, { dmg: 48 }, { area: 56 }, { cd: 0.95, dmg: 60 }],
      d: ['밟으면 펑! 터지는 굴', '함정 +1', '공격 ↑', '범위 ↑', '빠르게 · 공격 ↑'],
      evo: { name: '갯벌 대폭발', cd: 0.75, n: 2, dmg: 72, area: 66, life: 10, trig: 26, chain: true, d: '터지면 옆 함정도 연쇄 폭발' } },
    tide: { name: '밀물', kind: 'nova', model: 'tidewave', pair: 'nutrient',
      lv: [{ cd: 8.5, dmg: 24, rad: 210, push: 280 },
           { dmg: 34 }, { cd: 7.2 }, { rad: 260 }, { dmg: 48, cd: 6.2 }],
      d: ['큰 물결로 밀어내요', '공격 ↑', '더 자주', '범위 ↑', '공격 ↑ · 더 자주'],
      evo: { name: '대조기', cd: 4.5, dmg: 62, rad: 320, push: 340, double: true, d: '물결이 두 번 몰아쳐요' } },
  };

  Object.assign(WEAPONS, {
    ball: { name: '물범 공', kind: 'bounce', model: 'ball', pair: 'moon',
      lv: [{ cd: 1.5, n: 1, dmg: 14, bounces: 3, spd: 420, size: 8, range: 230 },
           { bounces: 4 }, { n: 2 }, { dmg: 20, bounces: 5 }, { n: 3, cd: 1.25 }],
      d: ['적 사이를 통통 튀는 공', '튕기기 +1', '공 +1', '공격 ↑ · 튕기기 +1', '공 +1 · 빠르게'],
      evo: { name: '보름달 공', cd: 1.0, n: 3, dmg: 26, bounces: 8, spd: 480, size: 11, burst: true, range: 260, d: '튕길 때마다 펑! 아홉 번 튀어요' } },
    bubble: { name: '해마 거품', kind: 'homing', model: 'seahorse', pair: 'coral', follower: true,
      lv: [{ cd: 1.2, n: 2, dmg: 10, spd: 200, turn: 5, area: 22, life: 3.2 },
           { n: 3 }, { dmg: 14 }, { n: 4, area: 28 }, { cd: 0.92, dmg: 18 }],
      d: ['적을 따라가는 거품', '거품 +1', '공격 ↑', '거품 +1 · 범위 ↑', '빠르게 · 공격 ↑'],
      evo: { name: '거품 폭풍', cd: 0.55, n: 5, dmg: 22, spd: 260, turn: 7, area: 34, life: 3.6, d: '거품이 폭풍처럼 쏟아져요' } },
    ink: { name: '낙지 먹물', kind: 'cloud', model: 'nakji', pair: 'kelp', follower: true,
      lv: [{ cd: 2.9, n: 1, dmg: 8, rad: 52, life: 3, tick: 0.4, slow: 0.4 },
           { n: 2 }, { dmg: 11, rad: 60 }, { life: 4 }, { n: 3, cd: 2.3 }],
      d: ['느려지는 먹물 구름', '구름 +1', '공격 ↑ · 범위 ↑', '오래 남아요', '구름 +1 · 빠르게'],
      evo: { name: '먹물 소용돌이', cd: 1.7, n: 3, dmg: 16, rad: 82, life: 4.5, tick: 0.35, slow: 0.55, pull: true, d: '적을 빨아들이는 소용돌이' } },
  });

  // ── 패시브(갯벌의 힘) ─────────────────────────────────────
  const PASSIVES = {
    mud:      { name: '갯벌 진흙', model: 'mudblock', d: '최대 체력 +15%', stat: 'hp', v: 0.15 },
    reed:     { name: '칠면초',   model: 'reed',     d: '초당 회복 +0.3', stat: 'regen', v: 0.3 },
    current:  { name: '조류',     model: 'current',  d: '이동 속도 +8%', stat: 'speed', v: 0.08 },
    plankton: { name: '플랑크톤', model: 'plankton', d: '끌어당기기 +25%', stat: 'magnet', v: 0.25 },
    sun:      { name: '햇살',     model: 'sun',      d: '공격 간격 -7%', stat: 'cd', v: 0.07 },
    flow:     { name: '해류',     model: 'flow',     d: '범위·속도 +8%', stat: 'area', v: 0.08 },
    oyster:   { name: '굴 껍데기', model: 'oyster',  d: '받는 피해 -1', stat: 'armor', v: 1 },
    nutrient: { name: '영양염',   model: 'sprout',   d: '공격력 +10%', stat: 'might', v: 0.10 },
    moon:     { name: '보름달',   model: 'moon',     d: '치명타 +5%', stat: 'crit', v: 0.05 },
    kelp:     { name: '해초',     model: 'kelp',     d: '지속 시간 +15%', stat: 'dur', v: 0.15 },
    coral:    { name: '산호',     model: 'coral',    d: '3·5단계에 개수 +1', stat: 'amount', v: 1 },
  };

  // ── 오염 몬스터 ─────────────────────────────────────────
  const ENEMIES = {
    bag:    { name: '비닐 유령', hp: 7, spd: 52, dmg: 7, r: 10, xp: 1, mass: 1, beh: 'chase', model: 'bag', col: ['#eef3f6', '#bcd3dc'] },
    micro:  { name: '미세플라스틱', hp: 3, spd: 80, dmg: 4, r: 6, xp: 1, mass: 0.5, beh: 'chase', model: 'micro', col: ['#ff7aa8', '#5ad1e6', '#ffd24a'] },
    foam:   { name: '스티로폼', hp: 34, spd: 34, dmg: 11, r: 14, xp: 4, mass: 3, beh: 'chase', model: 'foam', col: ['#f1efe6', '#d9d6cb'] },
    bottle: { name: '페트병', hp: 12, spd: 56, dmg: 9, r: 9, xp: 2, mass: 1, beh: 'charge', model: 'bottle', col: ['#9fd3ea', '#d9534f'] },
    oil:    { name: '기름 덩어리', hp: 22, spd: 44, dmg: 9, r: 12, xp: 3, mass: 2, beh: 'chase', split: 'oilS', pollute: true, model: 'oil', col: ['#1d1d24', '#6b4c9a'] },
    oilS:   { name: '기름 방울', hp: 7, spd: 66, dmg: 5, r: 8, xp: 1, mass: 0.8, beh: 'chase', pollute: true, model: 'oilS', col: ['#1d1d24', '#2d8a8a'] },
    net:    { name: '폐그물', hp: 26, spd: 40, dmg: 8, r: 14, xp: 3, mass: 2, beh: 'chase', snare: true, model: 'net', col: ['#3f7f5a', '#f08a24'] },
    smog:   { name: '탄소 구름', hp: 16, spd: 40, dmg: 6, r: 12, xp: 2, mass: 1, beh: 'ranged', range: 220, model: 'smog', col: ['#4b4f57', '#ff5a4a'] },
    urchin: { name: '성게', hp: 30, spd: 30, dmg: 14, r: 12, xp: 3, mass: 2.5, beh: 'chase', model: 'urchin', col: ['#3b2340', '#7a4a86'] },
    jelly:  { name: '해파리', hp: 14, spd: 48, dmg: 8, r: 11, xp: 2, mass: 0.8, beh: 'drift', model: 'jelly', col: ['#f7a8d0', '#ffd6ea'] },
    barrel: { name: '기름통', hp: 40, spd: 30, dmg: 12, r: 13, xp: 4, mass: 3, beh: 'chase', blast: true, model: 'barrel', col: ['#7a3b2a', '#f2c037'] },
    algae:  { name: '녹조 덩어리', hp: 24, spd: 42, dmg: 9, r: 12, xp: 3, mass: 2, beh: 'chase', split: 'algaeS', pollute: true, model: 'algae', col: ['#4a9238', '#a8e070'] },
    algaeS: { name: '녹조 방울', hp: 8, spd: 64, dmg: 5, r: 8, xp: 1, mass: 0.8, beh: 'chase', pollute: true, model: 'algaeS', col: ['#5fae45', '#a8e070'] },
    tire:   { name: '폐타이어', hp: 34, spd: 36, dmg: 11, r: 13, xp: 4, mass: 4, beh: 'charge', roll: true, model: 'tire', col: ['#252527', '#8a8f94'] },
    starfish: { name: '불가사리', hp: 34, spd: 32, dmg: 11, r: 13, xp: 4, mass: 2.5, beh: 'chase', split: 'starS', spin: true, model: 'starfish', col: ['#e2603a', '#ffc07a'] },
    starS:  { name: '작은 불가사리', hp: 10, spd: 52, dmg: 6, r: 9, xp: 1, mass: 1, beh: 'chase', spin: true, model: 'starS', col: ['#e2603a', '#ffc07a'] },
    trash:  { name: '쓰레기 더미', hp: 26, spd: 0, dmg: 0, r: 13, xp: 0, mass: 99, beh: 'static', prop: true, model: 'trash', col: ['#9fd3ea', '#d9534f', '#eef3f6'] },
    heat:   { name: '열덩이', hp: 20, spd: 46, dmg: 10, r: 11, xp: 3, mass: 1, beh: 'drift', pollute: true, model: 'heat', col: ['#ff9a3c', '#ffd23f'] },
    // 보스
    algaeKing: { name: '녹조 괴물', hp: 9000, spd: 38, dmg: 22, r: 40, xp: 0, mass: 60, beh: 'algae', boss: true, model: 'algaeKing', col: ['#4a9238', '#c8f08a'] },
    heatDome: { name: '바다 열돔', hp: 10000, spd: 36, dmg: 24, r: 40, xp: 0, mass: 60, beh: 'heat', boss: true, model: 'heatDome', col: ['#ff9a3c', '#ffd23f'] },
    dozer:  { name: '매립 불도저', hp: 7500, spd: 50, dmg: 22, r: 34, xp: 0, mass: 50, beh: 'dozer', boss: true, model: 'dozer', col: ['#f2b632', '#2b2b2b'] },
    octo:   { name: '유령그물 문어', hp: 10000, spd: 42, dmg: 20, r: 36, xp: 0, mass: 50, beh: 'octo', boss: true, model: 'octo', col: ['#a8476b', '#3f7f5a'] },
    tanker: { name: '검은 유조선', hp: 10000, spd: 32, dmg: 24, r: 42, xp: 0, mass: 60, beh: 'tanker', boss: true, model: 'tanker', col: ['#2a2a2e', '#9a2f2f'] },
  };

  // ── 스테이지 ───────────────────────────────────────────
  // dens: [시각, 최소 마리, 생성 간격, 한 번에]
  const STAGES = [
    { id: 1, key: 'tidal', name: '갯벌', sub: '서해 갯벌', boss: 'dozer', bossAt: 270, hpMul: 1, dmgMul: 1, reclaim: true,
      mix: [[0, { bag: 10 }], [25, { bag: 8, micro: 4 }], [50, { bag: 6, micro: 4, foam: 2 }], [80, { bag: 5, micro: 3, foam: 2, bottle: 3 }],
            [110, { bag: 4, micro: 3, foam: 2, bottle: 3, oil: 3 }], [150, { bag: 3, micro: 4, foam: 3, bottle: 3, oil: 3, net: 2 }],
            [200, { bag: 3, micro: 4, foam: 3, bottle: 3, oil: 4, net: 3, smog: 2 }]],
      dens: [[0, 10, 1.0, 1], [60, 32, 0.75, 2], [120, 56, 0.6, 3], [180, 80, 0.5, 4], [240, 105, 0.42, 5], [270, 40, 1.0, 2], [330, 100, 0.45, 4]],
      events: [{ t: 58, k: 'ring', e: 'bag', n: 22 }, { t: 118, k: 'elite', e: 'foam' }, { t: 150, k: 'swarm', e: 'micro', n: 34 },
               { t: 180, k: 'storm', dur: 22 }, { t: 214, k: 'elite', e: 'oil' }, { t: 240, k: 'ring', e: 'micro', n: 40 }, { t: 270, k: 'boss' }] },
    { id: 2, key: 'forest', name: '바다숲', sub: '동해 바닷속', boss: 'octo', bossAt: 270, hpMul: 1.45, dmgMul: 1.2,
      mix: [[0, { jelly: 8, micro: 3 }], [30, { jelly: 6, micro: 4, urchin: 3 }], [70, { jelly: 5, micro: 4, urchin: 3, net: 3 }],
            [120, { jelly: 4, micro: 4, urchin: 4, net: 3, bag: 3 }], [180, { jelly: 4, micro: 5, urchin: 4, net: 4, foam: 3, smog: 2 }]],
      dens: [[0, 10, 1.0, 1], [60, 30, 0.8, 2], [120, 50, 0.65, 3], [180, 68, 0.55, 3], [240, 88, 0.48, 4], [270, 44, 0.9, 2], [330, 86, 0.5, 4]],
      events: [{ t: 55, k: 'ring', e: 'jelly', n: 22 }, { t: 115, k: 'elite', e: 'urchin' }, { t: 150, k: 'swarm', e: 'micro', n: 40 },
               { t: 180, k: 'storm', dur: 22 }, { t: 212, k: 'elite', e: 'net' }, { t: 240, k: 'ring', e: 'urchin', n: 18 }, { t: 270, k: 'boss' }] },
    { id: 3, key: 'oil', name: '기름 바다', sub: '기름 유출 해안', boss: 'tanker', bossAt: 270, hpMul: 1.6, dmgMul: 1.25,
      mix: [[0, { oilS: 5, bag: 6 }], [30, { oilS: 5, oil: 3, bag: 4 }], [70, { oil: 5, oilS: 4, barrel: 2, bottle: 3 }],
            [120, { oil: 5, oilS: 4, barrel: 3, bottle: 3, smog: 3 }], [180, { oil: 6, oilS: 4, barrel: 4, bottle: 3, smog: 3, net: 2 }]],
      dens: [[0, 9, 1.05, 1], [60, 28, 0.8, 2], [120, 46, 0.66, 3], [180, 64, 0.56, 3], [240, 84, 0.5, 4], [270, 42, 0.9, 2], [330, 84, 0.5, 4]],
      events: [{ t: 55, k: 'ring', e: 'oilS', n: 26 }, { t: 115, k: 'elite', e: 'barrel' }, { t: 150, k: 'swarm', e: 'micro', n: 40 },
               { t: 180, k: 'storm', dur: 22 }, { t: 212, k: 'elite', e: 'oil' }, { t: 240, k: 'ring', e: 'bottle', n: 22 }, { t: 270, k: 'boss' }] },
  ];

  STAGES.push(
    { id: 4, key: 'estuary', name: '하구', sub: '강과 바다가 만나는 곳', boss: 'algaeKing', bossAt: 270, hpMul: 1.55, dmgMul: 1.25,
      mix: [[0, { algaeS: 3, bag: 7 }], [30, { algae: 2, algaeS: 3, bag: 5, bottle: 2 }], [70, { algae: 3, algaeS: 3, tire: 2, bottle: 2, bag: 4 }],
            [120, { algae: 4, algaeS: 3, tire: 3, bottle: 3, smog: 2, micro: 3 }], [180, { algae: 5, algaeS: 3, tire: 3, bottle: 3, smog: 3, micro: 4, foam: 2 }]],
      dens: [[0, 9, 1.05, 1], [60, 28, 0.8, 2], [120, 46, 0.66, 3], [180, 64, 0.56, 3], [240, 84, 0.5, 4], [270, 42, 0.9, 2], [330, 84, 0.5, 4]],
      events: [{ t: 55, k: 'ring', e: 'algaeS', n: 26 }, { t: 115, k: 'elite', e: 'tire' }, { t: 150, k: 'swarm', e: 'micro', n: 40 },
               { t: 180, k: 'storm', dur: 22 }, { t: 212, k: 'elite', e: 'algae' }, { t: 240, k: 'ring', e: 'tire', n: 14 }, { t: 270, k: 'boss' }] },
    { id: 5, key: 'reef', name: '제주 바다', sub: '연산호 바다', boss: 'heatDome', bossAt: 270, hpMul: 1.9, dmgMul: 1.4,
      mix: [[0, { jelly: 6, starS: 4 }], [30, { jelly: 5, starfish: 3, starS: 3, micro: 3 }], [70, { jelly: 4, starfish: 3, heat: 3, net: 2, micro: 3 }],
            [120, { jelly: 4, starfish: 4, heat: 4, net: 3, micro: 4 }], [180, { jelly: 4, starfish: 4, heat: 5, net: 3, micro: 4, urchin: 3 }]],
      dens: [[0, 9, 1.05, 1], [60, 28, 0.8, 2], [120, 46, 0.66, 3], [180, 64, 0.56, 3], [240, 84, 0.5, 4], [270, 42, 0.9, 2], [330, 84, 0.5, 4]],
      events: [{ t: 55, k: 'ring', e: 'jelly', n: 24 }, { t: 115, k: 'elite', e: 'starfish' }, { t: 150, k: 'swarm', e: 'micro', n: 44 },
               { t: 180, k: 'storm', dur: 22 }, { t: 212, k: 'elite', e: 'heat' }, { t: 240, k: 'ring', e: 'starS', n: 30 }, { t: 270, k: 'boss' }] },
  );
  // 갯벌 복원 단계 보상
  const MILESTONES = [
    { v: 0.15, k: 'xp', name: '생명이 돌아와요', d: '바로 레벨 업' },
    { v: 0.30, k: 'chest', name: '보물 상자', d: '상자가 떨어져요' },
    { v: 0.45, k: 'birds', name: '저어새 떼', d: '새들이 몬스터를 휩쓸어요' },
    { v: 0.60, k: 'heal', name: '갯벌의 선물', d: '체력 회복 + 보물 상자' },
    { v: 0.75, k: 'tide', name: '대조기', d: '큰 물결이 몬스터를 쓸어가요' },
  ];
  // 떨어지는 아이템
  const ITEMS = {
    heal:    { name: '하트', model: 'heart', col: '255,90,120', d: '체력 30% 회복' },
    magnet:  { name: '자석', model: 'magnet', col: '120,190,255', d: '결정을 모두 끌어와요' },
    bomb:    { name: '큰 물결', model: 'tidewave', col: '110,210,255', d: '화면 속 몬스터를 쓸어가요' },
    freeze:  { name: '소라 나팔', model: 'shell', col: '255,200,150', d: '몬스터가 6초 동안 멈춰요' },
    pouch:   { name: '진주 주머니', model: 'pouch', col: '255,240,210', d: '진주를 얻어요' },
    feather: { name: '저어새 깃털', model: 'feather', col: '235,245,255', d: '8초 동안 빠르고 무적' },
    chest:   { name: '보물 상자', model: 'chest', col: '255,210,90', d: '강화를 얻어요' },
  };
  const DROP_PROP = { heal: 3, magnet: 2, bomb: 1.4, freeze: 1.4, pouch: 2.6, feather: 1.3 };
  const DROP_KILL = { heal: 0.011, magnet: 0.0035, bomb: 0.0015, freeze: 0.0015, pouch: 0.0012, feather: 0.0012 };
  const COMBO_STEPS = [50, 100, 200, 300, 500, 800, 1200];
  // 오늘의 도전 규칙
  const MODS = [
    { id: 'fast', name: '날쌘 몬스터', d: '몬스터 속도 +20%' },
    { id: 'tough', name: '단단한 몬스터', d: '몬스터 체력 +35%' },
    { id: 'horde', name: '몬스터 무리', d: '몬스터 수 +30%' },
    { id: 'magnet', name: '강한 자석', d: '끌어당기기 2배' },
    { id: 'loot', name: '쓰레기 대청소', d: '쓰레기 더미 2배' },
    { id: 'glass', name: '유리 대포', d: '공격력 +40%, 체력 -30%' },
    { id: 'growth', name: '빠른 성장', d: '경험치 +30%' },
  ];
  // 꾸미기
  const ACC = [
    { id: 'straw', name: '밀짚모자', cost: 300 },
    { id: 'shades', name: '선글라스', cost: 300 },
    { id: 'crown', name: '왕관', cost: 800 },
  ];
  // 별 등급: 별 하나마다 몬스터가 강해지고 진주를 더 받아요
  const STARS = { max: 5, hp: 0.35, dmg: 0.12, dens: 0.08, pearls: 0.3 };

  // ── 업적 ─────────────────────────────────────────────
  const ACH = [
    { id: 'run1', name: '첫 출동', d: '한 판 하기', reward: 30, kind: 'runs', v: 1 },
    { id: 'run10', name: '단골 수호대', d: '10판 하기', reward: 120, kind: 'runs', v: 10 },
    { id: 'clear1', name: '갯벌 지킴이', d: '갯벌 클리어', reward: 100, kind: 'clear', v: 1 },
    { id: 'clear2', name: '바다숲 지킴이', d: '바다숲 클리어', reward: 150, kind: 'clear', v: 2 },
    { id: 'clear3', name: '기름 바다 청소부', d: '기름 바다 클리어', reward: 200, kind: 'clear', v: 3 },
    { id: 'clear4', name: '하구 지킴이', d: '하구 클리어', reward: 250, kind: 'clear', v: 4 },
    { id: 'clear5', name: '제주 바다 지킴이', d: '제주 바다 클리어', reward: 300, kind: 'clear', v: 5 },
    { id: 'kill1k', name: '천 마리', d: '한 판에 1,000 처치', reward: 60, kind: 'kills', v: 1000 },
    { id: 'kill4k', name: '사천 마리', d: '한 판에 4,000 처치', reward: 200, kind: 'kills', v: 4000 },
    { id: 'evo1', name: '첫 진화', d: '진화 한 번', reward: 60, kind: 'evo', v: 1 },
    { id: 'evo3', name: '진화 박사', d: '한 판에 진화 3번', reward: 180, kind: 'evo', v: 3 },
    { id: 'lv30', name: '레벨 30', d: '한 판에 레벨 30', reward: 120, kind: 'level', v: 30 },
    { id: 'carbon10k', name: '탄소 만 톤', d: '한 판에 블루카본 10,000t', reward: 150, kind: 'carbon', v: 10000 },
    { id: 'green60', name: '초록 물결', d: '보스 전에 복원 60%', reward: 120, kind: 'green', v: 0.6 },
    { id: 'storm', name: '태풍을 이긴 게', d: '태풍 끝까지 버티기', reward: 50, kind: 'storm', v: 1 },
    { id: 'star3', name: '별 셋', d: '아무 스테이지 ★3 클리어', reward: 200, kind: 'star', v: 3 },
    { id: 'star5', name: '별 다섯', d: '아무 스테이지 ★5 클리어', reward: 500, kind: 'star', v: 5 },
    { id: 'endless10', name: '끝없는 밀물', d: '무한 모드 10분 버티기', reward: 300, kind: 'endless', v: 600 },
    { id: 'friends', name: '수호대 완성', d: '생물 친구 5종 모두', reward: 300, kind: 'chars', v: 5 },
    { id: 'codex30', name: '도감 박사', d: '도감 30칸 채우기', reward: 200, kind: 'codex', v: 30 },
  ];

  // ── 기지(영구 강화) ───────────────────────────────────────
  const UPGRADES = [
    { id: 'hp',     name: '체력',   icon: 'heart',   d: '최대 체력 +8%', max: 5, cost: [60, 120, 200, 320, 480] },
    { id: 'might',  name: '공격',   icon: 'sprout',  d: '공격력 +6%', max: 5, cost: [80, 150, 250, 380, 550] },
    { id: 'speed',  name: '이동',   icon: 'current', d: '이동 속도 +5%', max: 3, cost: [100, 220, 400] },
    { id: 'magnet', name: '자석',   icon: 'magnet',  d: '끌어당기기 +20%', max: 3, cost: [60, 140, 260] },
    { id: 'regen',  name: '회복',   icon: 'reed',    d: '초당 회복 +0.2', max: 3, cost: [120, 260, 450] },
    { id: 'growth', name: '성장',   icon: 'gem3',    d: '경험치 +6%', max: 3, cost: [100, 220, 400] },
    { id: 'reroll', name: '새로고침', icon: 'flow',  d: '선택지 다시 뽑기 +1', max: 3, cost: [80, 180, 320] },
    { id: 'greed',  name: '진주',   icon: 'pearl',   d: '진주 +10%', max: 3, cost: [120, 260, 450] },
    { id: 'revive', name: '부활',   icon: 'chest',   d: '쓰러지면 한 번 부활', max: 1, cost: [600] },
  ];

  // ── 도감 한 줄 지식 (짧고 정확하게) ─────────────────────────
  const FACTS = {
    crab: '칠게는 갯벌에 굴을 파서 진흙 속에 산소를 넣어 줘요.',
    spoonbill: '저어새는 멸종위기종이에요. 대부분 우리 서해안 섬에서 번식해요.',
    mudskipper: '짱뚱어는 물 밖 갯벌에서도 숨 쉬며 뛰어다니는 물고기예요.',
    porpoise: '상괭이는 서해와 남해에 사는, 웃는 얼굴의 토종 돌고래예요.',
    claw: '칠게 같은 갯벌 생물이 진흙을 뒤섞어 갯벌을 건강하게 해요.',
    jet: '바지락은 바닷물을 걸러 먹으며 물을 맑게 해요.',
    grass: '잘피(바다풀) 숲은 바닷속에 탄소를 저장하는 블루카본이에요.',
    jump: '짱뚱어가 사는 갯벌은 하루 두 번 밀물과 썰물이 드나들어요.',
    sweep: '저어새는 주걱 같은 부리를 좌우로 저으며 먹이를 찾아요.',
    wave: '상괭이는 등지느러미가 없는 돌고래예요.',
    worm: '갯지렁이는 진흙을 먹고 뒤집어 갯벌에 숨을 불어넣어요.',
    tide: '갯벌은 바닷물이 드나들며 해안의 큰 파도를 누그러뜨려요.',
    mud: '갯벌 진흙은 탄소를 아주 오랫동안 가둬 둘 수 있어요.',
    reed: '칠면초는 철마다 색이 바뀌는 갯벌의 염생식물이에요.',
    current: '밀물과 썰물이 영양분을 실어 날라 갯벌 생물을 키워요.',
    plankton: '식물플랑크톤은 바다에서 광합성으로 산소를 만들어요.',
    sun: '햇빛을 받은 바다 식물은 광합성으로 이산화탄소를 흡수해요.',
    flow: '염습지·잘피·갯벌이 저장하는 탄소를 블루카본이라고 해요.',
    oyster: '굴 군락은 파도를 줄여 해안을 지켜 줘요.',
    nutrient: '강에서 흘러온 영양분이 갯벌을 생명이 가득한 곳으로 만들어요.',
    bag: '바다 쓰레기는 대부분 플라스틱이에요.',
    micro: '5mm보다 작은 플라스틱 조각을 미세플라스틱이라고 해요.',
    foam: '부서진 스티로폼 부표는 미세플라스틱이 돼요.',
    bottle: '플라스틱 병은 바다에서 수백 년 동안 잘 썩지 않아요.',
    oil: '2007년 태안 기름 유출 때 120만 명이 넘는 사람이 바다를 닦았어요.',
    oilS: '기름은 새의 깃털과 생물의 숨구멍을 막아요.',
    net: '버려진 그물은 계속 생물을 잡아요. 이걸 유령어업이라고 해요.',
    smog: '이산화탄소가 늘면 바다가 점점 산성으로 변해요.',
    urchin: '성게가 너무 많아지면 바다숲이 사라지는 갯녹음이 생기기도 해요.',
    jelly: '바다가 따뜻해지면 해파리가 크게 늘어나기도 해요.',
    barrel: '기름은 물보다 가벼워 바다 위로 넓게 퍼져요.',
    dozer: '갯벌을 메우면 진흙 속에 저장된 탄소가 다시 공기로 나와요.',
    octo: '바다에 버려진 그물과 밧줄은 오랫동안 생물을 위협해요.',
    tanker: '기름 유출은 바다와 갯벌을 오랫동안 아프게 해요.',
    getbol: '우리나라 갯벌은 2021년 유네스코 세계자연유산이 되었어요.',
    seal: '점박이물범은 봄부터 가을까지 백령도 바다를 찾는 천연기념물이에요.',
    ball: '점박이물범은 몸에 둥근 점무늬가 있어서 이런 이름이 붙었어요.',
    bubble: '해마는 아빠가 배 주머니에서 새끼를 키워요.',
    ink: '낙지는 위험할 때 먹물을 뿜고 몸 색을 바꿔 숨어요.',
    moon: '달이 바닷물을 끌어당겨서 밀물과 썰물이 생겨요.',
    kelp: '해초 숲은 물고기의 집이자 어린 생물이 자라는 곳이에요.',
    coral: '제주 바다에는 알록달록한 연산호 군락이 있어요.',
    algae: '물이 고이고 따뜻해지며 영양분이 넘치면 녹조가 생겨요.',
    algaeS: '녹조가 썩으면 물속 산소가 줄어 물고기가 살기 어려워요.',
    tire: '타이어가 닳으면서 나온 가루도 미세플라스틱이 돼요.',
    starfish: '불가사리는 잘린 팔이 다시 자라기도 해요.',
    starS: '불가사리가 너무 많아지면 조개가 크게 줄기도 해요.',
    heat: '바다가 너무 뜨거워지면 산호가 하얗게 변하는 백화 현상이 생겨요.',
    algaeKing: '강 하구는 민물과 바닷물이 섞여 생물이 아주 많은 곳이에요.',
    heatDome: '바닷물 온도가 크게 오르면 산호와 바다 생물이 큰 피해를 입어요.',
  };

  FACTS.trash = '갯벌 쓰레기를 치우면 그 자리에 생물이 다시 숨을 쉬어요.';
  GS.DATA = { CHARS, WEAPONS, PASSIVES, ENEMIES, STAGES, UPGRADES, FACTS, ACH, STARS, MILESTONES, ITEMS, DROP_PROP, DROP_KILL, COMBO_STEPS, MODS, ACC };
})(typeof window !== 'undefined' ? window : globalThis);

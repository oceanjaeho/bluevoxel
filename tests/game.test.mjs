// 갯벌 수호대 시뮬레이션 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGS, autoRun } from './game-harness.mjs';

const GS = loadGS();
const { sim, DATA: D, CONFIG: C, TILE: TL } = GS;

function finite(o, path = 'r') {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path}.${k} = ${v}`);
    else if (v && typeof v === 'object' && !Array.isArray(v)) finite(v, `${path}.${k}`);
  }
}

test('첫 스테이지를 자동 조종으로 끝까지 돌려도 오류가 없어요', () => {
  const o = autoRun(GS, { stage: 1, char: 'crab', seed: 7, meta: { hp: 3, might: 3 } });
  assert.ok(['won', 'dead'].includes(o.mode), o.mode);
  assert.ok(o.levelups >= 8, 'levelups ' + o.levelups);
  assert.ok(o.r.kills > 300);
  assert.ok(o.r.restored > 0.15 && o.r.restored <= 1);
  finite(o.r);
  if (o.s.t > 271) assert.ok(o.bossSeen, '4:30이 지나면 보스가 나와요');
});

test('같은 씨앗과 같은 조종이면 결과가 같아요', () => {
  const a = autoRun(GS, { seed: 42, maxT: 90 }), b = autoRun(GS, { seed: 42, maxT: 90 });
  assert.equal(a.r.kills, b.r.kills);
  assert.equal(a.r.carbon, b.r.carbon);
  assert.equal(a.r.level, b.r.level);
});

test('몬스터를 쓰러뜨리면 그 자리 갯벌이 되살아나요', () => {
  const s = sim.newRun({ seed: 3 });
  const x = s.p.x + 300, y = s.p.y;
  const before = s.map.clean, c0 = s.carbon;
  const e = sim.spawnEnemy(s, 'foam', x, y);
  s.grid.clear(); s.grid.insert(e);
  sim.hitEnemy(s, e, 1e6, 0, 0, 'test');
  assert.ok(e.dead);
  assert.ok(s.map.clean > before, '깨끗한 칸이 늘어요');
  assert.ok(s.carbon > c0, '블루카본이 늘어요');
  assert.ok(s.gems.length > 0, '탄소 결정이 떨어져요');
});

test('불도저가 지나간 갯벌은 콘크리트가 되고 탄소가 빠져나가요', () => {
  const s = sim.newRun({ seed: 5 });
  const T = C.T, i = Math.floor(s.p.y / T) * C.MAP_W + Math.floor(s.p.x / T);
  assert.equal(s.map.tiles[i], TL.MARSH, '출발 지점은 염습지');
  s.carbon = 100;
  const b = sim.spawnEnemy(s, 'dozer', s.p.x, s.p.y);
  b.st = { ph: 'charge', t: 0.5, ax: 1, ay: 0, smog: 1 };
  s.boss = b;
  sim.step(s, C.DT, { x: 0, y: 0 });
  assert.equal(s.map.tiles[i], TL.CONCRETE);
  assert.ok(s.carbon < 100);
});

test('레벨업 선택지는 칸 수와 최대 단계를 지켜요', () => {
  const s = sim.newRun({ seed: 9 });
  for (let k = 0; k < 400; k++) {
    s.pendingLv = 1; s.mode = 'levelup'; s.choices = sim.rollChoices(s);
    for (const c of s.choices) {
      if (c.k === 'w') assert.ok(c.lv >= 1 && c.lv <= C.MAX_LV);
      if (c.k === 'p') assert.ok(c.lv >= 1 && c.lv <= C.MAX_LV);
    }
    sim.choose(s, Math.floor(s.r() * s.choices.length));
    assert.ok(s.weapons.length <= C.MAX_W);
    assert.ok(Object.keys(s.passives).length <= C.MAX_P);
    for (const w of s.weapons) assert.ok(w.lv <= C.MAX_LV);
  }
  assert.ok(s.weapons.some(w => w.evo), '400번 고르면 진화가 한 번은 나와요');
});

test('진화는 무기 5단계 + 짝 패시브가 있을 때만 나와요', () => {
  const s = sim.newRun({ seed: 11, char: 'crab' });
  const w = s.weapons[0];
  w.lv = 5;
  let seen = sim.rollChoices(s, 50).some(c => c.k === 'evo');
  assert.equal(seen, false);
  s.passives[D.WEAPONS.claw.pair] = 1;
  seen = sim.rollChoices(s, 3).some(c => c.k === 'evo' && c.id === 'claw');
  assert.equal(seen, true);
});

test('여덟 가지 생물 무기가 모두 피해를 줘요', () => {
  for (const id of Object.keys(D.WEAPONS)) {
    const s = sim.newRun({ seed: 13 });
    s.weapons.length = 0;
    s.weapons.push({ id, lv: 5, evo: false, t: 0, ang: 0, pos: [], pulse: -9, fol: null, st: null });
    s.weapons[0].st = sim.wstat(s, s.weapons[0]);
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, r = 40 + (k % 4) * 30;
      const e = sim.spawnEnemy(s, 'foam', s.p.x + Math.cos(a) * r, s.p.y + Math.sin(a) * r);
      e.hp = e.maxHp = 1e6; e.spd = 0;
    }
    for (let k = 0; k < 600; k++) { sim.step(s, C.DT, { x: k % 120 < 60 ? 1 : -1, y: 0 }); s.fx.length = 0; if (s.mode !== 'play') { s.mode = 'play'; s.pendingLv = 0; } }
    assert.ok((s.stats[id] || 0) > 0, id + ' 피해 ' + s.stats[id]);
  }
});

test('사건은 정해진 시각에 일어나요 (포위·강적·태풍·보스)', () => {
  const s = sim.newRun({ seed: 17, meta: { hp: 5 } });
  const seen = {};
  while (s.t < 272) {
    if (s.mode === 'levelup') { sim.choose(s, 0); continue; }
    if (s.mode === 'chest') { sim.closeChest(s); continue; }
    if (s.mode !== 'play') break;
    s.p.hp = s.p.maxHp; s.p.inv = 1;
    sim.step(s, C.DT, { x: 0, y: 0 });
    for (const e of s.fx) if (e.k === 'alert' || e.k === 'boss') seen[e.id || 'boss'] = seen[e.id || 'boss'] || s.t;
    s.fx.length = 0;
  }
  assert.ok(seen.ring > 57 && seen.ring < 60);
  assert.ok(seen.elite > 117 && seen.elite < 120);
  assert.ok(seen.storm > 179 && seen.storm < 182);
  assert.ok(seen.boss > 269 && seen.boss < 272);
});

test('진주 보상은 업그레이드 한두 개 값 정도예요', () => {
  const o = autoRun(GS, { seed: 21, maxT: 150 });
  assert.ok(o.r.pearls >= 20 && o.r.pearls <= 200, 'pearls ' + o.r.pearls);
});

test('세 스테이지 모두 지도와 보스가 만들어져요', () => {
  for (const st of D.STAGES) {
    const s = sim.newRun({ stage: st.id, seed: 23 });
    assert.ok(s.map.land > 1500, 'land ' + s.map.land);
    assert.ok(D.ENEMIES[st.boss].boss);
    for (const [, mix] of st.mix) for (const k of Object.keys(mix)) assert.ok(D.ENEMIES[k], k);
  }
});

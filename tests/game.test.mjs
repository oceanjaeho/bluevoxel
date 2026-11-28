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

test('모든 생물 무기가 피해를 줘요', () => {
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

test('모든 스테이지에 지도와 보스가 만들어져요', () => {
  for (const st of D.STAGES) {
    const s = sim.newRun({ stage: st.id, seed: 23 });
    assert.ok(s.map.land > 1500, 'land ' + s.map.land);
    assert.ok(D.ENEMIES[st.boss].boss);
    for (const [, mix] of st.mix) for (const k of Object.keys(mix)) assert.ok(D.ENEMIES[k], k);
  }
});

test('무한 모드는 보스를 잡아도 계속되고, 다음 보스가 또 나와요', () => {
  const s = sim.newRun({ seed: 31, endless: true, meta: { hp: 5, might: 5 } });
  let killed = false, second = false;
  while (s.t < 520) {
    if (s.mode === 'levelup') { sim.choose(s, sim.botChoose(s)); continue; }
    if (s.mode === 'chest') { sim.closeChest(s); continue; }
    assert.equal(s.mode, 'play');
    s.p.hp = s.p.maxHp; s.p.inv = 1;
    if (s.boss && !killed) { sim.hitEnemy(s, s.boss, 1e9, 0, 0, 'test'); killed = true; }
    sim.step(s, C.DT, sim.bot(s));
    s.fx.length = 0;
    if (killed && s.boss) { second = true; break; }
  }
  assert.ok(killed, '첫 보스');
  assert.equal(s.bossKills, 1);
  assert.ok(second, '두 번째 보스');
  assert.ok(s.boss.maxHp > D.ENEMIES[s.stage.boss].hp * 1.5, '두 번째 보스는 더 튼튼해요');
});

test('별 등급이 오르면 몬스터 체력과 진주가 늘어요', () => {
  const a = sim.newRun({ seed: 33, star: 1 }), b = sim.newRun({ seed: 33, star: 3 });
  const ea = sim.spawnEnemy(a, 'foam', 0, 0), eb = sim.spawnEnemy(b, 'foam', 0, 0);
  assert.ok(eb.maxHp > ea.maxHp * 1.6);
  a.kills = b.kills = 500; a.carbon = b.carbon = 3000; a.t = b.t = 200;
  assert.ok(sim.results(b).pearls > sim.results(a).pearls * 1.5);
});

test('바다 열돔의 열 고리는 닿으면 다치고, 지나간 산호를 하얗게 만들어요', () => {
  const s = sim.newRun({ stage: 5, seed: 35 });
  for (let i = 0; i < s.map.tiles.length; i++) if (s.map.tiles[i] === GS.TILE.DIRTY) s.map.tiles[i] = GS.TILE.MARSH;
  const marsh0 = s.map.tiles.filter(t => t === GS.TILE.MARSH).length;
  s.p.inv = 0;
  s.hrings.push({ x: s.p.x - 100, y: s.p.y, r: 60, spd: 165, max: 440, dmg: 20, hit: false, dead: false });
  const hp0 = s.p.hp;
  for (let k = 0; k < 120; k++) { sim.step(s, C.DT, { x: 0, y: 0 }); s.fx.length = 0; if (s.mode !== 'play') break; }
  assert.ok(s.p.hp < hp0, '열 고리에 다쳐요');
  assert.ok(s.map.tiles.filter(t => t === GS.TILE.MARSH).length < marsh0, '산호가 하얗게 변해요');
});

test('새 캐릭터 점박이물범은 물범 공으로 시작해요', () => {
  const s = sim.newRun({ char: 'seal', seed: 37 });
  assert.equal(s.weapons[0].id, 'ball');
  assert.equal(s.ch.name, '점박이물범');
});

test('쓰레기 더미를 부수면 아이템이 나오고 주변이 깨끗해져요 (처치 수에는 안 들어가요)', () => {
  const s = sim.newRun({ seed: 41 });
  const prop = s.enemies.find(e => e.def.prop);
  assert.ok(prop, '판이 시작되면 쓰레기 더미가 있어요');
  assert.ok(s.propCount >= 10);
  const c0 = s.map.clean, k0 = s.kills, n0 = s.items.length;
  sim.hitEnemy(s, prop, 1e6, 0, 0, 'test');
  assert.ok(prop.dead);
  assert.equal(s.kills, k0);
  assert.equal(s.items.length, n0 + 1);
  assert.ok(s.map.clean > c0);
});

test('회색 땅에서 솟아나기 전에 그 자리를 살리면 몬스터가 안 나와요', () => {
  const s = sim.newRun({ seed: 43 });
  const T = C.T;
  let x = 0, y = 0;
  for (let i = 0; i < s.map.tiles.length; i++) if (s.map.tiles[i] === GS.TILE.DIRTY) { x = (i % C.MAP_W) * T + T / 2; y = Math.floor(i / C.MAP_W) * T + T / 2; break; }
  s.pend.push({ x, y, type: 'bag', t: 0.05, max: 0.9, n: 1, dead: false });
  sim.restoreAt(s, x, y, 20);
  const n0 = s.enemies.length;
  sim.step(s, C.DT, { x: 0, y: 0 }); sim.step(s, C.DT, { x: 0, y: 0 }); sim.step(s, C.DT, { x: 0, y: 0 }); sim.step(s, C.DT, { x: 0, y: 0 });
  assert.ok(s.fx.some(e => e.k === 'cancel'), '취소돼요');
  assert.ok(s.enemies.filter(e => e.type === 'bag' && Math.hypot(e.x - x, e.y - y) < 30).length === 0);
  void n0;
});

test('갯벌 복원율이 단계를 넘으면 보상이 열려요', () => {
  const s = sim.newRun({ seed: 45 });
  let changed = 0;
  for (let i = 0; i < s.map.tiles.length && s.map.clean / s.map.land < 0.32; i++) if (s.map.tiles[i] === GS.TILE.DIRTY) { s.map.tiles[i] = GS.TILE.MUD; s.map.clean++; changed++; }
  for (let k = 0; k < 20; k++) { sim.step(s, C.DT, { x: 0, y: 0 }); if (s.mode === 'levelup') { sim.choose(s, 0); } }
  assert.ok(changed > 0);
  assert.ok(s.mIdx >= 2, 'mIdx ' + s.mIdx);
  assert.ok(s.items.some(it => it.k === 'chest'), '30% 보물 상자');
});

test('큰 물결은 화면 속 몬스터를 쓸어가고, 소라 나팔은 몬스터를 멈춰요', () => {
  const s = sim.newRun({ seed: 47 });
  for (let k = 0; k < 10; k++) sim.spawnEnemy(s, 'bag', s.p.x + 120 + k * 8, s.p.y + 40);
  const before = s.kills;
  sim.dropItem(s, 'bomb', s.p.x, s.p.y);
  sim.step(s, C.DT, { x: 0, y: 0 });
  assert.ok(s.kills >= before + 10);
  const e = sim.spawnEnemy(s, 'bag', s.p.x + 200, s.p.y);
  sim.dropItem(s, 'freeze', s.p.x, s.p.y);
  sim.step(s, C.DT, { x: 0, y: 0 });
  const x0 = e.x;
  for (let k = 0; k < 30; k++) sim.step(s, C.DT, { x: 0, y: 0 });
  assert.ok(Math.abs(e.x - x0) < 1, '멈춰 있어요');
});

test('오늘의 도전 규칙: 유리 대포는 체력을 줄이고 공격력을 올려요', () => {
  const a = sim.newRun({ seed: 49 }), b = sim.newRun({ seed: 49, mods: ['glass'] });
  assert.ok(b.p.maxHp < a.p.maxHp);
  assert.ok(b.p.might > a.p.might);
});

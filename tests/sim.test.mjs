// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBV, play } from './harness.mjs';

const BV = loadBV();
const { sim } = BV;
const idx = (x, y) => y * sim.MW + x;

test('지도는 16x16이고 모든 기호가 타일 정의와 맞는다', () => {
  assert.equal(BV.MAP.length, 16);
  for (const row of BV.MAP) {
    assert.equal([...row].length, 16);
    for (const ch of row) assert.ok(BV.TILES[BV.LEGEND[ch]], `unknown symbol ${ch}`);
  }
});

test('같은 수업 코드와 같은 선택이면 결과가 똑같다', () => {
  const a = play(BV, 'moderate', 'CLASS1');
  const b = play(BV, 'moderate', 'CLASS1');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const debris = (code) => sim.newGame(code).tiles.map((t) => t.debris).join('');
  assert.notEqual(debris('CLASS1'), debris('CLASS2'), 'different codes give different starts');
});

test('염생식물은 상부 갯벌에만, 잘피는 얕은 바다에만 심을 수 있다', () => {
  const s = sim.newGame('T');
  const upper = s.tiles.findIndex((t) => t.type === 'upper' && !t.debris);
  const mud = s.tiles.findIndex((t) => t.type === 'mudflat');
  const shallow = s.tiles.findIndex((t) => t.type === 'shallow');
  const deep = s.tiles.findIndex((t) => t.type === 'sea');
  assert.equal(sim.check(s, 'marsh', upper).ok, true);
  assert.equal(sim.check(s, 'marsh', mud).ok, false);
  assert.equal(sim.check(s, 'seagrass', shallow).ok, true);
  assert.equal(sim.check(s, 'seagrass', deep).ok, false);
  const r = sim.apply(s, 'marsh', upper);
  assert.equal(r.ok, true);
  assert.equal(s.tiles[upper].type, 'marsh');
  assert.equal(s.budget, BV.CONFIG.START_BUDGET - 2);
});

test('제방 뒤 간척지는 제방을 열어야 복원할 수 있다', () => {
  const s = sim.newGame('T');
  s.budget = 100;
  const behind = idx(6, 4); // 제방 바로 뒤 폐양식장
  assert.equal(s.tiles[behind].type, 'pond');
  assert.equal(sim.check(s, 'restore', behind).ok, false);
  assert.equal(sim.apply(s, 'openwall', idx(6, 5)).ok, true);
  assert.equal(sim.check(s, 'restore', behind).ok, true);
  sim.apply(s, 'restore', behind);
  assert.equal(s.tiles[behind].type, 'upper');
  assert.ok(s.tiles[behind].restoring > 0);
});

test('매립하면 저장 탄소가 여러 해에 걸쳐 배출된다', () => {
  const s = sim.newGame('T');
  const i = s.tiles.findIndex((t, k) => t.type === 'mudflat' && sim.check(s, 'develop', k).ok);
  const stock = s.tiles[i].carbon;
  assert.equal(sim.apply(s, 'develop', i).ok, true);
  assert.equal(s.tiles[i].type, 'industry');
  assert.ok(Math.abs(s.tiles[i].emit - stock * 0.5) < 1e-9);
  if (s.card) sim.choose(s, 0);
  const rep = sim.endYear(s);
  assert.ok(rep.emitLand > 0);
  assert.ok(s.tiles[i].emit > 0, 'emission continues next year');
});

test('해양보호구역이면 매립 도구와 신항만 제안이 막힌다', () => {
  const s = sim.newGame('T');
  s.policies.protect = 'mpa';
  const i = s.tiles.findIndex((t) => t.type === 'mudflat');
  assert.equal(sim.check(s, 'develop', i).ok, false);
  s.card = 'port';
  assert.equal(sim.currentCard(s).blocked, true);
});

test('한 판은 2050년이 끝나면 엔딩으로 끝나고 값이 모두 유한하다', () => {
  for (const strategy of ['idle', 'developer', 'restorer', 'moderate']) {
    const s = play(BV, strategy, 'MULTTAE');
    assert.equal(s.ended, true);
    assert.equal(s.history.length, 25);
    for (const h of s.history) for (const v of Object.values(h)) assert.ok(Number.isFinite(v), `${strategy} ${JSON.stringify(h)}`);
    const ev = sim.evaluate(s);
    assert.ok(BV.ENDINGS[ev.key]);
  }
});

test('전략에 따라 다른 엔딩이 나온다', () => {
  assert.equal(sim.evaluate(play(BV, 'developer')).key, 'grey');
  assert.equal(sim.evaluate(play(BV, 'idle')).key, 'neglect');
  assert.equal(sim.evaluate(play(BV, 'restorer')).key, 'bluecarbon');
  assert.equal(sim.evaluate(play(BV, 'natureOnly')).key, 'revived');
});

test('블루카본만으로는 탄소중립에 못 미치고, 감축과 함께해야 넘는다', () => {
  const nature = sim.evaluate(play(BV, 'natureOnly')).neutrality;
  const both = sim.evaluate(play(BV, 'restorer')).neutrality;
  const energy = sim.evaluate(play(BV, 'energyOnly')).neutrality;
  assert.ok(nature < 1);
  assert.ok(energy < 0.5);
  assert.ok(both >= 1);
});

test('모든 카드의 선택지는 오류 없이 적용된다', () => {
  for (const [id, card] of Object.entries(BV.CARDS)) {
    card.options.forEach((opt, k) => {
      const s = sim.newGame('T');
      s.card = id;
      assert.doesNotThrow(() => sim.choose(s, k), `${id}#${k}`);
      assert.doesNotThrow(() => sim.endYear(s), `${id}#${k} endYear`);
    });
  }
});

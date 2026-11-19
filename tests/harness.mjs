// Node에서 게임 로직(data.js, sim.js)을 불러오고, 자동 플레이 전략으로 한 판을 끝까지 돌리는 도구.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'prototype', 'js');

export function loadBV() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['data.js', 'sim.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.window.BV;
}

// 카드별 선택(옵션 번호). 없는 카드는 0번.
export const CHOICES = {
  idle: { start: 2, ponds: 1, industry: 1, debris: 2, boats: 1, protect: 2, algae: 2, resort: 2, fund: 2, rooftop: 1, school: 1, slr: 2, bus: 1, port: 1, remodel: 1 },
  developer: { start: 2, ponds: 2, industry: 0, debris: 2, boats: 1, protect: 2, algae: 2, resort: 0, fund: 1, rooftop: 1, school: 1, slr: 0, bus: 1, port: 0, remodel: 1 },
  restorer: { start: 1, ponds: 1, industry: 1, debris: 0, boats: 0, protect: 1, algae: 1, resort: 1, fund: 0, rooftop: 0, school: 0, slr: 1, bus: 0, port: 1, remodel: 0 },
  natureOnly: { start: 1, ponds: 1, industry: 1, debris: 0, boats: 1, protect: 1, algae: 1, resort: 1, fund: 0, rooftop: 1, school: 0, slr: 1, bus: 1, port: 1, remodel: 1 },
  energyOnly: { start: 2, ponds: 0, industry: 1, debris: 2, boats: 0, protect: 2, algae: 2, resort: 2, fund: 2, rooftop: 0, school: 1, slr: 2, bus: 0, port: 1, remodel: 0 },
  solarRestorer: { start: 1, ponds: 0, industry: 2, debris: 0, boats: 0, protect: 0, algae: 1, resort: 1, fund: 0, rooftop: 0, school: 0, slr: 1, bus: 0, port: 1, remodel: 0 },
  // 학생이 할 법한 '적당히 잘하는' 플레이: 친환경 선택 + 해마다 행동 4~5번
  moderate: { start: 2, ponds: 1, industry: 2, debris: 1, boats: 0, protect: 1, algae: 1, resort: 1, fund: 0, rooftop: 0, school: 0, slr: 1, bus: 0, port: 1, remodel: 0 }
};

function tryAll(BV, s, tool, filter, limit) {
  let n = 0;
  for (const i of BV.sim.eligible(s, tool)) {
    if (limit !== undefined && n >= limit) break;
    if (filter && !filter(s.tiles[i], i)) continue;
    const r = BV.sim.apply(s, tool, i);
    if (r.ok) n++;
    else if (r.money) break;
  }
  return n;
}

// 연간 행동 규칙
export const ACTIONS = {
  idle() {},
  energyOnly() {},
  developer(BV, s) {
    tryAll(BV, s, 'develop', null, 3);
  },
  restorer(BV, s) { restoreActions(BV, s, true); },
  natureOnly(BV, s) { restoreActions(BV, s, true); },
  solarRestorer(BV, s) { restoreActions(BV, s, true); },
  moderate(BV, s) {
    const buf = new Set(BV.sim.BUFFER);
    tryAll(BV, s, 'cleanup', null, 2);
    tryAll(BV, s, 'marsh', (t, i) => buf.has(i), 2);
    if (s.year % 2 === 0) tryAll(BV, s, 'openwall', null, 1);
    tryAll(BV, s, 'restore', null, 1);
    tryAll(BV, s, 'marsh', null, 1);
    if (s.wq >= 52) tryAll(BV, s, 'seagrass', null, 1);
    if ((s.stats.actions.boardwalk || 0) < 2) tryAll(BV, s, 'boardwalk', null, 1);
  }
};

function restoreActions(BV, s, walks) {
  const buf = new Set(BV.sim.BUFFER);
  tryAll(BV, s, 'cleanup');
  // 마을 앞 상부 갯벌부터 염생식물
  tryAll(BV, s, 'marsh', (t, i) => buf.has(i));
  // 제방 열기(해마다 2칸까지)와 복원
  tryAll(BV, s, 'openwall', null, 2);
  tryAll(BV, s, 'restore', (t) => t.type === 'pond');
  tryAll(BV, s, 'restore', null, 3);
  tryAll(BV, s, 'marsh', (t) => !t.restoring);
  if (s.wq >= 50) tryAll(BV, s, 'seagrass', null, 3);
  if (walks && (s.stats.actions.boardwalk || 0) < 4) tryAll(BV, s, 'boardwalk', null, 1);
  tryAll(BV, s, 'marsh');
}

export function play(BV, strategy, code = 'MULTTAE') {
  const s = BV.sim.newGame(code);
  const choice = CHOICES[strategy];
  const act = ACTIONS[strategy];
  let guard = 0;
  while (!s.ended && guard++ < 40) {
    if (s.card) BV.sim.choose(s, choice[s.card] ?? 0);
    act(BV, s);
    BV.sim.endYear(s);
  }
  return s;
}

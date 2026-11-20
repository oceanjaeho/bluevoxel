// 갯벌 수호대 시뮬레이션을 노드에서 불러와요
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadGS() {
  const ctx = { console, Math, Date, Object, Array, JSON };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['core.js', 'data.js', 'sim.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'game', 'js', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.GS;
}

// 자동 조종으로 한 판 (maxT 초까지)
export function autoRun(GS, opts = {}) {
  const s = GS.sim.newRun({ stage: opts.stage || 1, char: opts.char || 'crab', seed: opts.seed ?? 1, meta: opts.meta || {} });
  const dt = GS.CONFIG.DT, maxT = opts.maxT || 420;
  let steps = 0, levelups = 0, chests = 0, bossSeen = false, inp = { x: 0, y: 0 };
  while (steps < maxT / dt * 1.5) {
    if (s.mode === 'levelup') { GS.sim.choose(s, GS.sim.botChoose(s)); levelups++; continue; }
    if (s.mode === 'chest') { GS.sim.closeChest(s); chests++; continue; }
    if (s.mode !== 'play') break;
    if (steps % 6 === 0) inp = GS.sim.bot(s);
    GS.sim.step(s, dt, inp);
    s.fx.length = 0;
    if (s.boss) bossSeen = true;
    steps++;
    if (s.t > maxT) break;
  }
  const r = GS.sim.results(s);
  return { s, r, levelups, chests, bossSeen, mode: s.mode };
}

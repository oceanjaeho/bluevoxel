// 갯벌 수호대 — 게임 시뮬레이션 (화면과 분리: 노드에서도 돌아가요)
(function (root) {
  'use strict';
  const GS = root.GS, U = GS.U, C = GS.CONFIG, D = GS.DATA, TL = GS.TILE;
  const T = C.T, MW = C.MAP_W, MH = C.MAP_H, WW = MW * T, WH = MH * T, TAU = Math.PI * 2;

  // ── 지도 ───────────────────────────────────────────────
  function genMap(stage, r) {
    const N = MW * MH;
    const tiles = new Uint8Array(N), grow = new Float32Array(N), changed = new Float32Array(N).fill(-99);
    const cx = MW / 2, cy = MH / 2;
    const p0 = r() * TAU, p1 = r() * TAU, p2 = r() * TAU;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const dx = (x + 0.5 - cx) / (MW / 2), dy = (y + 0.5 - cy) / (MH / 2);
      const a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      const edge = 0.85 + 0.06 * Math.sin(a * 3 + p0) + 0.04 * Math.sin(a * 5 + p1) + 0.025 * Math.sin(a * 11 + p2);
      tiles[y * MW + x] = d > edge ? TL.SEA : TL.DIRTY;
    }
    const carve = (x, y, w, t) => {
      for (let yy = Math.floor(y - w - 1); yy <= y + w + 1; yy++) for (let xx = Math.floor(x - w - 1); xx <= x + w + 1; xx++) {
        if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
        if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) > w) continue;
        const i = yy * MW + xx;
        if (tiles[i] !== TL.SEA) tiles[i] = t;
      }
    };
    // 갯골 (구불구불한 물길)
    const nCreek = 3 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < nCreek; k++) {
      const a0 = (k / nCreek) * TAU + r() * 0.9;
      let x = cx + Math.cos(a0) * MW * 0.47, y = cy + Math.sin(a0) * MH * 0.47;
      const h = a0 + Math.PI, len = MW * (0.3 + r() * 0.12);
      let wob = r() * TAU;
      for (let i = 0; i < len; i++) {
        wob += 0.32;
        const hh = h + Math.sin(wob) * 0.75;
        x += Math.cos(hh); y += Math.sin(hh);
        if (Math.hypot(x - cx, y - cy) < 7.5) break;
        carve(x, y, i < len * 0.55 ? 1.35 : 0.85, TL.CREEK);
      }
    }
    // 매립지 (첫 스테이지)
    if (stage.reclaim) {
      const a = r() * TAU;
      const bx = Math.round(cx + Math.cos(a) * MW * 0.27), by = Math.round(cy + Math.sin(a) * MH * 0.27);
      for (let y = by - 3; y <= by + 3; y++) for (let x = bx - 4; x <= bx + 4; x++) {
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        const i = y * MW + x;
        if (tiles[i] !== TL.SEA && r() > 0.06) tiles[i] = TL.CONCRETE;
      }
    }
    // 출발 지점: 살아 있는 작은 갯벌
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), i = y * MW + x;
      if (tiles[i] === TL.SEA) continue;
      if (d < 2.3) tiles[i] = TL.MARSH;
      else if (d < 3.7) tiles[i] = tiles[i] === TL.CREEK ? TL.POOL : TL.MUD;
    }
    let land = 0, clean = 0;
    for (let i = 0; i < N; i++) { if (tiles[i] !== TL.SEA) land++; if (GS.isClean(tiles[i])) clean++; }
    const shore = new Uint8Array(N);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x;
      if (tiles[i] !== TL.SEA) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + ox, yy = y + oy;
        if (xx >= 0 && yy >= 0 && xx < MW && yy < MH && tiles[yy * MW + xx] !== TL.SEA) { shore[i] = 1; break; }
      }
    }
    const cw = Math.ceil(MW / 8);
    return { tiles, tiles0: tiles.slice(), grow, changed, land, clean, shore, cw, dirtyCh: new Uint8Array(cw * Math.ceil(MH / 8)) };
  }

  function tileAt(s, x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return TL.SEA;
    return s.map.tiles[ty * MW + tx];
  }

  function setTile(s, i, nt, growFast) {
    const m = s.map, old = m.tiles[i];
    if (old === nt) return;
    if (GS.isClean(old)) m.clean--;
    if (GS.isClean(nt)) m.clean++;
    m.tiles[i] = nt;
    m.changed[i] = s.t;
    const tx = i % MW, ty = (i / MW) | 0;
    m.dirtyCh[(ty >> 3) * m.cw + (tx >> 3)] = 1;
    if (ty > 0) m.dirtyCh[((ty - 1) >> 3) * m.cw + (tx >> 3)] = 1;
    m.grow[i] = nt === TL.MUD ? s.t + (growFast ? U.rnd(s.r, 0.4, 2.2) : U.rnd(s.r, C.GROW_MIN, C.GROW_MAX)) : 0;
  }

  // 반경 안 오염 타일을 되살려요 → 되살린 칸 수
  function restoreAt(s, x, y, rad, all) {
    const m = s.map;
    let n = 0;
    const x0 = Math.max(0, Math.floor((x - rad) / T)), x1 = Math.min(MW - 1, Math.floor((x + rad) / T));
    const y0 = Math.max(0, Math.floor((y - rad) / T)), y1 = Math.min(MH - 1, Math.floor((y + rad) / T));
    const r2 = rad * rad;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (U.d2(tx * T + T / 2, ty * T + T / 2, x, y) > r2) continue;
      const i = ty * MW + tx, t = m.tiles[i];
      if (t === TL.DIRTY || (all && t === TL.CONCRETE)) { setTile(s, i, TL.MUD, all); s.carbon += 1; n++; }
      else if (t === TL.CREEK) { setTile(s, i, TL.POOL); s.carbon += 2; n++; }
    }
    return n;
  }

  function polluteAt(s, x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return;
    const i = ty * MW + tx, t = s.map.tiles[i];
    if (t === TL.MUD) setTile(s, i, TL.DIRTY);
    else if (t === TL.POOL) setTile(s, i, TL.CREEK);
  }

  // 매립: 콘크리트로 덮고 저장된 탄소를 내보내요
  function paveAt(s, x, y, rad) {
    let lost = 0, n = 0;
    const x0 = Math.max(0, Math.floor((x - rad) / T)), x1 = Math.min(MW - 1, Math.floor((x + rad) / T));
    const y0 = Math.max(0, Math.floor((y - rad) / T)), y1 = Math.min(MH - 1, Math.floor((y + rad) / T));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (U.d2(tx * T + T / 2, ty * T + T / 2, x, y) > rad * rad) continue;
      const i = ty * MW + tx, t = s.map.tiles[i];
      if (t === TL.SEA || t === TL.CONCRETE) continue;
      lost += t === TL.MARSH ? 3 : t === TL.POOL ? 2 : t === TL.MUD ? 1 : 0;
      setTile(s, i, TL.CONCRETE); n++;
    }
    if (lost) { s.carbon = Math.max(0, s.carbon - lost); s.fx.push({ k: 'emit', x, y, v: lost }); }
    return n;
  }

  // ── 플레이어 능력치 ─────────────────────────────────────
  function xpFor(L) { return L < 20 ? 5 + (L - 1) * 11 : 215 + (L - 20) * 22; }

  function wstat(s, w) {
    const def = D.WEAPONS[w.id], p = s.p;
    const st = {};
    for (let i = 0; i < Math.min(w.lv, def.lv.length); i++) Object.assign(st, def.lv[i]);
    if (w.evo) Object.assign(st, def.evo);
    st.dmg = (st.dmg || 0) * p.might;
    if (st.cd) st.cd *= p.cdMul;
    if (st.tick) st.tick *= Math.max(0.7, p.cdMul);
    const a = p.area;
    for (const k of ['rad', 'size', 'area', 'w', 'h']) if (st[k]) st[k] *= (k === 'rad' && def.kind === 'orbit') ? Math.sqrt(a) : a;
    if (st.spd && (def.kind === 'shoot' || def.kind === 'dash' || def.kind === 'bounce' || def.kind === 'homing')) st.spd *= p.projSpd;
    if (st.dist) st.dist *= p.projSpd;
    if (st.n && def.kind !== 'aura' && def.kind !== 'arc' && def.kind !== 'nova') st.n += p.amount || 0;
    if (st.life && (def.kind === 'mine' || def.kind === 'cloud' || def.kind === 'homing')) st.life *= p.dur || 1;
    return st;
  }

  function recalc(s) {
    const p = s.p, m = s.meta, ch = s.ch, P = s.passives;
    const L = id => P[id] || 0;
    const oldMax = p.maxHp || 0;
    const md = s.mod || {};
    p.maxHp = ch.hp * (1 + 0.08 * (m.hp || 0)) * (1 + 0.15 * L('mud')) * (md.glass ? 0.7 : 1);
    if (oldMax && p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.hp, p.maxHp);
    p.speed = C.PLAYER.speed * (ch.speed || 1) * (1 + 0.05 * (m.speed || 0)) * (1 + 0.08 * L('current'));
    p.magnet = C.PLAYER.magnet * (ch.magnet || 1) * (1 + 0.2 * (m.magnet || 0)) * (1 + 0.25 * L('plankton')) * (md.magnet ? 2 : 1);
    p.regen = 0.2 * (m.regen || 0) + 0.3 * L('reed');
    p.armor = (ch.armor || 0) + L('oyster');
    p.might = (1 + 0.06 * (m.might || 0)) * (1 + 0.1 * L('nutrient')) * (md.glass ? 1.4 : 1);
    p.cdMul = Math.max(0.5, 1 - 0.07 * L('sun'));
    p.area = (ch.area || 1) * (1 + 0.08 * L('flow'));
    p.projSpd = 1 + 0.08 * L('flow');
    p.xpMul = (1 + 0.06 * (m.growth || 0)) * (1 + 0.05 * L('plankton')) * (md.growth ? 1.3 : 1);
    p.crit = C.CRIT + 0.05 * L('moon');
    p.dur = 1 + 0.15 * L('kelp');
    p.amount = (L('coral') >= 3 ? 1 : 0) + (L('coral') >= 5 ? 1 : 0);
    for (const w of s.weapons) w.st = wstat(s, w);
  }

  function addWeapon(s, id) {
    const w = { id, lv: 1, evo: false, t: 0.6, ang: 0, pos: [], pulse: -9, fol: null, st: null };
    s.weapons.push(w);
    return w;
  }

  // ── 새 판 ──────────────────────────────────────────────
  function newRun(o) {
    o = o || {};
    const stage = D.STAGES.find(st => st.id === (o.stage || 1)) || D.STAGES[0];
    const ch = D.CHARS.find(c => c.id === o.char) || D.CHARS[0];
    const seed = (o.seed != null ? o.seed : Math.floor(Math.random() * 2147483647)) >>> 0;
    const r = GS.rng(seed);
    const map = genMap(stage, r);
    const meta = o.meta || {};
    const star = Math.max(1, Math.min(D.STARS.max, o.star || 1));
    const s = {
      star, endless: !!o.endless, nextBossAt: stage.bossAt, bossT0: 0, bossKills: 0, evIdx2: 0, evNext: 0,
      evoCount: 0, stormSurvived: 0, greenMax: 0, hrings: [],
      pend: [], mIdx: 0, green: 0, combo: 0, comboT: 0, comboMax: 0, comboStep: 0, freezeT: 0,
      propT: C.PROP_EVERY, propCount: 0, propsBroken: 0, mods: (o.mods || []).slice(), mod: {}, daily: !!o.daily,
      seed, r, stage, ch, meta, t: 0, mode: 'play', fx: [], nextId: 1, map,
      view: { hw: 440, hh: 260 },
      p: { x: WW / 2, y: WH / 2, r: C.PLAYER.r, hp: 1, maxHp: 0, inv: 1, face: 1, dx: 1, dy: 0, mx: 0, my: 0, moving: false,
           slowT: 0, sprintT: 0, level: 1, xp: 0, xpNext: xpFor(1), revive: meta.revive ? 1 : 0, rerolls: meta.reroll || 0,
           trail: [], healT: 0, hurtT: -9, onMarsh: false },
      weapons: [], passives: {}, followers: [],
      enemies: [], shots: [], eshots: [], mines: [], novas: [], zones: [], gems: [], items: [],
      grid: new GS.Grid(WW, WH, 64), near: [],
      kills: 0, carbon: 0, pendingLv: 0, choices: null, chestItems: null, bonusPearls: 0,
      evIdx: 0, spawnT: 0.5, growT: 0, storm: null, boss: null, victory: null, endT: 0, alert: null,
      stats: {}, killedBy: null, seen: {}, enraged: false,
    };
    for (const id of s.mods) s.mod[id] = true;
    addWeapon(s, ch.weapon);
    recalc(s);
    s.p.hp = s.p.maxHp;
    placeProps(s, C.PROPS * (s.mod.loot ? 2 : 1), 260);
    return s;
  }

  // ── 레벨업 선택지 ──────────────────────────────────────
  function rollChoices(s, n) {
    n = n || 3;
    const cand = [];
    const owned = {};
    for (const w of s.weapons) owned[w.id] = w;
    for (const id in D.WEAPONS) {
      const def = D.WEAPONS[id], w = owned[id];
      if (w) {
        if (!w.evo && w.lv < C.MAX_LV) cand.push({ k: 'w', id, lv: w.lv + 1, wt: 10 });
        else if (!w.evo && (s.passives[def.pair] || 0) > 0) cand.push({ k: 'evo', id, wt: 1e4 });
      } else if (s.weapons.length < C.MAX_W) cand.push({ k: 'w', id, lv: 1, wt: s.weapons.length < 3 ? 9 : 5 });
    }
    const nP = Object.keys(s.passives).length;
    for (const id in D.PASSIVES) {
      const lv = s.passives[id] || 0;
      if (lv > 0 && lv < C.MAX_LV) cand.push({ k: 'p', id, lv: lv + 1, wt: 7 });
      else if (lv === 0 && nP < C.MAX_P) cand.push({ k: 'p', id, lv: 1, wt: 5 });
    }
    const out = [];
    while (out.length < n && cand.length) {
      const c = U.weighted(s.r, cand, x => x.wt);
      out.push(c);
      cand.splice(cand.indexOf(c), 1);
    }
    if (!out.length) out.push({ k: 'heal' }, { k: 'pearl' });
    return out;
  }

  function applyChoice(s, c) {
    if (c.k === 'w') {
      const w = s.weapons.find(x => x.id === c.id);
      if (w) w.lv = Math.min(C.MAX_LV, w.lv + 1); else addWeapon(s, c.id);
    } else if (c.k === 'evo') {
      const w = s.weapons.find(x => x.id === c.id);
      if (w) { w.evo = true; s.evoCount++; s.fx.push({ k: 'evo', id: c.id }); }
    } else if (c.k === 'p') {
      s.passives[c.id] = Math.min(C.MAX_LV, (s.passives[c.id] || 0) + 1);
    } else if (c.k === 'heal') {
      s.p.hp = Math.min(s.p.maxHp, s.p.hp + s.p.maxHp * 0.3);
    } else if (c.k === 'pearl') {
      s.bonusPearls += 25;
    }
    recalc(s);
  }

  function choose(s, i) {
    if (s.mode !== 'levelup' || !s.choices) return false;
    const c = s.choices[i];
    if (!c) return false;
    applyChoice(s, c);
    s.fx.push({ k: 'pick', c });
    s.pendingLv--;
    if (s.pendingLv > 0) { s.choices = rollChoices(s); s.fx.push({ k: 'levelup', lv: s.p.level - s.pendingLv + 1, again: true }); }
    else { s.choices = null; s.mode = 'play'; s.p.inv = Math.max(s.p.inv, 0.5); }
    return true;
  }

  function reroll(s) {
    if (s.mode !== 'levelup' || s.p.rerolls <= 0) return false;
    s.p.rerolls--;
    s.choices = rollChoices(s);
    return true;
  }

  function openChest(s) {
    const roll = s.r();
    const n = roll < 0.08 ? 5 : roll < 0.35 ? 3 : 1;
    const items = [];
    for (let i = 0; i < n; i++) {
      const c = rollChoices(s, 1)[0];
      applyChoice(s, c);
      items.push(c);
    }
    s.chestItems = items;
    s.mode = 'chest';
    s.fx.push({ k: 'chest', n });
  }

  function closeChest(s) {
    if (s.mode !== 'chest') return;
    s.chestItems = null;
    if (s.pendingLv > 0) { s.mode = 'levelup'; s.choices = rollChoices(s); s.fx.push({ k: 'levelup', lv: s.p.level }); }
    else { s.mode = 'play'; s.p.inv = Math.max(s.p.inv, 0.5); }
  }

  // ── 몬스터 생성 ────────────────────────────────────────
  function offscreen(s, margin) {
    const hw = s.view.hw + margin, hh = s.view.hh + margin, p = s.p, r = s.r;
    let u = r() * 2 * (hw + hh), x, y;
    if (u < 2 * hw) { x = p.x - hw + u; y = p.y + (r() < 0.5 ? -hh : hh); }
    else { u -= 2 * hw; y = p.y - hh + u; x = p.x + (r() < 0.5 ? -hw : hw); }
    return { x: U.clamp(x, -5 * T, WW + 5 * T), y: U.clamp(y, -5 * T, WH + 5 * T) };
  }

  function spawnEnemy(s, type, x, y, o) {
    o = o || {};
    const def = D.ENEMIES[type];
    const sk = s.star - 1;
    let hp = def.boss ? def.hp * (1 + (s.stage.id - 1) * 0.15) * (1 + s.bossKills * 0.6) : def.hp * s.stage.hpMul * (1 + s.t / 80 + Math.pow(s.t / 240, 2));
    hp *= (1 + D.STARS.hp * sk) * (s.mod.tough ? 1.35 : 1);
    if (def.prop) hp = def.hp * (1 + s.t / 100);
    const e = {
      id: s.nextId++, type, def, x, y, r: def.r, hp, maxHp: hp, spd: def.spd * U.rnd(s.r, 0.92, 1.08),
      dmg: def.dmg * s.stage.dmgMul * (1 + D.STARS.dmg * sk), mass: def.mass, elite: false, boss: !!def.boss, beh: def.beh,
      flash: 0, slowT: 0, slowF: 0, kx: 0, ky: 0, hits: {}, st: {}, dead: false, face: 1,
      ph: s.r() * TAU, pt: 0.45, v: Math.floor(s.r() * 3), born: s.t,
    };
    if (s.mod.fast) e.spd *= 1.2;
    if (def.prop) { e.spd = 0; s.propCount++; }
    if (o.elite) { e.elite = true; e.r *= 2; e.hp = e.maxHp = hp * 14; e.dmg *= 1.6; e.mass *= 4; e.spd *= 0.92; }
    if (o.sweep) { e.beh = 'sweep'; e.st.vx = o.vx; e.st.vy = o.vy; e.st.life = o.life; }
    s.enemies.push(e);
    s.seen[type] = 1;
    return e;
  }

  function densAt(st, t) {
    const d = st.dens;
    let a = d[0], b = d[0];
    for (let i = 0; i < d.length; i++) if (d[i][0] <= t) { a = d[i]; b = d[i + 1] || d[i]; }
    const f = b[0] > a[0] ? U.clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0;
    return { min: U.lerp(a[1], b[1], f), iv: U.lerp(a[2], b[2], f), batch: Math.round(U.lerp(a[3], b[3], f)) };
  }
  function densFor(s) {
    const d = densAt(s.stage, s.t);
    const k = (1 + D.STARS.dens * (s.star - 1)) * (s.endless && s.t > 330 ? 1 + (s.t - 330) / 300 : 1) * (s.mod.horde ? 1.3 : 1);
    d.min *= k; d.iv /= Math.sqrt(k);
    return d;
  }
  function mixAt(st, t) {
    let m = st.mix[0][1];
    for (const [tt, mm] of st.mix) if (t >= tt) m = mm;
    return m;
  }

  function placeProps(s, n, minD) {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 40; k++) {
        const tx = Math.floor(s.r() * MW), ty = Math.floor(s.r() * MH);
        if (s.map.tiles[ty * MW + tx] !== TL.DIRTY) continue;
        const x = tx * T + T / 2, y = ty * T + T / 2;
        if (U.d2(x, y, s.p.x, s.p.y) < minD * minD) continue;
        spawnEnemy(s, 'trash', x, y);
        break;
      }
    }
  }

  function spawnMixed(s) {
    const mix = mixAt(s.stage, s.t);
    const type = U.weighted(s.r, Object.keys(mix), k => mix[k]);
    if (s.r() < C.EMERGE && !s.victory) {
      const hw = s.view.hw * 0.92, hh = s.view.hh * 0.88, p = s.p;
      for (let k = 0; k < 10; k++) {
        const x = p.x + U.rnd(s.r, -hw, hw), y = p.y + U.rnd(s.r, -hh, hh);
        if (U.d2(x, y, p.x, p.y) < 200 * 200 || tileAt(s, x, y) !== TL.DIRTY) continue;
        s.pend.push({ x, y, type, t: 0.9, max: 0.9, n: type === 'micro' ? 4 : 1, dead: false });
        return;
      }
    }
    const q = offscreen(s, 50);
    if (type === 'micro') {
      for (let i = 0; i < 4; i++) spawnEnemy(s, type, q.x + U.rnd(s.r, -22, 22), q.y + U.rnd(s.r, -22, 22));
    } else spawnEnemy(s, type, q.x, q.y);
  }

  function spawnTick(s, dt) {
    if (s.victory) return;
    const d = densFor(s);
    const alive = s.enemies.length - s.propCount;
    if (alive >= C.ENEMY_CAP) return;
    s.spawnT -= dt;
    let n = 0;
    if (s.spawnT <= 0) { s.spawnT += d.iv; n += d.batch; }
    if (alive < d.min) n = Math.max(n, Math.min(3, Math.ceil(d.min - alive)));
    for (let i = 0; i < n; i++) spawnMixed(s);
  }

  function updatePend(s, dt) {
    for (const q of s.pend) {
      q.t -= dt;
      if (q.t > 0) continue;
      q.dead = true;
      if (tileAt(s, q.x, q.y) !== TL.DIRTY) { s.fx.push({ k: 'cancel', x: q.x, y: q.y }); continue; }
      for (let i = 0; i < q.n; i++) spawnEnemy(s, q.type, q.x + (q.n > 1 ? U.rnd(s.r, -16, 16) : 0), q.y + (q.n > 1 ? U.rnd(s.r, -10, 10) : 0));
      s.fx.push({ k: 'emerge', x: q.x, y: q.y });
    }
  }

  function fireEvent(s, ev) {
    const p = s.p;
    if (ev.k === 'ring') {
      const R = Math.max(s.view.hw, s.view.hh) + 40;
      for (let i = 0; i < ev.n; i++) {
        const a = (i / ev.n) * TAU;
        spawnEnemy(s, ev.e, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      }
      s.fx.push({ k: 'alert', id: 'ring' });
    } else if (ev.k === 'elite') {
      const q = offscreen(s, 60);
      spawnEnemy(s, ev.e, q.x, q.y, { elite: true });
      s.fx.push({ k: 'alert', id: 'elite', e: ev.e });
    } else if (ev.k === 'swarm') {
      const a = s.r() * TAU, dx = Math.cos(a), dy = Math.sin(a);
      const R = Math.hypot(s.view.hw, s.view.hh) + 60;
      const sx = p.x - dx * R, sy = p.y - dy * R;
      for (let i = 0; i < ev.n; i++) {
        const off = (i - ev.n / 2) * 15 + U.rnd(s.r, -6, 6), back = U.rnd(s.r, 0, 90);
        spawnEnemy(s, ev.e, sx - dy * off - dx * back, sy + dx * off - dy * back, { sweep: true, vx: dx * 125, vy: dy * 125, life: (2 * R + 200) / 125 });
      }
      s.fx.push({ k: 'alert', id: 'swarm' });
    } else if (ev.k === 'storm') {
      s.storm = { t0: s.t, end: s.t + ev.dur, ang: s.r() * TAU, wx: 0, wy: 0, bolt: 1.2 };
      s.fx.push({ k: 'alert', id: 'storm' });
    } else if (ev.k === 'boss') {
      const q = { x: p.x, y: p.y - s.view.hh - 90 };
      q.x = U.clamp(q.x, 2 * T, WW - 2 * T); q.y = U.clamp(q.y, -3 * T, WH);
      const b = spawnEnemy(s, s.stage.boss, q.x, q.y);
      b.st.ph = 'walk'; b.st.t = 2.5;
      s.boss = b; s.bossT0 = s.t;
      s.fx.push({ k: 'boss', type: b.type });
    }
  }

  // ── 피해 ───────────────────────────────────────────────
  function hurt(s, dmg, src) {
    const p = s.p;
    if (p.inv > 0 || s.victory || s.mode !== 'play') return;
    const d = Math.max(1, dmg - p.armor);
    p.hp -= d; p.inv = C.PLAYER.inv; p.hurtT = s.t;
    s.fx.push({ k: 'hurt', x: p.x, y: p.y, v: d });
    if (p.hp <= 0) {
      if (p.revive > 0) {
        p.revive--; p.hp = p.maxHp * 0.6; p.inv = 2.5;
        for (const e of s.enemies) {
          if (e.dead || e.boss) continue;
          const dd = Math.hypot(e.x - p.x, e.y - p.y);
          if (dd < 260) { if (!e.elite) killEnemy(s, e, 'revive'); else { e.kx += (e.x - p.x) / dd * 400; e.ky += (e.y - p.y) / dd * 400; } }
        }
        s.fx.push({ k: 'revive', x: p.x, y: p.y });
      } else {
        p.hp = 0; s.mode = 'dead'; s.endT = s.t; s.killedBy = src && src.type ? src.type : null;
        s.fx.push({ k: 'dead', x: p.x, y: p.y });
      }
    }
  }

  function hitEnemy(s, e, dmg, kx, ky, src) {
    if (e.dead) return false;
    const crit = s.r() < (s.p.crit || C.CRIT);
    if (crit) dmg *= C.CRIT_MUL;
    e.hp -= dmg;
    if (!e.boss || e.flash < -0.16) e.flash = 0.1;
    if (!e.boss) { const kb = 1 / Math.max(0.6, e.mass); e.kx += kx * kb; e.ky += ky * kb; }
    s.stats[src] = (s.stats[src] || 0) + dmg;
    if (s.fx.length < 900) s.fx.push({ k: 'dmg', x: e.x, y: e.y - e.r, v: dmg, crit, src });
    if (e.hp <= 0) killEnemy(s, e, src);
    return true;
  }

  function dropGem(s, x, y, v) {
    if (v <= 0) return;
    if (s.gems.length >= C.GEM_CAP) {
      const g = s.gems[Math.floor(s.r() * s.gems.length)];
      g.v += v; g.tier = v >= 20 || g.v >= 20 ? 2 : g.v >= 4 ? 1 : 0;
      return;
    }
    s.gems.push({ x, y, v, tier: v >= 20 ? 2 : v >= 4 ? 1 : 0, vx: U.rnd(s.r, -50, 50), vy: U.rnd(s.r, -50, 50), mag: false, t: 0, sp: 0, dead: false });
  }

  function killEnemy(s, e, src) {
    if (e.dead) return;
    e.dead = true;
    if (e.silent) return;
    const def = e.def;
    if (def.prop) {
      s.propCount--; s.propsBroken++;
      dropItem(s, U.weighted(s.r, Object.keys(D.DROP_PROP), k => D.DROP_PROP[k]), e.x, e.y);
      restoreAt(s, e.x, e.y, 58);
      s.fx.push({ k: 'break', x: e.x, y: e.y });
      return;
    }
    s.kills++;
    s.combo++; s.comboT = 2.2;
    if (s.combo > s.comboMax) s.comboMax = s.combo;
    if (s.comboStep < D.COMBO_STEPS.length && s.combo >= D.COMBO_STEPS[s.comboStep]) {
      const v = D.COMBO_STEPS[s.comboStep++];
      s.bonusPearls += Math.round(v / 20);
      s.fx.push({ k: 'combo', n: v });
    }
    if (!e.boss) dropGem(s, e.x, e.y, e.elite ? 30 : def.xp);
    if (e.elite) dropItem(s, 'chest', e.x, e.y);
    else if (!e.boss) {
      let q = s.r();
      for (const k in D.DROP_KILL) { q -= D.DROP_KILL[k]; if (q < 0) { dropItem(s, k, e.x, e.y); break; } }
    }
    const n = restoreAt(s, e.x, e.y, C.RESTORE_R + e.r * (e.elite ? 2.2 : 1));
    if (def.split && s.enemies.length < C.ENEMY_CAP) {
      for (let i = 0; i < 2; i++) {
        const c = spawnEnemy(s, def.split, e.x + (i ? 8 : -8), e.y + U.rnd(s.r, -6, 6));
        c.kx = (i ? 1 : -1) * 120;
      }
    }
    if (def.blast) {
      s.grid.query(e.x, e.y, 90, s.near);
      for (const o of s.near) if (o !== e && !o.dead && U.d2(o.x, o.y, e.x, e.y) < 80 * 80) hitEnemy(s, o, 30, 0, 0, 'blast');
      s.fx.push({ k: 'blast', x: e.x, y: e.y });
    }
    s.fx.push({ k: 'kill', x: e.x, y: e.y, type: e.type, elite: e.elite, boss: e.boss, n, src });
    if (e.boss) {
      if (s.endless) {
        s.bossKills++; s.nextBossAt = s.t + 200; s.enraged = false;
        s.items.push({ k: 'chest', x: e.x, y: e.y, t: 0, dead: false });
        restoreAt(s, e.x, e.y, 360, true);
        s.fx.push({ k: 'bosskill', x: e.x, y: e.y, type: e.type, endless: true });
      } else startVictory(s, e);
    }
  }

  function dropItem(s, k, x, y) {
    s.items.push({ k, x, y, t: 0, dead: false });
    s.fx.push({ k: 'itemdrop', item: k, x, y });
  }

  // 화면 속 몬스터를 한 번에 쓸어가요 (큰 물결·대조기)
  function screenClear(s, bossFrac) {
    const p = s.p, hw = s.view.hw + 40, hh = s.view.hh + 40;
    for (const e of s.enemies) {
      if (e.dead || e.def.prop) continue;
      if (Math.abs(e.x - p.x) > hw || Math.abs(e.y - p.y) > hh) continue;
      if (e.boss) hitEnemy(s, e, e.maxHp * bossFrac, 0, 0, 'tide');
      else killEnemy(s, e, 'tide');
    }
    for (const b of s.eshots) b.dead = true;
  }

  function levelCheck(s) {
    const p = s.p;
    while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; p.xpNext = xpFor(p.level); s.pendingLv++; }
  }

  function milestone(s, i) {
    const m = D.MILESTONES[i], p = s.p;
    if (m.k === 'xp') { p.xp = Math.max(p.xp, p.xpNext); levelCheck(s); p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2); }
    else if (m.k === 'chest') dropItem(s, 'chest', p.x + 46, p.y - 24);
    else if (m.k === 'birds') {
      for (let k = 0; k < 14; k++) {
        const left = k % 2 === 0, y = p.y + U.rnd(s.r, -s.view.hh * 0.9, s.view.hh * 0.9), x = p.x + (left ? -1 : 1) * (s.view.hw + 60);
        s.shots.push({ k: 'bird', x, y, vx: (left ? 1 : -1) * 620, vy: U.rnd(s.r, -40, 40), dmg: 45 * p.might + p.level * 3, r: 18,
          life: (2 * s.view.hw + 160) / 620, hit: [], src: 'birds', dead: false });
      }
      s.fx.push({ k: 'birds' });
    } else if (m.k === 'heal') { p.hp = p.maxHp; dropItem(s, 'chest', p.x - 46, p.y - 24); }
    else if (m.k === 'tide') { screenClear(s, 0.08); for (const g of s.gems) g.mag = true; s.fx.push({ k: 'bomb' }); }
    s.fx.push({ k: 'milestone', i, v: m.v, kind: m.k });
  }

  function startVictory(s, b) {
    s.victory = { t0: s.t, x: b.x, y: b.y, r: 0, tick: 0 };
    s.p.inv = 99;
    s.eshots.length = 0;
    for (const z of s.zones) if (z.k !== 'ink' && z.k !== 'mud') z.dead = true;
    s.hrings.length = 0;
    s.fx.push({ k: 'bosskill', x: b.x, y: b.y, type: b.type });
  }

  function updateVictory(s, dt) {
    const v = s.victory;
    v.r += 560 * dt;
    v.tick -= dt;
    if (v.tick <= 0) {
      v.tick = 0.08;
      restoreAt(s, v.x, v.y, v.r, true);
      for (const e of s.enemies) if (!e.dead && U.d2(e.x, e.y, v.x, v.y) < v.r * v.r) killEnemy(s, e, 'victory');
      for (const g of s.gems) g.mag = true;
    }
    if (s.t - v.t0 > 3.6) { s.mode = 'won'; s.endT = s.t; s.fx.push({ k: 'won' }); }
  }

  // ── 플레이어 ───────────────────────────────────────────
  function blocked(s, x, y) { return tileAt(s, x, y) === TL.SEA; }

  function updatePlayer(s, dt, inp) {
    const p = s.p;
    let ix = inp ? inp.x || 0 : 0, iy = inp ? inp.y || 0 : 0;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    p.moving = mag > 0.08;
    if (p.moving) { const m = Math.hypot(ix, iy); p.dx = ix / m; p.dy = iy / m; if (Math.abs(ix) > 0.15) p.face = ix > 0 ? 1 : -1; }
    p.mx = ix; p.my = iy;
    const tile = tileAt(s, p.x, p.y);
    const sp = p.speed * GS.TILE_SLOW[tile] * (p.slowT > 0 && p.sprintT <= 0 ? 0.55 : 1) * (p.sprintT > 0 ? 1.45 : 1);
    let vx = ix * sp, vy = iy * sp;
    if (s.storm) { vx += s.storm.wx * 0.35; vy += s.storm.wy * 0.35; }
    const nx = p.x + vx * dt, ny = p.y + vy * dt;
    const lx = Math.sign(vx) * 7, ly = Math.sign(vy) * 7;
    if (!blocked(s, nx + lx, p.y)) p.x = nx;
    if (!blocked(s, p.x, ny + ly)) p.y = ny;
    p.x = U.clamp(p.x, T, WW - T); p.y = U.clamp(p.y, T, WH - T);
    // 따라오는 친구들의 길
    const last = p.trail[0];
    if (!last || U.d2(last.x, last.y, p.x, p.y) > 25) {
      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > 90) p.trail.pop();
    }
    // 회복
    const onMarsh = tile === TL.MARSH || tile === TL.POOL;
    p.onMarsh = onMarsh;
    if (p.hp < p.maxHp && s.mode === 'play') {
      const reg = p.regen + (onMarsh ? C.MARSH_REGEN : 0);
      p.hp = Math.min(p.maxHp, p.hp + reg * dt);
      if (onMarsh) { p.healT -= dt; if (p.healT <= 0) { p.healT = 0.45; s.fx.push({ k: 'marshheal', x: p.x, y: p.y }); } }
    }
    if (p.inv > 0) p.inv -= dt;
    if (p.slowT > 0) p.slowT -= dt;
    if (p.sprintT > 0) p.sprintT -= dt;
  }

  function updateFollowers(s) {
    const list = s.followers;
    list.length = 0;
    let k = 0;
    const p = s.p;
    for (const w of s.weapons) {
      const def = D.WEAPONS[w.id];
      if (!def.follower || w.id === s.ch.weapon) { w.fol = null; continue; }
      const idx = Math.min(p.trail.length - 1, 7 * (k + 1));
      const pt = idx >= 0 ? p.trail[idx] : p;
      const f = { id: w.id, x: pt.x, y: pt.y, model: def.model, k };
      list.push(f); w.fol = f; k++;
    }
  }

  // ── 무기 ───────────────────────────────────────────────
  const nearBuf = [];
  function nearest(s, x, y, maxD) {
    const b = s.boss;
    if (b && !b.dead && U.d2(x, y, b.x, b.y) < 420 * 420) return b;
    for (const r of [150, 320]) {
      if (r >= maxD) break;
      s.grid.query(x, y, r, nearBuf);
      let best = null, bd = r * r;
      for (const e of nearBuf) {
        if (e.dead || e.def.prop) continue;
        const d = U.d2(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) return best;
    }
    let best = null, bd = maxD * maxD;
    for (const e of s.enemies) {
      if (e.dead || e.def.prop) continue;
      const d = U.d2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  const notProp = e => !e.dead && !e.def.prop;

  function areaHit(s, x, y, rad, dmg, kb, src) {
    let n = 0;
    s.grid.query(x, y, rad + 48, s.near);
    for (const e of s.near) {
      if (e.dead) continue;
      const rr = rad + e.r;
      const d2 = U.d2(x, y, e.x, e.y);
      if (d2 > rr * rr) continue;
      const d = Math.sqrt(d2) || 1;
      hitEnemy(s, e, dmg, (e.x - x) / d * kb, (e.y - y) / d * kb, src);
      n++;
    }
    return n;
  }

  function updateWeapons(s, dt0) {
    const p = s.p;
    const dt = dt0 * (p.onMarsh ? C.MARSH_HASTE : 1);
    for (const w of s.weapons) {
      const st = w.st, kind = D.WEAPONS[w.id].kind;
      const o = w.fol || p;
      if (kind === 'orbit') {
        w.ang = (w.ang + st.spd * dt0) % TAU;
        let rad = st.rad;
        if (st.pulse) rad *= 1 + 0.55 * Math.max(0, Math.sin(s.t * 1.8));
        w.pos.length = 0;
        for (let i = 0; i < st.n; i++) {
          const a = w.ang + i * TAU / st.n;
          const x = p.x + Math.cos(a) * rad, y = p.y + Math.sin(a) * rad;
          w.pos.push({ x, y, a });
          s.grid.query(x, y, st.size + 48, s.near);
          for (const e of s.near) {
            if (e.dead) continue;
            const rr = st.size + e.r;
            if (U.d2(x, y, e.x, e.y) > rr * rr) continue;
            if ((e.hits[w.id] || 0) > s.t) continue;
            e.hits[w.id] = s.t + st.hit;
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
            hitEnemy(s, e, st.dmg, dx / d * st.kb, dy / d * st.kb, w.id);
          }
        }
        continue;
      }
      if (kind === 'aura') {
        w.t -= dt;
        if (w.t > 0) continue;
        w.t = st.tick;
        w.pulse = s.t;
        let n = 0;
        s.grid.query(p.x, p.y, st.rad + 48, s.near);
        for (const e of s.near) {
          if (e.dead) continue;
          const rr = st.rad + e.r;
          if (U.d2(p.x, p.y, e.x, e.y) > rr * rr) continue;
          e.slowT = 0.7; e.slowF = Math.max(e.slowF, st.slow);
          hitEnemy(s, e, st.dmg, 0, 0, w.id);
          n++;
        }
        if (st.heal && n) p.hp = Math.min(p.maxHp, p.hp + Math.min(n, 6) * st.heal);
        continue;
      }
      w.t -= dt;
      if (w.t > 0) continue;
      if (kind === 'shoot') {
        const tgt = nearest(s, o.x, o.y, 560);
        if (!tgt) { w.t = 0.1; continue; }
        w.t = Math.max(w.t + st.cd, 0.02);
        const base = Math.atan2(tgt.y - o.y, tgt.x - o.x);
        for (let i = 0; i < st.n; i++) {
          const a = base + (i - (st.n - 1) / 2) * 0.17 + (st.stream ? U.rnd(s.r, -0.07, 0.07) : 0);
          s.shots.push({ k: 'jet', x: o.x, y: o.y - 4, vx: Math.cos(a) * st.spd, vy: Math.sin(a) * st.spd, dmg: st.dmg,
            pierce: st.pierce, life: st.life, r: st.size, hit: [], src: w.id, dead: false });
        }
        s.fx.push({ k: 'shoot', x: o.x, y: o.y, a: base, src: w.id });
      } else if (kind === 'lob') {
        const cands = [];
        const r2 = st.range * st.range;
        for (const e of s.enemies) if (notProp(e) && U.d2(p.x, p.y, e.x, e.y) < r2) cands.push(e);
        if (!cands.length) { w.t = 0.2; continue; }
        w.t = st.cd;
        const bi = s.boss ? cands.indexOf(s.boss) : -1;
        if (bi > 0) { cands.splice(bi, 1); cands.unshift(s.boss); }
        for (let i = 0; i < st.n; i++) {
          const e = cands.length ? cands.splice(i === 0 && cands[0] === s.boss ? 0 : Math.floor(s.r() * cands.length), 1)[0] : U.pick(s.r, s.enemies.filter(notProp));
          if (!e) break;
          s.shots.push({ k: 'lob', x0: o.x, y0: o.y, tx: e.x, ty: e.y, x: o.x, y: o.y, z: 0, tt: 0, flight: st.flight,
            dmg: st.dmg, area: st.area, puddle: !!st.puddle, life: 3, src: w.id, dead: false });
        }
        s.fx.push({ k: 'jump', x: o.x, y: o.y });
      } else if (kind === 'arc') {
        w.t = st.cd;
        const tg = nearest(s, p.x, p.y, 260);
        const f0 = tg && Math.abs(tg.x - p.x) > 4 ? Math.sign(tg.x - p.x) : p.face;
        const dirs = st.both ? [f0, -f0] : [f0];
        for (const d of dirs) {
          const cx = p.x + d * st.w * 0.5, cy = p.y - 2, rx = st.w * 0.5, ry = st.h * 0.5;
          s.grid.query(cx, cy, rx + 48, s.near);
          for (const e of s.near) {
            if (e.dead) continue;
            const nx = (e.x - cx) / (rx + e.r), ny = (e.y - cy) / (ry + e.r);
            if (nx * nx + ny * ny > 1) continue;
            hitEnemy(s, e, st.dmg, d * st.kb, (e.y - p.y) * 0.5, w.id);
          }
          s.fx.push({ k: 'sweep', x: cx, y: cy, w: st.w, h: st.h, dir: d });
        }
        if (st.birds) {
          for (let i = 0; i < st.birds; i++) {
            const tgt = U.pick(s.r, s.enemies.filter(e => notProp(e) && U.d2(e.x, e.y, p.x, p.y) < 380 * 380));
            const a = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : s.r() * TAU;
            s.shots.push({ k: 'bird', x: p.x, y: p.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, dmg: st.dmg * 0.7, r: 14, life: 1.1, hit: [], src: w.id, dead: false });
          }
        }
      } else if (kind === 'dash') {
        w.t = st.cd;
        const dirs = [];
        if (st.ring) { const a0 = s.r() * TAU; for (let i = 0; i < st.n; i++) dirs.push(a0 + i * TAU / st.n); }
        else {
          const tgt = nearest(s, p.x, p.y, 480);
          const base = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : Math.atan2(p.dy, p.dx);
          for (let i = 0; i < st.n; i++) dirs.push(base + (i - (st.n - 1) / 2) * 0.45);
        }
        for (const a of dirs) s.shots.push({ k: 'dash', x: o.x, y: o.y, dx: Math.cos(a), dy: Math.sin(a), spd: st.spd, dist: st.dist,
          trav: 0, back: false, r: st.size, dmg: st.dmg, hit: [], life: 6, src: w.id, dead: false });
        s.fx.push({ k: 'dash', x: o.x, y: o.y });
      } else if (kind === 'mine') {
        w.t = st.cd;
        for (let i = 0; i < st.n; i++) {
          const ox = st.n > 1 || i ? U.rnd(s.r, -34, 34) : 0, oy = st.n > 1 || i ? U.rnd(s.r, -34, 34) : 0;
          s.mines.push({ x: o.x + ox, y: o.y + oy, life: st.life, arm: 0.35, fuse: -1, dmg: st.dmg, area: st.area, trig: st.trig, chain: !!st.chain, src: w.id, dead: false, t0: s.t });
        }
        while (s.mines.length > 26) s.mines.shift();
        s.fx.push({ k: 'mine', x: o.x, y: o.y });
      } else if (kind === 'bounce') {
        const tgt = nearest(s, o.x, o.y, 480);
        if (!tgt) { w.t = 0.15; continue; }
        w.t = st.cd;
        const cands = s.enemies.filter(e => notProp(e) && U.d2(e.x, e.y, o.x, o.y) < 480 * 480);
        for (let i = 0; i < st.n; i++) {
          const e = i === 0 ? tgt : (cands.length ? cands[Math.floor(s.r() * cands.length)] : tgt);
          s.shots.push({ k: 'ball', x: o.x, y: o.y - 6, tid: e.id, tx: e.x, ty: e.y, spd: st.spd, dmg: st.dmg, r: st.size, left: st.bounces,
            range: st.range, burst: !!st.burst, hit: [], life: 5, src: w.id, spin: 0, dead: false });
        }
        s.fx.push({ k: 'toss', x: o.x, y: o.y });
      } else if (kind === 'homing') {
        if (!s.enemies.length) { w.t = 0.2; continue; }
        w.t = st.cd;
        for (let i = 0; i < st.n; i++) {
          const a = s.r() * TAU;
          s.shots.push({ k: 'bubble', x: o.x, y: o.y - 4, vx: Math.cos(a) * st.spd * 0.6, vy: Math.sin(a) * st.spd * 0.6, spd: st.spd, turn: st.turn,
            dmg: st.dmg, area: st.area, r: 7, life: st.life, src: w.id, dead: false });
        }
        s.fx.push({ k: 'bubbles', x: o.x, y: o.y });
      } else if (kind === 'cloud') {
        const cands = s.enemies.filter(e => notProp(e) && U.d2(e.x, e.y, p.x, p.y) < 320 * 320);
        if (!cands.length) { w.t = 0.25; continue; }
        w.t = st.cd;
        for (let i = 0; i < st.n; i++) {
          const e = cands[Math.floor(s.r() * cands.length)];
          s.zones.push({ k: 'ink', x: e.x, y: e.y, r: st.rad, life: st.life, max: st.life, tick: st.tick, tt: 0, dmg: st.dmg, slow: st.slow, pull: !!st.pull, src: w.id, dead: false });
        }
        s.fx.push({ k: 'ink', x: o.x, y: o.y });
      } else if (kind === 'nova') {
        w.t = st.cd;
        s.novas.push({ x: p.x, y: p.y, r: 8, max: st.rad, spd: st.rad / 0.55, dmg: st.dmg, push: st.push, hit: [], delay: 0, src: w.id, dead: false });
        if (st.double) s.novas.push({ x: p.x, y: p.y, r: 8, max: st.rad * 1.15, spd: st.rad / 0.55, dmg: st.dmg, push: st.push, hit: [], delay: 0.35, src: w.id, dead: false });
        s.fx.push({ k: 'nova', x: p.x, y: p.y, r: st.rad });
      }
    }
  }

  function updateShots(s, dt) {
    const p = s.p;
    for (const sh of s.shots) {
      if (sh.dead) continue;
      sh.life -= dt;
      if (sh.life <= 0) { sh.dead = true; continue; }
      if (sh.k === 'jet' || sh.k === 'bird') {
        sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        s.grid.query(sh.x, sh.y, sh.r + 48, s.near);
        for (const e of s.near) {
          if (e.dead || sh.hit.indexOf(e.id) >= 0) continue;
          const rr = sh.r + e.r;
          if (U.d2(sh.x, sh.y, e.x, e.y) > rr * rr) continue;
          hitEnemy(s, e, sh.dmg, sh.vx * 0.15, sh.vy * 0.15, sh.src);
          sh.hit.push(e.id);
          if (sh.k === 'jet' && --sh.pierce < 0) { sh.dead = true; s.fx.push({ k: 'drip', x: sh.x, y: sh.y }); break; }
        }
      } else if (sh.k === 'lob') {
        sh.tt += dt;
        const q = Math.min(1, sh.tt / sh.flight);
        sh.x = U.lerp(sh.x0, sh.tx, q); sh.y = U.lerp(sh.y0, sh.ty, q); sh.z = Math.sin(q * Math.PI) * 70;
        if (q >= 1) {
          sh.dead = true;
          areaHit(s, sh.tx, sh.ty, sh.area, sh.dmg, 120, sh.src);
          if (sh.puddle) s.zones.push({ k: 'mud', x: sh.tx, y: sh.ty, r: sh.area * 0.9, life: 2.5 * (p.dur || 1), max: 2.5 * (p.dur || 1), dead: false });
          s.fx.push({ k: 'splash', x: sh.tx, y: sh.ty, r: sh.area });
        }
      } else if (sh.k === 'ball') {
        let tgt = null;
        for (const e of s.enemies) if (e.id === sh.tid && !e.dead) { tgt = e; break; }
        if (tgt) { sh.tx = tgt.x; sh.ty = tgt.y; }
        const dx = sh.tx - sh.x, dy = sh.ty - sh.y, d = Math.hypot(dx, dy) || 1;
        const stepL = sh.spd * dt;
        sh.spin += dt * 14;
        if (d <= stepL + (tgt ? tgt.r : 0) + sh.r * 0.5) {
          sh.x = sh.tx; sh.y = sh.ty;
          if (tgt) {
            hitEnemy(s, tgt, sh.dmg, dx / d * 90, dy / d * 90, sh.src);
            sh.hit.push(tgt.id);
            if (sh.burst) { areaHit(s, sh.x, sh.y, 34, sh.dmg * 0.45, 60, sh.src); s.fx.push({ k: 'pop', x: sh.x, y: sh.y }); }
            else s.fx.push({ k: 'boing', x: sh.x, y: sh.y });
          }
          sh.left--;
          let nx = null, nd = sh.range * sh.range;
          if (sh.left >= 0) for (const e of s.enemies) {
            if (e.dead || e.def.prop || sh.hit.indexOf(e.id) >= 0) continue;
            const dd = U.d2(e.x, e.y, sh.x, sh.y);
            if (dd < nd) { nd = dd; nx = e; }
          }
          if (!nx) { sh.dead = true; continue; }
          if (sh.hit.length > 6) sh.hit.shift();
          sh.tid = nx.id; sh.tx = nx.x; sh.ty = nx.y;
        } else { sh.x += dx / d * stepL; sh.y += dy / d * stepL; }
      } else if (sh.k === 'bubble') {
        const tgt = nearest(s, sh.x, sh.y, 360);
        if (tgt) {
          const dx = tgt.x - sh.x, dy = tgt.y - sh.y, d = Math.hypot(dx, dy) || 1;
          sh.vx += (dx / d * sh.spd - sh.vx) * Math.min(1, sh.turn * dt);
          sh.vy += (dy / d * sh.spd - sh.vy) * Math.min(1, sh.turn * dt);
        }
        sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        s.grid.query(sh.x, sh.y, sh.r + 48, s.near);
        for (const e of s.near) {
          if (e.dead) continue;
          const rr = sh.r + e.r;
          if (U.d2(sh.x, sh.y, e.x, e.y) > rr * rr) continue;
          sh.dead = true;
          areaHit(s, sh.x, sh.y, sh.area, sh.dmg, 70, sh.src);
          s.fx.push({ k: 'pop', x: sh.x, y: sh.y });
          break;
        }
      } else if (sh.k === 'dash') {
        if (!sh.back) {
          sh.x += sh.dx * sh.spd * dt; sh.y += sh.dy * sh.spd * dt; sh.trav += sh.spd * dt;
          if (sh.trav >= sh.dist) { sh.back = true; sh.hit.length = 0; }
        } else {
          const dx = p.x - sh.x, dy = p.y - sh.y, d = Math.hypot(dx, dy) || 1;
          sh.dx = dx / d; sh.dy = dy / d;
          sh.x += sh.dx * sh.spd * 1.15 * dt; sh.y += sh.dy * sh.spd * 1.15 * dt;
          if (d < 20) { sh.dead = true; continue; }
        }
        s.grid.query(sh.x, sh.y, sh.r + 48, s.near);
        for (const e of s.near) {
          if (e.dead || sh.hit.indexOf(e.id) >= 0) continue;
          const rr = sh.r + e.r;
          if (U.d2(sh.x, sh.y, e.x, e.y) > rr * rr) continue;
          hitEnemy(s, e, sh.dmg, sh.dx * 160, sh.dy * 160, sh.src);
          sh.hit.push(e.id);
        }
      }
    }
    // 적의 탄
    for (const b of s.eshots) {
      if (b.dead) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0) { b.dead = true; continue; }
      const rr = b.r + p.r;
      if (U.d2(b.x, b.y, p.x, p.y) < rr * rr) {
        b.dead = true;
        if (b.k === 'net') p.slowT = 1.6;
        hurt(s, b.dmg, { type: b.src });
      }
    }
  }

  function explodeMine(s, m) {
    m.dead = true;
    areaHit(s, m.x, m.y, m.area, m.dmg, 150, m.src);
    restoreAt(s, m.x, m.y, m.area * 0.7);
    s.fx.push({ k: 'erupt', x: m.x, y: m.y, r: m.area });
    if (m.chain) for (const o of s.mines) if (!o.dead && o.fuse < 0 && U.d2(o.x, o.y, m.x, m.y) < 110 * 110) o.fuse = 0.09;
  }

  function updateMines(s, dt) {
    for (const m of s.mines) {
      if (m.dead) continue;
      m.life -= dt; m.arm -= dt;
      if (m.fuse >= 0) { m.fuse -= dt; if (m.fuse <= 0) { explodeMine(s, m); continue; } }
      if (m.life <= 0) { m.dead = true; continue; }
      if (m.arm > 0) continue;
      s.grid.query(m.x, m.y, m.trig + 48, s.near);
      for (const e of s.near) {
        if (e.dead) continue;
        const rr = m.trig + e.r;
        if (U.d2(m.x, m.y, e.x, e.y) < rr * rr) { explodeMine(s, m); break; }
      }
    }
  }

  function updateNovas(s, dt) {
    const p = s.p;
    for (const n of s.novas) {
      if (n.dead) continue;
      if (n.delay > 0) { n.delay -= dt; n.x = p.x; n.y = p.y; if (n.delay <= 0) s.fx.push({ k: 'nova', x: p.x, y: p.y, r: n.max }); continue; }
      n.r += n.spd * dt;
      if (n.r >= n.max) { n.dead = true; continue; }
      s.grid.query(n.x, n.y, n.r + 60, s.near);
      for (const e of s.near) {
        if (e.dead || n.hit.indexOf(e.id) >= 0) continue;
        const d = Math.hypot(e.x - n.x, e.y - n.y) || 1;
        if (d > n.r + e.r || d < n.r - 40 - e.r) continue;
        n.hit.push(e.id);
        hitEnemy(s, e, n.dmg, (e.x - n.x) / d * n.push, (e.y - n.y) / d * n.push, n.src);
      }
      for (const b of s.eshots) if (!b.dead && Math.abs(Math.hypot(b.x - n.x, b.y - n.y) - n.r) < 30) b.dead = true;
    }
  }

  // ── 몬스터 행동 ─────────────────────────────────────────
  function bossDozer(s, e, dt, dx, dy) {
    const st = e.st, rage = e.hp < e.maxHp * 0.5 || s.enraged;
    st.t -= dt;
    if (st.ph === 'walk') {
      const sp = e.spd * (rage ? 1.3 : 1);
      st.vx = dx * sp; st.vy = dy * sp;
      if (st.t <= 0) { st.ph = 'aim'; st.t = rage ? 0.75 : 1.05; st.ax = dx; st.ay = dy; s.fx.push({ k: 'aim', x: e.x, y: e.y }); }
    } else if (st.ph === 'aim') {
      st.vx = st.vy = 0;
      if (st.t > 0.3) { st.ax = dx; st.ay = dy; }
      if (st.t <= 0) { st.ph = 'charge'; st.t = 1.3; st.smog = 0.3; s.fx.push({ k: 'charge', x: e.x, y: e.y }); }
    } else if (st.ph === 'charge') {
      st.vx = st.ax * 410; st.vy = st.ay * 410;
      paveAt(s, e.x, e.y, e.r * 1.05);
      st.smog -= dt;
      if (st.smog <= 0) {
        st.smog = 0.45;
        let n = 0;
        for (const o of s.enemies) if (!o.dead && o.type === 'smog') n++;
        if (n < 8) spawnEnemy(s, 'smog', e.x - st.ax * 30, e.y - st.ay * 30);
      }
      if (st.t <= 0 || e.x < 0 || e.y < 0 || e.x > WW || e.y > WH) {
        if (rage && !st.combo) { st.combo = true; st.ph = 'aim'; st.t = 0.55; }
        else { st.combo = false; st.ph = 'rest'; st.t = 0.9; }
      }
    } else {
      st.vx = st.vy = 0;
      if (st.t <= 0) { st.ph = 'walk'; st.t = rage ? 2.0 : 3.0; }
    }
  }

  function bossOcto(s, e, dt, dx, dy) {
    const st = e.st, p = s.p, rage = e.hp < e.maxHp * 0.5 || s.enraged;
    st.t -= dt;
    st.cyc = st.cyc || 0;
    if (st.ph === 'walk') {
      st.vx = dx * e.spd; st.vy = dy * e.spd;
      if (st.t <= 0) {
        st.ph = 'slam'; st.t = 1.3;
        const n = rage ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const ox = i ? U.rnd(s.r, -110, 110) : 0, oy = i ? U.rnd(s.r, -110, 110) : 0;
          s.zones.push({ k: 'slam', x: p.x + ox + p.mx * 40, y: p.y + oy + p.my * 40, r: 62, delay: 1.0, max: 1.0, dmg: e.dmg * 1.25, dead: false, src: e.type });
        }
        s.fx.push({ k: 'aim', x: e.x, y: e.y });
      }
    } else if (st.ph === 'slam') {
      st.vx = st.vy = 0;
      if (st.t <= 0) {
        st.ph = 'throw'; st.t = 0.6;
        const base = Math.atan2(p.y - e.y, p.x - e.x), n = rage ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.22;
          s.eshots.push({ k: 'net', x: e.x, y: e.y, vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, r: 10, dmg: e.dmg * 0.5, life: 4, src: e.type, dead: false });
        }
        s.fx.push({ k: 'throw', x: e.x, y: e.y });
      }
    } else {
      st.vx = st.vy = 0;
      if (st.t <= 0) {
        st.ph = 'walk'; st.t = rage ? 2.0 : 2.8; st.cyc++;
        if (st.cyc % 3 === 0) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; spawnEnemy(s, 'jelly', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70); }
      }
    }
  }

  function bossTanker(s, e, dt, dx, dy, dist) {
    const st = e.st, p = s.p, rage = e.hp < e.maxHp * 0.5 || s.enraged;
    st.t -= dt;
    st.sp = (st.sp == null ? 3 : st.sp) - dt;
    // 거리를 두고 빙빙 돌아요
    const want = 230;
    const radial = dist > want ? 1 : -0.6;
    st.vx = (dx * radial - dy * 0.7) * e.spd; st.vy = (dy * radial + dx * 0.7) * e.spd;
    if (st.sp <= 0) {
      st.sp = rage ? 2.4 : 3.4;
      for (let i = 0; i < 4; i++) s.zones.push({ k: 'oil', x: e.x + U.rnd(s.r, -60, 60), y: e.y + U.rnd(s.r, -60, 60), r: 46, life: 9, max: 9, dead: false });
      for (let i = 0; i < (rage ? 4 : 2); i++) spawnEnemy(s, 'oilS', e.x + U.rnd(s.r, -40, 40), e.y + U.rnd(s.r, -40, 40));
      s.fx.push({ k: 'spill', x: e.x, y: e.y });
    }
    if (st.ph !== 'barrage' && st.t <= 0) {
      st.ph = 'barrage'; st.t = 0.4;
      const n = rage ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const ox = i ? U.rnd(s.r, -120, 120) : 0, oy = i ? U.rnd(s.r, -120, 120) : 0;
        s.zones.push({ k: 'slam', x: p.x + ox + p.mx * 50, y: p.y + oy + p.my * 50, r: 50, delay: 1.15, max: 1.15, dmg: e.dmg, dead: false, sx: e.x, sy: e.y, barrel: true, src: e.type });
      }
      s.fx.push({ k: 'throw', x: e.x, y: e.y });
    } else if (st.ph === 'barrage' && st.t <= 0) { st.ph = 'walk'; st.t = rage ? 3.2 : 4.6; }
  }

  function bossAlgae(s, e, dt, dx, dy) {
    const st = e.st, p = s.p, rage = e.hp < e.maxHp * 0.5 || s.enraged;
    st.t -= dt;
    st.vx = dx * e.spd * (rage ? 1.25 : 1); st.vy = dy * e.spd * (rage ? 1.25 : 1);
    if (st.t <= 0) {
      st.t = rage ? 2.6 : 3.6;
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + s.r(); spawnEnemy(s, 'algaeS', e.x + Math.cos(a) * 64, e.y + Math.sin(a) * 64); }
      for (let i = 0; i < 3; i++) {
        const q = 0.35 + i * 0.22;
        s.zones.push({ k: 'algae', x: U.lerp(e.x, p.x, q) + U.rnd(s.r, -60, 60), y: U.lerp(e.y, p.y, q) + U.rnd(s.r, -60, 60), r: 44, life: 7, max: 7, dead: false });
      }
      if (rage) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; s.eshots.push({ k: 'spore', x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 8, dmg: e.dmg * 0.5, life: 4, src: e.type, dead: false }); }
      s.fx.push({ k: 'bloomBoss', x: e.x, y: e.y });
    }
  }

  function bossHeat(s, e, dt, dx, dy, dist) {
    const st = e.st, rage = e.hp < e.maxHp * 0.5 || s.enraged;
    st.t -= dt;
    const radial = dist > 250 ? 1 : -0.7;
    st.vx = (dx * radial - dy * 0.6) * e.spd; st.vy = (dy * radial + dx * 0.6) * e.spd;
    if (st.t <= 0) {
      st.t = rage ? 2.9 : 4.1;
      st.pulse = (st.pulse || 0) + 1;
      s.hrings.push({ x: e.x, y: e.y, r: e.r, spd: rage ? 200 : 165, max: 440, dmg: e.dmg * 0.75, hit: false, dead: false });
      if (st.pulse % 2 === 0) for (let i = 0; i < (rage ? 4 : 3); i++) spawnEnemy(s, 'heat', e.x + U.rnd(s.r, -50, 50), e.y + U.rnd(s.r, -50, 50));
      s.fx.push({ k: 'heatPulse', x: e.x, y: e.y });
    }
  }

  function bleachAt(s, x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return;
    const i = ty * MW + tx, t = s.map.tiles[i];
    if (t === TL.MARSH) setTile(s, i, TL.MUD);
    else if (t === TL.MUD) setTile(s, i, TL.DIRTY);
    else if (t === TL.POOL) setTile(s, i, TL.CREEK);
  }

  function updateHeatRings(s, dt) {
    const p = s.p;
    for (const h of s.hrings) {
      if (h.dead) continue;
      h.r += h.spd * dt;
      if (h.r >= h.max) { h.dead = true; continue; }
      for (let k = 0; k < 10; k++) { const a = s.r() * TAU; bleachAt(s, h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r); }
      if (!h.hit && !s.victory && s.mode === 'play') {
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (Math.abs(d - h.r) < 12 + p.r) { h.hit = true; hurt(s, h.dmg, { type: 'heatDome' }); }
      }
    }
  }

  function updateEnemies(s, dt) {
    const p = s.p, near = s.near;
    const playing = s.mode === 'play' && !s.victory;
    for (const e of s.enemies) {
      if (e.dead) continue;
      e.flash -= dt;
      let slow = 1;
      if (e.slowT > 0) { e.slowT -= dt; slow = 1 - e.slowF; } else e.slowF = 0;
      const tl = tileAt(s, e.x, e.y);
      let sp = e.spd * slow * GS.TILE_SLOW[tl];
      if (!e.boss && (tl === TL.MARSH || tl === TL.POOL)) sp *= C.MARSH_SLOW;
      const frozen = s.freezeT > 0 && !e.def.prop;
      if (frozen && e.boss) sp *= 0.5;
      let dx = p.x - e.x, dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;
      let vx = 0, vy = 0;
      const st = e.st;
      switch (e.beh) {
        case 'chase': { const w = Math.sin(s.t * 3 + e.ph) * 0.25; vx = (dx - dy * w) * sp; vy = (dy + dx * w) * sp; break; }
        case 'drift': { const w = Math.sin(s.t * 1.7 + e.ph) * 0.9; vx = (dx - dy * w) * sp; vy = (dy + dx * w) * sp; break; }
        case 'charge': {
          st.ph = st.ph || 'go'; st.t = (st.t || 0) - dt;
          const roll = e.def.roll;
          if (st.ph === 'go') { vx = dx * sp; vy = dy * sp; if (dist < (roll ? 280 : 230) && st.t <= 0) { st.ph = 'aim'; st.t = roll ? 0.65 : 0.55; } }
          else if (st.ph === 'aim') { if (st.t > 0.2) { st.ax = dx; st.ay = dy; } if (st.t <= 0) { st.ph = 'dash'; st.t = roll ? 0.9 : 0.6; } }
          else if (st.ph === 'dash') { const ds = roll ? 320 : 300; vx = st.ax * ds * slow; vy = st.ay * ds * slow; if (st.t <= 0) { st.ph = 'rest'; st.t = 0.7; } }
          else { vx = dx * sp * 0.3; vy = dy * sp * 0.3; if (st.t <= 0) { st.ph = 'go'; st.t = 1.2; } }
          break;
        }
        case 'ranged': {
          if (dist > e.def.range) { vx = dx * sp; vy = dy * sp; } else { vx = -dy * sp * 0.55; vy = dx * sp * 0.55; }
          st.t = (st.t == null ? U.rnd(s.r, 1, 2.5) : st.t) - dt;
          if (st.t <= 0 && dist < e.def.range + 80 && playing) {
            st.t = 3.2;
            s.eshots.push({ k: 'puff', x: e.x, y: e.y, vx: dx * 135, vy: dy * 135, r: 8, dmg: e.dmg, life: 4, src: e.type, dead: false });
          }
          break;
        }
        case 'sweep': vx = st.vx; vy = st.vy; st.life -= dt; if (st.life <= 0) { e.dead = true; e.silent = true; } break;
        case 'static': break;
        case 'dozer': bossDozer(s, e, dt, dx, dy); vx = st.vx; vy = st.vy; break;
        case 'octo': bossOcto(s, e, dt, dx, dy); vx = st.vx; vy = st.vy; break;
        case 'tanker': bossTanker(s, e, dt, dx, dy, dist); vx = st.vx; vy = st.vy; break;
        case 'algae': bossAlgae(s, e, dt, dx, dy); vx = st.vx; vy = st.vy; break;
        case 'heat': bossHeat(s, e, dt, dx, dy, dist); vx = st.vx; vy = st.vy; break;
      }
      if (!playing && !s.victory) { vx *= 0.2; vy *= 0.2; }
      if (frozen && !e.boss) { vx = 0; vy = 0; }
      if (Math.abs(vx) > 2) e.face = vx > 0 ? 1 : -1;
      e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
      const kd = Math.exp(-9 * dt); e.kx *= kd; e.ky *= kd;
      if (s.storm && !e.boss) { e.x += s.storm.wx * dt / Math.sqrt(e.mass); e.y += s.storm.wy * dt / Math.sqrt(e.mass); }
      if (e.def.prop) { e.kx = e.ky = 0; continue; }
      if (!e.boss && e.beh !== 'sweep' && dist > 1050) { const q = offscreen(s, 40); e.x = q.x; e.y = q.y; e.kx = e.ky = 0; }
      if (playing && dist < e.r + p.r && !(frozen && !e.boss)) {
        if (p.inv <= 0) hurt(s, e.dmg, e);
        if (e.def.snare) p.slowT = Math.max(p.slowT, 0.5);
      }
      if (e.def.pollute) { e.pt -= dt; if (e.pt <= 0) { e.pt = 0.45; polluteAt(s, e.x, e.y); } }
    }
    // 서로 겹치지 않게 살짝 밀어내기
    for (const e of s.enemies) {
      if (e.dead || e.boss || e.def.prop) continue;
      s.grid.query(e.x, e.y, e.r + 20, near);
      let c = 0;
      for (const o of near) {
        if (o === e || o.dead) continue;
        const ddx = e.x - o.x, ddy = e.y - o.y, rr = e.r + o.r, d2 = ddx * ddx + ddy * ddy;
        if (d2 >= rr * rr || d2 < 0.01) continue;
        const d = Math.sqrt(d2), push = (rr - d) * 0.5 * (o.mass / (e.mass + o.mass));
        e.x += ddx / d * push; e.y += ddy / d * push;
        if (++c > 5) break;
      }
    }
  }

  function updateZones(s, dt) {
    const p = s.p;
    for (const z of s.zones) {
      if (z.dead) continue;
      if (z.k === 'slam') {
        z.delay -= dt;
        if (z.delay <= 0) {
          z.dead = true;
          if (U.d2(p.x, p.y, z.x, z.y) < (z.r + p.r) * (z.r + p.r)) hurt(s, z.dmg, { type: z.src });
          s.fx.push({ k: 'slam', x: z.x, y: z.y, r: z.r, barrel: z.barrel });
        }
      } else if (z.k === 'oil') {
        z.life -= dt;
        if (z.life <= 0) { z.dead = true; continue; }
        polluteAt(s, z.x + U.rnd(s.r, -z.r, z.r) * 0.7, z.y + U.rnd(s.r, -z.r, z.r) * 0.7);
        if (U.d2(p.x, p.y, z.x, z.y) < z.r * z.r && s.mode === 'play' && !s.victory) {
          p.slowT = Math.max(p.slowT, 0.25);
          p.hp -= 4 * dt;
          if (p.hp <= 0) { p.hp = 1; p.inv = 0; hurt(s, 1, { type: 'tanker' }); }
        }
      } else if (z.k === 'ink') {
        z.life -= dt;
        if (z.life <= 0) { z.dead = true; continue; }
        z.tt -= dt;
        const doHit = z.tt <= 0;
        if (doHit) z.tt = z.tick;
        s.grid.query(z.x, z.y, z.r + 48, s.near);
        for (const e of s.near) {
          if (e.dead) continue;
          const d2 = U.d2(e.x, e.y, z.x, z.y);
          if (d2 > (z.r + e.r) * (z.r + e.r)) continue;
          e.slowT = 0.3; e.slowF = Math.max(e.slowF, z.slow);
          if (z.pull && !e.boss) { e.x += (z.x - e.x) * Math.min(1, dt * 1.6); e.y += (z.y - e.y) * Math.min(1, dt * 1.6); }
          if (doHit) hitEnemy(s, e, z.dmg, 0, 0, z.src);
        }
      } else if (z.k === 'algae') {
        z.life -= dt;
        if (z.life <= 0) { z.dead = true; continue; }
        polluteAt(s, z.x + U.rnd(s.r, -z.r, z.r) * 0.7, z.y + U.rnd(s.r, -z.r, z.r) * 0.7);
        if (U.d2(p.x, p.y, z.x, z.y) < z.r * z.r && s.mode === 'play' && !s.victory) {
          p.slowT = Math.max(p.slowT, 0.25);
          p.hp -= 5 * dt;
          if (p.hp <= 0) { p.hp = 1; p.inv = 0; hurt(s, 1, { type: 'algaeKing' }); }
        }
      } else if (z.k === 'mud') {
        z.life -= dt;
        if (z.life <= 0) { z.dead = true; continue; }
        s.grid.query(z.x, z.y, z.r + 48, s.near);
        for (const e of s.near) if (!e.dead && U.d2(e.x, e.y, z.x, z.y) < z.r * z.r) { e.slowT = 0.3; e.slowF = Math.max(e.slowF, 0.5); }
      }
    }
  }

  function updateGems(s, dt) {
    const p = s.p, m2 = p.magnet * p.magnet;
    for (const g of s.gems) {
      if (g.dead) continue;
      g.t += dt;
      const dx = p.x - g.x, dy = p.y - g.y, d2 = dx * dx + dy * dy;
      if (!g.mag) {
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.vx *= Math.exp(-6 * dt); g.vy *= Math.exp(-6 * dt);
        if (d2 < m2) g.mag = true;
      } else {
        const d = Math.sqrt(d2) || 1;
        g.sp = Math.min(1100, g.sp + 1400 * dt);
        const v = Math.max(g.sp, 160);
        g.x += dx / d * v * dt; g.y += dy / d * v * dt;
      }
      if (d2 < (p.r + 8) * (p.r + 8)) {
        g.dead = true;
        s.carbon += g.v;
        p.xp += g.v * p.xpMul;
        levelCheck(s);
        s.fx.push({ k: 'gem', tier: g.tier, x: p.x, y: p.y });
      }
    }
  }

  function updateItems(s, dt) {
    const p = s.p;
    for (const it of s.items) {
      if (it.dead) continue;
      it.t += dt;
      if (U.d2(p.x, p.y, it.x, it.y) > (p.r + 16) * (p.r + 16)) continue;
      it.dead = true;
      if (it.k === 'heal') { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); s.fx.push({ k: 'heal', x: p.x, y: p.y }); }
      else if (it.k === 'magnet') { for (const g of s.gems) g.mag = true; s.fx.push({ k: 'magnet', x: p.x, y: p.y }); }
      else if (it.k === 'chest' && s.mode === 'play') openChest(s);
      else if (it.k === 'bomb') { screenClear(s, 0.06); s.fx.push({ k: 'bomb' }); }
      else if (it.k === 'freeze') { s.freezeT = 6; s.fx.push({ k: 'freeze' }); }
      else if (it.k === 'pouch') { const v = Math.round((8 + s.r() * 12) * (1 + 0.3 * (s.stage.id - 1))); s.bonusPearls += v; s.fx.push({ k: 'pouch', v }); }
      else if (it.k === 'feather') { p.sprintT = 8; p.inv = Math.max(p.inv, 8); s.fx.push({ k: 'feather' }); }
    }
  }

  function updateTiles(s, dt) {
    s.growT -= dt;
    if (s.growT > 0) return;
    s.growT = 0.2;
    const m = s.map;
    let n = 0;
    for (let i = 0; i < m.tiles.length; i++) {
      if (m.tiles[i] === TL.MUD && m.grow[i] > 0 && s.t >= m.grow[i]) { setTile(s, i, TL.MARSH); s.carbon += 2; n++; }
    }
    if (n) s.fx.push({ k: 'bloom', n });
    s.green = m.clean / m.land;
    if (!s.victory) {
      s.greenMax = Math.max(s.greenMax, s.green);
      while (s.mIdx < D.MILESTONES.length && s.green >= D.MILESTONES[s.mIdx].v && s.mode === 'play') milestone(s, s.mIdx++);
    }
  }

  function updateStorm(s, dt) {
    const w = s.storm;
    if (!w) return;
    if (s.t > w.end) { s.storm = null; s.stormSurvived++; s.fx.push({ k: 'stormEnd' }); return; }
    w.ang += dt * 0.2;
    const k = Math.min(1, (s.t - w.t0) / 2, (w.end - s.t) / 2);
    w.wx = Math.cos(w.ang) * 75 * k; w.wy = Math.sin(w.ang) * 75 * k;
    w.bolt -= dt;
    if (w.bolt <= 0) {
      w.bolt = 0.75;
      const p = s.p;
      const cands = s.enemies.filter(e => notProp(e) && Math.abs(e.x - p.x) < s.view.hw && Math.abs(e.y - p.y) < s.view.hh);
      const e = cands.length ? U.pick(s.r, cands) : null;
      if (e) { s.fx.push({ k: 'bolt', x: e.x, y: e.y }); areaHit(s, e.x, e.y, 44, 70 + s.t * 0.2, 200, 'storm'); }
    }
  }

  function compact(arr) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) { const o = arr[i]; if (!o.dead) arr[j++] = o; }
    arr.length = j;
  }

  // ── 한 걸음 ────────────────────────────────────────────
  function step(s, dt, inp) {
    if (s.mode !== 'play') return;
    s.t += dt;
    const ev = s.stage.events;
    while (s.evIdx < ev.length && s.t >= ev[s.evIdx].t) { const e0 = ev[s.evIdx++]; if (e0.k !== 'boss' || !s.endless) fireEvent(s, e0); }
    if (s.endless) {
      if (!s.boss && s.t >= s.nextBossAt) { fireEvent(s, { k: 'boss' }); s.nextBossAt = Infinity; }
      if (s.t > 300 && s.t >= s.evNext) {
        s.evNext = s.t + 50;
        const pool = ev.filter(x => x.k !== 'boss');
        const e0 = pool[s.evIdx2++ % pool.length];
        fireEvent(s, Object.assign({}, e0, { n: e0.n ? Math.round(e0.n * (1 + (s.t - 300) / 400)) : e0.n }));
      }
    }
    if (s.boss && !s.boss.dead && !s.enraged && s.t > s.bossT0 + 90) { s.enraged = true; s.boss.spd *= 1.4; s.boss.dmg *= 1.3; s.fx.push({ k: 'alert', id: 'rage' }); }
    spawnTick(s, dt);
    updatePend(s, dt);
    if (!s.victory) {
      s.propT -= dt;
      if (s.propT <= 0) { s.propT = C.PROP_EVERY; if (s.propCount < C.PROP_MAX * (s.mod.loot ? 2 : 1)) placeProps(s, 1, 430); }
    }
    if (s.freezeT > 0) s.freezeT -= dt;
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) { s.combo = 0; s.comboStep = 0; } }
    updatePlayer(s, dt, s.victory ? null : inp);
    updateFollowers(s);
    s.grid.clear();
    for (const e of s.enemies) if (!e.dead) s.grid.insert(e);
    if (!s.victory) updateWeapons(s, dt);
    updateShots(s, dt);
    updateMines(s, dt);
    updateNovas(s, dt);
    updateEnemies(s, dt);
    updateZones(s, dt);
    updateHeatRings(s, dt);
    updateGems(s, dt);
    updateItems(s, dt);
    updateTiles(s, dt);
    updateStorm(s, dt);
    if (s.victory) updateVictory(s, dt);
    compact(s.enemies); compact(s.shots); compact(s.eshots); compact(s.mines); compact(s.novas);
    compact(s.zones); compact(s.gems); compact(s.items); compact(s.hrings); compact(s.pend);
    if (s.boss && s.boss.dead) s.boss = null;
    if (s.pendingLv > 0 && s.mode === 'play' && !s.victory) {
      s.mode = 'levelup';
      s.choices = rollChoices(s);
      s.fx.push({ k: 'levelup', lv: s.p.level - s.pendingLv + 1 });
    }
  }

  // ── 자동 조종 (타이틀 화면 시연·테스트) ─────────────────────
  function bot(s) {
    const p = s.p, b = s.bot || (s.bot = { ang: s.r() * TAU, vx: 0, vy: 0 });
    let ax = 0, ay = 0, threat = 0;
    for (const e of s.enemies) {
      if (e.dead || e.def.prop) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
      const R = e.boss ? 330 : 200;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) + 1;
      const w = (e.boss ? 6 : e.elite ? 2.5 : 1) * (900 + 2400 * (1 - p.hp / p.maxHp)) / (d * d);
      ax += dx / d * w; ay += dy / d * w; threat += w;
    }
    for (const z of s.zones) {
      if (z.k !== 'slam' && z.k !== 'oil') continue;
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) + 1;
      if (d < z.r + 36) { ax += dx / d * 4; ay += dy / d * 4; threat += 4; }
    }
    for (const sh of s.eshots) {
      const dx = p.x - sh.x, dy = p.y - sh.y, d = Math.hypot(dx, dy) + 1;
      if (d < 90) { ax += dx / d * 2; ay += dy / d * 2; }
    }
    for (const z of s.zones) {
      if (z.k !== 'algae') continue;
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) + 1;
      if (d < z.r + 30) { ax += dx / d * 3; ay += dy / d * 3; threat += 3; }
    }
    if (s.boss && s.boss.st.ph === 'aim') {
      const e = s.boss, ux = e.st.ax, uy = e.st.ay;
      const rx = p.x - e.x, ry = p.y - e.y, along = rx * ux + ry * uy, perp = rx * -uy + ry * ux;
      if (along > 0 && Math.abs(perp) < 90) { const sgn = perp >= 0 ? 1 : -1; ax += -uy * sgn * 6; ay += ux * sgn * 6; threat += 6; }
    }
    let best = null, bd = 1e12;
    for (const g of s.gems) { const d = U.d2(p.x, p.y, g.x, g.y); if (d < bd) { bd = d; best = g; } }
    const low = p.hp < p.maxHp * 0.45;
    for (const it of s.items) {
      const d = U.d2(p.x, p.y, it.x, it.y);
      if ((it.k === 'chest' || (it.k === 'heal' && low) || it.k !== 'heal') && d < 600 * 600) { best = it; bd = d; break; }
    }
    if (best && bd < 360 * 360) {
      const d = Math.sqrt(bd) + 1, w = threat > 2 ? 0.25 : 0.9;
      ax += (best.x - p.x) / d * w; ay += (best.y - p.y) / d * w;
    }
    if (low && !p.onMarsh) {
      const tx0 = Math.floor(p.x / T), ty0 = Math.floor(p.y / T);
      let bx = 0, by = 0, bdd = 1e9;
      for (let yy = ty0 - 7; yy <= ty0 + 7; yy++) for (let xx = tx0 - 7; xx <= tx0 + 7; xx++) {
        if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
        const t = s.map.tiles[yy * MW + xx];
        if (t !== TL.MARSH && t !== TL.POOL) continue;
        const d = (xx - tx0) * (xx - tx0) + (yy - ty0) * (yy - ty0);
        if (d < bdd) { bdd = d; bx = xx * T + T / 2; by = yy * T + T / 2; }
      }
      if (bdd < 1e9) { const d = Math.hypot(bx - p.x, by - p.y) + 1; ax += (bx - p.x) / d * 0.8; ay += (by - p.y) / d * 0.8; }
    }
    const cx = WW / 2 - p.x, cy = WH / 2 - p.y, cd = Math.hypot(cx, cy) + 1, lim = WW * 0.28;
    if (cd > lim) { const k = (cd / lim - 1) * 4; ax += cx / cd * k; ay += cy / cd * k; }
    b.ang += (s.r() - 0.5) * 0.25;
    ax += Math.cos(b.ang) * 0.3; ay += Math.sin(b.ang) * 0.3;
    const m = Math.hypot(ax, ay);
    let tx = 0, ty = 0;
    if (m > 0.05) { tx = ax / m; ty = ay / m; }
    b.vx = U.lerp(b.vx, tx, 0.3); b.vy = U.lerp(b.vy, ty, 0.3);
    const mm = Math.hypot(b.vx, b.vy);
    return mm > 0.05 ? { x: b.vx / mm, y: b.vy / mm } : { x: 0, y: 0 };
  }

  function botChoose(s) {
    const cs = s.choices || [];
    const score = c => {
      if (c.k === 'evo') return 1000;
      if (c.k === 'w' && c.lv === 1) return s.weapons.length < 4 ? 80 : 20;
      if (c.k === 'w') return 50 + c.lv * 3;
      if (c.k === 'p') {
        const pairs = s.weapons.some(w => D.WEAPONS[w.id].pair === c.id);
        return (pairs ? 45 : 25) + (c.id === 'mud' || c.id === 'nutrient' ? 8 : 0);
      }
      return 1;
    };
    let bi = 0, bs = -1;
    cs.forEach((c, i) => { const v = score(c); if (v > bs) { bs = v; bi = i; } });
    return bi;
  }

  function results(s) {
    const win = s.mode === 'won';
    const restored = s.map.clean / s.map.land;
    const pearls = Math.round((s.kills * 0.022 + s.carbon * 0.008 + s.t * 0.12 + (win ? 60 : 0) + s.bossKills * 60 + s.bonusPearls)
      * (1 + 0.5 * (s.stage.id - 1)) * (1 + D.STARS.pearls * (s.star - 1)) * (1 + 0.1 * (s.meta.greed || 0)));
    let mvp = null, mv = 0;
    for (const k in s.stats) if (D.WEAPONS[k] && s.stats[k] > mv) { mv = s.stats[k]; mvp = k; }
    return {
      win, stage: s.stage.id, char: s.ch.id, time: win ? s.endT : s.t, level: s.p.level, kills: s.kills,
      carbon: Math.round(s.carbon), restored, pearls, killedBy: s.killedBy, mvp,
      build: s.weapons.map(w => ({ id: w.id, lv: w.lv, evo: w.evo })), passives: Object.assign({}, s.passives),
      seen: Object.keys(s.seen), star: s.star, endless: s.endless, bossKills: s.bossKills, evoCount: s.evoCount,
      stormSurvived: s.stormSurvived, greenMax: s.greenMax, comboMax: s.comboMax, propsBroken: s.propsBroken, daily: s.daily, mods: s.mods,
    };
  }

  GS.sim = {
    WW, WH, newRun, step, choose, reroll, closeChest, bot, botChoose, results, tileAt, xpFor, wstat, rollChoices,
    restoreAt, spawnEnemy, hitEnemy, densAt, densFor, killEnemy, dropItem,
  };
})(typeof window !== 'undefined' ? window : globalThis);

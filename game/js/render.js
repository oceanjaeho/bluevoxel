// 갯벌 수호대 — 화면 그리기 (카메라·땅·생물·이펙트)
(function (root) {
  'use strict';
  const GS = root.GS, U = GS.U, C = GS.CONFIG, TL = GS.TILE, A = GS.art, D = GS.DATA;
  const T = C.T, MW = C.MAP_W, MH = C.MAP_H, TAU = Math.PI * 2, TH = GS.TILE_H;

  let cv, ctx, W = 1, H = 1, dpr = 1, zoom = 1, K = 1, BS = 0, time = 0;
  const cam = { x: 0, y: 0, shake: 0, sx: 0, sy: 0, punch: 0, flash: 0, flashCol: '255,255,255', red: 0 };
  const opt = { lite: false, reduced: false, dmg: true, shake: true };
  const parts = [], texts = [], rings = [], sweeps = [], bolts = [];
  let cloud = null;
  const pool = [];
  let joy = null;

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d', { alpha: false });
    cloud = makeCloud();
    resize();
  }
  function resize() {
    W = Math.max(1, root.innerWidth); H = Math.max(1, root.innerHeight);
    const maxPx = opt.lite ? 0.9e6 : 2.6e6;
    dpr = Math.max(0.5, Math.min(root.devicePixelRatio || 1, opt.lite ? 1 : 2, Math.sqrt(maxPx / (W * H))));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    zoom = U.clamp(Math.sqrt(W * H / C.VIEW_AREA), 0.55, 2.6);
    K = zoom * dpr;
    const bs = Math.max(1, Math.round(K * 2) / 2);
    if (bs !== BS) { BS = bs; A.bakeAll(BS); }
    vignette = null; redEdge = null; beams = null;
  }
  function view() { return { hw: W / 2 / zoom, hh: H / 2 / zoom }; }
  function setOpt(o) { Object.assign(opt, o); }

  let vignette = null, vigLv = -1, redEdge = null, beams = null;
  function makeVignette(dusk) {
    const w = Math.ceil(cv.width / 2), h = Math.ceil(cv.height / 2);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (dusk > 0) {
      g.fillStyle = `rgba(255,${Math.round(150 - dusk * 70)},${Math.round(70 + dusk * 30)},${(0.13 * dusk).toFixed(3)})`;
      g.fillRect(0, 0, w, h);
      if (dusk > 0.6) { g.fillStyle = `rgba(60,20,70,${((dusk - 0.6) * 0.25).toFixed(3)})`; g.fillRect(0, 0, w, h); }
    }
    const r = Math.hypot(w, h) / 2;
    const gr = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    gr.addColorStop(0, 'rgba(8,16,28,0)'); gr.addColorStop(1, `rgba(${dusk > 0 ? '40,14,30' : '8,16,28'},0.55)`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    return c;
  }
  function makeRedEdge() {
    const w = Math.ceil(cv.width / 2), h = Math.ceil(cv.height / 2);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), r = Math.hypot(w, h) / 2;
    const gr = g.createRadialGradient(w / 2, h / 2, r * 0.5, w / 2, h / 2, r);
    gr.addColorStop(0, 'rgba(255,0,40,0)'); gr.addColorStop(1, 'rgba(255,20,50,0.55)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    return c;
  }
  function makeBeams() {
    const w = Math.ceil(cv.width / 2), h = Math.ceil(cv.height / 2);
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h;
    const g = c.getContext('2d');
    for (let k = 0; k < 10; k++) {
      const x = (k / 10 + 0.03) * w * 2;
      const gr = g.createLinearGradient(x, 0, x + w * 0.12, h);
      gr.addColorStop(0, 'rgba(160,230,255,0.10)'); gr.addColorStop(1, 'rgba(160,230,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * 0.06, 0); g.lineTo(x + w * 0.2, h); g.lineTo(x + w * 0.1, h); g.fill();
    }
    return c;
  }
  function makeCloud() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 6; i++) {
      const x = 70 + Math.random() * 116, y = 80 + Math.random() * 96, r = 50 + Math.random() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(10,20,35,0.5)'); gr.addColorStop(1, 'rgba(10,20,35,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }
    return c;
  }

  // ── 좌표 변환 ──────────────────────────────────────────
  let ox = 0, oy = 0;
  function worldT() { ctx.setTransform(K, 0, 0, K, ox, oy); }
  function sx(x) { return (x * K + ox) / dpr; }
  function sy(y) { return (y * K + oy) / dpr; }
  function drawSpr(sp, x, y, z, o) {
    if (!sp) return;
    const kk = K / BS;
    const fx = (o && o.flip ? -1 : 1) * (o && o.sx || 1), fy = (o && o.sy || 1);
    const px = x * K + ox, py = (y - (z || 0)) * K + oy;
    if (o && o.rot) {
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      ctx.setTransform(c * kk * fx, s * kk * fx, -s * kk * fy, c * kk * fy, px, py);
    } else ctx.setTransform(kk * fx, 0, 0, kk * fy, px, py);
    if (o && o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.drawImage(o && o.flash ? sp.f : sp.c, -sp.ax, -sp.ay);
    if (o && o.alpha != null) ctx.globalAlpha = 1;
  }
  function drawGlow(col, x, y, r, a) {
    const g = A.glow(col);
    ctx.globalAlpha = a == null ? 1 : a;
    ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // ── 이펙트 만들기 ───────────────────────────────────────
  function cap() { return opt.lite ? 260 : 750; }
  function part(p) {
    if (parts.length >= cap()) return;
    if (p.k === 'cube' || p.k === 'drop') { p.cT = A.shade(p.c, 1.12); p.cF = A.shade(p.c, 0.78); }
    else if (p.k === 'spark') p.g = A.glow(p.c);
    else if (p.k === 'smoke') p.c = p.c + '1)';
    parts.push(p);
  }
  function cubes(x, y, cols, n, spd, up) {
    if (opt.lite) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (0.3 + Math.random()) * (spd || 90);
      part({ k: 'cube', x, y, z: 4 + Math.random() * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: (up || 120) * (0.6 + Math.random() * 0.8),
        s: 2 + Math.random() * 2.6, c: cols[i % cols.length], t: 0, life: 0.7 + Math.random() * 0.5 });
    }
  }
  function sparks(x, y, col, n, spd, life) {
    if (opt.lite) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (0.2 + Math.random()) * (spd || 60);
      part({ k: 'spark', x, y, z: 6 + Math.random() * 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: 20 + Math.random() * 40, s: 5 + Math.random() * 5, c: col, t: 0, life: (life || 0.6) * (0.6 + Math.random() * 0.6) });
    }
  }
  function ring(x, y, r, col, life, w) { rings.push({ x, y, r, col, t: 0, life: life || 0.45, w: w || 3 }); }
  function text(x, y, v, col, size, life) {
    if (texts.length > 48) texts.shift();
    texts.push({ x, y, v, col, size: size || 11, t: 0, life: life || 0.7, vx: (Math.random() - 0.5) * 20 });
  }
  function shake(v) { if (opt.shake && !opt.reduced) cam.shake = Math.max(cam.shake, v); }
  function flash(col, a) { if (opt.reduced) a *= 0.4; cam.flashCol = col; cam.flash = Math.max(cam.flash, a); }

  function fx(e, s) {
    const p = s.p;
    switch (e.k) {
      case 'dmg':
        if (opt.dmg) text(e.x + (Math.random() - 0.5) * 8, e.y - 6, Math.round(e.v), e.crit ? '#ffd23f' : '#ffffff', e.crit ? 15 : 10.5);
        if (!opt.lite && Math.random() < 0.5) sparks(e.x, e.y + 6, 'rgba(255,255,255,1)', 1, 50, 0.25);
        break;
      case 'kill': {
        const d = D.ENEMIES[e.type];
        const big = e.boss ? 3 : e.elite ? 2 : 1;
        cubes(e.x, e.y, d ? d.col : ['#ffffff'], 6 * big, 90 * big, 130);
        if (e.n > 0) {
          ring(e.x, e.y, C.RESTORE_R + 12 * big, 'rgba(90,230,190,', 0.5, 3);
          sparks(e.x, e.y, 'rgba(120,255,200,1)', 3 * big, 40, 0.8);
        }
        if (e.elite) { shake(10); flash('255,255,255', 0.25); }
        break;
      }
      case 'gem': sparks(p.x, p.y - 6, e.tier === 2 ? 'rgba(255,210,80,1)' : e.tier === 1 ? 'rgba(80,240,210,1)' : 'rgba(90,180,255,1)', 1, 30, 0.35); break;
      case 'hurt': flash('255,40,60', 0.32); shake(7); text(p.x, p.y - 20, '-' + Math.round(e.v), '#ff5a6a', 13, 0.8); cam.red = 1; break;
      case 'heal': for (let i = 0; i < 10; i++) part({ k: 'leaf', x: p.x + (Math.random() - 0.5) * 30, y: p.y, z: Math.random() * 10, vx: 0, vy: 0, vz: 40 + Math.random() * 40, s: 3, c: '#7dff9a', t: 0, life: 0.9 }); text(p.x, p.y - 26, '+', '#7dff9a', 18, 0.8); break;
      case 'marshheal': part({ k: 'leaf', x: p.x + (Math.random() - 0.5) * 22, y: p.y, z: 4, vx: 0, vy: 0, vz: 36, s: 2.5, c: '#8dff9f', t: 0, life: 0.8 }); break;
      case 'shoot': if (!opt.lite) sparks(e.x + Math.cos(e.a) * 10, e.y - 4 + Math.sin(e.a) * 6, 'rgba(150,220,255,1)', 2, 40, 0.25); break;
      case 'drip': cubes(e.x, e.y, ['#9fd8ff', '#e8f6ff'], 3, 40, 60); break;
      case 'splash': cubes(e.x, e.y, ['#7a5a3a', '#a3805a', '#9fd8ff'], 8, 110, 140); ring(e.x, e.y, e.r, 'rgba(190,150,100,', 0.35, 4); shake(2); break;
      case 'erupt': cubes(e.x, e.y, ['#6b5034', '#8b6a47', '#de7d72'], 10, 120, 180); ring(e.x, e.y, e.r, 'rgba(230,140,110,', 0.4, 5); shake(3); break;
      case 'nova': ring(e.x, e.y, e.r, 'rgba(140,220,255,', 0.6, 6); shake(4); break;
      case 'sweep': sweeps.push({ x: e.x - e.dir * e.w / 2, y: e.y, w: e.w, h: e.h, dir: e.dir, t: 0, life: 0.2 }); if (!opt.lite) for (let i = 0; i < 3; i++) part({ k: 'cube', x: e.x + (Math.random() - 0.5) * e.w * 0.6, y: e.y, z: 8, vx: e.dir * 60, vy: 0, vz: 50, s: 2.2, c: '#ffffff', t: 0, life: 0.5 }); break;
      case 'dash': sparks(e.x, e.y, 'rgba(160,220,255,1)', 4, 70, 0.4); break;
      case 'jump': cubes(e.x, e.y, ['#8b6a47'], 3, 40, 60); break;
      case 'mine': cubes(e.x, e.y, ['#6b5034'], 3, 30, 50); break;
      case 'bolt': bolts.push({ x: e.x, y: e.y, t: 0, life: 0.25, seed: Math.random() * 1000 }); flash('220,240,255', 0.35); shake(6); cubes(e.x, e.y, ['#ffffff', '#bfe3ff'], 6, 120, 150); break;
      case 'emit':
        for (let i = 0; i < 3; i++) part({ k: 'smoke', x: e.x + (Math.random() - 0.5) * 30, y: e.y, z: 6, vx: (Math.random() - 0.5) * 20, vy: 0, vz: 30 + Math.random() * 20, s: 10, c: 'rgba(70,72,80,', t: 0, life: 1.4 });
        if (Math.random() < 0.5) text(e.x, e.y - 14, 'CO₂', '#c9ccd3', 11, 1.1);
        break;
      case 'blast': cubes(e.x, e.y, ['#ff9a3c', '#ffd23f', '#1c1c22'], 12, 140, 200); ring(e.x, e.y, 80, 'rgba(255,160,60,', 0.4, 6); flash('255,180,80', 0.18); shake(6); break;
      case 'slam': cubes(e.x, e.y, e.barrel ? ['#1c1c22', '#ff9a3c', '#7d3b2a'] : ['#9fd8ff', '#e8f6ff', '#4b8f6a'], 12, 140, 160); ring(e.x, e.y, e.r, e.barrel ? 'rgba(255,140,60,' : 'rgba(170,230,255,', 0.4, 6); shake(5); break;
      case 'spill': cubes(e.x, e.y, ['#1c1c22', '#5b3f8a'], 8, 80, 90); break;
      case 'charge': cubes(e.x, e.y, ['#9a8a70', '#6b5034'], 10, 120, 80); shake(5); break;
      case 'levelup': ring(p.x, p.y, 120, 'rgba(255,220,90,', 0.6, 6); sparks(p.x, p.y, 'rgba(255,230,120,1)', 16, 120, 0.8); cam.punch = 1; flash('255,240,180', 0.25); break;
      case 'evo': ring(p.x, p.y, 180, 'rgba(255,120,220,', 0.8, 8); sparks(p.x, p.y, 'rgba(255,170,240,1)', 30, 160, 1.0); flash('255,220,255', 0.4); break;
      case 'revive': ring(p.x, p.y, 260, 'rgba(120,255,200,', 0.8, 10); flash('200,255,230', 0.6); shake(10); break;
      case 'magnet': ring(p.x, p.y, 220, 'rgba(120,200,255,', 0.6, 5); break;
      case 'boss': shake(16); flash('40,0,0', 0.35); break;
      case 'bosskill':
        if (e.endless) { cubes(e.x, e.y, ['#ffffff', '#ffd23f', '#7dff9a'], 40, 220, 260); ring(e.x, e.y, 360, 'rgba(120,255,200,', 0.8, 8); flash('255,255,255', 0.5); shake(14); break; }
        cubes(e.x, e.y, ['#f2b632', '#2b2b2b', '#ffffff', '#ff9a3c'], 70, 260, 320);
        for (let i = 0; i < 4; i++) ring(e.x, e.y, 120 + i * 120, 'rgba(120,255,200,', 0.6 + i * 0.25, 8);
        flash('255,255,255', 0.9); shake(24);
        break;
      case 'dead': cubes(p.x, p.y, ['#a2a86c', '#ead9a6', '#ffffff'], 24, 140, 200); flash('255,40,60', 0.5); shake(14); break;
      case 'boing': ring(e.x, e.y, 20, 'rgba(255,240,160,', 0.25, 3); sparks(e.x, e.y, 'rgba(255,230,140,1)', 2, 50, 0.3); break;
      case 'pop': ring(e.x, e.y, 26, 'rgba(170,230,255,', 0.3, 3); cubes(e.x, e.y, ['#bfe8ff', '#ffffff'], 4, 60, 70); break;
      case 'ink': cubes(e.x, e.y, ['#2a2236', '#4a3a5a'], 3, 40, 60); break;
      case 'bloomBoss': cubes(e.x, e.y, ['#4a9238', '#a8e070', '#2f6b2a'], 14, 140, 160); ring(e.x, e.y, 90, 'rgba(120,220,90,', 0.5, 6); shake(6); break;
      case 'heatPulse': flash('255,150,60', 0.18); shake(5); break;
    }
  }

  // ── 땅 (바다 무늬 + 물길 + 조각 캐시) ─────────────────────────
  const CH = 8, chunks = new Map(), seaPat = [];
  let chMap = null, chKey = '', frameNo = 0;
  function resetChunks() { chunks.clear(); seaPat.length = 0; }
  function seaPattern(fr) {
    if (seaPat[fr] !== undefined) return seaPat[fr];
    const S = A.TILES.S, n = 4;
    const c = document.createElement('canvas'); c.width = c.height = S * n;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const vi = (U.hash2(x, y, 5) * 6) | 0;
      g.drawImage(A.tile(TL.SEA, vi, (fr + vi) % 3), x * S, y * S, S, S);
    }
    let pat = null;
    try { pat = ctx.createPattern(c, 'repeat'); pat.setTransform(new DOMMatrix([T / S, 0, 0, T / S, 0, 0])); } catch (e) { pat = null; }
    seaPat[fr] = pat;
    return pat;
  }
  function renderChunk(m, cx, cy, e) {
    const S = A.TILES.S, k = S / T, pad = Math.ceil(8 * k), th = A.TILES.th;
    if (!e.c) { e.c = document.createElement('canvas'); e.c.width = CH * S; e.c.height = CH * S + pad * 2; }
    const g = e.c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, e.c.width, e.c.height);
    for (let ty = cy * CH; ty < cy * CH + CH && ty < MH; ty++) {
      for (let tx = cx * CH; tx < cx * CH + CH && tx < MW; tx++) {
        const t = m.tiles[ty * MW + tx];
        if (t === TL.SEA || t === TL.CREEK || t === TL.POOL) continue;
        const h = TH[t], vi = (U.hash2(tx, ty, 9) * 6) | 0;
        const X = (tx - cx * CH) * S, Y = (ty - cy * CH) * S - h * k + pad;
        g.drawImage(A.tile(t, vi, 0), X, Y, S + 0.5, S + 0.5);
        const hb = TH[ty + 1 < MH ? m.tiles[(ty + 1) * MW + tx] : TL.SEA];
        if (hb < h) { g.fillStyle = th.front[t] || '#3a3a3a'; g.fillRect(X, (ty + 1 - cy * CH) * S - h * k + pad, S + 0.5, (h - hb) * k); }
      }
    }
    e.pad = pad; e.k = k;
  }
  function drawGround(s) {
    const m = s.map, th = A.TILES.th;
    const key = A.TILES.theme + '@' + A.TILES.bs;
    if (chMap !== m || chKey !== key) { resetChunks(); chMap = m; chKey = key; }
    frameNo++;
    const hw = W / 2 / zoom, hh = H / 2 / zoom;
    const x0 = Math.floor((cam.x - hw) / T) - 1, x1 = Math.floor((cam.x + hw) / T) + 1;
    const y0 = Math.floor((cam.y - hh) / T) - 1, y1 = Math.floor((cam.y + hh) / T) + 2;
    const fr = Math.floor(time * 2.2) % 3;
    worldT();
    // 1) 바다
    const pat = seaPattern(fr);
    ctx.fillStyle = pat || th.sea;
    ctx.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    // 2) 움직이는 물길
    const ys = Math.max(0, y0), ye = Math.min(MH - 1, y1), xs = Math.max(0, x0), xe = Math.min(MW - 1, x1);
    for (let ty = ys; ty <= ye; ty++) {
      for (let tx = xs; tx <= xe; tx++) {
        const t = m.tiles[ty * MW + tx];
        if (t !== TL.CREEK && t !== TL.POOL) continue;
        const h = TH[t], vi = (U.hash2(tx, ty, 9) * 6) | 0;
        ctx.drawImage(A.tile(t, vi, (fr + vi) % 3), tx * T, ty * T - h, T + 0.6, T + 0.6);
        const hb = TH[ty + 1 < MH ? m.tiles[(ty + 1) * MW + tx] : TL.SEA];
        if (hb < h) { ctx.fillStyle = th.front[t] || '#2a3a3a'; ctx.fillRect(tx * T, (ty + 1) * T - h, T + 0.6, h - hb); }
      }
    }
    // 3) 땅 조각 (바뀐 조각은 한 장면에 3개까지만 다시 그려요)
    let budget = 3;
    const cx0 = Math.max(0, Math.floor(xs / CH)), cx1 = Math.min(m.cw - 1, Math.floor(xe / CH));
    const cy0 = Math.max(0, Math.floor(ys / CH)), cy1 = Math.min(Math.ceil(MH / CH) - 1, Math.floor(ye / CH));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const ci = cy * m.cw + cx;
        let e = chunks.get(ci);
        if (!e) { e = { c: null, used: 0 }; chunks.set(ci, e); }
        if (!e.c || (m.dirtyCh[ci] && budget > 0)) { renderChunk(m, cx, cy, e); m.dirtyCh[ci] = 0; budget--; }
        e.used = frameNo;
        ctx.drawImage(e.c, cx * CH * T, cy * CH * T - e.pad / e.k, CH * T, e.c.height / e.k);
      }
    }
    if (chunks.size > 44) {
      const arr = [...chunks.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < arr.length - 36; i++) chunks.delete(arr[i][0]);
    }
    // 4) 되살아나는 칸 반짝임 + 물가 거품
    for (let ty = ys; ty <= ye; ty++) {
      for (let tx = xs; tx <= xe; tx++) {
        const i = ty * MW + tx, t = m.tiles[i];
        const age = s.t - m.changed[i];
        if (age >= 0 && age < 0.55) {
          const h = TH[t], vi = (U.hash2(tx, ty, 9) * 6) | 0;
          const q = age / 0.55, sc = 1 + 0.32 * Math.sin(q * Math.PI) * (1 - q * 0.5), lift = Math.sin(q * Math.PI) * 5;
          const X = tx * T, Y = ty * T - h;
          ctx.drawImage(A.tile(t, vi, 0), X + T / 2 - T * sc / 2, Y - lift + T / 2 - T * sc / 2, T * sc, T * sc);
          ctx.fillStyle = `rgba(200,255,230,${((1 - q) * 0.55).toFixed(2)})`;
          ctx.fillRect(X, Y - lift, T, T);
        }
        if (t === TL.SEA && m.shore[i]) {
          const a = 0.28 + 0.22 * Math.sin(time * 2.4 + tx * 0.7 + ty * 0.5);
          ctx.fillStyle = `rgba(235,250,255,${a.toFixed(2)})`;
          const w = 3 + Math.sin(time * 2.4 + tx) * 1.5, X = tx * T, Y = ty * T + 7;
          const tAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? TL.SEA : m.tiles[y * MW + x];
          if (tAt(tx, ty - 1) !== TL.SEA) ctx.fillRect(X, Y, T, w);
          if (tAt(tx, ty + 1) !== TL.SEA) ctx.fillRect(X, Y + T - w, T, w);
          if (tAt(tx - 1, ty) !== TL.SEA) ctx.fillRect(X, Y, w, T);
          if (tAt(tx + 1, ty) !== TL.SEA) ctx.fillRect(X + T - w, Y, w, T);
        }
      }
    }
    // 구름 그림자
    if (!opt.lite) {
      ctx.globalAlpha = s.storm ? 0.5 : 0.22;
      for (let k = 0; k < 4; k++) {
        const span = MW * T + 800;
        const cx = ((k * 640 + time * 14 + (s.storm ? time * 40 : 0)) % span) - 400, cy = (k * 457) % (MH * T);
        ctx.drawImage(cloud, cx, cy, 520, 520);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ── 땅 위 표시 (장판·예고·함정) ─────────────────────────
  function drawDecals(s) {
    worldT();
    for (const z of s.zones) {
      if (z.k === 'oil') {
        const a = Math.min(1, z.life / 1.5) * 0.85;
        ctx.fillStyle = `rgba(20,20,26,${a})`;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(110,80,160,${a * 0.5})`;
        ctx.beginPath(); ctx.ellipse(z.x - z.r * 0.3, z.y - z.r * 0.2, z.r * 0.35, z.r * 0.15, 0.3, 0, TAU); ctx.fill();
      } else if (z.k === 'ink') {
        const a = Math.min(1, z.life / 0.6, (z.max - z.life) / 0.25 + 0.2);
        ctx.fillStyle = `rgba(36,28,52,${(0.55 * a).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.82, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(120,90,160,${(0.6 * a).toFixed(3)})`; ctx.lineWidth = 2;
        const sp = z.pull ? time * 4 : time * 1.2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * (0.35 + k * 0.22), z.r * (0.28 + k * 0.18), 0, sp + k * 2, sp + k * 2 + 2.2); ctx.stroke(); }
      } else if (z.k === 'algae') {
        const a = Math.min(1, z.life / 1.5) * 0.8;
        ctx.fillStyle = `rgba(70,140,50,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(190,240,120,${(a * 0.6).toFixed(3)})`;
        for (let k = 0; k < 4; k++) { const bx = z.x + Math.cos(k * 1.7 + time) * z.r * 0.5, by = z.y + Math.sin(k * 2.3) * z.r * 0.35; ctx.beginPath(); ctx.arc(bx, by, 2.5 + Math.sin(time * 4 + k) * 1, 0, TAU); ctx.fill(); }
      } else if (z.k === 'mud') {
        ctx.fillStyle = `rgba(110,80,50,${Math.min(1, z.life) * 0.55})`;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.75, 0, 0, TAU); ctx.fill();
      } else if (z.k === 'slam') {
        const q = 1 - z.delay / z.max;
        ctx.fillStyle = `rgba(255,60,60,${0.12 + q * 0.18})`;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.8, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,80,80,${0.5 + 0.5 * Math.sin(time * 20)})`; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,90,90,0.35)';
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * q, z.r * 0.8 * q, 0, 0, TAU); ctx.fill();
      }
    }
    // 보스 돌진 예고
    const b = s.boss;
    if (b && b.st.ph === 'aim' && b.type === 'dozer') {
      const len = 560, w = b.r * 1.9;
      const ang = Math.atan2(b.st.ay, b.st.ax);
      ctx.setTransform(K * Math.cos(ang), K * Math.sin(ang), -K * Math.sin(ang), K * Math.cos(ang), b.x * K + ox, b.y * K + oy);
      ctx.fillStyle = `rgba(255,50,40,${0.16 + 0.1 * Math.sin(time * 24)})`;
      ctx.fillRect(0, -w / 2, len, w);
      ctx.fillStyle = 'rgba(255,90,70,0.55)';
      for (let k = 0; k < 5; k++) {
        const x = ((time * 260 + k * 112) % len);
        ctx.beginPath(); ctx.moveTo(x, -w * 0.3); ctx.lineTo(x + 22, 0); ctx.lineTo(x, w * 0.3); ctx.lineTo(x + 8, 0); ctx.closePath(); ctx.fill();
      }
      worldT();
    }
    // 열 고리 (바다 열돔)
    for (const h of s.hrings) {
      const a = 1 - h.r / h.max;
      ctx.lineWidth = 12; ctx.strokeStyle = `rgba(255,120,40,${(0.45 * a + 0.1).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.85, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,230,140,${(0.9 * a + 0.1).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.85, 0, 0, TAU); ctx.stroke();
    }
    // 갯지렁이 함정
    for (const mi of s.mines) {
      const armed = mi.arm <= 0;
      drawSpr(A.spr('burrow'), mi.x, mi.y, 0, { sx: armed ? 1 + Math.sin(time * 8 + mi.t0) * 0.06 : 0.8, sy: armed ? 1 : 0.8 });
    }
    worldT();
    // 밀물 고리
    for (const n of s.novas) {
      if (n.delay > 0) continue;
      const a = 1 - n.r / n.max;
      ctx.lineWidth = 16; ctx.strokeStyle = `rgba(90,180,240,${0.35 * a})`;
      ctx.beginPath(); ctx.ellipse(n.x, n.y, n.r, n.r * 0.85, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = `rgba(235,250,255,${0.85 * a})`;
      ctx.beginPath(); ctx.ellipse(n.x, n.y, n.r, n.r * 0.85, 0, 0, TAU); ctx.stroke();
    }
    // 잘피 숲 (오라)
    for (const w of s.weapons) {
      if (w.id !== 'grass' || !w.st) continue;
      const p = s.p, r = w.st.rad, pulse = Math.max(0, 1 - (s.t - w.pulse) / 0.3);
      ctx.fillStyle = `rgba(70,200,120,${0.1 + pulse * 0.1})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.85, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(120,240,160,${0.35 + pulse * 0.4})`; ctx.lineWidth = 2;
      ctx.stroke();
      const n = opt.lite ? 10 : 18;
      for (let k = 0; k < n; k++) {
        const a = k / n * TAU + time * 0.6, bx = p.x + Math.cos(a) * r * 0.92, by = p.y + Math.sin(a) * r * 0.78;
        const sway = Math.sin(time * 3 + k) * 3;
        ctx.strokeStyle = k % 2 ? '#5fd17a' : '#3f9a5a'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + sway, by - 7, bx + sway * 1.6, by - 13 - pulse * 4); ctx.stroke();
      }
    }
    // 고리 이펙트
    for (const r of rings) {
      const q = r.t / r.life, rr = r.r * U.outCubic(q);
      ctx.strokeStyle = r.col + (1 - q) * 0.9 + ')'; ctx.lineWidth = r.w * (1 - q * 0.5);
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rr, rr * 0.85, 0, 0, TAU); ctx.stroke();
    }
    // 승리 물결
    if (s.victory) {
      const v = s.victory;
      ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(120,255,200,0.35)';
      ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r, v.r * 0.9, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(230,255,245,0.9)';
      ctx.beginPath(); ctx.ellipse(v.x, v.y, v.r, v.r * 0.9, 0, 0, TAU); ctx.stroke();
    }
  }

  // ── 생물·물체 ───────────────────────────────────────────
  function wrap(i, k, y, ref, extra) {
    let o = pool[i];
    if (!o) o = pool[i] = {};
    o.k = k; o.y = y; o.ref = ref; o.ex = extra;
    return o;
  }
  const FLOAT = { bag: 1, jelly: 1, smog: 1 };
  function drawEntities(s) {
    const p = s.p, list = [];
    const hw = W / 2 / zoom + 90, hh = H / 2 / zoom + 120;
    const vis = (x, y) => Math.abs(x - cam.x) < hw && Math.abs(y - cam.y) < hh;
    let n = 0;
    for (const e of s.enemies) if (!e.dead && vis(e.x, e.y)) list.push(wrap(n++, 'e', e.y, e));
    for (const it of s.items) if (vis(it.x, it.y)) list.push(wrap(n++, 'i', it.y, it));
    for (const f of s.followers) list.push(wrap(n++, 'f', f.y, f));
    for (const w of s.weapons) if (w.id === 'claw') for (const q of w.pos) list.push(wrap(n++, 'o', q.y, q, w));
    for (const sh of s.shots) if (sh.k === 'lob' || sh.k === 'dash' || sh.k === 'bird') list.push(wrap(n++, 's', sh.y, sh));
    if (s.mode !== 'dead') list.push(wrap(n++, 'p', p.y, p));
    curNoUi = !!(frameOpt && frameOpt.noUi);
    list.sort((a, b) => a.y - b.y);
    // 그림자
    worldT();
    ctx.fillStyle = 'rgba(12,22,34,0.28)';
    ctx.beginPath();
    for (const o of list) {
      const r = o.k === 'e' ? o.ref.r : o.k === 'p' ? 11 : o.k === 'i' ? 9 : 7;
      const x = o.ref.x, y = o.ref.y + 2;
      ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.38, 0, 0, TAU);
    }
    ctx.fill();
    // 보석 (땅에 붙어 있어요)
    for (const g of s.gems) {
      if (!vis(g.x, g.y)) continue;
      const sp = A.spr(g.tier === 2 ? 'gem3' : g.tier === 1 ? 'gem2' : 'gem1');
      const z = 3 + Math.sin(time * 5 + g.x * 0.1) * 1.5;
      if (!opt.lite && g.tier) { worldT(); drawGlow(g.tier === 2 ? 'rgba(255,200,60,0.9)' : 'rgba(60,240,200,0.8)', g.x, g.y - z - 4, 10); }
      drawSpr(sp, g.x, g.y, z);
    }
    for (const o of list) {
      if (o.k === 'e') drawEnemy(s, o.ref);
      else if (o.k === 'p') drawPlayer(s);
      else if (o.k === 'f') {
        const f = o.ref, sp = A.spr(f.model, Math.floor(time * 6 + f.k) % 2);
        const nxt = s.p.trail[Math.max(0, 7 * (f.k + 1) - 3)] || s.p;
        drawSpr(sp, f.x, f.y, Math.abs(Math.sin(time * 9 + f.k)) * 3, { sx: 0.82, sy: 0.82, flip: nxt.x < f.x - 0.5 });
      } else if (o.k === 'o') {
        const q = o.ref, big = o.ex.evo ? 0.85 : 0.62;
        drawSpr(A.spr('crab', Math.floor(time * 8 + q.a * 3) % 2), q.x, q.y, 3, { sx: big, sy: big, rot: Math.sin(time * 10 + q.a) * 0.15 });
      } else if (o.k === 'i') {
        const it = o.ref, z = 4 + Math.sin(time * 4 + it.x) * 3;
        worldT();
        if (it.k === 'chest') drawGlow('rgba(255,210,90,0.9)', it.x, it.y - 10, 30 + Math.sin(time * 6) * 4, 0.9);
        else drawGlow(it.k === 'heal' ? 'rgba(255,90,120,0.8)' : 'rgba(120,180,255,0.8)', it.x, it.y - 8, 18);
        drawSpr(A.spr(it.k === 'chest' ? 'chest' : it.k === 'heal' ? 'heart' : 'magnet'), it.x, it.y, z);
      } else if (o.k === 's') {
        const sh = o.ref;
        if (sh.k === 'lob') drawSpr(A.spr('mudskipper', 1), sh.x, sh.y, sh.z, { sx: 0.8, sy: 0.8, flip: sh.tx < sh.x0, rot: (sh.tx < sh.x0 ? 1 : -1) * (0.9 - sh.tt / sh.flight * 1.8) });
        else if (sh.k === 'dash') {
          const z = 4 + Math.abs(Math.sin(sh.trav / 45)) * 10;
          drawSpr(A.spr('porpoise', Math.floor(time * 8) % 2), sh.x, sh.y, z, { sx: sh.r / 16, sy: sh.r / 16, flip: sh.dx < 0, rot: U.clamp(sh.dy / (Math.abs(sh.dx) + 0.3), -0.7, 0.7) * (sh.dx < 0 ? -1 : 1) });
          if (!opt.lite && Math.random() < 0.5) part({ k: 'drop', x: sh.x, y: sh.y, z: 2, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 20, vz: 60, s: 2.2, c: '#bfe8ff', t: 0, life: 0.45 });
        } else if (sh.k === 'bird') drawSpr(A.spr('spoonbill', Math.floor(time * 10) % 2), sh.x, sh.y, 22, { sx: 0.7, sy: 0.7, flip: sh.vx < 0 });
      }
    }
  }

  function drawEnemy(s, e) {
    const d = e.def;
    const model = d.model;
    const meta = A.MODELS[model];
    let f = 0;
    if (model === 'micro') f = e.v;
    else if (meta && meta.frames > 1) f = Math.floor(time * (d.roll ? (e.st.ph === 'dash' ? 24 : 10) : d.spin ? 6 : 4) + e.id) % meta.frames;
    const sp = A.spr(model, f);
    const sc = e.r / d.r;
    let z = FLOAT[model] ? 4 + Math.sin(time * 3 + e.ph) * 2.5 : Math.abs(Math.sin(time * 7 + e.ph)) * (e.boss ? 0 : 1.6);
    let sy = 1 + Math.sin(time * 9 + e.ph) * 0.05, sxx = 2 - sy;
    let x = e.x, rot = 0;
    if (e.beh === 'charge') {
      if (e.st.ph === 'aim') { x += Math.sin(time * 60) * 1.5; sy = 0.9; sxx = 1.1; }
      else if (e.st.ph === 'dash') rot = Math.atan2(e.st.ay, Math.abs(e.st.ax)) * 0.5 * (e.st.ax < 0 ? -1 : 1);
    }
    if (e.boss && e.st.ph === 'aim') x += Math.sin(time * 50) * 2;
    worldT();
    if (e.elite) drawGlow('rgba(255,70,70,0.75)', e.x, e.y - e.r * 0.6, e.r * 2.1, 0.55 + 0.25 * Math.sin(time * 6));
    if (e.boss) drawGlow('rgba(255,60,40,0.6)', e.x, e.y - e.r * 0.5, e.r * 2.4, 0.5);
    if (d.spin) rot = Math.sin(time * 3 + e.ph) * 0.25;
    if (e.boss && d.model === 'heatDome') { worldT(); drawGlow('rgba(255,150,40,0.7)', e.x, e.y - e.r, e.r * 3, 0.5 + 0.2 * Math.sin(time * 5)); }
    const facing = model === 'bottle' || model === 'dozer' || model === 'tanker';
    const fl = e.flash > 0, fo = { sx: sxx * sc, sy: sy * sc, flash: fl && !e.boss, flip: facing ? e.face < 0 : false, rot, alpha: model === 'bag' ? 0.93 : null };
    drawSpr(sp, x, e.y, z, fo);
    if (fl && e.boss) { fo.flash = true; fo.alpha = 0.45; drawSpr(sp, x, e.y, z, fo); }
    if (e.elite) {
      worldT();
      const w = e.r * 2, q = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(10,15,25,0.7)'; ctx.fillRect(e.x - w / 2 - 1, e.y + 5, w + 2, 5);
      ctx.fillStyle = '#ff5a5a'; ctx.fillRect(e.x - w / 2, e.y + 6, w * q, 3);
    }
  }

  let curNoUi = false, frameOpt = null;
  function drawPlayer(s) {
    const p = s.p;
    worldT();
    // 내 위치 표시 고리
    if (!curNoUi) ctx.strokeStyle = 'rgba(80,240,220,0.85)'; ctx.lineWidth = 2;
    if (!curNoUi) { ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 15, 6, 0, 0, TAU); ctx.stroke(); }
    if (!curNoUi && p.onMarsh && p.hp < p.maxHp) { ctx.strokeStyle = `rgba(120,255,160,${0.4 + 0.3 * Math.sin(time * 8)})`; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 19, 8, 0, 0, TAU); ctx.stroke(); }
    const id = s.ch.id;
    const moving = p.moving;
    const sp = A.spr(id, moving ? Math.floor(time * 9) % 2 : 0);
    const hop = moving ? Math.abs(Math.sin(time * 13)) * 2.6 : Math.sin(time * 3) * 0.6;
    const blink = p.inv > 0 && s.t - p.hurtT < 0.6 && Math.floor(time * 20) % 2 === 0;
    const flip = id !== 'crab' && p.face < 0;
    drawSpr(sp, p.x, p.y, hop, { flip, sx: 1 + (moving ? 0 : Math.sin(time * 3) * 0.02), alpha: blink ? 0.35 : null, flash: s.t - p.hurtT < 0.08 });
    // 체력 막대
    if (curNoUi) return;
    worldT();
    const w = 30, q = U.clamp(p.hp / p.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(10,15,25,0.75)'; ctx.fillRect(p.x - w / 2 - 1, p.y + 8, w + 2, 5);
    ctx.fillStyle = q > 0.5 ? '#5ef08f' : q > 0.25 ? '#ffd23f' : '#ff4d5e'; ctx.fillRect(p.x - w / 2, p.y + 9, w * q, 3);
  }

  function drawShots(s) {
    worldT();
    ctx.globalCompositeOperation = 'lighter';
    for (const sh of s.shots) {
      if (sh.k !== 'jet') continue;
      const sp = Math.hypot(sh.vx, sh.vy) || 1, ux = sh.vx / sp, uy = sh.vy / sp, len = 12 + sh.r;
      if (!opt.lite) drawGlow('rgba(90,190,255,0.9)', sh.x, sh.y, sh.r * 2.6, 0.8);
      ctx.strokeStyle = 'rgba(200,240,255,0.95)'; ctx.lineWidth = sh.r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sh.x - ux * len, sh.y - uy * len); ctx.lineTo(sh.x, sh.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const sh of s.shots) {
      if (sh.k === 'ball') {
        drawSpr(A.spr('ball', 0), sh.x, sh.y, 8 + Math.abs(Math.sin(sh.spin * 0.45)) * 12, { rot: sh.spin, sx: sh.r / 8, sy: sh.r / 8 });
      } else if (sh.k === 'bubble') {
        worldT();
        const r = sh.r * (1 + Math.sin(time * 9 + sh.x) * 0.08);
        ctx.fillStyle = 'rgba(150,220,255,0.28)'; ctx.strokeStyle = 'rgba(220,245,255,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sh.x, sh.y - 10, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(sh.x - r * 0.45, sh.y - 10 - r * 0.5, 2.2, 2.2);
      }
    }
    worldT();
    for (const b of s.eshots) {
      if (b.k === 'spore') {
        drawGlow('rgba(140,230,90,0.8)', b.x, b.y - 6, b.r * 2, 0.6);
        ctx.fillStyle = '#4a9238'; ctx.beginPath(); ctx.arc(b.x, b.y - 6, b.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8f08a'; ctx.beginPath(); ctx.arc(b.x - 2, b.y - 8, b.r * 0.35, 0, TAU); ctx.fill();
      } else if (b.k === 'net') {
        ctx.save(); ctx.translate(b.x, b.y - 6); ctx.rotate(time * 6);
        ctx.strokeStyle = '#5fb07f'; ctx.lineWidth = 1.6;
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-b.r, k * 5); ctx.lineTo(b.r, k * 5); ctx.moveTo(k * 5, -b.r); ctx.lineTo(k * 5, b.r); ctx.stroke(); }
        ctx.fillStyle = '#f08a24'; ctx.fillRect(-2, -2, 4, 4);
        ctx.restore(); worldT();
      } else {
        drawGlow('rgba(255,80,60,0.8)', b.x, b.y - 6, b.r * 2, 0.6);
        ctx.fillStyle = '#3d4049'; ctx.beginPath(); ctx.arc(b.x, b.y - 6, b.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(b.x, b.y - 6, b.r * 0.4, 0, TAU); ctx.fill();
      }
    }
    // 휩쓸기 초승달
    for (const w of sweeps) {
      const q = w.t / w.life, rx = w.w * (0.72 + 0.28 * U.outCubic(q)), ry = w.h * 0.62, cw = w.dir < 0;
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - q)})`;
      ctx.beginPath();
      ctx.ellipse(w.x, w.y - 8, rx, ry, 0, -Math.PI / 2, Math.PI / 2, cw);
      ctx.ellipse(w.x, w.y - 8, rx * 0.6, ry * 0.8, 0, Math.PI / 2, -Math.PI / 2, !cw);
      ctx.fill();
      ctx.strokeStyle = `rgba(190,240,255,${0.9 * (1 - q)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(w.x, w.y - 8, rx, ry, 0, -Math.PI / 2, Math.PI / 2, cw); ctx.stroke();
    }
    // 바다로 떨어지는 통 (유조선 공격)
    for (const z of s.zones) {
      if (!z.barrel) continue;
      const q = 1 - z.delay / z.max;
      const x = U.lerp(z.sx, z.x, q), y = U.lerp(z.sy, z.y, q), h = Math.sin(q * Math.PI) * 140;
      drawSpr(A.spr('barrel'), x, y, h, { sx: 0.6, sy: 0.6, rot: q * 6 });
    }
  }

  const sparkBuf = [];
  function drawParts(dt) {
    worldT();
    sparkBuf.length = 0;
    let w = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      parts[w++] = p;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const q = p.t / p.life;
      if (p.k === 'cube' || p.k === 'drop') {
        p.vz -= 520 * dt;
        if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.6; p.vy *= 0.6; }
        const sz = p.s * (q > 0.7 ? (1 - q) / 0.3 : 1);
        ctx.fillStyle = p.cF; ctx.fillRect(p.x - sz / 2, p.y - p.z - sz * 0.2, sz, sz * 0.75);
        ctx.fillStyle = p.cT; ctx.fillRect(p.x - sz / 2, p.y - p.z - sz * 0.7, sz, sz * 0.5);
      } else if (p.k === 'spark') {
        p.vz -= 60 * dt;
        sparkBuf.push(p);
      } else if (p.k === 'smoke') {
        const r = p.s * (1 + q * 1.6);
        ctx.globalAlpha = 0.5 * (1 - q);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y - p.z, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.k === 'leaf') {
        ctx.fillStyle = p.c; ctx.globalAlpha = 1 - q;
        ctx.fillRect(p.x - p.s / 2 + Math.sin(p.t * 8) * 3, p.y - p.z, p.s, p.s);
        ctx.globalAlpha = 1;
      } else if (p.k === 'bubble') {
        ctx.strokeStyle = 'rgba(200,240,255,0.6)'; ctx.globalAlpha = 1 - q; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x + Math.sin(p.t * 3) * 3, p.y - p.z, p.s, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    parts.length = w;
    if (sparkBuf.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of sparkBuf) {
        const q = p.t / p.life, r = p.s * (1 - q * 0.5);
        ctx.globalAlpha = 1 - q;
        ctx.drawImage(p.g, p.x - r, p.y - p.z - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    let j = 0;
    for (let i = 0; i < rings.length; i++) { rings[i].t += dt; if (rings[i].t < rings[i].life) rings[j++] = rings[i]; }
    rings.length = j;
    j = 0;
    for (let i = 0; i < sweeps.length; i++) { sweeps[i].t += dt; if (sweeps[i].t < sweeps[i].life) sweeps[j++] = sweeps[i]; }
    sweeps.length = j;
  }

  function drawBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.t += dt;
      if (b.t > b.life) { bolts.splice(i, 1); continue; }
      const a = 1 - b.t / b.life;
      worldT();
      ctx.strokeStyle = `rgba(230,245,255,${a})`; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath();
      let x = b.x + 40, y = b.y - 420;
      ctx.moveTo(x, y);
      for (let k = 1; k <= 10; k++) { x = U.lerp(b.x + 40, b.x, k / 10) + (U.hash2(k, b.seed | 0, 3) - 0.5) * 40 * (1 - k / 10); y = U.lerp(b.y - 420, b.y, k / 10); ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow('rgba(170,210,255,1)', b.x, b.y, 50, a);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  const ATLAS = {};
  function atlas(col) {
    let a = ATLAS[col];
    if (a) return a;
    const chars = '0123456789+-', fs = 44, padX = 7;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const font = `${fs}px Jua, 'Black Han Sans', sans-serif`;
    g.font = font;
    const ws = chars.split('').map(ch => Math.ceil(g.measureText(ch).width) + padX * 2);
    c.width = ws.reduce((x, y) => x + y, 0); c.height = fs + 18;
    g.font = font; g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round';
    g.lineWidth = 9; g.strokeStyle = 'rgba(15,20,30,0.9)'; g.fillStyle = col;
    const map = {};
    let x = 0;
    chars.split('').forEach((ch, i) => { g.strokeText(ch, x + padX, c.height / 2); g.fillText(ch, x + padX, c.height / 2); map[ch] = { x, w: ws[i] }; x += ws[i]; });
    a = ATLAS[col] = { c, map, h: c.height, fs, pad: padX };
    return a;
  }
  if (root.document && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const k in ATLAS) delete ATLAS[k]; });
  function drawTexts(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let j = 0;
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      t.t += dt;
      if (t.t >= t.life) continue;
      texts[j++] = t;
      const q = t.t / t.life;
      const x = (t.x + t.vx * q) * K + ox, y = (t.y - 26 * U.outCubic(q)) * K + oy;
      const sz = t.size * K * (q < 0.15 ? 0.7 + q * 2.6 : 1.09 - q * 0.15);
      ctx.globalAlpha = q > 0.7 ? (1 - q) / 0.3 : 1;
      const str = String(t.v);
      if (/^[0-9+-]+$/.test(str)) {
        const a = atlas(t.col), sc = sz / a.fs;
        let w = 0;
        for (const ch of str) w += (a.map[ch].w - a.pad * 1.6) * sc;
        let px = x - w / 2 - a.pad * 0.8 * sc;
        for (const ch of str) {
          const m = a.map[ch];
          ctx.drawImage(a.c, m.x, 0, m.w, a.h, px, y - a.h * sc / 2, m.w * sc, a.h * sc);
          px += (m.w - a.pad * 1.6) * sc;
        }
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.font = `${Math.round(sz)}px Jua, 'Black Han Sans', sans-serif`;
        ctx.lineWidth = Math.max(2, sz * 0.22); ctx.strokeStyle = 'rgba(15,20,30,0.85)';
        ctx.strokeText(str, x, y);
        ctx.fillStyle = t.col; ctx.fillText(str, x, y);
      }
    }
    texts.length = j;
    ctx.globalAlpha = 1;
  }

  function drawIndicators(s) {
    const marks = [];
    if (s.boss) marks.push({ x: s.boss.x, y: s.boss.y, c: '#ff5a5a' });
    for (const it of s.items) if (it.k === 'chest') marks.push({ x: it.x, y: it.y, c: '#ffd23f' });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const m of marks) {
      const X = sx(m.x), Y = sy(m.y);
      if (X > 0 && X < W && Y > 0 && Y < H) continue;
      const cx = W / 2, cy = H / 2, a = Math.atan2(Y - cy, X - cx);
      const pad = 26, ex = U.clamp(cx + Math.cos(a) * W, pad, W - pad), ey = U.clamp(cy + Math.sin(a) * H, pad + 40, H - pad);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = m.c; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 8);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawOverlay(s, dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const th = A.TILES.th;
    if (th && th.sky) { ctx.fillStyle = th.sky; ctx.fillRect(0, 0, cv.width, cv.height); }
    // 바닷속 빛줄기
    if (th && th.beams && !opt.lite) {
      if (!beams) beams = makeBeams();
      const off = ((time * 0.012) % 1) * cv.width;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(beams, -off, 0, cv.width * 2, cv.height);
      ctx.drawImage(beams, cv.width * 2 - off, 0, cv.width * 2, cv.height);
      ctx.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.3) part({ k: 'bubble', x: cam.x + (Math.random() - 0.5) * W / zoom, y: cam.y + (Math.random() - 0.2) * H / zoom * 0.6, z: 0, vx: 0, vy: 0, vz: 25, s: 1.5 + Math.random() * 2, t: 0, life: 2.5 });
    }
    // 태풍
    if (s.storm) {
      const st = s.storm, k = U.clamp(Math.min(s.t - st.t0, st.end - s.t) / 2, 0, 1);
      ctx.fillStyle = `rgba(14,24,44,${(0.38 * k).toFixed(3)})`; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = `rgba(190,215,255,${(0.35 * k).toFixed(3)})`; ctx.lineWidth = Math.max(1, dpr);
      const n = opt.lite ? 50 : 140, wx = st.wx / 75;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (U.hash2(i, 1, 2) * cv.width + time * (300 + wx * 400) * dpr + i * 37) % cv.width;
        const y = (U.hash2(i, 2, 3) * cv.height + time * 900 * dpr) % cv.height;
        ctx.moveTo(x, y); ctx.lineTo(x + wx * 14 * dpr, y + 18 * dpr);
      }
      ctx.stroke();
    }
    // 노을 + 비네트 (색이 바뀔 때만 다시 그려요)
    const q = U.clamp(s.t / (s.stage.bossAt || 270), 0, 1.2);
    const dusk = q > 0.35 ? Math.round(U.clamp((q - 0.35) / 0.65, 0, 1) * 12) / 12 : 0;
    if (!vignette || dusk !== vigLv) { vignette = makeVignette(dusk); vigLv = dusk; }
    ctx.drawImage(vignette, 0, 0, cv.width, cv.height);
    // 체력이 낮을 때 붉은 테두리
    const p = s.p, low = s.mode === 'play' ? U.clamp(1 - p.hp / p.maxHp / 0.35, 0, 1) : 0;
    cam.red = Math.max(0, cam.red - dt * 2);
    const ra = Math.max(low * (0.55 + 0.45 * Math.sin(time * 6)), cam.red * 0.8);
    if (ra > 0.01) {
      if (!redEdge) redEdge = makeRedEdge();
      ctx.globalAlpha = Math.min(1, ra);
      ctx.drawImage(redEdge, 0, 0, cv.width, cv.height);
      ctx.globalAlpha = 1;
    }
    if (cam.flash > 0.01) {
      ctx.fillStyle = `rgba(${cam.flashCol},${cam.flash.toFixed(3)})`; ctx.fillRect(0, 0, cv.width, cv.height);
      cam.flash *= Math.exp(-dt * 9);
    }
  }

  function drawJoy() {
    if (!joy || !joy.on) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.x0, joy.y0, 54, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(joy.x0 + joy.dx * 54, joy.y0 + joy.dy * 54, 24, 0, TAU); ctx.fill();
  }

  // ── 한 장면 ────────────────────────────────────────────
  function frame(s, dt, o) {
    time += dt;
    o = o || {};
    frameOpt = o;
    if (A.TILES.theme !== s.stage.key || A.TILES.bs !== BS) A.setTheme(s.stage.key, BS);
    const p = s.p;
    const follow = 1 - Math.exp(-dt * 8);
    const tx = p.x + (o.camOff ? o.camOff.x : 0), ty = p.y + (o.camOff ? o.camOff.y : 0);
    if (o.snap) { cam.x = tx; cam.y = ty; }
    cam.x += (tx - cam.x) * follow; cam.y += (ty - cam.y) * follow;
    cam.shake *= Math.exp(-dt * 10); cam.punch *= Math.exp(-dt * 6);
    const sh = cam.shake > 0.3 ? cam.shake : 0;
    cam.sx = (Math.random() - 0.5) * sh * dpr; cam.sy = (Math.random() - 0.5) * sh * dpr;
    const zk = 1 + cam.punch * 0.07;
    K = zoom * dpr * zk;
    ox = cv.width / 2 - cam.x * K + cam.sx; oy = cv.height / 2 - cam.y * K + cam.sy;
    ctx.imageSmoothingEnabled = false;
    const P = prof.on ? performance.now.bind(performance) : null;
    let q0 = P ? P() : 0, q1;
    drawGround(s); if (P) { q1 = P(); prof.ground += q1 - q0; q0 = q1; }
    drawDecals(s); if (P) { q1 = P(); prof.decals += q1 - q0; q0 = q1; }
    drawEntities(s); if (P) { q1 = P(); prof.ents += q1 - q0; q0 = q1; }
    drawShots(s); if (P) { q1 = P(); prof.shots += q1 - q0; q0 = q1; }
    drawParts(dt); if (P) { q1 = P(); prof.parts += q1 - q0; q0 = q1; }
    drawBolts(dt);
    drawTexts(dt); if (P) { q1 = P(); prof.texts += q1 - q0; q0 = q1; }
    K = zoom * dpr;
    drawOverlay(s, dt); if (P) { q1 = P(); prof.over += q1 - q0; q0 = q1; prof.n++; }
    if (!o.noUi) { drawIndicators(s); drawJoy(); }
  }

  // 결과 화면용 작은 지도
  const MINI = { 0: '#1f5677', 1: '#4f5a57', 2: '#6d675d', 3: '#9a7550', 4: '#6aa84f', 5: '#3ca7a8', 6: '#b8b6ae' };
  function minimap(tiles, px) {
    const c = document.createElement('canvas'); c.width = MW * px; c.height = MH * px;
    const g = c.getContext('2d');
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { g.fillStyle = MINI[tiles[y * MW + x]]; g.fillRect(x * px, y * px, px, px); }
    return c;
  }

  function reset() { parts.length = 0; texts.length = 0; rings.length = 0; sweeps.length = 0; bolts.length = 0; cam.flash = 0; cam.shake = 0; cam.red = 0; }

  const prof = { on: false, ground: 0, decals: 0, ents: 0, shots: 0, parts: 0, texts: 0, over: 0, n: 0 };
  GS.render = {
    prof,
    stats() { return { parts: parts.length, texts: texts.length, rings: rings.length }; },
    init, resize, view, frame, fx, setOpt, reset, minimap,
    setJoy(j) { joy = j; },
    get zoom() { return zoom; },
    screenOf(x, y) { return { x: sx(x), y: sy(y) }; },
  };
})(typeof window !== 'undefined' ? window : globalThis);

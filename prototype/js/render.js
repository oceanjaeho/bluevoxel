/*
 * 블루복셀 — 아이소메트릭 복셀 렌더러 + 이펙트 (Canvas 2D, 외부 라이브러리 없음)
 * 높이 = 물때 구역. 밀물·썰물, 태풍 해일, CO₂ 흡수 연출, 생물 등장, 주변 생동감.
 */
(function (BV) {
  'use strict';

  var C = BV.CONFIG;
  var TW = 64, TH = 32, ZH = 14, BASE = -1.4;
  var HW = TW / 2, HH = TH / 2;
  var MW = 16, MH = 16;

  var cv = null, ctx = null, dpr = 1, vw = 1, vh = 1;
  var cam = { x: 0, y: 220, z: 1 };
  var fitCam = { x: 0, y: 220, z: 1 };
  var camTween = null;
  var S = null;
  var time = 0, tidePhase = Math.PI * 0.85, tidePaused = false, tideBoost = 1;
  var hover = -1, selected = -1, cursor = -1;
  var eligibleSet = null;
  var viewMode = 'base';
  var night = false, reduced = false, lite = false, lowDetail = false, demo = false;
  var frameAvg = 16, lw = 1;
  var shadeCache = Object.create(null);
  var particles = [], floaters = [], rings = [], pops = [];
  var anims = Object.create(null);
  var critters = [], flock = null, porpoise = null, nextFlock = 6, nextPorpoise = 4;
  var fishes = [], nextFish = 2;
  var shake = 0, flashA = 0, flashRGB = [255, 255, 255];
  var dusk = 0, duskTo = 0, storm = 0, stormTo = 0, heat = 0, heatTo = 0;
  var bolt = null, nextBolt = 0.6, shieldSet = null;
  var sky = ['#cfe1e5', '#eef3f0'];
  var accent = [163, 48, 77];
  var presentKey = '';
  var glowCache = Object.create(null);
  var spriteCv = Object.create(null);
  var growF = 1;

  var TOP = {
    sea: '#4d6f78', shallow: '#88917a', seagrass: '#7f916c', creek: '#727c6a',
    mudflat: '#8f7f69', upper: '#a9997c', marsh: '#8b785f', field: '#a5b45f', pond: '#a2947c',
    wall: '#aaaeae', gate: '#9ba2a4', land: '#93b56c', farm: '#a5bd6c', village: '#c8c0a4',
    port: '#ada493', forest: '#618c50', hill: '#7ca35f', island: '#8c9a6c', industry: '#a2a6aa',
    resort: '#d4cec0', solar: '#a09c89'
  };
  var BODY = {
    sea: '#5b6056', shallow: '#636150', seagrass: '#636150', creek: '#5f5c4d',
    mudflat: '#6f5e4c', upper: '#7b6953', marsh: '#6c5945', field: '#7d6b50', pond: '#7d6b50',
    wall: '#8e9293', gate: '#868c8e', land: '#8b7051', farm: '#8b7051', village: '#8b7051',
    port: '#908879', forest: '#7e6549', hill: '#867b6b', island: '#807667', industry: '#8d9093',
    resort: '#8d9093', solar: '#7d6b50'
  };
  var BEDROCK = '#4e453c';
  var CARBON_RGB = [40, 33, 28];
  var WATER_DAY = [[106, 164, 158], [36, 84, 104]];
  var WATER_NIGHT = [[40, 74, 92], [12, 30, 46]];
  var NIGHT_RGB = [14, 27, 43];
  var ROOFS = ['#3f6fa8', '#c8643b', '#3f8f8a', '#5f8f4b', '#b8504a', '#3f6fa8'];
  var MARSH_COLS = ['#a8324f', '#c2454f', '#8e2f4f', '#b03a46', '#6f9a4a', '#a8324f'];
  var RGB = {
    cyan: [90, 200, 255], gold: [255, 206, 90], green: [120, 230, 150], red: [255, 105, 85],
    white: [255, 255, 255], blue: [80, 150, 255], grey: [150, 150, 150], pink: [255, 120, 160]
  };

  /* ---------- 색 ---------- */
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbStr(c, a) {
    if (a === undefined) return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function nightify(c) { return night ? mix(c, NIGHT_RGB, 0.46) : c; }
  function col(hex, f) {
    var key = hex + f + (night ? 'n' : 'd');
    var v = shadeCache[key];
    if (!v) { var c = nightify(hex2rgb(hex)); v = shadeCache[key] = rgbStr([c[0] * f, c[1] * f, c[2] * f]); }
    return v;
  }
  function colRgb(c, f) {
    var key = (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + '|' + f + (night ? 'n' : 'd');
    var v = shadeCache[key];
    if (!v) { var n = nightify(c); v = shadeCache[key] = rgbStr([n[0] * f, n[1] * f, n[2] * f]); }
    return v;
  }
  function glow(name) {
    if (glowCache[name]) return glowCache[name];
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var rgb = RGB[name] || RGB.white;
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgbStr([255, 255, 255], 1));
    gr.addColorStop(0.25, rgbStr(rgb, 0.9));
    gr.addColorStop(1, rgbStr(rgb, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowCache[name] = c;
    return c;
  }
  function pixelSprite(id) {
    if (spriteCv[id]) return spriteCv[id];
    var rows = BV.SPRITES[id];
    if (!rows) return null;
    var c = document.createElement('canvas');
    c.width = c.height = 12;
    var g = c.getContext('2d');
    for (var y = 0; y < 12; y++) for (var x = 0; x < 12; x++) {
      var ch = rows[y][x];
      if (ch !== '.' && BV.PALETTE[ch]) { g.fillStyle = BV.PALETTE[ch]; g.fillRect(x, y, 1, 1); }
    }
    spriteCv[id] = c;
    return c;
  }

  /* ---------- 투영과 도형 ---------- */
  function ix(x, y) { return (x - y) * HW; }
  function iy(x, y, z) { return (x + y) * HH - z * ZH; }
  function tileAt(x, y) { if (x < 0 || y < 0 || x >= MW || y >= MH) return null; return S.tiles[y * MW + x]; }
  function noise(x, y, k) { return BV.sim.noise(x, y, k); }
  function easeOutBack(p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  function easeInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

  function quad(ax, ay, bx, by, cx, cy, dx, dy, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = fill; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function topQuad(x, y, z, fill, stroke) {
    quad(ix(x, y), iy(x, y, z), ix(x + 1, y), iy(x + 1, y, z), ix(x + 1, y + 1), iy(x + 1, y + 1, z), ix(x, y + 1), iy(x, y + 1, z), fill, stroke);
  }
  function topInset(x, y, z, m, fill) {
    quad(ix(x + m, y + m), iy(x + m, y + m, z), ix(x + 1 - m, y + m), iy(x + 1 - m, y + m, z),
      ix(x + 1 - m, y + 1 - m), iy(x + 1 - m, y + 1 - m, z), ix(x + m, y + 1 - m), iy(x + m, y + 1 - m, z), fill);
  }
  function sideL(x, y, z0, z1, fill) {
    quad(ix(x, y + 1), iy(x, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z1), ix(x, y + 1), iy(x, y + 1, z1), fill, true);
  }
  function sideR(x, y, z0, z1, fill) {
    quad(ix(x + 1, y), iy(x + 1, y, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z1), ix(x + 1, y), iy(x + 1, y, z1), fill, true);
  }
  function cube(x0, y0, z0, sx, sy, sz, hex) { cubeF(x0, y0, z0, sx, sy, sz, hex, 1); }
  function cubeF(x0, y0, z0, sx, sy, sz, hex, f) {
    var x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
    quad(ix(x0, y1), iy(x0, y1, z0), ix(x1, y1), iy(x1, y1, z0), ix(x1, y1), iy(x1, y1, z1), ix(x0, y1), iy(x0, y1, z1), col(hex, 0.8 * f));
    quad(ix(x1, y0), iy(x1, y0, z0), ix(x1, y1), iy(x1, y1, z0), ix(x1, y1), iy(x1, y1, z1), ix(x1, y0), iy(x1, y0, z1), col(hex, 0.64 * f));
    quad(ix(x0, y0), iy(x0, y0, z1), ix(x1, y0), iy(x1, y0, z1), ix(x1, y1), iy(x1, y1, z1), ix(x0, y1), iy(x0, y1, z1), col(hex, f));
  }
  function roof(x0, y0, z0, sx, sy, hr, hex, wallHex) {
    var x1 = x0 + sx, y1 = y0 + sy, ym = y0 + sy / 2, zr = z0 + hr;
    quad(ix(x0, y0), iy(x0, y0, z0), ix(x1, y0), iy(x1, y0, z0), ix(x1, ym), iy(x1, ym, zr), ix(x0, ym), iy(x0, ym, zr), col(hex, 0.95));
    quad(ix(x0, y1), iy(x0, y1, z0), ix(x1, y1), iy(x1, y1, z0), ix(x1, ym), iy(x1, ym, zr), ix(x0, ym), iy(x0, ym, zr), col(hex, 0.76));
    ctx.beginPath();
    ctx.moveTo(ix(x1, y0), iy(x1, y0, z0)); ctx.lineTo(ix(x1, y1), iy(x1, y1, z0)); ctx.lineTo(ix(x1, ym), iy(x1, ym, zr));
    ctx.closePath(); ctx.fillStyle = col(wallHex, 0.64); ctx.fill();
  }
  function diamond(cx, cy, z, r) {
    ctx.beginPath();
    ctx.moveTo(ix(cx - r, cy - r), iy(cx - r, cy - r, z)); ctx.lineTo(ix(cx + r, cy - r), iy(cx + r, cy - r, z));
    ctx.lineTo(ix(cx + r, cy + r), iy(cx + r, cy + r, z)); ctx.lineTo(ix(cx - r, cy + r), iy(cx - r, cy + r, z));
    ctx.closePath();
  }
  function drawGlow(name, wx, wy, size, alpha) {
    var g = glow(name);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(g, wx - size / 2, wy - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  /* ---------- 물때 ---------- */
  function slr() { return S ? (Math.min(S.year, C.END_YEAR) - C.START_YEAR) * C.SLR_PER_YEAR : 0; }
  function waterLevel() { return C.TIDE_MID + slr() + C.TIDE_AMP * Math.sin(tidePhase) + storm * 0.75; }
  function surfaceZ(t, wl) { return BV.TIDAL[t.type] ? Math.max(t.h, wl) : t.h; }

  /* ---------- 칸 애니메이션 ---------- */
  function animState(i) {
    var a = anims[i];
    var out = { lift: 0, grow: 1, flood: -1 };
    if (a) {
      var p = (time - a.t0) / a.dur;
      if (p >= 1) delete anims[i];
      else if (p >= 0) {
        if (a.kind === 'pop') { out.lift = 0.5 * Math.exp(-5 * p) * Math.sin(p * 16); out.grow = easeOutBack(Math.min(1, p * 1.5)); }
        else if (a.kind === 'grow') out.grow = easeOutBack(Math.min(1, p * 1.3));
        else if (a.kind === 'sink') out.lift = -0.4 * Math.exp(-4 * p) * Math.sin(p * 11);
        else if (a.kind === 'flood') { out.flood = p; out.lift = 0.12 * Math.exp(-5 * p) * Math.sin(p * 12); }
        else if (a.kind === 'shake') out.lift = 0.1 * Math.exp(-6 * p) * Math.sin(p * 40);
      }
    }
    if (i === hover && !demo) out.lift += 0.07;
    return out;
  }

  /* ---------- 지형 ---------- */
  function bodyRgb(t) {
    var base = hex2rgb(BODY[t.type] || '#6f5e4c');
    return t.carbon > 0 ? mix(base, CARBON_RGB, Math.min(1, t.carbon / 1000) * 0.8) : base;
  }
  function bandsFor(t, z0, z1, fn, f) {
    var top = Math.max(z0, z1 - 0.3);
    if (z0 < 0) fn(t.x, t.y, z0, Math.min(0, top), col(BEDROCK, f));
    var b0 = Math.max(z0, 0);
    if (b0 < top) fn(t.x, t.y, b0, top, colRgb(bodyRgb(t), f));
    fn(t.x, t.y, top, z1, col(TOP[t.type], f * 0.95));
  }
  function drawSides(t) {
    var nl = tileAt(t.x, t.y + 1), nr = tileAt(t.x + 1, t.y);
    var zl = nl ? Math.min(nl.h, t.h) : BASE;
    var zr = nr ? Math.min(nr.h, t.h) : BASE;
    if (zl < t.h) bandsFor(t, zl, t.h, sideL, 0.84);
    if (zr < t.h) bandsFor(t, zr, t.h, sideR, 0.68);
  }
  function drawTop(t) { topQuad(t.x, t.y, t.h, col(TOP[t.type], 0.95 + noise(t.x, t.y, 3) * 0.08), true); }

  /* ---------- 물 ---------- */
  function waterRgb(d) { var p = night ? WATER_NIGHT : WATER_DAY; return mix(p[0], p[1], Math.min(1, d / 2.4)); }
  function sideWater(x, y, z0, z1, side, fill) {
    if (z1 <= z0) return;
    if (side === 'L') quad(ix(x, y + 1), iy(x, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z1), ix(x, y + 1), iy(x, y + 1, z1), fill);
    else quad(ix(x + 1, y), iy(x + 1, y, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z1), ix(x + 1, y), iy(x + 1, y, z1), fill);
  }
  function drawWater(t, wl, flood) {
    var lvl = wl;
    if (flood >= 0) lvl = Math.max(wl, t.h + 0.55 * Math.sin(flood * Math.PI));
    else if (!BV.TIDAL[t.type]) return;
    if (lvl <= t.h) return;
    var x = t.x, y = t.y, d = lvl - t.h;
    var a = Math.min(0.84, 0.3 + d * 0.21);
    var c = waterRgb(d);
    if (heat > 0.05) c = mix(c, [190, 120, 70], heat * 0.35);
    var nl = tileAt(x, y + 1), nr = tileAt(x + 1, y);
    if (!nl || (!BV.TIDAL[nl.type] && nl.h < lvl)) sideWater(x, y, Math.max(nl ? nl.h : t.h, t.h), lvl, 'L', rgbStr(mix(c, [0, 0, 0], 0.12), Math.min(0.9, a + 0.08)));
    if (!nr || (!BV.TIDAL[nr.type] && nr.h < lvl)) sideWater(x, y, Math.max(nr ? nr.h : t.h, t.h), lvl, 'R', rgbStr(mix(c, [0, 0, 0], 0.24), Math.min(0.9, a + 0.08)));
    topQuad(x, y, lvl, rgbStr(c, a));
    if (d < 0.24) topQuad(x, y, lvl, rgbStr(night ? [150, 180, 190] : [236, 244, 240], (0.24 - d) * 1.9));
    if (!lowDetail && noise(x, y, 9) > 0.55) {
      var u = (time * 0.06 + noise(x, y, 10)) % 1;
      var gx = x + 0.15 + u * 0.7, gy = y + 0.2 + noise(x, y, 11) * 0.6;
      ctx.strokeStyle = night ? 'rgba(170,200,215,0.35)' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(ix(gx, gy), iy(gx, gy, lvl)); ctx.lineTo(ix(gx + 0.16, gy), iy(gx + 0.16, gy, lvl)); ctx.stroke();
    }
    if (storm > 0.05 && d > 0.08) {
      for (var k = 0; k < 2; k++) {
        var w = 1 - ((time * 0.9 + (x + y) * 0.23 + k * 0.5) % 1);
        ctx.strokeStyle = 'rgba(240,248,250,' + (0.7 * storm) + ')';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(ix(x + w, y), iy(x + w, y, lvl + 0.04)); ctx.lineTo(ix(x, y + w), iy(x, y + w, lvl + 0.04)); ctx.stroke();
      }
    }
  }

  /* ---------- 장식 ---------- */
  function decorUnder(t) {
    var x = t.x, y = t.y, h = t.h, k;
    if (t.type === 'seagrass') {
      var n = lowDetail ? 4 : 4 + t.stage * 3;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (k = 0; k < n; k++) {
        var u = 0.12 + noise(x, y, 20 + k) * 0.76, v = 0.12 + noise(x, y, 40 + k) * 0.76;
        var len = (0.32 + t.stage * 0.12 + noise(x, y, 60 + k) * 0.18) * growF;
        var sw = reduced || lowDetail ? 0 : Math.sin(time * 1.6 + k + x) * (0.07 + storm * 0.15);
        ctx.strokeStyle = col(k % 3 === 0 ? '#3f8f58' : '#2f7a4b', t.health < 50 ? 0.75 : 1);
        ctx.beginPath();
        ctx.moveTo(ix(x + u, y + v), iy(x + u, y + v, h));
        ctx.quadraticCurveTo(ix(x + u, y + v), iy(x + u, y + v, h + len * 0.6), ix(x + u + sw, y + v - sw), iy(x + u + sw, y + v - sw, h + len));
        ctx.stroke();
      }
      if (has('seahorse') && t.stage >= 3 && noise(x, y, 77) > 0.5) cube(x + 0.55, y + 0.4, h + 0.25 + Math.sin(time * 2 + x) * 0.05, 0.06, 0.06, 0.22, '#f0a43a');
    } else if (t.type === 'mudflat' || t.type === 'marsh' || t.type === 'upper') {
      var holes = t.type === 'mudflat' ? 5 : 3;
      for (k = 0; k < holes; k++) {
        var hu = 0.12 + noise(x, y, 80 + k) * 0.76, hv = 0.12 + noise(x, y, 90 + k) * 0.76;
        diamond(x + hu, y + hv, h, 0.05); ctx.fillStyle = col('#4a3c30', 1); ctx.fill();
      }
      if (t.type === 'mudflat' && has('worm')) for (k = 0; k < 3; k++) cube(x + 0.15 + noise(x, y, 100 + k) * 0.7, y + 0.15 + noise(x, y, 110 + k) * 0.7, h, 0.07, 0.07, 0.035, '#a38d70');
      if (t.type === 'mudflat' && has('clam')) for (k = 0; k < 3; k++) { diamond(x + 0.15 + noise(x, y, 120 + k) * 0.7, y + 0.15 + noise(x, y, 130 + k) * 0.7, h + 0.01, 0.04); ctx.fillStyle = col('#e9e2d2', 1); ctx.fill(); }
    }
  }

  function decorOver(t, wl) {
    var x = t.x, y = t.y, h = t.h, k;
    switch (t.type) {
      case 'marsh': {
        var counts = [0, 5, 9, 13];
        var n = lowDetail ? Math.ceil(counts[t.stage] / 2) : counts[t.stage];
        var items = [];
        for (k = 0; k < n; k++) items.push([0.08 + noise(x, y, 140 + k) * 0.74, 0.08 + noise(x, y, 160 + k) * 0.74, k]);
        items.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
        var dry = t.health < 50 ? 0.7 : 1;
        var sway = reduced ? 0 : Math.sin(time * 1.3 + x * 0.7 + y) * (0.012 + storm * 0.05);
        for (k = 0; k < items.length; k++) {
          var it = items[k];
          var hh = (0.16 + t.stage * 0.07 + noise(x, y, 180 + it[2]) * 0.12) * growF;
          if (hh > 0.01) cubeF(x + it[0] + sway, y + it[1] - sway, h, 0.1, 0.1, hh, MARSH_COLS[it[2] % MARSH_COLS.length], dry);
        }
        break;
      }
      case 'upper':
        if (t.restoring) { stake(x + 0.25, y + 0.3, h); stake(x + 0.7, y + 0.65, h); }
        else if (noise(x, y, 5) > 0.5) cube(x + 0.3, y + 0.55, h, 0.12, 0.1, 0.06, '#9b9081');
        break;
      case 'village': {
        var rc = ROOFS[Math.floor(noise(x, y, 7) * ROOFS.length)];
        if (noise(x, y, 8) > 0.55) {
          cube(x + 0.12, y + 0.14, h, 0.4, 0.36, 0.38, '#ece6d8');
          roof(x + 0.08, y + 0.1, h + 0.38, 0.48, 0.44, 0.24, rc, '#ece6d8');
          windowL(x + 0.2, y + 0.5, h + 0.12);
          cube(x + 0.6, y + 0.58, h, 0.3, 0.3, 0.3, '#f1ece0');
          roof(x + 0.57, y + 0.55, h + 0.3, 0.36, 0.36, 0.2, ROOFS[(Math.floor(noise(x, y, 9) * 5) + 1) % 5], '#f1ece0');
          windowL(x + 0.66, y + 0.88, h + 0.1);
        } else {
          cube(x + 0.18, y + 0.2, h, 0.62, 0.52, 0.46, '#efe9dc');
          roof(x + 0.13, y + 0.15, h + 0.46, 0.72, 0.62, 0.3, rc, '#efe9dc');
          windowL(x + 0.3, y + 0.72, h + 0.14);
          windowL(x + 0.56, y + 0.72, h + 0.14);
        }
        break;
      }
      case 'port':
        cube(x + 0.62, y + 0.3, h, 0.38, 0.18, 0.06, '#9a7b58');
        cube(x + 0.2, y + 0.2, h, 0.05, 0.05, 0.75, '#5a6266');
        cube(x + 0.17, y + 0.17, h + 0.75, 0.11, 0.11, 0.06, night ? '#ffd27a' : '#e8e2c8');
        cube(x + 0.25, y + 0.6, h, 0.28, 0.2, 0.18, '#3f6fa8');
        break;
      case 'forest':
        pine(x + 0.22, y + 0.22, h, 1);
        if (noise(x, y, 12) > 0.3) pine(x + 0.6, y + 0.35, h, 0.85);
        if (noise(x, y, 13) > 0.45) pine(x + 0.35, y + 0.65, h, 0.95);
        break;
      case 'hill':
        cube(x + 0.25, y + 0.3, h, 0.3, 0.24, 0.16, '#9c9283');
        if (noise(x, y, 14) > 0.4) pine(x + 0.6, y + 0.55, h, 0.8);
        break;
      case 'land':
        if (noise(x, y, 15) > 0.55) cube(x + 0.4, y + 0.4, h, 0.18, 0.18, 0.16, '#6f9c4f');
        break;
      case 'farm':
        cube(x + 0.1, y + 0.14, h, 0.8, 0.26, 0.2, '#e4e8e1');
        cube(x + 0.1, y + 0.56, h, 0.8, 0.26, 0.2, '#e4e8e1');
        break;
      case 'field':
        ctx.strokeStyle = col('#c9d38a', 1);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ix(x, y + 0.5), iy(x, y + 0.5, h)); ctx.lineTo(ix(x + 1, y + 0.5), iy(x + 1, y + 0.5, h));
        ctx.moveTo(ix(x + 0.5, y), iy(x + 0.5, y, h)); ctx.lineTo(ix(x + 0.5, y + 1), iy(x + 0.5, y + 1, h));
        ctx.stroke();
        break;
      case 'pond': {
        var rim = '#a69780';
        cube(x, y, h, 1, 0.1, 0.22, rim);
        cube(x, y + 0.1, h, 0.1, 0.8, 0.22, rim);
        topInset(x, y, h + 0.15, 0.1, rgbStr(nightify(hex2rgb(t.active ? '#6fa3ad' : '#7d9468')), 0.95));
        cube(x + 0.9, y + 0.1, h, 0.1, 0.8, 0.22, rim);
        cube(x, y + 0.9, h, 1, 0.1, 0.22, rim);
        if (t.active) cube(x + 0.45, y + 0.42, h + 0.15, 0.14, 0.08, 0.12, '#f2c94c');
        break;
      }
      case 'wall':
        cube(x + 0.12, y + 0.9, 2.2, 0.15, 0.15, 0.3, '#b9bcba');
        cube(x + 0.45, y + 0.86, 2.15, 0.15, 0.15, 0.32, '#c3c6c4');
        cube(x + 0.78, y + 0.9, 2.25, 0.15, 0.15, 0.28, '#b4b7b5');
        break;
      case 'gate':
        cube(x + 0.2, y + 0.25, h, 0.6, 0.45, 0.4, '#7d878b');
        cube(x + 0.25, y + 0.2, h + 0.4, 0.5, 0.55, 0.06, '#5c666a');
        break;
      case 'island':
        cube(x + 0.2, y + 0.2, h, 0.34, 0.3, 0.22, '#9d9384');
        cube(x + 0.55, y + 0.5, h, 0.22, 0.2, 0.12, '#7da05e');
        if (has('spoonbill') && noise(x, y, 16) > 0.2) { birdWhite(x + 0.3, y + 0.62, h); birdWhite(x + 0.62, y + 0.25, h); }
        break;
      case 'industry':
        cube(x + 0.1, y + 0.15, h, 0.55, 0.5, 0.5 * growF, '#c9cfd4');
        cube(x + 0.1, y + 0.15, h + 0.5 * growF, 0.55, 0.5, 0.06, '#3f6fa8');
        cube(x + 0.72, y + 0.2, h, 0.1, 0.1, 1.05 * growF, '#7a8085');
        cube(x + 0.71, y + 0.19, h + 1.05 * growF, 0.12, 0.12, 0.1, '#c8373f');
        cube(x + 0.62, y + 0.65, h, 0.26, 0.26, 0.3 * growF, '#dfe3e6');
        if (!reduced && Math.random() < 0.05) spawn('smoke', x + 0.77, y + 0.25, h + 1.2, 1);
        break;
      case 'resort':
        cube(x + 0.15, y + 0.15, h, 0.62, 0.6, 1.5 * growF, '#f4f2ec');
        resortWindows(x + 0.15, y + 0.15, h, 0.62, 0.6);
        cube(x + 0.1, y + 0.1, h + 1.5 * growF, 0.72, 0.7, 0.08, '#3a7fc1');
        break;
      case 'solar':
        for (k = 0; k < 3; k++) cube(x + 0.08, y + 0.1 + k * 0.3, h + 0.12, 0.84, 0.2, 0.05, '#2f4f84');
        break;
      default:
        break;
    }
    if (t.walk) boardwalk(t);
    if (t.debris) debris(t, wl);
    if (t.x === 3 && (t.y === 10 || t.y === 11) && BV.TIDAL[t.type]) moored(t, wl);
  }
  function windowL(x, y, z) {
    var c = night ? '#ffd27a' : col('#41515c', 1);
    quad(ix(x, y), iy(x, y, z), ix(x + 0.1, y), iy(x + 0.1, y, z), ix(x + 0.1, y), iy(x + 0.1, y, z + 0.12), ix(x, y), iy(x, y, z + 0.12), c);
  }
  function resortWindows(x0, y0, z0, sx, sy) {
    var y1 = y0 + sy;
    var c = night ? '#ffd27a' : col('#5d7f9a', 1);
    for (var r = 0; r < 4; r++) for (var k = 0; k < 3; k++) {
      var z = z0 + 0.2 + r * 0.32, x = x0 + 0.06 + k * 0.2;
      if (z + 0.14 > z0 + 1.5 * growF) continue;
      quad(ix(x, y1), iy(x, y1, z), ix(x + 0.12, y1), iy(x + 0.12, y1, z), ix(x + 0.12, y1), iy(x + 0.12, y1, z + 0.14), ix(x, y1), iy(x, y1, z + 0.14), c);
    }
  }
  function pine(x, y, z, s) {
    cube(x + 0.1 * s, y + 0.1 * s, z, 0.07 * s, 0.07 * s, 0.22 * s, '#6b4a33');
    cube(x, y, z + 0.2 * s, 0.28 * s, 0.28 * s, 0.26 * s, '#3f6f3e');
    cube(x + 0.05 * s, y + 0.05 * s, z + 0.46 * s, 0.18 * s, 0.18 * s, 0.22 * s, '#4f8a4a');
  }
  function stake(x, y, z) { cube(x, y, z, 0.03, 0.03, 0.36, '#8a6a4a'); cube(x + 0.03, y, z + 0.26, 0.13, 0.02, 0.09, '#e2733a'); }
  function debris(t, wl) {
    var z = Math.max(t.h, wl - 0.03);
    cube(t.x + 0.22, t.y + 0.3, z, 0.14, 0.12, 0.1, '#f4f4f0');
    cube(t.x + 0.55, t.y + 0.55, z, 0.11, 0.09, 0.06, '#3a7fc1');
    cube(t.x + 0.4, t.y + 0.72, z, 0.09, 0.09, 0.07, '#e2733a');
    cube(t.x + 0.68, t.y + 0.22, z, 0.1, 0.1, 0.08, '#f4f4f0');
  }
  function boardwalk(t) {
    var l = tileAt(t.x - 1, t.y), r = tileAt(t.x + 1, t.y);
    var alongX = !!((l && (l.walk || !BV.TIDAL[l.type])) || (r && (r.walk || !BV.TIDAL[r.type])));
    var z = t.h + 0.22;
    if (alongX) {
      cube(t.x + 0.1, t.y + 0.42, t.h, 0.04, 0.04, 0.22, '#6b4a33'); cube(t.x + 0.85, t.y + 0.42, t.h, 0.04, 0.04, 0.22, '#6b4a33');
      cube(t.x, t.y + 0.38, z, 1, 0.22, 0.05, '#b08458');
    } else {
      cube(t.x + 0.42, t.y + 0.1, t.h, 0.04, 0.04, 0.22, '#6b4a33'); cube(t.x + 0.42, t.y + 0.85, t.h, 0.04, 0.04, 0.22, '#6b4a33');
      cube(t.x + 0.38, t.y, z, 0.22, 1, 0.05, '#b08458');
    }
  }
  function moored(t, wl) {
    var z = Math.max(t.h, wl - 0.06);
    var bob = wl > t.h + 0.05 && !reduced ? Math.sin(time * 1.8 + t.y) * 0.03 : 0;
    cube(t.x + 0.18, t.y + 0.36, z + bob, 0.6, 0.26, 0.14, '#f2f1ea');
    cube(t.x + 0.18, t.y + 0.36, z + 0.1 + bob, 0.6, 0.26, 0.04, '#3f6fa8');
    cube(t.x + 0.5, t.y + 0.42, z + 0.14 + bob, 0.18, 0.15, 0.16, '#e9e5da');
  }
  function birdWhite(x, y, z) {
    cube(x, y, z + 0.1, 0.14, 0.08, 0.08, '#f6f5ef');
    cube(x - 0.02, y + 0.02, z + 0.16, 0.05, 0.05, 0.08, '#f6f5ef');
    cube(x - 0.07, y + 0.03, z + 0.2, 0.06, 0.03, 0.02, '#1d1f22');
  }

  /* ---------- 생물 ---------- */
  function has(id) { return S && S.present.indexOf(id) >= 0; }
  function rebuildCritters() {
    critters = [];
    if (!S) return;
    var flats = [], marshes = [], edges = [];
    S.tiles.forEach(function (t, i) {
      if ((t.type === 'mudflat' || t.type === 'upper') && t.health >= 50) flats.push(i);
      if (t.type === 'marsh') marshes.push(i);
      if (t.type === 'mudflat') {
        var ns = [tileAt(t.x + 1, t.y), tileAt(t.x, t.y + 1), tileAt(t.x - 1, t.y), tileAt(t.x, t.y - 1)];
        if (ns.some(function (n) { return n && (n.type === 'creek' || n.type === 'shallow'); })) edges.push(i);
      }
    });
    function add(kind, list, n, color) {
      if (!list.length) return;
      for (var k = 0; k < n; k++) {
        critters.push({ kind: kind, i: list[Math.floor(Math.random() * list.length)], u: 0.2 + Math.random() * 0.6, v: 0.2 + Math.random() * 0.6,
          dir: Math.random() * 6.28, spd: 0.05 + Math.random() * 0.07, ph: Math.random() * 6.28, color: color });
      }
    }
    var m = lite || lowDetail ? 0.5 : 1;
    if (has('mudcrab')) add('crab', flats, Math.ceil(6 * m), '#6f7458');
    if (has('fiddler')) add('fiddler', marshes.concat(flats.slice(0, 10)), Math.ceil(4 * m), '#c8402e');
    if (has('whitecrab')) add('crab', flats, Math.ceil(3 * m), '#d8c7a5');
    if (has('mudskipper')) add('skipper', flats, Math.ceil(4 * m), '#6d5a45');
    if (has('spoonbill')) add('spoonbill', edges.length ? edges : flats, 3, '#f6f5ef');
  }
  function drawCritters(t, wl) {
    for (var k = 0; k < critters.length; k++) {
      var c = critters[k];
      if (S.tiles[c.i] !== t) continue;
      var exposed = wl < t.h - 0.02;
      var x = t.x + c.u, y = t.y + c.v, z = t.h;
      if (c.kind === 'crab' || c.kind === 'fiddler') {
        if (!exposed) continue;
        cube(x, y, z, 0.07, 0.05, 0.04, c.color);
        if (c.kind === 'fiddler') cube(x + 0.07, y + 0.01, z, 0.05, 0.04, 0.05 + Math.max(0, Math.sin(time * 5 + c.ph)) * 0.03, '#e04a2e');
      } else if (c.kind === 'skipper') {
        if (!exposed) continue;
        var hop = Math.max(0, Math.sin(time * 3 + c.ph)) * 0.22;
        cube(x, y, z + hop, 0.1, 0.04, 0.04, c.color);
        cube(x - 0.01, y, z + hop + 0.04, 0.03, 0.03, 0.02, '#2c2a26');
      } else if (c.kind === 'spoonbill') {
        if (wl > t.h + 0.35) continue;
        var bz = Math.max(z, wl);
        ctx.strokeStyle = col('#1d1f22', 1); ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ix(x + 0.05, y + 0.03), iy(x + 0.05, y + 0.03, z)); ctx.lineTo(ix(x + 0.05, y + 0.03), iy(x + 0.05, y + 0.03, bz + 0.16));
        ctx.moveTo(ix(x + 0.1, y + 0.03), iy(x + 0.1, y + 0.03, z)); ctx.lineTo(ix(x + 0.1, y + 0.03), iy(x + 0.1, y + 0.03, bz + 0.16));
        ctx.stroke();
        cube(x, y, bz + 0.16, 0.17, 0.08, 0.09, '#f6f5ef');
        cube(x - 0.05, y + 0.01, bz + 0.2, 0.05, 0.05, 0.07, '#f6f5ef');
        cube(x - 0.13, y + 0.02 + (reduced ? 0 : Math.sin(time * 2.4 + c.ph) * 0.06), bz + 0.14, 0.09, 0.03, 0.02, '#1d1f22');
      }
    }
  }
  function updateCritters(dt) {
    for (var k = 0; k < critters.length; k++) {
      var c = critters[k];
      var sp = c.kind === 'spoonbill' ? 0.03 : c.spd;
      c.u += Math.cos(c.dir) * sp * dt; c.v += Math.sin(c.dir) * sp * dt;
      if (c.u < 0.12 || c.u > 0.85) { c.dir = Math.PI - c.dir; c.u = Math.max(0.12, Math.min(0.85, c.u)); }
      if (c.v < 0.12 || c.v > 0.85) { c.dir = -c.dir; c.v = Math.max(0.12, Math.min(0.85, c.v)); }
      if (Math.random() < dt * 0.4) c.dir += (Math.random() - 0.5) * 2;
    }
  }

  /* ---------- 주변 생동감 ---------- */
  function drawAmbient(dt, wl) {
    if (reduced) return;
    // 구름 그림자
    if (!night && !lite) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ix(0, 0), iy(0, 0, 3)); ctx.lineTo(ix(MW, 0), iy(MW, 0, 3)); ctx.lineTo(ix(MW, MH), iy(MW, MH, 3)); ctx.lineTo(ix(0, MH), iy(0, MH, 3));
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = 'rgba(30,50,60,' + (0.07 + storm * 0.1) + ')';
      for (var k = 0; k < 3; k++) {
        var cx = ((time * 0.12 + k * 9) % 26) - 5, cy = 3 + k * 4.5;
        ctx.beginPath();
        ctx.ellipse(ix(cx, cy), iy(cx, cy, 3), 120 + k * 30, 46 + k * 10, 0, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }
    // 갈매기
    ctx.strokeStyle = night ? 'rgba(220,230,235,0.85)' : 'rgba(250,250,248,0.95)';
    ctx.lineWidth = 2;
    for (var g = 0; g < 3; g++) {
      var a = time * (0.22 + g * 0.05) + g * 2.1;
      var gx = 11 + Math.cos(a) * (3 + g), gy = 11 + Math.sin(a) * (2.5 + g * 0.5);
      var sx = ix(gx, gy), sy = iy(gx, gy, 7 + g * 0.6);
      var wing = 5 + Math.sin(time * 7 + g) * 2.5;
      ctx.beginPath(); ctx.moveTo(sx - wing, sy - 2.5); ctx.quadraticCurveTo(sx - wing / 2, sy - 4, sx, sy); ctx.quadraticCurveTo(sx + wing / 2, sy - 4, sx + wing, sy - 2.5); ctx.stroke();
    }
    // 뛰어오르는 물고기
    nextFish -= dt;
    if (nextFish <= 0 && !lite) {
      nextFish = 1.5 + Math.random() * 3;
      var cand = [];
      S.tiles.forEach(function (t, i) { if ((t.type === 'sea' || t.type === 'shallow' || t.type === 'seagrass') && wl - t.h > 0.5) cand.push(i); });
      if (cand.length) {
        var tt = S.tiles[cand[Math.floor(Math.random() * cand.length)]];
        fishes.push({ x: tt.x + 0.3, y: tt.y + 0.5, t0: time });
      }
    }
    for (var f = fishes.length - 1; f >= 0; f--) {
      var fi = fishes[f], p = (time - fi.t0) / 0.9;
      if (p > 1) { ringAt(fi.x + 0.35, fi.y, wl, 'white', 0.25, 0.5); fishes.splice(f, 1); continue; }
      cube(fi.x + p * 0.35, fi.y, wl + Math.sin(p * Math.PI) * 0.6, 0.12, 0.04, 0.05, '#c9d3da');
    }
    // 돛단배
    var sp2 = (time * 0.02) % 2, q = sp2 < 1 ? sp2 : 2 - sp2;
    var bx = 14.6 + (9.6 - 14.6) * q, by = 9.4 + (15.2 - 9.4) * q;
    var bz = wl - 0.04 + Math.sin(time * 1.6) * 0.03;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ix(bx + 0.3, by - 0.3), iy(bx + 0.3, by - 0.3, wl)); ctx.lineTo(ix(bx + 0.9, by - 0.9), iy(bx + 0.9, by - 0.9, wl)); ctx.stroke();
    cube(bx, by, bz, 0.42, 0.18, 0.1, '#f2f1ea');
    ctx.fillStyle = col('#f7f4ea', 1);
    ctx.beginPath();
    ctx.moveTo(ix(bx + 0.2, by + 0.09), iy(bx + 0.2, by + 0.09, bz + 0.1)); ctx.lineTo(ix(bx + 0.2, by + 0.09), iy(bx + 0.2, by + 0.09, bz + 0.75)); ctx.lineTo(ix(bx + 0.42, by + 0.09), iy(bx + 0.42, by + 0.09, bz + 0.14));
    ctx.closePath(); ctx.fill();
  }
  function drawFlock(dt) {
    if (!has('godwit') || reduced) { flock = null; return; }
    nextFlock -= dt;
    if (!flock && nextFlock <= 0) { flock = { t: 0 }; nextFlock = 20 + Math.random() * 12; }
    if (!flock) return;
    flock.t += dt;
    var p = flock.t / 9;
    if (p > 1) { flock = null; return; }
    var gx = -2 + p * 20, gy = 3 + p * 9;
    ctx.strokeStyle = night ? 'rgba(220,230,235,0.8)' : 'rgba(60,52,44,0.85)';
    ctx.lineWidth = 1.6;
    for (var k = 0; k < 9; k++) {
      var row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
      var bx = gx - row * 0.35, by = gy + side * row * 0.35;
      var sx = ix(bx, by), sy = iy(bx, by, 7.5) + Math.sin(time * 9 + k) * 1.5, wing = 4 + Math.sin(time * 9 + k) * 2;
      ctx.beginPath(); ctx.moveTo(sx - wing, sy - 2); ctx.lineTo(sx, sy); ctx.lineTo(sx + wing, sy - 2); ctx.stroke();
    }
  }
  function drawPorpoise(dt, wl) {
    if (!has('porpoise') || reduced) { porpoise = null; return; }
    nextPorpoise -= dt;
    if (!porpoise && nextPorpoise <= 0) {
      var seas = [];
      S.tiles.forEach(function (t, i) { if ((t.type === 'sea' || t.type === 'shallow') && wl - t.h > 0.6) seas.push(i); });
      if (seas.length) porpoise = { i: seas[Math.floor(Math.random() * seas.length)], t: 0 };
      nextPorpoise = 10 + Math.random() * 8;
    }
    if (!porpoise) return;
    porpoise.t += dt;
    var p = porpoise.t / 1.8;
    if (p > 1) { porpoise = null; return; }
    var t = S.tiles[porpoise.i];
    cube(t.x + 0.2 + p * 0.5, t.y + 0.45, wl - 0.05 + Math.sin(p * Math.PI) * 0.35, 0.28, 0.12, 0.11, '#8e9499');
  }

  /* ---------- 파티클 ---------- */
  function spawn(kind, x, y, z, n, opt) {
    opt = opt || {};
    if (reduced) n = Math.min(n, 3);
    else if (lite) n = Math.ceil(n * 0.5);
    for (var k = 0; k < n; k++) {
      var p = { kind: kind, x: x + (Math.random() - 0.5) * (opt.spread || 0.5), y: y + (Math.random() - 0.5) * (opt.spread || 0.5), z: z,
        vx: 0, vy: 0, vz: 0, life: 0, max: 1.2 + Math.random() * 0.6, c: opt.color, delay: opt.delay ? Math.random() * opt.delay : 0 };
      switch (kind) {
        case 'leaf': p.vz = 1.8 + Math.random(); p.vx = (Math.random() - 0.5) * 0.9; p.vy = (Math.random() - 0.5) * 0.9; break;
        case 'spark': p.vz = 1.2 + Math.random() * 1.6; p.vx = (Math.random() - 0.5) * 1.2; p.vy = (Math.random() - 0.5) * 1.2; p.max = 0.9; break;
        case 'dust': p.vz = 0.8 + Math.random() * 0.8; p.vx = (Math.random() - 0.5) * 1.2; p.vy = (Math.random() - 0.5) * 1.2; break;
        case 'splash': p.vz = 2 + Math.random() * 1.5; p.vx = (Math.random() - 0.5) * 1.4; p.vy = (Math.random() - 0.5) * 1.4; p.max = 0.9; break;
        case 'smoke': p.vz = 0.5 + Math.random() * 0.3; p.vx = 0.15; p.max = 3; break;
        case 'co2out': p.vz = 0.9 + Math.random() * 0.6; p.vx = (Math.random() - 0.5) * 0.2; p.max = 2.4; p.label = Math.random() < 0.15; break;
        case 'bubble': p.vz = 0.8 + Math.random() * 0.5; p.max = 1.2; break;
        case 'co2fall': p.z = z + 5 + Math.random() * 3; p.vz = -(2.2 + Math.random() * 1.6); p.max = 8; p.ground = opt.ground; p.label = Math.random() < 0.14; break;
        default: break;
      }
      particles.push(p);
    }
    if (particles.length > 900) particles.splice(0, particles.length - 900);
  }

  function drawParticles(dt) {
    ctx.globalCompositeOperation = lite ? 'source-over' : 'lighter';
    for (var k = particles.length - 1; k >= 0; k--) {
      var p = particles[k];
      if (p.kind === 'smoke' || p.kind === 'co2out' || p.kind === 'dust' || p.kind === 'leaf') continue;
      if (!stepParticle(p, k, dt)) continue;
      var a = 1 - p.life / p.max, sx = ix(p.x, p.y), sy = iy(p.x, p.y, p.z);
      if (p.kind === 'co2fall') {
        drawGlow('cyan', sx, sy, 14, 0.9);
        ctx.strokeStyle = 'rgba(120,210,255,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 12); ctx.stroke();
      } else if (p.kind === 'spark') drawGlow(p.c || 'gold', sx, sy, 16 * a + 4, a);
      else if (p.kind === 'splash') drawGlow('blue', sx, sy, 9, a);
      else if (p.kind === 'bubble') { ctx.strokeStyle = 'rgba(230,245,250,' + a + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, 6.283); ctx.stroke(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (var j = particles.length - 1; j >= 0; j--) {
      var q = particles[j];
      if (!(q.kind === 'smoke' || q.kind === 'co2out' || q.kind === 'dust' || q.kind === 'leaf')) continue;
      if (!stepParticle(q, j, dt)) continue;
      var b = 1 - q.life / q.max, qx = ix(q.x, q.y), qy = iy(q.x, q.y, q.z);
      if (q.kind === 'smoke' || q.kind === 'co2out') {
        ctx.fillStyle = 'rgba(' + (q.kind === 'co2out' ? '95,95,100' : '140,140,140') + ',' + (0.5 * b) + ')';
        ctx.beginPath(); ctx.arc(qx, qy, 3 + q.life * 4, 0, 6.283); ctx.fill();
      } else {
        ctx.fillStyle = q.c ? rgbStr(hex2rgb(q.c), b) : 'rgba(150,120,90,' + b + ')';
        ctx.fillRect(qx - 2.5, qy - 2.5, 5, 5);
      }
    }
    // CO₂ 글자
    ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (var m = 0; m < particles.length; m++) {
      var r = particles[m];
      if (!r.label || r.delay > 0) continue;
      var al = r.kind === 'co2fall' ? 0.9 : 0.7 * (1 - r.life / r.max);
      ctx.fillStyle = r.kind === 'co2fall' ? 'rgba(200,240,255,' + al + ')' : 'rgba(70,70,75,' + al + ')';
      ctx.fillText('CO₂', ix(r.x, r.y) + 9, iy(r.x, r.y, r.z) - 6);
    }
  }
  function stepParticle(p, k, dt) {
    if (p.delay > 0) { p.delay -= dt; return false; }
    p.life += dt;
    if (p.life > p.max) { particles.splice(k, 1); return false; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.kind === 'leaf' || p.kind === 'dust' || p.kind === 'splash') p.vz -= 4.5 * dt;
    if (p.kind === 'spark') p.vz -= 2 * dt;
    if (p.kind === 'co2fall') {
      p.vz -= 3 * dt;
      if (p.z <= p.ground) {
        ringAt(p.x, p.y, p.ground + 0.02, 'cyan', 0.12, 0.45);
        particles.splice(k, 1);
        return false;
      }
    }
    return true;
  }

  function ringAt(x, y, z, color, size, dur) {
    rings.push({ x: x, y: y, z: z, c: RGB[color] || RGB.white, size: size || 0.7, t0: time, dur: dur || 0.7 });
  }
  function drawRings() {
    ctx.globalCompositeOperation = lite ? 'source-over' : 'lighter';
    for (var k = rings.length - 1; k >= 0; k--) {
      var r = rings[k], p = (time - r.t0) / r.dur;
      if (p > 1) { rings.splice(k, 1); continue; }
      diamond(r.x, r.y, r.z, 0.08 + r.size * easeInOut(p));
      ctx.strokeStyle = rgbStr(r.c, 0.9 * (1 - p));
      ctx.lineWidth = 1 + 3 * (1 - p);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFloaters(dt) {
    ctx.textAlign = 'center';
    for (var k = floaters.length - 1; k >= 0; k--) {
      var f = floaters[k];
      f.life += dt;
      if (f.life > f.max) { floaters.splice(k, 1); continue; }
      var a = Math.min(1, (f.max - f.life) * 2.2);
      var s = easeOutBack(Math.min(1, f.life * 3.5));
      var fs = f.size * s / cam.z;
      ctx.font = '700 ' + fs + 'px "Do Hyeon", "IBM Plex Mono", sans-serif';
      var sx = ix(f.x, f.y), sy = iy(f.x, f.y, f.z + f.life * 0.9);
      ctx.lineWidth = 4 / cam.z;
      ctx.strokeStyle = 'rgba(15,25,30,' + 0.7 * a + ')';
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = rgbStr(f.c, a);
      ctx.fillText(f.text, sx, sy);
    }
  }

  function drawPops(dt) {
    for (var k = pops.length - 1; k >= 0; k--) {
      var p = pops[k], q = (time - p.t0) / p.dur;
      if (q > 1) { pops.splice(k, 1); continue; }
      var t = S.tiles[p.i];
      var s = easeOutBack(Math.min(1, q * 4)) * (q > 0.85 ? (1 - q) / 0.15 : 1);
      var sx = ix(t.x + 0.5, t.y + 0.5), sy = iy(t.x + 0.5, t.y + 0.5, t.h + 1.6) + Math.sin(time * 3) * 3;
      var size = 34 * s;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow('gold', sx, sy, size * 2.6, 0.8 * s);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(sx, sy, size * 0.62, 0, 6.283); ctx.fill();
      var img = pixelSprite(p.sprite);
      if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, sx - size / 2, sy - size / 2, size, size); ctx.imageSmoothingEnabled = true; }
    }
  }

  /* ---------- 강조 ---------- */
  function tileDiamond(x, y, z) {
    ctx.beginPath();
    ctx.moveTo(ix(x, y), iy(x, y, z)); ctx.lineTo(ix(x + 1, y), iy(x + 1, y, z));
    ctx.lineTo(ix(x + 1, y + 1), iy(x + 1, y + 1, z)); ctx.lineTo(ix(x, y + 1), iy(x, y + 1, z));
    ctx.closePath();
  }
  function drawOverlay(t, i, wl) {
    var z = surfaceZ(t, wl) + 0.02;
    if (viewMode === 'carbon' && t.carbon > 0) {
      var f = Math.min(1, t.carbon / 1000);
      tileDiamond(t.x, t.y, z);
      ctx.fillStyle = 'rgba(' + Math.round(230 - 200 * f) + ',' + Math.round(240 - 170 * f) + ',' + Math.round(250 - 110 * f) + ',0.82)';
      ctx.fill();
    } else if (viewMode === 'health' && BV.ECO[t.type]) {
      var hh = t.health / 100;
      var r = hh < 0.5 ? 210 : Math.round(210 - (hh - 0.5) * 2 * 160);
      var g = hh < 0.5 ? Math.round(70 + hh * 2 * 130) : 200;
      tileDiamond(t.x, t.y, z);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',80,0.78)';
      ctx.fill();
    }
    if (shieldSet && shieldSet[i] && storm > 0.1) {
      tileDiamond(t.x, t.y, z + 0.02);
      ctx.fillStyle = 'rgba(110,240,190,' + (0.25 + 0.25 * Math.sin(time * 8 + i)) * storm + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,255,220,' + 0.8 * storm + ')'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (eligibleSet && eligibleSet[i]) {
      var pulse = reduced ? 0.26 : 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(time * 4 + (t.x + t.y) * 0.4));
      tileDiamond(t.x, t.y, z);
      ctx.fillStyle = rgbStr(accent, pulse);
      ctx.fill();
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -time * 18;
      ctx.strokeStyle = rgbStr(accent, 0.9);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (i === selected) {
      tileDiamond(t.x, t.y, z);
      ctx.strokeStyle = 'rgba(20,25,28,0.9)'; ctx.lineWidth = 4.5; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
    } else if (i === hover && !demo) {
      tileDiamond(t.x, t.y, z);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (i === cursor && cursor !== selected) {
      tileDiamond(t.x, t.y, z);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function drawMarker(wl) {
    if (selected < 0 || demo) return;
    var t = S.tiles[selected];
    var z = surfaceZ(t, wl) + 1.1 + Math.abs(Math.sin(time * 4)) * 0.18;
    var sx = ix(t.x + 0.5, t.y + 0.5), sy = iy(t.x + 0.5, t.y + 0.5, z);
    ctx.beginPath();
    ctx.moveTo(sx - 8, sy - 9); ctx.lineTo(sx + 8, sy - 9); ctx.lineTo(sx, sy + 3); ctx.closePath();
    ctx.fillStyle = rgbStr(accent, 1); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }

  /* ---------- 날씨·화면 효과 ---------- */
  function approach(v, to, rate, dt) { return v + (to - v) * Math.min(1, rate * dt); }
  function drawWeather(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (dusk > 0.01) {
      var g = ctx.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, 'rgba(40,40,90,' + 0.32 * dusk + ')');
      g.addColorStop(1, 'rgba(255,140,80,' + 0.22 * dusk + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    if (heat > 0.01) {
      ctx.fillStyle = 'rgba(255,120,40,' + 0.18 * heat + ')';
      ctx.fillRect(0, 0, vw, vh);
    }
    if (storm > 0.01) {
      ctx.fillStyle = 'rgba(16,26,36,' + 0.42 * storm + ')';
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = 'rgba(210,225,235,' + 0.55 * storm + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      var n = Math.round((lite ? 60 : 150) * storm);
      for (var k = 0; k < n; k++) {
        var rx = (k * 137 + time * 900) % (vw + 100) - 50, ry = (k * 89 + time * 1500) % (vh + 60) - 30;
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 9, ry + 20);
      }
      ctx.stroke();
      if (storm > 0.6 && !reduced) {
        nextBolt -= dt;
        if (nextBolt <= 0) {
          nextBolt = 0.9 + Math.random() * 1.6;
          var bx = vw * (0.2 + Math.random() * 0.6), pts = [[bx, 0]];
          for (var s = 1; s < 8; s++) pts.push([pts[s - 1][0] + (Math.random() - 0.5) * 60, s * vh * 0.07]);
          bolt = { pts: pts, t: 0.16 };
          flashA = 0.55; flashRGB = [235, 240, 255];
          if (BV.audio) BV.audio.play('thunder');
        }
      }
      if (bolt) {
        bolt.t -= dt;
        ctx.strokeStyle = 'rgba(240,245,255,' + Math.max(0, bolt.t * 6) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        bolt.pts.forEach(function (pt, k2) { if (k2) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]); });
        ctx.stroke();
        if (bolt.t <= 0) bolt = null;
      }
    }
    if (flashA > 0.005) {
      ctx.fillStyle = rgbStr(flashRGB, flashA);
      ctx.fillRect(0, 0, vw, vh);
      flashA *= Math.pow(0.02, dt);
    }
  }

  /* ---------- 프레임 ---------- */
  function drawColumn(t, i, wl) {
    var st = animState(i);
    var h0 = t.h;
    if (st.lift) t.h = h0 + st.lift;
    growF = st.grow;
    drawSides(t);
    drawTop(t);
    decorUnder(t);
    drawWater(t, wl, st.flood);
    decorOver(t, wl);
    if (critters.length) drawCritters(t, wl);
    drawOverlay(t, i, wl);
    t.h = h0;
    growF = 1;
  }

  function frame(dtMs) {
    if (!ctx || !S) return;
    var t0 = performance.now();
    var dt = Math.min(0.06, Math.max(0, dtMs) / 1000);
    time += dt;
    if (!tidePaused) tidePhase += dt * 2 * Math.PI / C.TIDE_PERIOD * (reduced ? 0.6 : 1) * tideBoost;
    storm = approach(storm, stormTo, 1.8, dt);
    heat = approach(heat, heatTo, 2, dt);
    dusk = approach(dusk, duskTo, 2.5, dt);
    if (camTween) {
      var cp = Math.min(1, (time - camTween.t0) / camTween.dur), e = easeInOut(cp);
      cam.x = camTween.from.x + (camTween.to.x - camTween.from.x) * e;
      cam.y = camTween.from.y + (camTween.to.y - camTween.from.y) * e;
      cam.z = camTween.from.z + (camTween.to.z - camTween.from.z) * e;
      if (cp >= 1) camTween = null;
    } else if (demo && !reduced) {
      cam.x = fitCam.x + Math.sin(time * 0.06) * 60;
      cam.y = fitCam.y + Math.cos(time * 0.05) * 18 + (vh > vw * 1.2 ? vh * 0.22 / cam.z : 0);
      cam.z = fitCam.z * (1.1 + Math.sin(time * 0.05) * 0.04);
    }
    var wl = waterLevel();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    var sx = 0, sy = 0;
    if (shake > 0) { shake -= dt; var amp = reduced ? 0 : 7 * Math.min(1, shake * 2); sx = (Math.random() - 0.5) * amp; sy = (Math.random() - 0.5) * amp * 0.6; }
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z + sx), dpr * (vh / 2 - cam.y * cam.z + sy));
    lw = 1.1 / (cam.z * dpr);

    ctx.fillStyle = night ? 'rgba(0,0,0,0.25)' : 'rgba(40,60,60,0.12)';
    ctx.beginPath();
    ctx.ellipse(0, iy(MW / 2, MH / 2, BASE) + 30, MW * HW * 1.02, MH * HH * 0.5, 0, 0, 6.283);
    ctx.fill();

    for (var d = 0; d <= MW + MH - 2; d++) {
      var x0 = Math.max(0, d - MH + 1), x1 = Math.min(MW - 1, d);
      for (var x = x0; x <= x1; x++) { var y = d - x, i = y * MW + x; drawColumn(S.tiles[i], i, wl); }
    }
    drawAmbient(dt, wl);
    drawPorpoise(dt, wl);
    drawFlock(dt);
    drawRings();
    drawParticles(dt);
    drawPops(dt);
    drawMarker(wl);
    drawFloaters(dt);
    updateCritters(dt);
    drawWeather(dt);

    var ft = performance.now() - t0;
    frameAvg = frameAvg * 0.95 + ft * 0.05;
    if (!lowDetail && frameAvg > 24) { lowDetail = true; rebuildCritters(); }
  }

  /* ---------- 카메라·입력 ---------- */
  function resize() {
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = Math.max(1, r.width); vh = Math.max(1, r.height);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  }
  function bounds() { return { x0: -MH * HW, x1: MW * HW, y0: iy(0, 0, 6.6), y1: iy(MW, MH, BASE) }; }
  function computeFit() {
    var b = bounds();
    var pad = vw < 520 ? 12 : 36;
    var z = Math.min((vw - pad * 2) / (b.x1 - b.x0), (vh - pad * 2) / (b.y1 - b.y0));
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: Math.max(0.2, Math.min(z, 2.4)) };
  }
  function fit() { fitCam = computeFit(); cam.x = fitCam.x; cam.y = fitCam.y; cam.z = fitCam.z; camTween = null; }
  function clampCam() {
    var b = bounds();
    cam.x = Math.max(b.x0, Math.min(b.x1, cam.x));
    cam.y = Math.max(b.y0, Math.min(b.y1, cam.y));
  }
  function tweenTo(to, dur) {
    if (reduced || !dur) { cam.x = to.x; cam.y = to.y; cam.z = to.z; camTween = null; return; }
    camTween = { from: { x: cam.x, y: cam.y, z: cam.z }, to: to, t0: time, dur: dur };
  }
  function inPoly(px, py, pts) {
    var inside = false;
    for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      var xa = pts[a][0], ya = pts[a][1], xb = pts[b][0], yb = pts[b][1];
      if (((ya > py) !== (yb > py)) && (px < (xb - xa) * (py - ya) / (yb - ya) + xa)) inside = !inside;
    }
    return inside;
  }
  function pick(px, py) {
    if (!S) return -1;
    var wx = (px - vw / 2) / cam.z + cam.x, wy = (py - vh / 2) / cam.z + cam.y;
    for (var d = MW + MH - 2; d >= 0; d--) {
      var x0 = Math.max(0, d - MH + 1), x1 = Math.min(MW - 1, d);
      for (var x = x1; x >= x0; x--) {
        var y = d - x, t = S.tiles[y * MW + x], h = t.h;
        var pts = [[ix(x, y), iy(x, y, h)], [ix(x + 1, y), iy(x + 1, y, h)], [ix(x + 1, y), iy(x + 1, y, BASE)],
          [ix(x + 1, y + 1), iy(x + 1, y + 1, BASE)], [ix(x, y + 1), iy(x, y + 1, BASE)], [ix(x, y + 1), iy(x, y + 1, h)]];
        if (inPoly(wx, wy, pts)) return y * MW + x;
      }
    }
    return -1;
  }

  /* ---------- 공개 효과 ---------- */
  var BURST = {
    marsh: function (t, x, y, z) { spawn('leaf', x, y, z, 12, { color: '#c2454f' }); spawn('leaf', x, y, z, 6, { color: '#6f9a4a' }); ringAt(x, y, z, 'pink', 0.9); },
    seagrass: function (t, x, y, z) { spawn('bubble', x, y, z, 12); spawn('leaf', x, y, z, 6, { color: '#2f7a4b' }); ringAt(x, y, z, 'cyan', 0.9); },
    cleanup: function (t, x, y, z) { spawn('spark', x, y, z, 16, { color: 'gold' }); ringAt(x, y, z, 'gold', 0.8); },
    restore: function (t, x, y, z) { spawn('splash', x, y, z, 18); spawn('bubble', x, y, z, 8); ringAt(x, y, z, 'blue', 1.1); },
    openwall: function (t, x, y, z) { spawn('splash', x, y, z, 26); spawn('dust', x, y, z, 10); ringAt(x, y, z, 'blue', 1.4); shake = 0.25; },
    boardwalk: function (t, x, y, z) { spawn('dust', x, y, z, 10); ringAt(x, y, z, 'gold', 0.6); },
    develop: function (t, x, y, z) { spawn('dust', x, y, z, 26, { spread: 0.9 }); spawn('co2out', x, y, z + 0.4, 10); ringAt(x, y, z, 'red', 1.3); shake = 0.4; },
    discover: function (t, x, y, z) { spawn('spark', x, y, z + 0.3, 24, { color: 'gold' }); ringAt(x, y, z, 'gold', 1.6, 1); },
    error: function (t, x, y, z) { ringAt(x, y, z, 'red', 0.4, 0.4); }
  };
  var ANIM = { marsh: 'pop', seagrass: 'pop', cleanup: 'pop', restore: 'flood', openwall: 'flood', boardwalk: 'pop', develop: 'sink', error: 'shake', discover: 'pop' };

  BV.render = {
    init: function (canvas) { cv = canvas; ctx = cv.getContext('2d'); resize(); fit(); },
    setState: function (s) {
      S = s; presentKey = ''; particles = []; floaters = []; rings = []; pops = []; anims = Object.create(null);
      flock = null; porpoise = null; fishes = []; storm = stormTo = 0; heat = heatTo = 0; dusk = duskTo = 0; shieldSet = null;
      this.sync();
    },
    sync: function () {
      if (!S) return;
      var key = S.present.join(',') + '|' + S.year;
      if (key !== presentKey) { presentKey = key; rebuildCritters(); }
    },
    resize: function () { resize(); clampCam(); },
    fit: fit,
    fitSmooth: function (dur) { fitCam = computeFit(); tweenTo({ x: fitCam.x, y: fitCam.y, z: fitCam.z }, dur || 0.8); },
    focusTile: function (i, mul, dur) {
      var t = S.tiles[i];
      if (!t) return;
      fitCam = computeFit();
      tweenTo({ x: ix(t.x + 0.5, t.y + 0.5), y: iy(t.x + 0.5, t.y + 0.5, t.h), z: Math.min(2.6, fitCam.z * (mul || 1.8)) }, dur || 0.8);
    },
    frame: frame,
    pick: pick,
    pan: function (dx, dy) { camTween = null; cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); },
    zoomAt: function (f, px, py) {
      camTween = null;
      var wx = (px - vw / 2) / cam.z + cam.x, wy = (py - vh / 2) / cam.z + cam.y;
      cam.z = Math.max(0.25, Math.min(3, cam.z * f));
      cam.x = wx - (px - vw / 2) / cam.z; cam.y = wy - (py - vh / 2) / cam.z;
      clampCam();
    },
    zoomCenter: function (f) { this.zoomAt(f, vw / 2, vh / 2); },
    setHover: function (i) { hover = i; },
    setSelected: function (i) { selected = i; },
    setCursor: function (i) { cursor = i; },
    setEligible: function (list) {
      if (!list || !list.length) { eligibleSet = null; return; }
      eligibleSet = Object.create(null);
      list.forEach(function (i) { eligibleSet[i] = 1; });
    },
    setViewMode: function (m) { viewMode = m; },
    setTidePaused: function (b) { tidePaused = !!b; },
    boostTide: function (mult) { tideBoost = mult || 1; },
    tide: function () {
      var wl = waterLevel() - storm * 0.75;
      var lo = C.TIDE_MID - C.TIDE_AMP, hi = C.TIDE_MID + C.TIDE_AMP;
      return { level: wl, rising: Math.cos(tidePhase) > 0, frac: Math.max(0, Math.min(1, (wl - slr() - lo) / (hi - lo))), paused: tidePaused };
    },
    setTheme: function (isNight, skyTop, skyBottom, accentHex) {
      night = !!isNight;
      shadeCache = Object.create(null);
      if (skyTop) sky = [skyTop, skyBottom || skyTop];
      if (accentHex && /^#[0-9a-f]{6}$/i.test(accentHex)) accent = hex2rgb(accentHex);
    },
    setReducedMotion: function (b) { reduced = !!b; },
    setLite: function (b) { lite = !!b; rebuildCritters(); },
    setDemo: function (b) { demo = !!b; if (!b) { fitCam = computeFit(); } },
    setStorm: function (level, shield) {
      stormTo = level;
      if (shield) { shieldSet = Object.create(null); shield.forEach(function (i) { shieldSet[i] = 1; }); }
      if (!level) shieldSet = null;
      if (level > 0.5) shake = 0.6;
    },
    setHeat: function (level) { heatTo = level; },
    setDusk: function (level) { duskTo = level; },
    flash: function (color, a) { flashRGB = RGB[color] || RGB.white; flashA = a || 0.4; },
    shake: function (sec) { shake = sec || 0.4; },
    anim: function (i, kind, dur) { anims[i] = { kind: kind, t0: time, dur: dur || (kind === 'flood' ? 1.2 : 0.9) }; },
    burst: function (i, kind) {
      var t = S.tiles[i];
      if (!t) return;
      var x = t.x + 0.5, y = t.y + 0.5, z = surfaceZ(t, waterLevel()) + 0.1;
      if (BURST[kind]) BURST[kind](t, x, y, z);
      if (ANIM[kind]) this.anim(i, ANIM[kind]);
    },
    ring: function (i, color, size) { var t = S.tiles[i]; if (t) ringAt(t.x + 0.5, t.y + 0.5, surfaceZ(t, waterLevel()) + 0.05, color, size); },
    float: function (i, text, color, size) {
      var t = S.tiles[i];
      if (!t) return;
      floaters.push({ x: t.x + 0.5, y: t.y + 0.5, z: t.h + 0.7, text: text, c: RGB[color] || RGB.white, size: size || 15, life: 0, max: 1.9 });
    },
    co2Stream: function (list, dur) {
      var total = 0;
      list.forEach(function (l) { total += l[1]; });
      if (!total) return;
      var budget = reduced ? 30 : lite ? 60 : 150;
      var wl = waterLevel();
      list.forEach(function (l) {
        var t = S.tiles[l[0]];
        var n = Math.max(1, Math.round(l[1] / total * budget));
        spawn('co2fall', t.x + 0.5, t.y + 0.5, t.h, n, { spread: 0.6, delay: (dur || 1.2) * 0.75, ground: surfaceZ(t, wl) });
      });
    },
    smokeStream: function (list) {
      list.forEach(function (i) { var t = S.tiles[i]; spawn('co2out', t.x + 0.5, t.y + 0.5, t.h + 0.4, 5, { delay: 0.6 }); });
    },
    creaturePop: function (i, sprite) { pops.push({ i: i, sprite: sprite, t0: time, dur: 3.2 }); this.burst(i, 'discover'); },
    yearFX: function (rep) { if (rep) this.co2Stream(rep.absorbByTile || [], 1.2); },
    screenOf: function (i) {
      var t = S.tiles[i];
      var wx = ix(t.x + 0.5, t.y + 0.5), wy = iy(t.x + 0.5, t.y + 0.5, t.h);
      return { x: (wx - cam.x) * cam.z + vw / 2, y: (wy - cam.y) * cam.z + vh / 2 };
    }
  };
})(window.BV = window.BV || {});

/*
 * 블루복셀 — 아이소메트릭 복셀 렌더러 (Canvas 2D, 외부 라이브러리 없음)
 * 높이(복셀 층) = 물때 구역. 밀물·썰물이 실시간으로 오르내려요.
 */
(function (BV) {
  'use strict';

  var C = BV.CONFIG;
  var TW = 64, TH = 32, ZH = 14, BASE = -1.4;
  var HW = TW / 2, HH = TH / 2;
  var MW = 16, MH = 16;

  var cv = null, ctx = null, dpr = 1, vw = 1, vh = 1;
  var cam = { x: 0, y: 220, z: 1 };
  var S = null;
  var time = 0, tidePhase = Math.PI * 0.85, tidePaused = false;
  var hover = -1, selected = -1, cursor = -1;
  var eligibleSet = null;
  var viewMode = 'base';
  var night = false, reduced = false, lowDetail = false;
  var frameAvg = 16;
  var lw = 1;
  var shadeCache = Object.create(null);
  var particles = [], floaters = [];
  var critters = [], flock = null, porpoise = null, nextFlock = 6, nextPorpoise = 4;
  var storm = 0, shake = 0;
  var sky = ['#cfe1e5', '#eef3f0'];
  var accent = [163, 48, 77];
  var presentKey = '';

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

  /* ---------- 색 ---------- */
  function hex2rgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbStr(c, a) {
    if (a === undefined) return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function nightify(c) { return night ? mix(c, NIGHT_RGB, 0.46) : c; }
  function col(hex, f) {
    var key = hex + f + (night ? 'n' : 'd');
    var v = shadeCache[key];
    if (!v) {
      var c = nightify(hex2rgb(hex));
      v = shadeCache[key] = rgbStr([c[0] * f, c[1] * f, c[2] * f]);
    }
    return v;
  }
  function colRgb(c, f) {
    var key = (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + '|' + f + (night ? 'n' : 'd');
    var v = shadeCache[key];
    if (!v) {
      var n = nightify(c);
      v = shadeCache[key] = rgbStr([n[0] * f, n[1] * f, n[2] * f]);
    }
    return v;
  }

  /* ---------- 투영 ---------- */
  function ix(x, y) { return (x - y) * HW; }
  function iy(x, y, z) { return (x + y) * HH - z * ZH; }
  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return null;
    return S.tiles[y * MW + x];
  }
  function noise(x, y, k) { return BV.sim.noise(x, y, k); }

  function quad(ax, ay, bx, by, cx, cy, dx, dy, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = fill; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function topQuad(x, y, z, fill, stroke) {
    quad(ix(x, y), iy(x, y, z), ix(x + 1, y), iy(x + 1, y, z), ix(x + 1, y + 1), iy(x + 1, y + 1, z),
      ix(x, y + 1), iy(x, y + 1, z), fill, stroke);
  }
  function topInset(x, y, z, m, fill) {
    quad(ix(x + m, y + m), iy(x + m, y + m, z), ix(x + 1 - m, y + m), iy(x + 1 - m, y + m, z),
      ix(x + 1 - m, y + 1 - m), iy(x + 1 - m, y + 1 - m, z), ix(x + m, y + 1 - m), iy(x + m, y + 1 - m, z), fill);
  }
  function sideL(x, y, z0, z1, fill) {
    quad(ix(x, y + 1), iy(x, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z0),
      ix(x + 1, y + 1), iy(x + 1, y + 1, z1), ix(x, y + 1), iy(x, y + 1, z1), fill, true);
  }
  function sideR(x, y, z0, z1, fill) {
    quad(ix(x + 1, y), iy(x + 1, y, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z0),
      ix(x + 1, y + 1), iy(x + 1, y + 1, z1), ix(x + 1, y), iy(x + 1, y, z1), fill, true);
  }
  function cube(x0, y0, z0, sx, sy, sz, hex) {
    var x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
    quad(ix(x0, y1), iy(x0, y1, z0), ix(x1, y1), iy(x1, y1, z0), ix(x1, y1), iy(x1, y1, z1), ix(x0, y1), iy(x0, y1, z1), col(hex, 0.8));
    quad(ix(x1, y0), iy(x1, y0, z0), ix(x1, y1), iy(x1, y1, z0), ix(x1, y1), iy(x1, y1, z1), ix(x1, y0), iy(x1, y0, z1), col(hex, 0.64));
    quad(ix(x0, y0), iy(x0, y0, z1), ix(x1, y0), iy(x1, y0, z1), ix(x1, y1), iy(x1, y1, z1), ix(x0, y1), iy(x0, y1, z1), col(hex, 1));
  }
  function roof(x0, y0, z0, sx, sy, hr, hex, wallHex) {
    var x1 = x0 + sx, y1 = y0 + sy, ym = y0 + sy / 2, zr = z0 + hr;
    quad(ix(x0, y0), iy(x0, y0, z0), ix(x1, y0), iy(x1, y0, z0), ix(x1, ym), iy(x1, ym, zr), ix(x0, ym), iy(x0, ym, zr), col(hex, 0.95));
    quad(ix(x0, y1), iy(x0, y1, z0), ix(x1, y1), iy(x1, y1, z0), ix(x1, ym), iy(x1, ym, zr), ix(x0, ym), iy(x0, ym, zr), col(hex, 0.76));
    ctx.beginPath();
    ctx.moveTo(ix(x1, y0), iy(x1, y0, z0)); ctx.lineTo(ix(x1, y1), iy(x1, y1, z0)); ctx.lineTo(ix(x1, ym), iy(x1, ym, zr));
    ctx.closePath(); ctx.fillStyle = col(wallHex, 0.64); ctx.fill();
  }

  /* ---------- 물때 ---------- */
  function waterLevel() {
    var slr = S ? (Math.min(S.year, C.END_YEAR) - C.START_YEAR) * C.SLR_PER_YEAR : 0;
    return C.TIDE_MID + slr + C.TIDE_AMP * Math.sin(tidePhase);
  }
  function surfaceZ(t, wl) { return BV.TIDAL[t.type] ? Math.max(t.h, wl) : t.h; }

  /* ---------- 지형 ---------- */
  function bodyRgb(t) {
    var base = hex2rgb(BODY[t.type] || '#6f5e4c');
    if (t.carbon > 0) return mix(base, CARBON_RGB, Math.min(1, t.carbon / 1000) * 0.8);
    return base;
  }
  function drawSides(t) {
    var x = t.x, y = t.y, h = t.h;
    var nl = tileAt(x, y + 1), nr = tileAt(x + 1, y);
    var zl = nl ? Math.min(nl.h, h) : BASE;
    var zr = nr ? Math.min(nr.h, h) : BASE;
    if (zl < h) bandsFor(t, zl, h, sideL, 0.84);
    if (zr < h) bandsFor(t, zr, h, sideR, 0.68);
  }
  function bandsFor(t, z0, z1, fn, f) {
    var top = Math.max(z0, z1 - 0.3);
    var x = t.x, y = t.y;
    if (z0 < 0) fn(x, y, z0, Math.min(0, top), col(BEDROCK, f));
    var b0 = Math.max(z0, 0);
    if (b0 < top) fn(x, y, b0, top, colRgb(bodyRgb(t), f));
    fn(x, y, top, z1, col(TOP[t.type], f * 0.95));
  }
  function drawTop(t) {
    var v = 0.95 + noise(t.x, t.y, 3) * 0.08;
    topQuad(t.x, t.y, t.h, col(TOP[t.type], v), true);
  }

  /* ---------- 물 ---------- */
  function waterRgb(d) {
    var pair = night ? WATER_NIGHT : WATER_DAY;
    return mix(pair[0], pair[1], Math.min(1, d / 2.4));
  }
  function drawWater(t, wl) {
    if (!BV.TIDAL[t.type] || wl <= t.h) return;
    var x = t.x, y = t.y, d = wl - t.h;
    var a = Math.min(0.84, 0.3 + d * 0.21);
    var c = waterRgb(d);
    var nl = tileAt(x, y + 1), nr = tileAt(x + 1, y);
    if (!nl || (!BV.TIDAL[nl.type] && nl.h < wl)) {
      quadSideWater(x, y, Math.max(nl ? nl.h : t.h, t.h), wl, 'L', rgbStr(mix(c, [0, 0, 0], 0.12), Math.min(0.9, a + 0.08)));
    }
    if (!nr || (!BV.TIDAL[nr.type] && nr.h < wl)) {
      quadSideWater(x, y, Math.max(nr ? nr.h : t.h, t.h), wl, 'R', rgbStr(mix(c, [0, 0, 0], 0.24), Math.min(0.9, a + 0.08)));
    }
    topQuad(x, y, wl, rgbStr(c, a));
    if (d < 0.24) topQuad(x, y, wl, rgbStr(night ? [150, 180, 190] : [236, 244, 240], (0.24 - d) * 1.9));
    if (!lowDetail && noise(x, y, 9) > 0.55) {
      var u = (time * 0.06 + noise(x, y, 10)) % 1;
      var gx = x + 0.15 + u * 0.7, gy = y + 0.2 + noise(x, y, 11) * 0.6;
      ctx.strokeStyle = night ? 'rgba(170,200,215,0.35)' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.4 * lw * dpr;
      ctx.beginPath();
      ctx.moveTo(ix(gx, gy), iy(gx, gy, wl)); ctx.lineTo(ix(gx + 0.16, gy), iy(gx + 0.16, gy, wl));
      ctx.stroke();
    }
  }
  function quadSideWater(x, y, z0, z1, side, fill) {
    if (z1 <= z0) return;
    if (side === 'L') {
      quad(ix(x, y + 1), iy(x, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z1), ix(x, y + 1), iy(x, y + 1, z1), fill);
    } else {
      quad(ix(x + 1, y), iy(x + 1, y, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z0), ix(x + 1, y + 1), iy(x + 1, y + 1, z1), ix(x + 1, y), iy(x + 1, y, z1), fill);
    }
  }

  /* ---------- 장식 (물 아래) ---------- */
  function decorUnder(t, wl) {
    var x = t.x, y = t.y, h = t.h, k;
    switch (t.type) {
      case 'seagrass': {
        var n = lowDetail ? 4 : 4 + t.stage * 3;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        for (k = 0; k < n; k++) {
          var u = 0.12 + noise(x, y, 20 + k) * 0.76, v = 0.12 + noise(x, y, 40 + k) * 0.76;
          var len = 0.32 + t.stage * 0.12 + noise(x, y, 60 + k) * 0.18;
          var sw = reduced || lowDetail ? 0 : Math.sin(time * 1.6 + k + x) * 0.07;
          ctx.strokeStyle = col(k % 3 === 0 ? '#3f8f58' : '#2f7a4b', t.health < 50 ? 0.75 : 1);
          ctx.beginPath();
          ctx.moveTo(ix(x + u, y + v), iy(x + u, y + v, h));
          ctx.quadraticCurveTo(ix(x + u, y + v), iy(x + u, y + v, h + len * 0.6),
            ix(x + u + sw, y + v - sw), iy(x + u + sw, y + v - sw, h + len));
          ctx.stroke();
        }
        if (presentHas('seahorse') && t.stage >= 3 && noise(x, y, 77) > 0.5) {
          var bob = Math.sin(time * 2 + x) * 0.05;
          cube(x + 0.55, y + 0.4, h + 0.25 + bob, 0.06, 0.06, 0.22, '#f0a43a');
        }
        break;
      }
      case 'mudflat':
      case 'marsh':
      case 'upper': {
        var holes = t.type === 'mudflat' ? 5 : 3;
        for (k = 0; k < holes; k++) {
          var hu = 0.12 + noise(x, y, 80 + k) * 0.76, hv = 0.12 + noise(x, y, 90 + k) * 0.76;
          topInsetAt(x + hu, y + hv, h, 0.05, col('#4a3c30', 1));
        }
        if (t.type === 'mudflat' && presentHas('worm')) {
          for (k = 0; k < 3; k++) {
            var wu = 0.15 + noise(x, y, 100 + k) * 0.7, wv = 0.15 + noise(x, y, 110 + k) * 0.7;
            cube(x + wu, y + wv, h, 0.07, 0.07, 0.035, '#a38d70');
          }
        }
        if (t.type === 'mudflat' && presentHas('clam')) {
          for (k = 0; k < 3; k++) {
            var cu = 0.15 + noise(x, y, 120 + k) * 0.7, cvv = 0.15 + noise(x, y, 130 + k) * 0.7;
            topInsetAt(x + cu, y + cvv, h + 0.01, 0.04, col('#e9e2d2', 1));
          }
        }
        break;
      }
      default:
        break;
    }
  }
  function topInsetAt(cx, cy, z, r, fill) {
    quad(ix(cx - r, cy - r), iy(cx - r, cy - r, z), ix(cx + r, cy - r), iy(cx + r, cy - r, z),
      ix(cx + r, cy + r), iy(cx + r, cy + r, z), ix(cx - r, cy + r), iy(cx - r, cy + r, z), fill);
  }

  /* ---------- 장식 (물 위) ---------- */
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
        for (k = 0; k < items.length; k++) {
          var it = items[k];
          var hh = 0.16 + t.stage * 0.07 + noise(x, y, 180 + it[2]) * 0.12;
          var c = MARSH_COLS[it[2] % MARSH_COLS.length];
          cubeF(x + it[0], y + it[1], h, 0.1, 0.1, hh, c, dry);
        }
        break;
      }
      case 'upper':
        if (t.restoring) {
          stake(x + 0.25, y + 0.3, h);
          stake(x + 0.7, y + 0.65, h);
        } else if (noise(x, y, 5) > 0.5) {
          cube(x + 0.3, y + 0.55, h, 0.12, 0.1, 0.06, '#9b9081');
        }
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
        if (presentHas('spoonbill') && noise(x, y, 16) > 0.2) {
          birdWhite(x + 0.3, y + 0.62, h);
          birdWhite(x + 0.62, y + 0.25, h);
        }
        break;
      case 'industry':
        cube(x + 0.1, y + 0.15, h, 0.55, 0.5, 0.5, '#c9cfd4');
        cube(x + 0.1, y + 0.15, h + 0.5, 0.55, 0.5, 0.06, '#3f6fa8');
        cube(x + 0.72, y + 0.2, h, 0.1, 0.1, 1.05, '#7a8085');
        cube(x + 0.71, y + 0.19, h + 1.05, 0.12, 0.12, 0.1, '#c8373f');
        cube(x + 0.62, y + 0.65, h, 0.26, 0.26, 0.3, '#dfe3e6');
        if (!reduced && Math.random() < 0.05) spawn('smoke', x + 0.77, y + 0.25, h + 1.2, 1);
        break;
      case 'resort':
        cube(x + 0.15, y + 0.15, h, 0.62, 0.6, 1.5, '#f4f2ec');
        resortWindows(x + 0.15, y + 0.15, h, 0.62, 0.6, 1.5);
        cube(x + 0.1, y + 0.1, h + 1.5, 0.72, 0.7, 0.08, '#3a7fc1');
        break;
      case 'solar':
        for (k = 0; k < 3; k++) cube(x + 0.08, y + 0.1 + k * 0.3, h + 0.12, 0.84, 0.2, 0.05, '#2f4f84');
        break;
      default:
        break;
    }
    if (t.walk) boardwalk(t);
    if (t.debris) debris(t, wl);
    if ((t.x === 3 && (t.y === 10 || t.y === 11)) && BV.TIDAL[t.type]) boat(t, wl);
  }
  function cubeF(x0, y0, z0, sx, sy, sz, hex, f) {
    if (f === 1) { cube(x0, y0, z0, sx, sy, sz, hex); return; }
    var x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
    quad(ix(x0, y1), iy(x0, y1, z0), ix(x1, y1), iy(x1, y1, z0), ix(x1, y1), iy(x1, y1, z1), ix(x0, y1), iy(x0, y1, z1), col(hex, 0.8 * f));
    quad(ix(x1, y0), iy(x1, y0, z0), ix(x1, y1), iy(x1, y1, z0), ix(x1, y1), iy(x1, y1, z1), ix(x1, y0), iy(x1, y0, z1), col(hex, 0.64 * f));
    quad(ix(x0, y0), iy(x0, y0, z1), ix(x1, y0), iy(x1, y0, z1), ix(x1, y1), iy(x1, y1, z1), ix(x0, y1), iy(x0, y1, z1), col(hex, f));
  }
  function windowL(x, y, z) {
    var c = night ? '#ffd27a' : '#41515c';
    quad(ix(x, y), iy(x, y, z), ix(x + 0.1, y), iy(x + 0.1, y, z), ix(x + 0.1, y), iy(x + 0.1, y, z + 0.12), ix(x, y), iy(x, y, z + 0.12), night ? c : col(c, 1));
  }
  function resortWindows(x0, y0, z0, sx, sy, sz) {
    var y1 = y0 + sy;
    var c = night ? '#ffd27a' : col('#5d7f9a', 1);
    for (var r = 0; r < 4; r++) {
      var z = z0 + 0.2 + r * 0.32;
      for (var k = 0; k < 3; k++) {
        var x = x0 + 0.06 + k * 0.2;
        quad(ix(x, y1), iy(x, y1, z), ix(x + 0.12, y1), iy(x + 0.12, y1, z), ix(x + 0.12, y1), iy(x + 0.12, y1, z + 0.14), ix(x, y1), iy(x, y1, z + 0.14), c);
      }
    }
  }
  function pine(x, y, z, s) {
    cube(x + 0.1 * s, y + 0.1 * s, z, 0.07 * s, 0.07 * s, 0.22 * s, '#6b4a33');
    cube(x, y, z + 0.2 * s, 0.28 * s, 0.28 * s, 0.26 * s, '#3f6f3e');
    cube(x + 0.05 * s, y + 0.05 * s, z + 0.46 * s, 0.18 * s, 0.18 * s, 0.22 * s, '#4f8a4a');
  }
  function stake(x, y, z) {
    cube(x, y, z, 0.03, 0.03, 0.36, '#8a6a4a');
    cube(x + 0.03, y, z + 0.26, 0.13, 0.02, 0.09, '#e2733a');
  }
  function debris(t, wl) {
    var z = Math.max(t.h, wl - 0.03);
    cube(t.x + 0.22, t.y + 0.3, z, 0.14, 0.12, 0.1, '#f4f4f0');
    cube(t.x + 0.55, t.y + 0.55, z, 0.11, 0.09, 0.06, '#3a7fc1');
    cube(t.x + 0.4, t.y + 0.72, z, 0.09, 0.09, 0.07, '#e2733a');
    cube(t.x + 0.68, t.y + 0.22, z, 0.1, 0.1, 0.08, '#f4f4f0');
  }
  function boardwalk(t) {
    var alongX = false;
    var l = tileAt(t.x - 1, t.y), r = tileAt(t.x + 1, t.y);
    if ((l && (l.walk || !BV.TIDAL[l.type])) || (r && (r.walk || !BV.TIDAL[r.type]))) alongX = true;
    var z = t.h + 0.22;
    if (alongX) {
      cube(t.x + 0.1, t.y + 0.42, t.h, 0.04, 0.04, 0.22, '#6b4a33');
      cube(t.x + 0.85, t.y + 0.42, t.h, 0.04, 0.04, 0.22, '#6b4a33');
      cube(t.x, t.y + 0.38, z, 1, 0.22, 0.05, '#b08458');
    } else {
      cube(t.x + 0.42, t.y + 0.1, t.h, 0.04, 0.04, 0.22, '#6b4a33');
      cube(t.x + 0.42, t.y + 0.85, t.h, 0.04, 0.04, 0.22, '#6b4a33');
      cube(t.x + 0.38, t.y, z, 0.22, 1, 0.05, '#b08458');
    }
  }
  function boat(t, wl) {
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

  /* ---------- 생물 움직임 ---------- */
  function presentHas(id) { return S && S.present.indexOf(id) >= 0; }

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
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
    function add(kind, list, n, color) {
      if (!list.length) return;
      for (var k = 0; k < n; k++) {
        critters.push({ kind: kind, i: pick(list), u: 0.2 + Math.random() * 0.6, v: 0.2 + Math.random() * 0.6,
          dir: Math.random() * 6.28, spd: 0.05 + Math.random() * 0.07, ph: Math.random() * 6.28, color: color });
      }
    }
    if (presentHas('mudcrab')) add('crab', flats, lowDetail ? 3 : 6, '#6f7458');
    if (presentHas('fiddler')) add('fiddler', marshes.concat(flats.slice(0, 10)), 4, '#c8402e');
    if (presentHas('whitecrab')) add('crab', flats, 3, '#d8c7a5');
    if (presentHas('mudskipper')) add('skipper', flats, 4, '#6d5a45');
    if (presentHas('spoonbill')) add('spoonbill', edges.length ? edges : flats, 3, '#f6f5ef');
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
        if (c.kind === 'fiddler') cube(x + 0.07, y + 0.01, z, 0.05, 0.04, 0.05, '#e04a2e');
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
        var sweep = reduced ? 0 : Math.sin(time * 2.4 + c.ph) * 0.06;
        cube(x - 0.05, y + 0.01, bz + 0.2, 0.05, 0.05, 0.07, '#f6f5ef');
        cube(x - 0.13, y + 0.02 + sweep, bz + 0.14, 0.09, 0.03, 0.02, '#1d1f22');
      }
    }
  }

  function updateCritters(dt) {
    for (var k = 0; k < critters.length; k++) {
      var c = critters[k];
      if (c.kind === 'spoonbill') { c.u += Math.cos(c.dir) * dt * 0.03; c.v += Math.sin(c.dir) * dt * 0.03; }
      else { c.u += Math.cos(c.dir) * c.spd * dt; c.v += Math.sin(c.dir) * c.spd * dt; }
      if (c.u < 0.12 || c.u > 0.85) { c.dir = Math.PI - c.dir; c.u = Math.max(0.12, Math.min(0.85, c.u)); }
      if (c.v < 0.12 || c.v > 0.85) { c.dir = -c.dir; c.v = Math.max(0.12, Math.min(0.85, c.v)); }
      if (Math.random() < dt * 0.4) c.dir += (Math.random() - 0.5) * 2;
    }
  }

  function drawFlock(dt) {
    if (!presentHas('godwit') || reduced) { flock = null; return; }
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
      var sx = ix(bx, by), sy = iy(bx, by, 7.5) + Math.sin(time * 9 + k) * 1.5;
      var wing = 4 + Math.sin(time * 9 + k) * 2;
      ctx.beginPath();
      ctx.moveTo(sx - wing, sy - 2); ctx.lineTo(sx, sy); ctx.lineTo(sx + wing, sy - 2);
      ctx.stroke();
    }
  }

  function drawPorpoise(dt, wl) {
    if (!presentHas('porpoise') || reduced) { porpoise = null; return; }
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
    var arc = Math.sin(p * Math.PI) * 0.35;
    cube(t.x + 0.2 + p * 0.5, t.y + 0.45, wl - 0.05 + arc, 0.28, 0.12, 0.11, '#8e9499');
  }

  /* ---------- 파티클 ---------- */
  function spawn(kind, x, y, z, n, opt) {
    if (reduced && kind !== 'co2in' && kind !== 'co2out') n = Math.min(n, 2);
    for (var k = 0; k < n; k++) {
      var p = { kind: kind, x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.5, z: z,
        vx: 0, vy: 0, vz: 0, life: 0, max: 1.2 + Math.random() * 0.6, c: opt && opt.color };
      switch (kind) {
        case 'leaf': p.vz = 1.6 + Math.random(); p.vx = (Math.random() - 0.5) * 0.6; p.vy = (Math.random() - 0.5) * 0.6; break;
        case 'spark': p.vz = 1 + Math.random() * 1.2; p.max = 0.9; break;
        case 'dust': p.vz = 0.6 + Math.random() * 0.6; p.vx = (Math.random() - 0.5) * 0.8; p.vy = (Math.random() - 0.5) * 0.8; break;
        case 'smoke': p.vz = 0.5; p.vx = 0.15; p.max = 3; break;
        case 'co2in': p.z = z + 1.6 + Math.random() * 0.8; p.vz = -1.3; p.max = 1.4; break;
        case 'co2out': p.vz = 0.9 + Math.random() * 0.5; p.max = 2.2; break;
        case 'bubble': p.vz = 0.8 + Math.random() * 0.5; p.max = 1.2; break;
        default: break;
      }
      particles.push(p);
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }

  function drawParticles(dt) {
    for (var k = particles.length - 1; k >= 0; k--) {
      var p = particles[k];
      p.life += dt;
      if (p.life > p.max) { particles.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 'leaf' || p.kind === 'dust') p.vz -= 3 * dt;
      var a = 1 - p.life / p.max;
      var sx = ix(p.x, p.y), sy = iy(p.x, p.y, p.z);
      switch (p.kind) {
        case 'co2in':
          ctx.fillStyle = 'rgba(70,160,210,' + (0.85 * a) + ')';
          ctx.beginPath(); ctx.arc(sx, sy, 3.2, 0, 6.283); ctx.fill();
          break;
        case 'co2out':
        case 'smoke':
          ctx.fillStyle = 'rgba(120,120,120,' + (0.55 * a) + ')';
          ctx.beginPath(); ctx.arc(sx, sy, 3 + p.life * 3, 0, 6.283); ctx.fill();
          break;
        case 'bubble':
          ctx.strokeStyle = 'rgba(230,245,250,' + a + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, 6.283); ctx.stroke();
          break;
        case 'spark':
          ctx.fillStyle = 'rgba(255,250,220,' + a + ')';
          ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
          break;
        default:
          ctx.fillStyle = p.c ? rgbStr(hex2rgb(p.c), a) : (p.kind === 'dust' ? 'rgba(150,120,90,' + a + ')' : 'rgba(80,150,70,' + a + ')');
          ctx.fillRect(sx - 2, sy - 2, 4, 4);
          break;
      }
    }
  }

  function drawFloaters(dt) {
    var fs = 13 / cam.z;
    ctx.font = '600 ' + fs + 'px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (var k = floaters.length - 1; k >= 0; k--) {
      var f = floaters[k];
      f.life += dt;
      if (f.life > f.max) { floaters.splice(k, 1); continue; }
      var a = Math.min(1, (f.max - f.life) * 2);
      var sx = ix(f.x, f.y), sy = iy(f.x, f.y, f.z + f.life * 0.8);
      ctx.lineWidth = 3 / cam.z;
      ctx.strokeStyle = 'rgba(15,25,30,' + 0.55 * a + ')';
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color.replace('A', String(a));
      ctx.fillText(f.text, sx, sy);
    }
  }

  /* ---------- 강조 ---------- */
  function diamond(x, y, z) {
    ctx.beginPath();
    ctx.moveTo(ix(x, y), iy(x, y, z)); ctx.lineTo(ix(x + 1, y), iy(x + 1, y, z));
    ctx.lineTo(ix(x + 1, y + 1), iy(x + 1, y + 1, z)); ctx.lineTo(ix(x, y + 1), iy(x, y + 1, z));
    ctx.closePath();
  }
  function drawOverlay(t, i, wl) {
    var z = surfaceZ(t, wl) + 0.02;
    if (viewMode === 'carbon' && t.carbon > 0) {
      var f = Math.min(1, t.carbon / 1000);
      diamond(t.x, t.y, z);
      ctx.fillStyle = 'rgba(' + Math.round(230 - 200 * f) + ',' + Math.round(240 - 170 * f) + ',' + Math.round(250 - 110 * f) + ',0.82)';
      ctx.fill();
    } else if (viewMode === 'health' && BV.ECO[t.type]) {
      var hh = t.health / 100;
      var r = hh < 0.5 ? 210 : Math.round(210 - (hh - 0.5) * 2 * 160);
      var g = hh < 0.5 ? Math.round(70 + hh * 2 * 130) : 200;
      diamond(t.x, t.y, z);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',80,0.78)';
      ctx.fill();
    }
    if (eligibleSet && eligibleSet[i]) {
      var pulse = reduced ? 0.28 : 0.2 + 0.14 * (0.5 + 0.5 * Math.sin(time * 4));
      diamond(t.x, t.y, z);
      ctx.fillStyle = rgbStr(accent, pulse);
      ctx.fill();
      ctx.strokeStyle = rgbStr(accent, 0.8);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    if (i === selected) {
      diamond(t.x, t.y, z);
      ctx.strokeStyle = 'rgba(20,25,28,0.9)'; ctx.lineWidth = 4.5; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
    } else if (i === hover) {
      diamond(t.x, t.y, z);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (i === cursor && cursor !== selected) {
      diamond(t.x, t.y, z);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ---------- 프레임 ---------- */
  function drawColumn(t, i, wl) {
    drawSides(t);
    drawTop(t);
    decorUnder(t, wl);
    drawWater(t, wl);
    decorOver(t, wl);
    if (critters.length) drawCritters(t, wl);
    drawOverlay(t, i, wl);
  }

  function frame(dtMs) {
    if (!ctx || !S) return;
    var t0 = performance.now();
    var dt = Math.min(0.06, Math.max(0, dtMs) / 1000);
    time += dt;
    if (!tidePaused) tidePhase += dt * 2 * Math.PI / C.TIDE_PERIOD * (reduced ? 0.6 : 1);
    var wl = waterLevel();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    var sx = 0, sy = 0;
    if (shake > 0) { shake -= dt; sx = (Math.random() - 0.5) * 6; sy = (Math.random() - 0.5) * 4; }
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z + sx), dpr * (vh / 2 - cam.y * cam.z + sy));
    lw = 1.1 / (cam.z * dpr);

    ctx.fillStyle = night ? 'rgba(0,0,0,0.25)' : 'rgba(40,60,60,0.12)';
    ctx.beginPath();
    ctx.ellipse(0, iy(MW / 2, MH / 2, BASE) + 30, MW * HW * 1.02, MH * HH * 0.5, 0, 0, 6.283);
    ctx.fill();

    for (var d = 0; d <= MW + MH - 2; d++) {
      var x0 = Math.max(0, d - MH + 1), x1 = Math.min(MW - 1, d);
      for (var x = x0; x <= x1; x++) {
        var y = d - x, i = y * MW + x;
        drawColumn(S.tiles[i], i, wl);
      }
    }
    drawPorpoise(dt, wl);
    drawFlock(dt);
    drawParticles(dt);
    drawFloaters(dt);
    updateCritters(dt);

    if (storm > 0) {
      storm -= dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(20,32,42,' + Math.min(0.38, storm * 0.3) + ')';
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = 'rgba(210,225,235,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var k = 0; k < 70; k++) {
        var rx = (k * 137 + time * 900) % (vw + 100) - 50, ry = (k * 89 + time * 1400) % (vh + 60) - 30;
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 8, ry + 18);
      }
      ctx.stroke();
    }

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
  function bounds() {
    return { x0: -MH * HW, x1: MW * HW, y0: iy(0, 0, 6.6), y1: iy(MW, MH, BASE) };
  }
  function fit() {
    var b = bounds();
    var pad = vw < 520 ? 12 : 36;
    cam.z = Math.min((vw - pad * 2) / (b.x1 - b.x0), (vh - pad * 2) / (b.y1 - b.y0));
    cam.z = Math.max(0.2, Math.min(cam.z, 2.4));
    cam.x = (b.x0 + b.x1) / 2;
    cam.y = (b.y0 + b.y1) / 2;
  }
  function clampCam() {
    var b = bounds();
    cam.x = Math.max(b.x0, Math.min(b.x1, cam.x));
    cam.y = Math.max(b.y0, Math.min(b.y1, cam.y));
  }
  function pan(dx, dy) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
  function zoomAt(f, px, py) {
    var wx = (px - vw / 2) / cam.z + cam.x, wy = (py - vh / 2) / cam.z + cam.y;
    cam.z = Math.max(0.25, Math.min(3, cam.z * f));
    cam.x = wx - (px - vw / 2) / cam.z;
    cam.y = wy - (py - vh / 2) / cam.z;
    clampCam();
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

  /* ---------- 효과 ---------- */
  function burst(i, kind) {
    var t = S.tiles[i];
    if (!t) return;
    var x = t.x + 0.5, y = t.y + 0.5, z = t.h + 0.3;
    switch (kind) {
      case 'marsh': spawn('leaf', x, y, z, 10, { color: '#c2454f' }); spawn('leaf', x, y, z, 5, { color: '#6f9a4a' }); break;
      case 'seagrass': spawn('bubble', x, y, z, 10); spawn('leaf', x, y, z, 6, { color: '#2f7a4b' }); break;
      case 'cleanup': spawn('spark', x, y, z, 12); break;
      case 'restore': case 'openwall': spawn('bubble', x, y, z, 10); spawn('dust', x, y, z, 8); break;
      case 'boardwalk': spawn('dust', x, y, z, 8); break;
      case 'develop': spawn('dust', x, y, z, 14); spawn('co2out', x, y, z, 6); break;
      case 'discover': spawn('spark', x, y, z + 0.3, 16); break;
      default: break;
    }
  }
  function float(i, text, color) {
    var t = S.tiles[i];
    if (!t) return;
    floaters.push({ x: t.x + 0.5, y: t.y + 0.5, z: t.h + 0.6, text: text, color: color || 'rgba(255,255,255,A)', life: 0, max: 1.8 });
  }
  function yearFX(rep) {
    if (!rep) return;
    var list = rep.absorbByTile.slice().sort(function (a, b) { return b[1] - a[1]; });
    list.slice(0, reduced ? 12 : 48).forEach(function (p) {
      var t = S.tiles[p[0]];
      spawn('co2in', t.x + 0.5, t.y + 0.5, t.h, Math.min(3, Math.ceil(p[1])));
    });
    list.slice(0, 3).forEach(function (p) { float(p[0], '+' + p[1].toFixed(1) + 't', 'rgba(150,220,255,A)'); });
    S.tiles.forEach(function (t, i) {
      if (t.emit > 0.5) { spawn('co2out', t.x + 0.5, t.y + 0.5, t.h + 0.4, 3); if (Math.random() < 0.3) float(i, 'CO₂↑', 'rgba(230,230,230,A)'); }
    });
    if (rep.typhoon) { storm = 2.2; shake = reduced ? 0 : 0.8; }
  }

  /* ---------- 공개 API ---------- */
  BV.render = {
    init: function (canvas) {
      cv = canvas;
      ctx = cv.getContext('2d');
      resize();
      fit();
    },
    setState: function (s) { S = s; presentKey = ''; particles = []; floaters = []; flock = null; porpoise = null; storm = 0; this.sync(); },
    sync: function () {
      if (!S) return;
      var key = S.present.join(',') + '|' + S.year;
      if (key !== presentKey) { presentKey = key; rebuildCritters(); }
    },
    resize: function () { resize(); clampCam(); },
    fit: fit,
    frame: frame,
    pick: pick,
    pan: pan,
    zoomAt: zoomAt,
    zoomCenter: function (f) { zoomAt(f, vw / 2, vh / 2); },
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
    tide: function () {
      var wl = waterLevel();
      var rising = Math.cos(tidePhase) > 0;
      var lo = C.TIDE_MID - C.TIDE_AMP, hi = C.TIDE_MID + C.TIDE_AMP;
      var base = S ? (Math.min(S.year, C.END_YEAR) - C.START_YEAR) * C.SLR_PER_YEAR : 0;
      return { level: wl, rising: rising, frac: Math.max(0, Math.min(1, (wl - base - lo) / (hi - lo))), paused: tidePaused };
    },
    setTheme: function (isNight, skyTop, skyBottom, accentHex) {
      night = !!isNight;
      shadeCache = Object.create(null);
      if (skyTop) sky = [skyTop, skyBottom || skyTop];
      if (accentHex && /^#[0-9a-f]{6}$/i.test(accentHex)) accent = hex2rgb(accentHex);
    },
    setReducedMotion: function (b) { reduced = !!b; },
    burst: burst,
    float: float,
    yearFX: yearFX,
    screenOf: function (i) {
      var t = S.tiles[i];
      var wx = ix(t.x + 0.5, t.y + 0.5), wy = iy(t.x + 0.5, t.y + 0.5, t.h);
      return { x: (wx - cam.x) * cam.z + vw / 2, y: (wy - cam.y) * cam.z + vh / 2 };
    }
  };
})(window.BV = window.BV || {});

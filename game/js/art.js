// 갯벌 수호대 — 복셀 아트 (모델을 코드로 만들고 캔버스 그림으로 구워 둬요)
(function (root) {
  'use strict';
  const GS = root.GS, U = GS.U, TL = GS.TILE;

  // ── 색 도구 ────────────────────────────────────────────
  const cache = new Map();
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, k) {
    const key = hex + k;
    let v = cache.get(key);
    if (v) return v;
    const [r, g, b] = rgb(hex);
    const f = c => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) * 0.9 + c * (k - 1) * 0.25 : c * k)));
    v = `rgb(${f(r)},${f(g)},${f(b)})`;
    cache.set(key, v);
    return v;
  }
  function mix(a, b, t) {
    const A = rgb(a), B = rgb(b);
    const h = i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
    return '#' + h(0) + h(1) + h(2);
  }

  // ── 복셀 모델 ─────────────────────────────────────────
  function V(w, d, h) { this.w = w; this.d = d; this.h = h; this.a = new Array(w * d * h).fill(null); }
  V.prototype.ok = function (x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.d && z < this.h; };
  V.prototype.set = function (x, y, z, c) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (this.ok(x, y, z)) this.a[x + y * this.w + z * this.w * this.d] = typeof c === 'function' ? c(x, y, z) : c;
    return this;
  };
  V.prototype.get = function (x, y, z) { return this.ok(x, y, z) ? this.a[x + y * this.w + z * this.w * this.d] : null; };
  V.prototype.box = function (x0, y0, z0, x1, y1, z1, c) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, z, c);
    return this;
  };
  V.prototype.ell = function (cx, cy, cz, rx, ry, rz, c) {
    for (let z = 0; z < this.h; z++) for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) {
      const a = (x + 0.5 - cx) / rx, b = (y + 0.5 - cy) / ry, e = (z + 0.5 - cz) / rz;
      if (a * a + b * b + e * e <= 1) this.set(x, y, z, c);
    }
    return this;
  };
  V.prototype.paint = function (fn) {
    for (let z = 0; z < this.h; z++) for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) {
      const i = x + y * this.w + z * this.w * this.d, c = this.a[i];
      if (c) { const n = fn(x, y, z, c); if (n !== undefined) this.a[i] = n; }
    }
    return this;
  };
  V.prototype.del = function (fn) {
    for (let z = 0; z < this.h; z++) for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) if (fn(x, y, z)) this.a[x + y * this.w + z * this.w * this.d] = null;
    return this;
  };
  // 앞쪽(보는 사람 쪽) 맨 앞 칸에 색칠 — 눈 그리기용
  V.prototype.face = function (x, z, c) {
    for (let y = this.d - 1; y >= 0; y--) if (this.get(x, y, z)) { this.set(x, y, z, c); return this; }
    return this;
  };
  // 맨 위 칸에 색칠
  V.prototype.top = function (x, y, c) {
    for (let z = this.h - 1; z >= 0; z--) if (this.get(x, y, z)) { this.set(x, y, z, c); return this; }
    return this;
  };
  const H = (x, y, z, s) => U.hash2(x * 7 + z * 131, y * 13 + z * 17, s || 3);

  // ── 모델 정의 ─────────────────────────────────────────
  const M = {};
  function def(name, u, frames, fn, ol) { M[name] = { u, frames, fn, ol }; }

  // 플레이어·친구 생물
  def('crab', 1.8, 2, f => {
    const v = new V(16, 11, 12);
    const LEG = '#6f7a3c', SHELL = '#b3c072', TOP = '#c6d184', DOT = '#97a55a', BELLY = '#f4e7c3', CLAW = '#f6e2ad', TIP = '#fff6dc';
    for (const lx of [1, 14]) for (const ly of [3, 5, 7]) { const dy = f && lx === 1 && ly === 5 ? 1 : 0; v.box(lx, ly + dy, 0, lx, ly + dy, 1, LEG); }
    v.ell(8, 5.4, 3.4, 6.4, 4.6, 3.3, (x, y, z) => {
      if (z <= 2 && y >= 8) return BELLY;
      if (z >= 5) return H(x, y, z, 61) < 0.1 ? DOT : TOP;
      return SHELL;
    });
    v.box(5, 7, 6, 5, 7, 7, SHELL).box(10, 7, 6, 10, 7, 7, SHELL);
    for (const [x0, inner] of [[4, 1], [9, 0]]) {
      v.box(x0, 7, 8, x0 + 2, 8, 10, '#ffffff');
      const px = x0 + inner;
      v.set(px, 8, 8, '#161616').set(px + 1, 8, 8, '#161616').set(px, 8, 9, '#161616').set(px + 1, 8, 9, inner ? '#ffffff' : '#161616');
      if (!inner) v.set(px, 8, 9, '#ffffff');
    }
    v.face(3, 3, '#ff9fb0').face(4, 3, '#ffb7c4').face(12, 3, '#ff9fb0').face(11, 3, '#ffb7c4');
    v.face(7, 2, '#5b3a2a').face(9, 2, '#5b3a2a').face(8, 1, '#5b3a2a');
    v.box(0, 6, 1, 2, 9, 3, CLAW).box(0, 8, 4, 1, 9, 4, TIP);
    const rz = f ? 3 : 1;
    v.box(13, 6, rz, 15, 9, rz + 2, CLAW).box(14, 8, rz + 3, 15, 9, rz + 3, TIP);
    if (f) v.box(13, 7, 1, 13, 7, 2, SHELL);
    return v;
  });
  def('seal', 1.7, 2, f => {
    const v = new V(19, 9, 14);
    const BODY = '#d4dbe0', SPOT = '#6f7d87', HEAD = '#e2e8eb', FL = '#a7b2b9';
    v.ell(8.5, 4.5, 3, 7.6, 3.8, 3, (x, y, z) => z <= 1 ? '#eef2f4' : (H(x, y, z, 71) < 0.13 && z >= 3 ? SPOT : BODY));
    v.ell(14, 4.6, 5.4, 3.7, 3.6, 3.5, (x, y, z) => (H(x, y, z, 72) < 0.07 && z >= 7 ? SPOT : HEAD));
    const tz = f ? 2 : 1;
    v.box(0, 3, tz, 1, 6, tz + 1, FL).set(0, 2, tz + 1, FL).set(0, 7, tz + 1, FL);
    const fz = f ? 1 : 0;
    v.box(9, 7, fz, 11, 8, fz + 1, FL);
    v.face(12, 6, '#141414').face(13, 6, '#141414').face(12, 7, '#141414').face(13, 7, '#ffffff');
    v.face(15, 6, '#141414').face(16, 6, '#141414').face(15, 7, '#ffffff').face(16, 7, '#141414');
    v.face(11, 5, '#ffb3c0').face(17, 5, '#ffb3c0');
    v.face(14, 5, '#3a3a3a');
    v.face(13, 4, '#f6f8f9').face(14, 4, '#f6f8f9').face(15, 4, '#f6f8f9');
    v.face(14, 3, '#5b4a4a');
    const segs = ['#ff5a5a', '#ffffff', '#3a8fd1', '#ffd23f'];
    for (let x = 12; x <= 15; x++) for (let y = 3; y <= 6; y++) for (let z = 9; z <= 12; z++) {
      const ex = x === 12 || x === 15, ey = y === 3 || y === 6, ez = z === 9 || z === 12;
      if ((ex && ey) || (ex && ez) || (ey && ez)) continue;
      v.set(x, y, z, z === 12 ? '#ffffff' : segs[(x + (f ? 1 : 0)) % 4]);
    }
    return v;
  });
  def('ball', 1.6, 2, f => {
    const v = new V(7, 7, 7);
    const segs = ['#ff5a5a', '#ffffff', '#3a8fd1', '#ffffff', '#ffd23f', '#ffffff'];
    v.ell(3.5, 3.5, 3.5, 3.5, 3.5, 3.5, (x, y, z) => {
      if (z >= 6) return '#ffffff';
      const a = Math.atan2(y + 0.5 - 3.5, x + 0.5 - 3.5) + Math.PI + f * 0.52;
      return segs[Math.floor(a / (Math.PI * 2) * 6) % 6];
    });
    return v;
  });
  def('seahorse', 1.6, 2, f => {
    const v = new V(7, 5, 13);
    const O = '#ffaa3c', L = '#ffd28a';
    v.ell(3.5, 2.5, 6.5, 2.2, 2, 2.8, (x, y, z) => y >= 3 ? L : O);
    v.ell(3.8, 2.5, 10, 2, 1.8, 1.8, O);
    v.box(5, 2, 10, 6, 2, 10, O);
    v.set(4, 4, 11, '#161616');
    v.set(2, 2, 12, '#ff7a3c').set(3, 2, 12, '#ff7a3c');
    const tz = [3, 2, 1, 1, 2];
    const tx = f ? [3, 3, 4, 5, 5] : [3, 2, 2, 3, 4];
    for (let i = 0; i < 5; i++) v.set(tx[i], 2, tz[i] - (i === 3 ? 1 : 0), O);
    v.set(1, 2, 7, '#ffe0a0');
    return v;
  });
  def('nakji', 1.6, 2, f => {
    const v = new V(9, 9, 9);
    v.ell(4.5, 4.5, 5.6, 3, 2.8, 3, (x, y, z) => z >= 7 ? '#d2765c' : '#c0684f');
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + (f ? 0.3 : 0);
      for (let t = 0; t < 3; t++) v.set(4.5 + Math.cos(a) * (2.4 + t) - 0.5, 4.5 + Math.sin(a) * (2.4 + t) - 0.5, Math.max(0, 2 - t + (t === 2 ? 1 : 0)), t === 2 ? '#e8957a' : '#c0684f');
    }
    v.face(3, 5, '#ffffff').face(5, 5, '#ffffff').face(3, 5, '#161616').face(6, 5, '#161616');
    v.face(4, 3, '#ff9fb0');
    return v;
  });
  def('spoonbill', 1.9, 2, f => {
    const v = new V(19, 7, 15);
    const W = '#f5f4ee', G = '#e3e2da';
    v.box(7, 3, 0, 7, 3, 4, '#262626').box(10, 3, 0, 10, 3, 4, '#262626');
    if (f) v.box(7, 4, 0, 7, 4, 1, '#262626').del((x, y, z) => x === 7 && y === 3 && z < 2);
    v.ell(8.5, 3.5, 7, 4.6, 2.9, 2.9, (x, y, z) => (y === 0 || y === 6) && z > 6 ? G : W);
    v.ell(3.5, 3.5, 7.5, 1.8, 1.6, 1.2, G);
    v.box(11, 3, 9, 12, 4, 11, W).set(11, 5, 9, '#f0d27a');
    v.ell(13.5, 3.5, 12, 2.1, 1.9, 1.8, W);
    v.box(14, 3, 11, 15, 4, 12, '#1d1d1d');
    v.box(16, 3, 11, 17, 4, 11, '#1d1d1d').box(18, 2, 10, 18, 5, 11, '#1d1d1d');
    v.set(12, 3, 14, '#f2c14e').set(12, 4, 14, '#f2c14e').set(11, 4, 13, '#f2c14e');
    v.set(14, 5, 12, '#7a1e1e');
    return v;
  });
  def('mudskipper', 1.8, 2, f => {
    const v = new V(17, 6, 8);
    v.ell(8, 3, 2.5, 7.2, 2.3, 2.3, (x, y, z) => z <= 1 ? '#a9a48b' : H(x, y, z, 5) < 0.14 ? '#62b8ee' : '#7b7766');
    v.ell(13.2, 3, 2.7, 3.2, 2.5, 2.4, (x, y, z) => z <= 1 ? '#aaa58c' : '#807b69');
    v.set(13, 2, 5, '#e6dfc3').set(13, 4, 5, '#e6dfc3').set(14, 2, 5, '#151515').set(14, 4, 5, '#151515');
    v.set(13, 2, 6, '#e6dfc3').set(13, 4, 6, '#e6dfc3');
    v.box(4, 3, 5, 9, 3, 5, '#5f5b4d').set(5, 3, 6, '#62b8ee').set(7, 3, 6, '#5f5b4d').set(8, 3, 6, '#62b8ee');
    v.set(11, 0, 1, '#6c6858').set(11, 5, 1, '#6c6858');
    const tz = f ? 3 : 1;
    v.box(0, 2, tz, 1, 4, tz + 1, '#6c6858');
    return v;
  });
  def('porpoise', 1.8, 2, f => {
    const v = new V(19, 7, 8);
    v.ell(9.5, 3.5, 3.3, 8.3, 2.9, 2.9, (x, y, z) => z <= 1 ? '#cdd4d8' : z >= 5 ? '#76848f' : '#83919c');
    for (let x = 6; x <= 10; x++) v.top(x, 3, '#68757f');
    v.face(15, 4, '#1b1b1b');
    v.face(16, 2, '#5d6a74');
    v.face(17, 2, '#5d6a74');
    const tz = f ? 4 : 2;
    v.box(0, 1, tz, 1, 5, tz, '#68757f').set(2, 3, tz, '#76848f');
    v.set(12, 6, 1, '#68757f').set(12, 6, 2, '#68757f');
    return v;
  });
  def('clam', 1.7, 2, f => {
    const v = new V(8, 6, 6);
    v.ell(4, 3, 2.3, 3.8, 2.8, 2.2, (x, y, z) => (x + z) % 2 ? '#dccaa5' : '#9b8362');
    for (let x = 1; x <= 6; x++) v.face(x, 2, '#5a4a36');
    if (f) v.box(4, 2, 4, 4, 2, 5, '#f2d6c4');
    return v;
  });
  def('lugworm', 1.6, 2, f => {
    const v = new V(12, 4, 5);
    for (let x = 0; x < 12; x++) {
      const z = 1 + Math.round(Math.sin((x + f * 2) * 0.85) * 1);
      v.box(x, 1, z, x, 2, z + 1, x === 11 ? '#a84a4a' : x % 2 ? '#de7d72' : '#c4625c');
    }
    return v;
  });
  def('seagrass', 1.6, 1, () => {
    const v = new V(8, 5, 13);
    v.box(0, 0, 0, 7, 4, 0, '#cdb47e');
    const blades = [[1, 2, 10, 0.12], [3, 1, 12, -0.08], [4, 3, 11, 0.1], [6, 2, 9, -0.14]];
    for (const [bx, by, hh, lean] of blades) for (let z = 1; z <= hh; z++) v.set(bx + lean * z, by, z, z > hh - 3 ? '#6cc37a' : '#3f9a5a');
    return v;
  });
  def('tidewave', 1.6, 1, () => {
    const v = new V(13, 5, 9);
    for (let x = 0; x < 13; x++) {
      const hh = Math.round(3 + Math.sin(x * 0.55 + 0.6) * 2.6 + (x > 6 ? 1 : 0));
      for (let z = 0; z <= hh; z++) v.box(x, 1, z, x, 3, z, z >= hh - 0 ? '#e8f6ff' : z > hh - 3 ? '#5fb3ea' : '#2f7fc4');
    }
    return v;
  });

  // 오염 몬스터
  def('bag', 2.0, 2, f => {
    const v = new V(10, 8, 13);
    v.ell(5, 4, 6.8, 4.4, 3.5, 4.8, (x, y, z) => z > 8 ? '#f7fbfd' : z > 4 ? '#e8f0f4' : '#d7e3ea');
    v.del((x, y, z) => z <= 2 && (x + f) % 3 === 0);
    v.del((x, y, z) => z <= 0);
    v.box(2, 4, 11, 2, 4, 12, '#dbe7ee').box(7, 4, 11, 7, 4, 12, '#dbe7ee');
    v.face(3, 7, '#24323f').face(6, 7, '#24323f').face(4, 5, '#24323f').face(5, 5, '#24323f');
    return v;
  });
  def('micro', 1.8, 3, f => {
    const col = ['#ff7aa8', '#5ad1e6', '#ffd24a'][f];
    const v = new V(5, 5, 5);
    v.ell(2.5, 2.5, 2.4, 2.5, 2.5, 2.4, (x, y, z) => z >= 3 ? shade(col, 1.08) : col);
    v.face(1, 3, '#1b1b1b').face(3, 3, '#1b1b1b');
    return v;
  });
  def('foam', 2.1, 1, () => {
    const v = new V(12, 10, 9);
    v.box(0, 0, 0, 11, 9, 8, (x, y, z) => H(x, y, z, 9) < 0.22 ? '#dcd8cc' : '#f4f2ea');
    v.del((x, y, z) => (x === 0 || x === 11) && (y === 0 || y === 9));
    v.del((x, y, z) => (z === 8) && (x === 0 || x === 11 || y === 0 || y === 9));
    v.del((x, y, z) => x >= 9 && y <= 2 && z >= 6);
    v.set(3, 9, 5, '#1b1b1b').set(4, 9, 5, '#1b1b1b').set(2, 9, 6, '#1b1b1b');
    v.set(7, 9, 5, '#1b1b1b').set(8, 9, 5, '#1b1b1b').set(9, 9, 6, '#1b1b1b');
    v.box(4, 9, 2, 7, 9, 2, '#3b3b3b');
    return v;
  });
  def('bottle', 1.8, 2, f => {
    const v = new V(16, 6, 6);
    for (let x = 1; x <= 12; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 6; z++) {
      const a = (y + 0.5 - 3) / 2.8, b = (z + 0.5 - 3) / 2.8;
      if (a * a + b * b <= 1) v.set(x, y, z, x >= 5 && x <= 8 ? (f ? '#ff8a7a' : '#e05a4f') : (z >= 4 ? '#c9ecf8' : '#9fd3ea'));
    }
    v.box(13, 2, 2, 13, 3, 3, '#bfe6f5').box(14, 2, 2, 15, 3, 3, '#2f80ed');
    v.face(10, 3, '#1b1b1b').face(11, 3, '#1b1b1b');
    return v;
  });
  def('oil', 2.1, 2, f => {
    const v = new V(12, 10, 8);
    v.ell(6, 5, 0.6, 5.9, 4.9, f ? 6 : 6.8, (x, y, z) => {
      const h = H(x, y, z, 11);
      return h < 0.08 ? '#6b4c9a' : h < 0.15 ? '#2d8a8a' : z >= 4 ? '#2a2a33' : '#1c1c22';
    });
    v.face(4, 3, '#f3f3f3').face(7, 3, '#f3f3f3');
    return v;
  }, '#9a8fb0');
  def('oilS', 1.8, 1, () => {
    const v = new V(8, 7, 5);
    v.ell(4, 3.5, 0.6, 3.9, 3.4, 4.4, (x, y, z) => H(x, y, z, 12) < 0.12 ? '#2d8a8a' : z >= 3 ? '#2a2a33' : '#1c1c22');
    v.face(3, 2, '#f3f3f3').face(5, 2, '#f3f3f3');
    return v;
  }, '#9a8fb0');
  def('net', 2.0, 1, () => {
    const v = new V(12, 10, 10);
    v.ell(6, 5, 4.7, 5.8, 4.8, 4.7, (x, y, z) => (x + y + z) % 2 ? '#4b8f6a' : '#2f6b4c');
    v.del((x, y, z) => (x * 3 + y * 5 + z * 7) % 11 === 0 && z > 1);
    v.top(3, 3, '#f08a24').top(8, 6, '#f08a24').top(5, 7, '#ffb347');
    v.face(4, 5, '#ffe066').face(7, 5, '#ffe066');
    return v;
  });
  def('smog', 2.0, 1, () => {
    const v = new V(12, 10, 10);
    const c = (x, y, z) => H(x, y, z, 13) < 0.3 ? '#5f646e' : z > 6 ? '#585d67' : '#474b54';
    v.ell(4, 5, 4, 3.6, 3.6, 3.3, c).ell(8, 5, 5, 3.8, 3.8, 3.7, c).ell(6, 5, 7.3, 3, 3, 2.6, c);
    v.face(5, 5, '#ff5a4a').face(8, 5, '#ff5a4a');
    return v;
  });
  def('urchin', 2.0, 1, () => {
    const v = new V(11, 11, 10);
    v.ell(5.5, 5.5, 4, 3.6, 3.6, 3.4, '#3b2440');
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0.7, 0.7, 0.3], [-0.7, 0.7, 0.3], [0.7, -0.7, 0.3], [-0.7, -0.7, 0.3], [0, 0, 1], [0.6, 0, 0.8], [-0.6, 0, 0.8], [0, 0.6, 0.8]];
    for (const [a, b, c] of dirs) for (let k = 3; k <= 5; k++) v.set(5.5 + a * k - 0.5, 5.5 + b * k - 0.5, 4 + c * k, k === 5 ? '#9a6aab' : '#5b3a66');
    v.face(4, 4, '#ffd166').face(7, 4, '#ffd166');
    return v;
  });
  def('jelly', 2.0, 2, f => {
    const v = new V(10, 10, 12);
    v.ell(5, 5, 7.6, 4.6, 4.6, 4, (x, y, z) => z >= 9 ? '#ffc3e0' : '#f6a7cf');
    v.del((x, y, z) => z < 6);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2, tx = 5 + Math.cos(a) * 2.6, ty = 5 + Math.sin(a) * 2.6;
      for (let z = 1; z <= 6; z++) v.set(tx + Math.sin(z * 1.3 + f * 2 + k) * 0.7, ty, z, '#f4b6d6');
    }
    v.face(3, 7, '#7a2a55').face(6, 7, '#7a2a55');
    return v;
  });
  def('barrel', 2.0, 1, () => {
    const v = new V(10, 10, 12);
    for (let z = 0; z <= 10; z++) for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const a = (x + 0.5 - 5) / 4.7, b = (y + 0.5 - 5) / 4.7;
      if (a * a + b * b > 1) continue;
      let c = z === 3 || z === 8 ? '#5a2a1e' : '#7d3b2a';
      if (z === 5 || z === 6) c = (x + y + z) % 2 ? '#f2c037' : '#2b2b2b';
      if (z === 10) c = H(x, y, z, 14) < 0.5 ? '#1c1c22' : '#6a3324';
      v.set(x, y, z, c);
    }
    v.face(3, 8, '#f2f2f2').face(6, 8, '#f2f2f2');
    for (let z = 1; z <= 9; z++) if (z !== 5 && z !== 6 && H(2, z, 1, 15) < 0.5) v.face(7, z, '#1c1c22');
    return v;
  });

  def('algae', 2.1, 2, f => {
    const v = new V(12, 10, 8);
    v.ell(6, 5, 0.6, 5.9, 4.9, f ? 6 : 6.8, (x, y, z) => {
      const h = H(x, y, z, 81);
      return h < 0.1 ? '#a8e070' : h < 0.18 ? '#2f6b2a' : z >= 4 ? '#5fae45' : '#4a9238';
    });
    v.face(4, 3, '#f3f3f3').face(7, 3, '#f3f3f3').face(4, 2, '#163016').face(7, 2, '#163016');
    return v;
  });
  def('algaeS', 1.8, 1, () => {
    const v = new V(8, 7, 5);
    v.ell(4, 3.5, 0.6, 3.9, 3.4, 4.4, (x, y, z) => H(x, y, z, 82) < 0.15 ? '#a8e070' : z >= 3 ? '#5fae45' : '#4a9238');
    v.face(3, 2, '#f3f3f3').face(5, 2, '#f3f3f3');
    return v;
  });
  def('tire', 2.0, 2, f => {
    const v = new V(12, 6, 12);
    for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) {
      const r = Math.hypot(x + 0.5 - 6, z + 0.5 - 6), a = Math.atan2(z + 0.5 - 6, x + 0.5 - 6);
      if (r > 5.9 || r < 2.4) continue;
      const tread = r > 4.6 && Math.floor((a + Math.PI) / (Math.PI / 8) + f) % 2 === 0;
      v.box(x, 1, z, x, 4, z, r < 3.2 ? '#8a8f94' : tread ? '#3c3c3c' : '#252527');
    }
    v.face(4, 7, '#ff5a4a').face(7, 7, '#ff5a4a');
    return v;
  });
  def('starfish', 2.0, 2, f => {
    const v = new V(13, 13, 4);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      const dx = x + 0.5 - 6.5, dy = y + 0.5 - 6.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + (f ? 0.3 : 0);
      const arm = Math.pow(Math.abs(Math.cos(a * 2.5)), 3);
      if (r > 2.2 + arm * 4.4) continue;
      const hh = r < 2.5 ? 3 : 2;
      for (let z = 0; z < hh; z++) v.set(x, y, z, z === hh - 1 && H(x, y, z, 83) < 0.25 ? '#ffc07a' : '#e2603a');
    }
    v.top(5, 7, '#161616').top(8, 7, '#161616');
    return v;
  });
  def('starS', 1.7, 1, () => {
    const v = new V(9, 9, 3);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const dx = x + 0.5 - 4.5, dy = y + 0.5 - 4.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (r > 1.6 + Math.pow(Math.abs(Math.cos(a * 2.5)), 3) * 3.2) continue;
      v.box(x, y, 0, x, y, 1, H(x, y, 1, 84) < 0.25 ? '#ffc07a' : '#e2603a');
    }
    v.top(3, 5, '#161616').top(5, 5, '#161616');
    return v;
  });
  def('heat', 2.0, 2, f => {
    const v = new V(10, 10, 11);
    v.ell(5, 5, 4, 4.4, 4.2, 4, (x, y, z) => z >= 6 ? '#ffd23f' : z >= 3 ? '#ff9a3c' : '#ff6a3c');
    for (let k = 0; k < 5; k++) { const x = 2 + k * 1.5, hh = 8 + ((k + f) % 2) * 2; for (let z = 7; z <= hh; z++) v.set(x, 5, z, z === hh ? '#fff3a0' : '#ffb347'); }
    v.face(3, 4, '#3a1606').face(6, 4, '#3a1606');
    return v;
  }, '#7a2a10');

  // 보스
  def('algaeKing', 2.4, 2, f => {
    const v = new V(24, 20, 18);
    v.ell(12, 10, 1, 11.5, 9.5, f ? 14 : 15.5, (x, y, z) => {
      const h = H(x, y, z, 85);
      return h < 0.08 ? '#c8f08a' : h < 0.16 ? '#2f6b2a' : z >= 9 ? '#6cbf4e' : '#4a9238';
    });
    for (let k = 0; k < 6; k++) { const x = 5 + k * 2.6; v.top(x, 6 + (k % 3), '#e8ffb0'); }
    for (const ex of [7, 14]) { v.face(ex, 9, '#ffffff').face(ex + 1, 9, '#ffffff').face(ex, 10, '#ffffff').face(ex + 1, 10, '#ffffff').face(ex + (ex < 10 ? 1 : 0), 9, '#161616'); }
    v.face(8, 12, '#1d3a12').face(15, 12, '#1d3a12');
    for (let x = 9; x <= 14; x++) v.face(x, 6, '#1d3a12');
    return v;
  });
  def('heatDome', 2.4, 2, f => {
    const v = new V(22, 20, 18);
    v.ell(11, 10, 6, 10.5, 9.5, 8, (x, y, z) => z >= 10 ? '#ffd23f' : z >= 6 ? '#ff9a3c' : '#ff6a3c');
    v.del((x, y, z) => z < 1);
    for (let k = 0; k < 7; k++) { const x = 3 + k * 2.6, hh = 15 + ((k + f) % 3); for (let z = 13; z <= hh; z++) v.set(x, 10, z, z >= hh - 1 ? '#fff6b0' : '#ffb347'); }
    for (const ex of [6, 13]) { v.face(ex, 9, '#2a1206').face(ex + 1, 9, '#2a1206').face(ex + 2, 9, '#2a1206').face(ex, 10, '#2a1206').face(ex + 1, 10, '#2a1206').face(ex + 2, 10, '#2a1206'); }
    v.face(9, 10, '#2a1206').face(10, 10, '#2a1206').face(11, 10, '#2a1206').face(12, 10, '#2a1206');
    v.face(9, 6, '#7a2a10').face(10, 5, '#7a2a10').face(11, 5, '#7a2a10').face(12, 6, '#7a2a10');
    return v;
  }, '#7a2a10');
  def('dozer', 2.5, 2, f => {
    const v = new V(25, 18, 17);
    const tr = (x, y, z) => ((x + f) % 2 ? '#3a3a3a' : '#242424');
    v.box(1, 1, 0, 19, 4, 3, tr).box(1, 13, 0, 19, 16, 3, tr);
    for (const x of [3, 9, 15]) v.box(x, 16, 1, x + 1, 16, 2, '#7a7a7a');
    v.box(2, 3, 4, 18, 15, 9, (x, y, z) => z === 4 ? '#c98d18' : '#f2b632');
    v.box(3, 5, 10, 11, 13, 15, '#f2b632').box(4, 13, 11, 10, 13, 14, '#9fd3ea').box(11, 6, 11, 11, 12, 14, '#9fd3ea');
    v.box(3, 5, 16, 11, 13, 16, '#e0a52a');
    v.box(14, 6, 10, 14, 6, 14, '#555').set(14, 6, 15, '#2b2b2b');
    v.box(17, 4, 3, 21, 5, 5, '#c98d18').box(17, 12, 3, 21, 13, 5, '#c98d18');
    v.box(21, 1, 0, 23, 17, 7, (x, y, z) => z === 7 ? '#c3c8cc' : z === 0 ? '#6f757b' : '#9aa0a6');
    v.set(13, 15, 8, '#fff3a0').set(16, 15, 8, '#fff3a0').set(13, 15, 9, '#2b2b2b').set(16, 15, 9, '#2b2b2b').set(12, 15, 9, '#2b2b2b').set(17, 15, 9, '#2b2b2b');
    return v;
  });
  def('octo', 2.3, 2, f => {
    const v = new V(24, 20, 20);
    v.ell(12, 10, 12.5, 7.8, 7.4, 7, (x, y, z) => {
      if ((x + z) % 4 === 0 || (y + z) % 5 === 0) return '#4b8f6a';
      return H(x, y, z, 21) < 0.15 ? '#8e3558' : '#b04a72';
    });
    v.top(9, 8, '#f08a24').top(15, 12, '#f08a24');
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + 0.2;
      for (let t = 0; t < 7; t++) {
        const rr = 5 + t * 1.15, x = 12 + Math.cos(a) * rr, y = 10 + Math.sin(a) * rr * 0.9;
        const z = 1 + Math.round(Math.sin(t * 0.9 + k + f * 1.6) * 1.2) + (t < 2 ? 2 : 0);
        v.set(x, y, z, t % 2 ? '#c25a84' : '#a8476b').set(x, y, z + 1, '#a8476b');
      }
    }
    for (const ex of [8, 15]) { v.face(ex, 12, '#f5f5f5').face(ex + 1, 12, '#f5f5f5').face(ex, 13, '#f5f5f5').face(ex + 1, 13, '#f5f5f5').face(ex + (ex < 12 ? 1 : 0), 12, '#151515'); }
    return v;
  });
  def('tanker', 2.5, 1, () => {
    const v = new V(34, 14, 17);
    for (let x = 0; x <= 31; x++) {
      const tp = x > 26 ? x - 26 : 0;
      v.box(x, 1 + tp, 0, x, 12 - tp, 5, (xx, y, z) => z <= 1 ? '#9a2f2f' : H(xx, y, z, 31) < 0.05 ? '#111' : '#2a2a2e');
    }
    v.box(1, 2, 6, 27, 11, 6, '#55555b');
    for (let x = 9; x <= 26; x += 1) v.set(x, 6, 7, x % 4 === 0 ? '#e0b43a' : '#c9a227');
    v.box(1, 3, 7, 7, 10, 13, '#e9e9e6').box(2, 10, 11, 6, 10, 11, '#ff5a4a');
    v.box(3, 5, 14, 5, 7, 16, '#9a2f2f').box(3, 5, 16, 5, 7, 16, '#1c1c1c');
    for (let x = 8; x <= 28; x++) if (H(x, 2, 2, 33) < 0.25) v.box(x, 12, 0, x, 12, Math.floor(H(x, 1, 1, 34) * 4), '#0f0f12');
    return v;
  });

  // 줍는 것
  const gem = (col, hi) => () => {
    const v = new V(5, 5, 7);
    for (let z = 0; z < 7; z++) for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++)
      if (Math.abs(x - 2) + Math.abs(y - 2) + Math.abs(z - 3) * 0.75 <= 2.3) v.set(x, y, z, z >= 4 ? hi : col);
    return v;
  };
  def('gem1', 1.25, 1, gem('#2f95ff', '#9fd8ff'));
  def('gem2', 1.55, 1, gem('#18d1b0', '#9ff5e2'));
  def('gem3', 1.95, 1, gem('#ffb21f', '#ffe9a0'));
  def('heart', 1.7, 1, () => {
    const v = new V(8, 4, 8);
    for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
      const X = (x + 0.5 - 4) / 4, Z = (z + 0.5 - 3.6) / 4;
      const inH = Math.pow(X * X + Z * Z - 0.35, 3) - X * X * Z * Z * Z < 0;
      if (inH) v.box(x, 1, z, x, 2, z, z >= 5 && x <= 3 ? '#ff9eb0' : '#ff4d6d');
    }
    return v;
  });
  def('magnet', 1.6, 1, () => {
    const v = new V(9, 4, 9);
    for (let x = 0; x < 9; x++) for (let z = 0; z < 9; z++) {
      const dx = x + 0.5 - 4.5, dz = z + 0.5 - 4.5, r = Math.hypot(dx, dz);
      if (z >= 4 && r >= 2 && r <= 4.4) v.box(x, 1, z, x, 2, z, '#e8453c');
      if (z < 4 && (x <= 1 || x >= 7)) v.box(x, 1, z, x, 2, z, z <= 1 ? '#d6dde2' : '#e8453c');
    }
    return v;
  });
  def('chest', 2.0, 2, f => {
    const v = new V(11, 8, 10);
    v.box(0, 0, 0, 10, 7, 5, (x, y, z) => (x === 0 || x === 10 || x === 5 || z === 0) ? '#f2c94c' : '#8b5a2b');
    if (!f) {
      v.box(0, 0, 6, 10, 7, 7, (x, y, z) => (x === 0 || x === 10 || x === 5) ? '#f2c94c' : '#9c6a35');
      v.box(1, 1, 8, 9, 6, 8, (x, y, z) => x === 5 ? '#f2c94c' : '#9c6a35');
      v.box(5, 7, 4, 5, 7, 6, '#ffe58a');
    } else {
      v.box(1, 1, 5, 9, 6, 5, '#fff2a8');
      v.box(0, 0, 6, 10, 1, 9, (x, y, z) => (x === 0 || x === 10 || x === 5) ? '#f2c94c' : '#9c6a35');
    }
    return v;
  });
  def('pearl', 1.5, 1, () => new V(5, 5, 5).ell(2.5, 2.5, 2.5, 2.5, 2.5, 2.5, (x, y, z) => z >= 3 && x <= 2 ? '#ffffff' : z >= 2 ? '#f6f1e7' : '#e8dcd8'));
  def('burrow', 1.6, 1, () => {
    const v = new V(8, 8, 3);
    v.ell(4, 4, 0.5, 4, 4, 2.2, (x, y, z) => z >= 1 ? '#7a5c3c' : '#5f4630');
    v.box(3, 3, 1, 4, 4, 2, null).set(3, 3, 1, '#2b1d12').set(4, 4, 1, '#2b1d12').set(3, 4, 1, '#2b1d12').set(4, 3, 1, '#2b1d12');
    v.set(4, 3, 2, '#de7d72');
    return v;
  });

  // 패시브 아이콘
  def('mudblock', 2.0, 1, () => new V(6, 6, 5).box(0, 0, 0, 5, 5, 4, (x, y, z) => z === 4 && H(x, y, z, 41) < 0.3 ? '#a8865e' : H(x, y, z, 42) < 0.12 ? '#4f3a26' : '#7a5a3a'));
  def('reed', 1.6, 1, () => {
    const v = new V(8, 5, 11);
    v.box(0, 0, 0, 7, 4, 0, '#7a5a3a');
    const st = [[1, 2, 8, '#b0405a'], [3, 1, 10, '#c4506a'], [5, 3, 9, '#6aa84f'], [6, 1, 7, '#b0405a']];
    for (const [x, y, hh, c] of st) { for (let z = 1; z <= hh; z++) v.set(x, y, z, c); v.set(x + 1, y, hh - 2, c); v.set(x - 1, y, hh - 4, c); }
    return v;
  });
  def('current', 1.6, 1, () => {
    const v = new V(11, 4, 7);
    v.box(0, 1, 2, 6, 2, 4, '#45c4e8');
    for (let k = 0; k < 4; k++) v.box(7 + k, 1, 3 - (3 - k), 7 + k, 2, 3 + (3 - k), k === 0 ? '#45c4e8' : '#bdf0ff');
    return v;
  });
  def('plankton', 1.6, 1, () => {
    const v = new V(9, 6, 9);
    v.ell(2.5, 3, 2.5, 2, 2, 2, '#7be0a0').ell(6.5, 3, 3, 2.2, 2.2, 2.2, '#57c7c2').ell(4.5, 3, 6.5, 1.8, 1.8, 1.8, '#b7f59c');
    return v;
  });
  def('sun', 1.6, 1, () => {
    const v = new V(10, 4, 10);
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) {
      const r = Math.hypot(x + 0.5 - 5, z + 0.5 - 5), a = Math.atan2(z + 0.5 - 5, x + 0.5 - 5);
      if (r <= 2.8) v.box(x, 1, z, x, 2, z, r < 1.6 ? '#ffe46b' : '#ffcf33');
      else if (r <= 4.6 && Math.abs(Math.sin(a * 4)) > 0.82) v.box(x, 1, z, x, 2, z, '#ffa51f');
    }
    return v;
  });
  def('flow', 1.6, 1, () => {
    const v = new V(10, 4, 10);
    for (let k = 0; k < 120; k++) {
      const t = k / 120 * Math.PI * 3.2, r = 1 + t * 0.42;
      v.box(5 + Math.cos(t) * r - 0.5, 1, 5 + Math.sin(t) * r - 0.5, 5 + Math.cos(t) * r - 0.5, 2, 5 + Math.sin(t) * r - 0.5, k < 50 ? '#7cc6f0' : '#3a8fd1');
    }
    return v;
  });
  def('oyster', 1.7, 1, () => {
    const v = new V(10, 8, 4);
    v.ell(5, 4, 1, 4.8, 3.6, 2.8, (x, y, z) => z >= 2 ? (H(x, y, z, 51) < 0.4 ? '#8c867e' : '#aaa49b') : '#7a746c');
    v.top(4, 4, '#e9e4da').top(5, 4, '#e9e4da');
    return v;
  });
  def('sprout', 1.6, 1, () => {
    const v = new V(8, 5, 9);
    v.box(1, 1, 0, 6, 3, 1, '#6b5034');
    v.box(4, 2, 2, 4, 2, 6, '#4caf50');
    v.box(1, 2, 6, 3, 2, 7, '#7bd36b').box(5, 2, 7, 7, 2, 8, '#7bd36b').set(4, 2, 7, '#4caf50');
    return v;
  });
  def('moon', 1.6, 1, () => {
    const v = new V(10, 4, 10);
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) {
      const r = Math.hypot(x + 0.5 - 5, z + 0.5 - 5);
      if (r <= 4.6) v.box(x, 1, z, x, 2, z, (Math.hypot(x - 3, z - 6) < 1.2 || Math.hypot(x - 6.5, z - 3) < 1) ? '#e2d28a' : '#fff2b3');
    }
    return v;
  });
  def('kelp', 1.6, 1, () => {
    const v = new V(8, 5, 12);
    v.box(0, 0, 0, 7, 4, 0, '#c9b07a');
    for (const [bx, by, hh, c] of [[2, 2, 11, '#6b8f3a'], [4, 1, 9, '#8aa84a'], [5, 3, 10, '#5a7a30']]) for (let z = 1; z <= hh; z++) v.set(bx + Math.round(Math.sin(z * 0.7 + bx) * 0.8), by, z, z % 3 === 0 ? '#a8c25a' : c);
    return v;
  });
  def('coral', 1.6, 1, () => {
    const v = new V(9, 6, 10);
    v.box(1, 1, 0, 7, 4, 0, '#e6d3a1');
    const br = [[4, 3, 0, 7], [2, 3, 3, 4], [6, 3, 4, 3], [3, 2, 6, 3], [5, 2, 6, 2]];
    for (const [x, y, z0, hh] of br) for (let z = z0; z < z0 + hh; z++) v.set(x + (z > z0 + 1 ? (x < 4 ? -1 : x > 4 ? 1 : 0) : 0), y, z + 1, z === z0 + hh - 1 ? '#ffb0bc' : '#ff7a8a');
    return v;
  });
  def('skull', 1.6, 1, () => {
    const v = new V(7, 5, 7);
    v.ell(3.5, 2.5, 4, 3.4, 2.4, 3, '#f1efe6');
    v.box(2, 1, 0, 4, 3, 1, '#f1efe6');
    v.face(2, 4, '#2b2b2b').face(4, 4, '#2b2b2b').face(3, 2, '#2b2b2b');
    return v;
  });

  // ── 굽기 ───────────────────────────────────────────────
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  const OUTLINE = '#17202c';

  function bakeVox(v, vs, olc) {
    const ts = Math.max(1, Math.round(vs * 0.55)), fs = vs;
    const ol = Math.max(1, Math.round(vs * 0.32));
    const pad = ol + 1;
    const W = v.w * vs + pad * 2, Hh = v.d * ts + v.h * fs + pad * 2;
    const base = mk(W, Hh), g = base.getContext('2d');
    for (let y = 0; y < v.d; y++) for (let z = 0; z < v.h; z++) for (let x = 0; x < v.w; x++) {
      const c = v.get(x, y, z);
      if (!c) continue;
      const sx = pad + x * vs, sy = pad + y * ts + (v.h - 1 - z) * fs;
      const j = 0.96 + U.hash2(x, y + z * 31, 7) * 0.08;
      if (!v.get(x, y + 1, z)) {
        g.fillStyle = shade(c, 0.8 * j); g.fillRect(sx, sy + ts, vs, fs);
        if (!v.get(x, y, z - 1) && z > 0) { g.fillStyle = shade(c, 0.66); g.fillRect(sx, sy + ts + fs - Math.max(1, vs * 0.18), vs, Math.max(1, vs * 0.18)); }
      }
      if (!v.get(x, y, z + 1)) { g.fillStyle = shade(c, 1.1 * j); g.fillRect(sx, sy, vs, ts); }
    }
    const out = mk(W, Hh), o = out.getContext('2d');
    const sil = mk(W, Hh), sg = sil.getContext('2d');
    sg.drawImage(base, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = olc || OUTLINE; sg.fillRect(0, 0, W, Hh);
    o.globalAlpha = 0.9;
    for (const [dx, dy] of [[-ol, 0], [ol, 0], [0, -ol], [0, ol], [-ol, -ol], [ol, -ol], [-ol, ol], [ol, ol]]) o.drawImage(sil, dx, dy);
    o.globalAlpha = 1;
    o.drawImage(base, 0, 0);
    const fl = mk(W, Hh), fg = fl.getContext('2d');
    fg.drawImage(out, 0, 0);
    fg.globalCompositeOperation = 'source-atop';
    fg.fillStyle = 'rgba(255,255,255,0.92)'; fg.fillRect(0, 0, W, Hh);
    return { c: out, f: fl, ax: pad + v.w * vs / 2, ay: pad + v.d * ts / 2 + v.h * fs, w: W, h: Hh };
  }

  let BS = 2;
  const SPR = {};
  function bakeAll(bs) {
    BS = bs;
    for (const name in M) {
      const m = M[name];
      const vs = Math.max(1, Math.round(m.u * bs));
      const k = vs / bs; // 실제 월드 px/복셀
      SPR[name] = [];
      for (let f = 0; f < m.frames; f++) {
        const sp = bakeVox(m.fn(f), vs, m.ol);
        sp.k = k / m.u;
        SPR[name].push(sp);
      }
    }
    TILES.theme = null;
  }
  function spr(name, f) { const a = SPR[name]; return a ? a[(f || 0) % a.length] : null; }

  // ── 아이콘 (DOM용 이미지) ────────────────────────────────
  const ICON = {};
  function icon(name, size, f) {
    size = size || 96;
    const key = name + '@' + size + ':' + (f || 0);
    if (ICON[key]) return ICON[key];
    const m = M[name];
    if (!m) return '';
    const v = m.fn(f || 0);
    const span = Math.max(v.w, v.d * 0.55 + v.h);
    const vs = Math.max(2, Math.floor((size * 0.8) / span));
    const sp = bakeVox(v, vs);
    const c = mk(size, size), g = c.getContext('2d');
    g.drawImage(sp.c, Math.round((size - sp.w) / 2), Math.round((size - sp.h) / 2));
    ICON[key] = c.toDataURL();
    return ICON[key];
  }
  function silhouette(name, size) {
    const key = 'sil:' + name + '@' + size;
    if (ICON[key]) return ICON[key];
    const c = mk(size, size), g = c.getContext('2d');
    const m = M[name], v = m.fn(0);
    const span = Math.max(v.w, v.d * 0.55 + v.h);
    const vs = Math.max(2, Math.floor((size * 0.8) / span));
    const sp = bakeVox(v, vs);
    g.drawImage(sp.c, Math.round((size - sp.w) / 2), Math.round((size - sp.h) / 2));
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgba(20,32,48,0.85)'; g.fillRect(0, 0, size, size);
    ICON[key] = c.toDataURL();
    return ICON[key];
  }

  // ── 땅 타일 ────────────────────────────────────────────
  const THEMES = {
    tidal: {
      sea: '#2a6f93', sea2: '#3e8bb0', creek: '#4d5957', creekSheen: ['#6d5b86', '#4d7d6b'], dirty: '#58534b', dirty2: '#4a4640',
      mud: '#8b6a47', mud2: '#a3805a', hole: '#3b2a1a', marshBase: '#62763a', tuft: [['#b23a5b', '#d6667f'], ['#4f9a34', '#8cd25d']],
      pool: '#3c9ea6', poolGrass: '#3f8f5a', concrete: '#8e8d87', seam: '#7a7973',
      front: { 2: '#45413a', 3: '#5c4430', 4: '#4f3b28', 6: '#66655f', 1: '#3c4644', 5: '#2f7a80' },
      litter: true, sky: null,
    },
    forest: {
      sea: '#15476d', sea2: '#24618a', creek: '#24506a', creekSheen: ['#2f6a86', '#3a5a7a'], dirty: '#c6bfb6', dirty2: '#a9a197',
      mud: '#cdb27a', mud2: '#e0c993', hole: '#a88f5f', marshBase: '#b79e6a', tuft: [['#4e8a3a', '#79b356'], ['#7a8f2e', '#a8bd4a']],
      pool: '#2e8a8a', poolGrass: '#3f9a5a', concrete: '#9ea1a3', seam: '#85888a',
      front: { 2: '#8f877d', 3: '#a08655', 4: '#8a7248', 6: '#727578', 1: '#1d4058', 5: '#22686c' },
      litter: false, urchins: true, sky: 'rgba(30,110,170,0.16)',
    },
    oil: {
      sea: '#22394c', sea2: '#2f4b60', creek: '#333b3f', creekSheen: ['#6b4f9a', '#2d8a8a'], dirty: '#3d3a34', dirty2: '#2f2c28',
      mud: '#a68a63', mud2: '#bea27a', hole: '#5a442c', marshBase: '#94804f', tuft: [['#b5a95f', '#d8cc7c'], ['#6e9a3e', '#95c160']],
      pool: '#3a8fa0', poolGrass: '#3f8f5a', concrete: '#9a9993', seam: '#82817b',
      front: { 2: '#221f1b', 3: '#6e5a3e', 4: '#5f4c32', 6: '#73726c', 1: '#1d2428', 5: '#2d6f7c' },
      litter: false, sheen: true, sky: 'rgba(60,40,20,0.10)',
    },
  };
  THEMES.estuary = {
    sea: '#3a6066', sea2: '#4d7a80', creek: '#4b5a3a', creekSheen: ['#6a8a3a', '#3f6a3a'], dirty: '#575843', dirty2: '#474836',
    mud: '#8f7b5a', mud2: '#a68f6b', hole: '#4a3a28', marshBase: '#6f7f3e', tuft: [['#c9b46a', '#e6d38a'], ['#7da044', '#a8c860']],
    pool: '#4f98a0', poolGrass: '#4f8f5a', concrete: '#8e8d87', seam: '#7a7973',
    front: { 2: '#3f402f', 3: '#5f4e36', 4: '#4f4a2c', 6: '#66655f', 1: '#34402a', 5: '#2f7a80' },
    litter: true, sky: 'rgba(90,100,40,0.07)',
  };
  THEMES.reef = {
    sea: '#0e5f84', sea2: '#1d7ea6', creek: '#1c6e8c', creekSheen: ['#2f8fb0', '#3aa0c0'], dirty: '#d6d2c9', dirty2: '#bdb9b0',
    mud: '#e3d09e', mud2: '#f1e2b8', hole: '#c9b27e', marshBase: '#d9c48e', tuft: [['#ff7a8a', '#ffb0bc'], ['#b07aff', '#d6b8ff'], ['#ff9a4a', '#ffc58a']],
    pool: '#2fb3c0', poolGrass: '#3f9a6a', concrete: '#9ea1a3', seam: '#85888a',
    front: { 2: '#a8a49b', 3: '#bba57a', 4: '#a8925f', 6: '#727578', 1: '#155470', 5: '#1f8a96' },
    litter: false, bleach: true, beams: true, sky: 'rgba(30,140,200,0.14)',
  };
  THEMES.forest.beams = true;
  const TILES = { theme: null, set: {} };
  function cellTex(g, S, base, base2, seed, jit) {
    const n = 8, cs = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const h = U.hash2(x, y, seed);
      g.fillStyle = shade(h < 0.18 ? base2 : base, 1 - jit + U.hash2(x + 9, y + 3, seed) * jit * 2);
      g.fillRect(Math.floor(x * cs), Math.floor(y * cs), Math.ceil(cs), Math.ceil(cs));
    }
  }
  function cube(g, x, y, s, c, hgt) {
    g.fillStyle = shade(c, 0.78); g.fillRect(x, y + s * 0.55, s, s * (hgt || 1));
    g.fillStyle = shade(c, 1.12); g.fillRect(x, y, s, s * 0.55);
  }
  function bakeTile(th, type, vi, fr, S) {
    const c = mk(S, S), g = c.getContext('2d');
    const seed = 100 + type * 17 + vi * 5;
    const cs = S / 8;
    const R = (k) => U.hash2(vi * 131 + k * 17 + 7, type * 59 + k * 7 + vi * 13, 77 + fr * 13);
    if (type === TL.SEA) {
      cellTex(g, S, th.sea, th.sea, seed, 0.04);
      g.fillStyle = th.sea2;
      for (let k = 0; k < 3; k++) {
        const y = Math.floor(((k * 2.7 + vi * 1.3 + fr * 0.9) % 8)) * cs;
        const x = Math.floor(U.hash2(k, vi, 5 + fr) * 5) * cs;
        g.fillRect(x, y, cs * 3, Math.max(1, cs * 0.5));
      }
    } else if (type === TL.CREEK || type === TL.POOL) {
      const clean = type === TL.POOL;
      cellTex(g, S, clean ? th.pool : th.creek, clean ? th.pool : th.creek, seed, 0.05);
      if (clean) {
        g.fillStyle = 'rgba(160,240,235,0.35)';
        for (let k = 0; k < 3; k++) g.fillRect(Math.floor(R(k) * 7) * cs, Math.floor(((R(k + 4) * 8 + fr * 1.5) % 8)) * cs, cs * 2, Math.max(1, cs * 0.45));
        for (let k = 0; k < 5; k++) {
          const x = Math.floor(R(k + 10) * 7.5) * cs, hh = 2 + Math.floor(R(k + 20) * 3);
          for (let j = 0; j < hh; j++) { g.fillStyle = j === hh - 1 ? '#7fd08a' : th.poolGrass; g.fillRect(x + ((fr + j + k) % 2) * cs * 0.3, S - cs * (j + 1.6), cs * 0.6, cs); }
        }
      } else {
        for (let k = 0; k < 4; k++) { g.fillStyle = th.creekSheen[k % 2] + 'aa'; g.fillRect(Math.floor(R(k) * 7) * cs, Math.floor(((R(k + 4) * 8 + fr) % 8)) * cs, cs * 2, cs * 0.6); }
        if (th.litter && R(30) < 0.22) cube(g, Math.floor(R(31) * 6) * cs, Math.floor(R(32) * 6) * cs, cs * 1.1, '#a4aaad', 0.5);
      }
    } else if (type === TL.DIRTY) {
      cellTex(g, S, th.dirty, th.dirty2, seed, 0.03);
      if (R(33) < 0.55) { g.fillStyle = shade(th.dirty2, 0.82); g.fillRect(Math.floor(R(34) * 6) * cs, Math.floor(R(35) * 7) * cs, cs * 2, cs); }
      if (th.sheen || R(36) < 0.35) { g.fillStyle = th.creekSheen[vi % 2] + (th.sheen ? '88' : '55'); g.fillRect(Math.floor(R(37) * 6) * cs, Math.floor(R(38) * 7) * cs, cs * 2, cs * 0.6); }
      if (th.litter && R(40) < 0.26) {
        const items = ['#8f9496', '#8a4a44', '#94803f', '#66787e'];
        const x = Math.floor(R(41) * 6) * cs, y = Math.floor(R(51) * 6) * cs;
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + cs * 1.1, cs * 1.5, cs * 0.4);
        cube(g, x, y, cs * (1 + R(61) * 0.5), items[Math.floor(R(71) * items.length)], 0.6);
      }
      if (th.urchins) {
        for (let k = 0; k < 3; k++) { g.fillStyle = k ? '#e0a3ad' : '#d48b98'; g.fillRect(Math.floor(R(k + 80) * 7) * cs, Math.floor(R(k + 83) * 7) * cs, cs * 1.4, cs); }
        if (R(90) < 0.4) cube(g, Math.floor(R(91) * 6) * cs, Math.floor(R(92) * 6) * cs, cs * 1.3, '#3b2440', 0.6);
      }
    } else if (type === TL.MUD || type === TL.MARSH) {
      const marsh = type === TL.MARSH;
      cellTex(g, S, marsh ? th.marshBase : th.mud, marsh ? mix(th.marshBase, th.mud, 0.55) : th.mud2, seed, 0.05);
      g.fillStyle = shade(th.mud2, 1.08);
      for (let k = 0; k < 2; k++) g.fillRect(Math.floor(R(k) * 5) * cs, Math.floor(R(k + 2) * 8) * cs, cs * (2 + Math.floor(R(k + 4) * 2)), Math.max(1, cs * 0.4));
      if (!marsh) {
        for (let k = 0; k < 2; k++) if (R(k + 6) < 0.7) {
          const x = Math.floor(R(k + 8) * 7) * cs, y = Math.floor(R(k + 10) * 7) * cs;
          g.fillStyle = shade(th.mud2, 1.15); g.fillRect(x, y - cs * 0.4, cs, cs * 0.4);
          g.fillStyle = th.hole; g.fillRect(x, y, cs, cs * 0.8);
        }
      } else {
        const n = 4 + Math.floor(R(12) * 2);
        for (let k = 0; k < n; k++) {
          const [c1, c2] = th.tuft[Math.min(th.tuft.length - 1, Math.floor(R(k + 20) * th.tuft.length * 0.999))];
          const x = Math.floor(R(k + 30) * 7) * cs, y = Math.floor(R(k + 40) * 5 + 2) * cs, hh = 1 + Math.floor(R(k + 50) * 2.5);
          for (let j = 0; j < hh; j++) cube(g, x + ((j + k) % 2 ? cs * 0.25 : 0), y - j * cs * 0.9, cs * 0.9, j === hh - 1 ? c2 : c1, 0.9);
        }
      }
    } else if (type === TL.CONCRETE) {
      cellTex(g, S, th.concrete, th.seam, seed, 0.03);
      g.fillStyle = th.seam;
      g.fillRect(0, 0, S, Math.max(1, cs * 0.35)); g.fillRect(0, 0, Math.max(1, cs * 0.35), S);
      g.fillStyle = shade(th.seam, 0.8);
      let x = R(1) * S, y = R(2) * S;
      for (let k = 0; k < 6; k++) { g.fillRect(x, y, cs * 0.5, cs * 0.5); x += (R(k + 3) - 0.3) * cs * 1.4; y += (R(k + 9) - 0.5) * cs * 1.4; }
    }
    return c;
  }
  function setTheme(key, bs) {
    if (TILES.theme === key && TILES.bs === bs) return;
    const th = THEMES[key] || THEMES.tidal;
    const S = Math.max(8, Math.round(GS.CONFIG.T * bs));
    TILES.theme = key; TILES.bs = bs; TILES.th = th; TILES.S = S;
    TILES.set = {};
    for (const type of [TL.SEA, TL.CREEK, TL.DIRTY, TL.MUD, TL.MARSH, TL.POOL, TL.CONCRETE]) {
      const anim = type === TL.SEA || type === TL.CREEK || type === TL.POOL;
      const arr = [];
      for (let vi = 0; vi < 6; vi++) {
        const frames = [];
        for (let fr = 0; fr < (anim ? 3 : 1); fr++) frames.push(bakeTile(th, type, vi, fr, S));
        arr.push(frames);
      }
      TILES.set[type] = arr;
    }
  }
  function tile(type, vi, fr) { const a = TILES.set[type]; if (!a) return null; const f = a[vi % a.length]; return f[(fr || 0) % f.length]; }

  // ── 빛 번짐 ───────────────────────────────────────────
  const GLOW = {};
  function glow(col) {
    if (GLOW[col]) return GLOW[col];
    const c = mk(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col); gr.addColorStop(0.35, col.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    GLOW[col] = c;
    return c;
  }

  GS.art = { bakeAll, spr, icon, silhouette, setTheme, tile, glow, shade, mix, THEMES, TILES, get BS() { return BS; }, MODELS: M };
})(typeof window !== 'undefined' ? window : globalThis);

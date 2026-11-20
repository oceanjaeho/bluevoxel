// 갯벌 수호대 — 공용 도구 (브라우저·노드 테스트 공용)
(function (root) {
  'use strict';
  const GS = root.GS = root.GS || {};
  GS.VERSION = '0.3.0';

  function rng(seed) {
    let a = seed >>> 0;
    const f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return f;
  }

  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rnd: (r, a, b) => a + r() * (b - a),
    rint: (r, a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (r, arr) => arr[Math.floor(r() * arr.length)],
    d2: (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
    hash2(x, y, s) {
      let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    },
    outCubic: t => 1 - Math.pow(1 - t, 3),
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); },
    fmtNum: n => Math.round(n).toLocaleString('ko-KR'),
    // 가중치 뽑기: items 배열, w(item) → 가중치
    weighted(r, items, w) {
      let sum = 0;
      for (const it of items) sum += Math.max(0, w(it));
      if (sum <= 0) return null;
      let x = r() * sum;
      for (const it of items) { x -= Math.max(0, w(it)); if (x <= 0) return it; }
      return items[items.length - 1];
    },
    // 받침 있는 말 뒤 조사
    josa(word, a, b) {
      const c = word.charCodeAt(word.length - 1);
      if (c < 0xac00 || c > 0xd7a3) return word + b;
      return word + (((c - 0xac00) % 28) ? a : b);
    },
  };

  // 경계가 있는 월드용 공간 격자
  function Grid(worldW, worldH, cell) {
    this.cell = cell;
    this.cols = Math.ceil(worldW / cell) + 2;
    this.rows = Math.ceil(worldH / cell) + 2;
    this.b = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.b.push([]);
    this.used = [];
  }
  Grid.prototype.clear = function () {
    for (let i = 0; i < this.used.length; i++) this.b[this.used[i]].length = 0;
    this.used.length = 0;
  };
  Grid.prototype.cx = function (x) { return U.clamp(Math.floor(x / this.cell) + 1, 0, this.cols - 1); };
  Grid.prototype.cy = function (y) { return U.clamp(Math.floor(y / this.cell) + 1, 0, this.rows - 1); };
  Grid.prototype.insert = function (e) {
    const i = this.cy(e.y) * this.cols + this.cx(e.x);
    const b = this.b[i];
    if (!b.length) this.used.push(i);
    b.push(e);
  };
  // 반경 r 안에 있을 수 있는 후보를 out에 담아요 (정확한 거리 판정은 호출한 쪽에서)
  Grid.prototype.query = function (x, y, r, out) {
    out.length = 0;
    const x0 = this.cx(x - r), x1 = this.cx(x + r), y0 = this.cy(y - r), y1 = this.cy(y + r);
    for (let gy = y0; gy <= y1; gy++) {
      const row = gy * this.cols;
      for (let gx = x0; gx <= x1; gx++) {
        const b = this.b[row + gx];
        for (let k = 0; k < b.length; k++) out.push(b[k]);
      }
    }
    return out;
  };

  GS.rng = rng;
  GS.hashStr = hashStr;
  GS.U = U;
  GS.Grid = Grid;
})(typeof window !== 'undefined' ? window : globalThis);

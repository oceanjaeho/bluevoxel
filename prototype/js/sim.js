/*
 * 블루복셀 — 시뮬레이션 (DOM 없음, Node 테스트 가능)
 * 상태(state)는 순수 JSON 이라 그대로 저장·복원할 수 있어요.
 */
(function (BV) {
  'use strict';

  var C = BV.CONFIG;
  var MW = 16;
  var MH = 16;

  var RATE = { mudflat: 1.0, upper: 1.0, marsh: 3.3, seagrass: 1.6 }; // tCO2/ha/년 (다 자란 상태)
  var STAGE_MULT = [0, 0.35, 0.7, 1];
  var STAGE_NAME = ['', '새싹', '자라는 중', '무성함'];
  var LANDISH = {
    land: 1, farm: 1, village: 1, port: 1, wall: 1, gate: 1, industry: 1, resort: 1,
    field: 1, pond: 1, solar: 1, forest: 1, hill: 1
  };
  var DEV = { industry: 1, resort: 1 };
  var WALLS = { wall: 1, gate: 1 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ---------- 난수 ---------- */
  function hashStr(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rand(s) {
    var t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function noise(x, y, k) {
    var h = (Math.imul(x + 11, 374761393) + Math.imul(y + 7, 668265263) + Math.imul(k + 3, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand(s) * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function normalizeCode(code) {
    var c = String(code || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '').slice(0, 12);
    return c || C.DEFAULT_CODE;
  }

  /* ---------- 타일 ---------- */
  function at(s, x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return null;
    return s.tiles[y * MW + x];
  }
  function n4(s, t) {
    var out = [];
    var a = at(s, t.x - 1, t.y); if (a) out.push(a);
    a = at(s, t.x + 1, t.y); if (a) out.push(a);
    a = at(s, t.x, t.y - 1); if (a) out.push(a);
    a = at(s, t.x, t.y + 1); if (a) out.push(a);
    return out;
  }
  function touches(s, t, set) {
    var ns = n4(s, t);
    for (var i = 0; i < ns.length; i++) if (set[ns[i].type]) return true;
    return false;
  }
  function touchesSea(s, t) { return touches(s, t, BV.TIDAL); }
  function touchesLand(s, t) { return touches(s, t, LANDISH); }
  function touchesWalk(s, t) {
    var ns = n4(s, t);
    for (var i = 0; i < ns.length; i++) if (ns[i].walk) return true;
    return false;
  }
  function isTidal(t) { return !!BV.TIDAL[t.type]; }
  function isEco(t) { return !!BV.ECO[t.type]; }

  function makeTile(x, y, type) {
    var t = {
      x: x, y: y, type: type, h: BV.TILES[type].h, stage: 0, health: 0, carbon: 0,
      emit: 0, debris: 0, walk: 0, restoring: 0, active: 0
    };
    var n = noise(x, y, 1);
    switch (type) {
      case 'mudflat': t.health = 60 + Math.round(n * 24); t.carbon = 170 + Math.round(n * 40); break;
      case 'upper': t.health = 58 + Math.round(n * 22); t.carbon = 160 + Math.round(n * 40); break;
      case 'marsh': t.stage = n > 0.5 ? 3 : 2; t.health = 68 + Math.round(n * 20); t.carbon = 820 + Math.round(n * 180); break;
      case 'seagrass': t.stage = 2; t.health = 60 + Math.round(n * 8); t.carbon = 360 + Math.round(n * 60); break;
      case 'field': t.carbon = 55 + Math.round(n * 20); break;
      case 'pond': t.carbon = 70 + Math.round(n * 20); break;
      default: break;
    }
    return t;
  }

  // 마을·포구 둘레 2칸: 태풍 완충 구역
  var BUFFER = (function () {
    var homes = [];
    var y, x;
    for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) {
      var ch = BV.MAP[y][x];
      if (ch === 'V' || ch === 'P') homes.push([x, y]);
    }
    var out = [];
    for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) {
      var c2 = BV.MAP[y][x];
      if (c2 === 'V' || c2 === 'P') continue;
      for (var k = 0; k < homes.length; k++) {
        if (Math.max(Math.abs(homes[k][0] - x), Math.abs(homes[k][1] - y)) <= 2) { out.push(y * MW + x); break; }
      }
    }
    return out;
  })();

  /* ---------- 새 게임 ---------- */
  function diffOf(s) { return BV.DIFFICULTY[s.diff] || BV.DIFFICULTY.normal; }

  function newGame(code, diff) {
    code = normalizeCode(code);
    diff = BV.DIFFICULTY[diff] ? diff : 'normal';
    var s = {
      v: 1, code: code, diff: diff, rng: hashStr(code) || 1, year: C.START_YEAR,
      budget: BV.DIFFICULTY[diff].budget, support: C.START_SUPPORT, wq: C.START_WQ,
      missions: { active: BV.MISSIONS.slice(0, 3).map(function (d) { return d.id; }), done: [] },
      cuts: {}, policies: {}, flags: {}, history: [], decisions: [], seen: {}, present: [],
      tiles: [], card: 'start', pendingTyphoon: 0, heat: false,
      randomOrder: [], randomIdx: 0,
      cum: { absorb: 0, effAbsorb: 0, emitLand: 0, emitVillage: 0 },
      stats: { developed: 0, actions: {} }, ended: false, lastReport: null
    };
    for (var y = 0; y < MH; y++) {
      for (var x = 0; x < MW; x++) s.tiles.push(makeTile(x, y, BV.LEGEND[BV.MAP[y][x]]));
    }
    placeDebris(s, C.START_DEBRIS);
    s.randomOrder = shuffle(s, BV.RANDOM_POOL.slice());
    var st = speciesStatus(s);
    for (var i = 0; i < st.length; i++) {
      if (st[i].present) { s.present.push(st[i].id); s.seen[st[i].id] = C.START_YEAR; }
    }
    var m = metrics(s);
    s.baseline = { eco: m.ecoArea, absorb: r1(m.absorbRate), species: s.present.length, flats: m.flats, marsh: m.marsh, seagrass: m.seagrass };
    return s;
  }

  function placeDebris(s, n) {
    var cands = [];
    for (var i = 0; i < s.tiles.length; i++) {
      var t = s.tiles[i];
      if (!t.debris && (t.type === 'mudflat' || t.type === 'upper' || t.type === 'marsh')) cands.push(i);
    }
    var placed = [];
    for (var k = 0; k < n && cands.length; k++) {
      var j = Math.floor(rand(s) * cands.length);
      var idx = cands.splice(j, 1)[0];
      s.tiles[idx].debris = 1;
      placed.push(idx);
    }
    return placed;
  }

  /* ---------- 지표 ---------- */
  function absorbRate(t) {
    switch (t.type) {
      case 'mudflat':
      case 'upper':
        return RATE[t.type] * t.health / 100 * (t.restoring ? 0.6 : 1);
      case 'marsh':
      case 'seagrass':
        return RATE[t.type] * STAGE_MULT[t.stage] * t.health / 100;
      default:
        return 0;
    }
  }
  function nextEmit(t) { return t.emit > 2 ? t.emit * 0.3 : t.emit; }

  function emissionFactor(s) {
    var f = 1;
    for (var k in s.cuts) if (Object.prototype.hasOwnProperty.call(s.cuts, k)) f *= 1 - s.cuts[k];
    return f;
  }
  function villageEmission(s) {
    var yrs = clamp(s.year, C.START_YEAR, C.END_YEAR) - C.START_YEAR;
    return diffOf(s).emission * Math.pow(1 - C.GRID_DECARB, yrs) * emissionFactor(s);
  }

  function metrics(s) {
    var m = {
      flats: 0, flatHealth: 0, marsh: 0, marshEff: 0, seagrass: 0, seagrassMature: 0, seagrassEff: 0,
      debris: 0, dev: 0, industry: 0, resort: 0, fields: 0, farms: 0, ponds: 0, activePonds: 0,
      solar: 0, walls: 0, walks: 0, ecoArea: 0, ecoHealthy: 0, stock: 0, ecoStock: 0, absorbRate: 0, emitNext: 0, upper: 0
    };
    for (var i = 0; i < s.tiles.length; i++) {
      var t = s.tiles[i];
      if (t.debris) m.debris++;
      if (t.walk) m.walks++;
      m.stock += t.carbon;
      if (BV.ECO[t.type]) m.ecoStock += t.carbon;
      m.emitNext += nextEmit(t);
      m.absorbRate += absorbRate(t);
      switch (t.type) {
        case 'mudflat':
        case 'upper':
          m.ecoArea++;
          if (t.health >= 50) { m.flats++; m.ecoHealthy++; }
          m.flatHealth += t.health / 100;
          if (t.type === 'upper') m.upper++;
          break;
        case 'marsh':
          m.ecoArea++;
          if (t.health >= 50) { m.marsh++; m.ecoHealthy++; }
          m.marshEff += t.stage / 3 * t.health / 100;
          break;
        case 'seagrass':
          m.ecoArea++;
          if (t.health >= 50) { m.seagrass++; m.ecoHealthy++; if (t.stage >= 3) m.seagrassMature++; }
          m.seagrassEff += t.stage / 3 * t.health / 100;
          break;
        case 'field': m.fields++; break;
        case 'farm': m.farms++; break;
        case 'pond': if (t.active) m.activePonds++; else m.ponds++; break;
        case 'solar': m.solar++; break;
        case 'industry': m.industry++; m.dev++; break;
        case 'resort': m.resort++; m.dev++; break;
        case 'wall': case 'gate': m.walls++; break;
        default: break;
      }
    }
    m.emitVillage = villageEmission(s);
    m.effAbsorb = m.absorbRate * (s.policies.fund === 'credit' ? 0.5 : 1);
    m.neutrality = m.effAbsorb / Math.max(1, m.emitVillage + m.emitNext);
    return m;
  }

  function wqTarget(s, m) {
    var farmF = s.policies.ecoFarm ? 0.5 : 1;
    var v = 66
      - 0.35 * m.fields * farmF
      - 0.25 * m.farms * farmF
      - 0.9 * m.ponds
      - 1.4 * m.activePonds
      - 2.0 * m.industry
      - 0.35 * m.debris
      + (s.policies.sewage ? 8 : -4)
      + Math.min(18, 0.8 * m.marshEff)
      + Math.min(8, 0.4 * m.seagrassEff);
    return clamp(v, 0, 100);
  }

  function healthCap(s, t) {
    var cap = 100;
    if (t.debris) cap -= 35;
    if (touches(s, t, DEV)) cap -= 15;
    if (t.type === 'seagrass') cap -= Math.max(0, 62 - s.wq) * 2.2;
    else if (s.wq < 35) cap -= 10;
    if (t.type === 'marsh' && s.policies.slr === 'wall' && touches(s, t, WALLS)) cap -= 30;
    return clamp(cap, 5, 100);
  }

  /* ---------- 도구 ---------- */
  var TOOL = {};
  BV.TOOLS.forEach(function (tl) { TOOL[tl.id] = tl; });

  function toolCost(s, id, t) {
    var c = TOOL[id] ? TOOL[id].cost : 0;
    if (id === 'seagrass' && s.flags.seagrassTech) c = 2;
    if (id === 'restore' && t && t.type === 'pond' && s.policies.pond === 'restore') c = 2;
    if (id === 'cleanup' && s.policies.school) c = 0;
    if (c > 0 && s.support < 30) c += 1;
    return c;
  }

  function rule(s, id, t) {
    switch (id) {
      case 'inspect':
        return null;
      case 'marsh':
        if (t.type === 'marsh') return '이미 염습지예요.';
        if (t.type === 'mudflat') return '여기는 밀물마다 잠기는 낮은 갯벌이에요. 염생식물은 큰 밀물 때만 잠기는 상부 갯벌에서 자라요.';
        if (t.type !== 'upper') return '염생식물은 상부 갯벌에만 심을 수 있어요.';
        if (t.debris) return '먼저 쓰레기를 치워야 해요.';
        return null;
      case 'seagrass':
        if (t.type === 'seagrass') return '이미 잘피밭이에요.';
        if (t.type === 'sea') return '너무 깊어서 햇빛이 바닥까지 닿지 않아요. 얕은 바다에 심어야 해요.';
        if (t.type === 'creek') return '갯골은 물살이 세서 잘피가 버티기 어려워요.';
        if (t.type !== 'shallow') return '잘피는 얕은 바다에만 심을 수 있어요.';
        return null;
      case 'cleanup':
        return t.debris ? null : '이 칸에는 치울 쓰레기가 없어요.';
      case 'restore':
        if (t.type === 'pond' && t.active) return '지금 운영 중인 양식장이에요.';
        if (t.type !== 'pond' && t.type !== 'field') return '갯벌 복원은 폐양식장과 간척 농지에만 할 수 있어요.';
        if (!touchesSea(s, t)) return '바닷물이 닿지 않아요. 제방을 먼저 열거나, 바닷물과 맞닿은 칸부터 복원하세요.';
        return null;
      case 'openwall':
        if (t.type !== 'wall' && t.type !== 'gate') return '제방에만 쓸 수 있어요.';
        if (!touchesSea(s, t)) return '바다와 맞닿은 제방만 열 수 있어요.';
        return null;
      case 'boardwalk':
        if (!(t.type === 'mudflat' || t.type === 'upper' || t.type === 'marsh')) return '탐방로는 갯벌·상부 갯벌·염습지 위에만 놓을 수 있어요.';
        if (t.walk) return '이미 탐방로가 있어요.';
        if (!touchesLand(s, t) && !touchesWalk(s, t)) return '육지나 다른 탐방로와 이어져야 해요.';
        return null;
      case 'develop':
        if (s.policies.protect === 'mpa') return '해양보호구역이라 메울 수 없어요.';
        if (!(t.type === 'mudflat' || t.type === 'upper' || t.type === 'marsh')) return '갯벌·상부 갯벌·염습지만 메울 수 있어요.';
        if (!touchesLand(s, t)) return '육지와 맞닿은 칸만 메울 수 있어요.';
        return null;
      default:
        return '알 수 없는 도구예요.';
    }
  }

  function check(s, id, i) {
    var t = s.tiles[i];
    if (!t || s.ended) return { ok: false, reason: '' };
    var cost = toolCost(s, id, t);
    var why = rule(s, id, t);
    if (why) return { ok: false, reason: why, cost: cost };
    if (cost > 0 && s.budget < cost - 1e-9) {
      return { ok: false, reason: '예산이 부족해요. ' + cost + '억 원이 필요해요.', cost: cost, money: true };
    }
    return { ok: true, cost: cost };
  }

  function eligible(s, id) {
    var out = [];
    if (id === 'inspect') return out;
    for (var i = 0; i < s.tiles.length; i++) {
      var t = s.tiles[i];
      if (!rule(s, id, t)) out.push(i);
    }
    return out;
  }

  function convertToDev(t, type) {
    t.emit += t.carbon * 0.5;
    t.carbon = t.carbon * 0.5;
    t.type = type;
    t.h = BV.TILES[type].h;
    t.stage = 0; t.health = 0; t.debris = 0; t.walk = 0; t.restoring = 0; t.active = 0;
  }

  function apply(s, id, i) {
    var c = check(s, id, i);
    if (!c.ok) return c;
    var t = s.tiles[i];
    var msg = '';
    switch (id) {
      case 'inspect':
        return { ok: true, inspect: true };
      case 'marsh':
        t.type = 'marsh'; t.stage = 1; t.health = Math.max(50, Math.min(70, t.health)); t.restoring = 0;
        msg = '염생식물을 심었어요. 몇 해가 지나면 무성한 염습지가 돼요.';
        break;
      case 'seagrass':
        t.type = 'seagrass'; t.stage = 1; t.health = 55;
        msg = s.wq < 50
          ? '잘피를 심었어요. 그런데 물이 탁해서(수질 ' + Math.round(s.wq) + ') 잘 자라지 못할 수 있어요.'
          : '잘피를 심었어요. 물이 맑으면 잘 자라요.';
        break;
      case 'cleanup':
        t.debris = 0;
        msg = '쓰레기를 치웠어요.';
        break;
      case 'restore':
        t.type = 'upper'; t.h = 3; t.health = 35; t.restoring = 1; t.active = 0;
        msg = '물길을 텄어요. 바닷물이 드나들며 몇 해에 걸쳐 갯벌로 돌아와요.';
        break;
      case 'openwall':
        t.type = 'upper'; t.h = 3; t.health = 30; t.restoring = 1; t.carbon = Math.max(t.carbon, 20);
        api.support(s, -1);
        msg = '제방을 열었어요. 이제 뒤쪽 간척지에도 바닷물이 닿아요.';
        break;
      case 'boardwalk':
        t.walk = 1;
        msg = '탐방로를 놓았어요. 생태관광 수입이 늘어요.';
        break;
      case 'develop':
        convertToDev(t, 'industry');
        s.stats.developed++;
        api.support(s, 2);
        msg = '갯벌을 메웠어요. 돈이 생겼지만 진흙 속 탄소가 빠져나가기 시작해요.';
        break;
      default:
        return { ok: false, reason: '알 수 없는 도구예요.' };
    }
    if (c.cost) s.budget = r1(s.budget - c.cost);
    s.stats.actions[id] = (s.stats.actions[id] || 0) + 1;
    return { ok: true, msg: msg, cost: c.cost, tool: id, index: i, missions: checkMissions(s) };
  }

  /* ---------- 카드가 쓰는 도우미 ---------- */
  var api = {
    budget: function (s, n) { s.budget = r1(s.budget + n); },
    support: function (s, n) { s.support = clamp(Math.round(s.support + n), 0, 100); },
    clearDebris: function (s, n) {
      var list = [];
      for (var i = 0; i < s.tiles.length; i++) if (s.tiles[i].debris) list.push(i);
      for (var k = 0; k < n && list.length; k++) {
        var j = Math.floor(rand(s) * list.length);
        s.tiles[list.splice(j, 1)[0]].debris = 0;
      }
    },
    spawnDebris: function (s, n) { placeDebris(s, n); },
    convertAll: function (s, from, to) {
      s.tiles.forEach(function (t) {
        if (t.type === from) { t.type = to; t.h = BV.TILES[to].h; t.active = 0; }
      });
    },
    activatePonds: function (s) {
      s.tiles.forEach(function (t) { if (t.type === 'pond') t.active = 1; });
    },
    developZone: function (s, zone, type) {
      var n = 0;
      BV.ZONES[zone].forEach(function (p) {
        var t = at(s, p[0], p[1]);
        if (t && !DEV[t.type]) { convertToDev(t, type); n++; }
      });
      s.stats.developed += n;
    },
    cut: function (s, key, frac) { s.cuts[key] = frac; },
    retreat: function (s) {
      s.tiles.forEach(function (t) {
        if (WALLS[t.type]) { t.type = 'upper'; t.h = 3; t.health = 30; t.restoring = 1; t.carbon = Math.max(t.carbon, 20); }
      });
      for (var pass = 0; pass < 2; pass++) {
        var list = s.tiles.filter(function (t) {
          return (t.type === 'field' || (t.type === 'pond' && !t.active)) && touchesSea(s, t);
        });
        list.forEach(function (t) { t.type = 'upper'; t.h = 3; t.health = 35; t.restoring = 1; });
      }
    },
    redTide: function (s) {
      var m = metrics(s);
      s.wq = Math.max(0, r1(s.wq - (m.marsh >= 10 ? 4 : 8)));
    }
  };

  /* ---------- 카드 ---------- */
  function pickCard(s) {
    var id = BV.SCHEDULE[s.year];
    if (!id) {
      id = s.randomOrder[s.randomIdx % s.randomOrder.length];
      s.randomIdx++;
    }
    return id;
  }

  function currentCard(s) {
    var c = BV.CARDS[s.card];
    if (!c) return null;
    if (c.blockedBy && s.policies.protect === c.blockedBy) {
      return { id: s.card, kind: 'news', title: c.title, lead: c.blockedLead, blocked: true,
        options: [{ label: '확인', effect: '' }] };
    }
    var out = { id: s.card };
    for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k];
    return out;
  }

  function choose(s, idx) {
    var card = currentCard(s);
    if (!card) return null;
    var opt = card.options[idx] || card.options[0];
    if (!card.blocked) {
      if (card.typhoon) s.pendingTyphoon = card.typhoon;
      if (card.heat) s.heat = true;
      if (opt.apply) opt.apply(s, api);
    }
    s.decisions.push({ year: s.year, card: card.id, title: card.title, choice: opt.label, opt: card.blocked ? -1 : card.options.indexOf(opt), council: card.options.length > 1 && !card.blocked });
    s.card = null;
    return opt;
  }

  /* ---------- 생물 ---------- */
  function speciesStatus(s, m) {
    m = m || metrics(s);
    var islandOk = m.resort === 0;
    var protect = !!s.policies.protect;
    return BV.SPECIES.map(function (sp) {
      var needs = sp.need.map(function (n) {
        var key = n[0];
        var v = n[1];
        var have = 0;
        var ok = false;
        switch (key) {
          case 'flats': have = m.flats; ok = have >= v; break;
          case 'marsh': have = m.marsh; ok = have >= v; break;
          case 'seagrass': have = m.seagrass; ok = have >= v; break;
          case 'seagrassMature': have = m.seagrassMature; ok = have >= v; break;
          case 'wq': have = Math.round(s.wq); ok = s.wq >= v; break;
          case 'debrisMax': have = m.debris; ok = have <= v; break;
          case 'devMax': have = m.dev; ok = have <= v; break;
          case 'protect': have = protect ? 1 : 0; ok = protect; break;
          case 'island': have = islandOk ? 1 : 0; ok = islandOk; break;
          default: break;
        }
        return { key: key, need: v, have: have, ok: ok };
      });
      return { id: sp.id, present: needs.every(function (q) { return q.ok; }), needs: needs };
    });
  }

  /* ---------- 태풍 ---------- */
  function typhoon(s, S, m) {
    var base = (3 + 3 * S) * diffOf(s).typhoon;
    var P = 0;
    BUFFER.forEach(function (i) {
      var t = s.tiles[i];
      if (t.type === 'marsh') P += 1.2 * t.stage / 3 * t.health / 100;
      else if (t.type === 'mudflat' || t.type === 'upper') P += 0.3 * t.health / 100;
      else if (t.type === 'seagrass') P += 0.2 * t.stage / 3;
    });
    var red = Math.min(0.8, P / 12);
    if (s.policies.slr === 'wall') red = Math.min(0.9, red + 0.3);
    var exposed = 0.5 * m.dev;
    var damage = r1(base * (1 - red) + exposed);
    var noBuffer = r1(base + exposed);
    return { strength: S, base: r1(base), protection: r1(P), reduction: Math.round(red * 100), damage: damage, noBuffer: noBuffer };
  }

  /* ---------- 경제 ---------- */
  function income(s, m, rep) {
    var wqF = 0.6 + 0.8 * s.wq / 100;
    var fishery = (0.06 * m.flatHealth + 0.10 * m.seagrassEff + 0.03 * m.marsh) * wqF;
    if (s.policies.protect === 'mpa') fishery *= 0.85;
    else if (s.policies.protect === 'community') fishery *= 1.1;
    if (s.flags.harvestYear && s.wq >= 55) fishery *= 1.3;
    var aqua = 0.15 * m.activePonds;
    var farm = (0.08 * m.fields + 0.1 * m.farms) * (s.policies.ecoFarm ? 0.9 : 1);
    var n = s.present.length;
    var tourism = 0.1 * n + m.walks * (0.15 + 0.03 * n);
    if (s.policies.protect === 'mpa') tourism += 1;
    if (s.policies.center) tourism += 0.5 + 0.05 * n;
    if (s.flags.migrationYear && s.present.indexOf('godwit') >= 0) tourism += 1;
    var dev = 0.4 * m.industry + 1.0 * m.resort;
    var energy = 0.1 * m.solar + (s.cuts.rooftop ? 0.5 : 0);
    var pes = s.policies.fund === 'pes' ? 0.03 * m.ecoHealthy : 0;
    var base = 3;
    var upkeep = 0.05 * m.walls;
    var damage = rep && rep.typhoon ? rep.typhoon.damage : 0;
    var gross = (base + fishery + aqua + farm + tourism + dev + energy + pes) * diffOf(s).income;
    var net = gross - upkeep - damage;
    return {
      base: base, fishery: r1(fishery), aqua: r1(aqua), farm: r1(farm), tourism: r1(tourism),
      dev: r1(dev), energy: r1(energy), pes: r1(pes), upkeep: r1(upkeep), damage: r1(damage), net: r1(net)
    };
  }

  /* ---------- 한 해 마무리 ---------- */
  function endYear(s) {
    if (s.ended) return null;
    var year = s.year;
    var rep = {
      year: year, absorb: 0, effAbsorb: 0, emitLand: 0, emitVillage: 0, discoveries: [], lost: [],
      spread: 0, matured: 0, died: 0, typhoon: null, heat: null, newDebris: [], absorbByTile: []
    };

    if (s.heat) {
      var hit = s.wq >= 65 ? 10 : 25;
      var cnt = 0;
      s.tiles.forEach(function (t) { if (t.type === 'seagrass') { t.health = Math.max(0, t.health - hit); cnt++; } });
      rep.heat = { hit: hit, count: cnt };
      s.heat = false;
    }

    var wq0 = s.wq;
    var target = wqTarget(s, metrics(s));
    s.wq = r1(clamp(s.wq + (target - s.wq) * 0.5, 0, 100));
    rep.wq = { before: wq0, after: s.wq, target: r1(target) };

    var births = [];
    for (var i = 0; i < s.tiles.length; i++) {
      var t = s.tiles[i];
      if (!isEco(t)) continue;
      var cap = healthCap(s, t);
      var d = cap - t.health;
      if (d > 0) t.health = Math.min(cap, t.health + (t.restoring ? 10 : 8));
      else t.health = Math.max(cap, t.health - 20);
      if (t.restoring) { t.restoring++; if (t.restoring > 3) t.restoring = 0; }
      if (t.type === 'marsh') {
        if (t.health < 15) { t.type = 'upper'; t.stage = 0; rep.died++; continue; }
        if (t.stage < 3 && t.health >= 50 && rand(s) < 0.6) { t.stage++; if (t.stage === 3) rep.matured++; }
        if (t.stage === 3 && t.health >= 60) {
          n4(s, t).forEach(function (nb) {
            if (nb.type === 'upper' && !nb.debris && rand(s) < 0.18) births.push([nb, 'marsh']);
          });
        }
      } else if (t.type === 'seagrass') {
        if (t.health < 15) {
          t.emit += t.carbon * 0.3; t.carbon *= 0.7;
          t.type = 'shallow'; t.stage = 0; t.health = 0; rep.died++; continue;
        }
        if (t.stage < 3 && t.health >= 55 && s.wq >= 50 && rand(s) < 0.5) { t.stage++; if (t.stage === 3) rep.matured++; }
        if (t.stage === 3 && t.health >= 60 && s.wq >= 60) {
          n4(s, t).forEach(function (nb) {
            if (nb.type === 'shallow' && rand(s) < 0.12) births.push([nb, 'seagrass']);
          });
        }
      }
    }
    births.forEach(function (b) {
      var nb = b[0];
      if (b[1] === 'marsh' && nb.type === 'upper') {
        nb.type = 'marsh'; nb.stage = 1; nb.health = Math.max(50, nb.health); nb.restoring = 0; rep.spread++;
      } else if (b[1] === 'seagrass' && nb.type === 'shallow') {
        nb.type = 'seagrass'; nb.stage = 1; nb.health = 55; rep.spread++;
      }
    });

    for (var j = 0; j < s.tiles.length; j++) {
      var tt = s.tiles[j];
      var a = absorbRate(tt);
      if (a > 0) { tt.carbon += a; rep.absorb += a; rep.absorbByTile.push([j, r1(a)]); }
      if (tt.emit > 0) { var e = nextEmit(tt); tt.emit -= e; if (tt.emit < 0.01) tt.emit = 0; rep.emitLand += e; }
    }
    rep.emitVillage = villageEmission(s);
    rep.effAbsorb = rep.absorb * (s.policies.fund === 'credit' ? 0.5 : 1);

    var mNow = metrics(s);
    if (s.pendingTyphoon) {
      rep.typhoon = typhoon(s, s.pendingTyphoon, mNow);
      s.pendingTyphoon = 0;
    }

    var nd = 2 + diffOf(s).debris - (s.policies.ecoBuoy ? 1 : 0) - (s.policies.cleanupDay ? 1 : 0) + (rep.typhoon ? 3 : 0);
    nd = Math.min(nd, 24 - mNow.debris);
    if (nd > 0) rep.newDebris = placeDebris(s, nd);

    var before = s.present.slice();
    var m = metrics(s);
    var st = speciesStatus(s, m);
    s.present = st.filter(function (x) { return x.present; }).map(function (x) { return x.id; });
    st.forEach(function (sp) {
      if (sp.present && !s.seen[sp.id]) { s.seen[sp.id] = year; rep.discoveries.push(sp.id); }
    });
    before.forEach(function (id) { if (s.present.indexOf(id) < 0) rep.lost.push(id); });
    rep.returned = s.present.filter(function (id) { return before.indexOf(id) < 0 && rep.discoveries.indexOf(id) < 0; });

    var inc = income(s, m, rep);
    rep.income = inc;
    s.budget = r1(s.budget + inc.net);
    rep.missions = checkMissions(s, m);

    var ds = rep.discoveries.length + rep.returned.length - rep.lost.length;
    if (m.debris > 12) ds -= 1;
    if (rep.typhoon) ds -= Math.round(rep.typhoon.damage);
    if (s.budget < 0) ds -= 3;
    if (s.support > 70) ds -= 1;
    else if (s.support < 40) ds += 1;
    rep.supportDelta = ds;
    api.support(s, ds);

    s.cum.absorb += rep.absorb;
    s.cum.effAbsorb += rep.effAbsorb;
    s.cum.emitLand += rep.emitLand;
    s.cum.emitVillage += rep.emitVillage;
    s.history.push({
      year: year, absorb: r1(rep.absorb), effAbsorb: r1(rep.effAbsorb), emitLand: r1(rep.emitLand),
      emitVillage: r1(rep.emitVillage), budget: s.budget, support: s.support, wq: s.wq,
      species: s.present.length, eco: m.ecoArea, marsh: m.marsh, seagrass: m.seagrass, flats: m.flats,
      stock: Math.round(m.stock), income: inc.net
    });

    s.flags.harvestYear = false;
    s.flags.migrationYear = false;
    s.year++;
    if (s.year > C.END_YEAR) { s.ended = true; s.card = null; }
    else s.card = pickCard(s);
    rep.absorb = r1(rep.absorb);
    rep.effAbsorb = r1(rep.effAbsorb);
    rep.emitLand = r1(rep.emitLand);
    rep.emitVillage = r1(rep.emitVillage);
    s.lastReport = rep;
    return rep;
  }

  /* ---------- 칸 설명 ---------- */
  function describe(s, i) {
    var t = s.tiles[i];
    if (!t) return null;
    var def = BV.TILES[t.type];
    var d = {
      index: i, x: t.x, y: t.y, type: t.type, name: def.name, zone: def.zone, desc: def.desc,
      eco: isEco(t), tidal: isTidal(t), carbon: Math.round(t.carbon), emit: r1(t.emit), emitNext: r1(nextEmit(t)),
      absorb: r1(absorbRate(t)), health: Math.round(t.health), stage: t.stage, stageName: STAGE_NAME[t.stage] || '',
      restoring: t.restoring, debris: !!t.debris, walk: !!t.walk, active: !!t.active, height: t.h
    };
    if (t.type === 'pond' && t.active) { d.name = '새우 양식장'; d.desc = '다시 운영하는 새우 양식장이에요. 소득이 생기지만 사료와 배설물이 바다로 흘러가요.'; }
    if (t.type === 'upper' && t.restoring) d.name = '복원 중인 갯벌';
    d.actions = BV.TOOLS.filter(function (tl) { return tl.id !== 'inspect'; }).map(function (tl) {
      var c = check(s, tl.id, i);
      return { id: tl.id, name: tl.name, ok: c.ok, cost: c.cost, reason: c.reason, money: !!c.money };
    }).filter(function (a) { return a.ok || a.money; });
    return d;
  }

  /* ---------- 결과 ---------- */
  function evaluate(s) {
    var last = s.history[s.history.length - 1] || { effAbsorb: 0, emitVillage: 1, emitLand: 0 };
    var emit = last.emitVillage + last.emitLand;
    var neutrality = emit > 0 ? last.effAbsorb / emit : 0;
    var m = metrics(s);
    var species = s.present.length;
    var key;
    if (m.dev >= 6) key = 'grey';
    else if (species <= 4) key = 'neglect';
    else if (neutrality >= 1 && species >= 9) key = s.support >= 45 ? 'bluecarbon' : 'lonely';
    else if (s.support < 35) key = 'lonely';
    else if (species >= 8 && neutrality < 1) key = 'revived';
    else key = 'half';
    return {
      key: key, ending: BV.ENDINGS[key], neutrality: neutrality, species: species, dev: m.dev,
      eco: m.ecoArea, eco0: s.baseline.eco, marsh: m.marsh, marsh0: s.baseline.marsh,
      seagrass: m.seagrass, seagrass0: s.baseline.seagrass,
      stars: {
        carbon: neutrality >= 1 ? 3 : neutrality >= 0.6 ? 2 : neutrality >= 0.3 ? 1 : 0,
        life: species >= 11 ? 3 : species >= 8 ? 2 : species >= 5 ? 1 : 0,
        people: s.support >= 70 ? 3 : s.support >= 50 ? 2 : s.support >= 30 ? 1 : 0
      },
      cumNet: s.cum.effAbsorb - s.cum.emitLand, cum: s.cum, last: last, support: s.support, budget: s.budget
    };
  }

  function summaryText(s) {
    var ev = evaluate(s);
    var names = s.present.map(function (id) {
      for (var k = 0; k < BV.SPECIES.length; k++) if (BV.SPECIES[k].id === id) return BV.SPECIES[k].name;
      return id;
    });
    var lines = [
      '[블루복셀 갯벌마을 2050] 수업 코드 ' + s.code,
      '엔딩: ' + ev.ending.title,
      '2050년 흡수 ' + Math.round(ev.last.effAbsorb) + ' t / 배출 ' + Math.round(ev.last.emitVillage + ev.last.emitLand) + ' t → 탄소중립 ' + Math.round(ev.neutrality * 100) + '%',
      '25년 누적 순흡수(매립 배출 제외) ' + Math.round(ev.cumNet) + ' tCO₂',
      '갯벌·염습지·잘피밭 면적 ' + ev.eco0 + 'ha → ' + ev.eco + 'ha',
      '함께 사는 생물 ' + ev.species + '/' + BV.SPECIES.length + '종: ' + (names.join(', ') || '없음'),
      '주민 지지도 ' + s.support + ' · 남은 예산 ' + s.budget + '억 원',
      '주요 결정:'
    ];
    s.decisions.filter(function (dd) { return dd.council; }).forEach(function (dd) {
      lines.push('  ' + dd.year + ' ' + dd.title + ' → ' + dd.choice);
    });
    return lines.join('\n');
  }

  /* ---------- 미션 ---------- */
  var MISSION = {};
  BV.MISSIONS.forEach(function (d) { MISSION[d.id] = d; });

  function nextMission(s) {
    for (var k = 0; k < BV.MISSIONS.length; k++) {
      var id = BV.MISSIONS[k].id;
      if (s.missions.active.indexOf(id) < 0 && s.missions.done.indexOf(id) < 0) return id;
    }
    return null;
  }
  function checkMissions(s, m) {
    if (!s.missions) return [];
    m = m || metrics(s);
    var done = [];
    for (var guard = 0; guard < 20; guard++) {
      var hit = -1;
      for (var k = 0; k < s.missions.active.length; k++) {
        var def = MISSION[s.missions.active[k]];
        if (def && def.metric(s, m) >= def.goal) { hit = k; break; }
      }
      if (hit < 0) break;
      var d = MISSION[s.missions.active[hit]];
      if (d.reward[0] === 'budget') api.budget(s, d.reward[1]); else api.support(s, d.reward[1]);
      s.missions.done.push(d.id);
      done.push(d.id);
      var nx = nextMission(s);
      if (nx) s.missions.active[hit] = nx; else s.missions.active.splice(hit, 1);
    }
    return done;
  }
  function missionStatus(s) {
    if (!s.missions) return [];
    var m = metrics(s);
    return s.missions.active.map(function (id) {
      var d = MISSION[id];
      var v = d.metric(s, m);
      return { id: id, def: d, value: v, goal: d.goal, frac: Math.max(0, Math.min(1, v / d.goal)) };
    });
  }

  /* ---------- 업적 ---------- */
  function checkAchievements(s, ctx) {
    ctx = ctx || {};
    var m = metrics(s);
    var out = [];
    function add(id, ok) { if (ok) out.push(id); }
    add('a_first', (s.stats.actions.marsh || 0) >= 1);
    add('a_wall', m.walls === 0);
    add('a_clean', m.debris === 0);
    add('a_shield', !!(s.lastReport && s.lastReport.typhoon && s.lastReport.typhoon.reduction >= 70));
    add('a_spoonbill', s.present.indexOf('spoonbill') >= 0);
    add('a_porpoise', s.present.indexOf('porpoise') >= 0);
    add('a_codex', Object.keys(s.seen).length >= BV.SPECIES.length);
    add('a_support', s.support >= 80);
    if (s.ended) {
      var ev = evaluate(s);
      add('a_neutral', ev.neutrality >= 1);
      add('a_nodev', s.stats.developed === 0 && ev.dev === 0);
      add('a_hard', s.diff === 'hard' && ev.key === 'bluecarbon');
    }
    add('a_endings', (ctx.endingsSeen || 0) >= 3);
    return out;
  }

  /* ---------- 결과 코드 (교사용 학급 리포트) ---------- */
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var ENDING_KEYS = ['bluecarbon', 'revived', 'grey', 'neglect', 'lonely', 'half'];
  var DIFF_KEYS = ['easy', 'normal', 'hard'];
  var CODE_FIELDS = [['cls', 16], ['diff', 2], ['ending', 3], ['neutral', 9], ['species', 4], ['support', 7], ['eco', 8], ['dev', 6], ['net10', 14]]
    .concat(BV.COUNCIL_ORDER.map(function (id) { return ['c_' + id, 2]; }));

  function encodeResult(s) {
    var ev = evaluate(s);
    var vals = {
      cls: hashStr(s.code) & 0xffff,
      diff: Math.max(0, DIFF_KEYS.indexOf(s.diff || 'normal')),
      ending: ENDING_KEYS.indexOf(ev.key),
      neutral: clamp(Math.round(ev.neutrality * 100), 0, 511),
      species: clamp(ev.species, 0, 15),
      support: clamp(s.support, 0, 127),
      eco: clamp(ev.eco, 0, 255),
      dev: clamp(ev.dev, 0, 63),
      net10: clamp(Math.round(Math.max(0, ev.cumNet) / 10), 0, 16383)
    };
    BV.COUNCIL_ORDER.forEach(function (id) {
      var d = null;
      for (var k = 0; k < s.decisions.length; k++) if (s.decisions[k].card === id) d = s.decisions[k];
      vals['c_' + id] = d && d.opt >= 0 ? d.opt + 1 : 0;
    });
    var big = BigInt(0);
    var bits = 0;
    CODE_FIELDS.forEach(function (f) { big = (big << BigInt(f[1])) | BigInt(vals[f[0]]); bits += f[1]; });
    var chk = Number(big % BigInt(251));
    big = (big << BigInt(8)) | BigInt(chk);
    bits += 8;
    var out = '';
    for (var n = Math.ceil(bits / 5); n > 0; n--) { out = B32[Number(big & BigInt(31))] + out; big = big >> BigInt(5); }
    return 'BV1-' + out.match(/.{1,5}/g).join('-');
  }

  function decodeResult(str) {
    var m = /BV1-([0-9A-Z-]{20,40})/i.exec(String(str || ''));
    if (!m) return null;
    var body = m[1].toUpperCase().replace(/-/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    var big = BigInt(0);
    for (var k = 0; k < body.length; k++) {
      var v = B32.indexOf(body[k]);
      if (v < 0) return null;
      big = (big << BigInt(5)) | BigInt(v);
    }
    var chk = Number(big & BigInt(255));
    big = big >> BigInt(8);
    if (Number(big % BigInt(251)) !== chk) return null;
    var out = {};
    for (var f = CODE_FIELDS.length - 1; f >= 0; f--) {
      var w = CODE_FIELDS[f][1];
      out[CODE_FIELDS[f][0]] = Number(big & BigInt((1 << w) - 1));
      big = big >> BigInt(w);
    }
    var choices = {};
    BV.COUNCIL_ORDER.forEach(function (id) { choices[id] = out['c_' + id] - 1; });
    return {
      code: m[0].toUpperCase(), cls: out.cls, diff: DIFF_KEYS[out.diff] || 'normal', ending: ENDING_KEYS[out.ending] || 'half',
      neutrality: out.neutral / 100, species: out.species, support: out.support, eco: out.eco, dev: out.dev,
      cumNet: out.net10 * 10, choices: choices
    };
  }

  /* ---------- 자동 플레이 (타이틀 데모 · 예시 학급 데이터) ---------- */
  var STYLE_PREF = {
    eco: ['eco', 'energy', 'people', 'none', 'dev'],
    dev: ['dev', 'none', 'people', 'energy', 'eco'],
    idle: ['none', 'people', 'eco', 'energy', 'dev']
  };
  function autoChoose(s, style) {
    var card = currentCard(s);
    if (!card) return null;
    var idx = 0;
    if (card.options.length > 1 && !card.blocked) {
      if (style === 'mid') idx = Math.floor(Math.random() * card.options.length);
      else {
        var pref = STYLE_PREF[style] || STYLE_PREF.eco;
        var best = 99;
        card.options.forEach(function (o, k) {
          var r = pref.indexOf(o.tag || 'none');
          if (r >= 0 && r < best) { best = r; idx = k; }
        });
      }
    }
    return choose(s, idx);
  }
  function autoActions(s, style) {
    var done = [];
    function use(tool, filter, limit) {
      var n = 0;
      var list = eligible(s, tool);
      for (var k = 0; k < list.length && n < limit; k++) {
        var i = list[k];
        if (filter && !filter(s.tiles[i], i)) continue;
        var r = apply(s, tool, i);
        if (r.ok) { n++; done.push({ tool: tool, index: i, missions: r.missions }); } else if (r.money) break;
      }
    }
    var buf = {};
    BUFFER.forEach(function (i) { buf[i] = 1; });
    if (style === 'eco') {
      use('cleanup', null, 4);
      use('marsh', function (t, i) { return buf[i]; }, 3);
      use('openwall', null, 1);
      use('restore', null, 3);
      use('marsh', null, 2);
      if (s.wq >= 50) use('seagrass', null, 2);
      if ((s.stats.actions.boardwalk || 0) < 3) use('boardwalk', null, 1);
    } else if (style === 'mid') {
      use('cleanup', null, 2);
      use('marsh', null, 2);
      if (s.year % 2 === 0) use('openwall', null, 1);
      use('restore', null, 1);
      if (s.wq >= 52) use('seagrass', null, 1);
    } else if (style === 'dev') {
      use('develop', null, 2);
      use('cleanup', null, 1);
    }
    return done;
  }
  function autoGame(code, style, diff) {
    var s = newGame(code, diff);
    for (var guard = 0; guard < 40 && !s.ended; guard++) {
      if (s.card) autoChoose(s, style);
      autoActions(s, style);
      endYear(s);
    }
    return s;
  }

  BV.sim = {
    MW: MW, MH: MH, STAGE_NAME: STAGE_NAME, RATE: RATE,
    newGame: newGame, normalizeCode: normalizeCode, metrics: metrics, absorbRate: absorbRate,
    villageEmission: villageEmission, check: check, eligible: eligible, apply: apply, api: api, toolCost: toolCost,
    currentCard: currentCard, choose: choose, endYear: endYear, speciesStatus: speciesStatus,
    describe: describe, evaluate: evaluate, summaryText: summaryText, wqTarget: wqTarget,
    isTidal: isTidal, isEco: isEco, at: at, noise: noise, hashStr: hashStr, BUFFER: BUFFER,
    missionStatus: missionStatus, checkMissions: checkMissions, checkAchievements: checkAchievements,
    encodeResult: encodeResult, decodeResult: decodeResult, ENDING_KEYS: ENDING_KEYS,
    autoChoose: autoChoose, autoActions: autoActions, autoGame: autoGame
  };
})(window.BV = window.BV || {});

/*
 * 블루복셀 — 게임 진행(입력, 한 해 흐름, 튜토리얼, 저장)
 */
(function (BV) {
  'use strict';

  var C = BV.CONFIG;
  var sim = BV.sim, R = BV.render, U = BV.ui;
  var SAVE_KEY = 'bluevoxel.save.v1';

  var S = null;
  var tool = 'inspect';
  var tab = 'info';
  var sel = -1;
  var busy = false;
  var started = false;
  var lastTs = 0, tideTs = 0;
  var canvas = null;
  var tips = { step: 0, shown: {}, closed: false };
  var userCam = false;

  function narrow() { return !!(window.matchMedia && matchMedia('(max-width: 899px)').matches); }

  /* ---------- 저장 ---------- */
  function save() {
    if (!started) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가 환경 */ }
  }
  function loadSave() {
    try {
      var j = localStorage.getItem(SAVE_KEY);
      var s = j ? JSON.parse(j) : null;
      return s && s.v === 1 && s.tiles && s.tiles.length === 256 ? s : null;
    } catch (e) { return null; }
  }

  /* ---------- 화면 갱신 ---------- */
  function refresh() {
    U.renderHUD(S);
    U.renderTools(S, tool);
    U.renderPanel(S, tab, sel);
    U.renderNext(S, busy);
    R.sync();
    R.setEligible(tool === 'inspect' || !started ? null : sim.eligible(S, tool));
  }

  function setTool(id) {
    tool = id;
    refresh();
    var t = BV.TOOLS.filter(function (x) { return x.id === id; })[0];
    if (t && id !== 'inspect') {
      var n = sim.eligible(S, id).length;
      U.toast(t.name + ': ' + (n ? t.target + '에 쓸 수 있어요 (' + n + '칸)' : '지금은 쓸 수 있는 칸이 없어요'), n ? '' : 'bad');
    }
    tutorial('tool', id);
  }

  function select(i) {
    sel = i;
    R.setSelected(i);
    if (i >= 0) { tab = 'info'; if (!narrow()) U.expandPanel(); }
    U.renderPanel(S, tab, sel);
    if (i >= 0) tutorial('select');
  }

  function useTool(id, i) {
    var r = sim.apply(S, id, i);
    if (r.ok) {
      R.burst(i, id);
      var c = r.cost ? (r.cost < 0 ? ' (+' + (-r.cost) + '억)' : ' (−' + r.cost + '억)') : '';
      U.toast(r.msg + c);
      sel = i;
      R.setSelected(i);
      refresh();
      save();
      tutorial('act', id);
    } else {
      U.toast(r.reason || '여기에는 쓸 수 없어요.', 'bad');
      select(i);
    }
  }

  function onTileTap(i) {
    if (!started || busy) return;
    if (i < 0) { select(-1); return; }
    if (tool === 'inspect') select(i);
    else useTool(tool, i);
  }

  /* ---------- 한 해 흐름 ---------- */
  function showCard() {
    var card = sim.currentCard(S);
    if (!card) return;
    var rep = S.year > C.START_YEAR ? S.lastReport : null;
    U.showYear(S, rep, card);
  }

  function onChoose(idx) {
    var card = sim.currentCard(S);
    var opt = sim.choose(S, idx);
    U.closeModal();
    if (opt && card && card.options.length > 1) U.toast('결정: ' + opt.label);
    refresh();
    save();
    tutorial('card');
    contextTip();
  }

  function nextYear() {
    if (!started || busy) return;
    if (U.isModalOpen()) return;
    if (S.card) { showCard(); return; }
    if (S.ended) { showEnding(); return; }
    busy = true;
    var rep = sim.endYear(S);
    R.yearFX(rep);
    refresh();
    save();
    tutorial('year');
    setTimeout(function () {
      busy = false;
      refresh();
      if (S.ended) showEnding();
      else showCard();
    }, rep && rep.typhoon ? 1700 : 1150);
  }

  function showEnding() {
    U.showEnding(S, sim.evaluate(S));
  }

  function copyResult() {
    var text = sim.summaryText(S);
    var done = function () { U.toast('결과를 복사했어요. 활동지나 게시판에 붙여 넣으세요.'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { U.showCopyFallback(text); });
        return;
      }
    } catch (e) { /* 아래로 */ }
    U.showCopyFallback(text);
  }

  function startNew(code) {
    S = sim.newGame(code);
    started = true;
    tool = 'inspect';
    tab = 'info';
    sel = -1;
    busy = false;
    tips = { step: 1, shown: {}, closed: false };
    R.setState(S);
    R.setSelected(-1);
    R.fit();
    userCam = false;
    U.closeModal();
    refresh();
    save();
    showCard();
  }

  function continueGame() {
    started = true;
    refresh();
    if (S.ended) showEnding();
    else if (S.card) showCard();
  }

  function openMenu() {
    var saved = started && !S.ended;
    U.showTitle({ canContinue: saved, code: S ? S.code : C.DEFAULT_CODE });
  }

  /* ---------- 튜토리얼과 도움말 ---------- */
  var STEPS = {
    1: '지도의 칸을 하나 눌러 보세요. 오른쪽 노트에 진흙 속 탄소와 상태가 나와요.',
    2: '도구에서 ‘염생식물 심기’를 골라 보세요. 심을 수 있는 칸이 반짝여요.',
    3: '반짝이는 상부 갯벌을 눌러 심어요. 마을 앞에 심으면 태풍 때 파도도 막아 줘요.',
    4: '생태계는 해가 지나야 자라요. 할 일을 마쳤으면 ‘2027년으로’를 누르세요.'
  };
  function tutorial(ev, arg) {
    if (tips.closed || tips.step === 0 || tips.step > 4) return;
    if (ev === 'card' && tips.step === 1) { U.hint(STEPS[1]); return; }
    if (tips.step === 1 && ev === 'select') tips.step = 2;
    else if (tips.step === 2 && ev === 'tool' && arg === 'marsh') tips.step = 3;
    else if (tips.step <= 3 && ev === 'act' && arg === 'marsh') tips.step = 4;
    else if (ev === 'year') { tips.step = 5; U.hint(null); return; }
    else return;
    U.hint(STEPS[tips.step]);
  }
  function contextTip() {
    if (tips.closed || tips.step <= 4 || !S || S.ended) return;
    var m = sim.metrics(S);
    var list = [
      ['carbon', S.year >= 2027, '지도 오른쪽 위 ‘탄소’ 보기를 누르면 진흙 속 탄소가 어디에 많이 쌓였는지 보여요.'],
      ['wq', S.wq < 50 && m.seagrass < 4, '바다가 탁해서(수질 ' + Math.round(S.wq) + ') 잘피가 자라기 어려워요. 폐양식장을 정리하고 염습지를 늘리면 물이 맑아져요.'],
      ['debris', m.debris > 8, '쓰레기 칸이 ' + m.debris + '곳이에요. 쓰레기가 많으면 짱뚱어와 도요새가 돌아오지 않아요.'],
      ['wall', S.year >= 2029 && m.walls >= 10, '제방 뒤 간척지는 제방을 먼저 열어야 갯벌로 되돌릴 수 있어요. ‘제방 열기’ 도구를 써 보세요.'],
      ['neutral', S.year >= 2031 && m.neutrality < 0.3, '탄소중립까지 아직 멀어요. 갯벌만으로는 부족해요. 마을 회의의 에너지 전환 안건도 살펴보세요.'],
      ['codex', S.year >= 2030, '도감 탭에서 생물마다 돌아오는 조건을 볼 수 있어요. 무엇이 부족한지 확인해 보세요.']
    ];
    for (var k = 0; k < list.length; k++) {
      var it = list[k];
      if (!tips.shown[it[0]] && it[1]) { tips.shown[it[0]] = true; U.hint(it[2]); return; }
    }
  }

  /* ---------- 테마 ---------- */
  function applyTheme() {
    var root = document.documentElement;
    var cs = getComputedStyle(root);
    var t = root.getAttribute('data-theme');
    var dark = t ? t === 'dark' : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    R.setTheme(dark, cs.getPropertyValue('--sky-1').trim(), cs.getPropertyValue('--sky-2').trim(), cs.getPropertyValue('--accent').trim());
  }

  /* ---------- 입력 ---------- */
  function bindInput() {
    var pointers = new Map();
    var down = null, moved = false, pinch = 0;
    function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function spread() {
      var p = Array.from(pointers.values());
      return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
    canvas.addEventListener('pointerdown', function (e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { down = { x: e.clientX, y: e.clientY }; moved = false; }
      else { moved = true; pinch = spread(); }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && started) { var q = local(e); R.setHover(R.pick(q.x, q.y)); }
        return;
      }
      var p = pointers.get(e.pointerId);
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) moved = true;
        if (moved) { R.pan(dx, dy); userCam = true; }
      } else if (pointers.size === 2) {
        var d = spread();
        if (pinch > 0 && d > 0) {
          var pts = Array.from(pointers.values());
          var r = canvas.getBoundingClientRect();
          R.zoomAt(d / pinch, (pts[0].x + pts[1].x) / 2 - r.left, (pts[0].y + pts[1].y) / 2 - r.top);
          userCam = true;
        }
        pinch = d;
      }
    });
    function up(e) {
      var wasTap = pointers.size === 1 && !moved && e.type === 'pointerup';
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (wasTap) { var q = local(e); onTileTap(R.pick(q.x, q.y)); }
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', function () { R.setHover(-1); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var q = local(e);
      R.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, q.x, q.y);
      userCam = true;
    }, { passive: false });

    document.addEventListener('keydown', function (e) {
      if (U.isModalOpen()) {
        if (e.key === 'Escape' && U.modalClosable()) U.closeModal();
        return;
      }
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (!started) return;
      if (e.key >= '1' && e.key <= '8') { setTool(BV.TOOLS[+e.key - 1].id); e.preventDefault(); return; }
      if (e.key === 'Escape') { setTool('inspect'); return; }
      if (e.key === 'n' || e.key === 'N') { nextYear(); return; }
      var mv = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (mv) {
        e.preventDefault();
        var cur = sel >= 0 ? sel : 9 * sim.MW + 6;
        var x = Math.max(0, Math.min(sim.MW - 1, (cur % sim.MW) + mv[0]));
        var y = Math.max(0, Math.min(sim.MH - 1, Math.floor(cur / sim.MW) + mv[1]));
        select(y * sim.MW + x);
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && (e.target === canvas || e.target === document.body) && sel >= 0) {
        e.preventDefault();
        if (tool !== 'inspect') useTool(tool, sel);
      }
    });
  }

  /* ---------- 시작 ---------- */
  function loop(ts) {
    var dt = lastTs ? ts - lastTs : 16;
    lastTs = ts;
    R.frame(dt);
    if (ts - tideTs > 200) { tideTs = ts; U.tide(R.tide()); }
    requestAnimationFrame(loop);
  }

  function boot(data) {
    canvas = document.getElementById('map');
    canvas.tabIndex = 0;
    U.init({
      onTool: setTool,
      onTab: function (t) { tab = t; U.expandPanel(); U.renderPanel(S, tab, sel); },
      onAct: function (id, i) { useTool(id, i); },
      onNext: nextYear,
      onChoose: onChoose,
      onStart: startNew,
      onContinue: continueGame,
      onMenu: openMenu,
      onCopy: copyResult,
      onHintClose: function () { if (tips.step > 0 && tips.step <= 4) tips.closed = true; },
      onTidePause: function (p) { R.setTidePaused(p); },
      onView: function (m) { R.setViewMode(m); },
      onZoom: function (z) { if (z === 'fit') { R.fit(); userCam = false; } else { R.zoomCenter(z === 'in' ? 1.25 : 0.8); userCam = true; } },
      onLayout: function () { setTimeout(function () { R.resize(); }, 0); }
    });
    R.init(canvas);
    applyTheme();
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', applyTheme);
      var rm = matchMedia('(prefers-reduced-motion: reduce)');
      R.setReducedMotion(rm.matches);
    }
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    var stage = document.getElementById('stage');
    var firstFit = true;
    var ro = new ResizeObserver(function () {
      R.resize();
      if (firstFit || !userCam) { R.fit(); firstFit = false; }
    });
    if (window.matchMedia && matchMedia('(max-width: 899px)').matches) U.collapsePanel();
    ro.observe(stage);
    bindInput();

    var hot = data && data.state && data.state.tiles ? data.state : null;
    var saved = hot || loadSave();
    if (saved) {
      S = saved;
      R.setState(S);
      started = !!hot;
      tool = (data && data.tool) || 'inspect';
      tab = (data && data.tab) || 'info';
      if (hot) { tips.step = 5; continueGame(); }
      else { refresh(); U.showTitle({ canContinue: !S.ended, code: S.code }); }
    } else {
      S = sim.newGame(C.DEFAULT_CODE);
      R.setState(S);
      refresh();
      U.showTitle({ canContinue: false });
    }
    requestAnimationFrame(loop);
  }

  var hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    hot.snapshot(function () { return started ? { state: S, tool: tool, tab: tab } : {}; });
  }
  function start(data) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(data); });
    else boot(data);
  }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})(window.BV = window.BV || {});

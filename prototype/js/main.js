/*
 * 블루복셀 — 게임 진행 v0.2: 타이틀 데모, 한 해 연출, 미션·업적, 교사용 리포트, 설정
 */
(function (BV) {
  'use strict';

  var C = BV.CONFIG;
  var sim = BV.sim, R = BV.render, U = BV.ui, A = BV.audio;
  var SAVE_KEY = 'bluevoxel.save.v1', META_KEY = 'bluevoxel.meta.v1', SET_KEY = 'bluevoxel.settings.v1';

  var S = null, D = null;
  var mode = 'title';
  var tool = 'inspect', tab = 'info', sel = -1, busy = false;
  var lastTs = 0, tideTs = 0, demoTs = 0, demoStep = 0;
  var canvas = null, userCam = false;
  var settings = { sfx: true, music: true, fx: true, fast: false };
  var meta = { ach: {}, endings: {}, best: {}, plays: 0 };
  var setup = { diff: 'normal', code: '' };
  var coach = null, tut = 0, tipsShown = {};
  var skipFn = null, teacherRows = [];

  /* ---------- 저장 ---------- */
  function load(key, def) { try { var j = localStorage.getItem(key); return j ? JSON.parse(j) : def; } catch (e) { return def; } }
  function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  function save() { if (mode === 'play' && S) store(SAVE_KEY, S); }
  function loadSave() { var s = load(SAVE_KEY, null); return s && s.v === 1 && s.tiles && s.tiles.length === 256 ? s : null; }
  function narrow() { return !!(window.matchMedia && matchMedia('(max-width: 899px)').matches); }
  function speed() { return settings.fast ? 0.55 : 1; }
  function wait(ms) {
    return new Promise(function (res) {
      var t = setTimeout(function () { skipFn = null; res(); }, ms * speed());
      skipFn = function () { clearTimeout(t); skipFn = null; res(); };
    });
  }
  function applySettings() {
    A.setSfx(settings.sfx);
    A.setMusic(settings.music);
    R.setLite(!settings.fx);
    U.setSoundIcon(settings.sfx || settings.music);
  }
  function bestText() {
    var b = meta.best.normal || meta.best.hard || meta.best.easy;
    return b ? b.title + ' · 탄소중립 ' + b.neutral + '%' : '';
  }

  /* ---------- 화면 갱신 ---------- */
  function refresh() {
    if (mode !== 'play') return;
    U.renderHUD(S);
    U.renderTools(S, tool, coach);
    U.renderMissions(S);
    U.renderPanel(S, tab, sel);
    U.renderNext(S, busy);
    R.sync();
    R.setEligible(tool === 'inspect' || busy ? null : sim.eligible(S, tool));
  }

  function setTool(id) {
    if (mode !== 'play' || busy) return;
    tool = tool === id && id !== 'inspect' ? 'inspect' : id;
    A.play('tool');
    refresh();
    if (tool !== 'inspect' && !sim.eligible(S, tool).length) U.toast('지금 쓸 수 있는 칸이 없어요', 'bad');
    tutorial('tool', tool);
  }
  function select(i) {
    sel = i;
    R.setSelected(i);
    if (i >= 0) { tab = 'info'; if (!narrow()) U.expandPanel(); }
    U.renderPanel(S, tab, sel);
  }

  var SFX_OF = { marsh: 'marsh', seagrass: 'seagrass', cleanup: 'cleanup', restore: 'water', openwall: 'water', boardwalk: 'boardwalk', develop: 'develop' };
  function useTool(id, i) {
    var r = sim.apply(S, id, i);
    if (r.ok) {
      R.burst(i, id);
      A.play(SFX_OF[id] || 'click');
      if (r.cost < 0) { A.play('coin'); A.buzz(60); R.float(i, '+' + (-r.cost) + '억', 'gold', 16); setTimeout(function () { R.float(i, 'CO₂↑', 'grey', 14); }, 350); }
      else if (r.cost > 0) R.float(i, '−' + r.cost + '억', 'white', 14);
      sel = i;
      R.setSelected(i);
      refresh();
      missionsDone(r.missions);
      save();
      checkAch();
      tutorial('act', id);
    } else {
      A.play('error');
      R.burst(i, 'error');
      U.toast(r.reason || '여기에는 쓸 수 없어요', 'bad');
      select(i);
    }
  }
  function onTileTap(i) {
    if (mode !== 'play') return;
    if (busy) { if (skipFn) skipFn(); return; }
    if (i < 0) { select(-1); return; }
    if (tool === 'inspect') { A.play('click'); select(i); }
    else useTool(tool, i);
  }

  function missionsDone(ids) {
    if (!ids || !ids.length) return;
    ids.forEach(function (id, k) {
      var d = BV.MISSIONS.filter(function (m) { return m.id === id; })[0];
      setTimeout(function () {
        A.play('mission');
        U.topToast(d.icon, '미션 완료 · ' + d.text, d.reward[0] === 'budget' ? '+' + d.reward[1] + '억' : '지지도 +' + d.reward[1], 'mission');
      }, k * 450);
    });
    U.renderMissions(S, S.missions.active);
    U.renderHUD(S);
  }
  function checkAch(ctx) {
    var got = sim.checkAchievements(S, ctx || { endingsSeen: Object.keys(meta.endings).length });
    var fresh = got.filter(function (id) { return !meta.ach[id]; });
    if (!fresh.length) return fresh;
    fresh.forEach(function (id, k) {
      meta.ach[id] = Date.now();
      var a = BV.ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
      setTimeout(function () { A.play('achieve'); U.topToast(a.icon, '업적 · ' + a.name, a.desc, 'ach'); }, 600 + k * 650);
    });
    store(META_KEY, meta);
    return fresh;
  }

  /* ---------- 회의 카드 ---------- */
  function showCard() {
    var card = sim.currentCard(S);
    if (!card) return;
    U.showCard(S, S.year > C.START_YEAR ? S.lastReport : null, card);
  }
  function onChoose(idx) {
    var before = S.tiles.map(function (t) { return t.type; });
    var card = sim.currentCard(S);
    var cutsBefore = Object.keys(S.cuts).length;
    sim.choose(S, idx);
    U.closeModal();
    var changed = 0;
    S.tiles.forEach(function (t, i) {
      if (t.type === before[i]) return;
      changed++;
      if (t.type === 'industry' || t.type === 'resort') R.burst(i, 'develop');
      else if (t.type === 'upper') R.burst(i, 'restore');
      else R.burst(i, 'boardwalk');
    });
    if (changed) A.play(S.tiles.some(function (t, i) { return t.type !== before[i] && (t.type === 'industry' || t.type === 'resort'); }) ? 'develop' : 'water');
    if (Object.keys(S.cuts).length > cutsBefore) { A.play('mission'); U.banner('배출 감축!', card ? card.options[idx].label : '', 1200); }
    if (card && card.typhoon) U.hint('마을 앞에 염생식물을 심어 두세요', 5000);
    refresh();
    save();
    checkAch();
    tutorial('card');
  }

  /* ---------- 한 해 연출 ---------- */
  function tileFor(id) {
    var want = { spoonbill: ['island', 'mudflat'], porpoise: ['sea', 'shallow'], seahorse: ['seagrass'], eelgrass: ['seagrass'],
      suaeda: ['marsh'], fiddler: ['marsh', 'mudflat'], whitecrab: ['mudflat'] }[id] || ['mudflat', 'upper'];
    for (var k = 0; k < want.length; k++) {
      var best = -1, bc = -1;
      S.tiles.forEach(function (t, i) { if (t.type === want[k] && t.carbon + t.health > bc) { bc = t.carbon + t.health; best = i; } });
      if (best >= 0) return best;
    }
    return -1;
  }
  function nextYear() {
    if (mode !== 'play' || busy || U.isModalOpen()) return;
    if (S.card) { showCard(); return; }
    if (S.ended) { showEnding(); return; }
    runYear();
  }
  async function runYear() {
    busy = true;
    sel = -1;
    R.setSelected(-1);
    U.hint(null);
    refresh();
    var rep = sim.endYear(S);
    save();
    A.play('year');
    R.setDusk(0.8);
    R.boostTide(5);
    if (!userCam) R.fitSmooth(0.7);
    U.banner(String(rep.year), '한 해가 흘러요', 1300 * speed());
    await wait(750);
    R.co2Stream(rep.absorbByTile, 1.3);
    A.play('absorb');
    await wait(1000);
    U.banner('+' + Math.round(rep.effAbsorb) + ' tCO₂', '진흙 속에 저장', 1200 * speed());
    await wait(1100);
    if (rep.emitLand >= 1) {
      R.smokeStream(S.tiles.map(function (t, i) { return t.emit > 0.3 || t.type === 'industry' ? i : -1; }).filter(function (i) { return i >= 0; }));
      A.play('smoke');
      U.banner('−' + Math.round(rep.emitLand) + ' tCO₂', '메운 땅에서 빠져나감', 1100 * speed());
      await wait(1100);
    }
    if (rep.typhoon) {
      R.setDusk(0);
      R.setStorm(1, sim.BUFFER.filter(function (i) { return BV.ECO[S.tiles[i].type]; }));
      A.storm(1);
      A.play('thunder');
      A.buzz([90, 50, 90]);
      U.banner('태풍 ' + rep.typhoon.strength + '등급', '갯벌·염습지가 피해 −' + rep.typhoon.reduction + '%', 2300 * speed());
      await wait(2400);
      R.setStorm(0);
      A.storm(0);
      await wait(400);
    }
    if (rep.heat) {
      R.setHeat(1);
      A.play('heat');
      U.banner('해양 열파', '잘피 건강 −' + rep.heat.hit, 1300 * speed());
      await wait(1300);
      R.setHeat(0);
    }
    R.setDusk(0);
    R.boostTide(1);
    refresh();
    for (var k = 0; k < rep.discoveries.length; k++) {
      var id = rep.discoveries[k], ti = tileFor(id);
      if (ti >= 0) R.focusTile(ti, 1.9, 0.6);
      await wait(600);
      if (ti >= 0) R.creaturePop(ti, id);
      A.play('discover');
      A.buzz(40);
      await U.reveal(id, 2600 * speed());
    }
    if (rep.discoveries.length && !userCam) R.fitSmooth(0.6);
    missionsDone(rep.missions);
    checkAch();
    busy = false;
    refresh();
    if (S.ended) { await wait(300); showEnding(); }
    else { showCard(); contextTip(); }
  }

  function showEnding() {
    var ev = sim.evaluate(S);
    if (!S.endingCounted) {
      S.endingCounted = true;
      meta.endings[ev.key] = (meta.endings[ev.key] || 0) + 1;
      meta.plays = (meta.plays || 0) + 1;
      var b = meta.best[S.diff];
      var n = Math.round(ev.neutrality * 100);
      if (!b || n > b.neutral) meta.best[S.diff] = { neutral: n, species: ev.species, title: ev.ending.title };
      store(META_KEY, meta);
      save();
    }
    var fresh = checkAch({ endingsSeen: Object.keys(meta.endings).length });
    U.showEnding(S, ev, { newAch: fresh, code: sim.encodeResult(S) });
  }
  function copyText(text, okMsg) {
    var done = function () { U.toast(okMsg); A.play('coin'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { U.showCopyFallback(text); });
        return;
      }
    } catch (e) { /* 아래로 */ }
    U.showCopyFallback(text);
  }

  /* ---------- 튜토리얼·팁 (짧게) ---------- */
  function tutorial(ev, arg) {
    if (!tut) return;
    if (tut === 1 && ev === 'card') { coach = 'marsh'; U.hint('염생식물을 골라 보세요'); refresh(); }
    else if (tut === 1 && ev === 'tool' && arg === 'marsh') { tut = 2; coach = null; U.hint('반짝이는 칸을 눌러 심어요'); refresh(); }
    else if (tut <= 2 && ev === 'act' && arg === 'marsh') { tut = 3; coach = null; U.hint('다 했으면 다음 해로 ▶', 6000); refresh(); }
    if (ev === 'year' || (tut === 3 && busy)) { tut = 0; U.hint(null); }
  }
  function contextTip() {
    if (tut) { tut = 0; return; }
    var m = sim.metrics(S);
    var list = [
      ['wq', (S.stats.actions.seagrass || 0) > 0 && S.wq < 50, '잘피는 맑은 물이 필요해요'],
      ['debris', m.debris > 8, '쓰레기가 생물을 쫓아내요'],
      ['wall', S.year >= 2029 && m.walls >= 10, '제방을 열면 간척지가 살아나요'],
      ['neutral', S.year >= 2031 && m.neutrality < 0.3, '감축 없이는 탄소중립이 어려워요'],
      ['carbon', S.year >= 2028, '‘탄소’ 보기로 저장고를 확인해요']
    ];
    for (var k = 0; k < list.length; k++) {
      if (!tipsShown[list[k][0]] && list[k][1]) { tipsShown[list[k][0]] = true; U.hint(list[k][2], 5500); return; }
    }
  }

  /* ---------- 타이틀과 데모 ---------- */
  function toTitle() {
    mode = 'title';
    busy = false;
    U.closeModal();
    U.hint(null);
    U.setTitleMode(true);
    D = sim.newGame('DEMO');
    D.budget = 60;
    D.card = null;
    R.setState(D);
    R.setDemo(true);
    R.setEligible(null);
    R.setSelected(-1);
    setTimeout(function () { R.resize(); R.fit(); }, 30);
    var saved = loadSave();
    U.renderTitle({ canContinue: !!(saved && !saved.ended), achCount: Object.keys(meta.ach).length, best: bestText() });
  }
  var DEMO_ORDER = ['cleanup', 'marsh', 'openwall', 'restore', 'marsh', 'seagrass', 'marsh', 'boardwalk'];
  function demoTick(ts) {
    if (mode !== 'title' || !D || ts - demoTs < 1300) return;
    demoTs = ts;
    if (D.ended || D.year > 2046) { D = sim.newGame('DEMO'); D.budget = 60; D.card = null; R.setState(D); return; }
    if (D.card) sim.autoChoose(D, 'eco');
    demoStep++;
    if (demoStep % 6 === 0) {
      var rep = sim.endYear(D);
      D.card = null;
      D.budget += 8;
      R.co2Stream(rep.absorbByTile, 1.2);
      rep.discoveries.forEach(function (id) { var ti = -1; D.tiles.some(function (t, i) { if (BV.ECO[t.type]) { ti = i; return Math.random() < 0.08; } return false; }); if (ti >= 0) R.creaturePop(ti, id); });
      R.sync();
      return;
    }
    for (var k = 0; k < DEMO_ORDER.length; k++) {
      var t = DEMO_ORDER[(demoStep + k) % DEMO_ORDER.length];
      var list = sim.eligible(D, t).filter(function (i) { return sim.check(D, t, i).ok; });
      if (list.length) {
        var i = list[Math.floor(Math.random() * list.length)];
        sim.apply(D, t, i);
        R.burst(i, t);
        break;
      }
    }
    R.sync();
  }

  function enterPlay() {
    mode = 'play';
    tool = 'inspect';
    tab = 'info';
    sel = -1;
    busy = false;
    U.closeModal();
    U.setTitleMode(false);
    R.setDemo(false);
    R.setState(S);
    R.setSelected(-1);
    U.resetHud();
    userCam = false;
    setTimeout(function () { R.resize(); R.fit(); }, 30);
    if (narrow()) U.collapsePanel();
    refresh();
  }
  function startNew() {
    var inp = document.getElementById('codeInput');
    if (inp) setup.code = inp.value;
    S = sim.newGame(setup.code, setup.diff);
    tut = 1;
    coach = null;
    tipsShown = {};
    enterPlay();
    save();
    A.play('discover');
    setTimeout(showCard, 350);
  }
  function continueGame() {
    var s = loadSave();
    if (!s) { U.showSetup(setup); return; }
    S = s;
    tut = 0;
    coach = null;
    enterPlay();
    if (S.ended) showEnding();
    else if (S.card) showCard();
  }

  /* ---------- 교사용 리포트 ---------- */
  function analyze() {
    var txt = (document.getElementById('codesInput') || {}).value || '';
    var raw = ((document.getElementById('clsInput') || {}).value || '').trim();
    var clsHash = raw ? (sim.hashStr(sim.normalizeCode(raw)) & 0xffff) : null;
    var re = /BV1-[0-9A-Za-z-]{20,40}/g, m, bad = 0, other = 0;
    teacherRows = [];
    while ((m = re.exec(txt))) {
      var r = sim.decodeResult(m[0]);
      if (!r) { bad++; continue; }
      if (clsHash !== null && r.cls !== clsHash) { other++; continue; }
      teacherRows.push(r);
    }
    var info = [];
    if (bad) info.push('읽지 못한 코드 ' + bad + '개');
    if (other) info.push('다른 수업 코드 ' + other + '개 제외');
    U.renderTeacher(teacherRows, info.join(' · '));
    A.play('mission');
  }
  function sampleCodes() {
    var styles = ['eco', 'mid', 'mid', 'eco', 'dev', 'mid', 'idle', 'mid', 'eco', 'mid', 'mid', 'dev', 'eco', 'mid', 'idle', 'mid', 'eco', 'mid', 'mid', 'eco', 'dev', 'mid', 'mid', 'eco'];
    return styles.map(function (st, k) { return '학생' + (k + 1) + ': ' + sim.encodeResult(sim.autoGame('DEMO', st, 'normal')); }).join('\n');
  }
  function teacherCSV() {
    var lines = ['순위,엔딩,탄소중립(%),생물,지지도,난이도,결과코드'];
    teacherRows.slice().sort(function (a, b) { return b.neutrality - a.neutrality; }).forEach(function (r, k) {
      lines.push([k + 1, BV.ENDINGS[r.ending].title, Math.round(r.neutrality * 100), r.species, r.support, BV.DIFFICULTY[r.diff].name, r.code].join(','));
    });
    return lines.join('\n');
  }

  /* ---------- UI 동작 ---------- */
  function onUi(act, node) {
    A.play('click');
    switch (act) {
      case 'new': U.showSetup(setup); break;
      case 'continue': continueGame(); break;
      case 'diff':
        setup.diff = node.getAttribute('data-diff');
        document.querySelectorAll('.diff').forEach(function (b) { var on = b === node; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        break;
      case 'start': startNew(); break;
      case 'close': U.closeModal(); break;
      case 'settings': U.showSettings(settings); break;
      case 'set': {
        var key = node.getAttribute('data-key');
        settings[key] = !settings[key];
        node.setAttribute('aria-pressed', String(settings[key]));
        store(SET_KEY, settings);
        applySettings();
        break;
      }
      case 'achievements': U.showAchievements(meta); break;
      case 'credits': U.showCredits(); break;
      case 'teacher': U.showTeacher(); break;
      case 'analyze': analyze(); break;
      case 'sample': { var ta = document.getElementById('codesInput'); if (ta) ta.value = sampleCodes(); analyze(); break; }
      case 'csv': copyText(teacherCSV(), '표를 복사했어요. 스프레드시트에 붙여 넣으세요.'); break;
      case 'copy': copyText(sim.summaryText(S) + '\n결과 코드: ' + sim.encodeResult(S), '복사했어요. 선생님께 보내 주세요.'); break;
      case 'again': setup.code = S.code; setup.diff = S.diff || 'normal'; U.closeModal(); U.showSetup(setup); break;
      case 'title': toTitle(); break;
      default: break;
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
    var pointers = new Map(), down = null, moved = false, pinch = 0;
    function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function spread() { var p = Array.from(pointers.values()); return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    canvas.addEventListener('pointerdown', function (e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { down = { x: e.clientX, y: e.clientY }; moved = false; } else { moved = true; pinch = spread(); }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && mode === 'play' && !busy) { var q = local(e); R.setHover(R.pick(q.x, q.y)); }
        return;
      }
      if (mode !== 'play') return;
      var p = pointers.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) moved = true;
        if (moved) { R.pan(dx, dy); userCam = true; }
      } else if (pointers.size === 2) {
        var d = spread();
        if (pinch > 0 && d > 0) {
          var pts = Array.from(pointers.values()), r = canvas.getBoundingClientRect();
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
      if (mode !== 'play') return;
      e.preventDefault();
      var q = local(e);
      R.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, q.x, q.y);
      userCam = true;
    }, { passive: false });
    document.addEventListener('pointerdown', function () { A.unlock(); applySettings(); }, { capture: true });
    document.addEventListener('keydown', function (e) {
      A.unlock();
      if (busy && (e.key === ' ' || e.key === 'Enter')) { if (skipFn) skipFn(); e.preventDefault(); return; }
      if (U.isModalOpen()) { if (e.key === 'Escape' && U.modalClosable()) U.closeModal(); return; }
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.altKey || e.ctrlKey || e.metaKey || mode !== 'play') return;
      if (e.key >= '1' && e.key <= '8') { setTool(BV.TOOLS[+e.key - 1].id); e.preventDefault(); return; }
      if (e.key === 'Escape') { setTool('inspect'); return; }
      if (e.key === 'n' || e.key === 'N') { nextYear(); return; }
      var mv = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (mv) {
        e.preventDefault();
        var cur = sel >= 0 ? sel : 9 * sim.MW + 6;
        select(Math.max(0, Math.min(sim.MH - 1, Math.floor(cur / sim.MW) + mv[1])) * sim.MW + Math.max(0, Math.min(sim.MW - 1, (cur % sim.MW) + mv[0])));
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && (e.target === canvas || e.target === document.body) && sel >= 0 && tool !== 'inspect') { e.preventDefault(); useTool(tool, sel); }
    });
    document.getElementById('stage').addEventListener('pointerdown', function () { if (busy && skipFn) skipFn(); });
  }

  /* ---------- 시작 ---------- */
  function loop(ts) {
    var dt = lastTs ? ts - lastTs : 16;
    lastTs = ts;
    R.frame(dt);
    if (ts - tideTs > 200) { tideTs = ts; U.tide(R.tide()); }
    demoTick(ts);
    requestAnimationFrame(loop);
  }

  function boot(data) {
    canvas = document.getElementById('map');
    canvas.tabIndex = 0;
    settings = Object.assign(settings, load(SET_KEY, {}));
    meta = Object.assign({ ach: {}, endings: {}, best: {}, plays: 0 }, load(META_KEY, {}));
    U.init({
      onTool: setTool,
      onTab: function (t) { A.play('click'); tab = t; U.expandPanel(); U.renderPanel(S, tab, sel); },
      onAct: function (id, i) { useTool(id, i); },
      onNext: nextYear,
      onChoose: onChoose,
      onUi: onUi,
      onMenu: function () { if (mode === 'play') { save(); toTitle(); } },
      onSoundToggle: function () {
        var on = !(settings.sfx || settings.music);
        settings.sfx = on; settings.music = on;
        store(SET_KEY, settings);
        A.unlock();
        applySettings();
        U.toast(on ? '소리 켬' : '소리 끔');
      },
      onTidePause: function (p) { R.setTidePaused(p); },
      onView: function (m) { R.setViewMode(m); },
      onZoom: function (z) { A.play('click'); if (z === 'fit') { R.fitSmooth(0.5); userCam = false; } else { R.zoomCenter(z === 'in' ? 1.25 : 0.8); userCam = true; } },
      onLayout: function () { setTimeout(function () { R.resize(); }, 0); }
    });
    R.init(canvas);
    applyTheme();
    applySettings();
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', applyTheme);
      R.setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    var first = true;
    new ResizeObserver(function () { R.resize(); if (first || !userCam) { R.fit(); first = false; } }).observe(document.getElementById('stage'));
    bindInput();

    if (data && data.mode === 'play' && data.state && data.state.tiles) {
      S = data.state;
      enterPlay();
      if (S.ended) showEnding(); else if (S.card) showCard();
    } else toTitle();
    requestAnimationFrame(loop);
  }

  var hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(function () { return mode === 'play' ? { mode: 'play', state: S } : {}; });
  function start(data) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(data); });
    else boot(data);
  }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})(window.BV = window.BV || {});

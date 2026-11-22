// 갯벌 수호대 — 시작·입력·게임 흐름·저장
(function (root) {
  'use strict';
  const GS = root.GS, D = GS.DATA, C = GS.CONFIG;
  const R = GS.render, AU = GS.audio, UI = GS.ui, SIM = GS.sim;
  const KEY = 'gaetbeol.save.v1';
  const $ = id => document.getElementById(id);

  const DEF = () => ({ pearls: 0, up: {}, unlocked: {}, cleared: 0, best: {}, totalKills: 0, bestTime: 0, codex: { crab: 1, claw: 1 },
    runs: 0, tips: {}, settings: { sfx: true, music: true, shake: true, dmg: true }, char: 'crab', stage: 1,
    stars: {}, starSel: {}, endless: false, endlessBest: {}, ach: {}, acc: { owned: {}, on: null }, daily: {} });
  function loadMeta() {
    try { const v = JSON.parse(root.localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
  }
  const meta = Object.assign(DEF(), loadMeta() || {});
  meta.settings = Object.assign(DEF().settings, meta.settings || {});
  for (const k of ['stars', 'starSel', 'endlessBest', 'ach', 'best', 'up', 'unlocked', 'codex', 'tips', 'daily']) if (!meta[k] || typeof meta[k] !== 'object') meta[k] = {};
  if (!meta.acc || typeof meta.acc !== 'object') meta.acc = { owned: {}, on: null };
  if (!meta.acc.owned) meta.acc.owned = {};
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(meta)); } catch (e) { /* 저장이 막힌 곳에서도 게임은 계속돼요 */ } }

  let mode = 'title', s = null, demo = null, paused = false, ended = false, endAt = 0, snapCam = true;
  let acc = 0, last = 0, demoAcc = 0, botInp = { x: 0, y: 0 }, botN = 0, autopilot = false;
  let fpsAcc = 0, fpsN = 0, liteSet = false, hintOn = false;
  const keys = {};
  const joy = { on: false, id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };
  const touchy = root.matchMedia ? root.matchMedia('(pointer: coarse)').matches : false;
  const tipQ = [];
  let tipAt = 0;

  const charOk = id => { const c = D.CHARS.find(x => x.id === id); return !!c && (!c.unlock || !!meta.unlocked[id]); };
  const stageOk = id => id === 1 || (meta.cleared || 0) >= id - 1;
  function unlockMet(u) {
    if (u.kind === 'time') return (meta.bestTime || 0) >= u.v;
    if (u.kind === 'kills') return (meta.totalKills || 0) >= u.v;
    if (u.kind === 'clear') return (meta.cleared || 0) >= u.v;
    if (u.kind === 'runs') return (meta.runs || 0) >= u.v;
    return false;
  }
  function codexCount() {
    const ids = new Set([...D.CHARS.map(c => c.id), ...Object.keys(D.WEAPONS), ...Object.keys(D.PASSIVES), ...Object.keys(D.ENEMIES)]);
    return Object.keys(meta.codex).filter(k => ids.has(k)).length;
  }
  function achMet(a, r) {
    switch (a.kind) {
      case 'runs': return meta.runs >= a.v;
      case 'clear': return (meta.cleared || 0) >= a.v;
      case 'kills': return r.kills >= a.v;
      case 'evo': return r.evoCount >= a.v;
      case 'level': return r.level >= a.v;
      case 'carbon': return r.carbon >= a.v;
      case 'green': return r.greenMax >= a.v;
      case 'storm': return r.stormSurvived >= a.v;
      case 'star': return r.win && r.star >= a.v;
      case 'endless': return r.endless && r.time >= a.v;
      case 'chars': return D.CHARS.filter(c => !c.unlock || meta.unlocked[c.id]).length >= a.v;
      case 'codex': return codexCount() >= a.v;
    }
    return false;
  }

  // ── 입력 ─────────────────────────────────────────────
  function inputVec() {
    if (autopilot && s) return SIM.bot(s);
    let x = 0, y = 0;
    if (keys.ArrowLeft || keys.KeyA) x -= 1;
    if (keys.ArrowRight || keys.KeyD) x += 1;
    if (keys.ArrowUp || keys.KeyW) y -= 1;
    if (keys.ArrowDown || keys.KeyS) y += 1;
    if (joy.on && (joy.dx || joy.dy)) { x = joy.dx; y = joy.dy; }
    const m = Math.hypot(x, y);
    return m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }
  function joyRelease() { joy.on = false; joy.dx = joy.dy = 0; }
  function hideHint() { if (hintOn) { hintOn = false; UI.hint(false); meta.tips.move = 1; save(); } }

  function bindInput() {
    const cv = $('cv');
    cv.addEventListener('pointerdown', e => {
      AU.unlock();
      if (mode !== 'play' || !s || s.mode !== 'play' || paused || ended) return;
      joy.on = true; joy.id = e.pointerId; joy.x0 = e.clientX; joy.y0 = e.clientY; joy.dx = joy.dy = 0;
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 캡처가 안 돼도 움직임은 받아요 */ }
    });
    cv.addEventListener('pointermove', e => {
      if (!joy.on || e.pointerId !== joy.id) return;
      let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0;
      const d = Math.hypot(dx, dy), R0 = 54;
      if (d > R0) { joy.x0 += dx / d * (d - R0); joy.y0 += dy / d * (d - R0); dx = dx / d * R0; dy = dy / d * R0; }
      if (d < 7) { joy.dx = joy.dy = 0; } else { joy.dx = dx / R0; joy.dy = dy / R0; hideHint(); }
    });
    const up = e => { if (e.pointerId === joy.id) joyRelease(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    R.setJoy(joy);

    root.addEventListener('keydown', e => {
      AU.unlock();
      const inGame = mode === 'play' && s;
      if (inGame && /^Arrow/.test(e.code)) e.preventDefault();
      keys[e.code] = true;
      const modal = ['levelup', 'chest', 'pause', 'result', 'shop', 'codex', 'daily'].some(id => UI.isOpen(id));
      if (inGame) {
        if (/^(Arrow|Key[WASD])/.test(e.code)) hideHint();
        if ((e.code === 'Escape' || e.code === 'KeyP') && !ended) { if (UI.isOpen('pause')) resume(); else if (s.mode === 'play') pause(); }
        if (s.mode === 'levelup' && UI.isOpen('levelup')) {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= s.choices.length) choose(n - 1);
          if (e.code === 'KeyR') reroll();
        }
        if (s.mode === 'chest' && !$('chestOk').hidden && (e.code === 'Enter' || e.code === 'Space') && document.activeElement !== $('chestOk')) { e.preventDefault(); closeChest(); }
      } else if (mode === 'title' && !modal && document.activeElement === document.body) {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); play(); }
        if (e.code === 'ArrowLeft') pickChar(-1);
        if (e.code === 'ArrowRight') pickChar(1);
      }
      if (e.code === 'Escape' && UI.isOpen('shop')) closeShop();
      if (e.code === 'Escape' && UI.isOpen('codex')) closeCodex();
    });
    root.addEventListener('keyup', e => { keys[e.code] = false; });
    root.addEventListener('blur', () => { for (const k in keys) keys[k] = false; joyRelease(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (mode === 'play' && s && s.mode === 'play' && !paused && !ended) pause(); AU.suspend(true); }
      else AU.suspend(false);
    });
    root.addEventListener('resize', () => { R.resize(); if (s) s.view = R.view(); if (demo) demo.view = R.view(); });
  }

  // ── 소리와 연출 연결 ───────────────────────────────────
  const SFX = { dmg: 'hit', gem: 'gem', heal: 'heal', levelup: 'level', pick: 'pick', evo: 'evo', chest: 'chest', shoot: 'shoot', drip: 'drip',
    sweep: 'sweep', splash: 'splash', dash: 'dash', erupt: 'erupt', nova: 'nova', jump: 'jump', mine: 'mine', bolt: 'bolt', emit: 'emit',
    charge: 'charge', slam: 'slam', blast: 'blast', bloom: 'bloom', magnet: 'magnet', revive: 'revive', bosskill: 'bosskill',
    boing: 'boing', pop: 'pop', bubbles: 'bubble', ink: 'ink', toss: 'jump', heatPulse: 'heatPulse', bloomBoss: 'bloomBoss',
    milestone: 'milestone', bomb: 'bomb', freeze: 'freeze', pouch: 'coin', feather: 'feather', combo: 'combo', break: 'break', emerge: 'emerge', cancel: 'cancel' };
  function sound(e) {
    if (e.k === 'kill') { AU.play(e.boss ? 'bosskill' : 'kill'); return; }
    if (e.k === 'hurt') { AU.play('hurt'); AU.buzz(25); return; }
    if (e.k === 'alert') { AU.play(e.id === 'storm' ? 'storm' : 'warn'); return; }
    if (e.k === 'boss') { AU.play('warn'); AU.play('boss'); AU.music('boss'); return; }
    if (e.k === 'bosskill') { AU.play('bosskill'); if (e.endless) AU.music('run'); else AU.music('off'); return; }
    if (e.k === 'dead') { AU.play('lose'); AU.music('off'); return; }
    if (e.k === 'won') { AU.play('win'); return; }
    if (e.k === 'stormEnd') return;
    const n = SFX[e.k];
    if (n) AU.play(n);
  }
  function drain(st) {
    for (const e of st.fx) {
      R.fx(e, st);
      UI.fx(e, st);
      sound(e);
      if (e.k === 'emit') queueTip('pave', '매립되면 갯벌 속 탄소가 다시 빠져나가요!');
      if (e.k === 'gem') queueTip('gem', '파란 결정은 갯벌이 붙잡은 탄소예요. 모으면 강해져요!');
      if (e.k === 'emerge' && st === s) queueTip('emerge', '회색 오염 땅에서 몬스터가 솟아나요');
      if (e.k === 'cancel' && st === s) queueTip('cancel', '먼저 초록으로 살리면 몬스터가 못 나와요!');
      if (e.k === 'break' && st === s) queueTip('trash', '쓰레기 더미를 부수면 아이템이 나와요');
      if (e.k === 'levelup') AU.buzz(12);
    }
    st.fx.length = 0;
  }
  function queueTip(key, text) { if (!meta.tips[key] && !tipQ.some(t => t[0] === key)) tipQ.push([key, text]); }
  function runTips(now) {
    if (!s || s.mode !== 'play') return;
    if (s.kills >= 3) queueTip('restore2', '쓰러뜨린 자리는 초록 갯벌로 되살아나요');
    if (s.p.onMarsh && s.t > 6) queueTip('marsh2', '초록 갯벌 위에선 체력이 차고 공격이 빨라져요');
    if (s.green > 0.09) queueTip('gauge', '갯벌을 살릴수록 위 게이지 보상이 열려요');
    if (tipQ.length && now - tipAt > 5200 && !hintOn) { const [k, t] = tipQ.shift(); UI.tip(k, t); tipAt = now; }
  }

  // ── 게임 흐름 ─────────────────────────────────────────
  function newDemo() {
    const char = charOk(meta.char) ? meta.char : 'crab';
    demo = SIM.newRun({ stage: meta.stage, char, meta: { hp: 5, might: 4, speed: 2, magnet: 3, regen: 3, growth: 3 } });
    demo.view = R.view();
    for (let i = 0; i < 60 * 14; i++) {
      if (demo.mode === 'levelup') SIM.choose(demo, SIM.botChoose(demo));
      else if (demo.mode === 'chest') SIM.closeChest(demo);
      if (demo.mode !== 'play') break;
      if (i % 6 === 0) botInp = SIM.bot(demo);
      SIM.step(demo, C.DT, botInp);
      demo.fx.length = 0;
    }
    R.reset();
    snapCam = true;
  }

  function closeModals() { for (const id of ['levelup', 'chest', 'pause', 'result', 'shop', 'codex', 'daily']) UI.show(id, false); }

  function dailyInfo() {
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const seed = GS.hashStr('daily:' + key), r = GS.rng(seed);
    const stage = 1 + Math.floor(r() * Math.min(D.STAGES.length, (meta.cleared || 0) + 1));
    const chars = D.CHARS.filter(c => !c.unlock || meta.unlocked[c.id]);
    const char = chars[Math.floor(r() * chars.length)].id;
    const pool = D.MODS.slice(), mods = [];
    for (let i = 0; i < 2; i++) mods.push(pool.splice(Math.floor(r() * pool.length), 1)[0].id);
    return { key, seed, stage, char, mods };
  }
  function dailyState(info) { if (!meta.daily || meta.daily.key !== info.key) meta.daily = { key: info.key, best: 0, claimed: false }; return meta.daily; }
  function openDaily() { const info = dailyInfo(); UI.openDaily(info, dailyState(info)); AU.play('click'); }
  function startDaily() { UI.show('daily', false); const info = dailyInfo(); play({ stage: info.stage, char: info.char, seed: info.seed, mods: info.mods, daily: true }); }
  function prewarmFor(st) {
    const names = new Set(['gem1', 'gem2', 'gem3', 'heart', 'magnet', 'chest', 'tidewave', 'shell', 'pouch', 'feather', 'trash', 'burrow', 'crab', 'spoonbill', 'mudskipper']);
    for (const [, mix] of st.mix) for (const k in mix) names.add(D.ENEMIES[k].model);
    for (const ev of st.events) if (ev.e) names.add(D.ENEMIES[ev.e].model);
    names.add(D.ENEMIES[st.boss].model);
    GS.art.prewarm([...names]);
  }
  function play(o) {
    o = o || {};
    if (!o.daily && !charOk(meta.char)) { UI.toast('아직 잠겨 있어요'); AU.play('deny'); return; }
    if (!stageOk(meta.stage)) meta.stage = 1;
    AU.unlock(); AU.play('start');
    const sid = 's' + meta.stage, best = meta.best[sid];
    const endless = !o.daily && !!(meta.endless && best && best.win);
    const star = Math.min((meta.stars[sid] || 0) + 1, meta.starSel[sid] || 1);
    if (o.daily) s = SIM.newRun({ stage: o.stage, char: o.char, meta: meta.up, seed: o.seed, mods: o.mods, daily: true });
    else s = SIM.newRun({ stage: meta.stage, char: meta.char, meta: meta.up, star: endless ? 1 : star, endless });
    s.skin = meta.acc.on || null;
    prewarmFor(s.stage);
    s.view = R.view();
    mode = 'play'; paused = false; ended = false; acc = 0; snapCam = true; tipQ.length = 0; tipAt = 0;
    joyRelease();
    R.reset();
    closeModals();
    UI.showTitle(false);
    UI.showHud(true);
    AU.music('run'); AU.intensity(1);
    if (!meta.tips.move) { hintOn = true; UI.hint(true, !touchy); }
  }

  function choose(i) {
    if (!s || s.mode !== 'levelup') return;
    if (!SIM.choose(s, i)) return;
    drain(s);
    if (s.mode === 'levelup') UI.openLevelUp(s); else UI.show('levelup', false);
  }
  function reroll() { if (s && SIM.reroll(s)) { AU.play('click'); UI.openLevelUp(s); } }
  function closeChest() {
    if (!s || s.mode !== 'chest') return;
    SIM.closeChest(s);
    UI.show('chest', false);
    AU.play('pick');
    if (s.mode === 'levelup') UI.openLevelUp(s);
  }
  function pause() {
    if (mode !== 'play' || !s || s.mode !== 'play' || ended || UI.isOpen('pause')) return;
    paused = true; joyRelease();
    UI.openPause(s);
    AU.play('click');
  }
  function resume() { paused = false; UI.show('pause', false); AU.play('click'); }
  function quit() {
    if (!s) return;
    paused = false; UI.show('pause', false);
    s.quit = true; s.mode = 'dead'; s.endT = s.t;
    ended = true;
    finishRun();
  }

  function finishRun() {
    if (!s || s.finished) return;
    s.finished = true;
    const r = SIM.results(s);
    meta.pearls = (meta.pearls || 0) + r.pearls;
    meta.runs = (meta.runs || 0) + 1;
    meta.totalKills = (meta.totalKills || 0) + r.kills;
    meta.bestTime = Math.max(meta.bestTime || 0, r.time);
    const key = 's' + r.stage, b = meta.best[key] || { time: 0, carbon: 0, win: false };
    const newBest = b.carbon > 0 && r.carbon > b.carbon;
    meta.best[key] = { time: Math.max(b.time, r.time), carbon: Math.max(b.carbon, r.carbon), win: b.win || r.win };
    const firstClear = r.win && (meta.cleared || 0) < r.stage;
    if (r.win) meta.cleared = Math.max(meta.cleared || 0, r.stage);
    if (r.win) meta.stars[key] = Math.max(meta.stars[key] || 0, r.star);
    if (r.endless) meta.endlessBest[key] = Math.max(meta.endlessBest[key] || 0, r.time);
    meta.codex[r.char] = 1;
    for (const id of r.seen) meta.codex[id] = 1;
    for (const w of r.build) meta.codex[w.id] = 1;
    for (const k in r.passives) meta.codex[k] = 1;
    const unlocks = [];
    for (const ch of D.CHARS) if (ch.unlock && !meta.unlocked[ch.id] && unlockMet(ch.unlock)) { meta.unlocked[ch.id] = true; unlocks.push('새 친구 ' + ch.name); }
    if (firstClear && r.stage < D.STAGES.length) unlocks.push('새 스테이지 ' + D.STAGES[r.stage].name);
    const achs = [];
    for (const a of D.ACH) if (!meta.ach[a.id] && achMet(a, r)) { meta.ach[a.id] = 1; meta.pearls += a.reward; achs.push(a); }
    if (r.daily) {
      const ds = dailyState(dailyInfo());
      ds.best = Math.max(ds.best || 0, r.time);
      if (!ds.claimed) { const v = r.win ? 160 : 80; ds.claimed = true; meta.pearls += v; unlocks.push('오늘의 도전 +' + v); }
    }
    save();
    UI.showHud(false); UI.hint(false); hintOn = false;
    UI.openResult(s, r, { newBest, unlocks, achs });
    setTimeout(() => { if (mode === 'play' && UI.isOpen('result')) AU.music('title'); }, 1600);
  }

  function again() { UI.show('result', false); if (s && s.daily) startDaily(); else play(); }
  function home() {
    closeModals();
    mode = 'title'; s = null; ended = false; paused = false;
    UI.showHud(false);
    newDemo();
    UI.showTitle(true);
    AU.music('title');
  }
  function pickChar(d) {
    const i = Math.max(0, D.CHARS.findIndex(c => c.id === meta.char));
    meta.char = D.CHARS[(i + d + D.CHARS.length) % D.CHARS.length].id;
    save(); UI.renderTitle(); AU.play('click');
    if (charOk(meta.char)) newDemo();
  }
  function pickStage(id) {
    if (!stageOk(id)) { UI.toast(`${D.STAGES[id - 2].name} 스테이지를 먼저 깨면 열려요`); AU.play('deny'); return; }
    meta.stage = id; save(); UI.renderTitle(); AU.play('click'); newDemo();
  }
  function pickStar(k) {
    const sid = 's' + meta.stage;
    if (k > (meta.stars[sid] || 0) + 1) return;
    meta.starSel[sid] = k; meta.endless = false;
    save(); UI.renderTitle(); AU.play('click');
  }
  function buyAcc(id, btn) {
    const a = D.ACC.find(x => x.id === id);
    if (!a) return;
    if (meta.acc.owned[id]) { meta.acc.on = meta.acc.on === id ? null : id; save(); AU.play('click'); }
    else if ((meta.pearls || 0) >= a.cost) { meta.pearls -= a.cost; meta.acc.owned[id] = true; meta.acc.on = id; save(); AU.play('buy'); }
    else { AU.play('deny'); UI.toast('진주가 모자라요'); if (btn) { btn.classList.remove('deny'); void btn.offsetWidth; btn.classList.add('deny'); } return; }
    UI.renderShop(); UI.renderAcc();
  }
  function toggleEndless() { meta.endless = !meta.endless; save(); UI.renderTitle(); AU.play('click'); }
  function openShop() { UI.openShop(); AU.play('click'); }
  function closeShop() { UI.show('shop', false); if (mode === 'title') UI.renderTitle(); }
  function openCodex() { UI.openCodex(); AU.play('click'); }
  function closeCodex() { UI.show('codex', false); }
  function buy(id, btn) {
    const u = D.UPGRADES.find(x => x.id === id);
    const lv = meta.up[id] || 0;
    if (!u || lv >= u.max) return;
    const cost = u.cost[lv];
    if ((meta.pearls || 0) < cost) {
      AU.play('deny'); UI.toast('진주가 모자라요');
      if (btn) { btn.classList.remove('deny'); void btn.offsetWidth; btn.classList.add('deny'); }
      return;
    }
    meta.pearls -= cost; meta.up[id] = lv + 1;
    save(); AU.play('buy'); UI.renderShop();
  }
  function toggleSound() {
    const on = !(meta.settings.sfx || meta.settings.music);
    meta.settings.sfx = meta.settings.music = on;
    AU.set({ sfx: on, music: on });
    save(); UI.renderTitle();
    if (on) { AU.unlock(); AU.music(mode === 'title' ? 'title' : 'run'); }
  }
  function setting(key, v) {
    meta.settings[key] = v;
    if (key === 'sfx' || key === 'music') AU.set({ [key]: v });
    if (key === 'shake') R.setOpt({ shake: v });
    if (key === 'dmg') R.setOpt({ dmg: v });
    save();
  }

  // ── 반복 ─────────────────────────────────────────────
  function perf(dt) {
    if (liteSet || mode !== 'play') return;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 4) {
      if (fpsAcc / fpsN > 1 / 38) { liteSet = true; R.setOpt({ lite: true }); R.resize(); if (s) s.view = R.view(); }
      fpsAcc = 0; fpsN = 0;
    }
  }
  function loop(now) {
    root.requestAnimationFrame(loop);
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    perf(dt);
    if (mode === 'title' && demo) {
      demoAcc += dt;
      let n = 0;
      while (demoAcc >= C.DT && n < 3) {
        if (demo.mode === 'levelup') SIM.choose(demo, SIM.botChoose(demo));
        if (demo.mode === 'chest') SIM.closeChest(demo);
        if (demo.mode !== 'play') break;
        if (botN++ % 6 === 0) botInp = SIM.bot(demo);
        SIM.step(demo, C.DT, botInp);
        demoAcc -= C.DT; n++;
      }
      if (n >= 3) demoAcc = 0;
      for (const e of demo.fx) R.fx(e, demo);
      demo.fx.length = 0;
      R.frame(demo, dt, { noUi: true, snap: snapCam, camOff: { x: 0, y: R.view().hh * 0.26 } });
      snapCam = false;
      if (demo.mode === 'dead' || demo.mode === 'won' || demo.t > 300) newDemo();
      return;
    }
    if (mode === 'play' && s) {
      const t0 = prof.on ? performance.now() : 0;
      if (s.mode === 'play' && !paused) {
        acc += dt;
        let n = 0;
        while (acc >= C.DT && n < 5 && s.mode === 'play') { SIM.step(s, C.DT, inputVec()); acc -= C.DT; n++; }
        if (n >= 5) acc = 0;
        AU.intensity(s.t < 40 ? 1 : s.t < 140 ? 2 : 3);
      } else acc = 0;
      drain(s);
      if (autopilot) {
        if (s.mode === 'levelup') { choose(SIM.botChoose(s)); }
        if (s.mode === 'chest' && !$('chestOk').hidden) closeChest();
      }
      if (s.mode === 'levelup' && !UI.isOpen('levelup')) { joyRelease(); UI.openLevelUp(s); }
      if (s.mode === 'chest' && !UI.isOpen('chest')) { joyRelease(); UI.openChest(s); }
      if ((s.mode === 'dead' || s.mode === 'won') && !ended) { ended = true; endAt = now; joyRelease(); }
      if (ended && !s.finished && now - endAt > (s.mode === 'won' ? 900 : 1700)) finishRun();
      const t1 = prof.on ? performance.now() : 0;
      R.frame(s, dt, { snap: snapCam, noUi: ended });
      snapCam = false;
      const t15 = prof.on ? performance.now() : 0;
      UI.hud(s, now);
      runTips(now);
      if (prof.on) { const t2 = performance.now(); prof.sim += t1 - t0; prof.ren += t15 - t1; prof.hud = (prof.hud || 0) + t2 - t15; prof.n++; prof.dts.push(dt * 1000); }
    }
  }

  function boot(data) {
    if (data && data.char) meta.char = data.char;
    if (data && data.stage) meta.stage = data.stage;
    if (!charOk(meta.char)) meta.char = 'crab';
    if (!stageOk(meta.stage)) meta.stage = 1;
    R.init($('cv'));
    const reduced = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    R.setOpt({ reduced, shake: meta.settings.shake, dmg: meta.settings.dmg });
    AU.set({ sfx: meta.settings.sfx, music: meta.settings.music });
    UI.init({ play: () => play(), choose, reroll, closeChest, pause, resume, quit, again, home, pickChar, pickStage, pickStar, toggleEndless, openShop, closeShop, buyAcc, openDaily, startDaily,
      openCodex, closeCodex, buy, toggleSound, setting, save }, meta);
    bindInput();
    newDemo();
    UI.showTitle(true);
    const first = () => {
      AU.unlock();
      if (mode === 'title') AU.music('title');
      root.removeEventListener('pointerdown', first);
      root.removeEventListener('keydown', first);
    };
    root.addEventListener('pointerdown', first);
    root.addEventListener('keydown', first);
    root.requestAnimationFrame(loop);
  }

  // 테스트·시연용 손잡이
  const prof = { on: false, sim: 0, ren: 0, n: 0, dts: [] };
  GS.debug = {
    prof,
    get s() { return s; }, get demo() { return demo; }, get lite() { return liteSet; }, meta, save,
    autopilot(v) { autopilot = !!v; },
    ff(sec) {
      if (!s) return;
      const end = s.t + sec;
      let inp = { x: 0, y: 0 }, i = 0;
      while (s.t < end && i < 200000) {
        if (s.mode === 'levelup') { SIM.choose(s, SIM.botChoose(s)); continue; }
        if (s.mode === 'chest') { SIM.closeChest(s); continue; }
        if (s.mode !== 'play') break;
        if (i++ % 6 === 0) inp = SIM.bot(s);
        SIM.step(s, C.DT, inp);
        s.fx.length = 0;
      }
      UI.show('levelup', false); UI.show('chest', false);
    },
  };

  const hot = root.claude && root.claude.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ char: meta.char, stage: meta.stage }));
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot((hot && hot.data) || {});
})(typeof window !== 'undefined' ? window : globalThis);

// 갯벌 수호대 — 화면 위 메뉴와 표시 (글은 짧게, 그림은 크게)
(function (root) {
  'use strict';
  const GS = root.GS, U = GS.U, D = GS.DATA, C = GS.CONFIG, A = GS.art;
  const $ = id => document.getElementById(id);
  const open = {};
  let H = {}, meta = null;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function show(id, v) { const e = $(id); if (e) e.hidden = !v; open[id] = !!v; }
  function isOpen(id) { return !!open[id]; }
  const stars = n => '★'.repeat(Math.min(5, n)) + '☆'.repeat(Math.max(0, 5 - n));
  const LOCK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 9V6a4 4 0 0 1 8 0v3h1v9H5V9zm2 0h4V6a2 2 0 0 0-4 0z"/></svg>';

  function itemInfo(c) {
    if (c.k === 'w') { const d = D.WEAPONS[c.id]; return { icon: d.model, name: d.name, desc: d.d[c.lv - 1], lv: c.lv, isNew: c.lv === 1 }; }
    if (c.k === 'evo') { const d = D.WEAPONS[c.id]; return { icon: d.model, name: d.evo.name, desc: d.evo.d, evo: true }; }
    if (c.k === 'p') { const d = D.PASSIVES[c.id]; return { icon: d.model, name: d.name, desc: d.d, lv: c.lv, isNew: c.lv === 1 }; }
    if (c.k === 'heal') return { icon: 'heart', name: '회복', desc: '체력 30% 회복' };
    return { icon: 'pearl', name: '진주', desc: '진주 +25' };
  }

  // ── 시작할 때 한 번 ─────────────────────────────────────
  function init(handlers, m) {
    H = handlers; meta = m;
    const ic = (id, name, size) => { const e = $(id); if (e) e.src = A.icon(name, size || 48); };
    ic('icKill', 'skull', 40); ic('icCarbon', 'gem1', 40); ic('icPearl', 'pearl', 48); ic('icPearl2', 'pearl', 64); ic('icPearl3', 'pearl', 48);
    ic('icShop', 'chest', 56); ic('icCodex', 'seagrass', 56);
    $('charPrev').onclick = () => H.pickChar(-1);
    $('charNext').onclick = () => H.pickChar(1);
    $('playBtn').onclick = () => H.play();
    $('shopBtn').onclick = () => H.openShop();
    $('codexBtn').onclick = () => H.openCodex();
    $('soundBtn').onclick = () => H.toggleSound();
    $('pauseBtn').onclick = () => H.pause();
    $('resumeBtn').onclick = () => H.resume();
    $('quitBtn').onclick = () => H.quit();
    $('rerollBtn').onclick = () => H.reroll();
    $('chestOk').onclick = () => H.closeChest();
    $('againBtn').onclick = () => H.again();
    $('homeBtn').onclick = () => H.home();
    $('resShopBtn').onclick = () => H.openShop();
    $('shopClose').onclick = () => H.closeShop();
    $('codexClose').onclick = () => H.closeCodex();
    $('tabAlly').onclick = () => renderCodex('ally');
    $('tabFoe').onclick = () => renderCodex('foe');
    $('tabAch').onclick = () => renderCodex('ach');
  }

  // ── 타이틀 ────────────────────────────────────────────
  function charUnlocked(ch) {
    if (!ch.unlock) return true;
    return !!(meta.unlocked && meta.unlocked[ch.id]);
  }
  function stageUnlocked(id) { return id === 1 || (meta.cleared || 0) >= id - 1; }
  function renderTitle() {
    const ch = D.CHARS.find(c => c.id === meta.char) || D.CHARS[0];
    const ok = charUnlocked(ch);
    $('charImg').src = ok ? A.icon(ch.id, 192) : A.silhouette(ch.id, 192);
    $('charName').textContent = ok ? ch.name : '???';
    $('charTag').innerHTML = ok ? ch.tag + ' · ' + D.WEAPONS[ch.weapon].name : LOCK + ' ' + ch.unlock.text;
    $('charCard').classList.toggle('locked', !ok);
    $('charCard').classList.toggle('long', ok && ch.name.length > 3);
    const st = $('stages');
    st.innerHTML = '';
    for (const s of D.STAGES) {
      const unl = stageUnlocked(s.id);
      const b = el('button', 'stage' + (unl ? '' : ' locked'), `<small>${s.id}단계</small><b>${unl ? '' : LOCK}${s.name}</b>`);
      b.setAttribute('aria-pressed', String(meta.stage === s.id));
      b.onclick = () => H.pickStage(s.id);
      st.appendChild(b);
    }
    const sid = 's' + meta.stage;
    const cleared = (meta.stars && meta.stars[sid]) || 0, unl = Math.min(D.STARS.max, cleared + 1);
    const sel = Math.min(unl, (meta.starSel && meta.starSel[sid]) || 1);
    const mods = $('mods');
    mods.innerHTML = '';
    for (let k = 1; k <= D.STARS.max; k++) {
      const b = el('button', 'star', '★' + (k > 1 ? k : ''));
      b.setAttribute('aria-label', `난이도 별 ${k}개`);
      b.setAttribute('aria-pressed', String(k === sel && !meta.endless));
      b.disabled = k > unl;
      b.onclick = () => H.pickStar(k);
      mods.appendChild(b);
    }
    const best = meta.best && meta.best[sid];
    if (best && best.win) {
      const e = el('button', 'endless', '무한');
      e.setAttribute('aria-pressed', String(!!meta.endless));
      e.onclick = () => H.toggleEndless();
      mods.appendChild(e);
    }
    const play = $('playBtn');
    play.disabled = !ok;
    play.textContent = ok ? (meta.endless && best && best.win ? '무한 출동!' : '출동!') : '잠겨 있어요';
    const eb = meta.endlessBest && meta.endlessBest[sid];
    $('best').textContent = meta.endless && best && best.win ? (eb ? `무한 최고 ${U.fmtTime(eb)}` : '보스가 계속 나와요. 얼마나 버틸까요?')
      : best ? `최고 ${U.fmtTime(best.time)} · ${U.fmtNum(best.carbon)}t${cleared ? ' · ★' + cleared + ' 클리어' : ''}` : '';
    $('pearls').textContent = U.fmtNum(meta.pearls || 0);
    const snd = meta.settings.sfx || meta.settings.music;
    $('soundBtn').setAttribute('aria-pressed', String(snd));
    $('soundLabel').textContent = snd ? '소리 켬' : '소리 끔';
  }
  function showTitle(v) { show('title', v); if (v) renderTitle(); }

  // ── 게임 중 표시 ───────────────────────────────────────
  const hs = { lv: -1, xp: -1, sec: -1, kills: -1, carbon: -1, carbonT: 0, slots: '', boss: false, bossHp: -1 };
  function resetHud() { hs.lv = hs.xp = hs.sec = hs.kills = hs.carbon = hs.bossHp = -1; hs.slots = ''; hs.boss = false; $('bossbar').hidden = true; $('alert').hidden = true; $('tip').hidden = true; }
  function hud(s, now) {
    const p = s.p;
    const q = U.clamp(p.xp / p.xpNext, 0, 1);
    if (Math.abs(q - hs.xp) > 0.003) { $('xpFill').style.transform = `scaleX(${q.toFixed(3)})`; hs.xp = q; }
    if (p.level !== hs.lv) {
      $('lvBadge').textContent = p.level;
      if (hs.lv > 0) { const x = document.querySelector('.xp'); x.classList.remove('flash'); void x.offsetWidth; x.classList.add('flash'); }
      hs.lv = p.level;
    }
    const sec = Math.floor(s.t);
    if (sec !== hs.sec) { $('clock').textContent = U.fmtTime(s.t); $('clock').classList.toggle('dusk', s.t > s.stage.bossAt * 0.7); hs.sec = sec; }
    if (s.kills !== hs.kills) { $('kills').textContent = U.fmtNum(s.kills); hs.kills = s.kills; }
    const c = Math.round(s.carbon);
    if (c !== hs.carbon && now - hs.carbonT > 150) {
      const cnt = $('carbon').parentElement;
      if (c > hs.carbon + 20 && hs.carbon >= 0) { cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump'); }
      $('carbon').textContent = U.fmtNum(c); hs.carbon = c; hs.carbonT = now;
    }
    const key = s.weapons.map(w => w.id + w.lv + (w.evo ? 'e' : '')).join(',') + '|' + Object.keys(s.passives).map(k => k + s.passives[k]).join(',');
    if (key !== hs.slots) {
      hs.slots = key;
      const box = $('slots');
      box.innerHTML = '';
      const rw = el('div', 'srow'), rp = el('div', 'srow');
      for (const w of s.weapons) rw.appendChild(el('span', 'slot' + (w.evo ? ' evo' : ''), `<img src="${A.icon(D.WEAPONS[w.id].model, 48)}" alt="${D.WEAPONS[w.id].name}"><i>${w.evo ? '★' : w.lv}</i>`));
      for (const k in s.passives) rp.appendChild(el('span', 'slot p', `<img src="${A.icon(D.PASSIVES[k].model, 48)}" alt="${D.PASSIVES[k].name}"><i>${s.passives[k]}</i>`));
      box.appendChild(rw);
      if (rp.childNodes.length) box.appendChild(rp);
    }
    const b = s.boss;
    if (!!b !== hs.boss) {
      hs.boss = !!b;
      $('bossbar').hidden = !b;
      if (b) $('bossName').textContent = b.def.name;
    }
    if (b) {
      const r = U.clamp(b.hp / b.maxHp, 0, 1);
      if (Math.abs(r - hs.bossHp) > 0.002) { $('bossFill').style.transform = `scaleX(${r.toFixed(3)})`; hs.bossHp = r; }
    }
  }
  function showHud(v) { show('hud', v); if (v) resetHud(); }

  let alertT = 0;
  function alert(text, cls, sub) {
    const a = $('alert');
    a.hidden = false;
    a.className = 'alert ' + (cls || '');
    a.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    a.style.animation = 'none'; void a.offsetWidth; a.style.animation = '';
    clearTimeout(alertT);
    alertT = setTimeout(() => { a.hidden = true; }, 1900);
  }
  let tipT = 0;
  function tip(key, text, force) {
    meta.tips = meta.tips || {};
    if (!force && meta.tips[key]) return;
    meta.tips[key] = 1;
    H.save();
    const t = $('tip');
    t.hidden = false; t.textContent = text;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(tipT);
    tipT = setTimeout(() => { t.hidden = true; }, 4300);
  }
  let toastT = 0;
  function toast(text) {
    const t = $('toast');
    t.hidden = false; t.textContent = text;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2500);
  }
  function hint(v, desktop) {
    $('hint').hidden = !v;
    if (v) $('hintText').textContent = desktop ? '드래그 또는 WASD로 이동' : '드래그해서 이동';
  }

  function fx(e) {
    switch (e.k) {
      case 'alert':
        if (e.id === 'ring') alert('포위!', 'red');
        else if (e.id === 'elite') alert('거대 ' + D.ENEMIES[e.e].name + '!', 'gold', '쓰러뜨리면 보물 상자');
        else if (e.id === 'swarm') alert('미세플라스틱 떼!', 'pink');
        else if (e.id === 'storm') alert('태풍!', 'blue', '번개가 오염 몬스터를 쳐요');
        else if (e.id === 'rage') alert('분노!', 'red');
        break;
      case 'boss': alert(D.ENEMIES[e.type].name, 'red', '갯벌을 지켜요!'); break;
      case 'evo': alert('진화!', 'pink', D.WEAPONS[e.id].evo.name); break;
      case 'revive': alert('부활!', 'green'); break;
      case 'bosskill': alert('갯벌을 지켰어요!', 'green'); break;
    }
  }

  // ── 레벨 업 ───────────────────────────────────────────
  function openLevelUp(s) {
    const cards = $('cards');
    cards.innerHTML = '';
    cards.className = 'cards' + (s.choices.length === 4 ? ' n4' : '');
    $('lvNum').textContent = 'Lv ' + (s.p.level - s.pendingLv + 1);
    s.choices.forEach((c, i) => {
      const info = itemInfo(c);
      const b = el('button', 'card arming' + (info.evo ? ' evo' : ''));
      b.innerHTML = `<img src="${A.icon(info.icon, 96)}" alt=""><span class="c-body"><b class="c-name">${info.name}</b>` +
        (info.lv ? `<span class="c-lv" aria-label="${info.lv}단계">${stars(info.lv)}</span>` : '') +
        `<span class="c-desc">${info.desc}</span></span>` +
        (info.evo ? '<span class="badge">진화</span>' : info.isNew ? '<span class="badge">NEW</span>' : '');
      b.addEventListener('click', () => H.choose(i));
      cards.appendChild(b);
    });
    setTimeout(() => cards.querySelectorAll('.card').forEach(b => b.classList.remove('arming')), 420);
    $('rerollBtn').hidden = !(s.p.rerolls > 0);
    $('rerolls').textContent = s.p.rerolls;
    show('levelup', true);
  }

  // ── 보물 상자 ─────────────────────────────────────────
  let chestT = 0;
  function openChest(s) {
    const box = $('chest').querySelector('.chest-box');
    box.className = 'chest-box shake';
    $('chestImg').src = A.icon('chest', 160, 0);
    const list = $('chestItems');
    list.innerHTML = '';
    $('chestOk').hidden = true;
    show('chest', true);
    const items = (s.chestItems || []).slice();
    clearTimeout(chestT);
    chestT = setTimeout(() => {
      box.className = 'chest-box open';
      $('chestImg').src = A.icon('chest', 160, 1);
      items.forEach((c, i) => {
        const info = itemInfo(c);
        const d = el('div', 'ci', `<img src="${A.icon(info.icon, 64)}" alt=""><span>${info.name}</span><small>${info.evo ? '진화!' : info.lv ? 'Lv ' + info.lv : ''}</small>`);
        d.style.animationDelay = (i * 0.14) + 's';
        list.appendChild(d);
      });
      $('chestOk').hidden = false;
    }, 950);
  }

  // ── 일시정지 ──────────────────────────────────────────
  function toggleRow(label, key) {
    const b = el('button', 'tg', `<span>${label}</span><i aria-hidden="true"></i>`);
    b.setAttribute('aria-pressed', String(!!meta.settings[key]));
    b.onclick = () => { H.setting(key, !meta.settings[key]); b.setAttribute('aria-pressed', String(!!meta.settings[key])); };
    return b;
  }
  function openPause(s) {
    const b = $('pauseBuild');
    b.innerHTML = '';
    for (const w of s.weapons) b.appendChild(el('div', 'b' + (w.evo ? ' evo' : ''), `<img src="${A.icon(D.WEAPONS[w.id].model, 64)}" alt=""><span>${w.evo ? D.WEAPONS[w.id].evo.name : D.WEAPONS[w.id].name}</span><span>${w.evo ? '진화' : 'Lv ' + w.lv}</span>`));
    for (const k in s.passives) b.appendChild(el('div', 'b', `<img src="${A.icon(D.PASSIVES[k].model, 64)}" alt=""><span>${D.PASSIVES[k].name}</span><span>Lv ${s.passives[k]}</span>`));
    const t = $('toggles');
    t.innerHTML = '';
    t.append(toggleRow('효과음', 'sfx'), toggleRow('음악', 'music'), toggleRow('화면 흔들림', 'shake'), toggleRow('피해 숫자', 'dmg'));
    show('pause', true);
  }

  // ── 결과 ─────────────────────────────────────────────
  function drawMini(canvas, tiles) {
    const src = GS.render.minimap(tiles, 3);
    canvas.width = src.width; canvas.height = src.height;
    canvas.getContext('2d').drawImage(src, 0, 0);
  }
  let countT = 0;
  function openResult(s, r, extra) {
    const panel = $('result').querySelector('.panel');
    panel.classList.toggle('win', r.win);
    $('resTitle').textContent = r.win ? '갯벌을 지켰어요!' : r.endless ? `${U.fmtTime(r.time)} 버텼어요` : s.quit ? '여기까지!' : '쓰러졌어요';
    const stage = D.STAGES.find(x => x.id === r.stage);
    const tag = r.endless ? `무한 · 보스 ${r.bossKills}마리` : '★' + r.star;
    $('resSub').textContent = r.win ? `${stage.name} ${tag} 클리어` : r.killedBy && D.ENEMIES[r.killedBy] ? `${tag} · ${D.ENEMIES[r.killedBy].name}에게 당했어요` : `${stage.name} ${tag}`;
    drawMini($('mapBefore'), s.map.tiles0);
    drawMini($('mapAfter'), s.map.tiles);
    $('resPct').textContent = '복원 ' + Math.round(r.restored * 100) + '%';
    const st = $('resStats');
    st.innerHTML = '';
    const add = (v, l, cls) => st.appendChild(el('div', 'st' + (cls ? ' ' + cls : ''), `<b>${v}</b><span>${l}</span>`));
    add(U.fmtTime(r.time), '시간'); add('Lv ' + r.level, '레벨'); add(U.fmtNum(r.kills), '처치'); add(U.fmtNum(r.carbon) + 't', '블루카본', 'c');
    $('newBest').hidden = !extra.newBest;
    const un = $('resUnlock');
    const lines = extra.unlocks.concat((extra.achs || []).map(a => `업적 ${a.name} +${a.reward}`));
    un.hidden = !lines.length;
    un.textContent = lines.join(' · ');
    let key = r.killedBy && D.FACTS[r.killedBy] ? r.killedBy : r.mvp && D.FACTS[r.mvp] ? r.mvp : r.char;
    if (r.win) key = s.stage.boss;
    if (Math.random() < 0.15) key = 'getbol';
    const factIcon = key === 'getbol' ? 'mudblock' : D.WEAPONS[key] ? D.WEAPONS[key].model : D.ENEMIES[key] ? D.ENEMIES[key].model : key;
    $('factImg').src = A.icon(factIcon, 64);
    $('factText').textContent = D.FACTS[key] || D.FACTS.getbol;
    const out = $('resPearls');
    let v = 0;
    clearInterval(countT);
    const stepN = Math.max(1, Math.round(r.pearls / 30));
    countT = setInterval(() => { v = Math.min(r.pearls, v + stepN); out.textContent = U.fmtNum(v); if (v >= r.pearls) clearInterval(countT); }, 30);
    show('result', true);
    setTimeout(() => $('againBtn').focus({ preventScroll: true }), 50);
  }

  // ── 기지 (영구 강화) ───────────────────────────────────
  function renderShop() {
    $('shopPearls').textContent = U.fmtNum(meta.pearls || 0);
    const g = $('shopGrid');
    g.innerHTML = '';
    for (const u of D.UPGRADES) {
      const lv = (meta.up && meta.up[u.id]) || 0, max = lv >= u.max, cost = max ? 0 : u.cost[lv];
      const b = el('button', 'up' + (max ? ' max' : meta.pearls < cost ? ' poor' : ''));
      b.dataset.id = u.id;
      let pips = '';
      for (let i = 0; i < u.max; i++) pips += `<i class="${i < lv ? 'on' : ''}"></i>`;
      b.innerHTML = `<img src="${A.icon(u.icon, 64)}" alt=""><b>${u.name}</b><span class="pips">${pips}</span><small>${u.d}</small>` +
        (max ? '<span class="cost">MAX</span>' : `<span class="cost"><img src="${A.icon('pearl', 32)}" alt="진주">${U.fmtNum(cost)}</span>`);
      b.onclick = () => H.buy(u.id, b);
      g.appendChild(b);
    }
  }
  function openShop() { renderShop(); show('shop', true); }

  // ── 도감 ─────────────────────────────────────────────
  let codexTab = 'ally';
  function codexEntries(tab) {
    if (tab === 'ally') {
      return [
        ...D.CHARS.map(c => ({ id: c.id, name: c.name, icon: c.id })),
        ...Object.keys(D.WEAPONS).filter(k => !D.CHARS.some(c => c.weapon === k && c.id === D.WEAPONS[k].model)).map(k => ({ id: k, name: D.WEAPONS[k].name, icon: D.WEAPONS[k].model })),
        ...Object.keys(D.PASSIVES).map(k => ({ id: k, name: D.PASSIVES[k].name, icon: D.PASSIVES[k].model })),
      ];
    }
    return Object.keys(D.ENEMIES).map(k => ({ id: k, name: D.ENEMIES[k].name, icon: D.ENEMIES[k].model }));
  }
  function renderAch() {
    const box = $('achList');
    box.innerHTML = '';
    const done = meta.ach || {};
    for (const a of D.ACH) box.appendChild(el('div', 'ach' + (done[a.id] ? ' done' : ''), `<b>${a.name}</b><span>${a.d}</span><em>${done[a.id] ? '달성' : '+' + a.reward}</em>`));
    $('codexCount').textContent = `${D.ACH.filter(a => done[a.id]).length} / ${D.ACH.length}`;
  }
  function renderCodex(tab) {
    codexTab = tab || codexTab;
    $('tabAlly').setAttribute('aria-selected', String(codexTab === 'ally'));
    $('tabFoe').setAttribute('aria-selected', String(codexTab === 'foe'));
    $('tabAch').setAttribute('aria-selected', String(codexTab === 'ach'));
    const isAch = codexTab === 'ach';
    $('achList').hidden = !isAch; $('codexGrid').hidden = isAch; $('codexDetail').hidden = isAch;
    if (isAch) { renderAch(); return; }
    const list = codexEntries(codexTab);
    const seen = meta.codex || {};
    const all = codexEntries('ally').concat(codexEntries('foe'));
    $('codexCount').textContent = `${all.filter(e => seen[e.id]).length} / ${all.length}`;
    const g = $('codexGrid');
    g.innerHTML = '';
    const pick = (e, b) => {
      g.querySelectorAll('.cx').forEach(x => x.setAttribute('aria-pressed', 'false'));
      if (b) b.setAttribute('aria-pressed', 'true');
      const known = !!seen[e.id];
      $('cdImg').src = known ? A.icon(e.icon, 96) : A.silhouette(e.icon, 96);
      $('cdName').textContent = known ? e.name : '???';
      $('cdText').textContent = known ? (D.FACTS[e.id] || '') : '게임에서 만나면 알 수 있어요.';
    };
    let first = null;
    for (const e of list) {
      const known = !!seen[e.id];
      const b = el('button', 'cx', `<img src="${known ? A.icon(e.icon, 64) : A.silhouette(e.icon, 64)}" alt=""><span>${known ? e.name : '???'}</span>`);
      b.setAttribute('aria-pressed', 'false');
      b.onclick = () => pick(e, b);
      g.appendChild(b);
      if (!first && known) first = [e, b];
    }
    if (first) pick(first[0], first[1]); else pick(list[0], g.firstChild);
  }
  function openCodex() { renderCodex(); show('codex', true); }

  GS.ui = {
    init, show, isOpen, showTitle, renderTitle, showHud, hud, fx, alert, tip, toast, hint,
    openLevelUp, openChest, openPause, openResult, openShop, renderShop, openCodex, itemInfo,
  };
})(typeof window !== 'undefined' ? window : globalThis);

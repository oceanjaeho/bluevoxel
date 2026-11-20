/*
 * 블루복셀 — 화면(UI) v0.2: 글은 짧게, 정보는 아이콘과 숫자로
 */
(function (BV) {
  'use strict';

  var C = BV.CONFIG;
  var el = {};
  var H = {};
  var SP = {}, ACH = {}, MIS = {};
  BV.SPECIES.forEach(function (s) { SP[s.id] = s; });
  BV.ACHIEVEMENTS.forEach(function (a) { ACH[a.id] = a; });
  BV.MISSIONS.forEach(function (m) { MIS[m.id] = m; });
  var spriteCache = {};
  var modalClosable = false, modalOnClose = null;
  var toastTimer = 0, hintTimer = 0, lastTab = '', prevHud = null;
  var revealResolve = null;
  var CAR_T = 2.4;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n, d) { d = d || 0; return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }); }
  function signed(n, d) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), d); }
  function josa(word, a, b) { var c = word.charCodeAt(word.length - 1); return word + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0) ? a : b); }
  function play(n) { if (BV.audio) BV.audio.play(n); }

  function sprite(id, px, cls) {
    if (!BV.SPRITES[id]) return '';
    if (!spriteCache[id]) {
      var rows = BV.SPRITES[id];
      var c = document.createElement('canvas');
      c.width = c.height = 12;
      var g = c.getContext('2d');
      for (var y = 0; y < 12; y++) for (var x = 0; x < 12; x++) {
        var ch = rows[y][x];
        if (ch !== '.' && BV.PALETTE[ch]) { g.fillStyle = BV.PALETTE[ch]; g.fillRect(x, y, 1, 1); }
      }
      spriteCache[id] = c.toDataURL();
    }
    return '<img class="px' + (cls ? ' ' + cls : '') + '" src="' + spriteCache[id] + '" width="' + px + '" height="' + px + '" alt="">';
  }

  var FX_ICON = { budget: 'i_coin', yearly: 'i_coin', support: 'i_heart', cut: 'i_cloud', wq: 'i_drop', eco: 'i_leaf',
    shield: 'i_shield', debris: 'i_trash', life: 'i_bird', tech: 'i_tool', warn: 'i_warn' };
  function fxChip(f) {
    var k = f[0], v = f[1], txt = String(v), cls = '';
    if (k === 'budget') { txt = (v > 0 ? '+' : '−') + Math.abs(v) + '억'; cls = v > 0 ? 'pos' : 'neg'; }
    else if (k === 'support') { txt = '지지 ' + (v > 0 ? '+' : '−') + Math.abs(v); cls = v > 0 ? 'pos' : 'neg'; }
    else if (k === 'cut') { txt = '배출 −' + v + '%'; cls = 'pos'; }
    else if (k === 'wq') { txt = '수질 ' + v; cls = /[−-]/.test(txt) ? 'neg' : 'pos'; }
    else if (k === 'warn') cls = 'warn';
    else if (k === 'yearly') cls = 'pos';
    return '<span class="fx ' + cls + '">' + sprite(FX_ICON[k] || 'i_leaf', 14) + esc(txt) + '</span>';
  }
  function fxText(fx) { return (fx || []).map(function (f) { return String(f[1]); }).join(', '); }

  /* ---------- 초기화 ---------- */
  function init(handlers) {
    H = handlers;
    ['app', 'hudYear', 'stats', 'tools', 'panel', 'panelBody', 'modal', 'modalCard', 'toast', 'hint', 'hintText', 'hintClose',
      'legend', 'tideFill', 'tideState', 'tideBtn', 'nextBtn', 'nextLabel', 'codexCount', 'panelToggle', 'helpBtn', 'menuBtn',
      'soundBtn', 'peek', 'peekText', 'missions', 'banner', 'screen', 'toastTop', 'confetti'].forEach(function (id) { el[id] = $(id); });

    el.tools.addEventListener('click', function (e) { var b = e.target.closest('[data-tool]'); if (b) H.onTool(b.getAttribute('data-tool')); });
    document.querySelectorAll('[role="tab"]').forEach(function (b) { b.addEventListener('click', function () { H.onTab(b.getAttribute('data-tab')); }); });
    el.panelBody.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (a && !a.disabled) H.onAct(a.getAttribute('data-act'), +a.getAttribute('data-i'));
    });
    el.panelToggle.addEventListener('click', function () { togglePanel(); });
    el.peek.addEventListener('click', function () { expandPanel(); });
    el.hintClose.addEventListener('click', function () { hint(null); });
    el.nextBtn.addEventListener('click', function () { H.onNext(); });
    el.helpBtn.addEventListener('click', function () { play('click'); showHelp(); });
    el.menuBtn.addEventListener('click', function () { play('click'); H.onMenu(); });
    el.soundBtn.addEventListener('click', function () { H.onSoundToggle(); });
    el.tideBtn.addEventListener('click', function () {
      var p = el.tideBtn.getAttribute('aria-pressed') !== 'true';
      el.tideBtn.setAttribute('aria-pressed', String(p));
      el.tideBtn.setAttribute('aria-label', p ? '물때 다시 움직이기' : '물때 멈추기');
      el.tideBtn.textContent = p ? '▶' : 'Ⅱ';
      H.onTidePause(p);
    });
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('[data-view]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        H.onView(b.getAttribute('data-view'));
        legend(b.getAttribute('data-view'));
        play('click');
      });
    });
    document.querySelectorAll('[data-zoom]').forEach(function (b) { b.addEventListener('click', function () { H.onZoom(b.getAttribute('data-zoom')); }); });
    el.modal.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-opt]');
      if (opt && !opt.disabled) { choose(+opt.getAttribute('data-opt'), opt); return; }
      var a = e.target.closest('[data-ui]');
      if (a) { H.onUi(a.getAttribute('data-ui'), a); return; }
      if (e.target === el.modal && modalClosable) closeModal();
    });
    el.screen.addEventListener('click', function (e) { var a = e.target.closest('[data-ui]'); if (a) H.onUi(a.getAttribute('data-ui'), a); });
    el.banner.addEventListener('click', function () { if (revealResolve) revealResolve(); });
    el.missions.addEventListener('click', function () { el.missions.classList.toggle('open'); });
  }

  /* ---------- 타이틀 ---------- */
  function setTitleMode(on) {
    document.body.classList.toggle('title-mode', !!on);
    el.screen.hidden = !on;
  }
  function renderTitle(o) {
    var best = o.best ? '<p class="best">최고 기록 · ' + esc(o.best) + '</p>' : '';
    el.screen.innerHTML =
      '<div class="title-wrap">' +
      '<p class="logo"><span class="logo-blue">BLUE</span> <span class="logo-voxel">VOXEL</span></p>' +
      '<h1 class="title-ko">블루복셀 <em>갯벌마을 2050</em></h1>' +
      '<p class="tagline">갯벌을 살리면, 탄소가 잠든다.</p>' +
      '<div class="menu-main">' +
      (o.canContinue ? '<button type="button" class="btn primary big" data-ui="continue">이어하기</button><button type="button" class="btn big" data-ui="new">새 게임</button>'
        : '<button type="button" class="btn primary big" data-ui="new">게임 시작</button>') +
      '</div>' +
      '<div class="menu-sub">' +
      '<button type="button" class="chip-btn" data-ui="achievements">' + sprite('i_star', 16) + '업적 ' + o.achCount + '/' + BV.ACHIEVEMENTS.length + '</button>' +
      '<button type="button" class="chip-btn" data-ui="teacher">' + sprite('i_book', 16) + '교사용 학급 리포트</button>' +
      '<button type="button" class="chip-btn" data-ui="settings">' + sprite('i_tool', 16) + '설정</button>' +
      '<button type="button" class="chip-btn" data-ui="credits">' + sprite('i_leaf', 16) + '정보</button>' +
      '</div>' + best +
      '<p class="fine">설치·로그인 없음 · 개인정보 수집 없음 · v' + BV.VERSION + '</p>' +
      '</div>';
  }

  function showSetup(o) {
    var diffs = Object.keys(BV.DIFFICULTY).map(function (k) {
      var d = BV.DIFFICULTY[k];
      return '<button type="button" class="diff' + (k === o.diff ? ' on' : '') + '" data-ui="diff" data-diff="' + k + '" aria-pressed="' + (k === o.diff) + '">' +
        '<b>' + d.name + '</b><span>' + d.sub + '</span></button>';
    }).join('');
    openModal('<p class="eyebrow">새 게임</p><h2 id="modalTitle">어떤 바다로 갈까요?</h2>' +
      '<div class="diffs">' + diffs + '</div>' +
      '<div class="field"><label for="codeInput">수업 코드 (선택)</label><input id="codeInput" type="text" maxlength="12" autocomplete="off" spellcheck="false" value="' + esc(o.code || '') + '" placeholder="' + C.DEFAULT_CODE + '"></div>' +
      '<p class="fine">같은 코드면 같은 사건이 같은 순서로 일어나요.</p>' +
      '<div class="btn-row"><button type="button" class="btn primary big" data-ui="start">출발!</button><button type="button" class="btn" data-ui="close">취소</button></div>',
    { closable: true });
  }

  function showSettings(st) {
    function row(key, label, on) {
      return '<button type="button" class="toggle" data-ui="set" data-key="' + key + '" aria-pressed="' + !!on + '"><span>' + label + '</span><i></i></button>';
    }
    openModal('<p class="eyebrow">설정</p><h2 id="modalTitle">소리와 화면</h2><div class="toggles">' +
      row('sfx', '효과음', st.sfx) + row('music', '배경 음악·파도', st.music) + row('fx', '화려한 효과', st.fx) + row('fast', '연말 결산 빠르게', st.fast) +
      '</div><div class="btn-row"><button type="button" class="btn primary" data-ui="close">닫기</button></div>', { closable: true });
  }

  function showAchievements(meta) {
    var got = meta.ach || {};
    openModal('<p class="eyebrow">업적</p><h2 id="modalTitle">' + Object.keys(got).length + ' / ' + BV.ACHIEVEMENTS.length + '</h2><div class="ach-grid">' +
      BV.ACHIEVEMENTS.map(function (a) {
        var on = !!got[a.id];
        return '<div class="ach' + (on ? ' on' : '') + '">' + sprite(on ? a.icon : 'i_lock', 32) + '<b>' + a.name + '</b><span>' + a.desc + '</span></div>';
      }).join('') + '</div><div class="btn-row"><button type="button" class="btn primary" data-ui="close">닫기</button></div>', { closable: true, wide: true });
  }

  function showCredits() {
    openModal('<p class="eyebrow">정보</p><h2 id="modalTitle">블루복셀 v' + BV.VERSION + '</h2>' +
      '<ul class="plain">' +
      '<li>' + sprite('i_shield', 16) + '개인정보를 모으지 않아요. 기록은 이 기기에만 저장돼요.</li>' +
      '<li>' + sprite('i_leaf', 16) + '흡수 수치: IPCC 2013 습지 지침 기본값, 국내 갯벌 연구(2021)</li>' +
      '<li>' + sprite('i_warn', 16) + '마을 배출·예산·생물 조건은 학습용 가상값이에요.</li>' +
      '<li>' + sprite('i_book', 16) + '글꼴: Do Hyeon, Gowun Dodum, IBM Plex Mono (OFL)</li>' +
      '</ul><div class="btn-row"><button type="button" class="btn primary" data-ui="close">닫기</button></div>', { closable: true });
  }

  function showHelp() {
    openModal('<p class="eyebrow">게임 방법</p><h2 id="modalTitle">1년 = 1턴</h2><ol class="steps">' +
      '<li>' + sprite('mayor', 36) + '<b>고르기</b><span>마을 회의에서 결정</span></li>' +
      '<li>' + sprite('marsh', 36) + '<b>바꾸기</b><span>도구로 갯벌 살리기</span></li>' +
      '<li>' + sprite('i_cloud', 36) + '<b>결산</b><span>탄소·생물·살림 확인</span></li>' +
      '</ol><p class="fine">누르기 = 선택 · 끌기 = 이동 · 두 손가락/휠 = 확대 · 키 1~8 도구, N 다음 해</p>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-ui="close">알겠어요</button></div>', { closable: true });
  }

  /* ---------- 교사용 학급 리포트 ---------- */
  function showTeacher(sampleText) {
    openModal('<p class="eyebrow">교사용</p><h2 id="modalTitle">학급 리포트</h2>' +
      '<p class="fine">학생들이 엔딩에서 복사한 결과 코드(BV1-…)를 한꺼번에 붙여 넣으세요.</p>' +
      '<div class="teacher-in"><input id="clsInput" type="text" maxlength="12" placeholder="수업 코드(선택)" autocomplete="off">' +
      '<textarea id="codesInput" rows="5" placeholder="BV1-XXXXX-XXXXX-…">' + esc(sampleText || '') + '</textarea></div>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-ui="analyze">분석하기</button>' +
      '<button type="button" class="btn" data-ui="sample">예시 데이터</button><button type="button" class="btn" data-ui="close">닫기</button></div>' +
      '<div id="teacherOut"></div>', { closable: true, wide: true });
  }
  function renderTeacher(rows, info) {
    var out = $('teacherOut');
    if (!out) return;
    if (!rows.length) { out.innerHTML = '<p class="fine">읽을 수 있는 결과 코드가 없어요.</p>'; return; }
    var n = rows.length;
    var avgN = Math.round(rows.reduce(function (a, r) { return a + r.neutrality; }, 0) / n * 100);
    var avgS = (rows.reduce(function (a, r) { return a + r.species; }, 0) / n).toFixed(1);
    var best = rows.filter(function (r) { return r.ending === 'bluecarbon'; }).length;
    var endCount = {};
    rows.forEach(function (r) { endCount[r.ending] = (endCount[r.ending] || 0) + 1; });
    var bars = BV.sim.ENDING_KEYS.map(function (k) {
      var c = endCount[k] || 0;
      return '<div class="hbar"><span>' + BV.ENDINGS[k].title + '</span><i><em style="width:' + Math.round(c / n * 100) + '%"></em></i><b>' + c + '</b></div>';
    }).join('');
    var KEY = ['industry', 'ponds', 'protect', 'slr'];
    var dec = KEY.map(function (id) {
      var card = BV.CARDS[id];
      var cnt = card.options.map(function () { return 0; });
      var tot = 0;
      rows.forEach(function (r) { var o = r.choices[id]; if (o >= 0 && o < cnt.length) { cnt[o]++; tot++; } });
      return '<div class="dec"><b>' + card.title + '</b>' + card.options.map(function (o, k) {
        var pc = tot ? Math.round(cnt[k] / tot * 100) : 0;
        return '<div class="hbar"><span>' + o.label + '</span><i><em style="width:' + pc + '%"></em></i><b>' + pc + '%</b></div>';
      }).join('') + '</div>';
    }).join('');
    var list = rows.slice().sort(function (a, b) { return b.neutrality - a.neutrality; }).map(function (r, k) {
      return '<tr><td>' + (k + 1) + '</td><td>' + BV.ENDINGS[r.ending].title + '</td><td class="num">' + Math.round(r.neutrality * 100) + '%</td><td class="num">' + r.species + '</td><td class="num">' + r.support + '</td><td class="num">' + BV.DIFFICULTY[r.diff].name + '</td></tr>';
    }).join('');
    out.innerHTML =
      '<div class="kpis"><div><span>참여</span><b>' + n + '명</b></div><div><span>평균 탄소중립</span><b>' + avgN + '%</b></div>' +
      '<div><span>평균 생물</span><b>' + avgS + '종</b></div><div><span>블루카본 마을</span><b>' + Math.round(best / n * 100) + '%</b></div></div>' +
      (info ? '<p class="fine">' + esc(info) + '</p>' : '') +
      '<h3 class="sub-h">엔딩 분포</h3>' + bars +
      '<h3 class="sub-h">주요 회의 선택</h3><div class="decs">' + dec + '</div>' +
      '<details class="more"><summary>학생별 결과</summary><div class="table-wrap"><table><thead><tr><th>#</th><th>엔딩</th><th>탄소중립</th><th>생물</th><th>지지도</th><th>난이도</th></tr></thead><tbody>' + list + '</tbody></table></div></details>' +
      '<div class="btn-row"><button type="button" class="btn" data-ui="csv">표 복사(CSV)</button></div>';
  }

  /* ---------- HUD ---------- */
  function renderHUD(S) {
    var m = BV.sim.metrics(S);
    var yr = Math.min(S.year, C.END_YEAR);
    el.hudYear.innerHTML = '<b>' + yr + '</b><span>' + (S.ended ? '총회' : (yr - C.START_YEAR + 1) + '/25') + '</span>';
    var neut = Math.round(m.neutrality * 100);
    var vals = { budget: S.budget, neutral: neut, life: S.present.length, support: S.support, wq: Math.round(S.wq), stock: Math.round(m.ecoStock) };
    var items = [
      ['budget', 'i_coin', '예산', fmt(S.budget, 1) + '<small>억</small>', S.budget < 0],
      ['neutral', 'i_cloud', '탄소중립', neut + '<small>%</small>', false, neut],
      ['life', 'i_bird', '생물', S.present.length + '<small>/12</small>'],
      ['support', 'i_heart', '지지도', S.support + '', S.support < 30],
      ['wq', 'i_drop', '수질', Math.round(S.wq) + '', S.wq < 40, null, true],
      ['stock', 'i_leaf', '블루카본', fmt(m.ecoStock) + '<small>t</small>', false, null, true]
    ];
    el.stats.innerHTML = items.map(function (it) {
      return '<div class="stat' + (it[6] ? ' opt' : '') + (it[4] ? ' warn' : '') + '" data-k="' + it[0] + '">' + sprite(it[1], 18, 'si') +
        '<span class="sv"><span class="k">' + it[2] + '</span><span class="v">' + it[3] + '</span>' +
        (it[5] !== undefined && it[5] !== null ? '<span class="meter"><i style="width:' + Math.min(100, Math.max(0, it[5])) + '%"></i></span>' : '') + '</span></div>';
    }).join('');
    if (prevHud) {
      Object.keys(vals).forEach(function (k) {
        var d = vals[k] - prevHud[k];
        if (k === 'stock' || Math.abs(d) < (k === 'budget' ? 0.05 : 1)) return;
        var node = el.stats.querySelector('[data-k="' + k + '"]');
        if (!node) return;
        node.classList.add(d > 0 ? 'up' : 'down');
        var b = document.createElement('span');
        b.className = 'delta ' + (d > 0 ? 'up' : 'down');
        b.textContent = (d > 0 ? '+' : '−') + fmt(Math.abs(d), k === 'budget' ? 1 : 0);
        node.appendChild(b);
      });
    }
    prevHud = vals;
    el.codexCount.textContent = S.present.length + '/12';
  }
  function resetHud() { prevHud = null; }

  function renderTools(S, tool, coach) {
    el.tools.innerHTML = BV.TOOLS.map(function (t) {
      var cost = BV.sim.toolCost(S, t.id, null);
      var costTxt = t.id === 'inspect' ? '' : cost < 0 ? '+' + (-cost) + '억' : cost === 0 ? '무료' : cost + '억';
      if (t.id === 'restore' && S.policies.pond === 'restore') costTxt = '2~4억';
      var locked = t.id === 'develop' && S.policies.protect === 'mpa';
      var poor = cost > 0 && S.budget < cost;
      return '<button type="button" class="tool' + (locked ? ' locked' : '') + (poor ? ' poor' : '') + (coach === t.id ? ' coach' : '') + '" data-tool="' + t.id + '" aria-pressed="' + (t.id === tool) + '" title="' + esc(t.name + ' · ' + t.desc) + '">' +
        '<span class="tool-key">' + t.key + '</span>' + sprite(t.icon, 30) +
        '<span class="tool-text"><span class="tool-name">' + t.short + '</span>' + (costTxt ? '<span class="tool-cost' + (cost < 0 ? ' gain' : '') + '">' + costTxt + '</span>' : '') + '</span></button>';
    }).join('');
  }

  function renderMissions(S, flash) {
    var list = BV.sim.missionStatus(S);
    if (!list.length) { el.missions.hidden = true; return; }
    el.missions.hidden = false;
    el.missions.innerHTML = '<p class="m-head">미션</p>' + list.map(function (x) {
      var d = x.def;
      var rw = d.reward[0] === 'budget' ? '+' + d.reward[1] + '억' : '지지 +' + d.reward[1];
      return '<div class="mission' + (flash && flash.indexOf(x.id) >= 0 ? ' fresh' : '') + '">' + sprite(d.icon, 20) +
        '<span class="m-text">' + d.text + '</span><span class="m-prog">' + Math.min(x.value, x.goal) + '/' + x.goal + '</span>' +
        '<span class="m-rw">' + rw + '</span><i class="m-bar"><b style="width:' + Math.round(x.frac * 100) + '%"></b></i></div>';
    }).join('');
  }

  function renderNext(S, busy) {
    var label = S.ended ? '결과 보기' : S.card ? '올해 소식' : (S.year === C.END_YEAR ? '2050 마무리' : (S.year + 1) + '년으로');
    el.nextLabel.textContent = label;
    el.nextBtn.disabled = !!busy;
    el.nextBtn.classList.toggle('ready', !busy && !S.card);
  }
  function setSoundIcon(on) {
    el.soundBtn.textContent = on ? '♪' : '×';
    el.soundBtn.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기');
    el.soundBtn.classList.toggle('off', !on);
  }

  /* ---------- 현장 노트 ---------- */
  function renderPanel(S, tab, sel) {
    document.querySelectorAll('[role="tab"]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === tab)); });
    var keep = tab === lastTab ? el.panelBody.scrollTop : 0;
    el.panelBody.innerHTML = tab === 'info' ? infoHTML(S, sel) : tab === 'codex' ? codexHTML(S) : tab === 'village' ? villageHTML(S) : notesHTML();
    el.panelBody.scrollTop = keep;
    lastTab = tab;
    renderPeek(S, sel);
  }
  function renderPeek(S, sel) {
    if (sel >= 0) {
      var d = BV.sim.describe(S, sel);
      var bits = [];
      if (d.eco) bits.push('건강 ' + d.health);
      if (d.carbon > 0) bits.push('탄소 ' + fmt(d.carbon) + 't');
      if (d.debris) bits.push('쓰레기');
      el.peekText.innerHTML = '<b>' + esc(d.name) + '</b>' + bits.join(' · ');
    } else el.peekText.innerHTML = '<b>현장 노트</b>도감 ' + S.present.length + '/12';
  }
  function togglePanel() {
    var c = el.panel.classList.toggle('collapsed');
    el.panelToggle.setAttribute('aria-expanded', String(!c));
    el.panelToggle.textContent = c ? '▴' : '▾';
    H.onLayout();
  }
  function expandPanel() { if (el.panel.classList.contains('collapsed')) togglePanel(); }
  function collapsePanel() { if (!el.panel.classList.contains('collapsed')) togglePanel(); }

  var ZONES = [['#1f5568', '깊은 바다'], ['#4f8a6a', '얕은 바다 · 잘피'], ['#8f7f69', '갯벌'], ['#a8324f', '상부 갯벌 · 염생식물'], ['#a5b45f', '간척지 · 제방 안쪽'], ['#93b56c', '육지']];
  function infoHTML(S, sel) {
    if (sel < 0) {
      return '<h3>칸을 눌러 보세요</h3><p class="desc">높이 = 물때 구역 · 1칸 = 1ha</p><ul class="zones">' +
        ZONES.map(function (z) { return '<li><i style="background:' + z[0] + '"></i>' + z[1] + '</li>'; }).join('') + '</ul>';
    }
    var d = BV.sim.describe(S, sel);
    var badges = [];
    if (d.eco && d.stageName) badges.push('<span class="chip accent">' + d.stageName + '</span>');
    if (d.restoring) badges.push('<span class="chip sea">복원 ' + d.restoring + '년차</span>');
    if (d.debris) badges.push('<span class="chip bad">쓰레기</span>');
    if (d.walk) badges.push('<span class="chip">탐방로</span>');
    var meters = '';
    if (d.eco) {
      var hc = d.health >= 70 ? 'var(--good)' : d.health >= 50 ? 'var(--warn)' : 'var(--bad)';
      meters += '<div class="mtr"><span>건강</span><b>' + d.health + '</b><i><em style="width:' + d.health + '%;background:' + hc + '"></em></i></div>';
      meters += '<div class="mtr"><span>올해 흡수</span><b class="pos">+' + fmt(d.absorb, 1) + 't</b></div>';
    }
    if (d.carbon > 0) meters += '<div class="mtr"><span>진흙 속 탄소</span><b>' + fmt(d.carbon) + 't</b></div>';
    if (d.emit > 0) meters += '<div class="mtr"><span>빠져나감</span><b class="neg">−' + fmt(d.emitNext, 1) + 't/년</b></div>';
    var acts = d.actions.length ? '<div class="acts">' + d.actions.map(function (a) {
      var c = a.cost < 0 ? '+' + (-a.cost) + '억' : a.cost === 0 ? '무료' : a.cost + '억';
      return '<button type="button" class="act" data-act="' + a.id + '" data-i="' + d.index + '"' + (a.ok ? '' : ' disabled title="' + esc(a.reason) + '"') + '>' + sprite(a.id, 20) + a.name + ' <span class="num">' + c + '</span></button>';
    }).join('') + '</div>' : '';
    return '<div class="tile-head"><div><span class="zone">' + esc(d.zone) + '</span><h3>' + esc(d.name) + '</h3></div><div class="badges">' + badges.join('') + '</div></div>' +
      '<div class="tile-body"><div class="mtrs">' + meters + '</div>' + (d.carbon > 0 || d.eco ? '<figure class="core">' + coreSVG(d) + '<figcaption>진흙 1m</figcaption></figure>' : '') + '</div>' +
      '<p class="desc">' + esc(d.desc) + '</p>' + acts;
  }
  function coreSVG(d) {
    var frac = Math.min(1, d.carbon / 1000);
    var surf = { marsh: '#a8324f', seagrass: '#2f7a4b', mudflat: '#8f7f69', upper: '#a9997c' }[d.type] || '#8f7f69';
    var out = '<svg viewBox="0 0 74 160" role="img" aria-label="진흙 속 탄소 ' + fmt(d.carbon) + '톤"><rect x="7" y="4" width="60" height="152" rx="8" fill="#5b4c3e"/>';
    for (var k = 0; k < 7; k++) {
      var t = frac * (0.45 + 0.55 * k / 6);
      out += '<rect x="9" y="' + (18 + k * 19.5) + '" width="56" height="19.5" fill="rgb(' + Math.round(185 - 145 * t) + ',' + Math.round(166 - 133 * t) + ',' + Math.round(138 - 110 * t) + ')"/>';
    }
    out += '<rect x="9" y="6" width="56" height="12" rx="6" fill="' + surf + '"/>';
    if (d.type === 'marsh' || d.type === 'seagrass') for (var j = 0; j < 5; j++) out += '<path d="M' + (16 + j * 10) + ' 18 q2 ' + (14 + j * 3) + ' -1 ' + (28 + j * 4) + '" stroke="#d9c9a3" stroke-width="1.2" fill="none" opacity="0.8"/>';
    return out + '</svg>';
  }

  var NEED_TXT = {
    flats: function (n) { return '갯벌 ' + n.have + '/' + n.need; }, marsh: function (n) { return '염습지 ' + n.have + '/' + n.need; },
    seagrass: function (n) { return '잘피 ' + n.have + '/' + n.need; }, seagrassMature: function (n) { return '무성한 잘피 ' + n.have + '/' + n.need; },
    wq: function (n) { return '수질 ' + n.have + '/' + n.need; }, debrisMax: function (n) { return '쓰레기 ' + n.have + ' (≤' + n.need + ')'; },
    devMax: function (n) { return '개발지 ' + n.have + ' (≤' + n.need + ')'; }, protect: function () { return '보호 정책'; }, island: function () { return '조용한 섬'; }
  };
  function codexHTML(S) {
    var st = BV.sim.speciesStatus(S);
    return '<div class="codex">' + st.map(function (x) {
      var sp = SP[x.id], seen = !!S.seen[x.id], here = S.present.indexOf(x.id) >= 0;
      var dot = here ? 'here' : seen ? 'gone' : 'none';
      return '<details class="sp ' + dot + '"><summary>' + sprite(sp.id, 40, seen ? '' : 'sil') + '<span class="sp-name">' + sp.name + '</span><i class="dot" title="' + (here ? '함께 살아요' : seen ? '떠났어요' : '아직') + '"></i></summary>' +
        '<ul class="need">' + x.needs.map(function (n) { return '<li class="' + (n.ok ? 'ok' : '') + '">' + (n.ok ? '✓ ' : '') + NEED_TXT[n.key](n) + '</li>'; }).join('') + '</ul>' +
        '<p class="sp-fact">' + (seen ? sp.fact : sp.habitat) + '</p></details>';
    }).join('') + '</div>';
  }

  var POLICY = {
    pond: { solar: '폐양식장 태양광', restore: '복원 계획', aqua: '양식장 재가동' },
    protect: { mpa: '해양보호구역', community: '주민 공동관리' },
    fund: { pes: '생태계서비스 지불제', credit: '탄소 크레딧 판매' },
    slr: { wall: '제방 높이기', retreat: '관리된 후퇴' }
  };
  var FLAGS = { ecoBuoy: '친환경 부표', cleanupDay: '정화의 날', ecoFarm: '친환경 농업', sewage: '하수처리', center: '탐방센터', school: '갯벌 학교' };
  var CUTS = { pondSolar: '태양광', boats: '전기 어선', rooftop: '지붕 태양광', bus: '전기 버스', remodel: '리모델링' };
  function villageHTML(S) {
    var m = BV.sim.metrics(S);
    var emit = m.emitVillage + m.emitNext;
    var pct = Math.round(m.neutrality * 100);
    var maxV = Math.max(emit, m.effAbsorb, 1);
    var html = '<div class="scale-card"><div class="big-pct">' + pct + '<small>%</small></div><span class="k">탄소중립</span>' +
      '<div class="bars2"><div><span>흡수</span><i><em class="a" style="width:' + Math.round(m.effAbsorb / maxV * 100) + '%"></em></i><b>' + fmt(m.effAbsorb) + 't</b></div>' +
      '<div><span>배출</span><i><em class="e" style="width:' + Math.round(emit / maxV * 100) + '%"></em></i><b>' + fmt(emit) + 't</b></div></div></div>';
    if (S.history.length) html += chartSVG(S.history) + '<div class="chart-legend"><span>흡수</span><span class="emit">배출</span></div>';
    var rep = S.lastReport;
    if (rep && rep.income) {
      var inc = rep.income;
      var parts = [['어업', inc.fishery], ['농업', inc.farm], ['관광', inc.tourism], ['개발 세금', inc.dev], ['에너지', inc.energy], ['지불제', inc.pes], ['태풍', -inc.damage]];
      html += '<h4>' + rep.year + ' 살림 ' + signed(inc.net, 1) + '억</h4><div class="chips">' + parts.filter(function (p) { return Math.abs(p[1]) >= 0.05; }).map(function (p) {
        return '<span class="fx ' + (p[1] >= 0 ? 'pos' : 'neg') + '">' + p[0] + ' ' + signed(p[1], 1) + '</span>';
      }).join('') + '</div>';
    }
    var pol = [];
    Object.keys(POLICY).forEach(function (k) { if (S.policies[k] && POLICY[k][S.policies[k]]) pol.push(POLICY[k][S.policies[k]]); });
    Object.keys(FLAGS).forEach(function (k) { if (S.policies[k]) pol.push(FLAGS[k]); });
    Object.keys(S.cuts).forEach(function (k) { pol.push(CUTS[k] + ' −' + Math.round(S.cuts[k] * 100) + '%'); });
    if (pol.length) html += '<h4>마을이 정한 것</h4><div class="chips">' + pol.map(function (p) { return '<span class="fx">' + p + '</span>'; }).join('') + '</div>';
    return html;
  }
  function chartSVG(hist) {
    var W = 520, Ht = 180, L = 40, R = 12, T = 12, B = 24, maxV = 60;
    hist.forEach(function (h) { maxV = Math.max(maxV, h.effAbsorb, h.emitVillage + h.emitLand); });
    var step = maxV > 400 ? 200 : maxV > 200 ? 100 : 50;
    var top = Math.ceil(maxV * 1.05 / step) * step;
    function X(y) { return L + (y - C.START_YEAR) / (C.END_YEAR - C.START_YEAR) * (W - L - R); }
    function Y(v) { return T + (1 - v / top) * (Ht - T - B); }
    var out = '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + Ht + '" role="img" aria-label="연도별 흡수와 배출">';
    for (var v = 0; v <= top; v += step) out += '<line class="ax" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (Y(v) + 3) + '" text-anchor="end">' + v + '</text>';
    [2026, 2030, 2035, 2040, 2045, 2050].forEach(function (y) { out += '<text class="tick" x="' + X(y) + '" y="' + (Ht - 7) + '" text-anchor="middle">' + y + '</text>'; });
    var pa = hist.map(function (h) { return X(h.year) + ',' + Y(h.effAbsorb); });
    var pe = hist.map(function (h) { return X(h.year) + ',' + Y(h.emitVillage + h.emitLand); });
    if (hist.length > 1) {
      out += '<polygon class="a-absorb" points="' + X(hist[0].year) + ',' + Y(0) + ' ' + pa.join(' ') + ' ' + X(hist[hist.length - 1].year) + ',' + Y(0) + '"/>';
      out += '<polyline class="l-emit draw" points="' + pe.join(' ') + '"/><polyline class="l-absorb draw" points="' + pa.join(' ') + '"/>';
    }
    var last = hist[hist.length - 1];
    out += '<circle class="dot-emit" r="3.5" cx="' + X(last.year) + '" cy="' + Y(last.emitVillage + last.emitLand) + '"/><circle class="dot-absorb" r="3.5" cx="' + X(last.year) + '" cy="' + Y(last.effAbsorb) + '"/>';
    return out + '</svg></div>';
  }
  function notesHTML() {
    return '<div class="notes">' + BV.NOTES.map(function (n) {
      return '<div class="note"><b>' + n.title + '</b><p>' + n.body + '</p><span class="src">' + n.src + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- 모달 ---------- */
  function openModal(html, o) {
    o = o || {};
    modalClosable = !!o.closable;
    modalOnClose = o.onClose || null;
    if (!el.banner.classList.contains('reveal-mode')) el.banner.hidden = true;
    el.modalCard.className = 'modal-card' + (o.wide ? ' wide' : '') + (o.cls ? ' ' + o.cls : '');
    el.modalCard.innerHTML = html;
    el.modal.hidden = false;
    el.modalCard.scrollTop = 0;
    var first = o.focus ? el.modalCard.querySelector(o.focus) : el.modalCard;
    if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 30);
    play('whoosh');
  }
  function closeModal() {
    el.modal.hidden = true;
    el.modalCard.innerHTML = '';
    modalClosable = false;
    var f = modalOnClose; modalOnClose = null;
    if (f) f();
  }
  function isModalOpen() { return !el.modal.hidden; }

  function reportStrip(rep) {
    var chips = [
      '<span class="fx pos">' + sprite('i_leaf', 14) + '흡수 +' + fmt(rep.effAbsorb, 0) + 't</span>',
      '<span class="fx">' + sprite('i_cloud', 14) + '배출 ' + fmt(rep.emitVillage + rep.emitLand) + 't</span>',
      '<span class="fx ' + (rep.income.net >= 0 ? 'pos' : 'neg') + '">' + sprite('i_coin', 14) + signed(rep.income.net, 1) + '억</span>'
    ];
    if (rep.typhoon) chips.push('<span class="fx warn">' + sprite('i_shield', 14) + '태풍 피해 −' + rep.typhoon.reduction + '%</span>');
    rep.discoveries.concat(rep.returned || []).forEach(function (id) { chips.push('<span class="fx new">' + sprite(id, 14) + SP[id].name + '</span>'); });
    rep.lost.forEach(function (id) { chips.push('<span class="fx neg">' + sprite(id, 14) + SP[id].name + ' 떠남</span>'); });
    return '<div class="report"><span class="eyebrow">' + rep.year + ' 결산</span><div class="chips">' + chips.join('') + '</div></div>';
  }

  function showCard(S, rep, card) {
    var kind = card.kind === 'council' ? '마을 회의' : card.kind === 'disaster' ? '경보' : '소식';
    var html = (rep ? reportStrip(rep) : '') +
      '<p class="eyebrow ' + card.kind + '">' + Math.min(S.year, C.END_YEAR) + ' · ' + kind + (card.tag ? ' · ' + esc(card.tag) : '') + '</p>' +
      '<h2 id="modalTitle">' + esc(card.title) + '</h2><p class="lead">' + esc(card.lead) + '</p><ul class="voices">';
    card.options.forEach(function (o, k) {
      var chips = (o.fx || []).map(fxChip).join('');
      if (o.who) {
        var p = BV.PEOPLE[o.who];
        html += '<li style="--i:' + k + '"><button type="button" class="voice" data-opt="' + k + '" aria-label="' + esc(o.label + ': ' + fxText(o.fx)) + '">' +
          '<span class="ava">' + sprite(o.who, 40) + '</span><span class="who">' + p.name + '<q>' + esc(o.quote) + '</q></span>' +
          '<span class="choice">' + esc(o.label) + '</span><span class="fxs">' + chips + '</span></button></li>';
      } else {
        html += '<li style="--i:' + k + '"><button type="button" class="voice solo" data-opt="' + k + '"><span class="choice">' + esc(o.label) + '</span><span class="fxs">' + chips + '</span></button></li>';
      }
    });
    openModal(html + '</ul>', { cls: 'kind-' + card.kind });
    if (card.kind === 'disaster') play('error');
  }
  function choose(idx, btn) {
    var list = el.modalCard.querySelector('.voices');
    if (!list || list.classList.contains('decided')) return;
    list.classList.add('decided');
    btn.classList.add('chosen');
    list.querySelectorAll('[data-opt]').forEach(function (b) { b.disabled = true; });
    play('stamp');
    setTimeout(function () { H.onChoose(idx); }, 520);
  }

  /* ---------- 연출 ---------- */
  function banner(big, small, ms) {
    el.banner.innerHTML = '<b>' + esc(big) + '</b>' + (small ? '<span>' + small + '</span>' : '');
    el.banner.hidden = false;
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(banner._t);
    banner._t = setTimeout(function () { el.banner.hidden = true; }, ms || 1600);
  }
  function reveal(id, ms) {
    var sp = SP[id];
    return new Promise(function (resolve) {
      el.banner.innerHTML = '<div class="reveal"><span class="new">NEW</span>' + sprite(id, 96, 'pop') + '<b>' + sp.name + '</b><span class="tag">' + sp.tag + '</span><p>' + sp.fact + '</p><span class="tap">눌러서 계속</span></div>';
      el.banner.hidden = false;
      el.banner.classList.remove('show');
      void el.banner.offsetWidth;
      el.banner.classList.add('show', 'reveal-mode');
      var done = false;
      function finish() { if (done) return; done = true; revealResolve = null; el.banner.hidden = true; el.banner.classList.remove('reveal-mode'); resolve(); }
      revealResolve = finish;
      setTimeout(finish, ms || 2600);
    });
  }
  function topToast(iconId, title, sub, kind) {
    var n = document.createElement('div');
    n.className = 'top-toast ' + (kind || '');
    n.innerHTML = sprite(iconId, 28) + '<span><b>' + esc(title) + '</b><small>' + esc(sub || '') + '</small></span>';
    el.toastTop.appendChild(n);
    setTimeout(function () { n.classList.add('out'); }, 2600);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 3100);
  }
  function confetti(ms) {
    var cvs = el.confetti;
    if (!cvs || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var w = cvs.width = window.innerWidth, h = cvs.height = window.innerHeight;
    var g = cvs.getContext('2d');
    var cols = ['#a3304d', '#1f6a86', '#f2c94c', '#2e7d4f', '#e8909f', '#9fd6e6'];
    var ps = [];
    for (var k = 0; k < 160; k++) ps.push({ x: Math.random() * w, y: -20 - Math.random() * h * 0.5, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, c: cols[k % cols.length], s: 5 + Math.random() * 6 });
    cvs.hidden = false;
    var t0 = performance.now();
    (function step(t) {
      g.clearRect(0, 0, w, h);
      ps.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); });
      if (t - t0 < (ms || 2800)) requestAnimationFrame(step); else { g.clearRect(0, 0, w, h); cvs.hidden = true; }
    })(t0);
  }

  function stars(n) {
    var s = '';
    for (var k = 0; k < 3; k++) s += '<i class="star' + (k < n ? ' on' : '') + '" style="--d:' + k + '">★</i>';
    return '<span class="stars" aria-label="별 ' + n + '개">' + s + '</span>';
  }
  function showEnding(S, ev, extra) {
    var e = ev.ending;
    var cars = Math.round(Math.max(0, ev.cumNet) / CAR_T);
    var html = '<div class="ending-head">' + sprite(e.emblem, 72, 'emblem') + '<div><p class="eyebrow">2050 · ' + BV.DIFFICULTY[S.diff || 'normal'].name + ' · ' + esc(S.code) + '</p><h2 id="modalTitle">' + esc(e.title) + '</h2><p class="lead">' + esc(e.summary) + '</p></div></div>' +
      '<div class="ending-stats">' +
      '<div><span class="k">탄소중립</span><span class="v">' + Math.round(ev.neutrality * 100) + '%</span>' + stars(ev.stars.carbon) + '</div>' +
      '<div><span class="k">생물</span><span class="v">' + ev.species + '/12</span>' + stars(ev.stars.life) + '</div>' +
      '<div><span class="k">지지도</span><span class="v">' + ev.support + '</span>' + stars(ev.stars.people) + '</div></div>' +
      chartSVG(S.history) + '<div class="chart-legend"><span>흡수</span><span class="emit">배출</span></div>' +
      '<div class="chips">' +
      '<span class="fx pos">' + sprite('i_leaf', 14) + '25년 저장 ' + fmt(ev.cumNet) + 't' + (cars ? ' (차 ' + fmt(cars) + '대분)' : '') + '</span>' +
      '<span class="fx">' + sprite('i_drop', 14) + '바닷가 ' + ev.eco0 + '→' + ev.eco + 'ha</span>' +
      (extra.newAch.length ? extra.newAch.map(function (id) { return '<span class="fx new">' + sprite(ACH[id].icon, 14) + ACH[id].name + '</span>'; }).join('') : '') +
      '</div>' +
      '<p class="real">' + esc(e.real) + '</p>' +
      '<div class="qs"><b>생각해 봐요</b><ol><li>' + esc(e.questions[0]) + '</li><li>' + esc(e.questions[1]) + '</li></ol>' +
      '<details class="more"><summary>질문 더 보기</summary><ol start="3"><li>' + esc(e.questions[2]) + '</li><li>게임 숫자는 단순화했어요. 실제와 다른 점은?</li></ol></details></div>' +
      '<div class="code-box"><span>결과 코드 · 선생님께 보내 주세요</span><code id="resultCode">' + esc(extra.code) + '</code></div>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-ui="copy">결과 복사</button><button type="button" class="btn" data-ui="again">다시 하기</button><button type="button" class="btn" data-ui="title">처음으로</button></div>' +
      '<textarea id="copyArea" readonly hidden></textarea>';
    openModal(html, { wide: true, cls: 'ending ending-' + ev.key, focus: '[data-ui="copy"]' });
    var starsEls = el.modalCard.querySelectorAll('.star.on');
    starsEls.forEach(function (s, k) { setTimeout(function () { play('star'); }, 500 + k * 220); });
    if (ev.key === 'bluecarbon') { confetti(); setTimeout(function () { play('achieve'); }, 300); } else play(ev.key === 'grey' || ev.key === 'neglect' ? 'lose' : 'mission');
  }
  function showCopyFallback(text) {
    var ta = $('copyArea');
    if (!ta) return;
    ta.hidden = false; ta.value = text; ta.focus(); ta.select();
  }

  /* ---------- 작은 알림 ---------- */
  function toast(msg, kind) {
    if (!msg) return;
    el.toast.textContent = msg;
    el.toast.className = 'toast' + (kind ? ' ' + kind : '');
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, kind === 'bad' ? 2600 : 1900);
  }
  function hint(text, ms) {
    clearTimeout(hintTimer);
    if (!text) { el.hint.hidden = true; return; }
    el.hintText.textContent = text;
    el.hint.hidden = false;
    if (ms) hintTimer = setTimeout(function () { el.hint.hidden = true; }, ms);
  }
  function legend(mode) {
    if (mode === 'carbon') { el.legend.innerHTML = '<span>탄소 적음</span><span class="ramp" style="background:linear-gradient(90deg,#e6f0fa,#1e467c)"></span><span>많음</span>'; el.legend.hidden = false; }
    else if (mode === 'health') { el.legend.innerHTML = '<span>건강 낮음</span><span class="ramp" style="background:linear-gradient(90deg,#d24650,#d2c850,#32c850)"></span><span>높음</span>'; el.legend.hidden = false; }
    else el.legend.hidden = true;
  }
  function tide(info) {
    el.tideFill.style.height = Math.round(info.frac * 100) + '%';
    var label = info.frac > 0.86 ? '만조' : info.frac < 0.14 ? '간조' : info.rising ? '밀물' : '썰물';
    if (el.tideState.textContent !== label) el.tideState.textContent = label;
  }

  BV.ui = {
    init: init, sprite: sprite, setTitleMode: setTitleMode, renderTitle: renderTitle, showSetup: showSetup, showSettings: showSettings,
    showAchievements: showAchievements, showCredits: showCredits, showHelp: showHelp, showTeacher: showTeacher, renderTeacher: renderTeacher,
    renderHUD: renderHUD, resetHud: resetHud, renderTools: renderTools, renderMissions: renderMissions, renderPanel: renderPanel, renderNext: renderNext,
    setSoundIcon: setSoundIcon, expandPanel: expandPanel, collapsePanel: collapsePanel, showCard: showCard, closeModal: closeModal, isModalOpen: isModalOpen,
    modalClosable: function () { return modalClosable; }, banner: banner, reveal: reveal, topToast: topToast, confetti: confetti,
    showEnding: showEnding, showCopyFallback: showCopyFallback, toast: toast, hint: hint, tide: tide, josa: josa
  };
})(window.BV = window.BV || {});

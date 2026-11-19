/*
 * 블루복셀 — 화면(UI): HUD, 도구, 현장 노트, 마을 회의 카드, 결산, 엔딩
 */
(function (BV) {
  'use strict';

  var C = BV.CONFIG;
  var el = {};
  var handlers = {};
  var spriteCache = {};
  var SP = {};
  BV.SPECIES.forEach(function (sp) { SP[sp.id] = sp; });
  var modalClosable = false;
  var toastTimer = 0;
  var lastTab = '';
  var CAR_T = 2.4; // 승용차 1대 연간 배출 약 2.4tCO2 (갯벌 26만 t ≈ 승용차 11만 대 보도 기준)

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function fmt(n, d) {
    d = d || 0;
    return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  }
  function signed(n, d) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), d); }
  // 받침에 따라 조사 고르기: josa('거머리말', '이', '가') → '거머리말이'
  function josa(word, withBatchim, without) {
    var c = word.charCodeAt(word.length - 1);
    var has = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0;
    return word + (has ? withBatchim : without);
  }

  function sprite(id, px) {
    if (!BV.SPRITES[id]) return '';
    if (!spriteCache[id]) {
      var rows = BV.SPRITES[id];
      var c = document.createElement('canvas');
      c.width = 12; c.height = 12;
      var g = c.getContext('2d');
      for (var y = 0; y < 12; y++) {
        for (var x = 0; x < 12; x++) {
          var ch = rows[y][x];
          if (ch !== '.' && BV.PALETTE[ch]) { g.fillStyle = BV.PALETTE[ch]; g.fillRect(x, y, 1, 1); }
        }
      }
      spriteCache[id] = c.toDataURL();
    }
    return '<img class="px" src="' + spriteCache[id] + '" width="' + px + '" height="' + px + '" alt="">';
  }

  /* ---------- 초기화 ---------- */
  function init(h) {
    handlers = h;
    ['hudYear', 'stats', 'tools', 'panel', 'panelBody', 'modal', 'modalCard', 'toast', 'hint', 'hintText',
      'hintClose', 'legend', 'tideFill', 'tideState', 'tideBtn', 'nextBtn', 'nextLabel', 'codexCount',
      'panelToggle', 'helpBtn', 'menuBtn', 'peek', 'peekText'].forEach(function (id) { el[id] = $(id); });
    el.peek.addEventListener('click', function () { expandPanel(); });

    el.tools.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tool]');
      if (b) handlers.onTool(b.getAttribute('data-tool'));
    });
    document.querySelectorAll('[role="tab"]').forEach(function (b) {
      b.addEventListener('click', function () { handlers.onTab(b.getAttribute('data-tab')); });
    });
    el.panelBody.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (a && !a.disabled) handlers.onAct(a.getAttribute('data-act'), +a.getAttribute('data-i'));
      var g = e.target.closest('[data-goto]');
      if (g) handlers.onTab(g.getAttribute('data-goto'));
    });
    el.panelToggle.addEventListener('click', function () {
      var collapsed = el.panel.classList.toggle('collapsed');
      el.panelToggle.setAttribute('aria-expanded', String(!collapsed));
      el.panelToggle.textContent = collapsed ? '▴' : '▾';
      el.panelToggle.setAttribute('aria-label', collapsed ? '노트 펼치기' : '노트 접기');
      handlers.onLayout();
    });
    el.hintClose.addEventListener('click', function () { hint(null); handlers.onHintClose(); });
    el.nextBtn.addEventListener('click', function () { handlers.onNext(); });
    el.helpBtn.addEventListener('click', function () { showHelp(); });
    el.menuBtn.addEventListener('click', function () { handlers.onMenu(); });
    el.tideBtn.addEventListener('click', function () {
      var p = el.tideBtn.getAttribute('aria-pressed') !== 'true';
      el.tideBtn.setAttribute('aria-pressed', String(p));
      el.tideBtn.setAttribute('aria-label', p ? '물때 다시 움직이기' : '물때 멈추기');
      el.tideBtn.textContent = p ? '▶' : 'Ⅱ';
      handlers.onTidePause(p);
    });
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('[data-view]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        var m = b.getAttribute('data-view');
        handlers.onView(m);
        legend(m);
      });
    });
    document.querySelectorAll('[data-zoom]').forEach(function (b) {
      b.addEventListener('click', function () { handlers.onZoom(b.getAttribute('data-zoom')); });
    });
    el.modal.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-opt]');
      if (opt) { handlers.onChoose(+opt.getAttribute('data-opt')); return; }
      var a = e.target.closest('[data-modal]');
      if (a) { modalAction(a.getAttribute('data-modal')); return; }
      if (e.target === el.modal && modalClosable) closeModal();
    });
  }

  function modalAction(kind) {
    switch (kind) {
      case 'new': {
        var inp = $('codeInput');
        handlers.onStart(inp ? inp.value : '');
        break;
      }
      case 'continue': closeModal(); handlers.onContinue(); break;
      case 'help': showHelp(); break;
      case 'close': closeModal(); break;
      case 'copy': handlers.onCopy(); break;
      case 'restart': handlers.onMenu(); break;
      default: break;
    }
  }

  /* ---------- HUD ---------- */
  function renderHUD(S) {
    var m = BV.sim.metrics(S);
    var yr = Math.min(S.year, C.END_YEAR);
    el.hudYear.innerHTML = '<b>' + yr + '</b><span>' + (S.ended ? '마을 총회' : (yr - C.START_YEAR + 1) + ' / 25년차') + '</span>';
    var neut = Math.round(m.neutrality * 100);
    var items = [
      { k: '예산', v: fmt(S.budget, 1) + '<small>억 원</small>', warn: S.budget < 0 },
      { k: '탄소중립', v: neut + '<small>%</small>', meter: neut, title: '올해 예상 흡수 ' + fmt(m.effAbsorb, 1) + 't ÷ 배출 ' + fmt(m.emitVillage + m.emitNext) + 't' },
      { k: '생물', v: S.present.length + '<small>/' + BV.SPECIES.length + '종</small>' },
      { k: '주민 지지도', v: S.support + '<small>/100</small>', warn: S.support < 30 },
      { k: '바다 수질', v: Math.round(S.wq) + '<small>/100</small>', warn: S.wq < 40, opt: true },
      { k: '블루카본 저장', v: fmt(m.ecoStock) + '<small>tCO₂</small>', opt: true }
    ];
    el.stats.innerHTML = items.map(function (it) {
      return '<div class="stat' + (it.opt ? ' opt' : '') + (it.warn ? ' warn' : '') + '"' + (it.title ? ' title="' + esc(it.title) + '"' : '') + '>' +
        '<span class="k">' + it.k + '</span><span class="v">' + it.v + '</span>' +
        (it.meter !== undefined ? '<span class="meter"><i style="width:' + Math.min(100, Math.max(0, it.meter)) + '%"></i></span>' : '') +
        '</div>';
    }).join('');
    el.codexCount.textContent = S.present.length + '/' + BV.SPECIES.length;
  }

  function renderTools(S, tool) {
    el.tools.innerHTML = BV.TOOLS.map(function (t) {
      var cost = BV.sim.toolCost(S, t.id, null);
      var costTxt = t.id === 'inspect' ? '무료' : cost < 0 ? '+' + (-cost) + '억' : cost === 0 ? '무료' : cost + '억';
      if (t.id === 'restore' && S.policies.pond === 'restore') costTxt = '2~4억';
      var locked = t.id === 'develop' && S.policies.protect === 'mpa';
      return '<button type="button" class="tool' + (locked ? ' locked' : '') + '" data-tool="' + t.id + '" aria-pressed="' + (t.id === tool) + '" title="' + esc(t.name + ' — ' + t.desc) + '">' +
        '<span class="tool-key">' + t.key + '</span>' + sprite(t.icon, 30) +
        '<span class="tool-text"><span class="tool-name"><span class="full">' + t.name + '</span><span class="short">' + t.short + '</span></span>' +
        '<span class="tool-cost' + (cost < 0 ? ' gain' : '') + '">' + costTxt + '</span></span></button>';
    }).join('');
  }

  function renderNext(S, busy) {
    var label = S.ended ? '결과 보기' : S.card ? '올해 소식 보기' : (S.year + 1) + '년으로';
    if (!S.ended && !S.card && S.year === C.END_YEAR) label = '2050년 마무리';
    el.nextLabel.textContent = label;
    el.nextBtn.disabled = !!busy;
  }

  /* ---------- 현장 노트 ---------- */
  function renderPanel(S, tab, sel) {
    document.querySelectorAll('[role="tab"]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === tab));
    });
    var keep = tab === lastTab ? el.panelBody.scrollTop : 0;
    var html = '';
    if (tab === 'info') html = infoHTML(S, sel);
    else if (tab === 'codex') html = codexHTML(S);
    else if (tab === 'village') html = villageHTML(S);
    else html = notesHTML();
    el.panelBody.innerHTML = html;
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
      if (d.debris) bits.push('쓰레기 있음');
      el.peekText.innerHTML = '<b>' + esc(d.name) + '</b>' + bits.join(' · ');
    } else {
      el.peekText.innerHTML = '<b>현장 노트</b>도감 ' + S.present.length + '/' + BV.SPECIES.length + ' · 마을 · 과학 노트';
    }
  }
  function expandPanel() {
    if (el.panel.classList.contains('collapsed')) el.panelToggle.click();
  }
  function collapsePanel() {
    if (!el.panel.classList.contains('collapsed')) el.panelToggle.click();
  }

  var ZONES = [
    ['#1f5568', '깊은 바다', '늘 잠겨 있어요'],
    ['#4f8a6a', '얕은 바다', '잘피를 심을 수 있어요'],
    ['#8f7f69', '갯벌 (조간대)', '밀물에 잠기고 썰물에 드러나요'],
    ['#a8324f', '상부 갯벌·염습지', '큰 밀물 때만 잠겨요. 염생식물을 심어요'],
    ['#a5b45f', '간척지 (제방 안쪽)', '제방을 열어야 바닷물이 닿아요'],
    ['#93b56c', '육지', '마을과 숲']
  ];

  function infoHTML(S, sel) {
    if (sel < 0) {
      return '<p class="eyebrow">물때마을 앞바다</p><h3>칸을 눌러 살펴보세요</h3>' +
        '<p class="muted" style="margin-top:6px">복셀 한 층의 높이가 곧 물때 구역이에요. 밀물과 썰물이 오르내리면서 어느 칸이 잠기는지 보세요. 한 칸은 1ha예요.</p>' +
        '<ul class="zones">' + ZONES.map(function (z) {
          return '<li><i style="background:' + z[0] + '"></i><span><b>' + z[1] + '</b> · ' + z[2] + '</span></li>';
        }).join('') + '</ul>';
    }
    var d = BV.sim.describe(S, sel);
    var chips = [];
    if (d.eco && d.stageName) chips.push('<span class="chip accent">' + d.stageName + '</span>');
    if (d.restoring) chips.push('<span class="chip sea">복원 ' + d.restoring + '년차</span>');
    if (d.debris) chips.push('<span class="chip bad">쓰레기 있음</span>');
    if (d.walk) chips.push('<span class="chip">탐방로</span>');
    var rows = '';
    if (d.eco) {
      var hc = d.health >= 70 ? 'var(--good)' : d.health >= 50 ? 'var(--warn)' : 'var(--bad)';
      rows += '<dt>건강도</dt><dd>' + d.health + '<div class="bar"><i style="width:' + d.health + '%;background:' + hc + '"></i></div></dd>';
      rows += '<dt>올해 흡수 예상</dt><dd>+' + fmt(d.absorb, 1) + ' t</dd>';
    }
    if (d.carbon > 0) rows += '<dt>진흙 속 탄소</dt><dd>' + fmt(d.carbon) + ' t</dd>';
    if (d.emit > 0) rows += '<dt>빠져나가는 탄소</dt><dd>−' + fmt(d.emitNext, 1) + ' t/년</dd>';
    var acts = d.actions.length
      ? '<div class="acts">' + d.actions.map(function (a) {
        var c = a.cost < 0 ? '+' + (-a.cost) + '억' : a.cost === 0 ? '무료' : a.cost + '억';
        return '<button type="button" class="act" data-act="' + a.id + '" data-i="' + d.index + '"' + (a.ok ? '' : ' disabled title="' + esc(a.reason) + '"') + '>' +
          sprite(a.id, 20) + a.name + ' <span class="num">' + c + '</span></button>';
      }).join('') + '</div>'
      : '<p class="empty-note">이 칸에 지금 쓸 수 있는 도구가 없어요.</p>';
    return '<div class="info-head"><div><p class="eyebrow">' + esc(d.zone) + ' · ' + (d.x + 1) + '열 ' + (d.y + 1) + '행</p><h3>' + esc(d.name) + '</h3></div>' +
      '<div class="acts">' + chips.join('') + '</div></div>' +
      '<div class="info-grid"><div>' + (rows ? '<dl class="kv">' + rows + '</dl>' : '') + '<p>' + esc(d.desc) + '</p></div>' +
      (d.carbon > 0 || d.eco ? '<figure class="core">' + coreSVG(d) + '<figcaption>진흙 단면<br>깊이 1m</figcaption></figure>' : '<div></div>') + '</div>' +
      '<h4>여기서 할 수 있는 일</h4>' + acts;
  }

  function coreSVG(d) {
    var frac = Math.min(1, d.carbon / 1000);
    var surf = { marsh: '#a8324f', seagrass: '#2f7a4b', mudflat: '#8f7f69', upper: '#a9997c' }[d.type] || '#8f7f69';
    var out = '<svg viewBox="0 0 74 160" role="img" aria-label="진흙 단면: 저장된 탄소 ' + fmt(d.carbon) + '톤">';
    out += '<rect x="7" y="4" width="60" height="152" rx="8" fill="#5b4c3e"/>';
    var layers = 7;
    for (var k = 0; k < layers; k++) {
      var t = frac * (0.45 + 0.55 * k / (layers - 1));
      var r = Math.round(185 + (40 - 185) * t), g = Math.round(166 + (33 - 166) * t), b = Math.round(138 + (28 - 138) * t);
      out += '<rect x="9" y="' + (18 + k * 19.5) + '" width="56" height="19.5" fill="rgb(' + r + ',' + g + ',' + b + ')"/>';
    }
    out += '<rect x="9" y="6" width="56" height="12" rx="6" fill="' + surf + '"/>';
    if (d.type === 'marsh' || d.type === 'seagrass') {
      for (var j = 0; j < 5; j++) {
        var x = 16 + j * 10;
        out += '<path d="M' + x + ' 18 q2 ' + (14 + j * 3) + ' -1 ' + (28 + j * 4) + '" stroke="#d9c9a3" stroke-width="1.2" fill="none" opacity="0.8"/>';
      }
    }
    out += '</svg>';
    return out;
  }

  var NEED_FMT = {
    flats: function (n) { return ['건강한 갯벌', n.have + '/' + n.need + 'ha']; },
    marsh: function (n) { return ['염습지', n.have + '/' + n.need + 'ha']; },
    seagrass: function (n) { return ['잘피밭', n.have + '/' + n.need + 'ha']; },
    seagrassMature: function (n) { return ['무성한 잘피밭', n.have + '/' + n.need + 'ha']; },
    wq: function (n) { return ['바다 수질', n.have + '/' + n.need]; },
    debrisMax: function (n) { return ['쓰레기 칸', n.have + ' (' + n.need + ' 이하)']; },
    devMax: function (n) { return ['개발지', n.have + ' (' + n.need + ' 이하)']; },
    protect: function (n) { return ['갯벌 보호 정책', n.ok ? '있음' : '없음']; },
    island: function (n) { return ['무인도가 조용함', n.ok ? '예' : '아니요']; }
  };

  function codexHTML(S) {
    var st = BV.sim.speciesStatus(S);
    return '<p class="muted">조건을 모두 채우면 연말에 생물이 돌아와요. 조건이 깨지면 떠나기도 해요.</p><div class="codex">' +
      st.map(function (x) {
        var sp = SP[x.id];
        var seen = !!S.seen[x.id];
        var here = S.present.indexOf(x.id) >= 0;
        var state = here ? '<span class="chip sea sp-state">함께 살아요</span>'
          : seen ? '<span class="chip bad sp-state">떠났어요</span>'
            : '<span class="chip sp-state">아직 못 만났어요</span>';
        return '<article class="sp' + (seen ? '' : ' unknown') + '">' +
          '<div class="sp-head">' + sprite(sp.id, 40) + '<div><div class="sp-name">' + sp.name + '</div><div class="sp-tag">' + sp.tag + '</div></div></div>' +
          state + '<ul class="need">' + x.needs.map(function (n) {
            var f = NEED_FMT[n.key](n);
            return '<li class="' + (n.ok ? 'ok' : '') + '"><span>' + (n.ok ? '✓ ' : '· ') + f[0] + '</span><span class="num">' + f[1] + '</span></li>';
          }).join('') + '</ul>' +
          (seen ? '<p class="sp-fact">' + sp.fact + '</p>' : '<p class="sp-fact muted">사는 곳: ' + sp.habitat + '</p>') +
          '</article>';
      }).join('') + '</div>';
  }

  var POLICY_TEXT = {
    pond: { solar: '폐양식장 → 태양광 발전소', restore: '폐양식장 갯벌 복원 계획', aqua: '양식장 다시 운영' },
    protect: { mpa: '해양보호구역 지정', community: '주민 공동관리(자율관리어업)' },
    fund: { pes: '생태계서비스 지불제 참여', credit: '탄소 크레딧 판매(흡수량 절반은 기업 몫)' },
    slr: { wall: '제방 높이기', retreat: '관리된 후퇴(제방 개방)' }
  };
  var FLAG_TEXT = {
    ecoBuoy: '친환경 부표 교체', cleanupDay: '주민 정화의 날', ecoFarm: '친환경 농업', sewage: '하수처리시설 개선',
    center: '생태탐방센터', school: '갯벌 학교'
  };
  var CUT_TEXT = { pondSolar: '태양광 발전소', boats: '전기·하이브리드 어선', rooftop: '지붕 태양광 협동조합', bus: '마을버스·농기계 전기화', remodel: '에너지 리모델링' };

  function villageHTML(S) {
    var m = BV.sim.metrics(S);
    var emit = m.emitVillage + m.emitNext;
    var pct = Math.round(m.neutrality * 100);
    var html = '<p class="eyebrow">마을 탄소 저울 · ' + Math.min(S.year, C.END_YEAR) + '년 예상</p>' +
      '<div class="balance"><div class="absorb"><span class="k">바닷가 흡수</span><span class="v">' + fmt(m.effAbsorb, 1) + '</span> <span class="muted">t</span></div>' +
      '<div><span class="k">마을 배출' + (m.emitNext > 0.5 ? ' (매립 ' + fmt(m.emitNext) + ' 포함)' : '') + '</span><span class="v">' + fmt(emit) + '</span> <span class="muted">t</span></div></div>' +
      '<div class="scale" aria-label="탄소중립 ' + pct + '%"><i style="width:' + Math.min(100, pct) + '%"></i></div>' +
      '<p class="muted" style="margin-top:6px">흡수가 배출만큼 되면 탄소중립 100%예요. 갯벌을 늘리는 것과 배출을 줄이는 것, 둘 다 필요해요.' +
      (S.policies.fund === 'credit' ? ' 탄소 크레딧을 팔아서 흡수량의 절반만 마을 몫으로 계산해요.' : '') + '</p>';
    if (S.history.length) {
      html += '<h4>해마다 흡수와 배출</h4>' + chartSVG(S.history) +
        '<div class="chart-legend"><span>바닷가 흡수</span><span class="emit">마을 배출</span></div>';
    }
    var rep = S.lastReport;
    if (rep && rep.income) {
      var inc = rep.income;
      var rows = [['기본 예산', inc.base], ['어업', inc.fishery], ['농업', inc.farm], ['생태관광', inc.tourism], ['양식장', inc.aqua],
        ['개발지 세금', inc.dev], ['에너지', inc.energy], ['생태계서비스 지불', inc.pes], ['제방 관리비', -inc.upkeep], ['태풍 피해', -inc.damage]];
      html += '<h4>' + rep.year + '년 마을 살림</h4><ul class="rows">' + rows.filter(function (r) { return Math.abs(r[1]) >= 0.05; }).map(function (r) {
        return '<li><span>' + r[0] + '</span><span class="num">' + signed(r[1], 1) + '억</span></li>';
      }).join('') + '<li><b>합계</b><b class="num">' + signed(inc.net, 1) + '억</b></li></ul>';
    }
    var pol = [];
    Object.keys(POLICY_TEXT).forEach(function (k) { if (S.policies[k] && POLICY_TEXT[k][S.policies[k]]) pol.push(POLICY_TEXT[k][S.policies[k]]); });
    Object.keys(FLAG_TEXT).forEach(function (k) { if (S.policies[k]) pol.push(FLAG_TEXT[k]); });
    var cuts = Object.keys(S.cuts).map(function (k) { return CUT_TEXT[k] + ' −' + Math.round(S.cuts[k] * 100) + '%'; });
    html += '<h4>마을이 정한 것</h4>' + (pol.length || cuts.length
      ? '<ul class="rows">' + pol.map(function (p) { return '<li><span>' + p + '</span></li>'; }).join('') +
        cuts.map(function (c) { return '<li><span>배출 감축: ' + c + '</span></li>'; }).join('') + '</ul>'
      : '<p class="empty-note">아직 정한 정책이 없어요.</p>');
    var dec = S.decisions.filter(function (d) { return d.council; }).slice().reverse();
    if (dec.length) {
      html += '<h4>회의 기록</h4><ul class="log">' + dec.map(function (d) {
        return '<li><span class="num">' + d.year + '</span><span>' + esc(d.title) + ' → <b>' + esc(d.choice) + '</b></span></li>';
      }).join('') + '</ul>';
    }
    return html;
  }

  function chartSVG(hist) {
    var W = 520, H = 190, L = 42, Rr = 12, T = 12, B = 26;
    var maxV = 60;
    hist.forEach(function (h) { maxV = Math.max(maxV, h.effAbsorb, h.emitVillage + h.emitLand); });
    var step = maxV > 400 ? 200 : maxV > 200 ? 100 : 50;
    var top = Math.ceil(maxV * 1.05 / step) * step;
    function X(y) { return L + (y - C.START_YEAR) / (C.END_YEAR - C.START_YEAR) * (W - L - Rr); }
    function Y(v) { return T + (1 - v / top) * (H - T - B); }
    var out = '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="연도별 흡수와 배출 그래프">';
    for (var v = 0; v <= top; v += step) {
      out += '<line class="ax" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>';
      out += '<text class="tick" x="' + (L - 6) + '" y="' + (Y(v) + 3) + '" text-anchor="end">' + v + '</text>';
    }
    [2026, 2030, 2035, 2040, 2045, 2050].forEach(function (y) {
      out += '<text class="tick" x="' + X(y) + '" y="' + (H - 8) + '" text-anchor="middle">' + y + '</text>';
    });
    var pa = hist.map(function (h) { return X(h.year) + ',' + Y(h.effAbsorb); });
    var pe = hist.map(function (h) { return X(h.year) + ',' + Y(h.emitVillage + h.emitLand); });
    if (hist.length > 1) {
      out += '<polygon class="a-absorb" points="' + X(hist[0].year) + ',' + Y(0) + ' ' + pa.join(' ') + ' ' + X(hist[hist.length - 1].year) + ',' + Y(0) + '"/>';
      out += '<polyline class="l-emit" points="' + pe.join(' ') + '"/>';
      out += '<polyline class="l-absorb" points="' + pa.join(' ') + '"/>';
    }
    var last = hist[hist.length - 1];
    out += '<circle class="dot-emit" r="3.5" cx="' + X(last.year) + '" cy="' + Y(last.emitVillage + last.emitLand) + '"/>';
    out += '<circle class="dot-absorb" r="3.5" cx="' + X(last.year) + '" cy="' + Y(last.effAbsorb) + '"/>';
    out += '<text class="tick" x="' + L + '" y="9">tCO₂/년</text>';
    out += '</svg></div>';
    return out;
  }

  function notesHTML() {
    return '<div class="notes"><p class="muted">게임 속 숫자와 사건 뒤에 있는 과학 이야기예요.</p>' + BV.NOTES.map(function (n, k) {
      return '<details' + (k === 0 ? ' open' : '') + '><summary>' + n.title + '</summary><p>' + n.body + '</p></details>';
    }).join('') + '</div>';
  }

  /* ---------- 모달 ---------- */
  function openModal(html, opts) {
    opts = opts || {};
    modalClosable = !!opts.closable;
    el.modalCard.className = 'modal-card' + (opts.wide ? ' wide' : '');
    el.modalCard.innerHTML = html;
    el.modal.hidden = false;
    el.modalCard.scrollTop = 0;
    // 선택지는 미리 고른 것처럼 보이지 않도록 카드 자체에 초점을 둬요.
    var first = opts.focus ? el.modalCard.querySelector(opts.focus) : el.modalCard;
    if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 30);
  }
  function closeModal() {
    el.modal.hidden = true;
    el.modalCard.innerHTML = '';
    modalClosable = false;
  }
  function isModalOpen() { return !el.modal.hidden; }

  function titleArt() {
    var cols = ['#cfe1e5', '#cfe1e5', '#cfe1e5', '#cfe1e5', '#cfe1e5', '#cfe1e5', '#cfe1e5', '#a8324f', '#cfe1e5', '#c2454f', '#5f8c50', '#5f8c50',
      '#3a7f9a', '#3a7f9a', '#2f7a4b', '#3a7f9a', '#6aa3a8', '#8f7f69', '#a8324f', '#a8324f', '#b03a46', '#a8324f', '#93b56c', '#93b56c',
      '#24566e', '#2f7a4b', '#2f7a4b', '#2f7a4b', '#8f7f69', '#8f7f69', '#8f7f69', '#7b6953', '#7b6953', '#7b6953', '#8b7051', '#8b7051',
      '#24566e', '#3b302a', '#3b302a', '#3b302a', '#3b302a', '#2c241e', '#2c241e', '#2c241e', '#2c241e', '#2c241e', '#4e453c', '#4e453c'];
    return '<div class="title-art" aria-hidden="true">' + cols.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</div>';
  }

  function showTitle(opts) {
    opts = opts || {};
    var html = titleArt() +
      '<p class="wordmark">BLUE <span>VOXEL</span></p>' +
      '<h2 id="modalTitle">갯벌마을 2050</h2>' +
      '<p class="lead">서해의 작은 어촌 물때마을. 갯벌을 메워 만든 간척지와 버려진 양식장이 남아 있어요. 청소년 생태전환위원이 된 당신이 2050년까지 25년 동안 마을의 바닷가를 설계해요.</p>' +
      '<ul class="goals">' +
      '<li><span class="chip sea">흡수</span><span>갯벌·염습지·잘피밭을 지키고 넓혀 진흙 속에 탄소를 저장해요</span></li>' +
      '<li><span class="chip">감축</span><span>마을의 온실가스 배출을 줄여요</span></li>' +
      '<li><span class="chip accent">공존</span><span>생물과 주민이 함께 사는 바닷가를 만들어요</span></li>' +
      '</ul>' +
      '<div class="field"><label for="codeInput">수업 코드 · 같은 코드면 같은 사건이 같은 순서로 일어나요</label>' +
      '<input id="codeInput" type="text" maxlength="12" autocomplete="off" spellcheck="false" value="' + esc(opts.code || C.DEFAULT_CODE) + '"></div>' +
      '<div class="btn-row">' +
      (opts.canContinue ? '<button type="button" class="btn primary" data-modal="continue">이어서 하기</button><button type="button" class="btn" data-modal="new">새로 시작</button>'
        : '<button type="button" class="btn primary" data-modal="new">새로 시작</button>') +
      '<button type="button" class="btn" data-modal="help">게임 방법</button></div>' +
      '<p class="muted" style="margin-top:14px">게임 속 사건은 실제 연구와 정책을 바탕으로 만든 가상 시나리오예요. 숫자는 배우기 쉽게 단순화했어요.</p>';
    openModal(html, { focus: '[data-modal]' });
  }

  function showHelp() {
    var html = '<p class="eyebrow">게임 방법</p><h2 id="modalTitle">한 해에 한 번, 바닷가를 바꿔요</h2>' +
      '<div class="howto">' +
      '<div><strong>한 해 = 한 턴</strong>해마다 마을 소식이나 회의 안건이 와요. 선택한 뒤 도구로 바닷가를 바꾸고 ‘다음 해로’를 눌러요. 2050년이 끝나면 엔딩이에요.</div>' +
      '<div><strong>높이 = 물때 구역</strong>얕은 바다에는 잘피, 큰 밀물 때만 잠기는 상부 갯벌에는 염생식물을 심어요. 잘못된 높이에는 심을 수 없어요.</div>' +
      '<div><strong>흡수와 배출</strong>생태계는 해마다 진흙 속에 탄소를 쌓아요. 메우면 쌓인 탄소가 빠져나가요. 마을의 에너지 배출도 줄여야 탄소중립이에요.</div>' +
      '<div><strong>시간이 필요해요</strong>새싹 → 자라는 중 → 무성함. 생태계는 몇 해가 지나야 자라고, 다 자란 염습지는 주변으로 저절로 퍼져요.</div>' +
      '<div><strong>생물이 돌아와요</strong>도감의 조건(갯벌 넓이, 수질, 쓰레기…)을 채우면 연말에 생물이 돌아와요.</div>' +
      '<div><strong>조작</strong>칸 누르기: 살펴보기·도구 쓰기 / 끌기: 지도 이동 / 휠·두 손가락: 확대 / 단축키 1~8 도구, 방향키 칸 이동, Enter 실행, N 다음 해</div>' +
      '</div><div class="btn-row"><button type="button" class="btn primary" data-modal="close">알겠어요</button></div>';
    openModal(html, { closable: true });
  }

  function reportHTML(S, rep) {
    var notes = [];
    if (rep.typhoon) {
      var ty = rep.typhoon;
      notes.push('<li><span class="chip bad">태풍 ' + ty.strength + '등급</span><span>갯벌·염습지가 피해를 ' + ty.reduction + '% 줄였어요. 피해 ' + fmt(ty.damage, 1) + '억 원 (완충이 없었다면 ' + fmt(ty.noBuffer, 1) + '억 원)</span></li>');
    }
    if (rep.heat) notes.push('<li><span class="chip bad">해양 열파</span><span>잘피밭 건강도가 ' + rep.heat.hit + '씩 떨어졌어요' + (rep.heat.hit < 20 ? '. 맑은 물 덕분에 덜 다쳤어요.' : '.') + '</span></li>');
    rep.discoveries.forEach(function (id) {
      notes.push('<li>' + sprite(id, 28) + '<span><b>' + josa(SP[id].name, '</b>을', '</b>를') + ' 처음 만났어요! 도감에 기록했어요.</span></li>');
    });
    (rep.returned || []).forEach(function (id) {
      notes.push('<li>' + sprite(id, 28) + '<span><b>' + josa(SP[id].name, '</b>이', '</b>가') + ' 다시 돌아왔어요.</span></li>');
    });
    rep.lost.forEach(function (id) {
      notes.push('<li>' + sprite(id, 28) + '<span><b>' + josa(SP[id].name, '</b>이', '</b>가') + ' 떠났어요. 도감에서 조건을 확인해 보세요.</span></li>');
    });
    if (rep.spread) notes.push('<li><span class="chip sea">자연 회복</span><span>다 자란 생태계가 ' + rep.spread + '칸 더 스스로 퍼졌어요.</span></li>');
    if (rep.died) notes.push('<li><span class="chip bad">사라짐</span><span>건강이 나빠진 생태계 ' + rep.died + '칸이 사라졌어요.</span></li>');
    if (rep.emitLand >= 1) notes.push('<li><span class="chip bad">매립지</span><span>메운 진흙에서 탄소 ' + fmt(rep.emitLand, 1) + 't이 빠져나갔어요.</span></li>');
    if (rep.newDebris && rep.newDebris.length) notes.push('<li><span class="chip">쓰레기</span><span>바다에서 쓰레기 ' + rep.newDebris.length + '곳이 새로 밀려왔어요.</span></li>');
    var emit = rep.emitVillage + rep.emitLand;
    return '<section class="report" aria-label="' + rep.year + '년 결산">' +
      '<p class="eyebrow">' + rep.year + '년 결산</p>' +
      '<div class="report-grid">' +
      '<div class="absorb"><span class="k">바닷가 흡수</span><span class="v">+' + fmt(rep.effAbsorb, 1) + 't</span></div>' +
      '<div><span class="k">마을 배출</span><span class="v">' + fmt(emit) + 't</span></div>' +
      '<div><span class="k">살림</span><span class="v">' + signed(rep.income.net, 1) + '억</span></div>' +
      '<div><span class="k">수질</span><span class="v">' + Math.round(rep.wq.after) + '</span></div>' +
      '</div>' + (notes.length ? '<ul class="report-notes">' + notes.join('') + '</ul>' : '') + '</section>';
  }

  function cardHTML(S, card) {
    var kindLabel = card.kind === 'council' ? '마을 회의' : card.kind === 'disaster' ? '재해 예보' : '마을 소식';
    var html = '<p class="eyebrow">' + Math.min(S.year, C.END_YEAR) + '년 · ' + kindLabel + '</p>' +
      '<h2 id="modalTitle">' + esc(card.title) + (card.tag ? '<span class="tagline">' + esc(card.tag) + '</span>' : '') + '</h2>' +
      '<p class="lead">' + esc(card.lead) + '</p><ul class="voices">';
    card.options.forEach(function (o, k) {
      if (o.who) {
        var p = BV.PEOPLE[o.who];
        html += '<li><button type="button" class="voice" data-opt="' + k + '">' +
          '<span class="ava">' + sprite(o.who, 36) + '</span>' +
          '<span class="who">' + p.name + ' · ' + p.role + '</span>' +
          '<q>' + esc(o.quote) + '</q>' +
          '<span class="choice">' + esc(o.label) + '</span>' +
          '<span class="effect">' + esc(o.effect || '') + '</span>' +
          (o.long ? '<span class="long">' + esc(o.long) + '</span>' : '') +
          '</button></li>';
      } else {
        html += '<li><button type="button" class="voice solo" data-opt="' + k + '"><span class="choice">' + esc(o.label) + '</span>' +
          (o.effect ? '<span class="effect">' + esc(o.effect) + '</span>' : '') + '</button></li>';
      }
    });
    return html + '</ul>';
  }

  function showYear(S, rep, card) {
    var html = (rep ? reportHTML(S, rep) : '') + cardHTML(S, card);
    openModal(html, {});
  }

  function stars(n) {
    var s = '';
    for (var k = 0; k < 3; k++) s += k < n ? '★' : '<span class="off">★</span>';
    return '<span class="stars" aria-label="별 ' + n + '개">' + s + '</span>';
  }

  function showEnding(S, ev) {
    var e = ev.ending;
    var cars = Math.round(Math.max(0, ev.cumNet) / CAR_T);
    var html = '<p class="eyebrow">2050 마을 총회 · 수업 코드 ' + esc(S.code) + '</p>' +
      '<h2 id="modalTitle">' + esc(e.title) + '</h2><p class="lead">' + esc(e.summary) + '</p>' +
      (S.lastReport ? reportHTML(S, S.lastReport) : '') +
      '<div class="ending-stats">' +
      '<div><span class="k">2050년 탄소중립</span><span class="v">' + Math.round(ev.neutrality * 100) + '%</span><br>' + stars(ev.stars.carbon) + '</div>' +
      '<div><span class="k">함께 사는 생물</span><span class="v">' + ev.species + '/' + BV.SPECIES.length + '</span><br>' + stars(ev.stars.life) + '</div>' +
      '<div><span class="k">주민 지지도</span><span class="v">' + ev.support + '</span><br>' + stars(ev.stars.people) + '</div>' +
      '</div>' +
      chartSVG(S.history) + '<div class="chart-legend"><span>바닷가 흡수</span><span class="emit">마을 배출</span></div>' +
      '<ul class="facts">' +
      '<li>25년 동안 바닷가가 저장한 탄소(매립 배출을 뺀 값): <b class="num">' + fmt(ev.cumNet) + ' tCO₂</b>' + (cars > 0 ? ' · 승용차 약 ' + fmt(cars) + '대가 1년 동안 내뿜는 양' : '') + '</li>' +
      '<li>갯벌·염습지·잘피밭 넓이: <b class="num">' + ev.eco0 + 'ha → ' + ev.eco + 'ha</b> · 염습지 ' + ev.marsh0 + ' → ' + ev.marsh + 'ha · 잘피밭 ' + ev.seagrass0 + ' → ' + ev.seagrass + 'ha</li>' +
      '<li>2050년 흡수 <b class="num">' + fmt(ev.last.effAbsorb) + 't</b> / 배출 <b class="num">' + fmt(ev.last.emitVillage + ev.last.emitLand) + 't</b></li>' +
      '</ul>' +
      '<div class="real"><b>현실에서는</b> ' + esc(e.real) + '</div>' +
      '<h3 style="font-family:var(--font-display);font-weight:400;font-size:20px;margin:18px 0 4px">함께 생각해 봐요</h3>' +
      '<ol class="questions">' + e.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') +
      '<li>게임 속 숫자는 단순화했어요. 실제와 다를 수 있는 부분은 무엇일까요?</li></ol>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-modal="copy">결과 복사하기</button>' +
      '<button type="button" class="btn" data-modal="restart">처음 화면으로</button></div>' +
      '<textarea id="copyArea" readonly hidden style="width:100%;height:160px;margin-top:10px;font-family:var(--font-data);font-size:12px;background:var(--surface-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px"></textarea>';
    openModal(html, { wide: true, focus: '[data-modal]' });
  }

  function showCopyFallback(text) {
    var ta = $('copyArea');
    if (!ta) return;
    ta.hidden = false;
    ta.value = text;
    ta.focus();
    ta.select();
  }

  /* ---------- 작은 알림 ---------- */
  function toast(msg, kind) {
    if (!msg) return;
    el.toast.textContent = msg;
    el.toast.className = 'toast' + (kind ? ' ' + kind : '');
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, kind === 'bad' ? 3400 : 2600);
  }
  function hint(text) {
    if (!text) { el.hint.hidden = true; return; }
    el.hintText.textContent = text;
    el.hint.hidden = false;
  }
  function legend(mode) {
    if (mode === 'carbon') {
      el.legend.innerHTML = '<span>진흙 속 탄소 적음</span><span class="ramp" style="background:linear-gradient(90deg,#e6f0fa,#1e467c)"></span><span>많음</span>';
      el.legend.hidden = false;
    } else if (mode === 'health') {
      el.legend.innerHTML = '<span>건강도 낮음</span><span class="ramp" style="background:linear-gradient(90deg,#d24650,#d2c850,#32c850)"></span><span>높음</span>';
      el.legend.hidden = false;
    } else {
      el.legend.hidden = true;
    }
  }
  function tide(info) {
    el.tideFill.style.height = Math.round(info.frac * 100) + '%';
    var label = info.frac > 0.86 ? '만조' : info.frac < 0.14 ? '간조' : info.rising ? '밀물 ↑' : '썰물 ↓';
    if (el.tideState.textContent !== label) el.tideState.textContent = label;
  }

  BV.ui = {
    init: init, sprite: sprite, renderHUD: renderHUD, renderTools: renderTools, renderPanel: renderPanel,
    renderNext: renderNext, expandPanel: expandPanel, collapsePanel: collapsePanel, showTitle: showTitle, showHelp: showHelp, showYear: showYear,
    showEnding: showEnding, showCopyFallback: showCopyFallback, closeModal: closeModal, isModalOpen: isModalOpen,
    toast: toast, hint: hint, tide: tide, modalClosable: function () { return modalClosable; }
  };
})(window.BV = window.BV || {});

/*
 * 블루복셀 — 소리 (Web Audio로 직접 합성, 음원 파일 없음)
 * 효과음, 파도 소리, 잔잔한 배경 음악. 첫 터치 뒤에만 재생돼요.
 */
(function (BV) {
  'use strict';

  var ctx = null, sfxGain = null, musicGain = null, ambGain = null, windGain = null;
  var whiteBuf = null, brownBuf = null;
  var sfxOn = true, musicOn = true;
  var started = false, musicTimer = 0, nextBar = 0, bar = 0;
  var last = {};

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn ? 0.6 : 0; sfxGain.connect(comp);
    musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.14 : 0; musicGain.connect(comp);
    ambGain = ctx.createGain(); ambGain.gain.value = musicOn ? 0.2 : 0; ambGain.connect(comp);
    windGain = ctx.createGain(); windGain.gain.value = 0; windGain.connect(comp);
    var n = ctx.sampleRate * 2;
    whiteBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    brownBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var w = whiteBuf.getChannelData(0), b = brownBuf.getChannelData(0), lastB = 0;
    for (var i = 0; i < n; i++) {
      var r = Math.random() * 2 - 1;
      w[i] = r;
      lastB = (lastB + 0.02 * r) / 1.02;
      b[i] = lastB * 3.5;
    }
    return ctx;
  }

  function tone(f, t, dur, type, vol, dest, attack, glide) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, type, f0, f1, q, white, dest) {
    var src = ctx.createBufferSource();
    src.buffer = white ? whiteBuf : brownBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.06, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || sfxGain);
    src.start(t); src.stop(t + dur + 0.05);
  }

  var SFX = {
    click: function (t) { tone(880, t, 0.05, 'triangle', 0.14); },
    tool: function (t) { tone(660, t, 0.07, 'triangle', 0.18); tone(990, t + 0.05, 0.08, 'triangle', 0.14); },
    marsh: function (t) { tone(392, t, 0.16, 'triangle', 0.28, null, 0.005, 784); tone(587, t + 0.07, 0.2, 'sine', 0.16); noise(t, 0.16, 0.1, 'highpass', 2500, 0, 0.7, true); },
    seagrass: function (t) { for (var k = 0; k < 4; k++) tone(320 + Math.random() * 200, t + k * 0.06, 0.12, 'sine', 0.16, null, 0.005, 700 + Math.random() * 300); },
    cleanup: function (t) { [1318, 1568, 2093].forEach(function (f, k) { tone(f, t + k * 0.05, 0.18, 'sine', 0.12); }); },
    water: function (t) { noise(t, 0.9, 0.32, 'bandpass', 300, 1600, 0.8); tone(110, t, 0.5, 'sine', 0.14, null, 0.02, 70); },
    develop: function (t) { tone(90, t, 0.45, 'sine', 0.55, null, 0.003, 40); noise(t, 0.8, 0.35, 'lowpass', 600, 120, 0.7); },
    boardwalk: function (t) { tone(240, t, 0.08, 'square', 0.1); tone(200, t + 0.09, 0.08, 'square', 0.08); },
    coin: function (t) { tone(988, t, 0.09, 'square', 0.08); tone(1319, t + 0.08, 0.22, 'square', 0.08); },
    error: function (t) { tone(150, t, 0.16, 'square', 0.1, null, 0.005, 120); },
    year: function (t) { tone(392, t, 1.4, 'sine', 0.2); tone(587, t, 1.2, 'sine', 0.1); tone(784, t + 0.02, 0.9, 'triangle', 0.05); },
    absorb: function (t) { for (var k = 0; k < 6; k++) tone(1046 + k * 130, t + k * 0.07, 0.25, 'sine', 0.05); },
    discover: function (t) { [523, 659, 784, 1046, 1318].forEach(function (f, k) { tone(f, t + k * 0.09, 0.5, 'triangle', 0.14); tone(f * 2, t + k * 0.09, 0.3, 'sine', 0.04); }); },
    mission: function (t) { [659, 784, 1046].forEach(function (f, k) { tone(f, t + k * 0.08, 0.25, 'square', 0.07); }); },
    achieve: function (t) { [523, 659, 784, 1046, 784, 1046, 1318].forEach(function (f, k) { tone(f, t + k * 0.08, 0.3, 'triangle', 0.13); }); noise(t + 0.4, 0.8, 0.04, 'highpass', 6000, 0, 0.5, true); },
    thunder: function (t) { noise(t, 2.2, 0.65, 'lowpass', 900, 80, 0.5); tone(55, t, 1.6, 'sine', 0.3, null, 0.01, 35); },
    stamp: function (t) { tone(140, t, 0.18, 'sine', 0.45, null, 0.002, 60); noise(t, 0.12, 0.18, 'bandpass', 1800, 600, 1, true); },
    whoosh: function (t) { noise(t, 0.35, 0.15, 'bandpass', 600, 2400, 1.2, true); },
    star: function (t) { tone(1046, t, 0.3, 'triangle', 0.15); tone(1568, t + 0.05, 0.3, 'sine', 0.07); },
    smoke: function (t) { noise(t, 0.9, 0.16, 'lowpass', 400, 150, 0.6); },
    heat: function (t) { tone(220, t, 1.0, 'sawtooth', 0.035, null, 0.2, 180); },
    splash: function (t) { noise(t, 0.4, 0.22, 'bandpass', 1200, 500, 0.9, true); },
    lose: function (t) { tone(392, t, 0.3, 'triangle', 0.1, null, 0.01, 330); tone(294, t + 0.2, 0.45, 'triangle', 0.1, null, 0.01, 247); }
  };

  /* ---------- 배경: 파도와 음악 ---------- */
  var CHORDS = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
  var PENTA = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5];

  function startAmbient() {
    var src = ctx.createBufferSource();
    src.buffer = brownBuf; src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    var g = ctx.createGain(); g.gain.value = 0.55;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.085;
    var lg = ctx.createGain(); lg.gain.value = 0.4;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(ambGain);
    src.start(); lfo.start();
    var ws = ctx.createBufferSource();
    ws.buffer = whiteBuf; ws.loop = true;
    var wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.8;
    var wl = ctx.createOscillator(); wl.frequency.value = 0.3;
    var wlg = ctx.createGain(); wlg.gain.value = 400;
    wl.connect(wlg); wlg.connect(wf.frequency);
    ws.connect(wf); wf.connect(windGain);
    ws.start(); wl.start();
  }
  function pad(f, t, dur) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.9);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(musicGain);
    ['triangle', 'sine'].forEach(function (type, k) {
      var o = ctx.createOscillator();
      o.type = type; o.frequency.value = f * (k ? 1.004 : 1);
      o.connect(g); o.start(t); o.stop(t + dur + 0.1);
    });
  }
  function scheduleMusic() {
    if (!ctx || !musicOn) return;
    while (nextBar < ctx.currentTime + 0.6) {
      var t = Math.max(nextBar, ctx.currentTime + 0.05);
      CHORDS[bar % 4].forEach(function (f) { pad(f / 2, t, 2.7); });
      for (var k = 0; k < 4; k++) {
        if (Math.random() < 0.5) tone(PENTA[Math.floor(Math.random() * PENTA.length)], t + k * 0.6 + Math.random() * 0.04, 0.9, 'sine', 0.06, musicGain, 0.01);
      }
      bar++;
      nextBar = t + 2.4;
    }
  }

  function ramp(node, v, sec) {
    if (!node) return;
    var t = ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(node.gain.value, t);
    node.gain.linearRampToValueAtTime(v, t + (sec || 0.3));
  }

  BV.audio = {
    unlock: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!started) {
        started = true;
        try { startAmbient(); } catch (e) { /* 소리 없이 진행 */ }
        nextBar = ctx.currentTime + 0.2;
        musicTimer = setInterval(scheduleMusic, 300);
      }
    },
    play: function (name) {
      if (!ctx || !sfxOn || !SFX[name] || ctx.state !== 'running') return;
      var now = performance.now();
      if (last[name] && now - last[name] < 45) return;
      last[name] = now;
      try { SFX[name](ctx.currentTime + 0.01); } catch (e) { /* 무시 */ }
    },
    storm: function (level) {
      if (!ctx) return;
      ramp(windGain, sfxOn ? level * 0.35 : 0, 0.6);
      ramp(musicGain, musicOn ? 0.14 * (1 - level * 0.8) : 0, 0.6);
    },
    setSfx: function (on) { sfxOn = !!on; if (ctx) ramp(sfxGain, sfxOn ? 0.6 : 0, 0.1); },
    setMusic: function (on) {
      musicOn = !!on;
      if (!ctx) return;
      ramp(musicGain, musicOn ? 0.14 : 0, 0.5);
      ramp(ambGain, musicOn ? 0.2 : 0, 0.5);
      if (musicOn) nextBar = Math.max(nextBar, ctx.currentTime + 0.1);
    },
    buzz: function (ms) {
      if (!sfxOn) return;
      try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 무시 */ }
    },
    state: function () { return { sfx: sfxOn, music: musicOn, ready: !!ctx && ctx.state === 'running' }; }
  };
})(window.BV = window.BV || {});

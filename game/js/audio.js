// 갯벌 수호대 — 소리 (모두 코드로 만든 효과음·음악)
(function (root) {
  'use strict';
  const GS = root.GS;
  let ac = null, master, sfxBus, musBus, noise, delay, amb = null;
  const st = { sfx: true, music: true };
  const last = {};
  let combo = 0, comboT = 0;
  const THR = { hit: 0.035, kill: 0.03, gem: 0.022, shoot: 0.07, sweep: 0.08, splash: 0.06, dash: 0.12, erupt: 0.05, jump: 0.12,
    mine: 0.2, pave: 0.12, emit: 0.3, bloom: 0.3, hurt: 0.1, drip: 0.08, bolt: 0.1, slam: 0.05 };

  function init() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = 0.85;
    sfxBus = ac.createGain(); sfxBus.gain.value = st.sfx ? 0.6 : 0;
    musBus = ac.createGain(); musBus.gain.value = st.music ? 0.36 : 0;
    delay = ac.createDelay(1); delay.delayTime.value = 0.36;
    const fb = ac.createGain(); fb.gain.value = 0.3;
    const wet = ac.createGain(); wet.gain.value = 0.4;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(musBus);
    sfxBus.connect(master); musBus.connect(master); master.connect(comp); comp.connect(ac.destination);
    const len = ac.sampleRate;
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    setInterval(tick, 25);
    return true;
  }
  function unlock() {
    if (!ac && !init()) return;
    if (ac.state === 'suspended') ac.resume();
    if (!amb) startAmb();
  }
  function suspend(v) { if (ac) { if (v) ac.suspend(); else ac.resume(); } }

  function tone(o) {
    const t0 = o.at != null ? o.at : ac.currentTime + (o.t || 0);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || sfxBus);
    if (o.echo) g.connect(delay);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }
  function nz(o) {
    const t0 = o.at != null ? o.at : ac.currentTime + (o.t || 0);
    const src = ac.createBufferSource();
    src.buffer = noise; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = o.ft || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.05);
  }
  function startAmb() {
    const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ac.createGain(); g.gain.value = 0.035;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.12;
    const lg = ac.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(); lfo.start();
    amb = g;
  }

  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function play(name) {
    if (!ac || !st.sfx || ac.state !== 'running') return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < (THR[name] || 0.025)) return;
    last[name] = now;
    switch (name) {
      case 'hit': nz({ dur: 0.045, vol: 0.1, f: 2200 + Math.random() * 1400, q: 1.4 }); break;
      case 'kill': tone({ f: 480 + Math.random() * 260, f2: 150, type: 'square', dur: 0.08, vol: 0.05, lp: 2200 }); nz({ dur: 0.05, vol: 0.06, f: 900, q: 0.8 }); break;
      case 'gem': {
        if (now - comboT > 0.6) combo = 0;
        comboT = now;
        const f = 880 * Math.pow(2, PENTA[Math.min(combo, PENTA.length - 1)] / 12);
        combo++;
        tone({ f, type: 'triangle', dur: 0.09, vol: 0.055 }); tone({ f: f * 2, dur: 0.05, vol: 0.02 });
        break;
      }
      case 'level': [0, 4, 7, 12, 16].forEach((n, i) => tone({ f: N(72 + n), type: 'square', t: i * 0.055, dur: 0.2, vol: 0.06, lp: 3200 })); nz({ t: 0.22, dur: 0.5, vol: 0.05, ft: 'highpass', f: 5000 }); break;
      case 'pick': tone({ f: 660, type: 'triangle', dur: 0.08, vol: 0.08 }); tone({ f: 990, type: 'triangle', t: 0.06, dur: 0.14, vol: 0.08 }); break;
      case 'evo': [0, 4, 7, 11, 14, 19].forEach((n, i) => tone({ f: N(67 + n), type: 'sawtooth', t: i * 0.05, dur: 0.7, vol: 0.045, lp: 2600 })); nz({ dur: 1.0, vol: 0.06, ft: 'highpass', f: 3000, f2: 9000 }); break;
      case 'hurt': tone({ f: 190, f2: 60, dur: 0.22, vol: 0.24 }); nz({ dur: 0.12, vol: 0.1, f: 500, q: 0.7 }); break;
      case 'heal': [0, 4, 7].forEach((n, i) => tone({ f: N(76 + n), t: i * 0.07, dur: 0.2, vol: 0.08 })); break;
      case 'chest':
        for (let i = 0; i < 8; i++) nz({ t: i * 0.07, dur: 0.05, vol: 0.08, f: 300 + i * 90, q: 2 });
        [0, 4, 7, 12].forEach((n, i) => tone({ f: N(72 + n), type: 'square', t: 0.6 + i * 0.08, dur: 0.32, vol: 0.06, lp: 3500 }));
        break;
      case 'shoot': nz({ dur: 0.06, vol: 0.04, ft: 'highpass', f: 2600, f2: 6000 }); tone({ f: 1300, f2: 650, dur: 0.06, vol: 0.022 }); break;
      case 'drip': tone({ f: 1500, f2: 900, dur: 0.05, vol: 0.02 }); break;
      case 'sweep': nz({ dur: 0.15, vol: 0.08, f: 800, f2: 3200, q: 0.8 }); break;
      case 'splash': nz({ dur: 0.2, vol: 0.11, ft: 'lowpass', f: 1300, f2: 300 }); tone({ f: 210, f2: 80, dur: 0.12, vol: 0.09 }); break;
      case 'dash': nz({ dur: 0.28, vol: 0.06, f: 500, f2: 2400, q: 0.6 }); break;
      case 'erupt': tone({ f: 150, f2: 50, dur: 0.2, vol: 0.16 }); nz({ dur: 0.18, vol: 0.09, ft: 'lowpass', f: 900 }); break;
      case 'nova': nz({ dur: 0.6, vol: 0.11, ft: 'lowpass', f: 400, f2: 2600 }); tone({ f: 220, f2: 440, type: 'triangle', dur: 0.4, vol: 0.05 }); break;
      case 'jump': tone({ f: 300, f2: 720, type: 'square', dur: 0.08, vol: 0.025, lp: 1500 }); break;
      case 'mine': tone({ f: 240, f2: 160, type: 'triangle', dur: 0.06, vol: 0.035 }); break;
      case 'warn': for (let i = 0; i < 3; i++) { tone({ f: 660, type: 'square', t: i * 0.5, dur: 0.22, vol: 0.05, lp: 2000 }); tone({ f: 520, type: 'square', t: i * 0.5 + 0.24, dur: 0.22, vol: 0.05, lp: 2000 }); } break;
      case 'boss': tone({ f: 55, f2: 40, type: 'sawtooth', dur: 1.4, vol: 0.16, lp: 600 }); tone({ f: 82, type: 'sawtooth', dur: 1.4, vol: 0.09, lp: 500 }); nz({ dur: 1.2, vol: 0.09, ft: 'lowpass', f: 300 }); break;
      case 'bolt': nz({ dur: 0.3, vol: 0.2, ft: 'highpass', f: 1500 }); nz({ t: 0.05, dur: 0.9, vol: 0.13, ft: 'lowpass', f: 200 }); break;
      case 'pave': nz({ dur: 0.25, vol: 0.07, f: 180, q: 3 }); break;
      case 'emit': tone({ f: 120, f2: 90, type: 'sawtooth', dur: 0.3, vol: 0.035, lp: 400 }); break;
      case 'charge': tone({ f: 70, f2: 140, type: 'sawtooth', dur: 0.5, vol: 0.11, lp: 900 }); nz({ dur: 0.5, vol: 0.09, ft: 'lowpass', f: 600 }); break;
      case 'slam': tone({ f: 90, f2: 40, dur: 0.3, vol: 0.2 }); nz({ dur: 0.3, vol: 0.12, ft: 'lowpass', f: 700 }); break;
      case 'blast': tone({ f: 120, f2: 40, dur: 0.35, vol: 0.2 }); nz({ dur: 0.4, vol: 0.14, ft: 'lowpass', f: 1500, f2: 200 }); break;
      case 'bosskill': tone({ f: 110, f2: 30, dur: 1.4, vol: 0.28 }); nz({ dur: 1.6, vol: 0.18, ft: 'lowpass', f: 1400, f2: 100 }); break;
      case 'win': [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => tone({ f: N(72 + n), type: i < 4 ? 'square' : 'triangle', t: i * 0.11, dur: 0.32, vol: 0.065, lp: 3500 })); break;
      case 'lose': [7, 3, 0, -5].forEach((n, i) => tone({ f: N(69 + n), type: 'triangle', t: i * 0.18, dur: 0.38, vol: 0.08 })); break;
      case 'click': tone({ f: 900, type: 'triangle', dur: 0.04, vol: 0.05 }); break;
      case 'buy': tone({ f: 1046, type: 'square', dur: 0.06, vol: 0.05, lp: 3000 }); tone({ f: 1568, type: 'square', t: 0.07, dur: 0.12, vol: 0.05, lp: 3000 }); break;
      case 'deny': tone({ f: 200, type: 'square', dur: 0.12, vol: 0.05, lp: 1000 }); tone({ f: 150, type: 'square', t: 0.1, dur: 0.15, vol: 0.05, lp: 1000 }); break;
      case 'bloom': tone({ f: N(88 + PENTA[Math.floor(Math.random() * 5)]), dur: 0.3, vol: 0.016 }); break;
      case 'storm': nz({ dur: 3, vol: 0.08, f: 500, f2: 900, q: 0.5, a: 1 }); break;
      case 'revive': [0, 7, 12, 19, 24].forEach((n, i) => tone({ f: N(67 + n), type: 'triangle', t: i * 0.07, dur: 0.5, vol: 0.08 })); break;
      case 'magnet': tone({ f: 300, f2: 1200, dur: 0.4, vol: 0.07 }); break;
      case 'start': [0, 7, 12].forEach((n, i) => tone({ f: N(60 + n), type: 'square', t: i * 0.08, dur: 0.2, vol: 0.06, lp: 2400 })); break;
    }
  }

  // ── 음악 (단계별로 쌓이는 반주) ──────────────────────────
  const PROG = {
    title: { bpm: 96, ch: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
    run: { bpm: 124, ch: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
    boss: { bpm: 138, ch: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]] },
  };
  const mus = { mode: 'off', step: 0, next: 0, I: 1 };
  function music(mode) {
    if (mus.mode === mode) return;
    mus.mode = mode; mus.step = 0;
    if (ac) mus.next = ac.currentTime + 0.08;
  }
  function intensity(i) { mus.I = i; }
  function tick() {
    if (!ac || mus.mode === 'off' || ac.state !== 'running') return;
    const P = PROG[mus.mode], sp = 60 / P.bpm / 4;
    if (mus.next < ac.currentTime - 0.3) mus.next = ac.currentTime + 0.05;
    while (mus.next < ac.currentTime + 0.12) { if (st.music) sched(P, mus.step, mus.next); mus.next += sp; mus.step++; }
  }
  function sched(P, step, at) {
    const s16 = step % 16, bar = Math.floor(step / 16), ch = P.ch[bar % P.ch.length];
    const title = mus.mode === 'title', boss = mus.mode === 'boss';
    const I = title ? 0 : boss ? 3 : mus.I;
    const beat = 60 / P.bpm;
    if (s16 === 0) for (const n of ch) tone({ at, f: N(n), type: 'sawtooth', dur: beat * 4 * 0.98, vol: title ? 0.02 : 0.016, a: 0.35, lp: title ? 700 : 950, bus: musBus });
    const bp = title ? [0, 8] : [0, 3, 6, 8, 11, 14];
    if (bp.indexOf(s16) >= 0) tone({ at, f: N(ch[0] - 12 + (s16 === 6 || s16 === 14 ? 7 : 0)), type: boss ? 'square' : 'sawtooth', dur: title ? 0.5 : 0.17, vol: title ? 0.06 : 0.08, lp: 480, bus: musBus });
    if (I >= 1 && s16 % 4 === 0) tone({ at, f: 150, f2: 45, dur: 0.16, vol: 0.3, bus: musBus });
    if (I >= 2 && (s16 === 4 || s16 === 12)) nz({ at, dur: 0.12, vol: 0.09, f: 1800, q: 0.7, bus: musBus });
    if (!title && (s16 % 2 === 1 || I >= 3)) nz({ at, dur: 0.03, vol: s16 % 2 ? 0.035 : 0.02, ft: 'highpass', f: 7000, bus: musBus });
    if ((title && s16 % 4 === 2) || (!title && I >= 2 && s16 % 2 === 0)) {
      const seq = [0, 1, 2, 1, 2, 0, 1, 2];
      const n = ch[seq[(s16 >> 1) % 8]] + 12 + (!title && s16 >= 8 ? 12 : 0);
      tone({ at, f: N(n), type: 'triangle', dur: title ? 0.4 : 0.14, vol: title ? 0.04 : 0.03, bus: musBus, echo: true });
    }
    if (I >= 3) {
      const mot = [0, -1, 2, -1, 1, -1, 2, 0, -1, -1, 1, -1, 2, -1, -1, -1];
      const k = mot[s16];
      if (k >= 0) tone({ at, f: N(ch[k] + 24), type: 'square', dur: 0.12, vol: 0.018, lp: 2600, bus: musBus, echo: true });
    }
  }

  function set(o) {
    if (o.sfx != null) st.sfx = !!o.sfx;
    if (o.music != null) st.music = !!o.music;
    if (ac) {
      sfxBus.gain.setTargetAtTime(st.sfx ? 0.6 : 0, ac.currentTime, 0.05);
      musBus.gain.setTargetAtTime(st.music ? 0.36 : 0, ac.currentTime, 0.05);
    }
  }
  function buzz(ms) { try { if (root.navigator && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 진동이 없으면 그냥 넘어가요 */ } }

  GS.audio = { unlock, play, music, intensity, set, suspend, buzz, st, get ready() { return !!ac && ac.state === 'running'; } };
})(typeof window !== 'undefined' ? window : globalThis);

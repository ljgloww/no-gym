// audio.js — every sound is synthesised with Web Audio, so there are no files to load.
// level: 0 = muted, 1 = sound effects, 2 = sound effects + spoken coach.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];   // C major pentatonic

export class Sfx {
  constructor() { this.level = 2; this.ctx = null; this.voiceReady = false; }

  /** Must be called from a user gesture (iOS only starts audio after a touch). */
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // "ambient" lets the sounds mix with the user's own music instead of pausing it.
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* not supported */ }
    const ctx = this.ctx = new AC();
    this.out = ctx.createGain(); this.out.gain.value = .85;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.out.connect(comp); comp.connect(ctx.destination);
    const buf = this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  /** iOS only lets speech start from a tap, so speak one silent word on the first real gesture. */
  primeVoice() {
    if (this.voiceReady || !('speechSynthesis' in window)) return;
    this.voiceReady = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
  }

  get on() { return this.level > 0 && !!this.ctx && this.ctx.state === 'running'; }

  tone(f, { t = 0, dur = .15, type = 'sine', g = .2, to = 0, a = .005 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t0 = c.currentTime + t, o = c.createOscillator(), v = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    v.gain.setValueAtTime(.0001, t0); v.gain.exponentialRampToValueAtTime(g, t0 + a); v.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(v); v.connect(this.out); o.start(t0); o.stop(t0 + dur + .05);
  }

  noise({ t = 0, dur = .2, g = .15, f = 2000, to = 0, type = 'bandpass', q = .8 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t0 = c.currentTime + t, s = c.createBufferSource(), flt = c.createBiquadFilter(), v = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f, t0);
    if (to) flt.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    v.gain.setValueAtTime(.0001, t0); v.gain.exponentialRampToValueAtTime(g, t0 + dur * .35); v.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    s.connect(flt); flt.connect(v); v.connect(this.out); s.start(t0); s.stop(t0 + dur + .05);
  }

  /** One rep. The pitch climbs through each block of ten, so a set plays a rising run. */
  rep(n) {
    const f = SCALE[(n - 1) % 10];
    this.tone(f, { type: 'triangle', dur: .17, g: .22 });
    this.tone(f * 2, { dur: .09, g: .05 });
    this.tone(150, { to: 52, dur: .12, g: .32 });
    if (n % 10 === 0) { this.tone(2093, { t: .07, dur: .2, g: .08 }); this.tone(2637, { t: .14, dur: .26, g: .07 }); }
  }
  multi() {
    for (let i = 0; i < 5; i++) this.tone(SCALE[i + 2], { t: i * .035, dur: .1, type: 'triangle', g: .15 });
    this.tone(150, { to: 52, dur: .14, g: .3 });
  }
  undo() { this.tone(520, { to: 260, dur: .15, type: 'triangle', g: .14 }); }
  click() { this.tone(900, { dur: .045, type: 'triangle', g: .07 }); }
  second() { this.noise({ dur: .035, g: .05, f: 6500, type: 'highpass' }); }
  beep(go) { this.tone(go ? 1320 : 880, { dur: go ? .34 : .11, type: 'triangle', g: .22 }); }
  stop() { this.tone(500, { to: 330, dur: .18, type: 'triangle', g: .16 }); }

  done() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, { t: i * .075, dur: .36, type: 'triangle', g: .2 });
      this.tone(f * 2, { t: i * .075, dur: .22, g: .05 });
    });
    this.tone(130.81, { dur: .5, g: .22 });
    this.noise({ dur: .55, g: .1, f: 700, to: 5200, q: .7 });
  }
  gold() {
    this.done();
    [1318.51, 1567.98, 2093, 2637].forEach((f, i) => this.tone(f, { t: .34 + i * .07, dur: .4, g: .09 }));
    this.noise({ t: .3, dur: .7, g: .07, f: 5000, type: 'highpass' });
  }
  fullDay() {
    [[392, 0], [523.25, .14], [659.25, .28], [783.99, .42]].forEach(([f, t]) => this.tone(f, { t, dur: .16, type: 'triangle', g: .22 }));
    [523.25, 659.25, 783.99, 1046.5].forEach(f => { this.tone(f, { t: .6, dur: 1.5, type: 'triangle', g: .15, a: .02 }); this.tone(f * 2, { t: .6, dur: 1, g: .04 }); });
    this.tone(65.41, { t: .6, dur: 1.5, g: .3 }); this.tone(130.81, { t: .6, dur: 1.5, g: .2 });
    this.noise({ t: .5, dur: 1.7, g: .13, f: 500, to: 7000, q: .6 });
    [2093, 2637, 3136, 4186].forEach((f, i) => this.tone(f, { t: .95 + i * .09, dur: .5, g: .05 }));
  }

  say(text) {
    if (this.level < 2 || !('speechSynthesis' in window)) return;
    try {
      const s = window.speechSynthesis; s.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'en-US'; u.rate = 1.08; u.volume = 1;
      s.speak(u);
    } catch { /* speech not available */ }
  }
  hush() { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
}

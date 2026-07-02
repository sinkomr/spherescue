/* Audio: original music + SFX synthesized with WebAudio.
 *
 * The original game's celebrated soundtrack was hard techno/electronica;
 * this is an original composition in that spirit — a pattern-sequenced
 * groove with an acid-ish bass, offbeat stabs, and a four-on-the-floor kick.
 * Nothing here is sampled from the game.
 */
'use strict';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.step = 0;
    this.nextStepTime = 0;
    this.bpm = 132;
    this.pattern = 0;      // song section
    this.bar = 0;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.62;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      // gentle delay send for space
      this.delay = this.ctx.createDelay(0.6);
      this.delay.delayTime.value = 60 / this.bpm * 0.75;
      const fb = this.ctx.createGain(); fb.gain.value = 0.28;
      const wet = this.ctx.createGain(); wet.gain.value = 0.18;
      this.delay.connect(fb); fb.connect(this.delay);
      this.delay.connect(wet); wet.connect(this.master);
      this.nextStepTime = this.ctx.currentTime + 0.05;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /* ---------------- music sequencer ---------------- */

  update() {
    if (!this.ctx || !this.enabled || !this.musicOn) return;
    const spb = 60 / this.bpm / 4; // 16th note
    while (this.nextStepTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.step++;
      if (this.step % 16 === 0) {
        this.bar++;
        if (this.bar % 8 === 0) this.pattern = (this.pattern + 1) % 4;
      }
      this.nextStepTime += spb;
    }
  }

  scheduleStep(step, t) {
    const s = step % 16;
    const sec = this.pattern;
    // kick: four on the floor (drop it on section 2 breakdown)
    if (s % 4 === 0 && sec !== 2) this.kick(t);
    // hats
    if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.5 : 0.25);
    // snare-ish clap on 2 and 4 in the driving sections
    if ((s === 4 || s === 12) && (sec === 1 || sec === 3)) this.clap(t);

    // bass line (E minor-ish acid pattern)
    const bassSeq = [0, 0, 12, 0, 3, 0, 0, 10, 0, 0, 12, 3, 0, 15, 0, 10];
    const roots = [40, 40, 36, 38]; // E2, E2, C2, D2 by section
    if (bassSeq[s] !== 0 || s % 4 === 2) {
      const semis = roots[sec] + (bassSeq[s] % 12);
      this.acid(t, midiHz(semis), sec === 2 ? 0.15 : 0.3);
    }
    // stabs: offbeat minor chord in sections 1,3
    if ((sec === 1 || sec === 3) && s % 4 === 2) {
      this.stab(t, [64, 67, 71].map(n => midiHz(n - 12 * (sec === 3 ? 0 : 1))));
    }
    // sparkly lead in section 2/3
    const leadSeq = [76, 0, 79, 0, 83, 0, 79, 0, 76, 0, 74, 0, 71, 0, 74, 0];
    if (sec >= 2 && leadSeq[s]) this.pluck(t, midiHz(leadSeq[s]), 0.10);
  }

  kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.26);
  }

  hat(t, vol) {
    const b = this.noiseBuf();
    const src = this.ctx.createBufferSource(); src.buffer = b;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t); src.stop(t + 0.06);
  }

  clap(t) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf();
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f); f.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    src.start(t); src.stop(t + 0.2);
  }

  acid(t, hz, dur) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 9;
    f.frequency.setValueAtTime(hz * 6, t);
    f.frequency.exponentialRampToValueAtTime(hz * 1.6, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  stab(t, freqs) {
    for (const hz of freqs) {
      const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g); g.connect(this.musicBus); g.connect(this.delay);
      o.start(t); o.stop(t + 0.16);
    }
  }

  pluck(t, hz, vol) {
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o.stop(t + 0.25);
  }

  noiseBuf() {
    if (!this._noise) {
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noise = b;
    }
    return this._noise;
  }

  /* ---------------- sound effects ---------------- */

  sfx(kind, arg = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'move': this.blip(t, 620, 0.03, 0.08, 'square'); break;
      case 'slide': this.sweep(t, 300, 520, 0.08, 0.12); break;
      case 'drop': this.sweep(t, 700, 160, 0.10, 0.3); this.thud(t + 0.09); break;
      case 'land': this.thud(t); break;
      case 'clear': {
        const base = 440 * Math.pow(1.15, Math.min(arg, 8));
        [0, 0.05, 0.1].forEach((d, i) => this.blip(t + d, base * (1 + i * 0.26), 0.09, 0.22, 'triangle'));
        break;
      }
      case 'combo': {
        for (let i = 0; i < 5; i++) this.blip(t + i * 0.045, 520 * Math.pow(1.2, i + arg), 0.06, 0.18, 'sawtooth');
        break;
      }
      case 'bad': this.sweep(t, 220, 90, 0.25, 0.3); break;
      case 'menu': this.blip(t, 880, 0.05, 0.15, 'triangle'); break;
      case 'win': {
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.blip(t + i * 0.09, f, 0.16, 0.25, 'triangle'));
        break;
      }
      case 'lose': {
        [392, 370, 349, 311].forEach((f, i) => this.blip(t + i * 0.16, f, 0.2, 0.22, 'sawtooth'));
        break;
      }
      case 'magic': {
        for (let i = 0; i < 10; i++) this.blip(t + i * 0.03, 700 + Math.random() * 1400, 0.05, 0.12, 'sine');
        break;
      }
    }
  }

  blip(t, hz, dur, vol, type) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = hz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.02);
    o.connect(g); g.connect(this.sfxBus); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }

  sweep(t, f1, f2, dur, vol) {
    const o = this.ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.03);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  thud(t) {
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.14);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    return this.musicOn;
  }
}

function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

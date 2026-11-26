// audio.js — every sound in Kestrel Valley is synthesised with WebAudio:
// a two-oscillator engine note that follows RPM, filtered wind noise for
// airspeed, a chime for a ring flown, a thud for the wheels meeting the
// ground. Nothing is loaded; the AudioContext opens on the first keypress
// or click, as browsers require.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.stallClock = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: saw + square a fifth apart through a lowpass.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.4;
    this.oscA.connect(engineFilter);
    this.oscB.connect(oscBGain);
    oscBGain.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.oscA.start();
    this.oscB.start();

    // Wind: looped noise through a bandpass.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.noise.start();
  }

  update(dt, flight) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = flight.rpm;
    const freq = 42 + rpm * 68;
    this.oscA.frequency.setTargetAtTime(freq, t, 0.08);
    this.oscB.frequency.setTargetAtTime(freq * 1.5 + 3, t, 0.08);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : rpm * 0.16, t, 0.1);
    const wind = Math.min(0.30, flight.speed * 0.006);
    this.windGain.gain.setTargetAtTime(this.muted ? 0 : wind, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(320 + flight.speed * 14, t, 0.2);
    // Stall warning: a patient beep, twice a second.
    this.stallClock -= dt;
    if (flight.stalled && this.stallClock <= 0) {
      this.stallClock = 0.5;
      this.beep(880, 0.12, 0.05);
    }
  }

  beep(freq, dur, gain) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  chime() {
    this.beep(1318, 0.35, 0.10);
    setTimeout(() => this.beep(1760, 0.5, 0.09), 90);
  }

  thud(strength) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(Math.min(0.4, 0.12 + strength * 0.05), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  // The crash: a burst of noise through a lowpass that slams shut, over a
  // sine that falls off a cliff — one synthesized bang, nothing loaded.
  boom() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.7);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.55);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.85, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(filter);
    filter.connect(ng);
    ng.connect(this.master);
    src.start();
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    og.gain.setValueAtTime(0.7, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    osc.connect(og);
    og.connect(this.master);
    osc.start();
    osc.stop(t + 0.7);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}

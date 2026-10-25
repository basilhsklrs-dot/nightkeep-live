// Procedural Web Audio: impact SFX + adaptive battle music. No audio assets/licences needed.
export class Audio {
  constructor() { this.enabled = true; this.ctx = null; this.intensity = 0; this.nextNote = 0; this.step = 0; this.tempo = 112; this.lastSfx = {}; }
  ensure() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.22; this.music.connect(this.master);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(this.master);
    const len = this.ctx.sampleRate * 0.6; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setEnabled(on) { this.enabled = !!on; if (this.ctx) { if (on) this.ctx.resume(); else this.ctx.suspend(); } else if (on) this.ensure(); }
  resume() { this.ensure(); if (this.ctx?.state === 'suspended' && this.enabled) this.ctx.resume(); }
  ok(name, gap = 60) { if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return false; const n = performance.now(); if (n - (this.lastSfx[name] || 0) < gap) return false; this.lastSfx[name] = n; return true; }
  tone(freq, dur, type = 'square', vol = 0.2, slide = 0, out = this.sfx, at = this.ctx.currentTime) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.02);
  }
  burst(dur, vol, freq = 1200, q = 0.8, out = this.sfx, at = this.ctx.currentTime) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, at); f.frequency.exponentialRampToValueAtTime(80, at + dur); f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(at); s.stop(at + dur);
  }
  play(name) {
    if (!this.ok(name, name === 'hit' ? 70 : name === 'spawn' ? 90 : 120)) return;
    switch (name) {
      case 'spawn': this.tone(520, 0.09, 'square', 0.06, 1.6); break;
      case 'hit': this.burst(0.08, 0.12, 2400); break;
      case 'arrow': this.burst(0.12, 0.05, 5000, 4); break;
      case 'fire': this.tone(180, 0.35, 'sawtooth', 0.12, 0.4); this.burst(0.3, 0.12, 1800); break;
      case 'boom': this.tone(90, 0.6, 'sine', 0.45, 0.35); this.burst(0.55, 0.35, 900); break;
      case 'castle': this.tone(70, 0.4, 'triangle', 0.3, 0.5); this.burst(0.25, 0.2, 600); break;
      case 'shield': for (let i = 0; i < 4; i++) this.tone(880 + i * 220, 0.25, 'sine', 0.06, 1.01, this.sfx, this.ctx.currentTime + i * 0.05); break;
      case 'boss': this.tone(110, 1.2, 'sawtooth', 0.22, 0.98); this.tone(55, 1.4, 'square', 0.16, 1); break;
      case 'combo': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.18, 'square', 0.08, 1, this.sfx, this.ctx.currentTime + i * 0.07)); break;
      case 'beep': this.tone(880, 0.12, 'square', 0.12); break;
      case 'go': this.tone(1320, 0.4, 'square', 0.14, 1); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'square', 0.1, 1, this.sfx, this.ctx.currentTime + i * 0.14)); break;
      case 'destroyed': this.tone(60, 1.6, 'sawtooth', 0.35, 0.3); this.burst(1.4, 0.5, 700); break;
    }
  }
  /** Simple step sequencer; intensity 0..1 adds drums/arp and speeds up. */
  music_tick(active, intensity) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    this.intensity += (intensity - this.intensity) * 0.05;
    const tempo = this.tempo + this.intensity * 36, spb = 60 / tempo / 4;
    const now = this.ctx.currentTime;
    if (this.nextNote < now) this.nextNote = now + 0.05;
    const roots = [45, 45, 41, 43], arp = [0, 7, 12, 15, 12, 7, 3, 7];
    while (this.nextNote < now + 0.2) {
      const s = this.step++ % 64, bar = Math.floor(s / 16), r = roots[bar], t = this.nextNote;
      const hz = m => 440 * 2 ** ((m - 69) / 12);
      if (active) {
        if (s % 4 === 0) this.tone(hz(r - 12), spb * 3.5, 'triangle', 0.32, 1, this.music, t);
        if (s % 8 === 0) { this.tone(140, 0.18, 'sine', 0.55, 0.3, this.music, t); }
        if (this.intensity > 0.25 && s % 8 === 4) this.burst(0.12, 0.25, 3000, 0.7, this.music, t);
        if (this.intensity > 0.15 && s % 2 === 0) this.burst(0.03, 0.06, 9000, 1, this.music, t);
        if (this.intensity > 0.45) this.tone(hz(r + 12 + arp[s % 8]), spb * 0.9, 'square', 0.045, 1, this.music, t);
      } else if (s % 8 === 0) this.tone(hz(r), spb * 7, 'sine', 0.12, 1, this.music, t);
      this.nextNote += spb;
    }
  }
}

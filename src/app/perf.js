// FPS-Messung + automatische Qualitätsstufe (Ziel ≥ 30 FPS).
export const LEVELS = ['niedrig', 'mittel', 'hoch'];
export class PerfMonitor {
  constructor(apply, start = 'hoch') { this.apply = apply; this.level = start; this.samples = []; this.fps = 60; this.low = 0; this.high = 0; this.auto = true; this.cool = 0; }
  frame(dt) {
    if (dt <= 0) return; this.samples.push(dt); if (this.samples.length > 60) this.samples.shift();
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length; this.fps = 1 / avg;
    if (!this.auto || this.samples.length < 60) return; this.cool -= dt; if (this.cool > 0) return;
    if (this.fps < 28) this.low += dt; else this.low = 0;
    if (this.fps > 55) this.high += dt; else this.high = 0;
    const i = LEVELS.indexOf(this.level);
    if (this.low > 3 && i > 0) this.set(LEVELS[i - 1]);
    else if (this.high > 20 && i < 2) this.set(LEVELS[i + 1]);
  }
  set(l) { this.level = l; this.low = this.high = 0; this.cool = 4; this.samples.length = 0; this.apply(l); }
}

// Prozedurale WebAudio-Musik + gedämpfte SFX (Tiefpass), keine Audiodateien.
let ctx = null, master, musicBus, sfxBus, muffle, musicTimer = null, step = 0;
const cfg = { music: true, sfx: true, volume: 0.6 };
const SCALE = [0, 3, 5, 7, 10, 12, 15]; // Moll-Pentatonik
export function configure(o) { Object.assign(cfg, o); if (!ctx) return; master.gain.value = cfg.volume; musicBus.gain.value = cfg.music ? 0.35 : 0; sfxBus.gain.value = cfg.sfx ? 0.8 : 0; if (cfg.music) startMusic(); else stopMusic(); }
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
  musicBus = ctx.createGain(); const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 1800; musicBus.connect(mf); mf.connect(master);
  muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 900; muffle.Q.value = 0.7; // "Weltraum"-Dämpfung
  sfxBus = ctx.createGain(); sfxBus.connect(muffle); muffle.connect(master);
  configure({});
}
export function state() { return ctx ? { running: ctx.state, music: !!musicTimer } : null; }
function note(midi, t, dur, type, gain, bus = musicBus) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.4, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
let tension = 0; export function setTension(v) { tension = v; }
function startMusic() {
  if (musicTimer || !ctx) return;
  const root = 45; const prog = [0, 8, 3, 10];
  musicTimer = setInterval(() => {
    if (ctx.state !== 'running') return; const t = ctx.currentTime + 0.05; const chord = prog[Math.floor(step / 16) % 4];
    if (step % 16 === 0) for (const iv of [0, 7, 12, 15]) note(root + chord + iv, t, 4.2, 'sine', 0.07);
    const every = tension ? 1 : 2;
    if (step % every === 0 && Math.random() < (tension ? 0.8 : 0.5)) note(root + 24 + chord + SCALE[Math.floor(Math.random() * SCALE.length)], t, 0.6, 'triangle', 0.05);
    if (tension && step % 4 === 0) note(root - 12 + chord, t, 0.3, 'sawtooth', 0.05);
    step++;
  }, 250);
}
function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
let lastShot = 0;
export function sfx(kind, size = 1) {
  if (!ctx || !cfg.sfx || ctx.state !== 'running') return; const t = ctx.currentTime;
  if (kind === 'shot') { if (t - lastShot < 0.07) return; lastShot = t; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(700 + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.12); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.15); return; }
  if (kind === 'boom') {
    const len = 0.4 + size * 0.25; const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500 / Math.max(1, size * 0.6);
    src.buffer = buf; g.gain.value = Math.min(0.9, 0.25 + size * 0.12); src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t); return;
  }
  if (kind === 'click') note(84, t, 0.08, 'sine', 0.05, sfxBus);
}

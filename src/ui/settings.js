// Einstellungen (localStorage): Farbenblind, UI-Skalierung, Partikel, Bildschirmwackeln, Audio.
const KEY = 'gatebreaker-settings';
export const DEFAULTS = { colorblind: false, scale: 1, particles: true, shake: true, music: true, sfx: true, volume: 0.6, quality: 'auto' };
export function loadSettings(store = globalThis.localStorage) { try { return { ...DEFAULTS, ...JSON.parse(store?.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } }
export function saveSettings(s, store = globalThis.localStorage) { store?.setItem(KEY, JSON.stringify(s)); }
export function clampScale(v) { return Math.min(1.4, Math.max(0.8, Math.round(+v * 20) / 20 || 1)); }
const chk = (k, label, s) => `<label class="set"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}> ${label}</label>`;
export function settingsHtml(s) {
  return `<h2>Einstellungen</h2>
  <h3>Darstellung</h3>
  ${chk('colorblind', 'Farbenblind-Modus (Blau/Orange statt Blau/Rot)', s)}
  <label class="set">UI-Größe <input type="range" min="0.8" max="1.4" step="0.05" data-set="scale" value="${s.scale}"> <span id="set-scale">${Math.round(s.scale * 100)}%</span></label>
  <label class="set">Grafikqualität <select data-set="quality">${['auto', 'hoch', 'mittel', 'niedrig'].map(q => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${q === 'auto' ? 'Automatisch (Ziel 30+ FPS)' : q}</option>`).join('')}</select></label>
  ${chk('particles', 'Partikel-Effekte (Explosionsfunken)', s)}
  ${chk('shake', 'Bildschirmwackeln bei großen Explosionen', s)}
  <h3>Audio</h3>
  ${chk('music', 'Prozedurale Musik', s)}
  ${chk('sfx', 'Soundeffekte (gedämpft)', s)}
  <label class="set">Lautstärke <input type="range" min="0" max="1" step="0.05" data-set="volume" value="${s.volume}"></label>
  <p class="dim">Wird lokal gespeichert. Audio startet nach der ersten Interaktion.</p>
  <button data-act="closemodal">Schließen</button>`;
}

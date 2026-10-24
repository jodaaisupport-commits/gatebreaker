// Update-Hinweis: vergleicht die laufende Version mit version.json der Live-Seite.
import { VERSION, LIVE_URL } from './version.js';
export function newer(a, b) { const p = s => String(s).split('.').map(n => parseInt(n) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
export function startUpdateCheck(onNew, everyMs = 5 * 60e3) {
  const native = !!window.Capacitor?.isNativePlatform?.();
  const url = (native ? LIVE_URL : './') + 'version.json';
  let told = false;
  const check = async () => { try { const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return; const j = await r.json(); if (!told && newer(j.version, VERSION)) { told = true; onNew(j, native); } } catch { /* offline */ } };
  setTimeout(check, 8000); return setInterval(check, everyMs);
}

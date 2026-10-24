// Save-Versionierung, Validierung, Migration, Export/Import, Backup-Slot (DOM-frei).
export const SAVE_VERSION = 4;
export const BACKUP_KEY = 'gatebreaker-save-backup';
export const BACKUP_EVERY = 60; // s
// Schrittweise Migrationen: MIGRATIONS[n] hebt einen Stand von Version n auf n+1.
export const MIGRATIONS = {
  1: s => { s.version = 2; },
  2: s => { s.version = 3; }, // v0.2–0.5: Felder werden in migrate() ergänzt
  3: s => { // v0.6: Fraktionsfeld für KI-Flotten, Flags für Sieg/Niederlage
    for (const f of s.fleets || []) if (f.owner === 'ai' && !f.faction) f.faction = 'draxis';
    s.flags = { victory: 0, defeat: 0, ...(s.flags || {}) }; s.version = 4;
  },
};
export function migrateSave(s) {
  let v = s.version || 1; const steps = [];
  while (v < SAVE_VERSION) { const m = MIGRATIONS[v]; if (!m) throw new Error('Keine Migration für Version ' + v); m(s); steps.push(v); v = s.version = v + 1; }
  return steps;
}
const isNum = x => typeof x === 'number' && Number.isFinite(x);
export function validateSave(s) {
  const e = [];
  if (!s || typeof s !== 'object') return ['kein Objekt'];
  if (s.version > SAVE_VERSION) e.push(`neuere Save-Version ${s.version} (Spiel kennt ${SAVE_VERSION})`);
  if (!s.res || typeof s.res !== 'object') e.push('Ressourcen fehlen'); else for (const [k, v] of Object.entries(s.res)) if (!isNum(v)) e.push(`Ressource ${k} ungültig`);
  if (!s.planets || typeof s.planets !== 'object' || !Object.keys(s.planets).length) e.push('Planeten fehlen');
  if (!Array.isArray(s.fleets)) e.push('Flotten fehlen'); else for (const f of s.fleets) if (!f || typeof f.ships !== 'object') { e.push('Flotte ungültig'); break; }
  if (!isNum(s.time)) e.push('Spielzeit ungültig');
  if (!s.explored || typeof s.explored !== 'object') e.push('Erkundung fehlt');
  return e;
}
// NaN/Infinity reparieren statt abzustürzen
export function sanitize(s) { let n = 0; for (const k in s.res) if (!isNum(s.res[k])) { s.res[k] = 0; n++; } else if (s.res[k] < 0) s.res[k] = 0; return n; }
export function exportSave(state, gameVersion, now = Date.now()) {
  const { events, ...rest } = state;
  return JSON.stringify({ format: 'gatebreaker-save', saveVersion: SAVE_VERSION, gameVersion, exportedAt: new Date(now).toISOString(), state: rest }, null, 1);
}
export function parseImport(text) {
  let o; try { o = JSON.parse(text); } catch { throw new Error('Keine gültige JSON-Datei.'); }
  const st = o?.format === 'gatebreaker-save' ? o.state : o;
  migrateSave(st); const errs = validateSave(st); if (errs.length) throw new Error('Spielstand ungültig: ' + errs.join(', '));
  return st;
}

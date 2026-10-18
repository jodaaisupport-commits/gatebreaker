import { Renderer } from './render/scenes.js';
import * as Sim from './game/sim.js';
import { resourcesHtml, leftHtml, rightHtml, battleBarsHtml, reportHtml, offlineHtml, PRIORITIES } from './ui/ui.js';

const $ = s => document.querySelector(s);
let { state, offline } = Sim.load(localStorage);
const ui = { view: 'galaxy', selectedSystem: 'helios', systemView: 'helios', selectedPlanet: null, selectedFleet: state.fleets.find(f => f.owner === 'player')?.id ?? null, prevView: 'galaxy' };
const R = new Renderer($('#c'), $('#labels'));
R.setView('galaxy'); R.focusSystem('helios');
let dirty = true, holding = false, last = performance.now(), uiAcc = 0, saveAcc = 0, battleRef = null;

// ---------- Ansichten ----------
function setView(v) {
  if (v === 'battle' && !state.battle) return;
  if (v === 'system') {
    const id = ui.view === 'galaxy' ? (ui.selectedSystem || ui.systemView) : ui.systemView;
    if (!state.explored[id]) { toast('warn', 'System noch unerforscht.'); return; }
    if (!R.views.system || R.views.system.sysId !== id) { R.buildSystem(id); ui.selectedPlanet = null; }
    ui.systemView = id;
  }
  if (v !== 'battle') ui.prevView = v;
  ui.view = v; R.setView(v);
  document.querySelectorAll('#views [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#battle-hud').classList.toggle('hidden', v !== 'battle'); document.body.classList.toggle('in-battle', v === 'battle');
  $('#left').classList.toggle('hidden', v === 'battle'); $('#right').classList.toggle('hidden', v === 'battle');
  dirty = true;
}
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (k === 'g') setView('galaxy'); else if (k === 's') setView('system'); else if (k === 'b') setView('battle'); else if (k === 't') R.toggleTactical();
  else if (k === 'escape') { closeModal(); ui.selectedPlanet = null; dirty = true; }
});
document.querySelectorAll('#views [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#btn-new').addEventListener('click', () => {
  if (!confirm('Spielstand wirklich löschen und neu beginnen?')) return;
  localStorage.removeItem(Sim.SAVE_KEY); state = Sim.newGame();
  if (R.views.system) R.disposeView(R.views.system); R.views.system = null; ui.selectedPlanet = null; ui.selectedSystem = 'helios';
  ui.selectedFleet = state.fleets.find(f => f.owner === 'player').id; setView('galaxy'); toast('info', 'Neues Spiel gestartet.');
});
$('#btn-report').addEventListener('click', () => state.lastReport ? openModal(reportHtml(state.lastReport)) : toast('info', 'Noch kein Gefechtsbericht.'));

// ---------- Auswahl in 3D ----------
// Maus und Touch über Pointer-Events: Tippen = auswählen, Doppeltippen/Doppelklick auf System = betreten.
// Gesten mit mehreren Fingern (Pinch-Zoom, Zwei-Finger-Verschieben) zählen nie als Tippen.
let down = null, lastTap = null; const pointers = new Set();
$('#c').addEventListener('pointerdown', e => { pointers.add(e.pointerId); if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), multi: false }; else if (down) down.multi = true; });
$('#c').addEventListener('pointercancel', e => { pointers.delete(e.pointerId); down = null; });
$('#c').addEventListener('pointerup', e => {
  pointers.delete(e.pointerId);
  const d = down; if (pointers.size === 0) down = null;
  if (!d || d.multi || pointers.size > 0) return;
  const slop = e.pointerType === 'touch' ? 12 : 5;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > slop || performance.now() - d.t > 600) return;
  const hit = R.pick(e);
  const now = performance.now();
  const dbl = lastTap && now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
  lastTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
  if (!hit) return;
  if (hit.system) { ui.selectedSystem = hit.system; if (dbl && ui.view === 'galaxy') { setView('system'); return; } }
  if (hit.planet) ui.selectedPlanet = hit.planet;
  if (hit.fleet) { const f = state.fleets.find(x => x.id === hit.fleet); if (f?.owner === 'player') ui.selectedFleet = f.id; }
  dirty = true;
});
// Mobile: Panels ein-/ausklappen
$('#btn-left').addEventListener('click', () => { document.body.classList.toggle('hide-left'); });
$('#btn-right').addEventListener('click', () => { document.body.classList.toggle('hide-right'); });
if (matchMedia('(pointer: coarse)').matches) { document.body.classList.add('touch'); if (innerWidth < 1000) document.body.classList.add('hide-right'); }

// ---------- Panel-Aktionen ----------
function act(name, id, el) {
  let err = null;
  switch (name) {
    case 'enter': ui.selectedSystem = id; setView('system'); break;
    case 'move': err = Sim.actions.moveFleet(state, ui.selectedFleet, id); if (!err) toast('info', `Flotte unterwegs nach ${Sim.sysById(id).name}.`); break;
    case 'build': err = Sim.actions.build(state, ui.selectedPlanet, id); break;
    case 'ship': err = Sim.actions.buildShip(state, id, +el.dataset.n); break;
    case 'selfleet': ui.selectedFleet = +id; break;
    case 'split': err = Sim.actions.splitFleet(state, +id); break;
    case 'merge': err = Sim.actions.mergeFleets(state, +id); break;
    case 'rename': { const n = prompt('Neuer Flottenname:'); if (n) Sim.actions.renameFleet(state, +id, n); break; }
    case 'bombard': err = Sim.actions.bombard(state, id); if (!err) toast('warn', 'Bombardement begonnen.'); break;
    case 'land': err = Sim.actions.landTroops(state, id); break;
    case 'deselect': ui.selectedPlanet = null; break;
    case 'closemodal': closeModal(); break;
  }
  if (err) toast('warn', err);
  dirty = true; holding = false; flush();
}
for (const el of [$('#left'), $('#right'), $('#modal-body')]) {
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    e.stopPropagation(); act(t.dataset.act, t.dataset.id, t);
  });
  el.addEventListener('pointerdown', () => { holding = true; });
}
window.addEventListener('pointerup', () => setTimeout(() => { holding = false; }, 50));

// ---------- Schlacht-HUD ----------
$('#prio').innerHTML = Object.entries(PRIORITIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
function syncBattleControls() {
  const s = state.battleSettings;
  document.querySelectorAll('[data-form]').forEach(b => b.classList.toggle('active', b.dataset.form === s.formation));
  const tot = s.energy.w + s.energy.s + s.energy.a || 1;
  for (const k of ['w', 's', 'a']) { $(`[data-en="${k}"]`).value = s.energy[k]; $(`[data-enval="${k}"]`).textContent = Math.round(s.energy[k] / tot * 100) + '%'; }
  $('#prio').value = s.priority;
}
document.querySelectorAll('[data-form]').forEach(b => b.addEventListener('click', () => { Sim.actions.setBattleSettings(state, { formation: b.dataset.form }); syncBattleControls(); }));
document.querySelectorAll('[data-en]').forEach(inp => inp.addEventListener('input', () => { const e = { ...state.battleSettings.energy, [inp.dataset.en]: +inp.value }; Sim.actions.setBattleSettings(state, { energy: e }); syncBattleControls(); }));
$('#prio').addEventListener('change', e => Sim.actions.setBattleSettings(state, { priority: e.target.value }));
$('#btn-retreat').addEventListener('click', () => Sim.actions.retreat(state));
$('#btn-tact').addEventListener('click', () => R.toggleTactical());
syncBattleControls();

// ---------- Toasts & Modal ----------
function toast(level, text, onClick) {
  const d = document.createElement('div'); d.className = 'toast ' + level; d.textContent = text;
  d.addEventListener('click', () => { onClick?.(); d.remove(); });
  $('#toasts').prepend(d); setTimeout(() => d.remove(), level === 'alert' ? 9000 : 5000);
  while ($('#toasts').children.length > 6) $('#toasts').lastChild.remove();
}
function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
if (offline) openModal(offlineHtml(offline));

// ---------- Hauptschleife ----------
const cache = {};
function setHtml(sel, html) { if (cache[sel] !== html) { cache[sel] = html; $(sel).innerHTML = html; } }
function flush() {
  setHtml('#resources', resourcesHtml(state));
  if (!holding) { setHtml('#left', leftHtml(state, ui)); setHtml('#right', rightHtml(state, ui)); }
  $('#btn-battle').classList.toggle('hidden', !state.battle);
  if (state.battle && ui.view === 'battle') setHtml('#battle-bars', battleBarsHtml(state.battle));
}
function drainEvents() {
  for (const e of state.events) {
    if (e.battle) toast('alert', e.text, () => setView('battle'));
    else if (e.report) { if (!e.auto && !state.battle) openModal(reportHtml(state.lastReport)); else toast(e.level, e.text + ' (Klick: Bericht)', () => openModal(reportHtml(state.lastReport))); }
    else toast(e.level, e.text);
  }
  state.events.length = 0;
}
function frame(now) {
  const gap = (now - last) / 1000; const dt = Math.min(0.25, gap); last = now;
  // Tab war im Hintergrund: Zeit wie offline nachholen (max. 8h)
  if (gap > 1.5) { let l = Math.min(gap, 8 * 3600); while (l > 0) { const d = Math.min(1, l); Sim.tick(state, d, { offline: true }); l -= d; } }
  let left = dt; while (left > 1e-6) { const d = Math.min(0.05, left); Sim.tick(state, d); left -= d; }
  if (state.battle && battleRef !== state.battle) { battleRef = state.battle; R.buildBattle(state.battle); syncBattleControls(); setView('battle'); }
  if (!state.battle && battleRef) { battleRef = null; if (ui.view === 'battle') setView(ui.prevView || 'galaxy'); }
  drainEvents();
  if (R.view === 'galaxy') R.updateGalaxy(state, ui);
  if (R.view === 'system') R.updateSystem(state, ui, now);
  if (R.view === 'battle' && state.battle) R.updateBattle(state.battle);
  uiAcc += dt; if (uiAcc > 0.25 || dirty) { uiAcc = 0; dirty = false; flush(); }
  saveAcc += dt; if (saveAcc > 5) { saveAcc = 0; Sim.save(state, localStorage); }
  R.render();
  requestAnimationFrame(frame);
}
addEventListener('beforeunload', () => Sim.save(state, localStorage));
document.addEventListener('visibilitychange', () => { if (document.hidden) Sim.save(state, localStorage); });
setView('galaxy');
requestAnimationFrame(frame);
// Test-/Debug-Zugriff
window.gb = { get state() { return state; }, Sim, ui, setView, R };

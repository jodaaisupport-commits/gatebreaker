import { Renderer } from './render/scenes.js';
import * as Sim from './game/sim.js';
import { resourcesHtml, leftHtml, rightHtml, battleBarsHtml, reportHtml, offlineHtml, factionPickerHtml, PRIORITIES } from './ui/ui.js';

const $ = s => document.querySelector(s);
let loaded = Sim.load(localStorage);
let state = loaded.state;
let awaitingFaction = false;
const ui = { view: 'galaxy', selectedSystem: 'helios', systemView: 'helios', selectedPlanet: null, selectedFleet: null, prevView: 'galaxy', panel: 'main' };
const R = new Renderer($('#c'), $('#labels'));
R.setView('galaxy'); R.focusSystem('helios');
let dirty = true, holding = false, last = performance.now(), uiAcc = 0, saveAcc = 0, battleRef = null;

function startWithFaction(id) {
  state = Sim.newGame(Date.now(), id);
  awaitingFaction = false;
  ui.selectedPlanet = null; ui.selectedSystem = 'helios'; ui.panel = 'main';
  ui.selectedFleet = state.fleets.find(f => f.owner === 'player')?.id ?? null;
  if (R.views.system) { R.disposeView(R.views.system); R.views.system = null; }
  setView('galaxy'); closeModal(); toast('info', `Fraktion: ${Sim.faction(state).name}. Viel Erfolg, Kommandant.`);
  dirty = true; flush();
  Sim.save(state, localStorage);
}

if (!state || loaded.needsFaction) {
  // Fraktionswahl beim ersten Start / wenn kein gültiger Speicherstand – noch nicht speichern
  awaitingFaction = true;
  openModal(factionPickerHtml());
  state = Sim.newGame(Date.now(), 'bergbau'); // temporär bis Auswahl
} else {
  ui.selectedFleet = state.fleets.find(f => f.owner === 'player')?.id ?? null;
  if (loaded.offline) openModal(offlineHtml(loaded.offline));
}

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
  else if (k === 'f') { ui.panel = ui.panel === 'tech' ? 'main' : 'tech'; dirty = true; }
  else if (k === 'k') { ui.panel = ui.panel === 'war' ? 'main' : 'war'; dirty = true; }
  else if (k === 'i') { ui.panel = ui.panel === 'empire' ? 'main' : 'empire'; dirty = true; }
  else if (k === 'escape') { closeModal(); ui.selectedPlanet = null; ui.panel = 'main'; dirty = true; }
});
document.querySelectorAll('#views [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#btn-new').addEventListener('click', () => {
  if (!confirm('Spielstand wirklich löschen und neu beginnen?')) return;
  localStorage.removeItem(Sim.SAVE_KEY); localStorage.removeItem('gatebreaker-save-v1');
  openModal(factionPickerHtml());
});
$('#btn-report').addEventListener('click', () => state.lastReport ? openModal(reportHtml(state.lastReport)) : toast('info', 'Noch kein Gefechtsbericht.'));
$('#btn-empire')?.addEventListener('click', () => { ui.panel = ui.panel === 'empire' ? 'main' : 'empire'; dirty = true; flush(); });
$('#btn-war')?.addEventListener('click', () => { ui.panel = ui.panel === 'war' ? 'main' : 'war'; dirty = true; flush(); });
$('#btn-tech')?.addEventListener('click', () => { ui.panel = ui.panel === 'tech' ? 'main' : 'tech'; dirty = true; flush(); });

// ---------- Auswahl in 3D ----------
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
    case 'ship': err = Sim.actions.buildShip(state, id, +el.dataset.n, ui.selectedPlanet); break;
    case 'selfleet': ui.selectedFleet = +id; break;
    case 'split': err = Sim.actions.splitFleet(state, +id); break;
    case 'merge': err = Sim.actions.mergeFleets(state, +id); break;
    case 'rename': { const n = prompt('Neuer Flottenname:'); if (n) Sim.actions.renameFleet(state, +id, n); break; }
    case 'bombard': err = Sim.actions.bombard(state, id); if (!err) toast('warn', 'Bombardement begonnen.'); break;
    case 'land': err = Sim.actions.landTroops(state, id); break;
    case 'survey': err = Sim.actions.survey(state, id); break;
    case 'colonize': err = Sim.actions.colonize(state, id); break;
    case 'research': err = Sim.actions.research(state, id); break;
    case 'panel': ui.panel = id || 'main'; break;
    case 'law': err = Sim.actions.setLaw(state, id, el.dataset.law, el.dataset.val); break;
    case 'hiregov': err = Sim.actions.hireGovernor(state, id, el.dataset.trait); break;
    case 'firegov': err = Sim.actions.fireGovernor(state, id); break;
    case 'crew': err = Sim.actions.assignCrew(state, +id); break;
    case 'buy': err = Sim.actions.trade(state, id, 'buy', 100); break;
    case 'sell': err = Sim.actions.trade(state, id, 'sell', 100); break;
    case 'addorder': err = Sim.actions.addOrder(state, $('#ord-res').value, $('#ord-mode').value, $('#ord-th').value, $('#ord-am').value); break;
    case 'delorder': err = Sim.actions.removeOrder(state, id); break;
    case 'eprio': err = Sim.actions.energyPrioUp(state, id); break;
    case 'treaty': err = Sim.actions.proposeTreaty(state); break;
    case 'recruit': err = Sim.actions.recruitTroops(state, id, 5); break;
    case 'hirespy': err = Sim.actions.hireSpy(state, id); break;
    case 'spymission': err = Sim.actions.spyMission(state, id); break;
    case 'expedition': err = Sim.actions.expedition(state, id); break;
    case 'gateheart': err = Sim.actions.activateGateHeart(state); break;
    case 'patrol': err = Sim.actions.togglePatrol(state, id); break;
    case 'intercept': err = Sim.actions.toggleIntercept(state, id); break;
    case 'wrecks': err = Sim.actions.researchWrecks(state); break;
    case 'release': err = Sim.actions.releasePrisoners(state); break;
    case 'gift': err = Sim.actions.giftAlly(state); break;
    case 'ally': err = Sim.actions.proposeAlliance(state); break;
    case 'leaveally': err = Sim.actions.leaveAlliance(state); break;
    case 'peace': err = Sim.actions.peaceTalks(state, id); break;
    case 'resolveq': err = Sim.actions.resolveQueued(state, id); break;
    default: if (window.gbActs?.[name]) err = window.gbActs[name](state, id, el, ui);
    case 'pickfaction': startWithFaction(id); return;
    case 'deselect': ui.selectedPlanet = null; ui.panel = 'main'; break;
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
  $('#btn-speed')?.classList.toggle('active', state.battleSpeed === 2);
  if ($('#btn-speed')) $('#btn-speed').textContent = state.battleSpeed === 2 ? 'Tempo ×2' : 'Tempo ×1';
}
document.querySelectorAll('[data-form]').forEach(b => b.addEventListener('click', () => { Sim.actions.setBattleSettings(state, { formation: b.dataset.form }); syncBattleControls(); }));
document.querySelectorAll('[data-en]').forEach(inp => inp.addEventListener('input', () => { const e = { ...state.battleSettings.energy, [inp.dataset.en]: +inp.value }; Sim.actions.setBattleSettings(state, { energy: e }); syncBattleControls(); }));
$('#prio').addEventListener('change', e => Sim.actions.setBattleSettings(state, { priority: e.target.value }));
$('#btn-retreat').addEventListener('click', () => Sim.actions.retreat(state));
$('#btn-tact').addEventListener('click', () => R.toggleTactical());
$('#btn-speed')?.addEventListener('click', () => { Sim.actions.setBattleSpeed(state, state.battleSpeed === 2 ? 1 : 2); syncBattleControls(); });
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

// ---------- Hauptschleife ----------
const cache = {};
function setHtml(sel, html) { if (cache[sel] !== html) { cache[sel] = html; $(sel).innerHTML = html; } }
function flush() {
  if (!state) return;
  setHtml('#resources', resourcesHtml(state));
  const ae = document.activeElement; const typing = ae && ae.matches?.('input,select') && $('#left').contains(ae);
  if (!holding && !typing) { setHtml('#left', leftHtml(state, ui)); setHtml('#right', rightHtml(state, ui)); }
  $('#btn-battle').classList.toggle('hidden', !state.battle);
  if (state.battle && ui.view === 'battle') setHtml('#battle-bars', battleBarsHtml(state.battle));
}
function drainEvents() {
  for (const e of state.events) {
    if (e.battle) toast('alert', e.text, () => setView('battle'));
    else if (e.report) { if (!e.auto && !state.battle) openModal(reportHtml(state.lastReport)); else toast(e.level, e.text + ' (Klick: Bericht)', () => openModal(reportHtml(state.lastReport))); }
    else if (!e.quiet) toast(e.level, e.text);
  }
  state.events.length = 0;
}
function frame(now) {
  if (!state) { requestAnimationFrame(frame); return; }
  const gap = (now - last) / 1000; const dt = Math.min(0.25, gap); last = now;
  if (gap > 1.5) { let l = Math.min(gap, 8 * 3600); while (l > 0) { const d = Math.min(1, l); Sim.tick(state, d, { offline: true }); l -= d; } }
  let left = dt; while (left > 1e-6) { const d = Math.min(0.05, left); Sim.tick(state, d); left -= d; }
  if (state.battle && battleRef !== state.battle) { battleRef = state.battle; R.buildBattle(state.battle); syncBattleControls(); setView('battle'); }
  if (!state.battle && battleRef) { battleRef = null; if (ui.view === 'battle') setView(ui.prevView || 'galaxy'); }
  drainEvents();
  if (R.view === 'galaxy') R.updateGalaxy(state, ui);
  if (R.view === 'system') R.updateSystem(state, ui, now);
  if (R.view === 'battle' && state.battle) R.updateBattle(state.battle);
  uiAcc += dt; if (uiAcc > 0.25 || dirty) { uiAcc = 0; dirty = false; flush(); }
  saveAcc += dt; if (saveAcc > 5 && !awaitingFaction) { saveAcc = 0; Sim.save(state, localStorage); }
  R.render();
  requestAnimationFrame(frame);
}
addEventListener('beforeunload', () => { if (state && !awaitingFaction) Sim.save(state, localStorage); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state && !awaitingFaction) Sim.save(state, localStorage); });
setView('galaxy');
requestAnimationFrame(frame);
window.gb = { get state() { return state; }, set state(s) { state = s; }, Sim, ui, setView, R, startWithFaction };

import { loadSettings, saveSettings, settingsHtml, clampScale } from './ui/settings.js';
import * as Audio from './audio/audio.js';
import { VERSION } from './app/version.js';
import { installErrorHandlers, logError, getErrors, clearErrors } from './app/errors.js';
import { flags, loadFlags, setLocalFlag } from './app/flags.js';
import { getConsent, setConsent, track, getAnalytics } from './app/consent.js';
import { checkInvite, unlocked, unlock } from './app/invite.js';
import { buildReport, download, mailtoUrl, issueUrl } from './app/feedback.js';
import { PerfMonitor } from './app/perf.js';
import { startUpdateCheck } from './app/update.js';
import { NetClient } from './net/client.js';
import { exportSave, parseImport, SAVE_VERSION, BACKUP_KEY } from './game/saveio.js';
import { consentHtml, inviteHtml, endscreenHtml, feedbackHtml, changelogHtml, saveMenuHtml, debugHtml } from './ui/betaUi.js';
import { setPalette, FX } from './render/scenes.js';
import { SYSTEMS as ALL_SYSTEMS } from './game/data.js';
import { Renderer } from './render/scenes.js';
import * as Sim from './game/sim.js';
import { resourcesHtml, leftHtml, rightHtml, battleBarsHtml, reportHtml, offlineHtml, factionPickerHtml, PRIORITIES } from './ui/ui.js';

const $ = s => document.querySelector(s);
let crashToast = 0;
installErrorHandlers(e => { if (Date.now() - crashToast > 10000) { crashToast = Date.now(); toast('warn', `Fehler protokolliert: ${e.msg.slice(0, 80)} (Feedback-Knopf hilft uns)`); } });
let loaded;
try { loaded = Sim.load(localStorage); } catch (e) { logError(e, 'load'); loaded = { state: null, needsFaction: true, corrupt: true }; }
let noSaveOnUnload = false;
let state = loaded.state;
let awaitingFaction = false;
const ui = { view: 'galaxy', selectedSystem: 'helios', systemView: 'helios', selectedPlanet: null, selectedFleet: null, prevView: 'galaxy', panel: 'main' };
let settings = loadSettings();
function applySettings() {
  setPalette(settings.colorblind); FX.particles = settings.particles; FX.shake = settings.shake;
  document.body.classList.toggle('cb', settings.colorblind); document.documentElement.style.setProperty('--ui-scale', clampScale(settings.scale));
  Audio.configure({ music: settings.music, sfx: settings.sfx, volume: +settings.volume });
}
applySettings();
const R = new Renderer($('#c'), $('#labels'));
const perf = new PerfMonitor(l => { R.setQuality(l); dirty = true; }, settings.quality === 'auto' ? (matchMedia('(pointer: coarse)').matches ? 'mittel' : 'hoch') : settings.quality);
perf.auto = settings.quality === 'auto' && flags.autoQuality; R.setQuality(perf.level);
R.onBoom = size => Audio.sfx('boom', size);
addEventListener('pointerdown', () => Audio.unlock(), { capture: true }); addEventListener('keydown', () => Audio.unlock(), { capture: true });
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
  if (loaded.restored) setTimeout(() => toast('warn', 'Hauptspielstand war beschädigt – Backup wurde geladen.'), 500);
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
  else if (k === '/' || k === 'p') { e.preventDefault(); openSearch(); }
  else if (k === 'o') openSettings();
  else if (e.key === '`' || e.key === '^' || e.key === 'F9') { if (flags.debugPanel) openDebug(); }
  else if (k === 'z' && (e.ctrlKey || e.metaKey)) undoLast();
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
    case 'build': err = Sim.actions.build(state, ui.selectedPlanet, id); if (!err) offerUndo(ui.selectedPlanet, 'build', 'Bauauftrag erteilt.'); break;
    case 'ship': err = Sim.actions.buildShip(state, id, +el.dataset.n, ui.selectedPlanet); if (!err) offerUndo(ui.selectedPlanet, 'ship', 'Werftauftrag erteilt.'); break;
    case 'undo': undoLast(); break;
    case 'jump': jump(id); return;
    case 'settings': openSettings(); return;
    case 'consentreset': localStorage.removeItem('gatebreaker-consent'); closeModal(); showGate(); return;
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
    case 'newgame': if (confirm('Spielstand wirklich löschen und neu beginnen?')) { localStorage.removeItem(Sim.SAVE_KEY); openModal(factionPickerHtml()); awaitingFaction = true; } return;
    case 'exile': { const pid = Sim.exileRestart(state); closeModal(); ui.selectedSystem = state.planets[pid].system; setView('galaxy'); break; }
    case 'restorebackup': restoreBackup(); return;
    case 'feedback': openFeedback(); return;
    case 'fb-download': case 'fb-mail': case 'fb-issue': sendFeedback(name); return;
    case 'export': download(`gatebreaker-${VERSION}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, exportSave(state, VERSION)); track('exports'); toast('info', 'Spielstand exportiert.'); return;
    case 'savemenu': openSaveMenu(); return;
    case 'cloud-up': case 'cloud-down': cloud(name === 'cloud-up'); return;
    case 'changelog': openModal(changelogHtml()); return;
    case 'menu': openMenu(); return;
    case 'debug': openDebug(); return;
    case 'dbg-copy': navigator.clipboard?.writeText(localStorage.getItem(Sim.SAVE_KEY) || '').then(() => toast('info', 'Save in Zwischenablage.'), () => toast('warn', 'Kopieren nicht erlaubt.')); return;
    case 'dbg-clearerr': clearErrors(); openDebug(); return;
    case 'dbg-crash': setTimeout(() => { throw new Error('Testfehler aus dem Debug-Panel'); }); return;
    case 'dbg-reset': if (confirm('Spielstand UND Backup löschen?')) { noSaveOnUnload = true; localStorage.removeItem(Sim.SAVE_KEY); localStorage.removeItem(BACKUP_KEY); location.reload(); } return;
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
    if (e.endscreen) { openModal(endscreenHtml(e.endscreen, state)); track(e.endscreen); continue; }
    if (e.battle) track('battles');
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
  perf.frame(gap);
  if (gated || crashed) { R.render(); requestAnimationFrame(frame); return; }
  try {
  let left = dt; while (left > 1e-6) { const d = Math.min(0.05, left); Sim.tick(state, d); left -= d; }
  if (state.battle && battleRef !== state.battle) { battleRef = state.battle; R.buildBattle(state.battle); syncBattleControls(); setView('battle'); }
  if (!state.battle && battleRef) { battleRef = null; if (ui.view === 'battle') setView(ui.prevView || 'galaxy'); }
  drainEvents();
  if (R.view === 'galaxy') R.updateGalaxy(state, ui);
  if (R.view === 'system') R.updateSystem(state, ui, now);
  if (R.view === 'battle' && state.battle) { R.updateBattle(state.battle); drawMinimap(state.battle); if (state.battle.shots?.length) Audio.sfx('shot'); }
  Audio.setTension(state.battle ? 1 : 0);
  uiAcc += dt; if (uiAcc > 0.25 || dirty) { uiAcc = 0; dirty = false; flush(); }
  saveAcc += dt; if (saveAcc > 5 && !awaitingFaction && !noSaveOnUnload) { saveAcc = 0; Sim.save(state, localStorage); }
  playAcc += dt; if (playAcc > 60) { playAcc = 0; track('playMinutes'); }
  } catch (e) { onFrameError(e); }
  try { R.render(); } catch (e) { onFrameError(e); }
  requestAnimationFrame(frame);
}
// Absturzschutz: einzelne Fehler protokollieren und weiterlaufen; bei Fehlerserie anhalten und Optionen anbieten
let errTimes = [], crashed = false, playAcc = 0;
function onFrameError(e) {
  logError(e, 'frame'); const t = performance.now(); errTimes = errTimes.filter(x => t - x < 10000); errTimes.push(t);
  if (errTimes.length >= 5 && !crashed) { crashed = true;
    openModal(`<h2>Das Spiel ist ins Stocken geraten</h2><p>Mehrere Fehler in kurzer Zeit (${(e?.message || e).toString().slice(0, 120)}). Der Spielstand wurde nicht überschrieben.</p>
      <div class="row"><button data-act="export">⬇ Spielstand exportieren</button> <button data-act="restorebackup">Backup laden</button> <button data-act="feedback">Fehler melden</button> <button id="crash-resume">Weiter versuchen</button></div>`);
    $('#crash-resume').addEventListener('click', () => { crashed = false; errTimes = []; closeModal(); }); }
}
addEventListener('beforeunload', () => { if (state && !awaitingFaction && !noSaveOnUnload && !gated) Sim.save(state, localStorage); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state && !awaitingFaction && !noSaveOnUnload && !gated) Sim.save(state, localStorage); });
setView('galaxy');
requestAnimationFrame(frame);
// ---------- Rückgängig (5 s) ----------
let undoSlot = null;
function offerUndo(planet, kind, text) {
  clearTimeout(undoSlot?.timer); $('#undo')?.remove();
  const d = document.createElement('div'); d.id = 'undo'; d.className = 'toast info undo'; d.innerHTML = `${text} <button data-undo>↶ Rückgängig (<span>5</span>)</button>`;
  $('#toasts').prepend(d); let n = 5;
  const tick = () => { n--; if (n <= 0) { d.remove(); undoSlot = null; return; } d.querySelector('span').textContent = n; undoSlot.timer = setTimeout(tick, 1000); };
  undoSlot = { planet, kind, timer: setTimeout(tick, 1000) };
  d.querySelector('[data-undo]').addEventListener('click', e => { e.stopPropagation(); undoLast(); });
}
function undoLast() {
  if (!undoSlot) return; const err = Sim.actions.undoOrder(state, undoSlot.planet, undoSlot.kind);
  clearTimeout(undoSlot.timer); undoSlot = null; $('#undo')?.remove(); toast(err ? 'warn' : 'info', err || 'Auftrag zurückgenommen, Kosten erstattet.'); dirty = true; flush();
}
// ---------- Suche / Springen ----------
function searchResults(q) {
  q = q.trim().toLowerCase(); const out = [];
  for (const s of ALL_SYSTEMS) {
    const known = state.explored[s.id] || Sim.neighbors(s.id).some(n => state.explored[n]);
    if (known && s.name.toLowerCase().includes(q)) out.push(['s:' + s.id, '☀ System', s.name]);
    if (state.explored[s.id]) for (const p of s.planets) if (p.name.toLowerCase().includes(q)) out.push(['p:' + p.id, '◍ Planet', `${p.name} <small>${s.name}</small>`]);
  }
  for (const f of state.fleets) if (f.owner === 'player' && Sim.shipCount(f) && f.name.toLowerCase().includes(q)) out.push(['f:' + f.id, '⚑ Flotte', `${f.name} (${Sim.shipCount(f)}) <small>${Sim.sysById(f.move ? f.move.to : f.system).name}</small>`]);
  return out.slice(0, 30);
}
function renderSearch() { const q = $('#search-q')?.value || ''; const r = searchResults(q); $('#search-res').innerHTML = r.length ? r.map(([id, k, n]) => `<button class="sres" data-act="jump" data-id="${id}"><b>${k}</b> ${n}</button>`).join('') : '<p class="dim">Keine Treffer.</p>'; }
function openSearch() {
  openModal(`<h2>Suchen &amp; Springen</h2><input id="search-q" placeholder="Planet, System oder Flotte…" autocomplete="off"><div id="search-res"></div><button data-act="closemodal">Schließen</button>`);
  $('#search-q').addEventListener('input', renderSearch); $('#search-q').addEventListener('keydown', e => { if (e.key === 'Enter') $('#search-res .sres')?.click(); e.stopPropagation(); });
  renderSearch(); $('#search-q').focus();
}
function jump(ref) {
  const [k, id] = ref.split(':'); closeModal();
  if (k === 's') { ui.selectedSystem = id; setView('galaxy'); R.focusSystem(id); }
  else if (k === 'p') { const sys = state.planets[id]?.system; ui.selectedSystem = sys; ui.view = 'galaxy'; setView('system'); ui.selectedPlanet = id; }
  else if (k === 'f') { const f = state.fleets.find(x => x.id === +id); if (f) { ui.selectedFleet = f.id; ui.selectedSystem = f.move ? f.move.to : f.system; setView('galaxy'); R.focusSystem(ui.selectedSystem); } }
  dirty = true; flush();
}
// ---------- Einstellungen ----------
function openSettings() {
  openModal(settingsHtml(settings));
  $('#modal-body').querySelectorAll('[data-set]').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.set; settings[k] = inp.type === 'checkbox' ? inp.checked : +inp.value;
    if (k === 'quality') { settings.quality = inp.value; perf.auto = inp.value === 'auto'; if (!perf.auto) perf.set(inp.value); }
    if (k === 'scale') { settings.scale = clampScale(inp.value); $('#set-scale').textContent = Math.round(settings.scale * 100) + '%'; }
    saveSettings(settings); applySettings(); dirty = true;
  }));
}
$('#btn-search')?.addEventListener('click', openSearch);
$('#btn-settings')?.addEventListener('click', openSettings);
// ---------- Minikarte ----------
function drawMinimap(b) {
  const c = $('#minimap'); if (!c) return; const g = c.getContext('2d'); const W = c.width, H = c.height; g.clearRect(0, 0, W, H);
  let m = 30; for (const u of b.units) if (u.alive) m = Math.max(m, Math.abs(u.pos.x), Math.abs(u.pos.z));
  const sc = (W / 2 - 6) / (m * 1.05);
  g.strokeStyle = 'rgba(79,195,255,.25)'; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 3, 0, 7); g.stroke(); g.beginPath(); g.moveTo(W / 2, 4); g.lineTo(W / 2, H - 4); g.moveTo(4, H / 2); g.lineTo(W - 4, H / 2); g.stroke();
  const cp = settings.colorblind ? '#3d8bff' : '#4fc3ff', ca = settings.colorblind ? '#ffa000' : '#ff4d5e';
  for (const u of b.units) {
    if (!u.alive) continue; const x = W / 2 + u.pos.x * sc, y = H / 2 + u.pos.z * sc; g.fillStyle = u.side === 'player' ? cp : ca;
    const big = u.type === 'flaggschiff' || u.type === 'traeger' || u.type === 'plattform'; const r = big ? 3.5 : u.type === 'drohne' ? 1 : 2;
    if (settings.colorblind && u.side !== 'player') g.fillRect(x - r, y - r, r * 2, r * 2); else { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  }
}
// ---------- Beta: Zugang, Feedback, Spielstand, Debug, Updates ----------
let gated = false;
function showGate() {
  const g = $('#gate'); const consent = getConsent();
  if (!consent) { gated = true; g.classList.remove('hidden'); g.querySelector('.panel').innerHTML = consentHtml();
    const t = $('#c-terms'); t.addEventListener('change', () => { $('#c-ok').disabled = !t.checked; });
    $('#c-ok').addEventListener('click', () => { setConsent($('#c-analytics').checked); showGate(); }); return; }
  if (flags.inviteGate && !unlocked()) { gated = true; g.classList.remove('hidden'); g.querySelector('.panel').innerHTML = inviteHtml();
    const go = async () => { const h = await checkInvite($('#inv-code').value); if (h) { unlock(h); showGate(); } else $('#inv-err').textContent = 'Ungültiger Einladungscode.'; };
    $('#inv-ok').addEventListener('click', go); $('#inv-code').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); }); return; }
  gated = false; g.classList.add('hidden'); last = performance.now(); track('sessions');
}
showGate();
loadFlags().then(() => { if (gated && getConsent() && !flags.inviteGate) showGate(); perf.auto = settings.quality === 'auto' && flags.autoQuality;
  if (flags.updateCheck) startUpdateCheck((j, native) => toast('alert', native ? `Neue Version v${j.version} verfügbar – neue APK im GitHub-Release.` : `Neue Version v${j.version} verfügbar – tippen zum Neuladen.`, () => { if (!native) { Sim.save(state, localStorage); location.reload(); } }));
  $('#btn-feedback')?.classList.toggle('hidden', !flags.feedback); });
function openFeedback() { openModal(feedbackHtml()); $('#fb-text').focus(); }
function sendFeedback(kind) {
  const text = ($('#fb-text')?.value || '').trim() || '(kein Text)'; const r = buildReport(text, state, { includeSave: $('#fb-save')?.checked !== false, settings });
  if (kind === 'fb-download') download(`gatebreaker-feedback-${VERSION}-${Date.now()}.json`, JSON.stringify(r, null, 1));
  else if (kind === 'fb-mail') location.href = mailtoUrl(r);
  else window.open(issueUrl(r), '_blank', 'noopener');
  track('feedback'); toast('info', 'Danke für dein Feedback!');
}
function openSaveMenu() {
  openModal(saveMenuHtml({ backupAt: +localStorage.getItem(BACKUP_KEY + '-at') || 0, saveVersion: SAVE_VERSION, cloud: flags.cloudSaves && flags.cloudUrl, loggedIn: !!localStorage.getItem('gatebreaker-cloud-token') }));
  $('#imp-file').addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { const st = parseImport(await f.text()); st.lastSave = Date.now(); noSaveOnUnload = true; localStorage.setItem(Sim.SAVE_KEY, JSON.stringify(st)); toast('info', 'Import erfolgreich – lade neu…'); setTimeout(() => location.reload(), 400); }
    catch (e) { $('#imp-err').textContent = e.message; }
  });
}
async function cloud(up) {
  const msg = t => { const m = $('#cl-msg'); if (m) m.textContent = t; };
  let c; try {
    msg('Verbinde…'); c = await new NetClient(flags.cloudUrl).connect(); const tok = localStorage.getItem('gatebreaker-cloud-token');
    if (tok) { try { await c.resume(tok); } catch { localStorage.removeItem('gatebreaker-cloud-token'); throw new Error('Sitzung abgelaufen – Code erneut eingeben.'); } }
    else { const r = await c.login($('#cl-code')?.value || ''); localStorage.setItem('gatebreaker-cloud-token', r.token); }
    if (up) { await c.saveCloud(state, VERSION); msg('Hochgeladen ✔'); }
    else { const s = await c.loadCloud(); if (!s) { msg('Kein Cloud-Spielstand.'); return; } const st = parseImport(JSON.stringify(s.state)); st.lastSave = Date.now(); noSaveOnUnload = true; localStorage.setItem(Sim.SAVE_KEY, JSON.stringify(st)); msg('Geladen – starte neu…'); setTimeout(() => location.reload(), 400); }
  } catch (e) { msg('Fehler: ' + e.message); logError(e, 'cloud'); } finally { c?.close(); }
}
function restoreBackup() {
  const b = localStorage.getItem(BACKUP_KEY); if (!b) { toast('warn', 'Kein Backup vorhanden.'); return; }
  try { parseImport(b); } catch (e) { toast('warn', 'Backup ungültig: ' + e.message); return; }
  noSaveOnUnload = true; localStorage.setItem(Sim.SAVE_KEY, b); location.reload();
}
function openMenu() {
  openModal(`<h2>Menü</h2><div class="menu">
    <button data-act="feedback">✉ Feedback / Fehler melden</button><button data-act="savemenu">💾 Spielstand: Export, Import, Backup</button>
    <button data-act="settings">⚙ Einstellungen</button><button data-act="changelog">📜 Changelog</button>
    <a class="btnlike" href="./datenschutz.html" target="_blank">Datenschutz</a><a class="btnlike" href="./impressum.html" target="_blank">Impressum</a><a class="btnlike" href="./beta-bedingungen.html" target="_blank">Beta-Bedingungen</a>
    <button data-act="consentreset">Einwilligung ändern</button></div><p class="muted">Gatebreaker v${VERSION}</p><button data-act="closemodal">Schließen</button>`);
}
function openDebug() {
  const raw = localStorage.getItem(Sim.SAVE_KEY) || '';
  openModal(debugHtml({ fps: perf.fps, quality: perf.level, saveSize: raw.length, flags, errors: getErrors(), analytics: getAnalytics(), savePreview: raw.slice(0, 1500) + (raw.length > 1500 ? ' …' : '') }));
  $('#modal-body').querySelectorAll('[data-flag]').forEach(c => c.addEventListener('change', () => { setLocalFlag(c.dataset.flag, c.checked); toast('info', `Flag ${c.dataset.flag} = ${c.checked} (lokal)`); }));
}
$('#ver').textContent = 'v' + VERSION;
let verTaps = [];
$('#ver').addEventListener('click', e => { e.stopPropagation(); const t = Date.now(); verTaps = verTaps.filter(x => t - x < 2000); verTaps.push(t); if (verTaps.length >= 5 && flags.debugPanel) { verTaps = []; openDebug(); } else if (verTaps.length === 1) setTimeout(() => { if (verTaps.length === 1) openModal(changelogHtml()); }, 450); });
$('#btn-feedback')?.addEventListener('click', openFeedback);
$('#btn-menu')?.addEventListener('click', openMenu);
window.gb = { get state() { return state; }, set state(s) { state = s; }, Sim, ui, setView, R, startWithFaction, settings: () => settings, Audio, undoLast, perf, flags, showGate, version: VERSION, exportText: () => exportSave(state, VERSION), feedbackReport: t => buildReport(t, state), issueUrl: t => issueUrl(buildReport(t, state, { includeSave: false })) };

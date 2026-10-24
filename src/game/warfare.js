// v0.4 Krieg & Diplomatie: Spione, Ruinen/Story, Belagerung, Bodentruppen, Allianzen, Frieden, Abfangen, Patrouillen,
// Rettungskapseln, Wrackforschung, Moral, KI-Persönlichkeit, Schätzungen, Versorgungslinien. Reine Logik.
import { SHIPS, TROOPS, SPY_SPECS, RUINS, AI_PERSONALITIES, PEACE_TERMS, STORY } from './data.js';
import { emptyBuildings, fleetsIn, fleetPower, shipCount, path, neighbors, homePlanet, planetName, sysById, travelTime, canAfford } from './sim.js';
import { relationLog } from './empire.js';

function emit(state, level, text, extra = {}) { state.events.push({ level, text, ...extra }); }
const pay = (state, c) => { for (const r in c) state.res[r] -= c[r]; };
const hash = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

export function initWarfare(state) {
  if (!state.ai.personality) state.ai.personality = Object.keys(AI_PERSONALITIES)[(Math.random() * 3) | 0];
  if (!state.army) state.army = { infanterie: 0, panzer: 0, luftlande: 0 };
  if (!state.spies) state.spies = [];
  if (!state.intel) state.intel = { until: 0 };
  if (!state.allies) state.allies = { vael: { name: 'Vael-Konsortium', relation: 0, allied: false, aidCd: 0 } };
  if (!state.story) state.story = { step: 0, fragments: 0, done: false, codex: false, log: [] };
  if (!state.expeditions) state.expeditions = [];
  if (!state.ruinsDone) state.ruinsDone = {};
  if (state.wrecks == null) state.wrecks = 0;
  if (state.wreckLvl == null) state.wreckLvl = 0;
  if (state.prisoners == null) state.prisoners = 0;
  if (!state.battleQueue) state.battleQueue = [];
  if (state.ai.raidTimer == null) state.ai.raidTimer = 300;
  if (state.diplo && state.diplo.talkCd == null) state.diplo.talkCd = 0;
  for (const p of Object.values(state.planets)) if (p.siege == null) p.siege = 0;
  state._war = true;
}
export const personality = state => AI_PERSONALITIES[state.ai?.personality] || AI_PERSONALITIES.vorsichtig;
export const intelActive = (state, fx) => state.intel.until > state.time || !!fx?.spyVision;
export function aiPowerReal(state) { return state.fleets.filter(f => f.owner === 'ai').reduce((a, f) => a + fleetPower(f.ships), 0) + 60 * Object.values(state.planets).filter(p => p.owner === 'ai').reduce((a, p) => a + p.defense, 0); }
export function playerPower(state) { return state.fleets.filter(f => f.owner === 'player').reduce((a, f) => a + fleetPower(f.ships), 0) * (1 + 0.05 * state.wreckLvl); }
// Schätzung ±35%, stabil pro Minute
export function estimate(state, real, seed) { const k = 0.65 + 0.7 * hash(seed + Math.floor(state.time / 60)); return Math.max(0, Math.round(real * k / 10) * 10); }
export function fleetStrengthText(state, f, fx) {
  const real = fleetPower(f.ships);
  return intelActive(state, fx) ? `Stärke ${real} (echt)` : `Stärke ~${estimate(state, real, f.id)} (geschätzt)`;
}
export function relationFactors(state) {
  const P = personality(state); const r = playerPower(state) / Math.max(1, aiPowerReal(state));
  const f = [`Persönlichkeit: ${P.name} (${P.talk >= 0 ? '+' : ''}${Math.round(P.talk * 100)}% Verhandlung)`];
  f.push(r > 1.3 ? 'fürchtet deine Flotte (bessere Bedingungen)' : r < 0.7 ? 'hält dich für schwach' : 'sieht dich als ebenbürtig');
  if (state.diplo.treaty) f.push('Handelsvertrag (+Beziehung über Zeit)');
  if (state.diplo.peaceUntil > state.time) f.push(`Waffenruhe noch ${Math.ceil(state.diplo.peaceUntil - state.time)} s`);
  if (state.prisoners) f.push(`${state.prisoners} Gefangene als Druckmittel`);
  if (state.allies.vael.allied) f.push('deine Allianz mit Vael schreckt ab');
  return f;
}

// ---------- Truppen ----------
export function armyPower(state, p) {
  const a = state.army; return a.infanterie * TROOPS.infanterie.power + a.panzer * TROOPS.panzer.power * (p?.home ? 1.3 : 1) + a.luftlande * TROOPS.luftlande.power * 1.2;
}
export function troopStrength(state, pf, p) {
  const fleet = pf.reduce((a, f) => a + 40 + 3 * (f.ships.jaeger || 0) + 4 * (f.ships.bomber || 0) + 10 * (f.ships.fregatte || 0) + 16 * (f.ships.zerstoerer || 0) + 20 * (f.ships.traeger || 0) + 40 * (f.ships.flaggschiff || 0), 0);
  return Math.round((fleet + armyPower(state, p)) * (1 + (p?.siege || 0) / 200));
}
export function armyLosses(state, success) { const k = success ? 0.3 : 0.7; for (const t in state.army) state.army[t] = Math.floor(state.army[t] * (1 - k)); }

// ---------- Tick ----------
export function warfareTick(state, dt, opts = {}) {
  const fx = null;
  // Spionagemissionen
  for (const s of state.spies) if (s.mission) {
    s.mission.remaining -= dt;
    if (s.mission.remaining <= 0) resolveSpy(state, s);
  }
  state.spies = state.spies.filter(s => !s.lost);
  // Expeditionen
  for (const e of state.expeditions) { e.remaining -= dt; if (e.remaining <= 0) resolveExpedition(state, e); }
  state.expeditions = state.expeditions.filter(e => e.remaining > 0);
  // Belagerung
  for (const p of Object.values(state.planets)) if (p.owner === 'ai') {
    const ctl = fleetsIn(state, p.system, 'player').length && !fleetsIn(state, p.system, 'ai').length && p.defense === 0;
    if (ctl) { const was = p.siege; p.siege = Math.min(100, p.siege + dt * 100 / 60); p.garrison = Math.max(10, p.garrison - 0.15 * dt); if (was < 100 && p.siege >= 100) emit(state, 'info', `Belagerung von ${planetName(p.id)} vollständig: Landungstruppen +50%.`); }
    else p.siege = Math.max(0, p.siege - 2 * dt);
  } else p.siege = 0;
  // Versorgungslinien
  const hp = homePlanet(state); const hs = hp?.system || 'helios';
  for (const p of Object.values(state.planets)) {
    if (p.owner === 'player' && !p.home && p.system !== hs) {
      const route = [hs, ...(path(hs, p.system) || [])].slice(1);
      const cut = route.some(s => fleetsIn(state, s, 'ai').length && !fleetsIn(state, s, 'player').length);
      if (cut && !p.supplyCut) emit(state, 'warn', `Versorgungslinie zu ${planetName(p.id)} unterbrochen! Produktion −50%.`);
      p.supplyCut = cut;
    } else if (p.owner === 'ai' && !p.home) {
      const route = (path('draxis', p.system) || []);
      p.supplyCut = route.some(s => fleetsIn(state, s, 'player').length && !fleetsIn(state, s, 'ai').length);
      if (p.supplyCut) { p.garrison = Math.max(10, p.garrison - 0.05 * dt); state.ai.budget -= 0.3 * dt; }
    } else p.supplyCut = false;
  }
  state.ai.budget = Math.max(0, state.ai.budget);
  // Patrouillen: Treibstoff, Torkontrolle; Abfangen auf Routen
  for (const f of state.fleets) {
    if (f.owner !== 'player' || f.move || f.inBattle || !shipCount(f)) continue;
    if (f.patrol) {
      state.res.treibstoff = Math.max(0, state.res.treibstoff - 0.05 * shipCount(f) * dt);
      if (state.res.treibstoff <= 0) { f.patrol = false; emit(state, 'warn', `${f.name}: Patrouille mangels Treibstoff beendet.`); continue; }
      for (const a of state.fleets) if (a.owner === 'ai' && a.move && a.move.t === 0 && a.system === f.system && !a.inBattle && !(peace(state) && (a.faction || 'draxis') === 'draxis')) {
        a.move = null; emit(state, 'alert', `Torpatrouille ${f.name} stellt ${a.name} in ${sysById(f.system).name}!`);
      }
    }
  }
  // KI-Wachen stellen durchreisende Spielerflotten
  for (const g of state.fleets) if (g.owner === 'ai' && g.role === 'guard' && !g.move && !g.inBattle && shipCount(g)) {
    for (const f of state.fleets) if (f.owner === 'player' && f.move && f.move.t === 0 && f.system === g.system && !f.inBattle && !peace(state)) {
      f.move = null; emit(state, 'alert', `Draxis-Torwache in ${sysById(g.system).name} stoppt ${f.name}!`);
    }
  }
  for (const f of state.fleets) if (f.owner === 'player' && f.intercept && f.move && !f.inBattle) {
    for (const a of state.fleets) if (a.owner === 'ai' && a.move && !a.inBattle && !(peace(state) && (a.faction || 'draxis') === 'draxis') && a.move.from === f.move.to && a.move.to === f.move.from && f.move.t / f.move.total + a.move.t / a.move.total >= 1) {
      const at = f.move.to; f.system = at; a.system = at; f.move = null; a.move = null;
      emit(state, 'alert', `Abgefangen! ${f.name} stellt ${a.name} auf der Route nach ${sysById(at).name}.`);
      break;
    }
  }
  // KI-Überfälle auf Versorgungslinien
  const P = personality(state);
  state.ai.raidTimer -= dt;
  if (state.ai.raidTimer <= 0) {
    state.ai.raidTimer = 300 * P.attack + Math.random() * 120;
    const col = Object.values(state.planets).find(p => p.owner === 'player' && !p.home && p.system !== hs);
    if (col && !peace(state) && !state.diplo.treaty && !state.ai.defeated) {
      const pth = path('draxis', col.system);
      if (pth && pth.length) {
        const r = { id: state.nextId++, owner: 'ai', name: 'Draxis-Plünderer', ships: { jaeger: 3, bomber: 1 }, system: 'draxis', move: null, cooldown: 0, role: 'raid', raidLeft: 150 };
        const first = pth.shift(); r.move = { from: 'draxis', to: first, t: 0, total: travelTime(r, state), path: pth }; state.fleets.push(r);
        emit(state, 'warn', `Draxis-Plünderer greifen die Versorgungslinie nach ${planetName(col.id)} an!`);
      }
    }
  }
  // Freibeuter (unabhängig von Draxis, ignorieren Waffenruhen)
  if (state.pirateTimer == null) state.pirateTimer = 900;
  state.pirateTimer -= dt;
  if (state.pirateTimer <= 0) {
    state.pirateTimer = 700 + Math.random() * 400;
    const col = Object.values(state.planets).find(p => p.owner === 'player' && !p.home) || Object.values(state.planets).find(p => p.owner === 'player');
    const from = col && neighbors(col.system).find(n => !Object.values(state.planets).some(p => p.system === n && p.owner));
    if (col && from) {
      const n = 2 + Math.floor(state.time / 1200);
      const r = { id: state.nextId++, owner: 'ai', faction: 'pirat', name: 'Freibeuter', ships: { jaeger: n, bomber: 1 }, system: from, move: { from, to: col.system, t: 0, total: 20, path: [] }, cooldown: 0, role: 'raid', raidLeft: 90 };
      state.fleets.push(r); emit(state, 'warn', `Freibeuter aus ${sysById(from).name} im Anflug auf ${sysById(col.system).name}! (unabhängig von Waffenruhen)`);
    }
  }
  for (const f of state.fleets) if (f.faction === 'pirat' && !f.move && !f.inBattle) { f.raidLeft -= dt; if (f.raidLeft <= 0) { f.ships = {}; } }
  for (const f of state.fleets) if (f.owner === 'ai' && f.role === 'raid' && f.faction !== 'pirat' && !f.move && !f.inBattle) {
    f.raidLeft -= dt; if (f.raidLeft <= 0) { const p = path(f.system, 'draxis'); if (p && p.length) { f.move = { from: f.system, to: p.shift(), t: 0, total: travelTime(f, state), path: p }; f.role = 'return'; } else f.role = 'home'; }
  }
  // Verbündete
  const v = state.allies.vael; v.aidCd = Math.max(0, v.aidCd - dt);
  if (v.allied) {
    state.res.credits += 1 * dt;
    const threat = state.fleets.some(f => f.owner === 'ai' && f.role === 'attack' && f.move && f.move.to === hs);
    if (threat && v.aidCd <= 0) {
      v.aidCd = 600; const hf = state.fleets.find(f => f.owner === 'player' && f.system === hs && !f.move && !f.inBattle);
      if (hf) { hf.ships.fregatte = (hf.ships.fregatte || 0) + 2; hf.ships.jaeger = (hf.ships.jaeger || 0) + 4; emit(state, 'info', 'Vael-Konsortium schickt Verstärkung: 2 Fregatten, 4 Jäger.'); }
    }
  } else v.relation = Math.max(-50, v.relation - 0.002 * dt);
  state.diplo.talkCd = Math.max(0, (state.diplo.talkCd || 0) - dt);
  // Story
  storyCheck(state);
  // Battle-Queue: nächste Schlacht live starten
  if (!state.battle && state.battleQueue.length && !opts.offline) {
    state.battle = state.battleQueue.shift();
    emit(state, 'alert', `Nächstes Gefecht aus der Warteschlange: ${sysById(state.battle.system).name}.`, { battle: true });
  }
}
export const peace = state => state.diplo?.peaceUntil > state.time;

function storyCheck(state) {
  const s = state.story; if (s.done) return;
  const adv = (txt) => { s.step++; s.log.unshift(txt); emit(state, 'info', `Story: ${STORY[s.step - 1].title} abgeschlossen. ${s.step < STORY.length ? 'Neu: ' + STORY[s.step].title : ''}`); };
  if (s.step === 0 && state.explored.vortex) adv('Das Signal stammt von den Torbauern.');
  if (s.step === 1 && s.fragments >= 1) adv('Erstes Fragment gefunden.');
  if (s.step === 2 && s.fragments >= 3) adv('Drei Fragmente vereint – sie zeigen auf Vortex.');
}

function resolveSpy(state, s) {
  const m = s.mission; s.mission = null;
  const chance = Math.min(0.92, 0.55 + 0.1 * s.lvl - (state.ai.personality === 'vorsichtig' ? 0.1 : 0));
  if (Math.random() < chance) {
    s.lvl = Math.min(5, s.lvl + 1);
    if (m.type === 'aufklaerung') { state.intel.until = state.time + 180; emit(state, 'info', `Agent ${s.name}: Aufklärung erfolgreich – echte Flottenstärke sichtbar (Draxis gesamt ${aiPowerReal(state)}).`); }
    if (m.type === 'sabotage') { state.ai.attackTimer += 120; state.ai.budget = Math.max(0, state.ai.budget - 200); emit(state, 'info', `Agent ${s.name}: Sabotage erfolgreich – nächster Angriff verzögert, Draxis-Budget −200.`); }
    if (m.type === 'diplomat') { state.diplo.relation = Math.min(100, state.diplo.relation + 8); relationLog(state, 8, `Diplomat ${s.name}`); emit(state, 'info', `Agent ${s.name}: Gespräche verbessern die Beziehung (+8).`); }
  } else if (Math.random() < 0.45) {
    s.lost = true; state.diplo.relation -= 10; relationLog(state, -10, `Spion ${s.name} enttarnt`);
    emit(state, 'alert', `Agent ${s.name} wurde von Draxis enttarnt und hingerichtet!`);
  } else emit(state, 'warn', `Agent ${s.name}: Mission fehlgeschlagen, konnte entkommen.`);
}

function resolveExpedition(state, e) {
  const R = RUINS[e.planet]; state.ruinsDone[e.planet] = true;
  const roll = Math.random(); let txt = `Expedition ${R.name}: ${R.text} Fragment des Torbauer-Codex geborgen.`;
  state.story.fragments++;
  if (roll < 0.25) {
    const f = state.fleets.find(x => x.id === e.fleet && !x.inBattle); let lost = 0;
    if (f) for (const t of ['jaeger', 'bomber']) { const k = Math.min(f.ships[t] || 0, 2); f.ships[t] -= k; lost += k; }
    txt += ` Wächter-Drohnen griffen an: ${lost} Schiffe verloren.`;
  } else if (roll < 0.6) { state.res.credits += 250; state.res.teile = (state.res.teile || 0) + 15; txt += ' Fund: 250 Credits, 15 Schiffsteile.'; }
  else { state.wrecks += 15; txt += ' Fund: fremde Technik (+15 Wrackdaten).'; }
  emit(state, 'info', txt); state.story.log.unshift(R.text);
}

// ---------- nach der Schlacht ----------
export function afterBattle(state, b, report) {
  const nonDrone = o => Object.entries(o).filter(([t]) => !SHIPS[t]?.drone && t !== 'plattform').reduce((a, [, n]) => a + n, 0);
  const lp = nonDrone(b.lost.player), la = nonDrone(b.lost.ai);
  const pods = { saved: 0, captured: 0 };
  if (b.winner === 'player') {
    pods.saved = Math.round(lp * 0.6); state.crews += pods.saved * 0.2; pods.captured = Math.round(la * 0.3); state.prisoners += pods.captured;
    let w = 0; for (const t in b.lost.ai) if (!SHIPS[t]?.drone) w += (b.lost.ai[t] || 0) * (t === 'zerstoerer' || t === 'plattform' ? 3 : t === 'fregatte' ? 2 : 1);
    state.wrecks += w; report.wrecks = w;
  } else pods.saved = Math.round(lp * 0.2);
  report.pods = pods;
  // Moral im Imperium
  const d = b.winner === 'player' ? 4 : -4;
  for (const p of Object.values(state.planets)) if (p.owner === 'player' && p.sat != null) p.sat = Math.max(0, Math.min(100, p.sat + d));
  report.moraleEvents = b.log || [];
}

// ---------- Aktionen ----------
export const warfareActions = {
  recruitTroops(state, type, n = 5) {
    const T = TROOPS[type]; if (!T) return 'Unbekannte Truppe.';
    if (!homePlanet(state)) return 'Ohne Heimatwelt keine Rekrutierung.';
    const c = {}; for (const r in T.cost) c[r] = T.cost[r] * n; if (!canAfford(state, c)) return 'Nicht genug Ressourcen.';
    pay(state, c); state.army[type] += n; return null;
  },
  hireSpy(state, spec) {
    if (!SPY_SPECS[spec]) return 'Unbekannte Spezialisierung.'; if (state.spies.length >= 4) return 'Max. 4 Agenten.';
    if (state.res.credits < 120) return '120 Credits nötig.'; state.res.credits -= 120;
    const names = ['Kestrel', 'Nyx', 'Orion', 'Vex', 'Sable', 'Juno', 'Rook', 'Ash'];
    state.spies.push({ id: state.nextId++, name: names[(Math.random() * names.length) | 0], spec, lvl: 1, mission: null }); return null;
  },
  spyMission(state, id) {
    const s = state.spies.find(x => String(x.id) === String(id)); if (!s) return 'Agent nicht gefunden.'; if (s.mission) return 'Agent ist im Einsatz.';
    if (state.res.credits < 40) return '40 Credits Einsatzkosten.'; state.res.credits -= 40;
    s.mission = { type: s.spec, remaining: 30, total: 30 }; return null;
  },
  expedition(state, planetId) {
    const R = RUINS[planetId]; if (!R) return 'Keine Ruinen hier.'; if (state.ruinsDone[planetId]) return 'Ruine bereits erforscht.';
    if (state.expeditions.some(e => e.planet === planetId)) return 'Expedition läuft.';
    const p = state.planets[planetId]; const pf = fleetsIn(state, p.system, 'player'); if (!pf.length) return 'Eigene Flotte im System nötig.';
    if (fleetsIn(state, p.system, 'ai').length) return 'Feindflotte im System.';
    const c = { treibstoff: 60, credits: 40 }; if (!canAfford(state, c)) return '60 Treibstoff + 40 Credits nötig.';
    pay(state, c); state.expeditions.push({ planet: planetId, fleet: pf[0].id, remaining: 30, total: 30 }); emit(state, 'info', `Expedition zu ${R.name} gestartet (30 s).`); return null;
  },
  activateGateHeart(state) {
    const s = state.story; if (s.done) return 'Bereits aktiviert.'; if (s.step < 3) return 'Erst drei Fragmente sammeln.';
    if (!fleetsIn(state, 'vortex', 'player').length) return 'Eigene Flotte in Vortex nötig.';
    const c = { credits: 200, energie: 100 }; if (!canAfford(state, c)) return '200 Credits + 100 Energie nötig.';
    pay(state, c); s.done = true; s.codex = true; s.step = 4; s.log.unshift('Das Torherz erwacht – die Tore gehorchen dir.');
    emit(state, 'info', 'Story abgeschlossen: Das Torherz erwacht! Torbauer-Codex: Reisen −20%, Schiffsschaden +5%.'); return null;
  },
  togglePatrol(state, id) { const f = state.fleets.find(x => x.id === +id && x.owner === 'player'); if (!f) return 'Flotte nicht gefunden.'; f.patrol = !f.patrol; if (f.patrol) f.intercept = false; return null; },
  toggleIntercept(state, id) { const f = state.fleets.find(x => x.id === +id && x.owner === 'player'); if (!f) return 'Flotte nicht gefunden.'; f.intercept = !f.intercept; if (f.intercept) f.patrol = false; return null; },
  researchWrecks(state) {
    if (state.wreckLvl >= 5) return 'Maximale Stufe.'; const need = 20 + 15 * state.wreckLvl;
    if (state.wrecks < need) return `${need} Wrackdaten nötig.`; if (state.res.credits < 60) return '60 Credits nötig.';
    state.wrecks -= need; state.res.credits -= 60; state.wreckLvl++; emit(state, 'info', `Wrackanalyse Stufe ${state.wreckLvl}: +4% Schaden, +3% Hülle.`); return null;
  },
  releasePrisoners(state) { if (!state.prisoners) return 'Keine Gefangenen.'; const n = state.prisoners; state.prisoners = 0; state.diplo.relation = Math.min(100, state.diplo.relation + 2 * n); relationLog(state, 2 * n, `${n} Gefangene freigelassen`); return null; },
  giftAlly(state) { if (state.res.credits < 100) return '100 Credits nötig.'; state.res.credits -= 100; state.allies.vael.relation = Math.min(100, state.allies.vael.relation + 12); return null; },
  proposeAlliance(state) {
    const v = state.allies.vael; if (v.allied) return 'Allianz besteht.'; if (v.relation < 30) return 'Beziehung zu Vael mind. 30 nötig (Geschenke).';
    if (Math.random() < 0.5 + v.relation / 200) { v.allied = true; emit(state, 'info', 'Allianz mit dem Vael-Konsortium! +1 Credit/s und Verstärkung bei Angriffen.'); }
    else { v.relation -= 5; emit(state, 'warn', 'Vael zögert noch (Beziehung −5).'); } return null;
  },
  leaveAlliance(state) { const v = state.allies.vael; v.allied = false; v.relation -= 20; return null; },
  peaceTalks(state, term) {
    const T = PEACE_TERMS[term]; if (!T) return 'Unbekannte Bedingung.'; const d = state.diplo;
    if (d.talkCd > 0) return `Verhandlungen erst in ${Math.ceil(d.talkCd)} s wieder möglich.`;
    if (peace(state)) return 'Waffenruhe besteht bereits.'; if (state.ai.defeated) return 'Draxis existiert nicht mehr.';
    if (state.res.credits < 50 + (term === 'zahlen' ? 300 : 0)) return term === 'zahlen' ? '350 Credits nötig.' : '50 Credits für Gesandte nötig.';
    state.res.credits -= 50; d.talkCd = 60;
    const chance = peaceChance(state, term);
    if (Math.random() < chance) {
      d.peaceUntil = state.time + 600; d.relation = Math.min(100, d.relation + 10); relationLog(state, 10, `Frieden: ${T.name}`);
      if (term === 'tribut') state.res.credits += 400;
      if (term === 'zahlen') state.res.credits -= 300;
      if (term === 'abtretung') { const p = Object.values(state.planets).find(x => x.owner === 'ai' && !x.home); if (p) { p.owner = 'player'; p.buildings = emptyBuildings(); p.buildings.kraftwerk = 1; p.queue = []; p.shipQueue = []; p.pop = 4; p.sat = 50; p.laws = null; p.garrison = 30; p.defense = 0; emit(state, 'info', `${planetName(p.id)} wurde dir abgetreten.`); } }
      for (const f of state.fleets) if (f.owner === 'ai' && (f.role === 'attack' || f.role === 'raid')) { const pth = path(f.move ? f.move.to : f.system, 'draxis'); f.role = 'return'; if (!f.move && pth && pth.length) f.move = { from: f.system, to: pth.shift(), t: 0, total: travelTime(f, state), path: pth }; else if (f.move) f.move.path = pth || []; }
      emit(state, 'info', `Draxis akzeptiert: ${T.name}. 10 Minuten Waffenruhe.`);
    } else { d.relation -= 4; relationLog(state, -4, `Friedensangebot „${T.name}“ abgelehnt`); emit(state, 'warn', `Draxis lehnt „${T.name}“ ab (Chance ${Math.round(chance * 100)}%).`); }
    return null;
  },
};
export function peaceChance(state, term) {
  const T = PEACE_TERMS[term]; const r = playerPower(state) / Math.max(1, aiPowerReal(state));
  return Math.max(0.03, Math.min(0.95, 0.4 + 0.35 * (r - T.need) + state.diplo.relation / 250 + personality(state).talk + 0.01 * Math.min(20, state.prisoners)));
}

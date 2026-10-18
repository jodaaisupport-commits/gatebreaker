// Spiellogik: Zustand, Tick, Aktionen. Kein DOM, kein Three.js – kann später 1:1 auf einen Node/WebSocket-Server wandern.
import { SYSTEMS, GATES, BUILDINGS, BUILDING_ORDER, SHIPS, SHIP_ORDER, buildingCost, buildingTime, TRAVEL_TIME, GATE_COOLDOWN, OFFLINE_CAP, RES } from './data.js';
import { createBattle, stepBattle, autoResolve, survivors, defaultSettings } from './battleSim.js';

export const SAVE_KEY = 'gatebreaker-save-v1';

export function newGame(now = Date.now()) {
  const planets = {};
  for (const sys of SYSTEMS) for (const p of sys.planets) {
    planets[p.id] = { id: p.id, system: sys.id, owner: p.owner, home: !!p.home, garrison: p.garrison || 0, defense: p.defense || 0,
      buildings: p.owner === 'player' && p.home ? { mine: 1, raffinerie: 1, kraftwerk: 1, werft: 0, abwehr: 0 } : null,
      queue: [], shipQueue: [], bombard: null };
  }
  return {
    version: 1, time: 0, lastSave: now, nextId: 10,
    res: { erz: 350, treibstoff: 180, energie: 80, credits: 250 },
    planets,
    fleets: [
      { id: 1, owner: 'player', name: 'Heimatflotte', ships: { jaeger: 4, bomber: 0, fregatte: 1, zerstoerer: 0 }, system: 'helios', move: null, cooldown: 0 },
      { id: 2, owner: 'ai', name: 'Draxis-Wache', ships: { jaeger: 4, bomber: 2, fregatte: 2, zerstoerer: 0 }, system: 'draxis', move: null, cooldown: 0, role: 'home' },
      { id: 3, owner: 'ai', name: 'Vortex-Patrouille', ships: { jaeger: 3, bomber: 1, fregatte: 1, zerstoerer: 0 }, system: 'vortex', move: null, cooldown: 0, role: 'guard' },
    ],
    explored: { helios: true },
    ai: { budget: 0, buildTimer: 20, attackTimer: 360, defeated: false, waves: 0 },
    battle: null, battleSettings: defaultSettings(), lastReport: null,
    events: [],
  };
}

// ---------- Hilfen ----------
export const sysById = id => SYSTEMS.find(s => s.id === id);
export const neighbors = id => GATES.filter(g => g.includes(id)).map(g => (g[0] === id ? g[1] : g[0]));
export function path(from, to) {
  const prev = { [from]: null }; const q = [from];
  while (q.length) { const c = q.shift(); if (c === to) break; for (const n of neighbors(c)) if (!(n in prev)) { prev[n] = c; q.push(n); } }
  if (!(to in prev)) return null;
  const p = []; for (let c = to; c !== from; c = prev[c]) p.unshift(c); return p;
}
export const shipCount = f => Object.values(f.ships).reduce((a, c) => a + c, 0);
export function fleetPower(ships) { let p = 0; for (const t in ships) { const d = SHIPS[t]; p += ships[t] * Math.sqrt((d.hull + d.shield) * d.dmg / d.rate); } return Math.round(p); }
function emit(state, level, text, extra = {}) { state.events.push({ level, text, ...extra }); }
export function canAfford(state, cost) { return Object.entries(cost).every(([r, v]) => (state.res[r] || 0) >= v); }
function pay(state, cost) { for (const r in cost) state.res[r] -= cost[r]; }
export function homePlanet(state) { return Object.values(state.planets).find(p => p.owner === 'player' && p.home); }
export function fleetsIn(state, sys, owner) { return state.fleets.filter(f => f.system === sys && !f.move && (!owner || f.owner === owner) && shipCount(f) > 0); }
export function playerVisible(state, sys) { return fleetsIn(state, sys, 'player').length > 0 || Object.values(state.planets).some(p => p.system === sys && p.owner === 'player'); }

// ---------- Wirtschaft ----------
export function rates(state) {
  const hp = homePlanet(state); const b = hp ? hp.buildings : { mine: 0, raffinerie: 0, kraftwerk: 0, werft: 0, abwehr: 0 };
  const colonies = Object.values(state.planets).filter(p => p.owner === 'player' && !p.home).length;
  const eProd = 3.2 * b.kraftwerk + 0.5 * colonies;
  const eCons = 1.0 * (b.mine + b.raffinerie) + 1.5 * b.werft + 0.8 * b.abwehr;
  const eNet = eProd - eCons;
  const eff = (eNet >= 0 || state.res.energie > 0) ? 1 : Math.max(0.3, eProd / Math.max(1, eCons));
  let upkeep = 0; const UP = { jaeger: 0.01, bomber: 0.02, fregatte: 0.05, zerstoerer: 0.1 };
  for (const f of state.fleets) if (f.owner === 'player') for (const t in f.ships) upkeep += f.ships[t] * UP[t];
  return {
    erz: (2.2 * b.mine + 1.0 * colonies) * eff,
    treibstoff: (1.1 * b.raffinerie + 0.4 * colonies) * eff,
    energie: eNet,
    credits: 1.2 + 0.25 * (b.mine + b.raffinerie + b.kraftwerk + b.werft) + 0.8 * colonies - upkeep,
    eff, upkeep, eProd, eCons,
  };
}

// ---------- Tick ----------
export function tick(state, dt, opts = {}) {
  state.time += dt;
  const r = rates(state);
  for (const k of RES) state.res[k] = Math.max(0, state.res[k] + r[k] * dt);

  // Bauaufträge
  for (const p of Object.values(state.planets)) {
    if (p.owner !== 'player' || !p.buildings) continue;
    const q = p.queue[0];
    if (q) { q.remaining -= dt; if (q.remaining <= 0) { p.queue.shift(); p.buildings[q.key] = (p.buildings[q.key] || 0) + 1; emit(state, 'info', `${BUILDINGS[q.key].name} auf Stufe ${p.buildings[q.key]} fertig.`); } }
    const sq = p.shipQueue[0];
    if (sq && p.buildings.werft > 0) {
      sq.remaining -= dt;
      if (sq.remaining <= 0) {
        sq.count--; 
        let f = fleetsIn(state, p.system, 'player').find(x => x.name === 'Heimatflotte') || state.fleets.find(x => x.owner === 'player' && x.system === p.system && !x.move && !x.inBattle);
        if (!f) { f = { id: state.nextId++, owner: 'player', name: 'Heimatflotte', ships: { jaeger: 0, bomber: 0, fregatte: 0, zerstoerer: 0 }, system: p.system, move: null, cooldown: 0 }; state.fleets.push(f); }
        f.ships[sq.type] = (f.ships[sq.type] || 0) + 1;
        if (sq.count <= 0) { p.shipQueue.shift(); emit(state, 'info', `Werft: ${SHIPS[sq.type].name}-Auftrag abgeschlossen.`); }
        else sq.remaining = shipTime(state, sq.type);
      }
    }
    if (p.bombard) {
      p.bombard.remaining -= dt;
      if (p.bombard.remaining <= 0) {
        const pf = fleetsIn(state, p.system, 'player'); const bombers = pf.reduce((a, f) => a + (f.ships.bomber || 0) + 2 * (f.ships.zerstoerer || 0), 0);
        const before = p.garrison; p.garrison = Math.max(5, Math.round(p.garrison * (0.6 - Math.min(0.3, bombers * 0.02))));
        emit(state, 'warn', `Bombardement von ${planetName(p.id)} beendet: Garnison ${before} → ${p.garrison}.`);
        p.bombard = null;
      }
    }
  }
  // Bombardement auf feindlichen Planeten (läuft auch wenn Planet nicht Spieler gehört)
  for (const p of Object.values(state.planets)) if (p.owner !== 'player' && p.bombard) {
    if (fleetsIn(state, p.system, 'player').length === 0) { p.bombard = null; continue; }
    p.bombard.remaining -= dt;
    if (p.bombard.remaining <= 0) {
      const pf = fleetsIn(state, p.system, 'player'); const heavy = pf.reduce((a, f) => a + (f.ships.bomber || 0) + 2 * (f.ships.zerstoerer || 0), 0);
      const before = p.garrison; p.garrison = Math.max(5, Math.round(p.garrison * (0.6 - Math.min(0.3, heavy * 0.02))));
      emit(state, 'warn', `Bombardement von ${planetName(p.id)} beendet: Garnison ${before} → ${p.garrison}.`);
      p.bombard = null;
    }
  }

  // Flottenbewegung
  for (const f of state.fleets) {
    if (f.cooldown > 0) f.cooldown = Math.max(0, f.cooldown - dt);
    if (!f.move || f.inBattle) continue;
    if (f.move.t === 0 && f.cooldown > 0) continue; // wartet auf Torabkühlung
    f.move.t += dt;
    if (f.move.t >= f.move.total) {
      f.system = f.move.to; f.cooldown = GATE_COOLDOWN;
      if (f.owner === 'player') { if (!state.explored[f.system]) emit(state, 'info', `System ${sysById(f.system).name} erkundet.`); state.explored[f.system] = true; }
      if (f.move.path.length) { const nx = f.move.path.shift(); f.move = { from: f.system, to: nx, t: 0, total: travelTime(f), path: f.move.path }; }
      else { f.move = null; if (f.owner === 'player') emit(state, 'info', `${f.name} ist in ${sysById(f.system).name} angekommen.`); }
    }
  }
  // Gleiche Flotten im System zusammenlegen (KI)
  mergeAI(state);
  aiTick(state, dt);
  checkEncounters(state, opts);

  // Laufende Echtzeitschlacht
  if (state.battle) {
    stepBattle(state.battle, dt);
    if (state.battle.over) finishBattle(state, state.battle, false);
  }
  // Verteidigung regeneriert, wenn kein Spieler im Orbit
  for (const p of Object.values(state.planets)) if (p.owner === 'ai' && fleetsIn(state, p.system, 'player').length === 0) {
    const max = p.home ? 3 : 1; p.defRegen = (p.defRegen || 0) + dt;
    if (p.defense < max && p.defRegen > 120) { p.defense++; p.defRegen = 0; }
  }
  // Planeten, die die KI zurückerobert
  for (const p of Object.values(state.planets)) if (p.owner === 'player' && !p.home) {
    if (fleetsIn(state, p.system, 'ai').length && !fleetsIn(state, p.system, 'player').length && !(state.battle && state.battle.system === p.system)) {
      p.owner = 'ai'; p.garrison = 50; p.defense = 0; emit(state, 'alert', `${planetName(p.id)} wurde von Draxis zurückerobert!`);
    }
  }
}

export function planetName(id) { for (const s of SYSTEMS) for (const p of s.planets) if (p.id === id) return p.name; return id; }
export function travelTime(f) { return TRAVEL_TIME * (f.ships.zerstoerer ? 1.3 : f.ships.fregatte ? 1.15 : 1); }
export function shipTime(state, type) { const hp = homePlanet(state); return Math.max(2, SHIPS[type].time / (1 + 0.25 * ((hp?.buildings.werft || 1) - 1))); }

function mergeAI(state) {
  const seen = {};
  for (const f of state.fleets) {
    if (f.owner !== 'ai' || f.move || f.inBattle || shipCount(f) === 0) continue;
    const k = f.system;
    if (seen[k]) { const g = seen[k]; for (const t in f.ships) g.ships[t] = (g.ships[t] || 0) + f.ships[t]; f.ships = {}; if (f.role === 'home' || g.role !== 'home' && f.system === 'draxis') g.role = 'home'; }
    else seen[k] = f;
  }
  state.fleets = state.fleets.filter(f => shipCount(f) > 0 || (f.owner === 'player' && f.name === 'Heimatflotte' && !f.move));
}

// ---------- KI ----------
function aiTick(state, dt) {
  const ai = state.ai; if (ai.defeated) return;
  const home = state.planets['draxis-prime'];
  if (home.owner !== 'ai') { ai.defeated = true; emit(state, 'info', 'Das Draxis-Imperium ist gefallen! Die Galaxis gehört dir – das Spiel läuft endlos weiter.'); return; }
  const aiPlanets = Object.values(state.planets).filter(p => p.owner === 'ai').length;
  ai.budget += (1.4 + aiPlanets * 0.3 + Math.min(3, state.time / 1200)) * dt;
  ai.buildTimer -= dt;
  if (ai.buildTimer <= 0) {
    ai.buildTimer = 15;
    if (fleetsIn(state, 'draxis', 'player').length) { ai.buildTimer = 30; } else {
    let hf = state.fleets.find(f => f.owner === 'ai' && f.system === 'draxis' && !f.move && !f.inBattle);
    if (!hf) { hf = { id: state.nextId++, owner: 'ai', name: 'Draxis-Wache', ships: {}, system: 'draxis', move: null, cooldown: 0, role: 'home' }; state.fleets.push(hf); }
    const capPower = 350 + state.time * 0.25; // begrenzt Wachstum (auch offline)
    let guard = 0;
    while (guard++ < 20 && fleetPower(hf.ships) < capPower) {
      const roll = Math.random(); const t = roll < 0.35 ? 'jaeger' : roll < 0.6 ? 'bomber' : roll < 0.88 ? 'fregatte' : 'zerstoerer';
      const c = SHIPS[t].cost.erz + SHIPS[t].cost.credits; if (ai.budget < c) break;
      ai.budget -= c; hf.ships[t] = (hf.ships[t] || 0) + 1;
    }
    }
  }
  ai.attackTimer -= dt;
  if (ai.attackTimer <= 0) {
    ai.attackTimer = 360 + Math.random() * 180;
    const hf = state.fleets.find(f => f.owner === 'ai' && f.system === 'draxis' && !f.move && !f.inBattle);
    if (hf && shipCount(hf) >= 6) {
      const atk = { id: state.nextId++, owner: 'ai', name: `Angriffswelle ${++ai.waves}`, ships: {}, system: 'draxis', move: null, cooldown: 0, role: 'attack' };
      for (const t in hf.ships) { const n = Math.floor(hf.ships[t] * 0.6); atk.ships[t] = n; hf.ships[t] -= n; }
      if (shipCount(atk) > 0) {
        const target = homePlanet(state)?.system || 'helios';
        const p = path('draxis', target);
        if (p) { const first = p.shift(); atk.move = { from: 'draxis', to: first, t: 0, total: travelTime(atk), path: p }; state.fleets.push(atk);
          const eta = Math.round(travelTime(atk) * (p.length + 1));
          emit(state, 'alert', `Sensoren: ${atk.name} (${shipCount(atk)} Schiffe) vom Draxis-Imperium im Anflug auf ${sysById(target).name}! ETA ca. ${eta}s`); }
      }
    }
  }
  // Angreifer ohne Ziel kehren heim
  for (const f of state.fleets) if (f.owner === 'ai' && f.role === 'attack' && f.done && !f.inBattle && !f.move) {
    f.done = false; const p = path(f.system, 'draxis');
    if (p && p.length) { const first = p.shift(); f.move = { from: f.system, to: first, t: 0, total: travelTime(f), path: p }; f.role = 'return'; }
  }
  for (const f of state.fleets) if (f.owner === 'ai' && f.role === 'return' && !f.move && f.system === 'draxis') f.role = 'home';
}

// ---------- Begegnungen & Schlachten ----------
function checkEncounters(state, opts) {
  for (const sys of SYSTEMS) {
    if (state.battle && state.battle.system === sys.id) continue;
    const pf = fleetsIn(state, sys.id, 'player').filter(f => !f.inBattle);
    const af = fleetsIn(state, sys.id, 'ai').filter(f => !f.inBattle);
    const aiPlanetsDef = Object.values(state.planets).filter(p => p.system === sys.id && p.owner === 'ai').reduce((a, p) => a + p.defense, 0);
    const hp = homePlanet(state); const playerDef = hp && hp.system === sys.id ? hp.buildings.abwehr : 0;
    const fight = (pf.length && (af.length || aiPlanetsDef > 0)) || (af.length && hp && hp.system === sys.id && (playerDef > 0 || pf.length));
    if (!fight) {
      // Plündern: KI-Angreifer an ungeschützter Heimatwelt
      if (af.length && hp && hp.system === sys.id && !pf.length && !playerDef) plunder(state, af);
      continue;
    }
    const attacker = af.some(f => f.role === 'attack' || f.role === 'return') ? 'ai' : 'player';
    const merge = (fl, owner) => { const s = {}; for (const f of fl) for (const t in f.ships) s[t] = (s[t] || 0) + f.ships[t]; return s; };
    const sides = { player: { ships: merge(pf), platforms: playerDef }, ai: { ships: merge(af), platforms: aiPlanetsDef } };
    const b = createBattle({ system: sys.id, sides, attacker, settings: { player: JSON.parse(JSON.stringify(state.battleSettings)) }, seed: (Math.random() * 1e9) | 0 });
    b.playerFleets = pf.map(f => f.id); b.aiFleets = af.map(f => f.id);
    for (const f of [...pf, ...af]) f.inBattle = true;
    if (opts.offline || state.battle) { autoResolve(b); finishBattle(state, b, true); }
    else { state.battle = b; emit(state, 'alert', `Gefecht in ${sys.name}! ${shipCount({ ships: sides.player.ships })} gegen ${shipCount({ ships: sides.ai.ships })} Schiffe.`, { battle: true }); }
  }
}

function plunder(state, af) {
  const share = 0.1; const loot = {};
  for (const r of ['erz', 'treibstoff', 'credits']) { loot[r] = Math.round(state.res[r] * share); state.res[r] -= loot[r]; }
  emit(state, 'alert', `Helios wurde geplündert! Verloren: ${loot.erz} Erz, ${loot.treibstoff} Treibstoff, ${loot.credits} Credits. Baue Abwehrplattformen oder halte eine Flotte daheim.`);
  for (const f of af) { f.done = true; f.role = 'attack'; }
}

function applySurvivors(state, ids, surv) {
  const fleets = state.fleets.filter(f => ids.includes(f.id));
  // alle Überlebenden in die erste Flotte, Rest leeren
  fleets.forEach((f, i) => { f.inBattle = false; f.ships = i === 0 ? { jaeger: 0, bomber: 0, fregatte: 0, zerstoerer: 0, ...surv } : {}; });
  return fleets[0];
}

export function finishBattle(state, b, auto) {
  const sp = survivors(b, 'player'), sa = survivors(b, 'ai');
  const pFleet = applySurvivors(state, b.playerFleets || [], sp.ships);
  const aFleet = applySurvivors(state, b.aiFleets || [], sa.ships);
  // Plattformen
  const hp = homePlanet(state); if (hp && hp.system === b.system && b.start.player.plattform) hp.buildings.abwehr = Math.max(sp.platforms, b.winner === 'player' ? hp.buildings.abwehr : 0);
  // Abwehrplattformen der Heimatwelt reparieren sich nach Sieg; bei Niederlage zerstört
  let aiPlat = sa.platforms;
  for (const p of Object.values(state.planets)) if (p.system === b.system && p.owner === 'ai') { const take = Math.min(p.defense, aiPlat); aiPlat -= take; p.defense = take; }
  // Bergung
  const salvage = { erz: 0, treibstoff: 0, credits: 0 };
  if (b.winner === 'player') for (const side of ['ai', 'player']) for (const t in b.lost[side]) { const c = SHIPS[t].cost; const f = side === 'ai' ? 0.35 : 0.15; salvage.erz += Math.round(c.erz * f * b.lost[side][t]); salvage.treibstoff += Math.round(c.treibstoff * f * b.lost[side][t]); salvage.credits += Math.round((c.credits || 0) * f * b.lost[side][t]); }
  for (const r in salvage) state.res[r] += salvage[r];
  if (b.retreat && pFleet) { const back = neighbors(b.system).find(n => n !== b.system); pFleet.move = { from: b.system, to: b.retreatTo || back, t: 0, total: travelTime(pFleet), path: [] }; }
  if (aFleet && b.winner === 'player' && shipCount(aFleet) > 0) { const p = path(b.system, 'draxis'); if (p && p.length) { aFleet.move = { from: b.system, to: p.shift(), t: 0, total: travelTime(aFleet), path: p }; aFleet.role = 'return'; } }
  if (aFleet && b.winner === 'ai' && aFleet.role === 'attack') aFleet.done = true;
  const report = { system: b.system, systemName: sysById(b.system).name, winner: b.winner, retreat: !!b.retreat, auto, duration: Math.round(b.time), start: b.start, lost: b.lost, salvage, time: state.time };
  state.lastReport = report;
  if (state.battle === b) state.battle = null;
  emit(state, b.winner === 'player' ? 'info' : 'alert', `${auto ? 'Automatisches Gefecht' : 'Schlacht'} in ${report.systemName}: ${b.winner === 'player' ? 'Sieg' : (b.retreat ? 'Rückzug' : 'Niederlage')}.`, { report: true, auto });
  state.fleets = state.fleets.filter(f => shipCount(f) > 0 || (f.owner === 'player' && f.name === 'Heimatflotte'));
}

// ---------- Aktionen (Client → später Server-Commands) ----------
export const actions = {
  build(state, planetId, key) {
    const p = state.planets[planetId]; if (!p || p.owner !== 'player' || !p.buildings) return 'Kein eigener Planet.';
    if (p.queue.length >= 3) return 'Bauliste voll (max. 3).';
    const lvl = (p.buildings[key] || 0) + p.queue.filter(q => q.key === key).length;
    const cost = buildingCost(key, lvl); if (!canAfford(state, cost)) return 'Nicht genug Ressourcen.';
    pay(state, cost); const t = buildingTime(key, lvl); p.queue.push({ key, remaining: t, total: t, level: lvl + 1 }); return null;
  },
  buildShip(state, type, count = 1) {
    const p = homePlanet(state); if (!p.buildings.werft) return 'Zuerst eine Raumwerft bauen.';
    if (p.shipQueue.length >= 5) return 'Werftliste voll (max. 5).';
    const cost = {}; for (const r in SHIPS[type].cost) cost[r] = SHIPS[type].cost[r] * count;
    if (!canAfford(state, cost)) return 'Nicht genug Ressourcen.';
    pay(state, cost); const t = shipTime(state, type); p.shipQueue.push({ type, count, remaining: t, total: t }); return null;
  },
  moveFleet(state, fleetId, target) {
    const f = state.fleets.find(x => x.id === fleetId && x.owner === 'player'); if (!f) return 'Flotte nicht gefunden.';
    if (f.inBattle) return 'Flotte ist im Gefecht.'; if (f.move) return 'Flotte ist bereits unterwegs.';
    if (f.system === target) return 'Flotte ist bereits dort.'; if (!shipCount(f)) return 'Flotte hat keine Schiffe.';
    const p = path(f.system, target); if (!p) return 'Kein Weg.';
    const fuel = Math.ceil(shipCount(f) * 2 * p.length); if (state.res.treibstoff < fuel) return `Zu wenig Treibstoff (${fuel} nötig).`;
    state.res.treibstoff -= fuel;
    const first = p.shift(); f.move = { from: f.system, to: first, t: 0, total: travelTime(f), path: p }; return null;
  },
  splitFleet(state, fleetId) {
    const f = state.fleets.find(x => x.id === fleetId && x.owner === 'player'); if (!f || f.move || f.inBattle) return 'Nicht möglich.';
    const n = { id: state.nextId++, owner: 'player', name: `Kampfgruppe ${state.nextId - 10}`, ships: {}, system: f.system, move: null, cooldown: f.cooldown };
    let moved = 0; for (const t of SHIP_ORDER) { const k = Math.floor((f.ships[t] || 0) / 2); n.ships[t] = k; f.ships[t] -= k; moved += k; }
    if (!moved) return 'Zu wenige Schiffe zum Teilen.'; state.fleets.push(n); return null;
  },
  mergeFleets(state, fleetId) {
    const f = state.fleets.find(x => x.id === fleetId && x.owner === 'player'); if (!f || f.move || f.inBattle) return 'Nicht möglich.';
    const others = state.fleets.filter(x => x !== f && x.owner === 'player' && x.system === f.system && !x.move && !x.inBattle);
    if (!others.length) return 'Keine weitere Flotte in diesem System.';
    for (const o of others) { for (const t in o.ships) f.ships[t] = (f.ships[t] || 0) + o.ships[t]; o.ships = {}; }
    state.fleets = state.fleets.filter(x => shipCount(x) > 0 || x === f); return null;
  },
  renameFleet(state, fleetId, name) { const f = state.fleets.find(x => x.id === fleetId && x.owner === 'player'); if (f && name) f.name = name.slice(0, 24); return null; },
  bombard(state, planetId) {
    const p = state.planets[planetId]; if (!p || p.owner !== 'ai') return 'Kein feindlicher Planet.';
    if (!fleetsIn(state, p.system, 'player').length) return 'Keine eigene Flotte im Orbit.';
    if (fleetsIn(state, p.system, 'ai').length || p.defense > 0) return 'Orbit nicht unter Kontrolle (Flotte/Abwehr aktiv).';
    if (p.bombard) return 'Bombardement läuft bereits.';
    if (state.res.treibstoff < 60) return '60 Treibstoff nötig.';
    state.res.treibstoff -= 60; p.bombard = { remaining: 8, total: 8 }; return null;
  },
  landTroops(state, planetId) {
    const p = state.planets[planetId]; if (!p || p.owner !== 'ai') return 'Kein feindlicher Planet.';
    const pf = fleetsIn(state, p.system, 'player'); if (!pf.length) return 'Keine eigene Flotte im Orbit.';
    if (fleetsIn(state, p.system, 'ai').length || p.defense > 0) return 'Orbit nicht unter Kontrolle.';
    const cost = { credits: 150, treibstoff: 50 }; if (!canAfford(state, cost)) return '150 Credits und 50 Treibstoff nötig.';
    pay(state, cost);
    const troops = pf.reduce((a, f) => a + 40 + 3 * (f.ships.jaeger || 0) + 4 * (f.ships.bomber || 0) + 10 * (f.ships.fregatte || 0) + 16 * (f.ships.zerstoerer || 0), 0);
    const roll = troops * (0.8 + Math.random() * 0.4);
    if (roll > p.garrison) { p.owner = 'player'; p.garrison = Math.round(roll - p.garrison); p.bombard = null; emit(state, 'info', `Bodentruppen siegreich: ${planetName(p.id)} gehört jetzt dir! (+Erz, +Credits)`); return null; }
    p.garrison = Math.max(5, Math.round(p.garrison - roll * 0.5)); emit(state, 'alert', `Landung auf ${planetName(p.id)} abgewehrt. Garnison noch ${p.garrison}.`); return null;
  },
  setBattleSettings(state, s) { Object.assign(state.battleSettings, s); if (s.energy) state.battleSettings.energy = { ...s.energy }; if (state.battle) Object.assign(state.battle.settings.player, JSON.parse(JSON.stringify(state.battleSettings))); return null; },
  retreat(state) {
    const b = state.battle; if (!b) return 'Keine Schlacht.';
    const pf = state.fleets.find(f => (b.playerFleets || []).includes(f.id));
    // Rückzug: dorthin, wo man herkam bzw. Richtung Heimat
    const home = homePlanet(state)?.system; let to = home && home !== b.system ? path(b.system, home)?.[0] : neighbors(b.system)[0];
    b.retreat = true; b.retreatTo = to; b.over = true; b.winner = 'ai';
    // Rückzugsverluste: 15% der Schiffe
    for (const u of b.units) if (u.alive && u.side === 'player' && u.type !== 'plattform' && Math.random() < 0.15) { u.alive = false; b.lost.player[u.type] = (b.lost.player[u.type] || 0) + 1; }
    finishBattle(state, b, false); return pf ? null : null;
  },
};

// ---------- Speichern / Laden / Offline ----------
export function save(state, storage, now = Date.now()) {
  state.lastSave = now; const { events, ...rest } = state; storage.setItem(SAVE_KEY, JSON.stringify(rest));
}
export function load(storage, now = Date.now()) {
  const raw = storage.getItem(SAVE_KEY); if (!raw) return { state: newGame(now), offline: null };
  let state; try { state = JSON.parse(raw); } catch { return { state: newGame(now), offline: null }; }
  state.events = [];
  if (state.battle) { autoResolve(state.battle); finishBattle(state, state.battle, true); }
  const secs = Math.min(OFFLINE_CAP, Math.max(0, (now - state.lastSave) / 1000));
  let offline = null;
  if (secs > 5) {
    const before = { ...state.res };
    let left = secs; while (left > 0) { const d = Math.min(1, left); tick(state, d, { offline: true }); left -= d; }
    offline = { secs: Math.round(secs), gained: Object.fromEntries(RES.map(r => [r, Math.round(state.res[r] - before[r])])), events: state.events.slice(-8) };
    state.events = [];
  }
  return { state, offline };
}

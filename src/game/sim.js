// Spiellogik: Zustand, Tick, Aktionen. Kein DOM, kein Three.js – kann später 1:1 auf einen Node/WebSocket-Server wandern.
import { SYSTEMS, GATES, BUILDINGS, SHIPS, SHIP_ORDER, buildingCost, buildingTime, TRAVEL_TIME, GATE_COOLDOWN, OFFLINE_CAP, RES, FACTIONS, TUTORIAL, TECHS, TECH_ORDER } from './data.js';
import { createBattle, stepBattle, autoResolve, survivors, defaultSettings } from './battleSim.js';

export const SAVE_KEY = 'gatebreaker-save-v2';
export const emptyBuildings = () => ({ mine: 0, raffinerie: 0, kraftwerk: 0, werft: 0, abwehr: 0 });

export function newGame(now = Date.now(), factionId = 'bergbau') {
  const fac = FACTIONS[factionId] || FACTIONS.bergbau;
  const planets = {};
  for (const sys of SYSTEMS) for (const p of sys.planets) {
    planets[p.id] = { id: p.id, system: sys.id, owner: p.owner, home: !!p.home, garrison: p.garrison || 0, defense: p.defense || 0,
      buildings: p.owner === 'player' && p.home ? { mine: 1, raffinerie: 1, kraftwerk: 1, werft: 0, abwehr: 0 } : null,
      queue: [], shipQueue: [], bombard: null, colonized: false, surveyed: false };
  }
  const res = { erz: 350, treibstoff: 180, energie: 80, credits: 250 };
  for (const r in fac.startRes) res[r] += fac.startRes[r];
  const done = [...(fac.startTech || [])];
  return {
    version: 2, time: 0, lastSave: now, nextId: 10, faction: factionId,
    res,
    planets,
    fleets: [
      { id: 1, owner: 'player', name: 'Heimatflotte', ships: { jaeger: 0, bomber: 0, fregatte: 0, zerstoerer: 0, kolonie: 0, ...fac.startShips }, system: 'helios', move: null, cooldown: 0 },
      { id: 2, owner: 'ai', name: 'Draxis-Wache', ships: { jaeger: 4, bomber: 2, fregatte: 2, zerstoerer: 0 }, system: 'draxis', move: null, cooldown: 0, role: 'home' },
      { id: 3, owner: 'ai', name: 'Vortex-Patrouille', ships: { jaeger: 3, bomber: 1, fregatte: 1, zerstoerer: 0 }, system: 'vortex', move: null, cooldown: 0, role: 'guard' },
    ],
    explored: { helios: true },
    ai: { budget: 0, buildTimer: 20, attackTimer: 360, defeated: false, waves: 0 },
    battle: null, battleSettings: defaultSettings(), battleSpeed: 1, lastReport: null,
    tech: { done, exclusive: {}, queue: null },
    tutorial: { done: [], claimed: [] },
    flags: { wonBattle: false },
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
export const shipCount = f => Object.values(f.ships || {}).reduce((a, c) => a + c, 0);
export function fleetPower(ships) { let p = 0; for (const t in ships) { if (t === 'kolonie') continue; const d = SHIPS[t]; if (!d) continue; p += ships[t] * Math.sqrt((d.hull + d.shield) * d.dmg / d.rate); } return Math.round(p); }
function emit(state, level, text, extra = {}) { state.events.push({ level, text, ...extra }); }
export function canAfford(state, cost) { return Object.entries(cost).every(([r, v]) => (state.res[r] || 0) >= v); }
function pay(state, cost) { for (const r in cost) state.res[r] -= cost[r]; }
export function homePlanet(state) { return Object.values(state.planets).find(p => p.owner === 'player' && p.home); }
export function fleetsIn(state, sys, owner) { return state.fleets.filter(f => f.system === sys && !f.move && (!owner || f.owner === owner) && shipCount(f) > 0); }
export function playerVisible(state, sys) {
  if (fleetsIn(state, sys, 'player').length > 0 || Object.values(state.planets).some(p => p.system === sys && p.owner === 'player')) return true;
  // Sensoren: angrenzende Systeme zu eigener Präsenz sichtbar (kein Rekursion)
  if (hasTech(state, 'sci_sensoren')) {
    for (const n of neighbors(sys)) {
      if (fleetsIn(state, n, 'player').length > 0 || Object.values(state.planets).some(p => p.system === n && p.owner === 'player')) return true;
    }
  }
  return false;
}
export function faction(state) { return FACTIONS[state.faction] || FACTIONS.bergbau; }
export function hasTech(state, id) { return (state.tech?.done || []).includes(id); }
export function techEffects(state) {
  const e = { mineMult: 1, fuelMult: 1, creditMult: 1, dmgMult: 1, hullMult: 1, shieldMult: 1, researchMult: 1, shipTimeMult: 1, travelMult: 1, moraleBonus: 0, salvageMult: 1, sensors: false, spyVision: false, aiSlow: 1 };
  const fac = faction(state);
  e.mineMult *= fac.mineMult || 1; e.dmgMult *= fac.dmgMult || 1; e.researchMult *= fac.researchMult || 1;
  e.creditMult *= fac.creditMult || 1; e.moraleBonus += fac.moraleBonus || 0; e.salvageMult *= fac.salvageMult || 1;
  if (fac.hullMult) e.hullMult *= fac.hullMult;
  for (const id of state.tech?.done || []) {
    const fx = TECHS[id]?.effect || {};
    for (const k of ['mineMult', 'fuelMult', 'creditMult', 'dmgMult', 'hullMult', 'shieldMult', 'researchMult', 'shipTimeMult', 'travelMult', 'salvageMult', 'aiSlow']) if (fx[k]) e[k] *= fx[k];
    if (fx.moraleBonus) e.moraleBonus += fx.moraleBonus;
    if (fx.sensors) e.sensors = true; if (fx.spyVision) e.spyVision = true;
  }
  return e;
}
export function canResearch(state, id) {
  const t = TECHS[id]; if (!t) return 'Unbekannte Tech.';
  if (hasTech(state, id)) return 'Bereits erforscht.';
  if (state.tech.queue) return 'Forschung läuft bereits.';
  if (t.exclusive && state.tech.exclusive[t.exclusive] && state.tech.exclusive[t.exclusive] !== id) return 'Exklusiver Zweig bereits gewählt.';
  for (const req of t.requires) {
    const ok = req.split('|').some(r => hasTech(state, r));
    if (!ok) return 'Voraussetzung fehlt.';
  }
  if (!canAfford(state, t.cost)) return 'Nicht genug Ressourcen.';
  return null;
}

// ---------- Wirtschaft (alle eigenen Planeten mit Gebäuden) ----------
export function rates(state) {
  const fx = techEffects(state);
  let mines = 0, raff = 0, kraft = 0, werft = 0, abwehr = 0;
  for (const p of Object.values(state.planets)) {
    if (p.owner !== 'player' || !p.buildings) continue;
    mines += p.buildings.mine || 0; raff += p.buildings.raffinerie || 0;
    kraft += p.buildings.kraftwerk || 0; werft += p.buildings.werft || 0; abwehr += p.buildings.abwehr || 0;
  }
  const bareColonies = Object.values(state.planets).filter(p => p.owner === 'player' && !p.buildings).length;
  const eProd = 3.2 * kraft + 0.5 * bareColonies;
  const eCons = 1.0 * (mines + raff) + 1.5 * werft + 0.8 * abwehr;
  const eNet = eProd - eCons;
  const eff = (eNet >= 0 || state.res.energie > 0) ? 1 : Math.max(0.3, eProd / Math.max(1, eCons));
  let upkeep = 0; const UP = { jaeger: 0.01, bomber: 0.02, fregatte: 0.05, zerstoerer: 0.1, kolonie: 0.08 };
  for (const f of state.fleets) if (f.owner === 'player') for (const t in f.ships) upkeep += (f.ships[t] || 0) * (UP[t] || 0);
  return {
    erz: (2.2 * mines * fx.mineMult + 1.0 * bareColonies) * eff,
    treibstoff: (1.1 * raff * fx.fuelMult + 0.4 * bareColonies) * eff,
    energie: eNet,
    credits: (1.2 + 0.25 * (mines + raff + kraft + werft) + 0.8 * bareColonies) * fx.creditMult - upkeep,
    eff, upkeep, eProd, eCons, fx,
  };
}

function claimTutorial(state) {
  if (!state.tutorial) state.tutorial = { done: [], claimed: [] };
  for (const task of TUTORIAL) {
    if (state.tutorial.claimed.includes(task.id)) continue;
    if (state.tutorial.done.includes(task.id)) continue;
    try { if (!task.check(state)) continue; } catch { continue; }
    state.tutorial.done.push(task.id);
    state.tutorial.claimed.push(task.id);
    for (const r in task.reward) state.res[r] = (state.res[r] || 0) + task.reward[r];
    const rw = Object.entries(task.reward).map(([k, v]) => `+${v} ${k === 'credits' ? 'Credits' : k === 'erz' ? 'Erz' : k === 'treibstoff' ? 'Treibstoff' : k}`).join(', ');
    emit(state, 'info', `Auftrag erledigt: ${task.title} (${rw})`);
  }
}

// ---------- Tick ----------
export function tick(state, dt, opts = {}) {
  migrate(state);
  state.time += dt;
  const r = rates(state);
  for (const k of RES) state.res[k] = Math.max(0, state.res[k] + r[k] * dt);

  // Forschung
  if (state.tech?.queue) {
    const q = state.tech.queue;
    const spd = techEffects(state).researchMult;
    q.remaining -= dt * spd;
    if (q.remaining <= 0) {
      state.tech.done.push(q.id);
      const t = TECHS[q.id];
      if (t?.exclusive) state.tech.exclusive[t.exclusive] = q.id;
      emit(state, 'info', `Forschung abgeschlossen: ${t?.name || q.id}`);
      state.tech.queue = null;
    }
  }

  // Bauaufträge
  for (const p of Object.values(state.planets)) {
    if (p.owner !== 'player' || !p.buildings) continue;
    const q = p.queue[0];
    if (q) { q.remaining -= dt; if (q.remaining <= 0) { p.queue.shift(); p.buildings[q.key] = (p.buildings[q.key] || 0) + 1; emit(state, 'info', `${BUILDINGS[q.key].name} auf Stufe ${p.buildings[q.key]} fertig (${planetName(p.id)}).`); } }
    const sq = p.shipQueue[0];
    if (sq && p.buildings.werft > 0) {
      sq.remaining -= dt;
      if (sq.remaining <= 0) {
        sq.count--;
        let f = fleetsIn(state, p.system, 'player').find(x => x.name === 'Heimatflotte') || state.fleets.find(x => x.owner === 'player' && x.system === p.system && !x.move && !x.inBattle);
        if (!f) { f = { id: state.nextId++, owner: 'player', name: p.home ? 'Heimatflotte' : `Flotte ${planetName(p.id)}`, ships: { jaeger: 0, bomber: 0, fregatte: 0, zerstoerer: 0, kolonie: 0 }, system: p.system, move: null, cooldown: 0 }; state.fleets.push(f); }
        f.ships[sq.type] = (f.ships[sq.type] || 0) + 1;
        if (sq.count <= 0) { p.shipQueue.shift(); emit(state, 'info', `Werft: ${SHIPS[sq.type].name}-Auftrag abgeschlossen.`); }
        else sq.remaining = shipTime(state, sq.type, p);
      }
    }
  }
  // Bombardement
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
    if (f.move.t === 0 && f.cooldown > 0) continue;
    f.move.t += dt;
    if (f.move.t >= f.move.total) {
      f.system = f.move.to; f.cooldown = GATE_COOLDOWN;
      if (f.owner === 'player') { if (!state.explored[f.system]) emit(state, 'info', `System ${sysById(f.system).name} erkundet.`); state.explored[f.system] = true; }
      if (f.move.path.length) { const nx = f.move.path.shift(); f.move = { from: f.system, to: nx, t: 0, total: travelTime(f, state), path: f.move.path }; }
      else { f.move = null; if (f.owner === 'player') emit(state, 'info', `${f.name} ist in ${sysById(f.system).name} angekommen.`); }
    }
  }
  mergeAI(state);
  aiTick(state, dt);
  checkEncounters(state, opts);

  if (state.battle) {
    const spd = state.battleSpeed || 1;
    stepBattle(state.battle, dt * spd);
    if (state.battle.over) finishBattle(state, state.battle, false);
  }
  for (const p of Object.values(state.planets)) if (p.owner === 'ai' && fleetsIn(state, p.system, 'player').length === 0) {
    const max = p.home ? 3 : 1; p.defRegen = (p.defRegen || 0) + dt;
    if (p.defense < max && p.defRegen > 120) { p.defense++; p.defRegen = 0; }
  }
  for (const p of Object.values(state.planets)) if (p.owner === 'player' && !p.home) {
    if (fleetsIn(state, p.system, 'ai').length && !fleetsIn(state, p.system, 'player').length && !(state.battle && state.battle.system === p.system)) {
      p.owner = 'ai'; p.garrison = 50; p.defense = 0; p.buildings = null; p.queue = []; p.shipQueue = []; p.colonized = false;
      emit(state, 'alert', `${planetName(p.id)} wurde von Draxis zurückerobert!`);
    }
  }
  claimTutorial(state);
}

export function planetName(id) { for (const s of SYSTEMS) for (const p of s.planets) if (p.id === id) return p.name; return id; }
export function travelTime(f, state) {
  let t = TRAVEL_TIME * (f.ships?.zerstoerer ? 1.3 : f.ships?.fregatte ? 1.15 : f.ships?.kolonie ? 1.4 : 1);
  if (state) t *= techEffects(state).travelMult;
  return t;
}
export function shipTime(state, type, planet) {
  const p = planet || homePlanet(state);
  const fx = techEffects(state);
  return Math.max(2, SHIPS[type].time * fx.shipTimeMult / (1 + 0.25 * ((p?.buildings?.werft || 1) - 1)));
}

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
      const capPower = 350 + state.time * 0.25;
      let guard = 0;
      while (guard++ < 20 && fleetPower(hf.ships) < capPower) {
        const roll = Math.random(); const t = roll < 0.35 ? 'jaeger' : roll < 0.6 ? 'bomber' : roll < 0.88 ? 'fregatte' : 'zerstoerer';
        const c = SHIPS[t].cost.erz + SHIPS[t].cost.credits; if (ai.budget < c) break;
        ai.budget -= c; hf.ships[t] = (hf.ships[t] || 0) + 1;
      }
    }
  }
  const slow = techEffects(state).aiSlow || 1;
  ai.attackTimer -= dt / slow;
  if (ai.attackTimer <= 0) {
    ai.attackTimer = 360 + Math.random() * 180;
    const hf = state.fleets.find(f => f.owner === 'ai' && f.system === 'draxis' && !f.move && !f.inBattle);
    if (hf && shipCount(hf) >= 6) {
      const atk = { id: state.nextId++, owner: 'ai', name: `Angriffswelle ${++ai.waves}`, ships: {}, system: 'draxis', move: null, cooldown: 0, role: 'attack' };
      for (const t in hf.ships) { const n = Math.floor(hf.ships[t] * 0.6); atk.ships[t] = n; hf.ships[t] -= n; }
      if (shipCount(atk) > 0) {
        const target = homePlanet(state)?.system || 'helios';
        const p = path('draxis', target);
        if (p) { const first = p.shift(); atk.move = { from: 'draxis', to: first, t: 0, total: travelTime(atk, state), path: p }; state.fleets.push(atk);
          const eta = Math.round(travelTime(atk, state) * (p.length + 1));
          emit(state, 'alert', `Sensoren: ${atk.name} (${shipCount(atk)} Schiffe) vom Draxis-Imperium im Anflug auf ${sysById(target).name}! ETA ca. ${eta}s`); }
      }
    }
  }
  for (const f of state.fleets) if (f.owner === 'ai' && f.role === 'attack' && f.done && !f.inBattle && !f.move) {
    f.done = false; const p = path(f.system, 'draxis');
    if (p && p.length) { const first = p.shift(); f.move = { from: f.system, to: first, t: 0, total: travelTime(f, state), path: p }; f.role = 'return'; }
  }
  for (const f of state.fleets) if (f.owner === 'ai' && f.role === 'return' && !f.move && f.system === 'draxis') f.role = 'home';
}

function playerDefenseIn(state, sysId) {
  return Object.values(state.planets).filter(p => p.system === sysId && p.owner === 'player' && p.buildings).reduce((a, p) => a + (p.buildings.abwehr || 0), 0);
}

function checkEncounters(state, opts) {
  for (const sys of SYSTEMS) {
    if (state.battle && state.battle.system === sys.id) continue;
    const pf = fleetsIn(state, sys.id, 'player').filter(f => !f.inBattle);
    const af = fleetsIn(state, sys.id, 'ai').filter(f => !f.inBattle);
    const aiPlanetsDef = Object.values(state.planets).filter(p => p.system === sys.id && p.owner === 'ai').reduce((a, p) => a + p.defense, 0);
    const playerDef = playerDefenseIn(state, sys.id);
    const hp = homePlanet(state);
    const fight = (pf.length && (af.length || aiPlanetsDef > 0)) || (af.length && hp && hp.system === sys.id && (playerDef > 0 || pf.length));
    if (!fight) {
      if (af.length && hp && hp.system === sys.id && !pf.length && !playerDef) plunder(state, af);
      continue;
    }
    const attacker = af.some(f => f.role === 'attack' || f.role === 'return') ? 'ai' : 'player';
    const merge = (fl) => { const s = {}; for (const f of fl) for (const t in f.ships) if (t !== 'kolonie' || !SHIPS[t].civilian) s[t] = (s[t] || 0) + f.ships[t]; return s; };
    // Kolonieschiffe mitzählen aber schwach
    const mergeAll = (fl) => { const s = {}; for (const f of fl) for (const t in f.ships) s[t] = (s[t] || 0) + f.ships[t]; return s; };
    const sides = { player: { ships: mergeAll(pf), platforms: playerDef }, ai: { ships: mergeAll(af), platforms: aiPlanetsDef } };
    const fx = techEffects(state);
    const b = createBattle({ system: sys.id, sides, attacker, settings: { player: JSON.parse(JSON.stringify(state.battleSettings)) }, seed: (Math.random() * 1e9) | 0 });
    // Fraktions-/Tech-Boni auf Spielereinheiten anwenden
    for (const u of b.units) if (u.side === 'player') {
      u.maxHull = Math.round(u.maxHull * fx.hullMult); u.hull = u.maxHull;
      u.shield = Math.round(u.shield * fx.shieldMult);
      u.dmgMult = fx.dmgMult;
    }
    b.morale.player = Math.min(1.2, 1 + fx.moraleBonus);
    b.playerFleets = pf.map(f => f.id); b.aiFleets = af.map(f => f.id);
    b._fx = fx;
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
  fleets.forEach((f, i) => { f.inBattle = false; f.ships = i === 0 ? { jaeger: 0, bomber: 0, fregatte: 0, zerstoerer: 0, kolonie: 0, ...surv } : {}; });
  return fleets[0];
}

export function finishBattle(state, b, auto) {
  const sp = survivors(b, 'player'), sa = survivors(b, 'ai');
  // Kolonieschiffe die nicht im Kampf waren? Sie waren in survivors wenn alive
  const pFleet = applySurvivors(state, b.playerFleets || [], sp.ships);
  const aFleet = applySurvivors(state, b.aiFleets || [], sa.ships);
  // Plattformen auf allen eigenen Planeten im System
  if (b.start.player.plattform) {
    let left = sp.platforms;
    for (const p of Object.values(state.planets)) if (p.system === b.system && p.owner === 'player' && p.buildings) {
      const had = p.buildings.abwehr || 0; if (!had) continue;
      const keep = Math.min(had, left); left -= keep; p.buildings.abwehr = keep;
    }
  }
  let aiPlat = sa.platforms;
  for (const p of Object.values(state.planets)) if (p.system === b.system && p.owner === 'ai') { const take = Math.min(p.defense, aiPlat); aiPlat -= take; p.defense = take; }
  const fx = b._fx || techEffects(state);
  const salvage = { erz: 0, treibstoff: 0, credits: 0 };
  if (b.winner === 'player') for (const side of ['ai', 'player']) for (const t in b.lost[side]) {
    const c = SHIPS[t]?.cost || {}; const f = (side === 'ai' ? 0.35 : 0.15) * fx.salvageMult;
    salvage.erz += Math.round((c.erz || 0) * f * b.lost[side][t]);
    salvage.treibstoff += Math.round((c.treibstoff || 0) * f * b.lost[side][t]);
    salvage.credits += Math.round((c.credits || 0) * f * b.lost[side][t]);
  }
  for (const r in salvage) state.res[r] += salvage[r];
  if (b.winner === 'player') state.flags.wonBattle = true;
  if (b.retreat && pFleet) { const back = neighbors(b.system).find(n => n !== b.system); pFleet.move = { from: b.system, to: b.retreatTo || back, t: 0, total: travelTime(pFleet, state), path: [] }; }
  if (aFleet && b.winner === 'player' && shipCount(aFleet) > 0) { const p = path(b.system, 'draxis'); if (p && p.length) { aFleet.move = { from: b.system, to: p.shift(), t: 0, total: travelTime(aFleet, state), path: p }; aFleet.role = 'return'; } }
  if (aFleet && b.winner === 'ai' && aFleet.role === 'attack') aFleet.done = true;
  const report = { system: b.system, systemName: sysById(b.system).name, winner: b.winner, retreat: !!b.retreat, auto, duration: Math.round(b.time), start: b.start, lost: b.lost, salvage, time: state.time };
  state.lastReport = report;
  if (state.battle === b) state.battle = null;
  emit(state, b.winner === 'player' ? 'info' : 'alert', `${auto ? 'Automatisches Gefecht' : 'Schlacht'} in ${report.systemName}: ${b.winner === 'player' ? 'Sieg' : (b.retreat ? 'Rückzug' : 'Niederlage')}.`, { report: true, auto });
  state.fleets = state.fleets.filter(f => shipCount(f) > 0 || (f.owner === 'player' && f.name === 'Heimatflotte'));
  claimTutorial(state);
}

export const actions = {
  build(state, planetId, key) {
    const p = state.planets[planetId]; if (!p || p.owner !== 'player' || !p.buildings) return 'Kein eigener Planet.';
    if (p.queue.length >= 3) return 'Bauliste voll (max. 3).';
    const lvl = (p.buildings[key] || 0) + p.queue.filter(q => q.key === key).length;
    const cost = buildingCost(key, lvl); if (!canAfford(state, cost)) return 'Nicht genug Ressourcen.';
    pay(state, cost); const t = buildingTime(key, lvl); p.queue.push({ key, remaining: t, total: t, level: lvl + 1 }); return null;
  },
  buildShip(state, type, count = 1, planetId = null) {
    if (!SHIPS[type]) return 'Unbekanntes Schiff.';
    const p = planetId ? state.planets[planetId] : homePlanet(state);
    if (!p || p.owner !== 'player' || !p.buildings?.werft) return 'Zuerst eine Raumwerft auf diesem Planeten bauen.';
    if (p.shipQueue.length >= 5) return 'Werftliste voll (max. 5).';
    const cost = {}; for (const r in SHIPS[type].cost) cost[r] = SHIPS[type].cost[r] * count;
    if (!canAfford(state, cost)) return 'Nicht genug Ressourcen.';
    pay(state, cost); const t = shipTime(state, type, p); p.shipQueue.push({ type, count, remaining: t, total: t }); return null;
  },
  moveFleet(state, fleetId, target) {
    const f = state.fleets.find(x => x.id === fleetId && x.owner === 'player'); if (!f) return 'Flotte nicht gefunden.';
    if (f.inBattle) return 'Flotte ist im Gefecht.'; if (f.move) return 'Flotte ist bereits unterwegs.';
    if (f.system === target) return 'Flotte ist bereits dort.'; if (!shipCount(f)) return 'Flotte hat keine Schiffe.';
    const p = path(f.system, target); if (!p) return 'Kein Weg.';
    const fuel = Math.ceil(shipCount(f) * 2 * p.length); if (state.res.treibstoff < fuel) return `Zu wenig Treibstoff (${fuel} nötig).`;
    state.res.treibstoff -= fuel;
    const first = p.shift(); f.move = { from: f.system, to: first, t: 0, total: travelTime(f, state), path: p }; return null;
  },
  splitFleet(state, fleetId) {
    const f = state.fleets.find(x => x.id === fleetId && x.owner === 'player'); if (!f || f.move || f.inBattle) return 'Nicht möglich.';
    const n = { id: state.nextId++, owner: 'player', name: `Kampfgruppe ${state.nextId - 10}`, ships: {}, system: f.system, move: null, cooldown: f.cooldown };
    let moved = 0; for (const t of SHIP_ORDER) { const k = Math.floor((f.ships[t] || 0) / 2); n.ships[t] = k; f.ships[t] = (f.ships[t] || 0) - k; moved += k; }
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
    if (roll > p.garrison) {
      p.owner = 'player'; p.garrison = Math.round(roll - p.garrison); p.bombard = null; p.colonized = false;
      // Eroberte Planeten bekommen volle Bauverwaltung (Startstufe 0, Kraftwerk 1)
      p.buildings = emptyBuildings(); p.buildings.kraftwerk = 1; p.queue = []; p.shipQueue = [];
      emit(state, 'info', `Bodentruppen siegreich: ${planetName(p.id)} gehört jetzt dir! Gebäudeverwaltung freigeschaltet.`);
      claimTutorial(state); return null;
    }
    p.garrison = Math.max(5, Math.round(p.garrison - roll * 0.5)); emit(state, 'alert', `Landung auf ${planetName(p.id)} abgewehrt. Garnison noch ${p.garrison}.`); return null;
  },
  survey(state, planetId) {
    const p = state.planets[planetId]; if (!p || p.owner) return 'Nur unbesiedelte Planeten.';
    if (!fleetsIn(state, p.system, 'player').length) return 'Keine eigene Flotte im Orbit.';
    if (p.surveyed) return 'Bereits erkundet.';
    if (state.res.treibstoff < 15) return '15 Treibstoff nötig.';
    state.res.treibstoff -= 15; p.surveyed = true;
    emit(state, 'info', `${planetName(p.id)} erkundet – bereit zur Kolonisierung.`); return null;
  },
  colonize(state, planetId) {
    const p = state.planets[planetId]; if (!p || p.owner) return 'Nur unbesiedelte Planeten.';
    const pf = fleetsIn(state, p.system, 'player'); if (!pf.length) return 'Keine eigene Flotte im Orbit.';
    if (!p.surveyed) return 'Zuerst erkunden (Survey).';
    const carrier = pf.find(f => (f.ships.kolonie || 0) > 0); if (!carrier) return 'Ein Kolonieschiff in der Flotte nötig.';
    carrier.ships.kolonie -= 1;
    p.owner = 'player'; p.colonized = true; p.garrison = 40;
    p.buildings = emptyBuildings();
    if (faction(state).colonyBonusMine) p.buildings.mine = 1;
    p.buildings.kraftwerk = 1; p.queue = []; p.shipQueue = [];
    emit(state, 'info', `${planetName(p.id)} kolonisiert! Kolonie gegründet.`);
    claimTutorial(state); return null;
  },
  research(state, techId) {
    const err = canResearch(state, techId); if (err) return err;
    const t = TECHS[techId]; pay(state, t.cost);
    state.tech.queue = { id: techId, remaining: t.time, total: t.time };
    emit(state, 'info', `Forschung gestartet: ${t.name}`); return null;
  },
  setBattleSettings(state, s) {
    Object.assign(state.battleSettings, s);
    if (s.energy) state.battleSettings.energy = { ...s.energy };
    if (state.battle) Object.assign(state.battle.settings.player, JSON.parse(JSON.stringify(state.battleSettings)));
    return null;
  },
  setBattleSpeed(state, spd) { state.battleSpeed = spd === 2 ? 2 : 1; return null; },
  retreat(state) {
    const b = state.battle; if (!b) return 'Keine Schlacht.';
    const home = homePlanet(state)?.system; let to = home && home !== b.system ? path(b.system, home)?.[0] : neighbors(b.system)[0];
    b.retreat = true; b.retreatTo = to; b.over = true; b.winner = 'ai';
    for (const u of b.units) if (u.alive && u.side === 'player' && u.type !== 'plattform' && Math.random() < 0.15) { u.alive = false; b.lost.player[u.type] = (b.lost.player[u.type] || 0) + 1; }
    finishBattle(state, b, false); return null;
  },
};

function migrate(state) {
  if (!state.version || state.version < 2) state.version = 2;
  if (!state.faction) state.faction = 'bergbau';
  if (!state.tech) state.tech = { done: [], exclusive: {}, queue: null };
  if (!state.tutorial) state.tutorial = { done: [], claimed: [] };
  if (!state.flags) state.flags = { wonBattle: false };
  if (state.battleSpeed == null) state.battleSpeed = 1;
  for (const p of Object.values(state.planets)) {
    if (p.surveyed == null) p.surveyed = false;
    if (p.colonized == null) p.colonized = false;
    if (!p.queue) p.queue = []; if (!p.shipQueue) p.shipQueue = [];
  }
  for (const f of state.fleets) if (f.ships && f.ships.kolonie == null) f.ships.kolonie = 0;
}

export function save(state, storage, now = Date.now()) {
  state.lastSave = now; const { events, ...rest } = state; storage.setItem(SAVE_KEY, JSON.stringify(rest));
  // Alte Speicherstände nicht löschen, aber neue nutzen v2
}
export function load(storage, now = Date.now()) {
  let raw = storage.getItem(SAVE_KEY);
  if (!raw) raw = storage.getItem('gatebreaker-save-v1'); // Migration
  if (!raw) return { state: null, offline: null, needsFaction: true };
  let state; try { state = JSON.parse(raw); } catch { return { state: null, offline: null, needsFaction: true }; }
  state.events = []; migrate(state);
  if (state.battle) { autoResolve(state.battle); finishBattle(state, state.battle, true); }
  const secs = Math.min(OFFLINE_CAP, Math.max(0, (now - state.lastSave) / 1000));
  let offline = null;
  if (secs > 5) {
    const before = { ...state.res };
    let left = secs; while (left > 0) { const d = Math.min(1, left); tick(state, d, { offline: true }); left -= d; }
    offline = { secs: Math.round(secs), gained: Object.fromEntries(RES.map(r => [r, Math.round(state.res[r] - before[r])])), events: state.events.slice(-8) };
    state.events = [];
  }
  return { state, offline, needsFaction: false };
}

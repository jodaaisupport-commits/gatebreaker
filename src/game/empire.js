// v0.3 Imperium: Bevölkerung, Zufriedenheit, Gesetze, Gouverneure, Crews, Markt, Lager, Lieferaufträge, Energie-Prioritäten, Diplomatie (Handel).
// Reine Logik, kein DOM.
import { BUILDINGS, BUILDING_ORDER, RES, ENERGY_USE, GOV_TRAITS, GOV_NAMES, MARKET_BASE, LAWS, buildingCost } from './data.js';
import { techEffects, canAfford, fleetsIn, neighbors, planetName, actions } from './sim.js';

const STORE = ['erz', 'treibstoff', 'energie', 'platten', 'teile'];
const defaultLaws = () => ({ arbeitszeit: 'normal', wehrpflicht: 'aus', kriegsrecht: 'aus', einwanderung: 'geschlossen' });
function emit(state, level, text, extra = {}) { state.events.push({ level, text, ...extra }); }

export function initPlanet(p) {
  if (p.pop == null) p.pop = p.home && p.owner === 'player' ? 14 : p.owner === 'player' ? 4 : 0;
  if (p.sat == null) p.sat = 70;
  if (p.home && p.owner === 'player' && !p.garrison) p.garrison = 100;
  if (!p.laws) p.laws = defaultLaws();
  if (p.governor === undefined) p.governor = null;
  if (p.strike == null) p.strike = false;
  if (p.revolt == null) p.revolt = 0;
  if (p.buildings) for (const k of BUILDING_ORDER) if (p.buildings[k] == null) p.buildings[k] = 0;
}
export function initEmpire(state) {
  for (const p of Object.values(state.planets)) initPlanet(p);
  for (const r of RES) if (state.res[r] == null) state.res[r] = 0;
  if (state.crews == null) state.crews = 2;
  if (!state.market) state.market = Object.fromEntries(Object.keys(MARKET_BASE).map(k => [k, 1]));
  if (!state.orders) state.orders = [];
  if (state.orderTimer == null) state.orderTimer = 10;
  if (!state.energyPrio) state.energyPrio = ['produktion', 'militaer', 'zivil'];
  if (!state.diplo) state.diplo = { relation: -40, treaty: false, log: [] };
  if (state.homeLost == null) state.homeLost = false;
  for (const f of state.fleets) if (f.vet == null) f.vet = 0;
}

export const homeHeld = state => Object.values(state.planets).some(p => p.home && p.owner === 'player');
export function housing(p) { return 8 + 12 * (p.buildings?.wohnen || 0) + (p.home ? 20 : 0); }
export function storageCap(state) {
  let lager = 0; for (const p of Object.values(state.planets)) if (p.owner === 'player' && p.buildings) lager += p.buildings.lager || 0;
  return 1500 + 2000 * lager + (homeHeld(state) ? 1000 : 0);
}
export function satTarget(state, p) {
  let t = 70; const L = p.laws; const why = [];
  const add = (v, txt) => { t += v; why.push(`${v > 0 ? '+' : ''}${v} ${txt}`); };
  if (L.arbeitszeit === 'lang') add(-25, 'lange Arbeitszeit'); if (L.arbeitszeit === 'kurz') add(10, 'kurze Arbeitszeit');
  if (L.wehrpflicht === 'an') add(-10, 'Wehrpflicht'); if (L.kriegsrecht === 'an') add(-20, 'Kriegsrecht');
  if (L.einwanderung === 'offen') add(-5, 'offene Grenzen');
  if (p.pop > housing(p)) add(-20, 'Überbevölkerung');
  if (state._eDeficit) add(-10, 'Energiemangel');
  if (p.governor?.trait === 'volk') add(10, 'Volkstribun');
  if (p.home) add(5, 'Heimatwelt');
  if (p.supplyCut) add(-15, 'Versorgung unterbrochen');
  return { t: Math.max(0, Math.min(100, t)), why };
}

// Ertrag pro Planet inkl. Energieprioritäten
export function empireRates(state) {
  const fx = techEffects(state);
  const own = Object.values(state.planets).filter(p => p.owner === 'player');
  const home = homeHeld(state);
  let eProd = home ? 2 : 0; const cons = { produktion: 0, militaer: 0, zivil: 0 };
  for (const p of own) {
    if (!p.buildings) { eProd += 0.5; continue; }
    eProd += 3.2 * (p.buildings.kraftwerk || 0);
    for (const k of BUILDING_ORDER) { const c = BUILDINGS[k].cls; if (cons[c] != null) cons[c] += (ENERGY_USE[k] || 0) * (p.buildings[k] || 0); }
  }
  const eCons = cons.produktion + cons.militaer + cons.zivil;
  const eff = { produktion: 1, militaer: 1, zivil: 1 };
  if (eProd < eCons && state.res.energie <= 0.5) {
    let left = eProd;
    for (const c of state.energyPrio) { const need = cons[c]; eff[c] = need ? Math.max(0.2, Math.min(1, left / need)) : 1; left = Math.max(0, left - need); }
  }
  state._eDeficit = eProd < eCons && state.res.energie <= 0.5;
  const out = { erz: 0, treibstoff: 0, energie: eProd - eCons, credits: 1.2 + (home ? 1 : 0), platten: 0, teile: 0 };
  for (const p of own) {
    if (!p.buildings) { out.erz += 1; out.treibstoff += 0.4; out.credits += 0.8; continue; }
    const b = p.buildings; const L = p.laws || defaultLaws();
    const work = 2 * ((b.mine || 0) + (b.raffinerie || 0) + (b.walzwerk || 0) + (b.fabrik || 0)) || 1;
    const popF = 0.5 + 0.5 * Math.min(1, (p.pop || 0) / work);
    const lawF = L.arbeitszeit === 'lang' ? 1.25 : L.arbeitszeit === 'kurz' ? 0.85 : 1;
    const pm = (p.strike ? 0 : 1) * popF * lawF * eff.produktion * (p.supplyCut ? 0.5 : 1);
    out.erz += 2.2 * (b.mine || 0) * fx.mineMult * pm;
    out.treibstoff += 1.1 * (b.raffinerie || 0) * fx.fuelMult * pm;
    const walz = state.res.erz > 2 ? (b.walzwerk || 0) * pm : 0;
    out.erz -= walz; out.platten += 0.5 * walz;
    const fab = state.res.platten > 1 ? (b.fabrik || 0) * pm : 0;
    out.platten -= 0.5 * fab; out.teile += 0.25 * fab;
    const blds = BUILDING_ORDER.reduce((a, k) => a + (b[k] || 0), 0);
    out.credits += (0.25 * blds * (p.strike ? 0 : 1) + 0.05 * (p.pop || 0)) * fx.creditMult * (L.kriegsrecht === 'an' ? 0.8 : 1);
  }
  if (state.diplo?.treaty) out.credits += 1.5;
  let upkeep = 0; const UP = { jaeger: 0.01, bomber: 0.02, fregatte: 0.05, zerstoerer: 0.1, kolonie: 0.08, reparatur: 0.06, traeger: 0.12, flaggschiff: 0.3 };
  for (const f of state.fleets) if (f.owner === 'player') for (const t in f.ships) upkeep += (f.ships[t] || 0) * (UP[t] || 0);
  out.credits -= upkeep;
  return { ...out, eff: Math.min(eff.produktion, eff.militaer, eff.zivil), effByClass: eff, upkeep, eProd, eCons, cons, fx };
}

// Ressourcen mit Lagergrenze anwenden
export function applyRates(state, r, dt) {
  const cap = storageCap(state);
  for (const k of RES) {
    const prev = state.res[k] || 0; let v = Math.max(0, prev + r[k] * dt);
    if (STORE.includes(k) && v > cap && r[k] > 0) v = Math.min(v, Math.max(prev, cap));
    state.res[k] = v;
  }
}
export function plunderShare(state) {
  const cap = storageCap(state); const fill = ['erz', 'treibstoff', 'platten', 'teile'].reduce((a, k) => a + Math.min(1, (state.res[k] || 0) / cap), 0) / 4;
  return 0.05 + 0.2 * fill;
}

export function empireTick(state, dt, opts = {}) {
  // Bevölkerung & Zufriedenheit
  for (const p of Object.values(state.planets)) {
    if (p.owner !== 'player') continue;
    initPlanet(p);
    const cap = housing(p); const grow = p.laws.einwanderung === 'offen' ? 2 : 1;
    p.pop = Math.max(1, p.pop + (0.01 * p.pop * (1 - p.pop / cap) * grow + (p.pop < cap ? 0.01 : -0.02)) * dt);
    const { t } = satTarget(state, p);
    p.sat += Math.sign(t - p.sat) * Math.min(Math.abs(t - p.sat), 0.5 * dt);
    if (!p.strike && p.sat < 30) { p.strike = true; emit(state, 'warn', `Streik auf ${planetName(p.id)}! Produktion steht (Zufriedenheit ${Math.round(p.sat)}%).`); }
    if (p.strike && p.sat > 40) { p.strike = false; emit(state, 'info', `Streik auf ${planetName(p.id)} beendet.`); }
    if (p.sat < 12 && p.laws.kriegsrecht !== 'an' && !p.home) {
      p.revolt += dt;
      if (p.revolt > 45) {
        emit(state, 'alert', `Revolte! ${planetName(p.id)} hat sich losgesagt.`);
        p.owner = null; p.buildings = null; p.queue = []; p.shipQueue = []; p.colonized = false; p.surveyed = true; p.governor = null; p.revolt = 0; p.pop = 0;
      }
    } else p.revolt = Math.max(0, p.revolt - dt);
    if (p.laws.wehrpflicht === 'an') { p.garrison = Math.min(200, (p.garrison || 0) + 0.2 * dt); state.crews += 0.01 * dt; }
    // Akademie
    if (p.buildings?.akademie) state.crews += 0.02 * p.buildings.akademie * dt;
    // Sensorstation: Nachbarsysteme aufdecken
    if (p.buildings?.sensor) for (const n of neighbors(p.system)) if (!state.explored[n]) { state.explored[n] = true; emit(state, 'info', `Sensorstation ${planetName(p.id)}: Nachbarsystem aufgedeckt.`); }
    // Gouverneur (läuft auch offline)
    if (p.governor && p.buildings) {
      p.governor.timer = (p.governor.timer ?? 20) - dt;
      if (p.governor.timer <= 0) { p.governor.timer = 30; governorAct(state, p); }
    }
  }
  // Markt: Preise kehren zur Mitte zurück, KI-Nachfrage schwankt
  for (const k in state.market) {
    const f = state.market[k]; const noise = (Math.random() - 0.5) * 0.004 * dt;
    state.market[k] = Math.min(3, Math.max(0.4, f + (1 - f) * 0.003 * dt + noise));
  }
  // Lieferaufträge
  state.orderTimer -= dt;
  if (state.orderTimer <= 0) { state.orderTimer = 10; runOrders(state); }
  // Diplomatie: Beziehung driftet
  const d = state.diplo;
  if (d.treaty) d.relation = Math.min(60, d.relation + 0.01 * dt);
  if (d.treaty && state.ai) state.ai.budget += 0.4 * dt;
}

function governorAct(state, p) {
  const g = p.governor; const tr = GOV_TRAITS[g.trait];
  if (g.trait === 'volk' && p.sat < 45) { p.laws.arbeitszeit = 'kurz'; p.laws.kriegsrecht = 'aus'; }
  if (g.trait === 'militaer') p.laws.wehrpflicht = 'an';
  if (g.trait === 'industrie' && p.sat > 60) p.laws.arbeitszeit = 'lang';
  if (g.trait === 'industrie' && p.sat < 40) p.laws.arbeitszeit = 'normal';
  if (p.queue.length) return;
  for (const k of tr.prefer) {
    const lvl = p.buildings[k] || 0; if (lvl >= 6) continue;
    const c = buildingCost(k, lvl);
    if (Object.entries(c).every(([r, v]) => (state.res[r] || 0) * 0.5 >= v)) {
      if (!actions.build(state, p.id, k)) { emit(state, 'info', `Gouverneur ${g.name} (${planetName(p.id)}): baut ${BUILDINGS[k].name} Stufe ${lvl + 1}.`, { quiet: true }); g.log = [`${BUILDINGS[k].name} → ${lvl + 1}`, ...(g.log || [])].slice(0, 4); }
      return;
    }
  }
}

export function marketPrice(state, k, mode) { const p = MARKET_BASE[k] * state.market[k]; return mode === 'sell' ? p * 0.8 : p; }
function trade(state, k, mode, amount) {
  if (!MARKET_BASE[k]) return 'Unbekannte Ware.';
  const total = Math.round(marketPrice(state, k, mode) * amount);
  if (mode === 'buy') { if (state.res.credits < total) return 'Zu wenig Credits.'; state.res.credits -= total; state.res[k] += amount; state.market[k] = Math.min(3, state.market[k] * (1 + 0.0006 * amount)); }
  else { if ((state.res[k] || 0) < amount) return 'Nicht genug Ware.'; state.res[k] -= amount; state.res.credits += total; state.market[k] = Math.max(0.4, state.market[k] * (1 - 0.0006 * amount)); }
  return null;
}
function runOrders(state) {
  for (const o of state.orders) {
    const have = state.res[o.res] || 0;
    if (o.mode === 'sell' && have > o.threshold) { const n = Math.min(o.amount, Math.floor(have - o.threshold)); if (n > 0 && !trade(state, o.res, 'sell', n)) o.runs = (o.runs || 0) + 1; }
    if (o.mode === 'buy' && have < o.threshold) { if (!trade(state, o.res, 'buy', o.amount)) o.runs = (o.runs || 0) + 1; }
  }
}

export const empireActions = {
  setLaw(state, planetId, law, val) { const p = state.planets[planetId]; if (!p || p.owner !== 'player') return 'Kein eigener Planet.'; if (!LAWS[law]?.opts[val]) return 'Ungültig.'; p.laws[law] = val; return null; },
  hireGovernor(state, planetId, trait) {
    const p = state.planets[planetId]; if (!p || p.owner !== 'player' || !p.buildings) return 'Kein verwalteter Planet.';
    if (!GOV_TRAITS[trait]) return 'Unbekannter Typ.'; if (state.res.credits < 100) return '100 Credits nötig.';
    state.res.credits -= 100; p.governor = { name: GOV_NAMES[(Math.random() * GOV_NAMES.length) | 0], trait, timer: 5, log: [] }; return null;
  },
  fireGovernor(state, planetId) { const p = state.planets[planetId]; if (p) p.governor = null; return null; },
  assignCrew(state, fleetId) {
    const f = state.fleets.find(x => x.id === fleetId && x.owner === 'player'); if (!f) return 'Flotte nicht gefunden.';
    if (state.crews < 1) return 'Keine Crew verfügbar – baue eine Raumakademie.'; if ((f.vet || 0) >= 5) return 'Maximale Veteranenstufe.';
    state.crews -= 1; f.vet = (f.vet || 0) + 1; return null;
  },
  trade(state, k, mode, amount) { return trade(state, k, mode, amount); },
  addOrder(state, res, mode, threshold, amount) {
    if (!MARKET_BASE[res]) return 'Ware unbekannt.'; if (state.orders.length >= 6) return 'Max. 6 Aufträge.';
    state.orders.push({ id: Date.now() % 1e9 + Math.random(), res, mode: mode === 'buy' ? 'buy' : 'sell', threshold: Math.max(0, +threshold || 0), amount: Math.max(1, +amount || 50), runs: 0 }); return null;
  },
  removeOrder(state, id) { state.orders = state.orders.filter(o => String(o.id) !== String(id)); return null; },
  energyPrioUp(state, cls) { const a = state.energyPrio; const i = a.indexOf(cls); if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; return null; },
  proposeTreaty(state) {
    const d = state.diplo; if (d.treaty) return 'Vertrag besteht bereits.';
    if (state.diplo.war) return 'Im offenen Krieg unmöglich – erst Frieden schließen.';
    if (state.res.credits < 150) return '150 Credits für Gesandte nötig.';
    state.res.credits -= 150;
    const chance = Math.max(0.05, Math.min(0.9, 0.35 + (d.relation + 40) / 120 + ({ aggressiv: -0.2, haendler: 0.2, vorsichtig: 0.1 }[state.ai?.personality] || 0)));
    if (Math.random() < chance) { d.treaty = true; d.relation += 15; relationLog(state, +15, 'Handelsvertrag geschlossen'); emit(state, 'info', 'Handelsvertrag mit Draxis geschlossen: +1,5 Credits/s.'); }
    else { d.relation -= 3; relationLog(state, -3, 'Vertragsangebot abgelehnt'); emit(state, 'warn', `Draxis lehnt ab (Chance war ${Math.round(chance * 100)}%).`); }
    return null;
  },
};
export function relationLog(state, v, why) { const d = state.diplo; d.log = [{ v, why, t: Math.round(state.time) }, ...(d.log || [])].slice(0, 8); }
export function breakTreaty(state, why) {
  const d = state.diplo; if (!d) return;
  if (d.treaty) { d.treaty = false; emit(state, 'alert', `Handelsvertrag mit Draxis gebrochen: ${why}.`); }
  if (d.peaceUntil > state.time) { d.peaceUntil = 0; emit(state, 'alert', `Waffenruhe gebrochen: ${why}.`); }
  d.relation = Math.max(-100, d.relation - 20); relationLog(state, -20, why);
}

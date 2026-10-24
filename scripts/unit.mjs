// Logik-Tests ohne Browser (Node). Läuft vor dem E2E-Test.
import * as S from '../src/game/sim.js';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) fails++; };
const run = (st, n) => { for (let i = 0; i < n; i++) S.tick(st, 1); };
const rich = st => Object.assign(st.res, { erz: 9000, treibstoff: 5000, credits: 9000, energie: 500, platten: 500, teile: 200 });

// v0.2
{ const st = S.newGame(0, 'wissenschaft'); rich(st);
  ok(st.tech.done.includes('sci_sensoren'), 'Fraktion-Starttech');
  ok(!S.actions.research(st, 'mil_panzer'), 'Forschung startet'); run(st, 40);
  ok(S.actions.research(st, 'mil_schilde')?.includes('Exklusiv'), 'Exklusiver Fork');
  S.actions.build(st, 'helios-prime', 'werft'); run(st, 20);
  S.actions.buildShip(st, 'kolonie', 1, 'helios-prime'); run(st, 50);
  ok(!S.actions.survey(st, 'helios-b') && !S.actions.colonize(st, 'helios-b'), 'Kolonisierung');
  ok(st.tutorial.claimed.includes('kolonie'), 'Tutorial-Belohnung'); }
// v0.3
{ const st = S.newGame(0, 'bergbau'); rich(st); const hp = st.planets['helios-prime'];
  ok(hp.pop > 0 && hp.laws && st.market && st.diplo, 'Imperium initialisiert');
  ok(!S.actions.hireGovernor(st, 'helios-prime', 'industrie'), 'Gouverneur eingestellt'); run(st, 60);
  ok(hp.governor.log.length > 0, 'Gouverneur baut selbstständig');
  S.actions.fireGovernor(st, 'helios-prime');
  S.actions.setLaw(st, 'helios-prime', 'arbeitszeit', 'lang'); S.actions.setLaw(st, 'helios-prime', 'kriegsrecht', 'an'); S.actions.setLaw(st, 'helios-prime', 'wehrpflicht', 'an');
  run(st, 120); ok(hp.sat < 40, `Gesetze senken Zufriedenheit (${Math.round(hp.sat)})`);
  hp.sat = 10; run(st, 2); ok(hp.strike, 'Streik bei niedriger Zufriedenheit');
  const col = st.planets['helios-b']; col.owner = 'player'; col.buildings = S.emptyBuildings(); col.laws = null; S.tick(st, 0.1); col.sat = 5; Object.assign(col.laws, { arbeitszeit: 'lang', wehrpflicht: 'an', einwanderung: 'offen' }); col.pop = 100;
  run(st, 60); ok(col.owner === null, 'Revolte: Kolonie sagt sich los');
  const p0 = st.market.erz; S.actions.trade(st, 'erz', 'sell', 1000); ok(st.market.erz < p0, 'Markt: Verkauf senkt Preis');
  Object.assign(hp.laws, { arbeitszeit: 'normal', kriegsrecht: 'aus', wehrpflicht: 'aus' }); hp.sat = 90; hp.strike = false;
  S.actions.build(st, 'helios-prime', 'walzwerk'); S.actions.build(st, 'helios-prime', 'fabrik'); rich(st); run(st, 120);
  ok(st.res.teile > 200, 'Produktionskette erzeugt Schiffsteile');
  st.res.erz = 99999; S.tick(st, 1); const cap = 1500 + 1000; ok(st.res.erz >= 99999 - 1, 'Lager: kein Verlust, nur kein Wachstum'); st.res.erz = cap; run(st, 5); ok(st.res.erz <= cap + 1, 'Lagergrenze greift');
  S.actions.addOrder(st, 'erz', 'sell', 100, 50); run(st, 11); ok(st.orders[0].runs >= 1, 'Lieferauftrag ausgeführt');
  S.actions.energyPrioUp(st, 'zivil'); ok(st.energyPrio[1] === 'zivil', 'Energie-Priorität verschoben');
  st.planets['helios-prime'].queue = []; rich(st); S.actions.build(st, 'helios-prime', 'sensor'); run(st, 30); ok(st.explored.kepler && st.explored.vortex, 'Sensorstation lichtet Nebel');
  st.crews = 3; ok(!S.actions.assignCrew(st, 1) && st.fleets[0].vet === 1, 'Crew zugewiesen'); }
{ const st = S.newGame(0, 'bergbau'); const r1 = S.rates(st).credits; st.planets['helios-prime'].owner = 'ai'; const r2 = S.rates(st);
  ok(r2.credits < r1 && S.rates(st).eProd < 3, 'Heimatwelt-Boni gehen verloren'); }

if (globalThis.__extraTests) await globalThis.__extraTests(S, ok, run, rich);
const extra = await import('./unit-extra.mjs').catch(e => { console.log('  ✘ unit-extra:', e.message); fails++; return null; }); if (extra?.default) await extra.default(S, ok, run, rich);
console.log(fails ? `UNIT FEHLER (${fails})` : 'UNIT OK'); process.exit(fails ? 1 : 0);

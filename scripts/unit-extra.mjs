// v0.4 Batch-B-Logiktests
import { createBattle, stepBattle, autoResolve } from '../src/game/battleSim.js';
export default async (S, ok, run, rich) => {
  const W = await import('../src/game/warfare.js');
  // Träger + Drohnen, Flaggschiff-Superwaffe, Moduldamage, Moral-Events
  { const b = createBattle({ system: 'helios', attacker: 'player', sides: { player: { ships: { traeger: 2, flaggschiff: 1 } }, ai: { ships: { fregatte: 10, zerstoerer: 4 } } }, seed: 7 });
    let drones = 0; for (let i = 0; i < 400 && !b.over; i++) { stepBattle(b, 0.25); drones = Math.max(drones, b.units.filter(u => u.drone && u.alive).length); }
    ok(drones > 0, `Träger starten Drohnen (${drones})`);
    ok(b.blasts.length > 0, 'Flaggschiff feuert Superwaffe');
    ok(b.units.some(u => u.mods && (u.mods.w < 1 || u.mods.s < 1 || u.mods.a < 1)), 'Module werden beschädigt');
    ok(!Object.keys(b.lost.player).includes('drohne') && !Object.keys(b.lost.ai).includes('drohne'), 'Drohnen nicht als Verluste gezählt');
    ok(b.log.length > 0, `Gefechts-Log/Moral-Ereignisse (${b.log[0]})`); }
  { const st = S.newGame(0, 'militar'); rich(st); st.planets['helios-prime'].buildings.werft = 1;
    ok(!S.actions.buildShip(st, 'flaggschiff', 1), 'Flaggschiff baubar');
    ok(!!S.actions.buildShip(st, 'flaggschiff', 1), 'nur ein Flaggschiff');
    ok(!!S.actions.buildShip(st, 'drohne', 1), 'Drohnen nicht direkt baubar'); }
  // Spione
  { const st = S.newGame(0, 'handel'); rich(st);
    ok(!S.actions.hireSpy(st, 'aufklaerung'), 'Agent angeworben'); const a = st.spies[0]; a.lvl = 5;
    let real = false; for (let k = 0; k < 6 && !real; k++) { if (!st.spies.length) { S.actions.hireSpy(st, 'aufklaerung'); st.spies[0].lvl = 5; } S.actions.spyMission(st, st.spies[0].id); run(st, 31); real = W.intelActive(st); }
    ok(real, 'Aufklärung zeigt echte Stärke');
    const f = st.fleets.find(x => x.owner === 'ai'); st.intel.until = 0;
    ok(/geschätzt/.test(W.fleetStrengthText(st, f, null)), 'ohne Aufklärung nur Schätzung'); }
  // Ruinen & Story
  { const st = S.newGame(0, 'bergbau'); rich(st);
    ok(!!S.actions.expedition(st, 'helios-b'), 'keine Ruine auf Cinder');
    ok(!S.actions.expedition(st, 'helios-c'), 'Expedition Hydra gestartet'); run(st, 32);
    ok(st.story.fragments === 1 && st.ruinsDone['helios-c'], 'Fragment geborgen');
    st.explored.vortex = true; run(st, 1); ok(st.story.step >= 2, `Story fortgeschritten (Schritt ${st.story.step})`);
    st.story.fragments = 3; run(st, 1); ok(st.story.step === 3, 'Story: Torherz freigeschaltet');
    const hf = st.fleets.find(f => f.owner === 'player'); hf.system = 'vortex'; st.fleets = st.fleets.filter(f => !(f.owner === 'ai' && f.system === 'vortex')); st.planets['vortex-a'].defense = 0;
    ok(!S.actions.activateGateHeart(st), 'Torherz aktiviert'); ok(S.techEffects(st).travelMult < 1, 'Codex-Bonus aktiv'); }
  // Belagerung + Bodentruppen
  { const st = S.newGame(0, 'militar'); rich(st);
    const hf = st.fleets.find(f => f.owner === 'player'); hf.system = 'vortex'; st.fleets = st.fleets.filter(f => !(f.owner === 'ai' && f.system === 'vortex')); st.planets['vortex-a'].defense = 0;
    run(st, 61); ok(st.planets['vortex-a'].siege >= 99, 'Belagerung 100%');
    const before = W.troopStrength(st, [hf], st.planets['vortex-a']);
    ok(!S.actions.recruitTroops(st, 'panzer', 5), 'Panzer rekrutiert');
    ok(W.troopStrength(st, [hf], st.planets['vortex-a']) > before, 'Armee erhöht Landungsstärke'); }
  // Frieden / Allianz
  { const st = S.newGame(0, 'handel'); rich(st);
    st.diplo.relation = 100; for (let i = 0; i < 10 && !W.peace(st); i++) { st.diplo.talkCd = 0; S.actions.peaceTalks(st, 'zahlen'); }
    ok(W.peace(st), 'Waffenruhe geschlossen');
    const t0 = st.ai.waves; st.ai.attackTimer = 0; run(st, 5); ok(!st.fleets.some(f => f.role === 'attack' && f.move), 'keine Angriffe in Waffenruhe');
    ok(W.relationFactors(st).length >= 2, 'Beziehung: Warum-Faktoren');
    S.actions.giftAlly(st); S.actions.giftAlly(st); S.actions.giftAlly(st);
    for (let i = 0; i < 6 && !st.allies.vael.allied; i++) { st.allies.vael.relation = 60; S.actions.proposeAlliance(st); }
    ok(st.allies.vael.allied, 'Allianz mit Vael'); }
  // Abfangen auf Route
  { const st = S.newGame(0, 'militar');
    const hf = st.fleets.find(f => f.owner === 'player'); hf.intercept = true; hf.move = { from: 'helios', to: 'vortex', t: 6, total: 12, path: [] };
    const a = { id: 99, owner: 'ai', name: 'Test', ships: { jaeger: 2 }, system: 'vortex', move: { from: 'vortex', to: 'helios', t: 7, total: 12, path: [] }, cooldown: 0, role: 'attack' }; st.fleets.push(a);
    S.tick(st, 0.05, { offline: true }); ok(!hf.move && st.lastReport, 'Abfangen löst Gefecht auf Route aus'); }
  // Torpatrouille
  { const st = S.newGame(0, 'militar'); rich(st);
    const hf = st.fleets.find(f => f.owner === 'player'); hf.system = 'kepler'; S.actions.togglePatrol(st, hf.id);
    const a = { id: 98, owner: 'ai', name: 'Durchreise', ships: { jaeger: 1 }, system: 'kepler', move: { from: 'kepler', to: 'helios', t: 0, total: 12, path: [] }, cooldown: 5, role: 'attack' }; st.fleets.push(a);
    S.tick(st, 0.05, { offline: true }); ok(st.lastReport?.system === 'kepler', 'Patrouille stellt Flotte am Tor'); }
  // Rettungskapseln + Wracks
  { const st = S.newGame(0, 'militar'); const r = st.lastReport;
    const hf = st.fleets.find(f => f.owner === 'player'); hf.ships = { jaeger: 20, bomber: 10, fregatte: 10, zerstoerer: 4 }; hf.move = { from: 'helios', to: 'vortex', t: 11.99, total: 12, path: [] };
    for (let i = 0; i < 5; i++) S.tick(st, 0.05, { offline: true });
    ok(st.lastReport?.pods && st.lastReport.winner === 'player', 'Bericht mit Rettungskapseln');
    ok(st.wrecks > 0, `Wrackdaten gesammelt (${st.wrecks})`); st.wrecks = 100; st.res.credits = 500;
    ok(!S.actions.researchWrecks(st) && st.wreckLvl === 1, 'Wrackforschung Stufe 1'); }
  // Gefechts-Warteschlange
  { const st = S.newGame(0, 'militar');
    const hf = st.fleets.find(f => f.owner === 'player'); hf.ships = { jaeger: 20, fregatte: 10 };
    const f2 = { id: 77, owner: 'player', name: 'Zweite', ships: { jaeger: 10 }, system: 'kepler', move: null, cooldown: 0 }; st.fleets.push(f2);
    st.fleets.push({ id: 78, owner: 'ai', name: 'K', ships: { jaeger: 2 }, system: 'kepler', move: null, cooldown: 0, role: 'guard' });
    hf.system = 'vortex'; S.tick(st, 0.05);
    ok(st.battle && st.battleQueue.length === 1, 'zweites Gefecht in Warteschlange');
    ok(!S.actions.resolveQueued(st, 0) && !st.battleQueue.length, 'Warteschlange automatisch aufgelöst'); }
  // Versorgungslinien
  { const st = S.newGame(0, 'militar'); const p = st.planets['kepler-a']; p.owner = 'player'; p.buildings = S.emptyBuildings(); p.buildings.mine = 2; p.laws = null; p.pop = 4;
    st.fleets.push({ id: 79, owner: 'ai', name: 'Blockade', ships: { jaeger: 1 }, system: 'kepler', move: null, cooldown: 0, role: 'raid', raidLeft: 999 });
    st.diplo.peaceUntil = 1e9; S.tick(st, 0.1); ok(p.supplyCut && p.owner === 'player', 'Versorgungslinie gekappt (Plünderer erobern nicht)'); }
  ok(!!W.personality(S.newGame(0)), 'KI-Persönlichkeit gesetzt');
  // v0.5 Batch C
  { const st = S.newGame(0, 'militar'); rich(st); const hp = Object.values(st.planets).find(p => p.owner === 'player' && p.home);
    const erz = st.res.erz; ok(!S.actions.build(st, hp.id, 'mine') && st.res.erz < erz, 'Bauauftrag kostet');
    ok(!S.actions.undoOrder(st, hp.id, 'build') && Math.abs(st.res.erz - erz) < 1e-6 && !hp.queue.length, 'Rückgängig erstattet voll');
    ok(!!S.actions.undoOrder(st, hp.id, 'build'), 'leere Liste: Fehler'); }
  { const Se = await import('../src/ui/settings.js'); const mem = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
    ok(Se.loadSettings(mem).particles === true && Se.loadSettings(mem).scale === 1, 'Einstellungen: Standardwerte');
    Se.saveSettings({ ...Se.DEFAULTS, colorblind: true, shake: false }, mem); const l = Se.loadSettings(mem); ok(l.colorblind && !l.shake, 'Einstellungen persistieren');
    ok(Se.clampScale(3) === 1.4 && Se.clampScale(0.1) === 0.8 && Se.clampScale('x') === 1, 'UI-Skalierung begrenzt'); }
};

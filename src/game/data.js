// Statische Spieldaten (Definitionen). Reine Daten, kein DOM/Three – serverfähig.
export const RES = ['erz', 'treibstoff', 'energie', 'credits'];
export const RES_LABEL = { erz: 'Erz', treibstoff: 'Treibstoff', energie: 'Energie', credits: 'Credits' };

export const BUILDINGS = {
  mine:       { name: 'Erzmine',            desc: 'Fördert Erz.',                       base: { erz: 60,  treibstoff: 0,  credits: 30 },  time: 8 },
  raffinerie: { name: 'Treibstoffraffinerie', desc: 'Raffiniert Treibstoff.',           base: { erz: 80,  treibstoff: 0,  credits: 40 },  time: 10 },
  kraftwerk:  { name: 'Kraftwerk',          desc: 'Erzeugt Energie für alle Gebäude.',  base: { erz: 70,  treibstoff: 20, credits: 30 },  time: 9 },
  werft:      { name: 'Raumwerft',          desc: 'Baut Schiffe. Höhere Stufe = schneller.', base: { erz: 150, treibstoff: 50, credits: 80 }, time: 15 },
  abwehr:     { name: 'Abwehrplattform',    desc: 'Verteidigt den Planeten automatisch.', base: { erz: 120, treibstoff: 30, credits: 60 }, time: 14 },
};
export const BUILDING_ORDER = ['mine', 'raffinerie', 'kraftwerk', 'werft', 'abwehr'];

export function buildingCost(key, level) {
  const b = BUILDINGS[key]; const f = Math.pow(1.6, level);
  const c = {}; for (const r in b.base) c[r] = Math.round(b.base[r] * f);
  return c;
}
export function buildingTime(key, level) { return Math.min(60, Math.round(BUILDINGS[key].time * Math.pow(1.35, level))); }

// Schiffe: Stein-Schere-Papier – Jäger > Bomber > Großkampfschiffe, Fregatte (Flak) > Jäger, Zerstörer > Fregatte
export const SHIPS = {
  jaeger:    { name: 'Jäger',     cost: { erz: 30,  treibstoff: 10, credits: 10 }, time: 5,  hull: 45,  shield: 15,  dmg: 5,  rate: 0.5, range: 38, speed: 34, size: 1.0, weapon: 'laser',   color: 0x66ccff },
  bomber:    { name: 'Bomber',    cost: { erz: 55,  treibstoff: 25, credits: 20 }, time: 8,  hull: 70,  shield: 20,  dmg: 22, rate: 2.2, range: 46, speed: 24, size: 1.3, weapon: 'torpedo', color: 0x88ffaa },
  fregatte:  { name: 'Fregatte',  cost: { erz: 120, treibstoff: 40, credits: 45 }, time: 14, hull: 240, shield: 90,  dmg: 11, rate: 0.9, range: 50, speed: 16, size: 2.2, weapon: 'kinetik', color: 0xffcc66 },
  zerstoerer:{ name: 'Zerstörer', cost: { erz: 260, treibstoff: 90, credits: 95 }, time: 24, hull: 560, shield: 200, dmg: 34, rate: 1.7, range: 60, speed: 12, size: 3.2, weapon: 'kinetik', color: 0xff8866 },
  plattform: { name: 'Abwehrplattform', cost: { erz: 120, treibstoff: 30, credits: 60 }, time: 0, hull: 600, shield: 250, dmg: 20, rate: 1.2, range: 70, speed: 0, size: 3.5, weapon: 'laser', color: 0xaaaaff, static: true },
};
export const SHIP_ORDER = ['jaeger', 'bomber', 'fregatte', 'zerstoerer'];

// Schadensmultiplikator [Angreifer][Ziel]
export const DMG_MULT = {
  jaeger:     { jaeger: 1.0, bomber: 2.0, fregatte: 0.5, zerstoerer: 0.4, plattform: 0.4 },
  bomber:     { jaeger: 0.3, bomber: 0.6, fregatte: 1.8, zerstoerer: 2.0, plattform: 2.0 },
  fregatte:   { jaeger: 2.0, bomber: 1.6, fregatte: 1.0, zerstoerer: 0.6, plattform: 0.7 },
  zerstoerer: { jaeger: 0.4, bomber: 0.6, fregatte: 2.0, zerstoerer: 1.2, plattform: 1.3 },
  plattform:  { jaeger: 1.0, bomber: 1.2, fregatte: 1.2, zerstoerer: 1.2, plattform: 1.0 },
};
// Trefferchance-Basis gegen Zieltyp (kleine Ziele sind schwer zu treffen)
export const EVADE = { jaeger: 0.45, bomber: 0.3, fregatte: 0.1, zerstoerer: 0.05, plattform: 0 };

export const SYSTEMS = [
  { id: 'helios', name: 'Helios',  pos: [-60, 0, 30],  star: 0xffdd88, planets: [
    { id: 'helios-prime', name: 'Helios Prime', type: 'Ozeanwelt', orbit: 18, size: 2.4, color: 0x3a7bd5, owner: 'player', home: true },
    { id: 'helios-b', name: 'Cinder', type: 'Vulkanwelt', orbit: 30, size: 1.6, color: 0xc0462b, owner: null },
    { id: 'helios-c', name: 'Hydra', type: 'Gasriese', orbit: 44, size: 4.0, color: 0xd9a86c, owner: null } ] },
  { id: 'kepler', name: 'Kepler', pos: [10, 8, -45], star: 0xaaccff, planets: [
    { id: 'kepler-a', name: 'Frostheim', type: 'Eiswelt', orbit: 16, size: 1.8, color: 0xcfe8ff, owner: null },
    { id: 'kepler-b', name: 'Dünenfeld', type: 'Wüstenwelt', orbit: 28, size: 2.0, color: 0xd8b26a, owner: null } ] },
  { id: 'vortex', name: 'Vortex', pos: [15, -6, 55], star: 0xff7755, planets: [
    { id: 'vortex-a', name: 'Relikt', type: 'Tote Welt (Ruinen)', orbit: 20, size: 1.7, color: 0x7d7d7d, owner: 'ai', garrison: 60, defense: 1 },
    { id: 'vortex-b', name: 'Smaragd', type: 'Dschungelwelt', orbit: 34, size: 2.2, color: 0x2f9e44, owner: null } ] },
  { id: 'draxis', name: 'Draxis', pos: [75, 2, 5], star: 0xff4466, planets: [
    { id: 'draxis-prime', name: 'Draxis Prime', type: 'Vulkanwelt', orbit: 20, size: 2.6, color: 0x8b1e2f, owner: 'ai', home: true, garrison: 160, defense: 3 },
    { id: 'draxis-b', name: 'Asche', type: 'Mond / Asteroiden', orbit: 36, size: 1.2, color: 0x9a8a7a, owner: null } ] },
];
export const GATES = [['helios', 'kepler'], ['helios', 'vortex'], ['kepler', 'draxis'], ['vortex', 'draxis']];

export const TRAVEL_TIME = 12;    // Sekunden bis zum Tor + Sprung
export const GATE_COOLDOWN = 10;  // Sekunden Torabkühlung pro Flotte
export const OFFLINE_CAP = 8 * 3600;

// ---------- Fraktionen ----------
export const FACTIONS = {
  bergbau: {
    name: 'Bergbaukonzern',
    desc: 'Rohstoffgiganten. Starke Wirtschaft, schwache Flotte.',
    bonus: 'Minen +40% Erz, Start: +200 Erz',
    malus: 'Schiffsschaden −15%',
    startRes: { erz: 200, treibstoff: 0, energie: 0, credits: 50 },
    startShips: { jaeger: 2, bomber: 0, fregatte: 1, zerstoerer: 0 },
    mineMult: 1.4, dmgMult: 0.85, researchMult: 1.0, creditMult: 1.0, moraleBonus: 0, salvageMult: 1.0,
  },
  militar: {
    name: 'Militärjunta',
    desc: 'Krieg ist Politik. Starke Schiffe, teure Wirtschaft.',
    bonus: 'Schiffsschaden +20%, Start: mehr Schiffe',
    malus: 'Minen −20%, Credits −10%',
    startRes: { erz: 50, treibstoff: 40, energie: 0, credits: 0 },
    startShips: { jaeger: 6, bomber: 2, fregatte: 2, zerstoerer: 0 },
    mineMult: 0.8, dmgMult: 1.2, researchMult: 0.9, creditMult: 0.9, moraleBonus: 0.05, salvageMult: 1.0,
  },
  wissenschaft: {
    name: 'Wissenschaftskolonie',
    desc: 'Wissen vor Stahl. Schnelle Forschung, dünne Startflotte.',
    bonus: 'Forschung +50%, Start: 1 Sensor-Tech',
    malus: 'Weniger Startschiffe',
    startRes: { erz: 80, treibstoff: 40, energie: 40, credits: 100 },
    startShips: { jaeger: 2, bomber: 0, fregatte: 0, zerstoerer: 0 },
    mineMult: 1.0, dmgMult: 1.0, researchMult: 1.5, creditMult: 1.0, moraleBonus: 0, salvageMult: 1.0,
    startTech: ['sci_sensoren'],
  },
  handel: {
    name: 'Handelskartell',
    desc: 'Credits regieren. Reich und wendig, weiche Schiffe.',
    bonus: 'Credits +35%, Bergung +25%',
    malus: 'Schiffshülle −10%',
    startRes: { erz: 100, treibstoff: 80, energie: 0, credits: 400 },
    startShips: { jaeger: 3, bomber: 0, fregatte: 1, zerstoerer: 0 },
    mineMult: 1.0, dmgMult: 1.0, researchMult: 1.0, creditMult: 1.35, moraleBonus: 0, salvageMult: 1.25, hullMult: 0.9,
  },
  religion: {
    name: 'Religiöse Siedler',
    desc: 'Glauben hält die Flotte zusammen. Hohe Moral, langsame Forschung.',
    bonus: 'Moral +15%, Kolonien starten mit Mine',
    malus: 'Forschung −25%',
    startRes: { erz: 120, treibstoff: 60, energie: 20, credits: 80 },
    startShips: { jaeger: 4, bomber: 1, fregatte: 1, zerstoerer: 0 },
    mineMult: 1.0, dmgMult: 1.0, researchMult: 0.75, creditMult: 1.0, moraleBonus: 0.15, salvageMult: 1.0,
    colonyBonusMine: true,
  },
};
export const FACTION_ORDER = ['bergbau', 'militar', 'wissenschaft', 'handel', 'religion'];

// ---------- Tutorial-Aufgaben ----------
export const TUTORIAL = [
  { id: 'mine',     title: 'Erste Mine ausbauen',   hint: 'Helios Prime → Erzmine Ausbau', check: s => Object.values(s.planets).some(p => p.owner === 'player' && p.buildings && (p.buildings.mine || 0) >= 2), reward: { credits: 40, erz: 30 } },
  { id: 'werft',    title: 'Raumwerft errichten',    hint: 'Baue eine Raumwerft auf Helios Prime', check: s => Object.values(s.planets).some(p => p.owner === 'player' && p.buildings?.werft > 0), reward: { credits: 60, erz: 50 } },
  { id: 'jaeger',   title: 'Ersten Jäger bauen',     hint: 'Raumwerft → Jäger +1', check: s => s.fleets.filter(f => f.owner === 'player').reduce((a, f) => a + (f.ships.jaeger || 0), 0) >= 5, reward: { credits: 30, treibstoff: 20 } },
  { id: 'system',   title: 'Fremdes System besuchen',hint: 'Flotte zu Kepler oder Vortex senden', check: s => Object.keys(s.explored).length > 1, reward: { credits: 50, treibstoff: 40 } },
  { id: 'battle',   title: 'Schlacht gewinnen',      hint: 'Besiege eine feindliche Flotte', check: s => !!s.flags?.wonBattle, reward: { credits: 100, erz: 80 } },
  { id: 'abwehr',   title: 'Abwehrplattform bauen',  hint: 'Schützt Helios vor Plünderung', check: s => Object.values(s.planets).some(p => p.owner === 'player' && p.buildings?.abwehr > 0), reward: { credits: 50, erz: 40 } },
  { id: 'kolonie',  title: 'Planeten kolonisieren',  hint: 'Kolonieschiff zu leerem Planeten', check: s => Object.values(s.planets).some(p => p.owner === 'player' && !p.home && p.colonized), reward: { credits: 120, erz: 60 } },
  { id: 'forschung',title: 'Erste Technologie',     hint: 'Forschung → einen Knoten starten', check: s => (s.tech?.done?.length || 0) >= 1, reward: { credits: 80 } },
  { id: 'erobern',  title: 'Feindplaneten erobern',  hint: 'Bombardieren → Truppen landen', check: s => Object.values(s.planets).some(p => p.owner === 'player' && !p.home && !p.colonized), reward: { credits: 150, erz: 100 } },
];

// ---------- Technologiebaum ----------
export const TECHS = {
  mil_panzer:   { branch: 'mil', name: 'Verstärkte Panzerung', desc: 'Schiffshülle +15%', cost: { credits: 80, erz: 60 }, time: 25, requires: [], exclusive: 'mil_fork', effect: { hullMult: 1.15 } },
  mil_schilde:  { branch: 'mil', name: 'Starkschilde', desc: 'Schilde +20%', cost: { credits: 80, erz: 40, energie: 20 }, time: 25, requires: [], exclusive: 'mil_fork', effect: { shieldMult: 1.2 } },
  mil_laser:    { branch: 'mil', name: 'Fokussierte Laser', desc: 'Schaden +12%', cost: { credits: 120, erz: 80 }, time: 35, requires: ['mil_panzer|mil_schilde'], effect: { dmgMult: 1.12 } },
  mil_doktrin:  { branch: 'mil', name: 'Kampfdoctrin', desc: 'Moral hält länger (−Verluste)', cost: { credits: 150, erz: 50 }, time: 40, requires: ['mil_laser'], effect: { moraleBonus: 0.1 } },
  eco_minen:    { branch: 'eco', name: 'Tiefbohrtechnik', desc: 'Minen +25% Erz', cost: { credits: 70, erz: 40 }, time: 20, requires: [], effect: { mineMult: 1.25 } },
  eco_raff:     { branch: 'eco', name: 'Katalyse-Raffinerie', desc: 'Raffinerien +25% Treibstoff', cost: { credits: 70, treibstoff: 20 }, time: 20, requires: [], effect: { fuelMult: 1.25 } },
  eco_logistik: { branch: 'eco', name: 'Flottenlogistik', desc: 'Schiffsbau −20% Zeit', cost: { credits: 100, erz: 60 }, time: 30, requires: ['eco_minen|eco_raff'], effect: { shipTimeMult: 0.8 } },
  eco_handel:   { branch: 'eco', name: 'Handelsabkommen', desc: 'Credits +20%', cost: { credits: 90 }, time: 28, requires: ['eco_logistik'], effect: { creditMult: 1.2 } },
  sci_sensoren: { branch: 'sci', name: 'Langstreckensensoren', desc: 'Nachbar-Systeme sichtbar, wenn Flotte angrenzt', cost: { credits: 60, energie: 30 }, time: 18, requires: [], effect: { sensors: true } },
  sci_antrieb:  { branch: 'sci', name: 'Schnellantrieb', desc: 'Reisen −25% Zeit', cost: { credits: 100, treibstoff: 50 }, time: 30, requires: ['sci_sensoren'], effect: { travelMult: 0.75 } },
  sci_alien:    { branch: 'sci', name: 'Ruinenanalyse', desc: 'Forschung +15%', cost: { credits: 140, erz: 40 }, time: 40, requires: ['sci_antrieb'], effect: { researchMult: 1.15 } },
  spy_zellen:   { branch: 'spy', name: 'Spionagenetz', desc: 'Stub: zeigt KI-Flottengröße in erkundeten Systemen', cost: { credits: 80 }, time: 22, requires: [], effect: { spyVision: true } },
  spy_sabotage: { branch: 'spy', name: 'Sabotagezelle', desc: 'Stub: KI-Angriffe +20% langsamer', cost: { credits: 120, energie: 20 }, time: 35, requires: ['spy_zellen'], effect: { aiSlow: 1.2 } },
};
export const TECH_BRANCHES = [
  { id: 'mil', name: 'Militär' },
  { id: 'eco', name: 'Wirtschaft' },
  { id: 'sci', name: 'Wissenschaft' },
  { id: 'spy', name: 'Spionage' },
];
export const TECH_ORDER = Object.keys(TECHS);

// Kolonieschiff (zivil, kaum Kampfkraft)
SHIPS.kolonie = { name: 'Kolonieschiff', cost: { erz: 200, treibstoff: 120, credits: 150 }, time: 30, hull: 180, shield: 40, dmg: 1, rate: 3, range: 20, speed: 8, size: 2.5, weapon: 'laser', color: 0xcceeff, civilian: true };
SHIP_ORDER.push('kolonie');
DMG_MULT.kolonie = { jaeger: 0.2, bomber: 0.2, fregatte: 0.2, zerstoerer: 0.2, plattform: 0.2, kolonie: 1 };
for (const t of Object.keys(DMG_MULT)) if (t !== 'kolonie') DMG_MULT[t].kolonie = 1.5;
EVADE.kolonie = 0.05;

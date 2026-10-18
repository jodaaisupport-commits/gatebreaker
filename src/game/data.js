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

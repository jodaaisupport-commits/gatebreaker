// Echtzeit-Schlachtsimulation – reine Logik (plain objects), läuft im Browser oder später auf dem Server.
import { SHIPS, DMG_MULT, EVADE } from './data.js';

export const FORMATIONS = {
  keil:  { name: 'Keil',  dmg: 1.15, shield: 0.9,  speed: 1.0,  range: 1.0 },
  linie: { name: 'Linie', dmg: 1.0,  shield: 1.0,  speed: 1.0,  range: 1.15 },
  kugel: { name: 'Kugel', dmg: 0.95, shield: 1.25, speed: 0.85, range: 1.0 },
};
export const PRIORITIES = { auto: 'Automatisch (Konter)', naechstes: 'Nächstes Ziel', jaeger: 'Jäger', bomber: 'Bomber', fregatte: 'Fregatten', zerstoerer: 'Zerstörer', plattform: 'Plattformen' };

function rnd(b) { b.seed = (b.seed * 1664525 + 1013904223) >>> 0; return b.seed / 4294967296; }
const d3 = (a, c) => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);

export function slotOffset(formation, i, n) {
  if (formation === 'linie') return { x: (i % 2) * -4, y: ((i % 3) - 1) * 2, z: (i - (n - 1) / 2) * 5 };
  if (formation === 'kugel') {
    const R = 5 + Math.cbrt(n) * 4; const k = i + 0.5; const phi = Math.acos(1 - 2 * k / n); const th = Math.PI * (1 + Math.sqrt(5)) * k;
    return { x: R * Math.cos(th) * Math.sin(phi), y: R * Math.sin(th) * Math.sin(phi), z: R * Math.cos(phi) };
  }
  // keil
  let r = 0, c = i; while (c > r) { c -= r + 1; r++; }
  return { x: -r * 6, y: 0, z: (c - r / 2) * 6 };
}

function energyMult(e) { const t = e.w + e.s + e.a || 1; return { w: 0.4 + 1.8 * e.w / t, s: 0.4 + 1.8 * e.s / t, a: 0.4 + 1.8 * e.a / t }; }

export function defaultSettings() { return { formation: 'keil', energy: { w: 34, s: 33, a: 33 }, priority: 'auto' }; }

// sides: { player: {ships:{type:n}, platforms:n}, ai: {...} }
export function createBattle({ system, sides, attacker, settings, seed = 12345 }) {
  const b = { system, time: 0, over: false, winner: null, attacker, seed, units: [], shots: [], nextId: 1,
    settings: { player: settings?.player || defaultSettings(), ai: settings?.ai || { formation: 'keil', energy: { w: 40, s: 35, a: 25 }, priority: 'auto' } },
    start: { player: {}, ai: {} }, lost: { player: {}, ai: {} }, morale: { player: 1, ai: 1 }, moraleMod: { player: 0, ai: 0 }, anchor: {}, log: [], blasts: [], eventTimer: 15 };
  for (const side of ['player', 'ai']) {
    const dir = side === 'player' ? 1 : -1; const s = sides[side];
    const list = [];
    for (const t in s.ships) for (let k = 0; k < s.ships[t]; k++) list.push(t);
    for (let k = 0; k < (s.platforms || 0); k++) list.push('plattform');
    list.forEach(t => { b.start[side][t] = (b.start[side][t] || 0) + 1; });
    b.anchor[side] = { x: -90 * dir, y: 0, z: 0 };
    const mobile = list.filter(t => t !== 'plattform');
    let mi = 0, pi = 0;
    for (const t of list) {
      const def = SHIPS[t]; let pos;
      if (t === 'plattform') { pos = { x: -40 * dir, y: (pi % 2 ? 8 : -8), z: (pi - 1) * 25 }; pi++; }
      else { const o = slotOffset(b.settings[side].formation, mi++, mobile.length); pos = { x: b.anchor[side].x + o.x * dir, y: o.y, z: o.z }; }
      b.units.push({ id: b.nextId++, side, type: t, pos, slot: mi - 1, hull: def.hull, maxHull: def.hull, shield: def.shield, cd: rnd(b) * def.rate, target: null, retarget: 0, alive: true, phase: rnd(b) * 6.28, mods: { w: 1, s: 1, a: 1 }, stage: 0, launchCd: 3, charge: 0 });
    }
  }
  return b;
}

function pickTarget(b, u, enemies, prio) {
  if (!enemies.length) return null;
  let pool = enemies;
  if (prio && prio !== 'auto' && prio !== 'naechstes') { const p = enemies.filter(e => e.type === prio); if (p.length) pool = p; }
  let best = null, bs = -Infinity;
  for (const e of pool) {
    const dist = d3(u.pos, e.pos);
    let score = -dist;
    if (prio === 'auto') score += (DMG_MULT[u.type][e.type] || 1) * 60;
    if (score > bs) { bs = score; best = e; }
  }
  return best ? best.id : null;
}

const MOD_NAMES = { w: 'Waffen', s: 'Schilde', a: 'Antrieb' };
// Schaden anwenden: Schild absorbiert, Hülle; bei 66%/33% fällt ein Modul aus (sichtbar)
export function applyDamage(b, tgt, dmg) {
  let d = dmg; const absorbed = Math.min(tgt.shield, d * 0.85); tgt.shield -= absorbed; d -= absorbed; tgt.hull -= d;
  const r = tgt.hull / tgt.maxHull; const want = r < 0.33 ? 2 : r < 0.66 ? 1 : 0;
  while ((tgt.stage || 0) < want && !SHIPS[tgt.type].drone) { tgt.stage = (tgt.stage || 0) + 1; const ks = ['w', 's', 'a'].filter(k => tgt.mods[k] === 1); const k = ks[(rnd(b) * ks.length) | 0] || 'w'; tgt.mods[k] = 0.5; }
  if (tgt.hull <= 0 && tgt.alive) {
    tgt.alive = false; if (!tgt.drone) b.lost[tgt.side][tgt.type] = (b.lost[tgt.side][tgt.type] || 0) + 1;
    if (SHIPS[tgt.type].superweapon && b.moraleMod) { b.moraleMod[tgt.side] -= 0.2; b.log.unshift(`${tgt.side === 'player' ? 'Dein' : 'Draxis-'} Flaggschiff vernichtet! Moral −20%`); }
    return true;
  }
  return false;
}
export function moduleDamage(b, side) { const c = { w: 0, s: 0, a: 0 }; for (const u of b.units) if (u.alive && u.side === side && u.mods) for (const k in c) if (u.mods[k] < 1) c[k]++; return Object.entries(c).filter(([, n]) => n).map(([k, n]) => `${MOD_NAMES[k]} ${n}`).join(' · '); }

export function stepBattle(b, dt) {
  if (b.over) return;
  b.time += dt;
  const byId = new Map(); for (const u of b.units) if (u.alive) byId.set(u.id, u);
  const alive = { player: [], ai: [] }; for (const u of byId.values()) alive[u.side].push(u);
  for (const side of ['player', 'ai']) {
    const st = b.settings[side]; const em = energyMult(st.energy); const fm = FORMATIONS[st.formation];
    const enemySide = side === 'player' ? 'ai' : 'player'; const enemies = alive[enemySide];
    const dir = side === 'player' ? 1 : -1;
    // Flottenanker bewegt sich auf den Gegner zu
    const mob = alive[side].filter(u => !SHIPS[u.type].static);
    if (enemies.length) {
      let cx = 0, cy = 0, cz = 0; for (const e of enemies) { cx += e.pos.x; cy += e.pos.y; cz += e.pos.z; }
      const ec = { x: cx / enemies.length, y: cy / enemies.length, z: cz / enemies.length };
      const a = b.anchor[side]; const dist = d3(a, ec);
      const minSpeed = mob.length ? Math.min(...mob.map(u => SHIPS[u.type].speed)) : 0;
      if (dist > 45) { const sp = Math.max(8, minSpeed) * em.a * fm.speed * dt; a.x += (ec.x - a.x) / dist * sp; a.y += (ec.y - a.y) / dist * sp; a.z += (ec.z - a.z) / dist * sp; }
    }
    const m = b.morale[side]; const acc = 0.65 + 0.35 * m;
    let mi = 0;
    for (const u of alive[side]) {
      const def = SHIPS[u.type];
      // Schilde regenerieren
      const mods = u.mods || (u.mods = { w: 1, s: 1, a: 1 });
      const maxSh = def.shield * em.s * fm.shield * mods.s; u.maxShield = maxSh;
      u.shield = Math.min(maxSh, u.shield + maxSh * 0.035 * dt);
      // Zielwahl
      u.retarget -= dt;
      if (!byId.has(u.target) || u.retarget <= 0) { u.target = pickTarget(b, u, enemies, st.priority); u.retarget = 1.5 + rnd(b); }
      const tgt = byId.get(u.target);
      // Bewegung
      if (!def.static) {
        const speed = def.speed * em.a * fm.speed * mods.a;
        let goal;
        const small = u.type === 'jaeger' || u.type === 'bomber';
        if (small && tgt) {
          u.phase += dt * 1.2;
          const r = def.range * 0.6;
          goal = { x: tgt.pos.x + Math.cos(u.phase) * r, y: tgt.pos.y + Math.sin(u.phase * 0.7) * r * 0.4, z: tgt.pos.z + Math.sin(u.phase) * r };
        } else {
          const o = slotOffset(st.formation, mi, mob.filter(x => !(x.type === 'jaeger' || x.type === 'bomber')).length || 1);
          goal = { x: b.anchor[side].x + o.x * dir, y: b.anchor[side].y + o.y, z: b.anchor[side].z + o.z };
        }
        if (!small) mi++;
        const dx = goal.x - u.pos.x, dy = goal.y - u.pos.y, dz = goal.z - u.pos.z; const dl = Math.hypot(dx, dy, dz);
        if (dl > 0.3) { const s = Math.min(dl, speed * dt); u.pos.x += dx / dl * s; u.pos.y += dy / dl * s; u.pos.z += dz / dl * s; u.heading = { x: dx / dl, y: dy / dl, z: dz / dl }; }
      }
      // Reparatur: heilt den am stärksten beschädigten Verbündeten in Reichweite
      if (def.heal) { let w = null, wr = 1; for (const o of alive[side]) { if (o === u || SHIPS[o.type].static) continue; const r = o.hull / o.maxHull; if (r < wr && d3(o.pos, u.pos) < 45) { wr = r; w = o; } } if (w) w.hull = Math.min(w.maxHull, w.hull + def.heal * dt); }
      // Träger: Drohnen starten
      if (def.launch) { u.launchCd -= dt; if (u.launchCd <= 0) { u.launchCd = def.launch.every; const n = b.units.filter(o => o.alive && o.parent === u.id).length;
        if (n < def.launch.max) { const dd = SHIPS[def.launch.type]; b.units.push({ id: b.nextId++, side, type: def.launch.type, pos: { x: u.pos.x + dir * 3, y: u.pos.y + 2, z: u.pos.z }, hull: dd.hull, maxHull: dd.hull, shield: dd.shield, cd: 1, target: null, retarget: 0, alive: true, phase: rnd(b) * 6.28, mods: { w: 1, s: 1, a: 1 }, stage: 0, parent: u.id, drone: true, dmgMult: u.dmgMult }); } } }
      // Flaggschiff: Superwaffe
      if (def.superweapon && tgt) { u.charge += dt; if (u.charge >= def.superweapon.charge && d3(u.pos, tgt.pos) <= def.range * 1.5) { u.charge = 0; const W = def.superweapon; let k = 0;
        for (const e of enemies) if (e.alive && d3(e.pos, tgt.pos) <= W.radius) { applyDamage(b, e, W.dmg * (u.dmgMult || 1) * mods.w); k++; }
        b.blasts.push({ pos: { ...tgt.pos }, t: b.time, side }); b.shots.push({ from: { ...u.pos }, to: { ...tgt.pos }, target: -1, t: 0, dur: 0.15, dmg: 0, hit: false, weapon: 'laser', side, super: true });
        b.log.unshift(`${side === 'player' ? 'Dein' : 'Draxis-'} Flaggschiff feuert die Superwaffe (${k} Ziele)!`); } }
      // Feuern
      u.cd -= dt;
      if (tgt && u.cd <= 0) {
        const dist = d3(u.pos, tgt.pos);
        if (dist <= def.range * fm.range) {
          u.cd = def.rate * (0.9 + rnd(b) * 0.2);
          const tem = energyMult(b.settings[tgt.side].energy).a;
          const hit = rnd(b) < (1 - Math.min(0.8, EVADE[tgt.type] * tem)) * acc;
          const dmg = def.dmg * (u.dmgMult || 1) * (DMG_MULT[u.type]?.[tgt.type] || 1) * em.w * fm.dmg * mods.w;
          const speedP = def.weapon === 'laser' ? 400 : def.weapon === 'torpedo' ? 45 : 140;
          b.shots.push({ from: { ...u.pos }, to: { ...tgt.pos }, target: tgt.id, t: 0, dur: Math.max(0.08, dist / speedP), dmg, hit, weapon: def.weapon, side });
        }
      }
    }
  }
  // Projektile
  for (const s of b.shots) {
    s.t += dt;
    if (s.t >= s.dur && !s.done) {
      s.done = true;
      const tgt = byId.get(s.target);
      if (tgt && tgt.alive && s.hit) {
        if (applyDamage(b, tgt, s.dmg)) s.kill = true;
      }
    }
  }
  b.shots = b.shots.filter(s => s.t < s.dur + 0.25);
  // Moral: sinkt mit Verlusten
  for (const side of ['player', 'ai']) {
    const total = Object.values(b.start[side]).reduce((a, c) => a + c, 0) || 1;
    const lost = Object.values(b.lost[side]).reduce((a, c) => a + c, 0);
    b.morale[side] = Math.max(0.1, Math.min(1.3, 1 - 0.9 * lost / total + (b.moraleMod?.[side] || 0)));
  }
  // Moral-Ereignisse
  if (b.moraleMod) { b.eventTimer -= dt; if (b.eventTimer <= 0) { b.eventTimer = 20; if (rnd(b) < 0.6) {
    const side = rnd(b) < 0.5 ? 'player' : 'ai'; const E = [['Admiral hält eine flammende Rede', 0.12], ['Heldentat eines Jägerpiloten', 0.08], ['Panik im Maschinenraum', -0.1], ['Funkstörung – Befehle gehen verloren', -0.06]][(rnd(b) * 4) | 0];
    b.moraleMod[side] += E[1]; b.log.unshift(`${side === 'player' ? 'Deine Flotte' : 'Draxis'}: ${E[0]} (Moral ${E[1] > 0 ? '+' : ''}${Math.round(E[1] * 100)}%)`); } } }
  if (b.log && b.log.length > 8) b.log.length = 8;
  const pa = b.units.some(u => u.alive && u.side === 'player'); const aa = b.units.some(u => u.alive && u.side === 'ai');
  if (!pa || !aa || b.time > 300) { b.over = true; b.winner = pa && !aa ? 'player' : (!pa && aa ? 'ai' : (b.attacker === 'player' ? 'ai' : 'player')); }
}

export function survivors(b, side) {
  const r = {}; let platforms = 0;
  for (const u of b.units) if (u.alive && u.side === side && !u.drone) { if (u.type === 'plattform') platforms++; else r[u.type] = (r[u.type] || 0) + 1; }
  return { ships: r, platforms };
}

export function autoResolve(b, maxTime = 300) { let guard = 0; while (!b.over && guard++ < maxTime * 4) stepBattle(b, 0.25); return b; }

// DOM-Oberfläche im Holo-Stil. Erzeugt HTML aus dem Zustand; Klicks laufen über data-act.
import { BUILDINGS, BUILDING_ORDER, SHIPS, SHIP_ORDER, RES, RES_LABEL, buildingCost, buildingTime, FACTIONS, FACTION_ORDER, TUTORIAL, TECHS, TECH_BRANCHES, TECH_ORDER } from '../game/data.js';
import { sysById, rates, canAfford, homePlanet, fleetsIn, playerVisible, shipCount, fleetPower, path, shipTime, canResearch, hasTech, techEffects, faction } from '../game/sim.js';
import { PRIORITIES } from '../game/battleSim.js';
import { planetPeopleHtml, empireHtml } from './empireUi.js';
import { warHtml } from './warUi.js';
import { troopStrength as warTroops, fleetStrengthText, armyPower } from '../game/warfare.js';
import { RUINS } from '../game/data.js';
import { moduleDamage } from '../game/battleSim.js';
export { empireHtml };

const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n).toString();
const costHtml = (state, c) => Object.entries(c).filter(([, v]) => v > 0).map(([r, v]) => `<span class="${state.res[r] < v ? 'no' : ''}">${fmt(v)} ${RES_LABEL[r]}</span>`).join(' · ');
const shipsHtml = s => SHIP_ORDER.filter(t => s?.[t]).map(t => `${s[t]}× ${SHIPS[t].name}`).join(', ') || '<span class="muted">keine Schiffe</span>';
let _st = null;
export const troopStrength = (pf, p) => warTroops(_st, pf, p);
const tip = (title, body) => ` title="${title}${body ? '\n' + body : ''}"`;

export function resourcesHtml(state) {
  const r = rates(state);
  return RES.map(k => `<div class="res ${k === 'energie' && r.energie < 0 ? 'neg' : ''}"${tip(RES_LABEL[k], `${r[k] >= 0 ? '+' : ''}${r[k].toFixed(2)}/s`)}><b>${fmt(state.res[k])}</b><i>${RES_LABEL[k]} ${r[k] >= 0 ? '+' : ''}${r[k].toFixed(1)}/s</i></div>`).join('')
    + (r.eff < 1 ? `<div class="res neg"><b>⚠ ${Math.round(r.eff * 100)}%</b><i>Energiemangel</i></div>` : '');
}

export function leftHtml(state, ui) {
  _st = state;
  if (ui.panel === 'war') return warHtml(state);
  if (ui.panel === 'tech') return techHtml(state);
  if (ui.panel === 'empire') return empireHtml(state);
  if (ui.panel && ui.panel !== 'main' && PANELS[ui.panel]) return PANELS[ui.panel](state, ui);
  if (ui.view === 'system' && ui.selectedPlanet) return planetHtml(state, ui, ui.selectedPlanet);
  const sysId = ui.view === 'system' ? ui.systemView : ui.selectedSystem;
  if (!sysId) return `<h2>Galaxie</h2><p class="muted">Klicke ein Sternsystem an.</p>${tutorialHtml(state)}`;
  return systemHtml(state, ui, sysId) + (ui.view === 'galaxy' ? tutorialHtml(state) : '<p class="muted">Klicke einen Planeten an, um ihn zu verwalten.</p>');
}

function tutorialHtml(state) {
  const done = new Set(state.tutorial?.claimed || []);
  const fac = faction(state);
  let h = `<h3>Aufträge <span class="muted">· ${fac.name}</span></h3>`;
  for (const t of TUTORIAL) {
    const ok = done.has(t.id);
    const rw = Object.entries(t.reward).map(([k, v]) => `+${v} ${RES_LABEL[k] || k}`).join(', ');
    h += `<div class="item ${ok ? 'done' : ''}"><div class="top"><span class="${ok ? 'blue' : ''}">${ok ? '✔' : '○'} ${t.title}</span><span class="cost">${ok ? 'erledigt' : rw}</span></div>${ok ? '' : `<div class="stats muted">${t.hint}</div>`}</div>`;
  }
  return h;
}

function systemHtml(state, ui, sysId) {
  const s = sysById(sysId); const explored = state.explored[sysId]; const vis = playerVisible(state, sysId);
  let h = `<h2>${explored ? s.name : '? ' + s.name}</h2>`;
  if (!explored) h += `<p class="muted">Unerforschtes System. Schicke eine Flotte hin, um es aufzudecken.</p>`;
  else {
    h += `<h3>Planeten</h3>` + s.planets.map(p => {
      const st = state.planets[p.id];
      const tag = st.owner === 'player' ? (st.colonized ? '<span class="badge blue">Kolonie</span>' : '<span class="badge blue">Eigen</span>') : st.owner === 'ai' ? '<span class="badge red">Draxis</span>' : st.surveyed ? '<span class="badge">erkundet</span>' : '';
      return `<div class="item"><div class="top"><span>${p.name} <span class="muted">· ${p.type}</span></span>${tag}</div></div>`;
    }).join('');
    const enemies = vis ? fleetsIn(state, sysId, 'ai') : [];
    const spy = techEffects(state).spyVision && explored;
    h += `<h3>Flotten</h3>` + ([...fleetsIn(state, sysId, 'player'), ...enemies].map(f => `<div class="item"><span class="${f.owner === 'ai' ? 'red' : 'blue'}">${f.name}</span><div class="stats">${shipsHtml(f.ships)}${f.owner === 'ai' ? ` · ${fleetStrengthText(state, f, techEffects(state))}` : ''}</div></div>`).join('') || `<div class="muted">${vis ? 'Keine' : 'Keine Sensordaten (keine eigene Präsenz)'}</div>`);
  }
  h += `<div class="btns">${explored && ui.view !== 'system' ? `<button data-act="enter" data-id="${sysId}">System ansehen</button>` : ''}`;
  const f = state.fleets.find(x => x.id === ui.selectedFleet);
  if (f) { const p = path(f.system, sysId); const fuel = p ? Math.ceil(shipCount(f) * 2 * p.length) : 0;
    h += `<button data-act="move" data-id="${sysId}" ${!p || f.move || f.inBattle || !p.length ? 'disabled' : ''}${tip('Flotte senden', fuel ? `${fuel} Treibstoff · ${Math.round(p.length * 12)}s` : '')}>„${f.name}“ hierher senden${p && p.length ? ` (${fuel} Treibstoff)` : ''}</button>`; }
  h += `</div>`;
  return h;
}

function planetHtml(state, ui, pid) {
  const st = state.planets[pid]; const def = sysById(st.system).planets.find(p => p.id === pid);
  let h = `<h2>${def.name}</h2><div class="muted">${def.type} · ${sysById(st.system).name}</div>`;
  if (st.owner === 'player' && st.buildings) {
    const r = rates(state);
    h += `<div class="stats">Imperium: Energie ${r.eProd.toFixed(1)}/${r.eCons.toFixed(1)} · Unterhalt ${r.upkeep.toFixed(2)} Cr/s${st.colonized ? ' · Kolonie' : st.home ? ' · Heimatwelt' : ' · erobert'}</div><h3>Gebäude</h3>`;
    for (const k of BUILDING_ORDER) {
      const lvl = st.buildings[k] || 0; const qn = st.queue.filter(q => q.key === k).length; const c = buildingCost(k, lvl + qn); const t = buildingTime(k, lvl + qn);
      h += `<div class="item"><div class="top"><span>${BUILDINGS[k].name} <b>Stufe ${lvl}</b>${qn ? ` <span class="amber">→ ${lvl + qn}</span>` : ''}</span><button data-act="build" data-id="${k}" ${!canAfford(state, c) || st.queue.length >= 3 ? 'disabled' : ''}${tip('Ausbau', `${costHtml(state, c).replace(/<[^>]+>/g, '')} · ${t}s`)}>Ausbau</button></div><div class="stats">${BUILDINGS[k].desc}</div><div class="cost">${costHtml(state, c)} · ${t}s</div></div>`;
    }
    if (st.queue.length) h += `<h3>Bauliste</h3>` + st.queue.map((q, i) => `<div class="item">${BUILDINGS[q.key].name} → Stufe ${q.level} <span class="muted">${i === 0 ? Math.ceil(q.remaining) + 's' : 'wartet'}</span>${i === 0 ? `<div class="bar"><div style="width:${100 - q.remaining / q.total * 100}%"></div></div>` : ''}</div>`).join('');
    h += planetPeopleHtml(state, pid);
    h += `<h3>Raumwerft</h3>`;
    if (!st.buildings.werft) h += `<div class="amber">Baue zuerst eine Raumwerft.</div>`;
    else {
      for (const t of SHIP_ORDER) { const d = SHIPS[t]; const c5 = Object.fromEntries(Object.entries(d.cost).map(([r, v]) => [r, v * 5])); const stime = Math.round(shipTime(state, t, st));
        h += `<div class="item"><div class="top"><span>${d.name}${d.civilian ? ' <span class="badge">zivil</span>' : ''}</span><span class="btns" style="margin:0"><button data-act="ship" data-id="${t}" data-n="1" ${!canAfford(state, d.cost) || st.shipQueue.length >= 5 ? 'disabled' : ''}${tip(d.name, `${costHtml(state, d.cost).replace(/<[^>]+>/g, '')} · ${stime}s`)}>+1</button><button data-act="ship" data-id="${t}" data-n="5" ${!canAfford(state, c5) || st.shipQueue.length >= 5 ? 'disabled' : ''}>+5</button></span></div>
          <div class="stats">Hülle ${d.hull} · Schild ${d.shield} · Schaden ${d.dmg}/${d.rate}s · ${shipTip(t)}</div><div class="cost">${costHtml(state, d.cost)} · ${stime}s</div></div>`; }
      if (st.shipQueue.length) h += st.shipQueue.map((q, i) => `<div class="item">${q.count}× ${SHIPS[q.type].name} <span class="muted">${i === 0 ? Math.ceil(q.remaining) + 's/Stück' : 'wartet'}</span>${i === 0 ? `<div class="bar"><div style="width:${100 - q.remaining / q.total * 100}%"></div></div>` : ''}</div>`).join('');
    }
  } else if (st.owner === 'player') {
    h += `<p>Eigene Kolonie ohne Gebäudeverwaltung (Legacy). Liefert Basisertrag.</p><div class="stats">Garnison: ${st.garrison}</div>`;
  } else if (st.owner === 'ai') {
    const pf = fleetsIn(state, st.system, 'player'); const af = fleetsIn(state, st.system, 'ai');
    const control = pf.length && !af.length && st.defense === 0;
    h += `<h3>Feindlicher Planet</h3><div>Garnison: <b class="red">${st.garrison}</b> · Abwehrplattformen: <b>${st.defense}</b></div>`;
    h += `<div class="stats">${!pf.length ? 'Schicke eine Flotte in den Orbit.' : af.length || st.defense ? '<span class="amber">Orbit umkämpft – besiege Flotte und Abwehr.</span>' : '<span class="blue">Orbit unter deiner Kontrolle.</span>'}</div>`;
    if (st.bombard) h += `<div class="item">Bombardement läuft… ${Math.ceil(st.bombard.remaining)}s<div class="bar amber"><div style="width:${100 - st.bombard.remaining / st.bombard.total * 100}%"></div></div></div>`;
    h += `<div class="btns"><button class="warn" data-act="bombard" data-id="${pid}" ${!control || st.bombard ? 'disabled' : ''}${tip('Bombardieren', '60 Treibstoff · senkt Garnison')}>Bombardieren (60 Treibstoff)</button><button class="alert" data-act="land" data-id="${pid}" ${!control ? 'disabled' : ''}${tip('Truppen landen', '150 Credits · 50 Treibstoff')}>Truppen landen (150 Cr, 50 Tr)</button></div>`;
    h += `<div class="item"><div class="top"><span>Belagerung ${Math.round(st.siege || 0)}%</span>${st.supplyCut ? '<span class="badge blue">Nachschub abgeschnitten</span>' : ''}</div><div class="bar amber"><div style="width:${st.siege || 0}%"></div></div><div class="stats">Orbit halten: Garnison sinkt, Landung bis +50%.</div></div>`;
    if (pf.length) h += `<div class="stats">Landungstruppen: ca. ${troopStrength(pf, st)} (davon Armee ${Math.round(armyPower(state, st))}) · Erfolg wahrscheinlich, wenn deutlich über der Garnison.</div>`;
  } else {
    // Unbesiedelt → Erkunden / Kolonisieren
    const pf = fleetsIn(state, st.system, 'player');
    const hasColony = pf.some(f => (f.ships.kolonie || 0) > 0);
    h += `<h3>Unbesiedelt</h3>`;
    if (!st.surveyed) h += `<p class="muted">Noch nicht erkundet. Eine Flotte im Orbit kann den Planeten vermessen.</p>`;
    else h += `<p class="blue">Erkundet – bereit zur Kolonisierung mit einem Kolonieschiff.</p>`;
    h += `<div class="btns">
      <button data-act="survey" data-id="${pid}" ${!pf.length || st.surveyed ? 'disabled' : ''}${tip('Erkunden', '15 Treibstoff')}>Erkunden (15 Treibstoff)</button>
      <button data-act="colonize" data-id="${pid}" ${!pf.length || !st.surveyed || !hasColony ? 'disabled' : ''}${tip('Kolonisieren', 'Verbraucht 1 Kolonieschiff')}>Kolonisieren</button>
    </div>`;
    if (pf.length && !hasColony) h += `<div class="amber">Kein Kolonieschiff in der Flotte. Baue eines in einer Raumwerft.</div>`;
  }
  if (RUINS[pid]) { const R = RUINS[pid]; const run = state.expeditions.find(e => e.planet === pid); h += `<h3>Ruinen der Torbauer</h3><div class="item"><b>${R.name}</b><div class="stats">${state.ruinsDone[pid] ? R.text : 'Unerforscht – Expedition mit Flotte im System.'}</div>${run ? `<div class="bar"><div style="width:${100 - run.remaining / run.total * 100}%"></div></div>` : ''}<div class="btns"><button data-act="expedition" data-id="${pid}" ${state.ruinsDone[pid] || run || !fleetsIn(state, st.system, 'player').length ? 'disabled' : ''}${tip('Expedition', '60 Treibstoff · 40 Credits · 30 s · Risiko: Wächter')}>Expedition (60 Tr, 40 Cr)</button></div></div>`; }
  h += `<div class="btns"><button data-act="deselect">Zurück zum System</button></div>`;
  return h;
}
function shipTip(t) { return { jaeger: 'stark gg. Bomber', bomber: 'stark gg. Großkampfschiffe', fregatte: 'Flak: stark gg. Jäger', zerstoerer: 'stark gg. Fregatten', kolonie: 'zivil – gründet Kolonien', reparatur: 'zivil – repariert & birgt', traeger: 'startet 4 Jagddrohnen', flaggschiff: 'einzigartig – Superwaffe (Flächenschaden)' }[t] || ''; }

export function techHtml(state) {
  const q = state.tech?.queue;
  let h = `<h2>Forschung</h2><div class="muted">Fraktion: ${faction(state).name} · Forschungsgeschwindigkeit ×${techEffects(state).researchMult.toFixed(2)}</div>`;
  if (q) {
    const t = TECHS[q.id];
    h += `<div class="item"><b>Läuft: ${t?.name || q.id}</b><div class="bar"><div style="width:${100 - q.remaining / q.total * 100}%"></div></div><div class="stats">${Math.ceil(q.remaining / techEffects(state).researchMult)}s verbleibend</div></div>`;
  }
  for (const br of TECH_BRANCHES) {
    h += `<h3>${br.name}</h3>`;
    for (const id of TECH_ORDER.filter(k => TECHS[k].branch === br.id)) {
      const t = TECHS[id]; const done = hasTech(state, id); const err = done ? null : canResearch(state, id);
      const blockedExclusive = t.exclusive && state.tech.exclusive[t.exclusive] && state.tech.exclusive[t.exclusive] !== id;
      h += `<div class="item ${done ? 'done' : blockedExclusive ? 'locked' : ''}"><div class="top"><span>${done ? '✔ ' : ''}${t.name}${t.exclusive ? ' <span class="badge amber">exklusiv</span>' : ''}</span>
        ${done ? '<span class="blue">fertig</span>' : `<button data-act="research" data-id="${id}" ${err ? 'disabled' : ''}${tip(t.name, t.desc)}>Forschen</button>`}</div>
        <div class="stats">${t.desc}</div>
        ${done ? '' : `<div class="cost">${costHtml(state, t.cost)} · ${t.time}s${err && err !== 'Nicht genug Ressourcen.' ? ` · <span class="amber">${err}</span>` : ''}</div>`}</div>`;
    }
  }
  h += `<div class="btns"><button data-act="panel" data-id="main">Zurück</button></div>`;
  return h;
}

export function rightHtml(state, ui) {
  let h = `<h2>Flotten</h2>`;
  const mine = state.fleets.filter(f => f.owner === 'player' && (shipCount(f) || f.move));
  if (!mine.length) h += `<p class="muted">Keine Flotten. Baue Schiffe in der Raumwerft.</p>`;
  for (const f of mine) {
    const sel = ui.selectedFleet === f.id;
    const where = f.inBattle ? `<span class="red">im Gefecht in ${sysById(f.system).name}</span>` : f.move ? `<span class="amber">${sysById(f.move.from).name} → ${sysById(f.move.to).name}${f.move.path.length ? ' → … ' + sysById(f.move.path[f.move.path.length - 1]).name : ''}</span>` : `in ${sysById(f.system).name}${f.cooldown > 0 ? ` <span class="muted">(Tor-Abkühlung ${Math.ceil(f.cooldown)}s)</span>` : ''}`;
    h += `<div class="item ${sel ? 'sel' : ''}" data-act="selfleet" data-id="${f.id}"><div class="top"><b>${f.name}</b><span class="muted">Stärke ${fleetPower(f.ships)}</span></div><div class="stats">${where}</div><div class="stats">${shipsHtml(f.ships)}${f.vet ? ` · <span class="amber">Veteran ${'★'.repeat(f.vet)}</span>` : ''}${f.patrol ? ' · <span class="blue">Torpatrouille</span>' : ''}${f.intercept ? ' · <span class="amber">Abfangbereit</span>' : ''}</div>${f.move ? `<div class="bar"><div style="width:${f.move.t / f.move.total * 100}%"></div></div>` : ''}
      ${sel ? `<div class="btns"><button data-act="split" data-id="${f.id}">Teilen</button><button data-act="merge" data-id="${f.id}">Zusammenlegen</button><button data-act="rename" data-id="${f.id}">Umbenennen</button><button data-act="crew" data-id="${f.id}" ${state.crews < 1 || (f.vet || 0) >= 5 ? 'disabled' : ''} title="1 Crew: +5% Schaden">Crew zuweisen (${Math.floor(state.crews)})</button><button data-act="patrol" data-id="${f.id}" class="${f.patrol ? 'active' : ''}" title="Stellt Draxis-Flotten am Tor, +10% Moral · kostet Treibstoff">Patrouille</button><button data-act="intercept" data-id="${f.id}" class="${f.intercept ? 'active' : ''}" title="Fängt entgegenkommende Flotten auf der Route ab">Abfangen</button></div><div class="stats blue">Ziel wählen: System auf der Karte anklicken → „hierher senden“.</div>` : ''}</div>`;
  }
  const threats = state.fleets.filter(f => f.owner === 'ai' && (f.role === 'attack' || f.role === 'raid') && f.move);
  if (state.battleQueue?.length) h += `<h3 class="red">Warteschlange: ${state.battleQueue.length} Gefecht(e)</h3><div class="btns"><button data-act="panel" data-id="war">Ansehen</button></div>`;
  if (threats.length) h += `<h3 class="red">Bedrohungen</h3>` + threats.map(f => `<div class="item"><span class="red">${f.name}</span> <span class="muted">${fleetStrengthText(state, f, techEffects(state))} · ${sysById(f.move.from).name} → ${sysById(f.move.to).name}</span></div>`).join('');
  return h;
}

export function battleBarsHtml(b) {
  const side = (s, name, cls) => {
    let hull = 0, max = 0, sh = 0, shm = 0, n = 0; for (const u of b.units) if (u.side === s) { max += u.maxHull; shm += u.maxShield || 0; if (u.alive) { hull += Math.max(0, u.hull); sh += u.shield; n++; } }
    const total = Object.values(b.start[s]).reduce((a, c) => a + c, 0);
    return `<div class="side panel"><div style="display:flex;justify-content:space-between"><b class="${cls}">${name}</b><span>${n}/${total} Schiffe</span></div>
      <div class="stats">Hülle</div><div class="bar ${s === 'ai' ? 'red' : ''}"><div style="width:${hull / max * 100}%"></div></div>
      <div class="stats">Schilde</div><div class="bar"><div style="width:${shm ? sh / shm * 100 : 0}%;background:#9fe6ff"></div></div>
      <div class="stats">Moral ${Math.round(b.morale[s] * 100)}%</div>${moduleDamage(b, s) ? `<div class="stats amber">Module beschädigt: ${moduleDamage(b, s)}</div>` : ''}</div>`;
  };
  return side('player', 'Deine Flotte', 'blue') + side('ai', 'Draxis-Imperium', 'red') + (b.log?.length ? `<div class="side panel blog">${b.log.slice(0, 3).map(l => `<div class="stats">${l}</div>`).join('')}</div>` : '');
}

export function reportHtml(r) {
  const types = [...new Set([...Object.keys(r.start.player), ...Object.keys(r.start.ai)])];
  return `<h2>Gefechtsbericht – ${r.systemName}</h2>
    <div class="${r.winner === 'player' ? 'blue' : 'red'}" style="font-size:16px;margin:4px 0">${r.winner === 'player' ? 'SIEG' : r.retreat ? 'RÜCKZUG' : 'NIEDERLAGE'}</div>
    <div class="muted">${r.auto ? 'Automatisch ausgetragen · ' : ''}Dauer ${r.duration}s</div>
    <table><tr><th>Typ</th><th>Eigene</th><th>Verloren</th><th>Feind</th><th>Zerstört</th></tr>
    ${types.map(t => `<tr><td>${SHIPS[t]?.name || t}</td><td>${r.start.player[t] || 0}</td><td class="red">${r.lost.player[t] || 0}</td><td>${r.start.ai[t] || 0}</td><td class="blue">${r.lost.ai[t] || 0}</td></tr>`).join('')}</table>
    ${r.repaired && Object.keys(r.repaired).length ? `<div class="blue">Reparaturschiffe retteten: ${Object.entries(r.repaired).map(([t, n]) => `${n}× ${SHIPS[t]?.name || t}`).join(', ')}</div>` : ''}
    ${r.pods ? `<div class="stats">Rettungskapseln: ${r.pods.saved} eigene Besatzungen gerettet${r.pods.captured ? ` · ${r.pods.captured} Feinde gefangen` : ''}${r.wrecks ? ` · +${r.wrecks} Wrackdaten` : ''}</div>` : ''}
    ${r.moraleEvents?.length ? `<div class="stats amber">${r.moraleEvents.slice(0, 3).join(' · ')}</div>` : ''}
    <h3>Geborgene Wracks</h3><div>${r.winner === 'player' ? `${r.salvage.erz} Erz · ${r.salvage.treibstoff} Treibstoff · ${r.salvage.credits} Credits` : '<span class="muted">Keine Bergung – das Schlachtfeld gehört dem Gegner.</span>'}</div>
    <div class="btns" style="margin-top:12px"><button data-act="closemodal">Schließen</button></div>`;
}

export function offlineHtml(o) {
  const h = Math.floor(o.secs / 3600), m = Math.floor(o.secs % 3600 / 60);
  return `<h2>Willkommen zurück, Kommandant</h2><p>Du warst ${h ? h + ' h ' : ''}${m} min weg. Deine Wirtschaft lief weiter:</p>
    <div>${RES.map(r => `<div>${RES_LABEL[r]}: <b class="${o.gained[r] < 0 ? 'amber' : 'blue'}">${o.gained[r] >= 0 ? '+' : ''}${o.gained[r]}</b></div>`).join('')}</div>
    ${o.events.length ? `<h3>Ereignisse</h3>${o.events.map(e => `<div class="${e.level === 'alert' ? 'red' : 'muted'}">${e.text}</div>`).join('')}` : ''}
    <div class="btns" style="margin-top:12px"><button data-act="closemodal">Weiter</button></div>`;
}

export function factionPickerHtml() {
  return `<h2>Fraktion wählen</h2><p class="muted">Gatebreaker v0.5 – wähle dein Startimperium. Die Wahl wird gespeichert.</p>
    ${FACTION_ORDER.map(id => { const f = FACTIONS[id]; return `<div class="item"><div class="top"><b>${f.name}</b><button data-act="pickfaction" data-id="${id}">Wählen</button></div>
      <div class="stats">${f.desc}</div><div class="blue">＋ ${f.bonus}</div><div class="amber">− ${f.malus}</div></div>`; }).join('')}
    <p class="muted" style="margin-top:8px">Eigene Fraktion aus Punkten folgt später.</p>`;
}

export { PRIORITIES };
export const PANELS = {};

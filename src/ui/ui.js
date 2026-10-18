// DOM-Oberfläche im Holo-Stil. Erzeugt HTML aus dem Zustand; Klicks laufen über data-act.
import { BUILDINGS, BUILDING_ORDER, SHIPS, SHIP_ORDER, RES, RES_LABEL, buildingCost, buildingTime } from '../game/data.js';
import { sysById, rates, canAfford, homePlanet, fleetsIn, playerVisible, shipCount, fleetPower, path, shipTime } from '../game/sim.js';
import { PRIORITIES } from '../game/battleSim.js';

const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n).toString();
const costHtml = (state, c) => Object.entries(c).filter(([, v]) => v > 0).map(([r, v]) => `<span class="${state.res[r] < v ? 'no' : ''}">${fmt(v)} ${RES_LABEL[r]}</span>`).join(' · ');
const shipsHtml = s => SHIP_ORDER.filter(t => s[t]).map(t => `${s[t]}× ${SHIPS[t].name}`).join(', ') || '<span class="muted">keine Schiffe</span>';
export const troopStrength = pf => pf.reduce((a, f) => a + 40 + 3 * (f.ships.jaeger || 0) + 4 * (f.ships.bomber || 0) + 10 * (f.ships.fregatte || 0) + 16 * (f.ships.zerstoerer || 0), 0);

export function resourcesHtml(state) {
  const r = rates(state);
  return RES.map(k => `<div class="res ${k === 'energie' && r.energie < 0 ? 'neg' : ''}"><b>${fmt(state.res[k])}</b><i>${RES_LABEL[k]} ${r[k] >= 0 ? '+' : ''}${r[k].toFixed(1)}/s</i></div>`).join('')
    + (r.eff < 1 ? `<div class="res neg"><b>⚠ ${Math.round(r.eff * 100)}%</b><i>Energiemangel</i></div>` : '');
}

export function leftHtml(state, ui) {
  if (ui.view === 'system' && ui.selectedPlanet) return planetHtml(state, ui, ui.selectedPlanet);
  const sysId = ui.view === 'system' ? ui.systemView : ui.selectedSystem;
  if (!sysId) return `<h2>Galaxie</h2><p class="muted">Klicke ein Sternsystem an.</p>${goalsHtml(state)}`;
  return systemHtml(state, ui, sysId) + (ui.view === 'galaxy' ? goalsHtml(state) : '<p class="muted">Klicke einen Planeten an, um ihn zu verwalten.</p>');
}

function goalsHtml(state) {
  const hp = homePlanet(state); const owned = Object.values(state.planets).filter(p => p.owner === 'player').length;
  const goals = [
    ['Raumwerft bauen', hp.buildings.werft > 0], ['Abwehrplattform bauen', hp.buildings.abwehr > 0],
    ['Ein weiteres System erkunden', Object.keys(state.explored).length > 1], ['Einen feindlichen Planeten erobern', owned > 1], ['Draxis Prime erobern', state.ai.defeated],
  ];
  return `<h3>Ziele</h3>` + goals.map(([t, d]) => `<div class="${d ? 'blue' : 'muted'}">${d ? '✔' : '○'} ${t}</div>`).join('');
}

function systemHtml(state, ui, sysId) {
  const s = sysById(sysId); const explored = state.explored[sysId]; const vis = playerVisible(state, sysId);
  let h = `<h2>${explored ? s.name : '? ' + s.name}</h2>`;
  if (!explored) h += `<p class="muted">Unerforschtes System. Schicke eine Flotte hin, um es aufzudecken.</p>`;
  else {
    h += `<h3>Planeten</h3>` + s.planets.map(p => { const st = state.planets[p.id]; return `<div class="item"><div class="top"><span>${p.name} <span class="muted">· ${p.type}</span></span>${st.owner === 'player' ? '<span class="badge blue">Eigen</span>' : st.owner === 'ai' ? '<span class="badge red">Draxis</span>' : ''}</div></div>`; }).join('');
    const enemies = vis ? fleetsIn(state, sysId, 'ai') : [];
    h += `<h3>Flotten</h3>` + ([...fleetsIn(state, sysId, 'player'), ...enemies].map(f => `<div class="item"><span class="${f.owner === 'ai' ? 'red' : 'blue'}">${f.name}</span><div class="stats">${shipsHtml(f.ships)}</div></div>`).join('') || `<div class="muted">${vis ? 'Keine' : 'Keine Sensordaten (keine eigene Präsenz)'}</div>`);
  }
  h += `<div class="btns">${explored && ui.view !== 'system' ? `<button data-act="enter" data-id="${sysId}">System ansehen</button>` : ''}`;
  const f = state.fleets.find(x => x.id === ui.selectedFleet);
  if (f) { const p = path(f.system, sysId); const fuel = p ? Math.ceil(shipCount(f) * 2 * p.length) : 0;
    h += `<button data-act="move" data-id="${sysId}" ${!p || f.move || f.inBattle || !p.length ? 'disabled' : ''}>„${f.name}“ hierher senden${p && p.length ? ` (${fuel} Treibstoff)` : ''}</button>`; }
  h += `</div>`;
  return h;
}

function planetHtml(state, ui, pid) {
  const st = state.planets[pid]; const def = sysById(st.system).planets.find(p => p.id === pid);
  let h = `<h2>${def.name}</h2><div class="muted">${def.type} · ${sysById(st.system).name}</div>`;
  if (st.owner === 'player' && st.buildings) {
    const r = rates(state);
    h += `<div class="stats">Energie: ${r.eProd.toFixed(1)} erzeugt / ${r.eCons.toFixed(1)} verbraucht · Flottenunterhalt ${r.upkeep.toFixed(2)} Cr/s</div><h3>Gebäude</h3>`;
    for (const k of BUILDING_ORDER) {
      const lvl = st.buildings[k] || 0; const qn = st.queue.filter(q => q.key === k).length; const c = buildingCost(k, lvl + qn);
      h += `<div class="item"><div class="top"><span>${BUILDINGS[k].name} <b>Stufe ${lvl}</b>${qn ? ` <span class="amber">→ ${lvl + qn}</span>` : ''}</span><button data-act="build" data-id="${k}" ${!canAfford(state, c) || st.queue.length >= 3 ? 'disabled' : ''}>Ausbau</button></div><div class="stats">${BUILDINGS[k].desc}</div><div class="cost">${costHtml(state, c)} · ${buildingTime(k, lvl + qn)}s</div></div>`;
    }
    if (st.queue.length) h += `<h3>Bauliste</h3>` + st.queue.map((q, i) => `<div class="item">${BUILDINGS[q.key].name} → Stufe ${q.level} <span class="muted">${i === 0 ? Math.ceil(q.remaining) + 's' : 'wartet'}</span>${i === 0 ? `<div class="bar"><div style="width:${100 - q.remaining / q.total * 100}%"></div></div>` : ''}</div>`).join('');
    h += `<h3>Raumwerft</h3>`;
    if (!st.buildings.werft) h += `<div class="amber">Baue zuerst eine Raumwerft.</div>`;
    else {
      for (const t of SHIP_ORDER) { const d = SHIPS[t]; const c5 = Object.fromEntries(Object.entries(d.cost).map(([r, v]) => [r, v * 5]));
        h += `<div class="item"><div class="top"><span>${d.name}</span><span class="btns" style="margin:0"><button data-act="ship" data-id="${t}" data-n="1" ${!canAfford(state, d.cost) || st.shipQueue.length >= 5 ? 'disabled' : ''}>+1</button><button data-act="ship" data-id="${t}" data-n="5" ${!canAfford(state, c5) || st.shipQueue.length >= 5 ? 'disabled' : ''}>+5</button></span></div>
          <div class="stats">Hülle ${d.hull} · Schild ${d.shield} · Schaden ${d.dmg}/${d.rate}s · ${shipTip(t)}</div><div class="cost">${costHtml(state, d.cost)} · ${Math.round(shipTime(state, t))}s</div></div>`; }
      if (st.shipQueue.length) h += st.shipQueue.map((q, i) => `<div class="item">${q.count}× ${SHIPS[q.type].name} <span class="muted">${i === 0 ? Math.ceil(q.remaining) + 's/Stück' : 'wartet'}</span>${i === 0 ? `<div class="bar"><div style="width:${100 - q.remaining / q.total * 100}%"></div></div>` : ''}</div>`).join('');
    }
  } else if (st.owner === 'player') {
    h += `<p>Eroberte Kolonie. Liefert +1 Erz/s, +0,4 Treibstoff/s, +0,8 Credits/s, +0,5 Energie.</p><div class="stats">Garnison: ${st.garrison}</div>`;
  } else if (st.owner === 'ai') {
    const pf = fleetsIn(state, st.system, 'player'); const af = fleetsIn(state, st.system, 'ai');
    const control = pf.length && !af.length && st.defense === 0;
    h += `<h3>Feindlicher Planet</h3><div>Garnison: <b class="red">${st.garrison}</b> · Abwehrplattformen: <b>${st.defense}</b></div>`;
    h += `<div class="stats">${!pf.length ? 'Schicke eine Flotte in den Orbit.' : af.length || st.defense ? '<span class="amber">Orbit umkämpft – besiege Flotte und Abwehr.</span>' : '<span class="blue">Orbit unter deiner Kontrolle.</span>'}</div>`;
    if (st.bombard) h += `<div class="item">Bombardement läuft… ${Math.ceil(st.bombard.remaining)}s<div class="bar amber"><div style="width:${100 - st.bombard.remaining / st.bombard.total * 100}%"></div></div></div>`;
    h += `<div class="btns"><button class="warn" data-act="bombard" data-id="${pid}" ${!control || st.bombard ? 'disabled' : ''}>Bombardieren (60 Treibstoff)</button><button class="alert" data-act="land" data-id="${pid}" ${!control ? 'disabled' : ''}>Truppen landen (150 Cr, 50 Tr)</button></div>`;
    if (pf.length) h += `<div class="stats">Landungstruppen: ca. ${troopStrength(pf)} · Erfolg wahrscheinlich, wenn deutlich über der Garnison. Bombardieren senkt die Garnison.</div>`;
  } else h += `<p class="muted">Unbesiedelt. (Kolonisierung folgt in einer späteren Version.)</p>`;
  h += `<div class="btns"><button data-act="deselect">Zurück zum System</button></div>`;
  return h;
}
function shipTip(t) { return { jaeger: 'stark gg. Bomber', bomber: 'stark gg. Großkampfschiffe', fregatte: 'Flak: stark gg. Jäger', zerstoerer: 'stark gg. Fregatten' }[t]; }

export function rightHtml(state, ui) {
  let h = `<h2>Flotten</h2>`;
  const mine = state.fleets.filter(f => f.owner === 'player' && (shipCount(f) || f.move));
  if (!mine.length) h += `<p class="muted">Keine Flotten. Baue Schiffe in der Raumwerft.</p>`;
  for (const f of mine) {
    const sel = ui.selectedFleet === f.id;
    const where = f.inBattle ? `<span class="red">im Gefecht in ${sysById(f.system).name}</span>` : f.move ? `<span class="amber">${sysById(f.move.from).name} → ${sysById(f.move.to).name}${f.move.path.length ? ' → … ' + sysById(f.move.path[f.move.path.length - 1]).name : ''}</span>` : `in ${sysById(f.system).name}${f.cooldown > 0 ? ` <span class="muted">(Tor-Abkühlung ${Math.ceil(f.cooldown)}s)</span>` : ''}`;
    h += `<div class="item ${sel ? 'sel' : ''}" data-act="selfleet" data-id="${f.id}"><div class="top"><b>${f.name}</b><span class="muted">Stärke ${fleetPower(f.ships)}</span></div><div class="stats">${where}</div><div class="stats">${shipsHtml(f.ships)}</div>${f.move ? `<div class="bar"><div style="width:${f.move.t / f.move.total * 100}%"></div></div>` : ''}
      ${sel ? `<div class="btns"><button data-act="split" data-id="${f.id}">Teilen</button><button data-act="merge" data-id="${f.id}">Zusammenlegen</button><button data-act="rename" data-id="${f.id}">Umbenennen</button></div><div class="stats blue">Ziel wählen: System auf der Karte anklicken → „hierher senden“.</div>` : ''}</div>`;
  }
  const threats = state.fleets.filter(f => f.owner === 'ai' && f.role === 'attack' && f.move);
  if (threats.length) h += `<h3 class="red">Bedrohungen</h3>` + threats.map(f => `<div class="item"><span class="red">${f.name}</span> <span class="muted">${shipCount(f)} Schiffe · ${sysById(f.move.from).name} → ${sysById(f.move.to).name}</span></div>`).join('');
  return h;
}

export function battleBarsHtml(b) {
  const side = (s, name, cls) => {
    let hull = 0, max = 0, sh = 0, shm = 0, n = 0; for (const u of b.units) if (u.side === s) { max += u.maxHull; shm += u.maxShield || 0; if (u.alive) { hull += Math.max(0, u.hull); sh += u.shield; n++; } }
    const total = Object.values(b.start[s]).reduce((a, c) => a + c, 0);
    return `<div class="side panel"><div style="display:flex;justify-content:space-between"><b class="${cls}">${name}</b><span>${n}/${total} Schiffe</span></div>
      <div class="stats">Hülle</div><div class="bar ${s === 'ai' ? 'red' : ''}"><div style="width:${hull / max * 100}%"></div></div>
      <div class="stats">Schilde</div><div class="bar"><div style="width:${shm ? sh / shm * 100 : 0}%;background:#9fe6ff"></div></div>
      <div class="stats">Moral ${Math.round(b.morale[s] * 100)}%</div></div>`;
  };
  return side('player', 'Deine Flotte', 'blue') + side('ai', 'Draxis-Imperium', 'red');
}

export function reportHtml(r) {
  const types = [...new Set([...Object.keys(r.start.player), ...Object.keys(r.start.ai)])];
  return `<h2>Gefechtsbericht – ${r.systemName}</h2>
    <div class="${r.winner === 'player' ? 'blue' : 'red'}" style="font-size:16px;margin:4px 0">${r.winner === 'player' ? 'SIEG' : r.retreat ? 'RÜCKZUG' : 'NIEDERLAGE'}</div>
    <div class="muted">${r.auto ? 'Automatisch ausgetragen · ' : ''}Dauer ${r.duration}s</div>
    <table><tr><th>Typ</th><th>Eigene</th><th>Verloren</th><th>Feind</th><th>Zerstört</th></tr>
    ${types.map(t => `<tr><td>${SHIPS[t].name}</td><td>${r.start.player[t] || 0}</td><td class="red">${r.lost.player[t] || 0}</td><td>${r.start.ai[t] || 0}</td><td class="blue">${r.lost.ai[t] || 0}</td></tr>`).join('')}</table>
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
export { PRIORITIES };

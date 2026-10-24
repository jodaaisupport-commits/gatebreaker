// v0.3 Imperium-Panels (Markt, Aufträge, Energie, Diplomatie, Crews) und Planetenverwaltung (Bevölkerung, Gesetze, Gouverneur)
import { LAWS, GOV_TRAITS, MARKET_BASE, RES_LABEL, ENERGY_CLASSES } from '../game/data.js';
import { housing, satTarget, storageCap, marketPrice, plunderShare, homeHeld } from '../game/empire.js';
import { rates } from '../game/sim.js';

const tip = (t, b) => ` title="${t}${b ? '\n' + b : ''}"`;
const f0 = n => Math.round(n);

export function planetPeopleHtml(state, pid) {
  const p = state.planets[pid]; if (!p || p.owner !== 'player' || !p.laws) return '';
  const cap = housing(p); const { t, why } = satTarget(state, p);
  const satCls = p.sat < 30 ? 'red' : p.sat < 50 ? 'amber' : 'blue';
  let h = `<h3>Bevölkerung & Stimmung</h3>
    <div class="item"><div class="top"><span>Bevölkerung <b>${p.pop.toFixed(1)}</b> / ${cap} Wohnraum</span>${p.strike ? '<span class="badge red">STREIK</span>' : ''}</div>
    <div class="bar"><div style="width:${Math.min(100, p.pop / cap * 100)}%"></div></div>
    <div class="top" style="margin-top:4px"><span>Zufriedenheit <b class="${satCls}">${f0(p.sat)}%</b> → Ziel ${f0(t)}%</span>${p.revolt > 0 ? `<span class="red">Revolte droht ${f0(45 - p.revolt)}s</span>` : ''}</div>
    <div class="bar ${p.sat < 30 ? 'red' : ''}"><div style="width:${p.sat}%"></div></div>
    <div class="stats">${why.join(' · ') || 'keine Einflüsse'} · Garnison ${f0(p.garrison || 0)}</div></div>`;
  h += `<h3>Gesetze</h3>`;
  for (const [k, L] of Object.entries(LAWS)) {
    h += `<div class="item"><div class="top"><span>${L.name}</span><span class="btns" style="margin:0">${Object.entries(L.opts).map(([v, txt]) => `<button data-act="law" data-id="${pid}" data-law="${k}" data-val="${v}" class="${p.laws[k] === v ? 'active' : ''}"${tip(L.name, txt)}>${txt.split(' (')[0]}</button>`).join('')}</span></div></div>`;
  }
  h += `<h3>Gouverneur</h3>`;
  if (p.governor) {
    const g = p.governor; h += `<div class="item"><div class="top"><span><b>${g.name}</b> · ${GOV_TRAITS[g.trait].name}</span><button data-act="firegov" data-id="${pid}">Entlassen</button></div>
      <div class="stats">${GOV_TRAITS[g.trait].desc} Entscheidet alle 30 s – auch offline.</div>${g.log?.length ? `<div class="stats">Zuletzt: ${g.log.join(', ')}</div>` : ''}</div>`;
  } else h += `<div class="btns">${Object.entries(GOV_TRAITS).map(([k, g]) => `<button data-act="hiregov" data-id="${pid}" data-trait="${k}"${tip(g.name, g.desc + ' · 100 Credits')}>${g.name} (100 Cr)</button>`).join('')}</div>`;
  return h;
}

export function empireHtml(state) {
  const r = rates(state); const cap = storageCap(state);
  let h = `<h2>Imperium</h2>`;
  h += `<div class="stats">Heimatwelt: ${homeHeld(state) ? '<span class="blue">gehalten (+1 Cr/s, +2 Energie, +1000 Lager)</span>' : '<span class="red">VERLOREN – Boni weg</span>'}</div>`;
  h += `<h3>Lager</h3><div class="stats">Kapazität ${cap} je Rohstoff · Plünderrisiko ${Math.round(plunderShare(state) * 100)}% bei Überfall</div>`;
  for (const k of ['erz', 'treibstoff', 'energie', 'platten', 'teile']) h += `<div class="stats">${RES_LABEL[k]} ${f0(state.res[k])}/${cap}</div><div class="bar ${state.res[k] >= cap ? 'amber' : ''}"><div style="width:${Math.min(100, state.res[k] / cap * 100)}%"></div></div>`;
  h += `<h3>Energie-Prioritäten</h3><div class="stats">Erzeugung ${r.eProd.toFixed(1)} · Verbrauch ${r.eCons.toFixed(1)} – bei Mangel wird zuerst die unterste Klasse gedrosselt.</div>`;
  state.energyPrio.forEach((c, i) => { h += `<div class="item"><div class="top"><span>${i + 1}. ${ENERGY_CLASSES[c]} <span class="muted">${r.cons[c].toFixed(1)} E · ${Math.round(r.effByClass[c] * 100)}%</span></span>${i ? `<button data-act="eprio" data-id="${c}">▲</button>` : ''}</div></div>`; });
  h += `<h3>Markt</h3><div class="stats">Preise reagieren auf Angebot & Nachfrage (Kauf hebt, Verkauf senkt).</div>`;
  for (const k of Object.keys(MARKET_BASE)) {
    const f = state.market[k]; const trend = f > 1.05 ? '<span class="red">▲</span>' : f < 0.95 ? '<span class="blue">▼</span>' : '•';
    h += `<div class="item"><div class="top"><span>${RES_LABEL[k]} ${trend} <span class="muted">${marketPrice(state, k, 'buy').toFixed(2)} / ${marketPrice(state, k, 'sell').toFixed(2)} Cr</span></span><span class="btns" style="margin:0">
      <button data-act="buy" data-id="${k}"${tip('Kaufen', `100 für ${Math.round(marketPrice(state, k, 'buy') * 100)} Cr`)}>+100</button><button data-act="sell" data-id="${k}"${tip('Verkaufen', `100 für ${Math.round(marketPrice(state, k, 'sell') * 100)} Cr`)}>−100</button></span></div></div>`;
  }
  h += `<h3>Lieferaufträge (alle 10 s)</h3>`;
  h += state.orders.map(o => `<div class="item"><div class="top"><span>${o.mode === 'sell' ? 'Verkaufe' : 'Kaufe'} ${o.amount} ${RES_LABEL[o.res]} ${o.mode === 'sell' ? 'über' : 'unter'} ${o.threshold} <span class="muted">(${o.runs}×)</span></span><button data-act="delorder" data-id="${o.id}">✕</button></div></div>`).join('') || '<div class="muted">Keine Aufträge.</div>';
  h += `<div class="btns"><select id="ord-res">${Object.keys(MARKET_BASE).map(k => `<option value="${k}">${RES_LABEL[k]}</option>`).join('')}</select>
    <select id="ord-mode"><option value="sell">verkaufen über</option><option value="buy">kaufen unter</option></select>
    <input type="text" id="ord-th" value="1000" size="5"><input type="text" id="ord-am" value="100" size="4"><button data-act="addorder">Hinzufügen</button></div>`;
  h += `<h3>Crews</h3><div class="stats">Verfügbar: <b>${Math.floor(state.crews)}</b> (Raumakademie & Wehrpflicht bilden aus). In der Flottenliste „Crew zuweisen“: +5% Schaden je Veteranenstufe (max. 5).</div>`;
  h += diploHtml(state);
  h += `<div class="btns"><button data-act="panel" data-id="main">Zurück</button></div>`;
  return h;
}

export function diploHtml(state) {
  const d = state.diplo;
  let h = `<h3>Diplomatie · Draxis</h3><div class="stats">Beziehung <b class="${d.relation < 0 ? 'red' : 'blue'}">${f0(d.relation)}</b> · ${d.treaty ? '<span class="blue">Handelsvertrag aktiv (+1,5 Cr/s, keine Angriffe)</span>' : 'kein Vertrag'}</div>`;
  if (d.log?.length) h += `<div class="stats">Warum: ${d.log.map(l => `${l.v > 0 ? '+' : ''}${l.v} ${l.why}`).join(' · ')}</div>`;
  h += `<div class="btns"><button data-act="treaty" ${d.treaty ? 'disabled' : ''}${tip('Handelsvertrag', '150 Credits · Chance steigt mit Beziehung · bricht bei Angriffen')}>Handelsvertrag anbieten (150 Cr)</button></div>`;
  return h;
}

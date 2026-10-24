// v0.4 Krieg-Panel: Truppen, Spione, Diplomatie (Frieden/Allianz), Story, Wrackforschung, Gefechts-Warteschlange
import { TROOPS, SPY_SPECS, PEACE_TERMS, STORY, AI_PERSONALITIES, RES_LABEL, RUINS } from '../game/data.js';
import { armyPower, aiPowerReal, playerPower, estimate, intelActive, relationFactors, peaceChance, personality, peace } from '../game/warfare.js';
import { techEffects, sysById, canAfford } from '../game/sim.js';

const tip = (t, b) => ` title="${t}${b ? '\n' + b : ''}"`;
const cost = c => Object.entries(c).map(([r, v]) => `${v} ${RES_LABEL[r] || r}`).join(' · ');

export function warHtml(state) {
  const fx = techEffects(state); const P = personality(state);
  let h = `<h2>Krieg & Diplomatie</h2>`;
  // Story
  const s = state.story;
  h += `<h3>Story · Die Torbauer</h3>`;
  if (s.done) h += `<div class="item done"><b class="blue">✔ Das Torherz erwacht</b><div class="stats">Torbauer-Codex aktiv: Reisen −20%, Schaden +5%.</div></div>`;
  else { const q = STORY[s.step]; h += `<div class="item"><b>${s.step + 1}/4 · ${q.title}</b><div class="stats">${q.text}</div><div class="stats muted">${q.hint} · Fragmente ${s.fragments}/3</div>${s.step === 3 ? `<div class="btns"><button data-act="gateheart">Torherz aktivieren (200 Cr, 100 Energie)</button></div>` : ''}</div>`; }
  if (s.log.length) h += `<div class="stats muted">${s.log.slice(0, 3).join(' · ')}</div>`;
  const open = Object.keys(RUINS).filter(k => !state.ruinsDone[k]).length;
  h += `<div class="stats">Unerforschte Ruinen: ${open} · laufende Expeditionen: ${state.expeditions.map(e => `${RUINS[e.planet].name} ${Math.ceil(e.remaining)}s`).join(', ') || 'keine'}</div>`;
  // Gefechts-Warteschlange
  if (state.battleQueue.length) {
    h += `<h3 class="red">Gefechts-Warteschlange</h3>` + state.battleQueue.map((b, i) => `<div class="item"><div class="top"><span>${sysById(b.system).name} – wartet</span><button data-act="resolveq" data-id="${i}">Automatisch auflösen</button></div></div>`).join('');
  }
  // Diplomatie
  const d = state.diplo; const real = aiPowerReal(state); const intel = intelActive(state, fx);
  h += `<h3>Draxis-Imperium · ${P.name}</h3><div class="stats">${P.desc}</div>`;
  h += `<div class="stats">Flottenstärke Draxis: ${intel ? `<b>${real}</b> (echt)` : `~${estimate(state, real, 999)} (geschätzt ±35%)`} · deine: ${Math.round(playerPower(state))}</div>`;
  h += `<div class="stats">Beziehung <b class="${d.relation < 0 ? 'red' : 'blue'}">${Math.round(d.relation)}</b> · Warum: ${relationFactors(state).join(' · ')}</div>`;
  if (d.log?.length) h += `<div class="stats muted">Verlauf: ${d.log.slice(0, 5).map(l => `${l.v > 0 ? '+' : ''}${l.v} ${l.why}`).join(' · ')}</div>`;
  h += `<div class="stats">${peace(state) ? `<span class="blue">Waffenruhe: ${Math.ceil(d.peaceUntil - state.time)} s</span>` : 'Kriegszustand'}${d.talkCd > 0 ? ` · nächste Verhandlung in ${Math.ceil(d.talkCd)} s` : ''}</div>`;
  h += `<div class="btns">${Object.entries(PEACE_TERMS).map(([k, T]) => `<button data-act="peace" data-id="${k}" ${peace(state) || d.talkCd > 0 ? 'disabled' : ''}${tip(T.name, T.desc + ' · 50 Cr Gesandte')}>${T.name} (${Math.round(peaceChance(state, k) * 100)}%)</button>`).join('')}</div>`;
  if (state.prisoners) h += `<div class="btns"><button data-act="release">${state.prisoners} Gefangene freilassen (+${2 * state.prisoners} Beziehung)</button></div>`;
  // Allianz
  const v = state.allies.vael;
  h += `<h3>Vael-Konsortium (neutral)</h3><div class="stats">Beziehung ${Math.round(v.relation)} · ${v.allied ? '<span class="blue">VERBÜNDET: +1 Cr/s, Verstärkung bei Angriffen</span>' : 'keine Allianz (ab Beziehung 30)'}</div>`;
  h += `<div class="btns"><button data-act="gift">Geschenk (100 Cr, +12)</button>${v.allied ? '<button data-act="leaveally">Allianz kündigen</button>' : `<button data-act="ally" ${v.relation < 30 ? 'disabled' : ''}>Allianz vorschlagen</button>`}</div>`;
  // Spione
  h += `<h3>Agenten (${state.spies.length}/4)</h3>`;
  h += state.spies.map(a => `<div class="item"><div class="top"><span><b>${a.name}</b> · ${SPY_SPECS[a.spec].name} · Stufe ${a.lvl}</span>${a.mission ? `<span class="amber">Einsatz ${Math.ceil(a.mission.remaining)}s</span>` : `<button data-act="spymission" data-id="${a.id}"${tip('Mission', SPY_SPECS[a.spec].desc + ' · 40 Cr')}>Mission (40 Cr)</button>`}</div><div class="stats">${SPY_SPECS[a.spec].desc}</div></div>`).join('') || '<div class="muted">Keine Agenten.</div>';
  h += `<div class="btns">${Object.entries(SPY_SPECS).map(([k, S]) => `<button data-act="hirespy" data-id="${k}"${tip(S.name, S.desc)}>${S.name} anwerben (120 Cr)</button>`).join('')}</div>`;
  if (intel) h += `<div class="stats blue">Aufklärung aktiv${state.intel.until > state.time ? ` (${Math.ceil(state.intel.until - state.time)} s)` : ' (Spionagenetz)'}: echte Stärken sichtbar.</div>`;
  // Bodentruppen
  h += `<h3>Bodentruppen</h3><div class="stats">Armee-Stärke ${Math.round(armyPower(state))} · zählt bei jeder Landung zusätzlich zur Flotte. Belagerung erhöht die Wirkung bis +50%.</div>`;
  for (const [k, T] of Object.entries(TROOPS)) {
    const c5 = Object.fromEntries(Object.entries(T.cost).map(([r, x]) => [r, x * 5]));
    h += `<div class="item"><div class="top"><span>${T.name} <b>${state.army[k]}</b> <span class="muted">· Kraft ${T.power}</span></span><button data-act="recruit" data-id="${k}" ${canAfford(state, c5) ? '' : 'disabled'}>+5</button></div><div class="stats">${T.desc} · ${cost(c5)}</div></div>`;
  }
  // Wrackforschung
  const need = 20 + 15 * state.wreckLvl;
  h += `<h3>Wrackforschung</h3><div class="stats">Wrackdaten ${Math.round(state.wrecks)} · Stufe ${state.wreckLvl}/5 (+4% Schaden, +3% Hülle je Stufe)</div>
    <div class="btns"><button data-act="wrecks" ${state.wrecks < need || state.wreckLvl >= 5 ? 'disabled' : ''}>Analysieren (${need} Daten, 60 Cr)</button></div>`;
  h += `<div class="btns"><button data-act="panel" data-id="main">Zurück</button></div>`;
  return h;
}

// Erzeugt docs/BALANCING.md aus den Spieldaten und einer Testsimulation (node scripts/balance.mjs).
import { writeFileSync } from 'node:fs';
import * as D from '../src/game/data.js';
import * as S from '../src/game/sim.js';
const L = [];
const fmt = c => Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ');
L.push('# Gatebreaker – Balancing-Übersicht (v0.6, grob)', '', '_Automatisch erzeugt mit `node scripts/balance.mjs` aus `src/game/data.js`. Zeiten in Spielsekunden._', '');
L.push('## Gebäude (Kosten ×1,6 und Bauzeit ×1,35 pro Stufe, Bauzeit max. 60 s)', '', '| Gebäude | Stufe 1 | Stufe 3 | Stufe 5 | Zeit 1/3/5 |', '|---|---|---|---|---|');
for (const k of Object.keys(D.BUILDINGS)) L.push(`| ${D.BUILDINGS[k].name} | ${fmt(D.buildingCost(k, 0))} | ${fmt(D.buildingCost(k, 2))} | ${fmt(D.buildingCost(k, 4))} | ${D.buildingTime(k, 0)} / ${D.buildingTime(k, 2)} / ${D.buildingTime(k, 4)} s |`);
L.push('', '## Schiffe', '', '| Schiff | Kosten | Zeit | Hülle+Schild | DPS | DPS pro 100 Erz+Cr | Tempo |', '|---|---|---|---|---|---|---|');
for (const [k, s] of Object.entries(D.SHIPS)) { if (s.drone) continue; const dps = s.dmg / s.rate; const price = (s.cost.erz || 0) + (s.cost.credits || 0);
  L.push(`| ${s.name}${s.unique ? ' (einzigartig)' : ''} | ${fmt(s.cost)} | ${s.time} s | ${s.hull}+${s.shield} | ${dps.toFixed(1)} | ${(dps / price * 100).toFixed(2)} | ${s.speed} |`); }
L.push('', '## Forschung', '', '| Technologie | Kosten | Zeit |', '|---|---|---|');
for (const [k, t] of Object.entries(D.TECHS)) L.push(`| ${t.name || k} | ${t.cost ? fmt(t.cost) : '–'} | ${t.time ?? '–'} s |`);
// Testsimulation: Einkommen ohne Eingriffe
const st = S.newGame(0, 'bergbau'); const r0 = { ...st.res }; for (let i = 0; i < 600; i++) S.tick(st, 1, { offline: true });
L.push('', '## Tempo & Bedrohung', '',
  `- Reisezeit pro Torsprung: ${D.TRAVEL_TIME} s, Tor-Abkühlung ${D.GATE_COOLDOWN} s; Offline-Fortschritt max. ${D.OFFLINE_CAP / 3600} h.`,
  '- Draxis-Angriffswellen: alle 360–540 s × Persönlichkeitsfaktor; Budget 1,4 + 0,3 × Planeten + min(3, Zeit/1200) pro s.',
  '- Draxis baut ab 15 min Spielzeit Träger und ab 30 min ein Flaggschiff (wenn das Budget über 1500 liegt).',
  '- Freibeuter: erster Überfall nach etwa 15 min, danach alle 700–1100 s, mit 2 + Zeit/1200 Jägern. Sie ignorieren Waffenruhen.',
  '- Notfallhilfe: Ohne Kampfschiffe, ohne Bauaufträge und mit weniger als 60 Erz und 40 Credits gibt es nach 90 s +400 Erz, +200 Credits und +150 Treibstoff (höchstens alle 10 min).',
  `- Startfraktion Bergbau, 10 min ohne Eingriff: ${Object.keys(r0).map(k => `${k} ${Math.round(r0[k])}→${Math.round(st.res[k])}`).join(', ')}.`,
  '', '## Beobachtungen / To-do',
  '- Jäger haben das beste DPS-pro-Kosten-Verhältnis, verlieren aber gegen Fregatten (DMG_MULT 2,0). Das ist gewollt.',
  '- Das Flaggschiff ist teuer (Credits als Engpass). Falls Tester es nie bauen, sollten die Kosten um etwa 20 % sinken.',
  '- Die Bauzeit-Obergrenze von 60 s lässt hohe Stufen günstig wirken; für die Beta beobachten.',
  '- Die erste Draxis-Welle kommt nach etwa 6–9 min. Tester sollen melden, ob das zu früh ist.');
writeFileSync(new URL('../docs/BALANCING.md', import.meta.url), L.join('\n') + '\n'); console.log('docs/BALANCING.md geschrieben');

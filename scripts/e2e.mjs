// Headless-Test: lädt den Build, prüft die Konsole, spielt den Kern-Loop durch und macht Screenshots.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const port = 4791; const wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
await wait(2500);
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'] });
const errors = []; let ok = true;
const log = (...a) => console.log('•', ...a);
const act = (page, sel) => page.evaluate(q => { const e = document.querySelector(q); if (!e) throw new Error('fehlt: ' + q); e.click(); }, sel);
const check = (cond, msg) => { console.log(cond ? '  ✔' : '  ✘', msg); if (!cond) ok = false; };
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); }); await page.reload({ waitUntil: 'networkidle0' });
  await wait(800);
  // Fraktionswahl (v0.2)
  check(await page.$('[data-act="pickfaction"]'), 'Fraktionswahl sichtbar');
  await act(page, '[data-act="pickfaction"][data-id="bergbau"]'); await wait(600);
  check(await page.evaluate(() => gb.state.faction === 'bergbau' && document.querySelector('#modal').classList.contains('hidden')), 'Bergbaukonzern gewählt, Modal zu');
  log('Ressourcen:', await page.$eval('#resources', e => e.innerText.replace(/\n/g, ' ')));
  check(await page.evaluate(() => !!document.querySelector('canvas') && gb.state.time > 0), 'Spiel läuft, Zeit tickt');
  check(await page.evaluate(() => document.body.innerText.includes('Aufträge') || document.body.innerText.includes('Erste Mine')), 'Tutorial-Auftragsliste sichtbar');
  await page.screenshot({ path: 'screenshots/01-galaxie.png' });

  // Forschungspanel
  await page.click('#btn-tech'); await wait(400);
  check(await page.evaluate(() => gb.ui.panel === 'tech' && !!document.querySelector('[data-act="research"]')), 'Forschungspanel offen');
  await page.evaluate(() => Object.assign(gb.state.res, { erz: 500, treibstoff: 200, credits: 500, energie: 100 }));
  await page.evaluate(() => { gb.Sim.actions.research(gb.state, 'eco_minen'); gb.ui.panel = 'main'; });
  await wait(300);
  check(await page.evaluate(() => gb.state.tech.queue?.id === 'eco_minen'), 'Forschung gestartet');

  // Imperium-Panel (v0.3)
  await page.click('#btn-empire'); await wait(400);
  check(await page.evaluate(() => gb.ui.panel === 'empire' && document.querySelector('#left').innerText.includes('MARKT')), 'Imperium-Panel (Markt/Lager/Energie)');
  await act(page, '[data-act="sell"][data-id="erz"]'); await wait(200);
  check(await page.evaluate(() => gb.state.market.erz < 1), 'Markt-Verkauf per Klick');
  await page.evaluate(() => { gb.ui.panel = 'main'; }); await wait(200);
  await page.click('#btn-war'); await wait(400);
  check(await page.evaluate(() => gb.ui.panel === 'war' && /STORY/i.test(document.querySelector('#left').innerText) && !!document.querySelector('[data-act="peace"]')), 'Krieg-Panel (Story/Frieden/Agenten)');
  await act(page, '[data-act="hirespy"][data-id="aufklaerung"]'); await wait(200);
  check(await page.evaluate(() => gb.state.spies.length === 1), 'Agent per Klick angeworben');
  await page.evaluate(() => { gb.ui.panel = 'main'; }); await wait(200);
  // System betreten, Werft bauen
  await act(page, '[data-act="enter"]'); await wait(600);
  check(await page.evaluate(() => gb.ui.view === 'system'), 'Systemansicht geöffnet');
  await page.evaluate(() => { gb.ui.selectedPlanet = 'helios-prime'; }); await wait(400);
  await act(page, '[data-act="build"][data-id="werft"]'); await wait(300);
  check(await page.evaluate(() => gb.state.planets['helios-prime'].queue.length === 1), 'Werft in Bauliste');
  await page.evaluate(() => { for (let i = 0; i < 20; i++) gb.Sim.tick(gb.state, 1); }); await wait(400);
  check(await page.evaluate(() => gb.state.planets['helios-prime'].buildings.werft === 1), 'Werft fertig');
  check(await page.evaluate(() => gb.state.tutorial.claimed.includes('werft')), 'Tutorial: Werft belohnt');
  check(await page.evaluate(() => document.querySelector('#left').innerText.includes('GESETZE') && !!document.querySelector('[data-act="hiregov"]')), 'Planet: Gesetze & Gouverneur sichtbar');
  await page.evaluate(() => Object.assign(gb.state.res, { erz: 5000, treibstoff: 3000, credits: 3000 })); await wait(400);
  for (const t of ['fregatte', 'bomber', 'jaeger', 'kolonie']) { await act(page, `[data-act="ship"][data-id="${t}"][data-n="5"]`); await wait(150); }
  await page.evaluate(() => { gb.Sim.tick(gb.state, 3); });
  await wait(2500);
  await page.screenshot({ path: 'screenshots/02-system-planet.png' });
  await page.evaluate(() => { for (let i = 0; i < 200; i++) gb.Sim.tick(gb.state, 1); });
  const pf = await page.evaluate(() => gb.state.fleets.find(f => f.owner === 'player').ships);
  log('Heimatflotte:', JSON.stringify(pf)); check(pf.fregatte >= 6 && pf.bomber >= 5 && (pf.kolonie || 0) >= 1, 'Schiffe inkl. Kolonie gebaut');

  // Kolonisierung Cinder (helios-b)
  await page.evaluate(() => {
    gb.ui.selectedPlanet = 'helios-b';
    gb.Sim.actions.survey(gb.state, 'helios-b');
    gb.Sim.actions.colonize(gb.state, 'helios-b');
  }); await wait(400);
  check(await page.evaluate(() => gb.state.planets['helios-b'].owner === 'player' && gb.state.planets['helios-b'].buildings), 'Kolonie gegründet mit Gebäuden');
  check(await page.evaluate(() => gb.state.tutorial.claimed.includes('kolonie')), 'Tutorial: Kolonie belohnt');

  // Flotte nach Vortex senden
  await page.keyboard.press('g'); await wait(300);
  await page.evaluate(() => { gb.ui.selectedSystem = 'vortex'; gb.ui.selectedFleet = gb.state.fleets.find(f => f.owner === 'player').id; }); await wait(400);
  await act(page, '[data-act="move"]'); await wait(1000);
  await page.screenshot({ path: 'screenshots/01b-galaxie-flotte-unterwegs.png' });
  await page.evaluate(() => { for (let i = 0; i < 14; i++) gb.Sim.tick(gb.state, 1); });
  await page.waitForFunction(() => gb.state.battle && gb.ui.view === 'battle', { timeout: 8000 });
  check(true, 'Echtzeitschlacht in ' + await page.evaluate(() => gb.state.battle.system));
  await page.click('[data-form="kugel"]'); await page.select('#prio', 'fregatte');
  check(await page.evaluate(() => gb.state.battle.settings.player.formation === 'kugel' && gb.state.battle.settings.player.priority === 'fregatte'), 'Formation/Priorität übernommen');
  // Battle ×2
  await page.click('#btn-speed'); await wait(200);
  check(await page.evaluate(() => gb.state.battleSpeed === 2), 'Schlacht-Tempo ×2');
  await wait(4000);
  await page.screenshot({ path: 'screenshots/03-schlacht.png' });
  await page.waitForFunction(() => !gb.state.battle, { timeout: 150000 });
  await wait(600);
  const rep = await page.evaluate(() => gb.state.lastReport);
  log('Bericht:', rep.winner, JSON.stringify(rep.lost), JSON.stringify(rep.salvage));
  check(await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden')), 'Gefechtsbericht angezeigt');
  await page.screenshot({ path: 'screenshots/04-bericht.png' });

  // Erobern + Gebäude auf erobertem Planeten
  await act(page, '[data-act="closemodal"]'); await page.keyboard.press('g'); await wait(200);
  await page.evaluate(() => { gb.ui.selectedSystem = 'vortex'; }); await page.keyboard.press('s'); await wait(400);
  await page.evaluate(() => { gb.ui.selectedPlanet = 'vortex-a'; }); await wait(400);
  await act(page, '[data-act="bombard"]');
  await page.evaluate(() => { for (let i = 0; i < 10; i++) gb.Sim.tick(gb.state, 1); }); await wait(400);
  await act(page, '[data-act="land"]'); await wait(800);
  const owner = await page.evaluate(() => gb.state.planets['vortex-a'].owner);
  check(owner === 'player', 'Relikt erobert (Besitzer: ' + owner + ')');
  check(await page.evaluate(() => !!gb.state.planets['vortex-a'].buildings && gb.state.planets['vortex-a'].buildings.kraftwerk >= 1), 'Eroberter Planet hat Gebäudeverwaltung');
  await page.evaluate(() => Object.assign(gb.state.res, { erz: 2000, credits: 2000, treibstoff: 500, energie: 100 })); await wait(300);
  await act(page, '[data-act="build"][data-id="mine"]'); await wait(200);
  check(await page.evaluate(() => gb.state.planets['vortex-a'].queue.some(q => q.key === 'mine')), 'Mine auf erobertem Planeten in Bauliste');
  await page.screenshot({ path: 'screenshots/05-eroberung.png' });

  // v0.5: 5-s-Rückgängig
  const q0 = await page.evaluate(() => ({ n: gb.state.planets['vortex-a'].queue.length, erz: gb.state.res.erz }));
  await act(page, '[data-act="build"][data-id="mine"]'); await wait(300);
  check(await page.evaluate(() => !!document.querySelector('#undo [data-undo]')), 'Rückgängig-Toast sichtbar');
  await act(page, '#undo [data-undo]'); await wait(300);
  const q1 = await page.evaluate(() => ({ n: gb.state.planets['vortex-a'].queue.length, erz: gb.state.res.erz }));
  check(q1.n === q0.n && Math.abs(q1.erz - q0.erz) < 5, `Bauauftrag rückgängig + erstattet (${q0.n}→${q1.n})`);
  // Einstellungen: Farbenblind, UI-Größe, Partikel
  await act(page, '#btn-settings'); await wait(300);
  await page.evaluate(() => { const c = document.querySelector('[data-set="colorblind"]'); c.checked = true; c.dispatchEvent(new Event('input')); const r = document.querySelector('[data-set="scale"]'); r.value = '1.2'; r.dispatchEvent(new Event('input')); });
  await wait(300);
  check(await page.evaluate(() => document.body.classList.contains('cb') && getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() === '1.2' && JSON.parse(localStorage.getItem('gatebreaker-settings')).colorblind), 'Farbenblind + UI-Größe gespeichert');
  await page.screenshot({ path: 'screenshots/11-einstellungen.png' });
  await page.evaluate(() => { const r = document.querySelector('[data-set="scale"]'); r.value = '1'; r.dispatchEvent(new Event('input')); }); await act(page, '[data-act="closemodal"]');
  // Suche & Springen
  await act(page, '#btn-search'); await wait(200); await page.type('#search-q', 'kepler'); await wait(200);
  const hits = await page.$$eval('#search-res .sres', e => e.length); check(hits > 0, `Suche liefert Treffer (${hits})`);
  await act(page, '#search-res .sres'); await wait(400);
  check(await page.evaluate(() => gb.ui.selectedSystem === 'kepler' && document.querySelector('#modal').classList.contains('hidden')), 'Sprung zu Kepler');
  // Träger + Flaggschiff live (Optik-Check)
  await page.evaluate(() => { const st = gb.state; const hf = st.fleets.find(f => f.owner === 'player' && !f.inBattle && !f.move); hf.ships = { traeger: 2, flaggschiff: 1, fregatte: 6, jaeger: 8 }; hf.system = 'helios';
    st.fleets.push({ id: 901, owner: 'ai', name: 'Draxis-Wacht', ships: { fregatte: 10, zerstoerer: 4, jaeger: 10 }, system: 'kepler', move: null, cooldown: 0, role: 'guard' });
    st.explored.kepler = true; gb.ui.selectedFleet = hf.id; const e = gb.Sim.actions.moveFleet(st, hf.id, 'kepler'); if (e) throw new Error(e); for (let i = 0; i < 14 && !st.battle; i++) gb.Sim.tick(st, 1); });
  await page.waitForFunction(() => gb.state.battle && gb.ui.view === 'battle', { timeout: 8000 });
  await wait(7000);
  const vis = await page.evaluate(() => ({ drones: gb.state.battle.units.filter(u => u.drone && u.alive).length, flag: gb.state.battle.units.some(u => u.type === 'flaggschiff'), mini: !!document.querySelector('#minimap') && document.querySelector('#minimap').offsetWidth > 0 }));
  log('Träger/Flaggschiff:', JSON.stringify(vis));
  check(vis.flag && vis.mini, 'Flaggschiff in Schlacht + Minikarte sichtbar');
  await page.screenshot({ path: 'screenshots/10-traeger-flaggschiff.png' });
  await page.waitForFunction(() => !gb.state.battle, { timeout: 150000 }); await wait(400);
  await page.evaluate(() => document.querySelector('[data-act="closemodal"]')?.click());

  // Offline-Fortschritt
  const before = await page.evaluate(() => { gb.state.res.erz = 200; gb.Sim.save(gb.state, localStorage, Date.now() - 3600e3); Storage.prototype.setItem = () => {}; return gb.state.res.erz; });
  await page.reload({ waitUntil: 'networkidle0' }); await wait(1200);
  log('Offline-Modal:', await page.$eval('#modal-body', e => e.innerText.replace(/\n/g, ' | ')));
  await page.screenshot({ path: 'screenshots/06-offline.png' });
  const after = await page.evaluate(() => gb.state.res.erz);
  check(after > before + 300, `Offline-Erträge (Erz ${Math.round(before)} → ${Math.round(after)})`);
  check(await page.evaluate(() => gb.state.faction === 'bergbau'), 'Fraktion nach Reload persistiert');
  // Mobile Topbar 844x390 (6 Ressourcen)
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 }); await wait(500);
  const tb = await page.evaluate(() => { const t = document.querySelector('#topbar'), r = document.querySelector('#resources'), v = document.querySelector('#views');
    const tr = t.getBoundingClientRect(); const rr = r.getBoundingClientRect(), vr = v.getBoundingClientRect();
    return { over: t.scrollWidth - t.clientWidth, res: r.children.length, overlap: rr.right > vr.left + 1, inside: vr.right <= tr.right + 1 && rr.left >= tr.left - 1, h: tr.height }; });
  console.log('• Topbar 844x390:', JSON.stringify(tb));
  check(tb.over <= 1 && !tb.overlap && tb.inside && tb.res >= 6, 'Mobile Topbar passt (844×390)');
  await page.screenshot({ path: '/tmp/gb-mobile.png' });
} catch (e) { ok = false; console.error(e); }
finally {

  console.log('\nKonsolenfehler/-warnungen:', errors.length ? errors : 'keine');
  console.log(ok && !errors.length ? 'E2E OK' : 'E2E FEHLER');
  await browser.close(); srv.kill(); process.exit(ok && !errors.length ? 0 : 1);
}

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

  // Offline-Fortschritt
  const before = await page.evaluate(() => { gb.Sim.save(gb.state, localStorage, Date.now() - 3600e3); Storage.prototype.setItem = () => {}; return gb.state.res.erz; });
  await page.reload({ waitUntil: 'networkidle0' }); await wait(1200);
  log('Offline-Modal:', await page.$eval('#modal-body', e => e.innerText.replace(/\n/g, ' | ')));
  await page.screenshot({ path: 'screenshots/06-offline.png' });
  const after = await page.evaluate(() => gb.state.res.erz);
  check(after > before + 300, `Offline-Erträge (Erz ${Math.round(before)} → ${Math.round(after)})`);
  check(await page.evaluate(() => gb.state.faction === 'bergbau'), 'Fraktion nach Reload persistiert');
} catch (e) { ok = false; console.error(e); }
finally {
  console.log('\nKonsolenfehler/-warnungen:', errors.length ? errors : 'keine');
  console.log(ok && !errors.length ? 'E2E OK' : 'E2E FEHLER');
  await browser.close(); srv.kill(); process.exit(ok && !errors.length ? 0 : 1);
}

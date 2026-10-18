// Headless-Test: lädt den Build, prüft die Konsole, spielt den Kern-Loop durch und macht Screenshots.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const port = 4791; const wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
await wait(2500);
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'] });
const errors = []; let ok = true;
const log = (...a) => console.log('•', ...a);
const check = (cond, msg) => { console.log(cond ? '  ✔' : '  ✘', msg); if (!cond) ok = false; };
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  log('Ressourcen:', await page.$eval('#resources', e => e.innerText.replace(/\n/g, ' ')));
  check(await page.evaluate(() => !!document.querySelector('canvas') && gb.state.time > 0), 'Spiel läuft, Zeit tickt');
  await page.screenshot({ path: 'screenshots/01-galaxie.png' });

  // System betreten, Heimatplanet anklicken (echter Klick auf 3D-Planet ist schwer, daher UI-Zustand), Werft bauen
  await page.click('[data-act="enter"]'); await wait(600);
  check(await page.evaluate(() => gb.ui.view === 'system'), 'Systemansicht geöffnet');
  await page.evaluate(() => { gb.ui.selectedPlanet = 'helios-prime'; }); await wait(400);
  await page.click('[data-act="build"][data-id="werft"]'); await wait(300);
  check(await page.evaluate(() => gb.state.planets['helios-prime'].queue.length === 1), 'Werft in Bauliste');
  await page.evaluate(() => { for (let i = 0; i < 20; i++) gb.Sim.tick(gb.state, 1); }); await wait(400);
  check(await page.evaluate(() => gb.state.planets['helios-prime'].buildings.werft === 1), 'Werft fertig');
  await page.evaluate(() => Object.assign(gb.state.res, { erz: 5000, treibstoff: 3000, credits: 3000 })); await wait(400);
  for (const t of ['fregatte', 'bomber', 'jaeger']) { await page.click(`[data-act="ship"][data-id="${t}"][data-n="5"]`); await wait(150); }
  await page.evaluate(() => { gb.Sim.tick(gb.state, 3); });
  await wait(2500);
  await page.screenshot({ path: 'screenshots/02-system-planet.png' });
  await page.evaluate(() => { for (let i = 0; i < 150; i++) gb.Sim.tick(gb.state, 1); });
  const pf = await page.evaluate(() => gb.state.fleets.find(f => f.owner === 'player').ships);
  log('Heimatflotte:', JSON.stringify(pf)); check(pf.fregatte >= 6 && pf.bomber >= 5, 'Schiffe gebaut');

  // Flotte nach Vortex senden
  await page.keyboard.press('g'); await wait(300);
  await page.evaluate(() => { gb.ui.selectedSystem = 'vortex'; gb.ui.selectedFleet = gb.state.fleets.find(f => f.owner === 'player').id; }); await wait(400);
  await page.click('[data-act="move"]'); await wait(1000);
  await page.screenshot({ path: 'screenshots/01b-galaxie-flotte-unterwegs.png' });
  await page.evaluate(() => { for (let i = 0; i < 14; i++) gb.Sim.tick(gb.state, 1); });
  await page.waitForFunction(() => gb.state.battle && gb.ui.view === 'battle', { timeout: 8000 });
  check(true, 'Echtzeitschlacht in ' + await page.evaluate(() => gb.state.battle.system));
  await page.click('[data-form="kugel"]'); await page.select('#prio', 'fregatte');
  check(await page.evaluate(() => gb.state.battle.settings.player.formation === 'kugel' && gb.state.battle.settings.player.priority === 'fregatte'), 'Formation/Priorität übernommen');
  await wait(5000);
  await page.screenshot({ path: 'screenshots/03-schlacht.png' });
  await page.waitForFunction(() => !gb.state.battle, { timeout: 150000 });
  await wait(600);
  const rep = await page.evaluate(() => gb.state.lastReport);
  log('Bericht:', rep.winner, JSON.stringify(rep.lost), JSON.stringify(rep.salvage));
  check(await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden')), 'Gefechtsbericht angezeigt');
  await page.screenshot({ path: 'screenshots/04-bericht.png' });

  // Erobern
  await page.click('[data-act="closemodal"]'); await page.keyboard.press('g'); await wait(200);
  await page.evaluate(() => { gb.ui.selectedSystem = 'vortex'; }); await page.keyboard.press('s'); await wait(400);
  await page.evaluate(() => { gb.ui.selectedPlanet = 'vortex-a'; }); await wait(400);
  await page.click('[data-act="bombard"]');
  await page.evaluate(() => { for (let i = 0; i < 10; i++) gb.Sim.tick(gb.state, 1); }); await wait(400);
  await page.click('[data-act="land"]'); await wait(800);
  const owner = await page.evaluate(() => gb.state.planets['vortex-a'].owner);
  check(owner === 'player', 'Relikt erobert (Besitzer: ' + owner + ')');
  await page.screenshot({ path: 'screenshots/05-eroberung.png' });

  // Offline-Fortschritt: Spielstand 1h in die Vergangenheit datieren, Speichern danach blockieren, neu laden
  const before = await page.evaluate(() => { gb.Sim.save(gb.state, localStorage, Date.now() - 3600e3); Storage.prototype.setItem = () => {}; return gb.state.res.erz; });
  await page.reload({ waitUntil: 'networkidle0' }); await wait(1200);
  log('Offline-Modal:', await page.$eval('#modal-body', e => e.innerText.replace(/\n/g, ' | ')));
  await page.screenshot({ path: 'screenshots/06-offline.png' });
  const after = await page.evaluate(() => gb.state.res.erz);
  check(after > before + 300, `Offline-Erträge (Erz ${Math.round(before)} → ${Math.round(after)})`);
} catch (e) { ok = false; console.error(e); }
finally {
  console.log('\nKonsolenfehler/-warnungen:', errors.length ? errors : 'keine');
  console.log(ok && !errors.length ? 'E2E OK' : 'E2E FEHLER');
  await browser.close(); srv.kill(); process.exit(ok && !errors.length ? 0 : 1);
}

import { readFileSync } from 'node:fs';
// Touch-Test im Handy-Querformat (Emulation): Tippen, Doppeltippen, Ein-Finger-Drehen, Pinch-Zoom.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const wait = ms => new Promise(r => setTimeout(r, ms)); const port = 4792;
const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'pipe' }); await wait(2500);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = []; let ok = true; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) ok = false; };
try {
  const p = await b.newPage();
  await p.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  p.on('console', m => { if (['error', 'warn'].includes(m.type())) errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' }); await p.evaluate(x => { localStorage.clear(); localStorage.setItem('gatebreaker-consent', JSON.stringify({ terms: 1, analytics: false })); localStorage.setItem('gatebreaker-invite', x); }, JSON.parse(readFileSync(new URL('../src/app/inviteHashes.json', import.meta.url))).hashes[0]); await p.reload({ waitUntil: 'networkidle0' }); await wait(800);
  await p.waitForSelector('[data-act="pickfaction"]');
  await p.click('[data-act="pickfaction"][data-id="militar"]'); await wait(600);
  const cdp = await p.createCDPSession();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await wait(40); await touch('touchEnd', []); };
  check(await p.evaluate(() => document.body.classList.contains('touch')), 'Touch-Modus erkannt');
  // Bildschirmposition von Kepler ermitteln
  const pos = id => p.evaluate(id => { const v = gb.R.views[gb.R.view]; const m = v.sys[id].mesh; const w = m.getWorldPosition(m.position.clone().set(0,0,0)).project(v.cam); return [(w.x + 1) / 2 * innerWidth, (1 - w.y) / 2 * innerHeight]; }, id);
  const [hx, hy] = await pos('helios');
  await tap(hx, hy); await wait(300);
  check(await p.evaluate(() => gb.ui.selectedSystem === 'helios' && gb.ui.view === 'galaxy'), 'Tippen wählt System');
  await p.screenshot({ path: 'screenshots/08-mobil-galaxie.png' });
  // Ein-Finger-Drehen
  const camBefore = await p.evaluate(() => gb.R.views.galaxy.cam.position.toArray());
  await touch('touchStart', [[420, 250]]); for (let i = 1; i <= 10; i++) { await touch('touchMove', [[420 + i * 15, 250]]); await wait(16); } await touch('touchEnd', []); await wait(600);
  const camRot = await p.evaluate(() => gb.R.views.galaxy.cam.position.toArray());
  check(Math.hypot(camRot[0] - camBefore[0], camRot[2] - camBefore[2]) > 5, 'Ein-Finger-Drehen bewegt Kamera');
  check(await p.evaluate(() => gb.ui.selectedSystem === 'helios'), 'Wischen löst keine Auswahl aus');
  // Pinch-Zoom
  const dist = () => p.evaluate(() => { const v = gb.R.views.galaxy; return v.cam.position.distanceTo(v.ctl.target); });
  const d0 = await dist();
  await touch('touchStart', [[380, 200], [460, 200]]); for (let i = 1; i <= 10; i++) { await touch('touchMove', [[380 - i * 12, 200], [460 + i * 12, 200]]); await wait(16); } await touch('touchEnd', []); await wait(600);
  const d1 = await dist(); check(d1 < d0 * 0.9, `Pinch-Zoom (Abstand ${d0.toFixed(0)} → ${d1.toFixed(0)})`);
  check(await p.evaluate(() => gb.ui.view === 'galaxy'), 'Pinch löst kein Doppeltippen aus');
  // Doppeltippen auf Helios = betreten
  const [hx2, hy2] = await pos('helios');
  await tap(hx2, hy2); await wait(120); await tap(hx2, hy2); await wait(600);
  check(await p.evaluate(() => gb.ui.view === 'system'), 'Doppeltippen betritt System');
  // Planet antippen
  const pp = await p.evaluate(() => { const v = gb.R.views.system; const pl = v.planets.find(x => x.def.id === 'helios-prime'); const w = pl.mesh.getWorldPosition(pl.mesh.position.clone()).project(v.cam); return [(w.x + 1) / 2 * innerWidth, (1 - w.y) / 2 * innerHeight]; });
  await tap(pp[0], pp[1]); await wait(500);
  check(await p.evaluate(() => gb.ui.selectedPlanet === 'helios-prime'), 'Tippen wählt Planet');
  await p.screenshot({ path: 'screenshots/09-mobil-planet.png' });
  // Panel-Button per Tap
  const bb = await p.$eval('[data-act="build"][data-id="mine"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await tap(bb[0], bb[1]); await wait(400);
  check(await p.evaluate(() => gb.state.planets['helios-prime'].queue.length === 1), 'Bau-Button per Tippen');
} catch (e) { ok = false; console.error(e); }
finally { console.log('Konsolenfehler:', errs.length ? errs : 'keine'); console.log(ok && !errs.length ? 'TOUCH OK' : 'TOUCH FEHLER'); await b.close(); srv.kill(); process.exit(ok && !errs.length ? 0 : 1); }

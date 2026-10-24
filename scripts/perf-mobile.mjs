// Mobile-Leistung: 844x390, Touch, 4x CPU-Drosselung; misst FPS in Galaxie/System/Schlacht und die Auto-Qualitätsstufe.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const h = JSON.parse(readFileSync(new URL('../src/app/inviteHashes.json', import.meta.url))).hashes[0];
await p.goto('http://localhost:4791/'); await p.evaluate(x => { localStorage.clear(); localStorage.setItem('gatebreaker-consent', JSON.stringify({ terms: 1, analytics: false })); localStorage.setItem('gatebreaker-invite', x); }, h);
await p.reload({ waitUntil: 'networkidle0' }); await wait(500); await p.evaluate(() => document.querySelector('[data-act="pickfaction"]').click());
const cdp = await p.target().createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE || 4) });
const measure = async (name, ms = 8000) => { await wait(ms); const r = await p.evaluate(() => ({ fps: Math.round(gb.perf.fps), q: gb.perf.level })); console.log(`• ${name}: ${r.fps} FPS, Qualität ${r.q}`); return r; };
const res = {}; res.galaxie = await measure('Galaxie');
await p.evaluate(() => { gb.ui.selectedSystem = 'helios'; gb.setView('system'); }); res.system = await measure('System');
await p.evaluate(() => { const st = gb.state; const hf = st.fleets.find(f => f.owner === 'player'); hf.ships = { jaeger: 20, fregatte: 10, traeger: 2, flaggschiff: 1 }; hf.move = { from: 'helios', to: 'vortex', t: 11.9, total: 12, path: [] }; });
res.schlacht = await measure('Schlacht', 10000);
await p.screenshot({ path: 'screenshots/25-mobil-schlacht.png' });
console.log(JSON.stringify(res), errs.length ? errs : 'keine Fehler'); await b.close();

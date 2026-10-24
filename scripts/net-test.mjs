// Lokaler Test: Beta-Server + src/net-Client (Login per Einladungscode, Cloud-Save/-Load, Fehlerfälle).
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createRequire } from 'node:module';
const salt = 'gatebreaker-beta-v1:';
process.env.INVITE_HASHES = createHash('sha256').update(salt + 'GB-TEST-LOCAL-ONLY').digest('hex'); // nur in diesem Testprozess gültig
process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'gbnet-')), 'db.json');
const WS = createRequire(new URL('../server/package.json', import.meta.url))('ws');
const { start } = await import('../server/index.mjs');
const { NetClient } = await import('../src/net/client.js');
const S = await import('../src/game/sim.js');
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) fails++; };
const wss = start(0); await new Promise(r => wss.on('listening', r)); const url = `ws://localhost:${wss.address().port}`;
try {
  const a = await new NetClient(url, { WebSocketImpl: WS }).connect();
  let e = null; try { await a.loadCloud(); } catch (x) { e = x; } ok(e?.message === 'Nicht angemeldet.', 'Cloud-Load ohne Login abgelehnt');
  e = null; try { await a.login('GB-FALSCH-0000-0000'); } catch (x) { e = x; } ok(e?.message === 'Ungültiger Einladungscode.', 'falscher Einladungscode abgelehnt');
  const r = await a.login(' gb-test-local-only '); ok(r.token && r.player, 'Login mit Einladungscode (normalisiert)');
  ok((await a.loadCloud()) === null, 'noch kein Cloud-Save');
  const st = S.newGame(0, 'militar'); st.res.erz = 4242;
  const sv = await a.saveCloud(st, '0.6.0'); ok(sv.savedAt > 0, 'Cloud-Save gespeichert');
  e = null; try { await a.saveCloud({ ...st, fleets: 'kaputt' }, '0.6.0'); } catch (x) { e = x; } ok(/ungültig/.test(e?.message || ''), 'ungültiger Save abgelehnt');
  a.close();
  const b = await new NetClient(url, { WebSocketImpl: WS }).connect(); await b.resume(r.token);
  const got = await b.loadCloud(); ok(got?.state?.res?.erz === 4242 && got.gameVersion === '0.6.0', 'Resume per Token + Cloud-Load auf zweitem Gerät');
  const r2 = await b.login('GB-TEST-LOCAL-ONLY'); ok(r2.player === r.player, 'gleicher Code = gleiches Konto');
  e = null; try { await new NetClient(url, { WebSocketImpl: WS }).connect().then(c => c.resume(r.token)); } catch (x) { e = x; } ok(e?.message === 'Sitzung abgelaufen.', 'altes Token nach Neu-Login ungültig');
  b.close();
} catch (x) { console.error(x); fails++; }
wss.close(); console.log(fails ? 'NET FEHLER' : 'NET OK'); process.exit(fails ? 1 : 0);

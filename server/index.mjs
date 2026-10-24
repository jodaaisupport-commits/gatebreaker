// Gatebreaker – optionales autoritatives Server-Skelett (v0.5, nicht deployt).
// Nutzt dieselbe, DOM-freie Spiellogik wie der Client (src/game/sim.js).
// Protokoll (JSON über WebSocket):
//   C→S {t:'hello', token?}            S→C {t:'welcome', player, state}
//   C→S {t:'act', name, args:[...]}    S→C {t:'ack', seq, err|null}
//   S→C {t:'snap', time, state} (alle 2 s)  S→C {t:'events', list}
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import * as Sim from '../src/game/sim.js';

const PORT = +process.env.PORT || 8787;
const TICK = 0.1, SNAP_EVERY = 20;
// Nur diese Aktionen dürfen Clients auslösen (Server bleibt autoritativ)
const ALLOWED = new Set(['build', 'buildShip', 'undoOrder', 'moveFleet', 'splitFleet', 'mergeFleets', 'research', 'setLaw', 'trade', 'survey', 'colonize', 'bombard', 'landTroops', 'setBattleSettings', 'retreat', 'proposeTreaty', 'hireSpy', 'spyMission', 'recruitTroops', 'peaceTalks']);

let db = null;
if (process.env.DATABASE_URL) {
  try { const { default: pg } = await import('pg'); db = new pg.Pool({ connectionString: process.env.DATABASE_URL }); console.log('Postgres verbunden'); }
  catch (e) { console.warn('pg nicht verfügbar, ohne Persistenz:', e.message); }
}
async function loadEmpire(player) { if (!db) return null; const r = await db.query('select state from saves where player_id=$1', [player]); return r.rows[0]?.state || null; }
async function saveEmpire(player, state) { if (!db) return; await db.query('insert into saves(player_id, state, updated_at) values($1,$2,now()) on conflict (player_id) do update set state=excluded.state, updated_at=now()', [player, state]); }

const sessions = new Map(); // player -> { state, sockets:Set }
async function session(player) {
  let s = sessions.get(player); if (s) return s;
  const saved = await loadEmpire(player); const store = { getItem: () => saved ? JSON.stringify(saved) : null, setItem() {} };
  const state = saved ? Sim.load(store).state : Sim.newGame();
  s = { state, sockets: new Set(), n: 0 }; sessions.set(player, s); return s;
}
setInterval(() => {
  for (const [player, s] of sessions) {
    Sim.tick(s.state, TICK); // Kämpfe laufen serverseitig mit
    if (s.state.events.length) { broadcast(s, { t: 'events', list: s.state.events }); s.state.events.length = 0; }
    if (++s.n % SNAP_EVERY === 0) broadcast(s, { t: 'snap', time: Date.now(), state: s.state });
    if (s.n % 300 === 0) saveEmpire(player, s.state).catch(e => console.warn(e.message));
  }
}, TICK * 1000);
function broadcast(s, msg) { const d = JSON.stringify(msg); for (const ws of s.sockets) if (ws.readyState === 1) ws.send(d); }

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', ws => {
  let player = null, sess = null;
  ws.on('message', async raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') { player = String(m.token || randomUUID()).slice(0, 64); sess = await session(player); sess.sockets.add(ws); ws.send(JSON.stringify({ t: 'welcome', player, state: sess.state })); return; }
    if (!sess) return;
    if (m.t === 'act') {
      if (!ALLOWED.has(m.name)) return ws.send(JSON.stringify({ t: 'ack', seq: m.seq, err: 'Aktion nicht erlaubt.' }));
      const err = Sim.actions[m.name](sess.state, ...(Array.isArray(m.args) ? m.args.slice(0, 6) : []));
      ws.send(JSON.stringify({ t: 'ack', seq: m.seq, err: err || null }));
    }
  });
  ws.on('close', () => { sess?.sockets.delete(ws); if (sess && !sess.sockets.size) saveEmpire(player, sess.state).catch(() => {}); });
});
console.log(`Gatebreaker-Server auf ws://localhost:${PORT}`);

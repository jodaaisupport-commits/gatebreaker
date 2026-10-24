// Gatebreaker Beta-Server (v0.6) – Login per Einladungscode + Cloud-Saves. NICHT deployt.
// Speicher: Postgres (DATABASE_URL, Schema server/schema.sql) oder lokale JSON-Datei (DATA_FILE, Standard server/data/db.json).
// Protokoll (JSON über WebSocket, jede Anfrage mit seq, Antwort mit gleicher seq und err|null):
//   {t:'login', code}            -> {player, token}       (ein Konto pro Einladungscode)
//   {t:'resume', token}          -> {player}
//   {t:'cloudSave', state, gameVersion} -> {savedAt}
//   {t:'cloudLoad'}              -> {save:{state, gameVersion, savedAt}|null}
//   {t:'ping'}                   -> {pong}
import { WebSocketServer } from 'ws';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateSave, migrateSave } from '../src/game/saveio.js';

const invites = JSON.parse(readFileSync(new URL('../src/app/inviteHashes.json', import.meta.url)));
const extra = (process.env.INVITE_HASHES || '').split(',').filter(Boolean); // zusätzliche Hashes per ENV
const HASHES = new Set([...invites.hashes, ...extra]);
const PORT = +process.env.PORT || 8787, MAX_SAVE = 2 * 1024 * 1024, RATE = 20;
const sha = s => createHash('sha256').update(s).digest('hex');
const norm = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '');

// ---------- Speicher ----------
function fileStore(file) {
  mkdirSync(dirname(file), { recursive: true });
  let db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { players: {}, tokens: {}, saves: {} };
  const flush = () => { writeFileSync(file + '.tmp', JSON.stringify(db)); renameSync(file + '.tmp', file); };
  return {
    async playerByInvite(h) { return Object.values(db.players).find(p => p.invite === h) || null; },
    async createPlayer(h) { const id = randomBytes(8).toString('hex'); db.players[id] = { id, invite: h, created: Date.now() }; flush(); return db.players[id]; },
    async setToken(id, th) { for (const k in db.tokens) if (db.tokens[k] === id) delete db.tokens[k]; db.tokens[th] = id; flush(); },
    async playerByToken(th) { const id = db.tokens[th]; return id ? db.players[id] : null; },
    async save(id, state, gv) { db.saves[id] = { state, gameVersion: gv, savedAt: Date.now() }; flush(); return db.saves[id].savedAt; },
    async load(id) { return db.saves[id] || null; },
  };
}
async function pgStore(url) {
  const { default: pg } = await import('pg'); const pool = new pg.Pool({ connectionString: url });
  const q = (s, a) => pool.query(s, a).then(r => r.rows);
  return {
    async playerByInvite(h) { return (await q('select * from players where invite_hash=$1', [h]))[0] || null; },
    async createPlayer(h) { const id = randomBytes(8).toString('hex'); await q('insert into players(id, invite_hash) values($1,$2)', [id, h]); return { id }; },
    async setToken(id, th) { await q('update players set token_hash=$2, last_seen=now() where id=$1', [id, th]); },
    async playerByToken(th) { return (await q('select * from players where token_hash=$1', [th]))[0] || null; },
    async save(id, state, gv) { await q('insert into saves(player_id, version, state, game_version, updated_at) values($1,$2,$3,$4,now()) on conflict (player_id) do update set version=excluded.version, state=excluded.state, game_version=excluded.game_version, updated_at=now()', [id, state.version || 0, state, gv]); return Date.now(); },
    async load(id) { const r = (await q('select state, game_version, updated_at from saves where player_id=$1', [id]))[0]; return r ? { state: r.state, gameVersion: r.game_version, savedAt: +r.updated_at } : null; },
  };
}
const store = process.env.DATABASE_URL ? await pgStore(process.env.DATABASE_URL) : fileStore(process.env.DATA_FILE || new URL('./data/db.json', import.meta.url).pathname);

// ---------- Handler ----------
const handlers = {
  async ping() { return { pong: Date.now() }; },
  async login(m, c) {
    const h = sha(invites.salt + norm(m.code)); if (!HASHES.has(h)) throw new Error('Ungültiger Einladungscode.');
    const p = (await store.playerByInvite(h)) || (await store.createPlayer(h));
    const token = randomBytes(24).toString('hex'); await store.setToken(p.id, sha(token)); c.player = p.id; return { player: p.id, token };
  },
  async resume(m, c) { const p = await store.playerByToken(sha(String(m.token || ''))); if (!p) throw new Error('Sitzung abgelaufen.'); c.player = p.id; return { player: p.id }; },
  async cloudSave(m, c) {
    if (!c.player) throw new Error('Nicht angemeldet.'); const st = m.state;
    if (JSON.stringify(st).length > MAX_SAVE) throw new Error('Spielstand zu groß.');
    try { migrateSave(st); } catch (e) { throw new Error('Migration fehlgeschlagen: ' + e.message); }
    const errs = validateSave(st); if (errs.length) throw new Error('Spielstand ungültig: ' + errs.join(', '));
    return { savedAt: await store.save(c.player, st, String(m.gameVersion || '?').slice(0, 20)) };
  },
  async cloudLoad(m, c) { if (!c.player) throw new Error('Nicht angemeldet.'); return { save: await store.load(c.player) }; },
};

export function start(port = PORT) {
  const wss = new WebSocketServer({ port, maxPayload: MAX_SAVE + 4096 });
  wss.on('connection', ws => {
    const c = { player: null, win: Date.now(), n: 0 };
    ws.on('message', async raw => {
      const now = Date.now(); if (now - c.win > 1000) { c.win = now; c.n = 0; } if (++c.n > RATE) return ws.send(JSON.stringify({ err: 'Zu viele Anfragen.' }));
      let m; try { m = JSON.parse(raw); } catch { return; }
      const h = handlers[m?.t]; if (!h) return ws.send(JSON.stringify({ seq: m?.seq, err: 'Unbekannte Anfrage.' }));
      try { ws.send(JSON.stringify({ seq: m.seq, err: null, ...(await h(m, c)) })); } catch (e) { ws.send(JSON.stringify({ seq: m.seq, err: e.message })); }
    });
  });
  return wss;
}
if (import.meta.url === `file://${process.argv[1]}`) { start(); console.log(`Gatebreaker-Beta-Server auf ws://localhost:${PORT} (${process.env.DATABASE_URL ? 'Postgres' : 'JSON-Datei'})`); }

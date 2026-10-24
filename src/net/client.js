// Netzwerk-Client für den optionalen Beta-Server (Login per Einladungscode, Cloud-Saves).
// Läuft im Browser (globales WebSocket) und in Node (WebSocketImpl aus 'ws' übergeben).
export class NetClient {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, timeout = 8000 } = {}) { this.url = url; this.WS = WebSocketImpl; this.timeout = timeout; this.seq = 0; this.pending = new Map(); this.token = null; this.player = null; this.onPush = null; }
  connect() {
    return new Promise((res, rej) => {
      const ws = new this.WS(this.url); this.ws = ws; const t = setTimeout(() => rej(new Error('Zeitüberschreitung beim Verbinden')), this.timeout);
      ws.onopen = () => { clearTimeout(t); res(this); };
      ws.onerror = e => { clearTimeout(t); rej(new Error('Verbindung fehlgeschlagen' + (e?.message ? ': ' + e.message : ''))); };
      ws.onclose = () => { for (const [, p] of this.pending) p.rej(new Error('Verbindung geschlossen')); this.pending.clear(); };
      ws.onmessage = ev => { let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
        const p = m.seq != null && this.pending.get(m.seq); if (p) { this.pending.delete(m.seq); m.err ? p.rej(new Error(m.err)) : p.res(m); } else this.onPush?.(m); };
    });
  }
  request(t, body = {}) {
    return new Promise((res, rej) => { const seq = ++this.seq; const timer = setTimeout(() => { this.pending.delete(seq); rej(new Error('Zeitüberschreitung')); }, this.timeout);
      this.pending.set(seq, { res: v => { clearTimeout(timer); res(v); }, rej: e => { clearTimeout(timer); rej(e); } });
      this.ws.send(JSON.stringify({ t, seq, ...body })); });
  }
  async login(code) { const r = await this.request('login', { code }); this.token = r.token; this.player = r.player; return r; }
  async resume(token) { const r = await this.request('resume', { token }); this.token = token; this.player = r.player; return r; }
  async saveCloud(state, gameVersion) { const { events, ...rest } = state; return this.request('cloudSave', { state: rest, gameVersion }); }
  async loadCloud() { const r = await this.request('cloudLoad'); return r.save; }
  close() { this.ws?.close(); }
}

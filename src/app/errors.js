// Globaler Fehlerfang, lokales Fehlerlog (Ringpuffer), optionaler Sentry-Hook.
import { VERSION } from './version.js';
const KEY = 'gatebreaker-errors', MAX = 50;
let listener = null;
export function getErrors() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function clearErrors() { localStorage.removeItem(KEY); }
export function logError(err, ctx = '') {
  const e = { at: new Date().toISOString(), v: VERSION, ctx, msg: String(err?.message || err).slice(0, 300), stack: String(err?.stack || '').split('\n').slice(0, 6).join('\n') };
  try { const l = getErrors(); l.push(e); localStorage.setItem(KEY, JSON.stringify(l.slice(-MAX))); } catch { /* Speicher voll */ }
  try { window.Sentry?.captureException?.(err); } catch { /* egal */ }
  listener?.(e); return e;
}
export function installErrorHandlers(onError) {
  listener = onError;
  addEventListener('error', ev => logError(ev.error || ev.message, 'window.onerror'));
  addEventListener('unhandledrejection', ev => logError(ev.reason, 'promise'));
  const dsn = import.meta.env?.VITE_SENTRY_DSN;
  if (dsn) initSentry(dsn);
}
// Nur aktiv, wenn beim Build VITE_SENTRY_DSN gesetzt ist. Lädt das offizielle CDN-Bundle.
function initSentry(dsn) {
  const s = document.createElement('script'); s.src = 'https://browser.sentry-cdn.com/8.35.0/bundle.min.js'; s.crossOrigin = 'anonymous';
  s.onload = () => window.Sentry?.init({ dsn, release: 'gatebreaker@' + VERSION, tracesSampleRate: 0, sendDefaultPii: false });
  document.head.appendChild(s);
}

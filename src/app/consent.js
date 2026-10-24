// Einwilligung (Beta-Bedingungen Pflicht, Analytics opt-in) + lokale Analytics (verlässt nie das Gerät).
const KEY = 'gatebreaker-consent', AKEY = 'gatebreaker-analytics', TERMS_VERSION = 1;
export function getConsent() { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.terms === TERMS_VERSION ? c : null; } catch { return null; } }
export function setConsent(analytics) { const c = { terms: TERMS_VERSION, analytics: !!analytics, at: new Date().toISOString() }; localStorage.setItem(KEY, JSON.stringify(c)); if (!analytics) localStorage.removeItem(AKEY); return c; }
export function getAnalytics() { try { return JSON.parse(localStorage.getItem(AKEY) || '{}'); } catch { return {}; } }
export function track(name, n = 1) { if (!getConsent()?.analytics) return; const a = getAnalytics(); a[name] = (a[name] || 0) + n; localStorage.setItem(AKEY, JSON.stringify(a)); }

// Feedback ohne Backend: Datei-Download, mailto oder vorausgefülltes GitHub-Issue.
import { VERSION, REPO } from './version.js';
import { getErrors } from './errors.js';
import { getAnalytics, getConsent } from './consent.js';
export const FEEDBACK_MAIL = 'beta@example.invalid'; // PLATZHALTER: echte Adresse eintragen
export function buildReport(text, state, extra = {}) {
  const { events, ...snap } = state || {};
  return { kind: 'gatebreaker-feedback', version: VERSION, at: new Date().toISOString(), text, ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    errors: getErrors().slice(-15), analytics: getConsent()?.analytics ? getAnalytics() : undefined, ...extra, save: extra.includeSave === false ? undefined : snap };
}
export function download(name, content, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function summary(r) { return `${r.text}\n\n---\nVersion: ${r.version}\nGerät: ${r.ua}\nBildschirm: ${r.screen}\nFehler (letzte): ${r.errors.slice(-3).map(e => e.msg).join(' | ') || 'keine'}\n(Save-Snapshot bitte als Datei anhängen)`; }
export function mailtoUrl(r) { return `mailto:${FEEDBACK_MAIL}?subject=${encodeURIComponent('Gatebreaker Beta-Feedback ' + r.version)}&body=${encodeURIComponent(summary(r).slice(0, 1800))}`; }
export function issueUrl(r) { return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent('[Beta ' + r.version + '] ' + r.text.split('\n')[0].slice(0, 70))}&labels=beta&body=${encodeURIComponent(summary(r).slice(0, 4000))}`; }

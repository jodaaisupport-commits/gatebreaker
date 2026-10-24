// Beta-Einladungscodes – BEWUSST SCHWACHE, rein clientseitige Sperre (siehe docs/BETA.md):
// Nur SHA-256-Hashes liegen im Code; wer den Code ändert oder localStorage setzt, kommt trotzdem rein.
import data from './inviteHashes.json';
const KEY = 'gatebreaker-invite';
export const normalize = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function checkInvite(code) { const h = await sha256(data.salt + normalize(code)); return data.hashes.includes(h) ? h : null; }
export function unlocked() { const h = localStorage.getItem(KEY); return !!h && data.hashes.includes(h); }
export function unlock(hash) { localStorage.setItem(KEY, hash); }
export function inviteCode() { return sessionStorage.getItem('gatebreaker-invite-code') || ''; }

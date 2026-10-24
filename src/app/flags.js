// Feature-Flags: Standardwerte im Code, überschreibbar per public/flags.json (ohne Neubau änderbar) und lokal im Debug-Panel.
export const DEFAULT_FLAGS = { inviteGate: true, feedback: true, updateCheck: true, debugPanel: true, autoQuality: true, cloudSaves: false, cloudUrl: '', pirates: true, minimap: true };
export const flags = { ...DEFAULT_FLAGS };
const LKEY = 'gatebreaker-flags-local';
export function localOverrides() { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch { return {}; } }
export function setLocalFlag(k, v) { const o = localOverrides(); o[k] = v; localStorage.setItem(LKEY, JSON.stringify(o)); flags[k] = v; }
export async function loadFlags() {
  try { const r = await fetch('./flags.json', { cache: 'no-store' }); if (r.ok) Object.assign(flags, await r.json()); } catch { /* offline: Standardwerte */ }
  Object.assign(flags, localOverrides()); return flags;
}

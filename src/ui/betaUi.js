// Beta-Oberflächen: Zugang (Einwilligung + Einladung), Sieg/Niederlage, Feedback, Changelog, Spielstand, Debug.
import { VERSION, BUILD_TIME } from '../app/version.js';
import changelogMd from '../../PROGRESS.md?raw';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const legal = `<p class="muted legal"><a href="./datenschutz.html" target="_blank">Datenschutz</a> · <a href="./impressum.html" target="_blank">Impressum</a> · <a href="./beta-bedingungen.html" target="_blank">Beta-Bedingungen</a></p>`;
export function consentHtml() {
  return `<h2>Willkommen zur Gatebreaker-Beta</h2>
  <p>Version ${VERSION}. Diese geschlossene Testversion speichert Spielstand und Einstellungen <b>nur lokal</b> auf deinem Gerät.</p>
  <label class="set"><input type="checkbox" id="c-terms"> Ich akzeptiere die <a href="./beta-bedingungen.html" target="_blank">Beta-Bedingungen</a> und habe die <a href="./datenschutz.html" target="_blank">Datenschutzerklärung</a> gelesen. (erforderlich)</label>
  <label class="set"><input type="checkbox" id="c-analytics"> Lokale Nutzungsstatistik erlauben (bleibt auf dem Gerät, optional)</label>
  <button id="c-ok" disabled>Weiter</button>${legal}`;
}
export function inviteHtml(err = '') {
  return `<h2>Einladungscode</h2><p>Die Beta ist nur mit Einladung spielbar.</p>
  <input id="inv-code" placeholder="GB-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false">
  <p class="red" id="inv-err">${esc(err)}</p><button id="inv-ok">Freischalten</button>${legal}`;
}
export function endscreenHtml(kind, st) {
  const mins = Math.round(st.time / 60); const planets = Object.values(st.planets).filter(p => p.owner === 'player').length;
  if (kind === 'victory') return `<div class="endscreen win"><h2>SIEG</h2><p>Das Draxis-Imperium ist gefallen. Die Galaxis gehört dir.</p>
    <p class="muted">Spielzeit ${mins} min · ${planets} Planeten · ${st.ai.waves || 0} abgewehrte Wellen</p>
    <button data-act="closemodal">Weiterspielen (Endlos)</button> <button data-act="newgame">Neues Spiel</button> <button data-act="feedback">Feedback geben</button></div>`;
  return `<div class="endscreen lose"><h2>NIEDERLAGE</h2><p>Du hast alle Planeten verloren.</p><p class="muted">Spielzeit ${mins} min</p>
    <button data-act="exile">Exil-Neustart (weiterspielen)</button> <button data-act="restorebackup">Backup laden</button> <button data-act="newgame">Neues Spiel</button></div>`;
}
export function feedbackHtml() {
  return `<h2>Feedback / Fehler melden</h2><p class="muted">Version ${VERSION}. Mitgeschickt werden: Text, Version, Gerät, die letzten Fehler und (optional) ein Snapshot des Spielstands.</p>
  <textarea id="fb-text" rows="6" placeholder="Was ist passiert? Was hast du erwartet?"></textarea>
  <label class="set"><input type="checkbox" id="fb-save" checked> Spielstand-Snapshot anhängen</label>
  <div class="row"><button data-act="fb-download">⬇ Bericht als Datei</button> <button data-act="fb-mail">✉ Per E-Mail</button> <button data-act="fb-issue">GitHub-Issue</button></div>
  <p class="muted">Tipp: Datei herunterladen und an die E-Mail oder das Issue anhängen. GitHub-Issues sind öffentlich.</p><button data-act="closemodal">Schließen</button>`;
}
export function mdToHtml(md) {
  return md.split('\n').map(l => l.startsWith('## ') ? `<h3>${esc(l.slice(3))}</h3>` : l.startsWith('# ') ? '' : l.startsWith('- ') ? `<li>${esc(l.slice(2))}</li>` : l.trim() ? `<p>${esc(l)}</p>` : '').join('');
}
export function changelogHtml() {
  const parts = changelogMd.split(/\n(?=## )/).filter(p => p.startsWith('## ')).reverse().join('\n');
  return `<h2>Changelog · v${VERSION}</h2><div class="changelog">${mdToHtml(parts)}</div><button data-act="closemodal">Schließen</button>`;
}
export function saveMenuHtml(info) {
  return `<h2>Spielstand</h2><p class="muted">Autosave alle 5 s · Backup-Slot alle 60 s${info.backupAt ? ` (letztes Backup ${new Date(info.backupAt).toLocaleTimeString('de-DE')})` : ''} · Save-Version ${info.saveVersion}</p>
  <div class="row"><button data-act="export">⬇ Exportieren (.json)</button> <label class="btnlike">⬆ Importieren<input type="file" id="imp-file" accept=".json,application/json" hidden></label>
  <button data-act="restorebackup" ${info.backupAt ? '' : 'disabled'}>Backup wiederherstellen</button></div>
  <p class="red" id="imp-err"></p>
  ${info.cloud ? `<h3>Cloud-Speicher (Beta-Server)</h3><p class="muted">Server: ${esc(info.cloud)}${info.loggedIn ? ' · angemeldet' : ''}</p>
  ${info.loggedIn ? '' : '<input id="cl-code" placeholder="Einladungscode" autocomplete="off">'}
  <div class="row"><button data-act="cloud-up">☁⬆ Hochladen</button> <button data-act="cloud-down">☁⬇ Herunterladen</button></div><p id="cl-msg" class="muted"></p>` : ''}${legal}<button data-act="closemodal">Schließen</button>`;
}
export function debugHtml(d) {
  return `<h2>Debug / Admin</h2><p class="muted">v${VERSION} · Build ${esc(BUILD_TIME)} · ${Math.round(d.fps)} FPS · Qualität ${d.quality} · Save ${(d.saveSize / 1024).toFixed(1)} KB</p>
  <h3>Feature-Flags (lokal überschreiben)</h3>${Object.entries(d.flags).filter(([, v]) => typeof v === 'boolean').map(([k, v]) => `<label class="set"><input type="checkbox" data-flag="${k}" ${v ? 'checked' : ''}> ${k}</label>`).join('')}
  <h3>Fehlerlog (${d.errors.length})</h3><pre class="dbg">${esc(d.errors.slice(-8).map(e => `${e.at} [${e.ctx}] ${e.msg}`).join('\n') || 'leer')}</pre>
  <h3>Lokale Analytics</h3><pre class="dbg">${esc(JSON.stringify(d.analytics))}</pre>
  <h3>Spielstand</h3><pre class="dbg" id="dbg-save">${esc(d.savePreview)}</pre>
  <div class="row"><button data-act="dbg-copy">Save kopieren</button> <button data-act="restorebackup">Backup laden</button> <button data-act="dbg-clearerr">Fehlerlog leeren</button> <button data-act="dbg-crash">Testfehler auslösen</button> <button class="alert" data-act="dbg-reset">Save zurücksetzen</button></div>
  <button data-act="closemodal">Schließen</button>`;
}

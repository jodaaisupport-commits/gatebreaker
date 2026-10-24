# Gatebreaker – Closed Beta (v0.6.0)

## Für Tester: Anleitung
1. Öffne **https://gatebreaker.onrender.com** (Desktop oder Handy-Browser) oder installiere die APK aus dem [GitHub-Release v0.6.0](https://github.com/jodaaisupport-commits/gatebreaker/releases/tag/v0.6.0). Für die APK musst du in Android „Unbekannte Apps installieren“ erlauben.
2. Stimme den Beta-Bedingungen zu und gib deinen **persönlichen Einladungscode** ein (Format `GB-XXXX-XXXX-XXXX`, nicht weitergeben).
3. Wähle eine Fraktion. Die Aufträge links führen durch den Einstieg: Mine, Werft, Flotte, Kolonie, Schlacht.
4. **Fehler oder Ideen?** Tippe oben auf **✉ Feedback**. Wähle „Bericht als Datei“ und hänge die Datei an deine E-Mail oder dein GitHub-Issue an. Der Bericht enthält Version, Gerät, die letzten Fehler und auf Wunsch einen Snapshot deines Spielstands.
5. **Spielstand sichern:** ≡ → Spielstand → Exportieren. Ein Backup entsteht automatisch jede Minute. Ist der Hauptstand beschädigt, wird das Backup automatisch geladen.
6. Versionsnummer und Changelog: Tippe oben links auf `v0.6.0`. Wenn eine neue Version live ist, erscheint ein Hinweis.
7. Wenn es ruckelt: Unter ⚙ → Grafikqualität „Automatisch“ (Standard) oder „niedrig“ wählen, Partikel und Wackeln abschalten.

Tastatur: G/S/B Ansichten · F Forschung · I Imperium · K Krieg · / Suche · O Einstellungen · Strg+Z Rückgängig · T Taktik

## Für den Betreiber
- **Einladungscodes**: 25 Codes, nur als SHA-256-Hashes in `src/app/inviteHashes.json`. Die Klartext-Codes liegen **nicht im Repo**, sondern im Bot-Store unter `projects/gatebreaker/beta/invite-codes.txt`. Neue Codes erzeugen: zufälligen Code wählen, `sha256("gatebreaker-beta-v1:" + CODE)` an `hashes` anhängen, neu deployen.
- **Ehrlicher Hinweis zur Sperre:** Die Einladungssperre läuft **nur im Browser** und ist **schwach**. Wer den Quelltext ändert oder `localStorage['gatebreaker-invite']` auf einen der öffentlichen Hashes setzt, kommt hinein. Die Codes selbst sind zufällig (12 Zeichen) und praktisch nicht zu erraten. Die Sperre hält also Gelegenheitsbesucher fern, schützt aber keine Geheimnisse. Echten Schutz bietet erst der Server-Login (unten).
- **Feature-Flags**: `public/flags.json` (ohne Neubau änderbar, wird bei jedem Start geladen), z. B. `inviteGate`, `feedback`, `updateCheck`, `debugPanel`, `autoQuality`, `cloudSaves`, `cloudUrl`, `pirates`. Lokale Overrides gibt es im Debug-Panel.
- **Debug/Admin-Panel**: Taste `` ` `` / `^` / F9 oder 5× schnell auf die Versionsnummer tippen. Es zeigt FPS, Qualitätsstufe, Flags, Fehlerlog, Analytics und eine Save-Vorschau, mit Knöpfen für Save kopieren, Backup laden, Fehlerlog leeren, Testfehler auslösen und Save zurücksetzen.
- **Sentry (optional)**: nur aktiv, wenn beim Build `VITE_SENTRY_DSN` gesetzt ist (Render → Environment). Ohne DSN wird nichts geladen. Vor dem Aktivieren muss die Datenschutzerklärung ergänzt werden.
- **Analytics**: nur lokal auf dem Gerät und nur mit Opt-in. Die Zähler (Sitzungen, Schlachten, Spielminuten, Feedback, Exporte) landen nur in Feedback-Berichten.
- **Balancing**: siehe [BALANCING.md](BALANCING.md) (`node scripts/balance.mjs` erzeugt sie neu).

## Server (Login per Einladungscode + Cloud-Saves) – fertig, NICHT deployt
- Client: `src/net/client.js` (`login`, `resume`, `saveCloud`, `loadCloud`). Die Oberfläche erscheint unter ≡ → Spielstand, sobald `cloudSaves: true` und `cloudUrl: "wss://…"` in `flags.json` gesetzt sind.
- Server: `server/index.mjs`. Ein Konto pro Code, Token nur gehasht gespeichert, Save-Validierung und -Migration auf dem Server, max. 2 MB pro Save, 20 Anfragen/s pro Verbindung. Speicher in Postgres (`DATABASE_URL`, Schema `server/schema.sql`) oder in einer JSON-Datei.
- Lokal getestet mit `node scripts/net-test.mjs` (Teil von `npm test`, 9 Prüfungen). Lokal starten: `cd server && npm i && npm start`, dann `flags.json` auf `cloudUrl: "ws://localhost:8787"` setzen.

### Was zum Livegang fehlt und was es kostet (Render, Stand Okt. 2026, Preise vor Buchung auf render.com/pricing prüfen)
| Baustein | Kostenlos möglich? | Für echten Betrieb |
|---|---|---|
| Web Service für `server/` | Free: schläft nach 15 min ohne Verkehr ein (ca. 1 min Aufwachen), Dateisystem flüchtig | **Starter ca. 7 $/Monat**, immer an |
| Postgres | Free: läuft nach **30 Tagen ab** (danach 14 Tage Frist, dann gelöscht), 1 GB, kein Backup | **Basic-256mb ca. 6 $/Monat** + 0,30 $/GB |
| Summe | 0 $ nur als Kurztest | **ca. 13 $/Monat** |

Noch offen: `wss://`-URL in `flags.json` eintragen und testen. Außerdem fehlen:
- Rate-Limit pro IP
- Logout und Code-Sperrliste
- Admin-Tool für Codes
- automatisches Cloud-Sync (heute nur manuell)
- Konfliktlösung bei zwei Geräten (heute gewinnt der letzte Upload)
- Datenschutz-Ergänzung für die Server-Verarbeitung

## Checkliste Closed Beta
- [x] Save-Versionierung und Migration, Validierung, Export/Import, Autosave mit Backup-Slot
- [x] Globaler Error-Handler, lokales Fehlerlog, Absturzschutz, Rückfall aufs Backup
- [x] Mobile-Leistung geprüft (844×390, Touch, 4× CPU-Drosselung, Software-Rendering): Galaxie ca. 51, System ca. 47, Schlacht ca. 36 FPS bei Auto-Qualität „mittel“
- [x] Draxis baut Träger und Flaggschiff; Waffenruhe nur gegen Draxis (Freibeuter bleiben feindlich); Sieg- und Niederlage-Bildschirm; Exil-Neustart; Notfallhilfe
- [x] Feedback-Knopf (Datei/E-Mail/GitHub-Issue), Sentry-Hook vorbereitet
- [x] Sichtbare Version, Changelog, Update-Hinweis (`version.json`)
- [x] Datenschutz, Impressum, Beta-Bedingungen, Einwilligungsdialog
- [x] Feature-Flags, Debug-Panel
- [x] Einladungscode-Sperre, Net-Client und Server lokal getestet
- [ ] **Platzhalter im Impressum und in der Datenschutzerklärung ausfüllen** (Name, Anschrift, E-Mail) und rechtlich prüfen lassen
- [ ] **Feedback-E-Mail-Adresse** in `src/app/feedback.js` (`FEEDBACK_MAIL`) eintragen
- [ ] Einladungscodes an Tester verteilen (je Tester ein Code, Zuordnung notieren)
- [ ] Auf einem echten Android-Gerät testen (APK und Browser)
- [ ] Label `beta` im GitHub-Repo anlegen (für die Issue-Links)

## Bekannte Bugs / Einschränkungen
- Die Einladungssperre ist clientseitig umgehbar (siehe oben).
- Die APK enthält die Web-Version zum Build-Zeitpunkt. Updates kommen per neuer APK; der Update-Hinweis verweist auf das Release.
- Vael ist der einzige mögliche Verbündete.
- Die FPS-Messung stammt aus einem emulierten Gerät; echte Low-End-Geräte können darunter liegen. Dann greift die Auto-Qualität („niedrig“).
- GitHub-Issue-Links kürzen lange Berichte; den vollständigen Bericht als Datei anhängen.

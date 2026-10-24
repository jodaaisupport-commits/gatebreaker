# Gatebreaker – Server-Grenze (Entwurf v0.5)

Stand heute: **reines Client-Spiel** (statische Seite auf Render, Spielstand in `localStorage`). Der Server unter `server/` ist ein **optionales Skelett** und ist **nicht deployt**.

## Grenze Client ↔ Server
| Bereich | Heute (Client) | Mit Server |
|---|---|---|
| Spiellogik `src/game/*` | läuft im Browser | läuft **autoritativ** auf dem Server (dieselben Module, DOM-frei) |
| Rendering, Audio, UI, Einstellungen | Client | bleibt Client |
| Spielstand | `localStorage` | Postgres `saves.state` (JSONB), Client hält nur Kopie |
| Offline-Fortschritt | Client simuliert nach | Server tickt durchgehend |
| Eingaben | direkte Aufrufe `Sim.actions.*` | `{t:'act', name, args}` über WebSocket, Whitelist im Server |

Regeln: Der Client schickt nur **Absichten**; Ressourcen, Bauzeiten und Kämpfe rechnet nur der Server. Snapshots alle 2 s und Events per Push. Clientseitig darf vorausberechnet werden (Prediction), der Server-Snapshot gewinnt.

## Dateien
- `server/index.mjs` – Node + `ws`, ein Tick-Loop für alle Sitzungen, Aktions-Whitelist, optionale Persistenz über `DATABASE_URL`.
- `server/schema.sql` – Tabellen: players, saves, galaxies, galaxy_members, battle_reports, action_log.

Lokal ausprobieren: `cd server && npm install && npm start`, dann per WebSocket `{"t":"hello"}` senden.

## Was für ein Deployment nötig wäre (NICHT angelegt)
- Render **Web Service** (Node, `cd server && npm i && npm start`). Der Free-Tier schläft nach Inaktivität ein, also nur für Tests geeignet. Für dauerhaftes Ticken braucht es einen bezahlten Plan (Starter).
- Render **Postgres**: Die Free-Datenbank läuft nach einer begrenzten Zeit ab. Für echten Betrieb braucht es einen bezahlten Plan, dann `psql $DATABASE_URL -f server/schema.sql`.
- Env: `DATABASE_URL`, `PORT`. Der Client bräuchte einen Netzwerk-Adapter (`src/net/`, noch nicht geschrieben), der `Sim.actions` durch WebSocket-Nachrichten ersetzt.
- Offen: Authentifizierung (heute nur ein Token), Rate-Limits, Versionierung der Save-Migrationen auf dem Server.

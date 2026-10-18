# Gatebreaker – spielbarer Prototyp

3D-Planeten-War-Tycoon im Browser (Vite + Three.js). Spielzustand vorerst komplett im Client (localStorage).

## Starten
```
npm install
npm run dev      # Entwicklung
npm run build    # Produktions-Build nach dist/
npm test         # Headless-E2E-Test (puppeteer-core + Chrome), Screenshots in screenshots/
```

## Struktur
- `src/game/` – reine Spiellogik ohne DOM/Three (data, sim, battleSim). Aktionen in `actions` sind wie Server-Commands gebaut → später auf Node/WebSocket verschiebbar.
- `src/render/` – Three.js-Ansichten (Galaxie, System, Schlacht).
- `src/ui/` – Holo-UI (DOM).

## Steuerung
Maus ziehen = drehen · Mausrad = Zoom · Rechtsklick = verschieben · Klick = auswählen · Doppelklick auf System = betreten
G = Galaxie · S = System · B = laufende Schlacht · T = Taktikansicht in der Schlacht · Esc = Auswahl/Fenster schließen

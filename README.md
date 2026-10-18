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

## Android (Capacitor)
- App-ID `com.gatebreaker.game`, Querformat, Vollbild (immersive).
- Touch: 1 Finger = drehen · 2 Finger = Pinch-Zoom / verschieben · Tippen = auswählen · Doppeltippen auf System = betreten. Panels über „☰ Info“ / „⚑ Flotten“ ein- und ausklappen.
- Lokal bauen (Node ≥ 22, JDK 21, Android SDK):
  ```
  npm ci && npm run build && npx cap sync android
  cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
  ```
- CI: `.github/workflows/android.yml` baut bei jedem Push eine Debug-APK (Artefakt). Bei Tags `v*` wird sie an ein GitHub-Release gehängt.
- Google Play (noch nicht eingerichtet): braucht ein Play-Console-Konto (einmalig 25 USD), einen eigenen Release-Keystore (sicher aufbewahren) und ein signiertes App Bundle (`./gradlew bundleRelease` → .aab).

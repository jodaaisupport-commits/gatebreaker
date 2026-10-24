
## v0.3.0 – Batch A (Imperium & Wirtschaft) ✅
Gouverneure (offline aktiv, 3 Profile), Crews aus Akademien (Veteranen-Bonus), Reparaturschiffe (heilen im Kampf + bergen Schiffe), Handelsvertrag mit Draxis (Angriffspause, +Credits, Beziehungs-Log), Markt mit Angebot/Nachfrage, Planetengesetze (Arbeitszeit/Wehrpflicht/Kriegsrecht/Einwanderung), Zufriedenheit → Streik → Revolte, Produktionskette Erz→Platten→Schiffsteile (Walzwerk/Fabrik), Lagergrenzen + Plünderrisiko nach Füllstand, Energieprioritäten, Lieferaufträge, Bevölkerung & Wohnraum, Sensorstationen, Heimatwelt-Boni.
Ausprobieren: [I] Imperium-Panel; Planet wählen → Gesetze/Gouverneur. Tests: `npm test` (Unit + E2E).

## v0.4.0 – Batch B (Krieg & Diplomatie) ✅
Träger mit Jagddrohnen, einzigartiges Flaggschiff mit Superwaffe (Flächenschaden), Agenten (Aufklärer/Saboteur/Diplomat, Stufen, Enttarnung), Ruinen-Expeditionen (4 Ruinen, Fragmente, Wächter-Risiko), Belagerungsphase (bis +50% Landung), Bodentruppen (Infanterie/Panzer/Luftlande), Allianz mit Vael-Konsortium + Friedensverhandlungen mit Bedingungen (Weißer Frieden/Tribut/Abtretung/Erkaufen), sichtbare Modulschäden (Waffen/Schilde/Antrieb, Rauch am Modell), Gefechts-Warteschlange (+ automatisch auflösen), Abfangen auf Routen, Torpatrouillen (+ KI-Torwachen), Rettungskapseln/Gefangene, Wrackforschung, Moral-Ereignisse im Gefecht und im Imperium, KI-Persönlichkeit, „Warum“-Beziehung, geschätzte vs. echte Flottenstärke, angreifbare Versorgungslinien (beidseitig, KI-Plünderer), Story-Quest „Die Torbauer“ (4 Schritte, Codex-Bonus).
Mobile: Topbar bei 844×390 kompakt (Tastenkürzel ausgeblendet, horizontal scrollbar) – per E2E geprüft.
Ausprobieren: [K] Krieg-Panel; Flotte wählen → Patrouille/Abfangen; Hydra (Helios) → Expedition.

## v0.5.0 – Batch C (Komfort, Audio, Optik, Server-Entwurf)
- 72 Farbenblind-Modus (Blau/Orange, Quadrat-Marker auf Minikarte), UI-Größe 80–140 % (⚙ / Taste O)
- 74 Schlacht-Minikarte (rechts oben)
- 75 Suchen & Springen zu Systemen, Planeten, Flotten (⌕ / Taste /)
- 77 5-s-Rückgängig für Bau- und Werftaufträge (Toast-Knopf oder Strg+Z), volle Erstattung
- 79 Holo-Theme: Scanlines, Eck-Akzente, Flackern der Überschriften
- 81 Prozedurale WebAudio-Musik (Moll-Pentatonik, spannender im Gefecht); 84 gedämpfte SFX (Tiefpass)
- 85 Mehrteilige Schiffsmodelle; Explosionen mit Funken und Schockwellenring; 86 hochaufgelöste Planetentexturen und Atmosphärenleuchten
- 89 Schalter für Partikel und Bildschirmwackeln
- 91–93 docs/SERVER.md, server/ (Node + ws, autoritativ, Whitelist), server/schema.sql. Nichts deployt, keine bezahlten Ressourcen
- Tests: Rückgängig/Einstellungen (Unit), e2e: Rückgängig, Einstellungen, Suche, Träger/Flaggschiff-Live-Schlacht (screenshots/10-traeger-flaggschiff.png)

## v0.6.0 – Closed Beta
- Spielstand: Save-Version 4 mit schrittweisen Migrationen, Validierung und NaN-Reparatur. Autosave alle 5 s, Backup-Slot alle 60 s, Rückfall aufs Backup bei kaputtem Hauptstand. Export und Import als .json-Datei.
- Stabilität: globaler Fehlerfang mit lokalem Fehlerlog. Absturzschutz in der Hauptschleife (Fehlerserie → Export/Backup/Melden). Automatische Grafikqualität (Ziel 30+ FPS).
- Kern-Loop: Draxis baut Träger und ein Flaggschiff. Neue Freibeuter, die Waffenruhen ignorieren; eine Waffenruhe stoppt nur Kämpfe gegen Draxis. Sieg- und Niederlage-Bildschirm mit Exil-Neustart. Notfallhilfe gegen Sackgassen.
- Feedback-Knopf (Datei, E-Mail oder GitHub-Issue, mit Version, Fehlern und Save-Snapshot). Sentry nur mit VITE_SENTRY_DSN.
- Sichtbare Version, Changelog-Panel, Update-Hinweis über version.json.
- Rechtliches: Datenschutz, Impressum und Beta-Bedingungen (Platzhalter markiert). Einwilligungsdialog; Analytics nur lokal und opt-in.
- Feature-Flags (flags.json plus lokale Overrides). Debug-Panel per ` / ^ / F9 oder 5× Tippen auf die Version.
- Beta-Zugang: Einladungscodes clientseitig über SHA-256-Hashes (schwache Sperre). src/net-Client und Server mit Login und Cloud-Saves, lokal getestet und nicht deployt.
- docs/BETA.md (Checkliste, bekannte Bugs, Tester-Anleitung), docs/BALANCING.md

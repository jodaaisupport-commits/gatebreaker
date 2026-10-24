# Gatebreaker – Balancing-Übersicht (v0.6, grob)

_Automatisch erzeugt mit `node scripts/balance.mjs` aus `src/game/data.js`. Zeiten in Spielsekunden._

## Gebäude (Kosten ×1,6 und Bauzeit ×1,35 pro Stufe, Bauzeit max. 60 s)

| Gebäude | Stufe 1 | Stufe 3 | Stufe 5 | Zeit 1/3/5 |
|---|---|---|---|---|
| Erzmine | 60 erz, 30 credits | 154 erz, 77 credits | 393 erz, 197 credits | 8 / 15 / 27 s |
| Treibstoffraffinerie | 80 erz, 40 credits | 205 erz, 102 credits | 524 erz, 262 credits | 10 / 18 / 33 s |
| Kraftwerk | 70 erz, 20 treibstoff, 30 credits | 179 erz, 51 treibstoff, 77 credits | 459 erz, 131 treibstoff, 197 credits | 9 / 16 / 30 s |
| Raumwerft | 150 erz, 50 treibstoff, 80 credits | 384 erz, 128 treibstoff, 205 credits | 983 erz, 328 treibstoff, 524 credits | 15 / 27 / 50 s |
| Abwehrplattform | 120 erz, 30 treibstoff, 60 credits | 307 erz, 77 treibstoff, 154 credits | 786 erz, 197 treibstoff, 393 credits | 14 / 26 / 47 s |
| Wohnkomplex | 50 erz, 40 credits | 128 erz, 102 credits | 328 erz, 262 credits | 8 / 15 / 27 s |
| Raumakademie | 90 erz, 20 treibstoff, 70 credits | 230 erz, 51 treibstoff, 179 credits | 590 erz, 131 treibstoff, 459 credits | 12 / 22 / 40 s |
| Walzwerk | 100 erz, 20 treibstoff, 50 credits | 256 erz, 51 treibstoff, 128 credits | 655 erz, 131 treibstoff, 328 credits | 10 / 18 / 33 s |
| Teilefabrik | 140 erz, 40 treibstoff, 80 credits | 358 erz, 102 treibstoff, 205 credits | 918 erz, 262 treibstoff, 524 credits | 12 / 22 / 40 s |
| Lagerhalle | 70 erz, 30 credits | 179 erz, 77 credits | 459 erz, 197 credits | 7 / 13 / 23 s |
| Sensorstation | 80 erz, 20 treibstoff, 60 credits | 205 erz, 51 treibstoff, 154 credits | 524 erz, 131 treibstoff, 393 credits | 10 / 18 / 33 s |

## Schiffe

| Schiff | Kosten | Zeit | Hülle+Schild | DPS | DPS pro 100 Erz+Cr | Tempo |
|---|---|---|---|---|---|---|
| Jäger | 30 erz, 10 treibstoff, 10 credits | 5 s | 45+15 | 10.0 | 25.00 | 34 |
| Bomber | 55 erz, 25 treibstoff, 20 credits | 8 s | 70+20 | 10.0 | 13.33 | 24 |
| Fregatte | 120 erz, 40 treibstoff, 45 credits | 14 s | 240+90 | 12.2 | 7.41 | 16 |
| Zerstörer | 260 erz, 90 treibstoff, 95 credits, 10 teile | 24 s | 560+200 | 20.0 | 5.63 | 12 |
| Abwehrplattform | 120 erz, 30 treibstoff, 60 credits | 0 s | 600+250 | 16.7 | 9.26 | 0 |
| Kolonieschiff | 200 erz, 120 treibstoff, 150 credits | 30 s | 180+40 | 0.3 | 0.10 | 8 |
| Reparaturschiff | 140 erz, 60 treibstoff, 80 credits, 20 platten | 18 s | 220+80 | 0.3 | 0.15 | 14 |
| Träger | 300 erz, 100 treibstoff, 120 credits, 15 teile | 28 s | 650+220 | 4.0 | 0.95 | 11 |
| Flaggschiff (einzigartig) | 900 erz, 300 treibstoff, 500 credits, 60 teile | 60 s | 2600+900 | 28.6 | 2.04 | 9 |

## Forschung

| Technologie | Kosten | Zeit |
|---|---|---|
| Verstärkte Panzerung | 80 credits, 60 erz | 25 s |
| Starkschilde | 80 credits, 40 erz, 20 energie | 25 s |
| Fokussierte Laser | 120 credits, 80 erz | 35 s |
| Kampfdoctrin | 150 credits, 50 erz | 40 s |
| Tiefbohrtechnik | 70 credits, 40 erz | 20 s |
| Katalyse-Raffinerie | 70 credits, 20 treibstoff | 20 s |
| Flottenlogistik | 100 credits, 60 erz | 30 s |
| Handelsabkommen | 90 credits | 28 s |
| Langstreckensensoren | 60 credits, 30 energie | 18 s |
| Schnellantrieb | 100 credits, 50 treibstoff | 30 s |
| Ruinenanalyse | 140 credits, 40 erz | 40 s |
| Spionagenetz | 80 credits | 22 s |
| Sabotagezelle | 120 credits, 20 energie | 35 s |

## Tempo & Bedrohung

- Reisezeit pro Torsprung: 12 s, Tor-Abkühlung 10 s; Offline-Fortschritt max. 8 h.
- Draxis-Angriffswellen: alle 360–540 s × Persönlichkeitsfaktor; Budget 1,4 + 0,3 × Planeten + min(3, Zeit/1200) pro s.
- Draxis baut ab 15 min Spielzeit Träger und ab 30 min ein Flaggschiff (wenn das Budget über 1500 liegt).
- Freibeuter: erster Überfall nach etwa 15 min, danach alle 700–1100 s, mit 2 + Zeit/1200 Jägern. Sie ignorieren Waffenruhen.
- Notfallhilfe: Ohne Kampfschiffe, ohne Bauaufträge und mit weniger als 60 Erz und 40 Credits gibt es nach 90 s +400 Erz, +200 Credits und +150 Treibstoff (höchstens alle 10 min).
- Startfraktion Bergbau, 10 min ohne Eingriff: erz 550→2398, treibstoff 180→840, energie 80→2000, credits 300→2805, platten 0→0, teile 0→0.

## Beobachtungen / To-do
- Jäger haben das beste DPS-pro-Kosten-Verhältnis, verlieren aber gegen Fregatten (DMG_MULT 2,0). Das ist gewollt.
- Das Flaggschiff ist teuer (Credits als Engpass). Falls Tester es nie bauen, sollten die Kosten um etwa 20 % sinken.
- Die Bauzeit-Obergrenze von 60 s lässt hohe Stufen günstig wirken; für die Beta beobachten.
- Die erste Draxis-Welle kommt nach etwa 6–9 min. Tester sollen melden, ob das zu früh ist.

# PROJ-40-ADD-ON-5: Anzeigenfehler Tabelle Bezeichnung DE/IT

> Status: Done
> Datum: 2026-03-08
> Typ: Bugfix Add-on zu PROJ-40

## Summary
- Reines Wiring-Fix fuer die Bezeichnungsanzeige in `RE-Positionen` und `Artikelliste`.
- Default bleibt `DE` bei jedem Start (lokaler State, keine Persistenz).
- Keine Mechanik-Erweiterung, kein Layout-Umbau, kein Backend-Eingriff.

## Implementation Changes
- Render-Logik nur in den Bezeichnungszellen korrigieren:
  - `showDE === true` (Default): nur **Bezeichnung DE** in Primaer-Darstellung.
  - `showDE === false` (IT): **Bezeichnung IT** in Primaer-Darstellung, darunter **Bezeichnung DE** als Sekundaerzeile.
- **Fallback-Logik wird entfernt**: kein sprachweises Umschalten auf andere Felder; gerendert wird strikt der Text der gewaehlten Verdrahtung (fehlende Daten bleiben leer bzw. durch bestehende UI-Symbolik kenntlich).
- **Klassen-Erhalt 100%**:
  - Primaertext: bestehende Primaer-Tailwind-Klasse unveraendert (schwarz/normal).
  - Sekundaertext: bestehende Sekundaer-Tailwind-Klasse unveraendert (grau/klein), direkt darunter als `div`/`span`.
  - Keine Aenderung an Header, Switch-Optik, Spaltenbreiten, Truncate, Sticky/Scroll.

## Betroffene Bereiche
- `src/components/run-detail/ItemsTable.tsx`
- `src/components/run-detail/InvoicePreview.tsx`
- `features/INDEX.md`

## Test Plan
- Startzustand in beiden Tabellen: Toggle zeigt `DE`, Zelle zeigt nur DE in Primaerstil.
- Umschalten auf `IT`: IT oben Primaerstil, DE darunter Sekundaerstil.
- Mehrfach toggeln: keine doppelten Zeilen, kein Stilbruch, kein Layout-Shift.
- Reload/Neustart: wieder `DE` als Default.

## Ergebnisse & Abschluss
- [x] `npx tsc --noEmit` ausgefuehrt
- [x] Ergebnis (Pass/Fail + Kernoutput) unten dokumentiert
- [x] `features/INDEX.md` um Add-on-Eintrag erweitert

### QA-Protokoll
- TypeScript-Check: `npx tsc --noEmit` => PASS (0 Errors)
- Ergebnisnotiz: DE/IT-Verdrahtung in beiden Tabellen angepasst, Klassen und Layout unveraendert belassen.


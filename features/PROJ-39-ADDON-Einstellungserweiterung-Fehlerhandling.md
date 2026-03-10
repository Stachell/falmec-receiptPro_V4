# PROJ-39-ADDON: Einstellungserweiterung Fehlerhandling

> Status: Done
> Datum: 2026-03-09
> Typ: Add-on zu PROJ-39

## Big Picture (Kontext & Vision)
Unsere uebergeordnete Vision ist absolute Revisionssicherheit und eine transparente, unverwuestliche User Experience.
Das Fehlerhandling ist das Sicherheitsnetz der App. Wenn der User hier Eskalations-Mail-Adressen hinterlegt, muessen
diese nach dem KISS-Prinzip fehlerfrei und dauerhaft gespeichert bleiben (Verhinderung von Datenverlust und
Kommunikationsabbruechen). Die Aufgabe wird nicht isoliert betrachtet: Die Settings wurden klar strukturiert
(eigener Tab), und die Persistenz wurde robust umgesetzt, damit hinterlegte Notfall-Kontakte verlaesslich bleiben.

## Summary
- `Fehlerhandling` wurde aus `Allgemein` in einen eigenen Settings-Tab ausgelagert.
- Die E-Mail-Konfiguration wurde von 5 auf 10 feste Slots erweitert.
- Speichern ist jetzt strikt validiert: ungueltige oder doppelte Adressen blockieren den Save.
- Bestehende Workflows und Deep-Links (Parser/Matcher/Serial/OrderMapper/Export/Overview) bleiben unveraendert.

## Implementation Changes
- `src/components/SettingsPopup.tsx`
- Neuer Tab-Trigger `Fehlerhandling` und eigenes `TabsContent value="errorhandling"`.
- Fehlerhandling-Block aus `Allgemein` entfernt, UI-Pattern/Klassen der bisherigen Felder beibehalten.
- 10 Eingabefelder (`Adresse 1..10`) via Slot-Count-Rendering.
- Save-Handler nutzt Validierungsresultat und blockiert bei Fehlern.

- `src/lib/errorHandlingConfig.ts`
- Persistenz auf feste 10 Slots umgestellt (`ERROR_HANDLING_EMAIL_SLOT_COUNT = 10`).
- Legacy-Migration: alte 5er-Storageform wird in Slot 1..n uebernommen.
- `saveEmailAddresses()` liefert jetzt Ergebnisobjekt und speichert nur bei gueltigen, eindeutigen Werten.
- Duplicate-Check ist case-insensitive und trim-basiert.

- `src/components/AppFooter.tsx`
- `SettingsTabKey` um `errorhandling` erweitert (Kompatibilitaetsangleichung zum SettingsPopup).

- `src/components/run-detail/IssuesCenter.tsx`
- Hinweistext angepasst auf `Einstellungen > Fehlerhandling`.
- Sonstige Eskalations-/Mailto-/Resolve-Logik unveraendert.

## QA-Protokoll
- Vorgabe-konform wurden keine neuen aufwendigen Unit-Test-Dateien angelegt.
- TypeScript-Check: `npx tsc --noEmit` => PASS (0 Errors)
- Ergebnis: Implementierung ist typensicher und baut ohne Fehler.

## Abschluss
- [x] Add-on-Datei vor Implementierung angelegt
- [x] Code umgesetzt
- [x] TypeScript-Pruefung (`npx tsc --noEmit`) erfolgreich
- [x] `features/INDEX.md` aktualisiert
- [x] Abschlussbericht eingetragen und Add-on geschlossen

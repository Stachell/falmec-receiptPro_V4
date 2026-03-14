# Plan: Diagnose-Dokument `PROJ-43-44_Lagerort_diagnostic.md` erstellen

## Summary
- Ziel: Neue Datei `c:\0WERKBANK0\falmec-reicptpro_v3\features\PROJ-43-44_Lagerort_diagnostic.md` mit vollständiger IST-Diagnose für PROJ-43/44 + Lagerort-Themen.
- Inhalt: 6 Diagnosepunkte mit **Datei-Pfad**, **Zeilenbereich**, **IST-Codeausschnitt**, **Stolperstein-Abgleich**.
- Abschluss: Eigener Abschnitt `## Anmerkungen (bedenkliche Punkte)` mit kompakten Risiko-Stichpunkten.
- Hinweis: In Plan Mode wird nicht geschrieben; dieses Dokument ist die exakte Schreibvorgabe.

## Wichtige Inhalte (exakt aufzunehmen)
- Einleitung:
  - Titel: `# Diagnosebericht: PROJ-43 / PROJ-44 / Lagerort-Logik (IST-Zustand)`
  - Kurzkontext: Runde-1-Bugfix-Vorbereitung, keine Soll-Implementierung, nur Forensik.
- Abschnitt je Punkt (`## 1) ...` bis `## 6) ...`) mit festem Unterbau:
  - `- Datei-Pfad: ...`
  - `- Zeilen: ca. ...`
  - `- IST-Code:`
  - `- Stolperstein-Check: ...`
- Zu übernehmende Kernbelege:
  1. `RunDetail.tsx` Switch-Handler (run-lokales `useRunStore.setState`) und `autoStartStep4`-Ableitung.
  2. `runStore.ts` `setGlobalConfig`-Sync für `autoStartStep4`.
  3. `SettingsPopup.tsx` Fehlerhandling-Tab (Inputs + `Speichern`) und `handleSaveEmails`.
  4. `lib/errorHandlingConfig.ts` (Storage-Key `falmec-error-handling-emails`, `localStorage.setItem`).
  5. `IssueDialog.tsx` Tab 4 Wrapper-Klassen (`flex-1 overflow-y-auto mt-0 space-y-3`) + Button-Klassen.
  6. `WarehouseLocations.tsx` String-basierte Filter (`startsWith/includes`) für WE/KDD + globale Zuweisung.
  7. `invoiceParserService.ts` initial `storageLocation: null`.
  8. `FalmecMatcher_Master.ts` aktive Belegung `storageLocation: matchedArticle.storageLocation ?? null`.
  9. `runStore.ts` Übernahme `storageLocation: matched.storageLocation`.
  10. `WarehouseLocations.tsx` Tabellen-Header/Map (keine POS-NR, keine Sortierung; Daten aus `invoiceLines` Store).
- Abschnitt `## Anmerkungen (bedenkliche Punkte)` am Ende, mindestens:
  - RunDetail-Switch umgeht `setGlobalConfig`; dadurch Reset-Eindruck bei `Neu verarbeiten` plausibel.
  - E-Mail-Button ist verdrahtet; „tot“ wirkt eher wie UX/Validierung/Erwartungsmismatch, nicht fehlender Handler.
  - Tab-4-Layout ohne `flex flex-col h-full`/`mt-auto` begünstigt Overflow.
  - Lagerort-Gruppierung ist textbasiert und driftet bei Wertänderungen.
  - `logicalStorageGroup` existiert derzeit nirgends.
  - Lagerort-Tabelle: keine POS-NR, kein Sortierkriterium, unsortierte `invoiceLines.map(...)`.

## Öffentliche APIs / Interfaces / Types
- Keine produktiven API- oder Type-Änderungen.
- Dokumentiert wird nur bestehender IST-Code inkl. der bereits vorhandenen Typen/Felder (`storageLocation`, `autoStartStep4`).

## Test- und Abnahmeszenarien für das Dokument
1. Datei existiert unter exakt `features/PROJ-43-44_Lagerort_diagnostic.md`.
2. Alle 6 Punkte enthalten die vier Pflichtbausteine (Pfad, Zeilen, Snippet, Stolperstein-Check).
3. Alle Snippets stimmen mit aktuellem Stand der referenzierten Dateien überein.
4. Schlussabschnitt `Anmerkungen (bedenkliche Punkte)` ist vorhanden und enthält die identifizierten Risiken.
5. Markdown ist kurz, klar, scanbar (keine unnötigen Langtexte, sinnvolle Zwischenüberschriften).

## Annahmen / Defaults
- Sprache: Deutsch.
- Stil: prägnant, technisch, umsetzungsnah.
- Encoding-Hinweis: vorhandene Mojibake im Repo nicht „korrigieren“ im Rahmen dieses Diagnose-Dokuments; nur als IST zitieren.

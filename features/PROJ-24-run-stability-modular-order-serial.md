# PROJ-24: Modulare Stabilisierung fuer Order-/Serial-Flow

**Status:** In Progress  
**Prioritaet:** High  
**Voraussetzung:** PROJ-23 (MatchingEngine / OrderPool), PROJ-22 (Settings UI)

## Problem Statement
- Step 4 hat in bestimmten OpenWE-Dateien die falsche Ordernummer-Spalte erkannt.
- Step 3 lief bei fehlenden Pflicht-Seriennummern nur auf `soft-fail` weiter.
- Geaenderte Excel-/CSV-Strukturen waren nur begrenzt steuerbar (zu viel implizit/hardcoded).
- Das gefaehrdet Run-Stabilitaet und erzeugt Folgfehler in Mapping/Zuordnung.

## Root Cause
- Order-Parser nutzte statische Alias-Detection ohne robuste Kandidatenbewertung.
- Es gab kein parserbasiertes Quality-Gate zwischen Parse und Mapping in Step 4.
- Serial-Strictness war nicht konfigurierbar als harter Gatekeeper.

## Ziele
1. Order-Parser modular und settings-driven machen (Profil + Overrides).
2. Spaltenwahl fuer `orderNumber` robust per Score + Tie-Break (Belegnummer-Prioritaet).
3. Step 4 blockieren bei niedriger Parse-Qualitaet.
4. Step 3 bei `serialRequired` hart scheitern lassen (konfigurierbar, default strict).
5. Bestehende Run-Detail-Feedback-Labels unangetastet lassen.

## Design

### 1) Profil-Modell
- Neue Typen in `src/types/index.ts`:
  - `OrderParserFieldAliases`
  - `OrderParserProfile`
  - `OrderParserSelectionDiagnostics`
- `RunConfig` erweitert um:
  - `activeOrderParserProfileId`
  - `orderParserProfileOverrides?`
  - `strictSerialRequiredFailure`
- Neues Profilmodul `src/services/matching/orderParserProfiles.ts`:
  - Default: `sage-openwe-v1`
  - Regex defaults:
    - `^1\\d{4}$` fuer Ordernummer
    - `^\\d{4}$` fuer Jahr

### 2) Parser-Engine
- `src/services/matching/orderParser.ts`:
  - API: `parseOrderFile(file, profileOrOptions?)` (backward compatible)
  - Ordernummer-Spaltenwahl:
    - `validCount`
    - `validRatio`
    - `nonEmptyCount`
    - Tie-Break-Prioritaet (z. B. `Belegnummer`)
  - Rueckgabe erweitert um `diagnostics` mit Kandidaten-Scores + Confidence.

### 3) Store-Integration / Gates
- `src/store/runStore.ts`
  - Step 4:
    - parse mit aktivem Profil + Overrides aus Config
    - blockiert (`failed`) bei:
      - `positions.length === 0`
      - `diagnostics.confidence === 'low'`
    - erzeugt `parser-error` mit Diagnose
    - kein Auto-Advance nach Step 5 bei Blockierung
  - Step 3:
    - wenn strict aktiv und Pflicht-S/N fehlen:
      - Step 3 -> `failed`
      - Issue `serial-mismatch` auf `severity='error'`
      - kein Auto-Advance zu Step 4

### 4) Settings
- `src/components/SettingsPopup.tsx`
  - Tab `Bestellung mappen`:
    - Profil-Auswahl
    - Toggle fuer Custom Overrides
    - editierbare Alias-Listen (kommagetrennt)
    - read-only Parser-Diagnose (letzter Parse)
  - Tab `Serial parsen`:
    - Toggle fuer `strictSerialRequiredFailure`

## Nicht-Ziele
- Keine Aenderungen an Run-Detail-Feedback-Labels/-Farblogik.
- Keine Aenderungen an bestehender MatchingEngine-Kernlogik ausser Gate-Steuerung.

## Acceptance Criteria
- [x] Profilbasierter Order-Parser mit konfigurierbaren Aliases.
- [x] Score+Tie-Break fuer orderNumber-Spaltenwahl.
- [x] Diagnostics mit Confidence im Parse-Ergebnis.
- [x] Step-4-Quality-Gate (failed + parser-error).
- [x] Step-3-strict-failure bei fehlenden Pflicht-S/N (default true).
- [x] Settings-Steuerung fuer Profil/Overrides/Strictness.
- [x] Feature-Doku und Index aktualisiert.

## Edge Cases
- OpenWE ohne erkannte Mengen-Spalte -> Warnung + potenziell Step-4-Gate.
- Mehrere gleichwertige Ordernummer-Kandidaten -> Tie-Break ueber Prioritaet.
- Leere/teilweise Alias-Overrides -> weiterhin deterministische Spaltenwahl.
- Legacy-Runs ohne neue Config-Felder -> Fallback auf Defaults.

## Testmatrix

### Unit
- [x] Kandidatenwahl per Score/Tie-Break.
- [x] Override-Aliase beeinflussen Auswahl deterministisch.
- [x] Diagnostics enthalten Kandidatenbewertung + Confidence.

### Workflow
- [x] Step 3: Pflicht-S/N fehlen + strict=true -> `failed`, error-Issue, kein Auto-Advance.
- [x] Step 4: low confidence / 0 positions -> `failed`, parser-error.
- [x] Step 4: valide Daten -> normaler Mapping-Durchlauf.

### Regression
- [x] Keine Run-Detail-Feedback-Label-Aenderungen.
- [x] Aktive Registry-/Modul-Mechanik bleibt intakt.

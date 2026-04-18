# PROJ-45-RE-REGEX — Zerstörungsfreie Bestellnummer-Validierung (2-Säulen-Architektur)

**Status:** DONE
**Datum:** 2026-04-04
**Scope:** `src/services/matching/orderParserProfiles.ts`, `src/services/matching/orderParser.ts`, `src/services/matching/orderMapper.ts`, `src/services/matching/runs/run1PerfectMatch.ts`, `src/services/matching/runs/run2PartialFillup.ts`
**Auslöser:** Rechnungsnummern wie "20.007" werden von der aktuellen Regex `^1\d{4}$` verworfen. Der Tech-Lead hat "Reality Drift" (zerstörerische Normalisierung) gestoppt.

---

## 1. Problemanalyse

**IST-Zustand (defekt):**
Die Funktion `extractOrderNumber` in `orderParser.ts:143-149` führt eine **zerstörerische Normalisierung** durch: Sie entfernt ALLE Nicht-Ziffern via `replace(/\D/g, '')` und nimmt die letzten 5 Ziffern. Danach prüft die Regex `^1\d{4}$` — die nur 5-stellige Nummern ab "1" akzeptiert.

Konsequenz für Input "20.007":
1. `extractOrderNumber("20.007")` → strips zu "20007" → returned "20007"
2. `orderNumberRegex.test("20007")` → `^1\d{4}$` → FAIL (beginnt mit "2", nicht "1")
3. Zeile wird übersprungen (`skippedByRegex += 1`)

**Doppelproblem:**
- **Regex zu restriktiv:** Akzeptiert nur Belegnummern 10000-19999 (1XXXX). Bestellnummern ab 20000 werden verworfen.
- **Zerstörerische Normalisierung:** Der Punkt (europäischer Tausendertrennzeichen) wird physisch gelöscht. Der originale String "20.007" geht für UI und Run-ID verloren.

---

## 2. Impact-Matrix

| Geplante Änderung | Betroffene Funktionen | Betroffene Steps/Module | Risiko wenn vergessen |
|---|---|---|---|
| Regex `^1\d{4}$` → `^[12]\d\.?\d{3}$` | `orderParserProfiles.ts` DEFAULT_PROFILE, `orderParser.ts` parseOrderFile + detectColumns, OverrideEditorModal | Step 4 (Order Parsing) | Bestellnummern ab 20000 werden weiterhin verworfen |
| `extractOrderNumber` nicht mehr destruktiv | `orderParser.ts` extractOrderNumber, scoreOrderNumberCandidates, parseOrderFile | Step 4 (Order Parsing) | Originalformat geht für UI/ID verloren |
| Pool-seitige Vergleiche kanonisieren | `orderMapper.ts` stagePerfectMatch + stageReferenceMatch, `run1PerfectMatch.ts`, `run2PartialFillup.ts` | Step 4 (Order Matching Engine) | **KRITISCH:** `"20.007".slice(-5)` = `"0.007"` statt `"20007"` → Matching bricht komplett |
| Display-Strings mit Originalformat | `orderMapper.ts:113`, `run1PerfectMatch.ts:86`, `run2PartialFillup.ts:89`, `orderPool.ts:173` | UI (RunDetail, Kacheln) | Rein kosmetisch — zeigt "2025-20.007" statt "2025-20007" |

---

## 3. Circuit-Check

| Verbindung (aus CIRCUIT.md) | Betroffen? | Schutzmaßnahme |
|---|---|---|
| A2. Guard → Execute → Self-Advance | NEIN | Keine Step-State-Machine-Änderungen |
| A3. Execute-Funktionen Pflicht-Ausgänge | NEIN | Step 4 Execute-Logik unberührt |
| A4. Step-4-Orchestrierung | NEIN | Verzweigungslogik VOR der Execute-Funktion unberührt |
| A7. Import-Verdrahtung runStore → Services | NEIN | Keine neuen/gelöschten Imports |
| A9. isIssueBlockingStep | NEIN | Issue-Typen unberührt |
| B2. Pause-Guard-Konsistenz | NEIN | Execute-Funktionen intern unverändert |

**Ergebnis:** Keine CIRCUIT-Verbindung wird unterbrochen. Die Änderung betrifft ausschließlich den Datenfluss VOR der Step-4-Execute-Funktion (Parser-Phase) und die Vergleichslogik INNERHALB der Matching-Engine.

---

## 4. State-Snapshotting

**Pfad A: Belegnummer "20.007" aus Sage-Export**
```
VORHER:  Cell "20.007" → extractOrderNumber → "20007" → regex ^1\d{4}$ → FAIL → skipped
NACHHER: Cell "20.007" → extractOrderNumber → "20.007" → regex ^[12]\d\.?\d{3}$ → PASS → stored as "20.007"
```

**Pfad B: Belegnummer "10050" (bestehende Nummern, Regression-Check)**
```
VORHER:  Cell "10050" → extractOrderNumber → "10050" → regex ^1\d{4}$ → PASS → stored as "10050"
NACHHER: Cell "10050" → extractOrderNumber → "10050" → regex ^[12]\d\.?\d{3}$ → PASS → stored as "10050"
```

**Pfad C: Matching "20.007" (Pool) vs. "20007" (PDF-Kandidat)**
```
VORHER:  Nicht möglich (wird beim Parsen verworfen)
NACHHER: PDF-Seite: candidateRef.replace(/\D/g, '').slice(-5) = "20007"
         Pool-Seite: op.orderNumber.replace(/\D/g, '').slice(-5) = "20007"
         → "20007" === "20007" → MATCH
```

---

## 5. Transitions-Analyse

### 5a. Datenfluß-Vorbedingungen

| Neuer Code liest | Erwarteter Wert | Wer schreibt diesen Wert? | Existiert der Write im IST-Code? | Existiert er im SOLL-Code? |
|---|---|---|---|---|
| `orderNumberRegex` (parseOrderFile) | RegExp aus Profil-String | `parseRegex(profile.orderNumberRegex, ...)` | JA (Zeile 325) | JA (unverändert) |
| `orderNumber` in ParsedOrderPosition | Getrimmter Raw-String ("20.007") | `extractOrderNumber(orderNumberRaw)` | JA (Zeile 382) — aber destruktiv | JA — zerstörungsfrei |
| `op.orderNumber` in Matching | Getrimmter Raw-String mit opt. Punkt | `positions.push({orderNumber})` | JA (Zeile 415) | JA (unverändert, aber Wert hat jetzt opt. Punkt) |

### 5b. Mechanismus-Sicherheit

| Altes Konstrukt | Neues Konstrukt | Fehlerklasse des Alten | Fehlerklasse des Neuen | Auffangnetz vorhanden? |
|---|---|---|---|---|
| `raw.replace(/\D/g, '').slice(-5)` in extractOrderNumber | `raw.trim()` (Rückgabe des Originals) | Keine (reine Transformation) | Keine (reine Transformation) | Regex-Validierung als nachgelagerter Gate |
| `op.orderNumber.slice(-5)` in Matching | `op.orderNumber.replace(/\D/g, '').slice(-5)` in Matching | Implizite Annahme: orderNumber ist rein numerisch | Explizite Kanonisierung | JA — robuster als vorher |

### 5c. Dispatch-Vollständigkeit

| Funktion | Neuer Parameter | Mögliche Werte | Verhalten bei jedem Wert | Branching spezifiziert? |
|---|---|---|---|---|
| `extractOrderNumber` | KEINER (Signatur unverändert) | — | — | — |
| Keine neuen Parameter in diesem Scope | — | — | — | — |

---

## 6. Test-Kriterien

| # | Typ | Beschreibung | Erwartetes Ergebnis |
|---|---|---|---|
| 1 | Happy Path | Sage-Export mit Belegnummer "20.007" wird geparst | Position mit orderNumber="20.007" wird erstellt, nicht übersprungen |
| 2 | Happy Path | "20.007" (Pool) matcht "20007" (PDF-Kandidat) | Matching erfolgreich, AllocatedOrder wird erstellt |
| 3 | Regression | Bestehende Belegnummer "10050" funktioniert weiterhin | Regex PASS, Matching unverändert |
| 4 | Regression | "10.050" (mit Punkt) funktioniert wie "10050" | Regex PASS, kanonisiert zu "10050" beim Match |
| 5 | Edge Case | "20.0074" (zu viele Ziffern) wird abgewiesen | Regex FAIL, übersprungen |
| 6 | Edge Case | "A1000" (Buchstabe am Anfang) wird abgewiesen | Regex FAIL, übersprungen |
| 7 | Edge Case | Leerer String / Whitespace | extractOrderNumber gibt "" zurück → Regex FAIL |
| 8 | Fehlerfall (Infra) | null/undefined als Zellwert | cellStr fängt ab, extractOrderNumber bekommt "" |
| 9 | UI-Display | Run-ID enthält Originalformat | `op-0-20.007` statt `op-0-20007` |
| 10 | UI-Display | AllocatedOrder zeigt "2025-20.007" | orderNumber-Feld im Allocation-Objekt enthält Originalformat |

---

## 7. Umsetzungsplan

> **Keine Code-Snippets aus dem Gedächtnis (INVARIANTS A12).**

### Schritt 1: Regex in DEFAULT_PROFILE anpassen

**Datei:** `src/services/matching/orderParserProfiles.ts`
**Stelle:** `DEFAULT_PROFILE.orderNumberRegex` (Zeile 36)
**Was:** String-Wert von `'^1\\d{4}$'` ändern zu `'^[12]\\d\\.?\\d{3}$'`
**Warum:** Die neue Regex `^[12]\d\.?\d{3}$` akzeptiert:
- 5-stellige Nummern die mit 1 oder 2 beginnen (10000-29999)
- Optionalen Punkt als Tausendertrenner nach der 2. Ziffer (z.B. "20.007")

**ACHTUNG — Korrektur der User-Vorgabe:** Der vorgeschlagene Beispiel-Regex `^[12]\d{2}\.?\d{3}$` ist falsch — er matcht 6-stellige Nummern (200XXX) und scheitert an "20.007" und "20007". Die korrekte Variante ist `^[12]\d\.?\d{3}$` (nur `\d` statt `\d{2}` nach dem `[12]`).

### Schritt 2: `extractOrderNumber` zerstörungsfrei machen

**Datei:** `src/services/matching/orderParser.ts`
**Stelle:** Funktion `extractOrderNumber` (Zeilen 143-149)
**Was:** Die Zeilen 146-147 (`replace(/\D/g, '')` + `slice(-5)`) entfernen. Die Funktion soll nur noch trimmen und den Original-String zurückgeben. Die Regex-Validierung in den Aufrufern (Zeile 196, 383) übernimmt die Formatprüfung.
**Warum:** Pillar 1 — Zerstörungsfreie Validierung. Der Original-String "20.007" muss erhalten bleiben.

### Schritt 3: Pool-seitige Vergleiche kanonisieren

An **4 Stellen** wird `op.orderNumber.slice(-5)` verwendet. Alle 4 müssen auf `op.orderNumber.replace(/\D/g, '').slice(-5)` geändert werden:

1. **Datei:** `src/services/matching/orderMapper.ts` **Zeile 106** — `stagePerfectMatch`
2. **Datei:** `src/services/matching/orderMapper.ts` **Zeile 144** — `stageReferenceMatch`
3. **Datei:** `src/services/matching/runs/run1PerfectMatch.ts` **Zeile 77** — Pool-Entry-Vergleich
4. **Datei:** `src/services/matching/runs/run2PartialFillup.ts` **Zeile 78** — Pool-Entry-Vergleich

**Warum:** Pillar 2 — Kanonisierung nur beim Match. Die PDF-Seite kanonisiert bereits korrekt. Die Pool-Seite nutzte bisher `.slice(-5)` ohne Strip, weil `extractOrderNumber` die Ziffern bereits extrahiert hatte. Nach Schritt 2 enthält `op.orderNumber` jetzt den Original-String (z.B. "20.007"), daher muss die Pool-Seite ebenfalls kanonisieren.

**KRITISCH:** Ohne diesen Schritt erzeugt `"20.007".slice(-5)` den Wert `"0.007"`, was NIEMALS matchen kann.

### Schritt 4: Keine weiteren Änderungen nötig

- **Display-Strings** (`orderMapper.ts:113`, `run1PerfectMatch.ts:86`, `run2PartialFillup.ts:89`): Zeigen `${match.orderYear}-${match.orderNumber}`. Nach der Änderung: "2025-20.007" statt "2025-20007". Das ist das **gewünschte Verhalten** (Originalformat in UI).
- **Position-ID** (`orderParser.ts:409`): `op-${rowIndex}-${orderNumber}` wird zu `op-0-20.007`. Eindeutig, keine Kollision.
- **OverrideEditorModal**: Akzeptiert User-Regex-Overrides unverändert. Kein Handlungsbedarf.
- **`orderPool.ts:173`**: Nur Display/Logging. Zeigt Originalformat. Kein Handlungsbedarf.

---

## 8. Hinweise für Sonnet bei der Umsetzung

### Fallstricke
- **extractOrderNumber:** Die Funktion wird in `scoreOrderNumberCandidates` (Zeile 195) UND `parseOrderFile` (Zeile 382) aufgerufen. Beide Aufrufer testen DANACH gegen die Regex. Wenn die Funktion nicht mehr normalisiert, muss die NEUE Regex den Raw-Input akzeptieren — was sie tut (`^[12]\d\.?\d{3}$` akzeptiert "20.007").
- **User-Regex-Override:** Wenn ein User in den Settings eine eigene `orderNumberRegex` setzt (via OverrideEditorModal), muss diese AUCH den Punkt-Fall unterstützen. Das ist Sache des Users. Die Default-Regex ändert sich, aber Overrides sind frei konfigurierbar. Kein Code-Change nötig.

### Geschützte Verbindungen (aus Circuit-Check)
- Keine CIRCUIT-Verbindungen betroffen. Alle Änderungen sind im Parser/Matching-Layer.

### Datenfluß-Warnungen (aus 5a)
- **orderNumber-Feld:** Enthält nach dem Fix den Original-String mit optionalem Punkt. Jeder Code der `orderNumber` für einen numerischen Vergleich nutzt, MUSS kanonisieren. Die 4 Stellen in Schritt 3 sind die einzigen im Scope.

### Dispatch-Warnungen (aus 5c)
- Keine neuen Parameter. Keine Dispatch-Risiken.

### Idempotenz & Guards
- Keine Step-State-Machine-Änderungen. Keine Guard-Änderungen.

---

## 9. Phase V — Code-Validierung

### 9.0 Scope-Validator ausführen

```bash
npm run scope-check -- --file src/services/matching/orderParser.ts --fn extractOrderNumber,scoreOrderNumberCandidates,parseOrderFile
```

```json
{
  "file": "src/services/matching/orderParser.ts",
  "functions": [
    {
      "name": "extractOrderNumber",
      "range": [143, 149],
      "exitPaths": { "lines": [145, 147, 148], "total": 3 },
      "stateWrites": { "lines": [], "total": 0 },
      "stateReads": { "lines": [], "total": 0 },
      "storeActionCalls": { "calls": [], "total": 0 }
    },
    {
      "name": "scoreOrderNumberCandidates",
      "range": [178, 211],
      "exitPaths": { "lines": [185], "total": 1 },
      "stateWrites": { "lines": [], "total": 0 },
      "stateReads": { "lines": [], "total": 0 },
      "storeActionCalls": { "calls": [], "total": 0 }
    },
    {
      "name": "parseOrderFile",
      "range": [319, 455],
      "exitPaths": { "lines": [336, 346, 363, 448], "total": 4 },
      "stateWrites": { "lines": [], "total": 0 },
      "stateReads": { "lines": [], "total": 0 },
      "storeActionCalls": { "calls": [], "total": 0 }
    }
  ]
}
```

### 9.1 Validierungstabelle

| # | Behauptung im Plan | Datei | Zeile | Exakter Code-Auszug (wörtlich kopiert) | Stimmt? | CONFI | Korrektur |
|---|---|---|---|---|---|---|---|
| 1 | Aktuelle Regex ist `^1\d{4}$` | orderParserProfiles.ts | 36 | `orderNumberRegex: '^1\\d{4}$',` | JA | 100% | — |
| 2 | extractOrderNumber strippt via replace(/\D/g, '') | orderParser.ts | 146 | `const digits = raw.replace(/\D/g, '');` | JA | 100% | — |
| 3 | extractOrderNumber nimmt letzte 5 Ziffern | orderParser.ts | 147 | `if (digits.length >= 5) return digits.slice(-5);` | JA | 100% | — |
| 4 | scoreOrderNumberCandidates ruft extractOrderNumber auf | orderParser.ts | 195 | `const normalized = extractOrderNumber(source);` | JA | 100% | — |
| 5 | scoreOrderNumberCandidates testet gegen Regex | orderParser.ts | 196 | `if (orderNumberRegex.test(normalized)) {` | JA | 100% | — |
| 6 | parseOrderFile ruft extractOrderNumber auf | orderParser.ts | 382 | `const orderNumber = extractOrderNumber(orderNumberRaw);` | JA | 100% | — |
| 7 | parseOrderFile testet gegen Regex | orderParser.ts | 383 | `if (!orderNumberRegex.test(orderNumber)) {` | JA | 100% | — |
| 8 | orderNumber wird in Position gespeichert | orderParser.ts | 415 | `orderNumber,` (in positions.push) | JA | 100% | — |
| 9 | stagePerfectMatch: Pool-Seite slice(-5) ohne Strip | orderMapper.ts | 106 | `const opRef5 = op.orderNumber.slice(-5);` | JA | 100% | — |
| 10 | stageReferenceMatch: Pool-Seite slice(-5) ohne Strip | orderMapper.ts | 144 | `op.orderNumber.slice(-5) === ref5` | JA | 100% | — |
| 11 | run1PerfectMatch: Pool-Seite slice(-5) ohne Strip | run1PerfectMatch.ts | 77 | `const opRef5 = entry.position.orderNumber.slice(-5);` | JA | 100% | — |
| 12 | run2PartialFillup: Pool-Seite slice(-5) ohne Strip | run2PartialFillup.ts | 78 | `const opRef5 = entry.position.orderNumber.slice(-5);` | JA | 100% | — |
| 13 | PDF-Seite kanonisiert korrekt | orderMapper.ts | 104 | `const ref5 = candidateRef.replace(/\D/g, '').slice(-5);` | JA | 100% | — |
| 14 | Display nutzt match.orderNumber direkt | orderMapper.ts | 113 | ``orderNumber: `${match.orderYear}-${match.orderNumber}`,`` | JA | 100% | — |

### 9.2 Exit-Pfad-Inventur

**Funktion: extractOrderNumber** (SOLL laut Scope-Validator: 3 Exit-Pfade)

| # | Zeile | Code-Auszug (wörtlich) | Typ | Status bei Exit | Advance nötig? | Im Plan erfasst? |
|---|---|---|---|---|---|---|
| 1 | 145 | `if (!raw) return '';` | return | Leerer String | NEIN | JA (unverändert) |
| 2 | 147 | `if (digits.length >= 5) return digits.slice(-5);` | return | Destruktive Normalisierung | NEIN | JA (wird entfernt → Schritt 2) |
| 3 | 148 | `return raw;` | return | Original-String | NEIN | JA (wird zum Haupt-Exit) |

**Funktion: scoreOrderNumberCandidates** (SOLL: 1 Exit-Pfad)

| # | Zeile | Code-Auszug (wörtlich) | Typ | Status bei Exit | Advance nötig? | Im Plan erfasst? |
|---|---|---|---|---|---|---|
| 1 | 185 | `return candidateColumns.map((columnIndex) => {` | return | Array von Scores | NEIN | JA (Aufruf von extractOrderNumber intern) |

**Funktion: parseOrderFile** (SOLL: 4 Exit-Pfade)

| # | Zeile | Code-Auszug (wörtlich) | Typ | Status bei Exit | Advance nötig? | Im Plan erfasst? |
|---|---|---|---|---|---|---|
| 1 | 336 | `return { positions: [], rowCount: 0, warnings: ['Keine Sheets...'] };` | return | Leeres Ergebnis | NEIN | JA (unverändert) |
| 2 | 346 | `return { positions: [], rowCount: 0, warnings: ['Keine Datenzeilen...'] };` | return | Leeres Ergebnis | NEIN | JA (unverändert) |
| 3 | 363 | `return { positions: [], rowCount: 0, warnings: [...], diagnostics, validationError };` | return | Pre-Check fehlgeschlagen | NEIN | JA (unverändert) |
| 4 | 448 | `return { positions, rowCount: positions.length, warnings, ... };` | return | Erfolgreiches Ergebnis | NEIN | JA (orderNumber enthält jetzt Originalformat) |

### 9.3 Operations-Reihenfolge

**Funktion: extractOrderNumber**
```
IST-Reihenfolge (aus dem echten Code):
  1. Zeile 144: const raw = value.trim()           — Trimmen
  2. Zeile 145: if (!raw) return ''                 — Leer-Check
  3. Zeile 146: const digits = raw.replace(/\D/g, '') — Destruktive Normalisierung
  4. Zeile 147: if (digits.length >= 5) return digits.slice(-5) — Letzte 5 Ziffern
  5. Zeile 148: return raw                          — Fallback: Original

SOLL-Reihenfolge (aus dem Plan):
  1. Zeile 144: const raw = value.trim()           — Trimmen
  2. Zeile 145: if (!raw) return ''                 — Leer-Check
  3. return raw                                     — Original zurückgeben

Abweichungen: Zeilen 146-147 werden entfernt. Keine Umordnung, nur Wegfall.
```

### 9.4 Datenstruktur-Verifikation

| Zugriff im Plan | Angenommene Struktur | Echte Typdefinition (Datei + Zeile + Code) | Stimmt? |
|---|---|---|---|
| `profile.orderNumberRegex` | `string` | types/index.ts:98 — `orderNumberRegex: string;` | JA |
| `op.orderNumber` | `string` (in ParsedOrderPosition) | orderParser.ts:415 — `orderNumber,` (Feld in push) | JA |
| `entry.position.orderNumber` | `string` (über PoolEntry.position) | run1PerfectMatch.ts:77 — `entry.position.orderNumber.slice(-5)` | JA |

### 9.5 Windkanal-Ergebnis

```bash
npx tsx scripts/windkanal-PROJ-45.ts
```

#### Teil A — Regex-Validierung (`^[12]\d\.?\d{3}$`)

| # | Input | Erwartet | Ergebnis | Status |
|---|-------|----------|----------|--------|
| 1 | "20.007" | PASS | PASS | OK |
| 2 | "20007" | PASS | PASS | OK |
| 3 | "10050" | PASS | PASS | OK |
| 4 | "10.050" | PASS | PASS | OK |
| 5 | "20.0074" | FAIL | FAIL | OK |
| 6 | "A1000" | FAIL | FAIL | OK |
| 7 | (space) | FAIL | FAIL | OK |
| 8 | (leer) | FAIL | FAIL | OK |
| 9 | null | FAIL | FAIL | OK |

**Teil A Ergebnis: ALLE OK**

#### Teil B — A12-Kanonisierung-Match (`replace(/\D/g, '').slice(-5)`)

| # | Input A | Input B | Canon A | Canon B | Match? | Erwartet | Status |
|---|---------|---------|---------|---------|--------|----------|--------|
| 1 | "20.007" | "20007" | 20007 | 20007 | JA | JA | OK |
| 2 | "10.050" | "10050" | 10050 | 10050 | JA | JA | OK |
| 3 | "20.007" | "10050" | 20007 | 10050 | NEIN | NEIN | OK |
| 4 | "10050" | "10050" | 10050 | 10050 | JA | JA | OK |

**Teil B Ergebnis: ALLE OK**

---
**Gesamtergebnis: BESTANDEN**

### 9.6 Abnahme

- [x] Scope-Validator JSON eingefügt
- [x] Validierungstabelle: Alle 14 Punkte 100% CONFI mit Code-Zitat
- [x] Exit-Pfad-Inventur: extractOrderNumber 3/3, scoreOrderNumberCandidates 1/1, parseOrderFile 4/4
- [x] Exit-Pfad-Inventur: Keine "Advance nötig = Ja"-Zeilen (reine Funktionen, kein Workflow)
- [x] Operations-Reihenfolge: Nur Wegfall, keine Umordnung
- [x] Datenstruktur-Verifikation: Alle Zugriffe stimmen
- [x] Windkanal: 9/9 Regex-Tests + 4/4 Kanonisierungs-Tests bestanden
- [ ] **Status → VALIDATED** (Wartet auf Dom-Review)

---

## 10. Abschluss-Checkliste für Sonnet

- [ ] `npx tsc --noEmit` ausgeführt und fehlerfrei
- [ ] Änderungen in dieser Projektdatei dokumentiert
- [ ] `features/INDEX.md` aktualisiert (falls betroffen)
- [ ] INVARIANTS.md geprüft — neue Regel? → Sektion B
- [ ] CIRCUIT.md geprüft — neue Verbindung? → Sektion B

---

## 11. Neue Vorschläge für INVARIANTS / CIRCUIT

**Für CIRCUIT.md Sektion B:**

> **B6. A12-Kanonisierung in Matching-Engine (Pool-Seite)**
> `CONFI: HIGH` — Die Pool-seitige orderNumber-Referenz nutzte bisher `op.orderNumber.slice(-5)` ohne `.replace(/\D/g, '')`, was nur funktionierte weil extractOrderNumber bereits zerstörerisch normalisiert hatte. Nach PROJ-45 enthält orderNumber das Originalformat. Die 4 Matching-Stellen MÜSSEN nun explizit kanonisieren.
> `QUELLE:` PROJ-45-RE-REGEX
> ```
> Pool-seitige Kanonisierung (PFLICHT ab PROJ-45):
>   orderMapper.ts:106      op.orderNumber.replace(/\D/g, '').slice(-5)
>   orderMapper.ts:144      op.orderNumber.replace(/\D/g, '').slice(-5)
>   run1PerfectMatch.ts:77  entry.position.orderNumber.replace(/\D/g, '').slice(-5)
>   run2PartialFillup.ts:78 entry.position.orderNumber.replace(/\D/g, '').slice(-5)
>
> PDF-Seite (bereits korrekt):
>   orderMapper.ts:104      candidateRef.replace(/\D/g, '').slice(-5)
>   orderMapper.ts:142      candidateRef.replace(/\D/g, '').slice(-5)
>   run1PerfectMatch.ts:71  candidateRef.replace(/\D/g, '').slice(-5)
>   run2PartialFillup.ts:73 candidateRef.replace(/\D/g, '').slice(-5)
> ```

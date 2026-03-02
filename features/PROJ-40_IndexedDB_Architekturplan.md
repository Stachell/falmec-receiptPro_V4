# PROJ-40: IndexedDB Optimierung & Datenmodell-Erweiterung

> **Status:** In Progress
> **Erstellt:** 2026-03-02
> **Autor:** Lead System Architect (Claude Opus 4.6)
> **Version:** 1.0 — Finaler Architekturplan nach Review

---

## 1. Context & Problem

Die IndexedDB-Persistenz hat drei kritische Architektur-Lecks:

1. **Globaler State-Bleed:** `parsedPositions` und `parserWarnings` sind global statt run-spezifisch — beim Laden von Run B überschreiben sie Run A.
2. **Unvollständige Rehydrierung:** `parsedInvoiceResult` (PDF-Preview), `serialDocument` (S/N-Excel für Neu-Verarbeiten) und Upload-Metadaten fehlen in `PersistedRunData`. Beim Reload sind Seriennummern-Felder leer und "Neu-Verarbeiten" unmöglich.
3. **Fehlende Datenfelder:** Lieferant (5-stellig), Vorgang (4-stellig) und descriptionDE fehlen im Datenmodell und können weder exportiert noch angezeigt werden.

---

## 2. Eiserne Regeln (für die Durchführung)

| # | Regel | Konsequenz bei Verstoß |
|---|---|---|
| 1 | **Plan-Modus vor Code** | Jede Phase beginnt mit Lesen der betroffenen Dateien. Kein blinder Code. |
| 2 | **INDEX.md wird aktualisiert** | Nichts passiert undokumentiert. |
| 3 | **Data Purity & Fail Fast** | Fehlerhafte Daten werden NICHT repariert — sie werden hart blockiert (severity: 'error'). |
| 4 | **KISS** | Bestehende Shadcn-Komponenten nutzen. Kein Over-Engineering. |
| 5 | **`tsc --noEmit` nach jeder Phase** | Zero Compile-Errors als Gate für die nächste Phase. |

---

## 3. Architekturplan — 7 Phasen

### Phase 1: Type-Definitionen (Foundation)

**Alle nachfolgenden Phasen hängen hiervon ab.**

#### 1A. `ArticleMaster` erweitern
**Datei:** `src/types/index.ts:335-344`

Zwei neue Felder:
```typescript
descriptionDE: string | null;   // "Artikelmatchcode" aus Sage-Artikelliste
supplierId: string | null;      // 5-stellige Lieferantennummer aus Sage
```

**Durchführungshinweis:** Nach dem Hinzufügen sofort `tsc --noEmit` laufen lassen. Alle Stellen, die `ArticleMaster` konstruieren (u.a. `masterDataParser.ts`, Mock-Daten), müssen die neuen Felder setzen.

#### 1B. `ExportColumnKey` Union-Type ändern
**Datei:** `src/types/index.ts:463-478`

| Alt | Neu | Label |
|---|---|---|
| `'qty'` | `'supplierId'` | Lieferant |
| `'eingangsart'` | `'orderVorgang'` | Vorgang |

**Durchführungshinweis:** Das ist ein Breaking Change für localStorage. Die Validierung in `exportConfigStore.ts:53` (`loadPersistedOrder()`) prüft das Key-Set und fällt automatisch auf Default zurück. Kein Migrations-Code nötig.

#### 1C. `PersistedRunData` erweitern (KOMPLETT)
**Datei:** `src/services/runPersistenceService.ts:31-41`

```typescript
export interface PersistedRunData {
  id: string;
  run: Run;
  invoiceLines: InvoiceLine[];              // enthält serialNumbers[] pro Zeile
  issues: Issue[];
  auditLog: AuditLogEntry[];
  parsedPositions: ParsedInvoiceLineExtended[];
  parserWarnings: InvoiceParserWarning[];
  // ── NEU für vollständige Rehydrierung ──
  parsedInvoiceResult: ParsedInvoiceResult | null;  // PDF-Preview
  serialDocument: SerialDocument | null;             // S/N-Excel für Neu-Verarbeiten
  uploadMetadata: PersistedUploadMeta[];             // Dateinamen + Typen der Uploads
  savedAt: string;
  sizeEstimateBytes: number;
}

/** Lean upload metadata (kein File-Binary — das liegt in fileStorageService) */
export interface PersistedUploadMeta {
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList';
  name: string;
  size: number;
  uploadedAt: string;
}
```

**Warum `serialDocument`?** Die `serialNumbers: string[]` auf `InvoiceLine` (Zeile 305) werden bereits über `invoiceLines` persistiert. Aber das `SerialDocument` (das geparste S/N-Input-Excel mit allen Rows + columnMapping) wird benötigt, damit "Neu-Verarbeiten" (Step-3-Re-Run) funktioniert OHNE erneuten Datei-Upload.

**Warum `uploadMetadata`?** Die File-Binaries liegen separat in `fileStorageService` (eigene IndexedDB `falmec-receiptpro-files`). Wir speichern nur die Metadaten (Name, Typ, Größe, Zeitstempel) pro Run, damit beim Laden eines archivierten Runs sichtbar ist, welche Dateien verwendet wurden.

**Kein DB_VERSION-Bump nötig:** IndexedDB Object Stores sind schemalos für Values. Die neuen Felder werden einfach als zusätzliche Properties im JSON-Blob gespeichert. Alte Runs haben diese Felder als `undefined` — der Load-Code muss `?? null` / `?? []` verwenden.

#### 1D. `OrderParserFieldAliases` um `vorgang` erweitern
**Datei:** `src/types/index.ts` (Interface OrderParserFieldAliases)

```typescript
vorgang: string[];    // 4-stellige Vorgangs-Nr.
```

---

### Phase 2: Parser & Matcher Erweiterungen

#### 2A. FALMEC_SCHEMA Aliases erweitern
**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts`

**supplierId-Aliases** (bestehend: `['Lieferant', 'Supplier', 'Fornitore', 'Hauptlieferant']`) ergänzen:
```
'Hersteller', 'Lieferantennummer', 'Lieferanten-Nr.', 'Lieferantennr.', 'fornitore'
```

**Neues Schema-Feld `descriptionDE`:**
```typescript
{
  fieldId: 'descriptionDE',
  label: 'Bezeichnung (DE)',
  aliases: ['Artikelmatchcode', 'Matchcode', 'Bezeichnung DE', 'Beschreibung', 'Beschreibung DE'],
  required: false,
}
```

**Durchführungshinweis:** Die Header-Erkennung nutzt substring-Inclusion mit `.toUpperCase()`. "Artikelmatchcode" wird also auch "ARTIKELMATCHCODE" und "Artikelmatchcode (Sage)" matchen.

#### 2B. masterDataParser — Felder extrahieren
**Datei:** `src/services/masterDataParser.ts`

Im ArticleMaster-Konstruktor:
```typescript
supplierId: idx('supplierId') >= 0 ? cellStr(row[idx('supplierId')]) : null,
descriptionDE: idx('descriptionDE') >= 0 ? cellStr(row[idx('descriptionDE')]) : null,
```

#### 2C. FAIL-FAST Lieferant-Validierung (GNADENLOS — 3 Blocker)
**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts` — in `crossMatch()`

| # | Bedingung | Aktion |
|---|---|---|
| 1 | Header `supplierId` nicht in Artikelliste gefunden | Issue: `severity: 'error'`, `type: 'parser-error'`, `message: 'Lieferant-Spalte nicht gefunden in Artikelliste'` |
| 2 | Zeile hat `supplierId` leer / `null` / `undefined` | Issue: `severity: 'error'`, `message: 'Lieferant fehlt für Artikel [artNo]'` |
| 3 | `supplierId` vorhanden aber NICHT `/^\d{5}$/` | Issue: `severity: 'error'`, `message: 'Lieferant ungueltig: "[value]" (erwartet: 5-stellig numerisch)'` |

**Es gibt KEIN Durchwinken.** Jede Verletzung erzeugt einen blockierenden Error im Fehlercenter.

**Durchführungshinweis:** Die Validierung muss NACH dem Header-Mapping aber VOR dem eigentlichen Cross-Match laufen. So kann der User den Fehler sofort sehen, ohne auf den vollständigen Match warten zu müssen. Die Issues bekommen `stepNo: 2` und den IssueType `'parser-error'` (bereits im System definiert).

#### 2D. descriptionDE + supplierId Durchreichung
**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts`

| Zeile | Alt | Neu |
|---|---|---|
| ~414 | `descriptionDE: null` | `descriptionDE: matchedArticle.descriptionDE ?? null` |
| ~419 | `supplierId: null` | `supplierId: matchedArticle.supplierId ?? null` |

Unmatched-Branches: bleiben `null` (kein Match = keine Stammdaten verfügbar).

#### 2E. Vorgang-Aliases im OrderParser
**Datei:** `src/services/matching/orderParserProfiles.ts`

- `ORDER_PARSER_ALIAS_FIELDS` Array: `'vorgang'` hinzufügen
- Default-Profil-Aliases: `vorgang: ['VORGANG', 'VORGANGSNUMMER', 'VORGANG-NR', 'VORGANGS-NR']`
- `cloneAliases()`: `vorgang: [...aliases.vorgang]` ergänzen

**Durchführungshinweis:** `MatcherProfileOverrides` und `OverrideEditorModal` müssen geprüft werden — wenn Vorgang dort nicht angezeigt werden soll, braucht es keinen UI-Override. Vorgang wird nur aus OpenWE gelesen.

#### 2F. Vorgang 4-stellig Validierung
**Datei:** `src/services/matching/orderParser.ts` oder `OrderMatcher.ts`

Wenn `vorgang` vorhanden aber nicht `/^\d{4}$/` → Warning-Issue (`severity: 'warning'`, `stepNo: 4`).

---

### Phase 3: Export-Spalten-Umstellung

#### 3A. DEFAULT_COLUMN_ORDER
**Datei:** `src/store/exportConfigStore.ts:15-31`

```
Position 6:  { columnKey: 'supplierId',    label: 'Lieferant' }    // war: qty / Menge
Position 14: { columnKey: 'orderVorgang',  label: 'Vorgang' }      // war: eingangsart / Eingangsart
```

#### 3B. ExportPanel resolveColumn
**Datei:** `src/components/run-detail/ExportPanel.tsx:44-61`

```typescript
// ENTFERNEN:
case 'qty':           return { tag: 'Quantity', value: String(line.qty) };
case 'eingangsart':   return { tag: 'Eingangsart', value: run.config.eingangsart };

// HINZUFÜGEN:
case 'supplierId':    return { tag: 'Lieferant', value: line.supplierId || '' };
case 'orderVorgang':  return { tag: 'Vorgang', value: line.orderVorgang || '' };
```

**Durchführungshinweis:** Die `qty` bleibt als Feld auf `InvoiceLine` bestehen und wird in der Tabelle angezeigt — sie wird nur aus dem EXPORT entfernt. Gleiches für `eingangsart` — bleibt im XML-Header (`<Eingangsart>`) als run-level Config, wird aber nicht mehr als per-line Export-Spalte geführt.

---

### Phase 4: UI — BEZEICHNUNG DE/IT Toggle

#### 4A. Switch-State
**Datei:** `src/components/run-detail/ItemsTable.tsx`

```typescript
import { Switch } from '@/components/ui/switch';
// ...
const [showDE, setShowDE] = useState(true);
```

#### 4B. Switch im Header (Zeile 314)
```tsx
<TableHead className={...}>
  <div className="flex items-center gap-1.5">
    <span>BEZEICHNUNG</span>
    <Switch checked={showDE} onCheckedChange={setShowDE} className="scale-75" />
    <span className="text-[10px] text-muted-foreground">{showDE ? 'DE' : 'IT'}</span>
  </div>
</TableHead>
```

**Durchführungshinweis:** `scale-75` auf dem Switch sorgt dafür, dass er visuell in die Header-Höhe passt. Die sticky-Klassen des Headers (`sticky top-0 z-20`) dürfen nicht brechen. Testen mit Scroll!

#### 4C. Zell-Rendering (Zeilen 379-393)
- `showDE=true` (Default): Primär = `descriptionDE ?? descriptionIT`, Sekundär = `descriptionIT` (nur wenn DE vorhanden)
- `showDE=false`: Nur `descriptionIT` als Primär, keine Sekundärzeile

---

### Phase 5: IndexedDB Payload-Erweiterung & Seriennummern

#### 5A. Auto-Save — VOLLSTÄNDIGE Payload
**Datei:** `src/hooks/useRunAutoSave.ts`

**Change-Detection erweitern** (nach Zeile 36):
```typescript
state.parsedInvoiceResult === prev.parsedInvoiceResult &&
state.serialDocument === prev.serialDocument &&
```

**Save-Payload erweitern** (Zeile 59):
```typescript
runPersistenceService.saveRun({
  id: runId,
  run: current.currentRun!,
  invoiceLines: runLines,                                              // mit descriptionIT-Truncation (siehe 5B)
  issues: runIssues,
  auditLog: runAudit,
  parsedPositions: /* run-aware guard, siehe Phase 6 */,
  parserWarnings: /* run-aware guard, siehe Phase 6 */,
  parsedInvoiceResult: current.parsedInvoiceResult ?? null,            // NEU
  serialDocument: current.serialDocument ?? null,                       // NEU
  uploadMetadata: current.uploadedFiles.map(f => ({                    // NEU
    type: f.type, name: f.name, size: f.size, uploadedAt: f.uploadedAt,
  })),
});
```

#### 5B. descriptionIT-Truncation (Sonderregel)
**Datei:** `src/hooks/useRunAutoSave.ts`

```typescript
const runLines = current.invoiceLines
  .filter(l => l.lineId.startsWith(linePrefix))
  .map(l => ({
    ...l,
    descriptionIT: l.descriptionIT ? l.descriptionIT.substring(0, 10) : l.descriptionIT,
  }));
```

**Nur für Persistenz** — im Memory bleibt der volle String erhalten.

#### 5C. loadPersistedRun — Vollständige Rehydrierung
**Datei:** `src/store/runStore.ts:3119-3161`

```typescript
return {
  runs: updatedRuns,
  currentRun: data.run,
  invoiceLines: [...data.invoiceLines, ...otherLines],
  issues: [...data.issues, ...otherIssues],
  auditLog: [...data.auditLog, ...otherAudit],
  parsedPositions: data.parsedPositions,
  parserWarnings: data.parserWarnings,
  parsedInvoiceResult: data.parsedInvoiceResult ?? null,   // NEU: PDF-Preview
  serialDocument: data.serialDocument ?? null,              // NEU: S/N-Excel
  currentParsedRunId: runId,                                // NEU: Run-Isolierung (Phase 6)
};
```

**Durchführungshinweis für Abwärtskompatibilität:** Alte PersistedRunData-Records haben `parsedInvoiceResult`, `serialDocument` und `uploadMetadata` als `undefined`. Der `?? null` / `?? []` Fallback in `loadPersistedRun` fängt das ab. Kein Migration-Script nötig.

#### 5D. Asynchronitäts-Prüfung (Architektur-Review)

| State-Feld | Persistenz-Ort | Reload-Verhalten | Risiko |
|---|---|---|---|
| `parsedInvoiceResult` | localStorage (400KB) + IndexedDB (NEU) | localStorage sync, IndexedDB async | **MITTEL:** App-Boot zeigt u.U. Result vom letzten Run. → `loadPersistedRun` überschreibt. |
| `serialDocument` | nur Memory (BISHER) → IndexedDB (NEU) | Ging bei Refresh verloren | **HOCH → behoben.** |
| `uploadedFiles` | localStorage (Meta) + fileStorageService (Binaries) | Meta sync, Binaries async | **NIEDRIG:** Nur UI-Anzeige. |
| `preFilteredSerials` | MEMORY ONLY (by design, PROJ-20) | Gehen bei Refresh verloren | **AKZEPTIERT.** Werden bei Step-3 neu generiert. |
| `orderPool` | nur Memory | Geht bei Refresh verloren | **NIEDRIG.** Wird bei Step-4 neu generiert. |

---

### Phase 6: Run-Isolierung (Kritisch)

#### 6A. parsedPositions/parserWarnings Run-aware machen
**Datei:** `src/store/runStore.ts`

**Ansatz (KISS — kein Store-Shape-Umbau):**

Neues State-Feld: `currentParsedRunId: string | null`

1. **Beim PDF-Parse** (`setParsedInvoiceResult`, ~Zeile 1185): `currentParsedRunId = runId` setzen
2. **In useRunAutoSave.ts** — Guard vor Save:
   ```typescript
   parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : [],
   parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : [],
   ```
3. **In loadPersistedRun()** (Zeile 3144): `currentParsedRunId = runId` mitsetzen

**Warum kein `Record<string, ...[]>` Store-Umbau?** Das würde JEDEN Consumer von `parsedPositions`/`parserWarnings` brechen und eine massive Refaktorierung erzwingen. Der `currentParsedRunId`-Guard erreicht dasselbe Ziel mit minimalem Eingriff.

#### 6B. URL-Fallback in RunDetail.tsx
**Datei:** `src/pages/RunDetail.tsx:283-290`

```typescript
const [loadingPersisted, setLoadingPersisted] = useState(false);

useEffect(() => {
  if (!decodedRunId) return;
  const inMemory = runs.find(r => r.id === decodedRunId);
  if (inMemory) return;

  setLoadingPersisted(true);
  useRunStore.getState().loadPersistedRun(decodedRunId)
    .then((found) => {
      if (!found) console.warn(`[RunDetail] Run ${decodedRunId} weder in Memory noch IndexedDB`);
    })
    .finally(() => setLoadingPersisted(false));
}, [decodedRunId, runs]);
```

Loading-Spinner anzeigen wenn `loadingPersisted === true`.

---

### Phase 7: Housekeeping

#### 7A. INDEX.md aktualisieren
**Datei:** `features/INDEX.md` — PROJ-40 Eintrag mit Status "In Progress".

#### 7B. TypeScript-Kompilierung
`npx tsc --noEmit` — finaler Gate-Check, Zero Errors.

---

## 4. Ausführungsreihenfolge

```
Phase 1 (Types)             ← Grundlage, IMMER ZUERST
    ↓
Phase 2 (Parser/Matcher)    ← braucht Phase 1
    ↓
Phase 3 (Export)  ──┐       ← braucht Phase 1
Phase 4 (UI)      ──┤       ← unabhängig, parallel möglich
                    ↓
Phase 5 (IndexedDB)          ← braucht Phase 1 + 2
Phase 6 (Run-Isolierung)     ← braucht Phase 5
    ↓
Phase 7 (Housekeeping)       ← zuletzt
```

**Gate zwischen Phasen:** `npx tsc --noEmit` muss nach jeder Phase 0 Errors zeigen, bevor die nächste Phase beginnt.

---

## 5. Verifikation (End-to-End Checkliste)

- [ ] **`npx tsc --noEmit`** — Zero Errors
- [ ] **Lieferant Fail-Fast (4 Tests):**
  - [ ] Artikelliste OHNE Lieferant-Spalte → Error im Fehlercenter
  - [ ] Artikelliste mit leerer Lieferant-Zelle → Error pro Zeile
  - [ ] Artikelliste mit "ABC12" als Lieferant → Error "ungueltig"
  - [ ] Artikelliste mit "12345" → Pass, kein Error
- [ ] **descriptionDE Flow:** Artikelliste mit "Artikelmatchcode"-Spalte → descriptionDE auf InvoiceLine nach Step 2
- [ ] **BEZEICHNUNG Toggle:** Switch in Tabelle → DE/IT wechseln, Layout bricht nicht
- [ ] **Export:** Settings → Position 6 = "Lieferant", Position 14 = "Vorgang". XML → `<Lieferant>` + `<Vorgang>` pro Zeile
- [ ] **Seriennummern-Rehydrierung:** Run mit S/N → Refresh → `/run/<id>` → serialNumbers vorhanden + serialDocument im Store
- [ ] **PDF-Preview:** Run aus IndexedDB laden → PDF-Preview funktioniert
- [ ] **Run-Isolierung:** Run A → Run B per URL laden → parsedPositions = Run B
- [ ] **descriptionIT-Truncation:** DevTools > IndexedDB → gespeicherte descriptionIT max 10 Zeichen

---

## 6. Betroffene Dateien (Komplett)

| Datei | Phase | Änderungsart |
|---|---|---|
| `src/types/index.ts` | 1 | ArticleMaster, ExportColumnKey, OrderParserFieldAliases erweitern |
| `src/services/runPersistenceService.ts` | 1 | PersistedRunData + PersistedUploadMeta |
| `src/services/matchers/modules/FalmecMatcher_Master.ts` | 2 | Schema-Aliases, Fail-Fast, Durchreichung |
| `src/services/masterDataParser.ts` | 2 | supplierId + descriptionDE extrahieren |
| `src/services/matching/orderParserProfiles.ts` | 2 | vorgang-Aliases |
| `src/services/matching/orderParser.ts` / `OrderMatcher.ts` | 2 | Vorgang-Validierung |
| `src/store/exportConfigStore.ts` | 3 | DEFAULT_COLUMN_ORDER |
| `src/components/run-detail/ExportPanel.tsx` | 3 | resolveColumn |
| `src/components/run-detail/ItemsTable.tsx` | 4 | BEZEICHNUNG Switch Toggle |
| `src/hooks/useRunAutoSave.ts` | 5+6 | Payload + Truncation + Run-Guard |
| `src/store/runStore.ts` | 5+6 | Rehydrierung + currentParsedRunId |
| `src/pages/RunDetail.tsx` | 6 | URL-Fallback |
| `features/INDEX.md` | 7 | PROJ-40 Eintrag |

---

## ADD-ON: PROJ-40 Bugfix (3 Bugs nach Erstimplementierung)

> **Status:** Offen — wartet auf Ausführung
> **Erstellt:** 2026-03-02
> **Autor:** Lead System Architect (Claude Opus 4.6)
> **Ausführender Agent:** Claude Sonnet 4.6 (mit Thinking)

---

### ADD-ON Kontext

Nach Abschluss der PROJ-40 Erstimplementierung wurden 3 Bugs identifiziert. Dieses ADD-ON dokumentiert Root-Cause-Analyse und präzisen Behebungsplan. **Alle drei Bugs betreffen nur 2 Dateien.**

---

### ADD-ON Bug 1: „Lieferant fehlt für 214 Artikel" — Validierung auf Item-Level verschieben

#### Symptom
214 von 295 Artikeln blockieren den gesamten Lauf mit `severity: 'error'`. Viele dieser Artikel sind Werbemittel ohne gepflegten Lieferanten — der harte Blocker ist hier geschäftslogisch falsch.

#### Root Cause
**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts` — Zeilen 158-225

Die drei Blocker in `crossMatch()` laufen als **Pre-Checks** VOR dem Matching:

| Blocker | Zeilen | Prüfung | Aktuell | NEU |
|---------|--------|---------|---------|-----|
| 1 | 163-178 | Spalte komplett fehlend (`articles.every(a => a.supplierId === null)`) | `severity: 'error'` | **BLEIBT HART — keine Änderung** |
| 2 | 179-198 | Einzelne Zellen leer (`supplierId === null`) | `severity: 'error'` | **ENTFERNEN** |
| 3 | 201-224 | Format ungültig (`!/^\d{5}$/`) | `severity: 'error'` | **ENTFERNEN** |

#### Implementierungsanweisung (für ausführenden Agent)

**WICHTIG: Die Eiserne Regel Nr. 3 aus Abschnitt 2 ("Fail Fast — severity: 'error'") wird für Blocker 2 und 3 EXPLIZIT AUFGEHOBEN. Der Header-Check (Blocker 1) bleibt weiterhin ein harter Error.**

##### Schritt 1: Blocker 2 und 3 entfernen

In `crossMatch()` den gesamten `else`-Block nach Blocker 1 löschen — das sind die Zeilen 179-225 (von `} else {` bis zur schließenden Klammer `}` vor dem Kommentar `// ── Ende Fail-Fast`).

**Der Code ab Zeile 179 sieht so aus:**
```typescript
    } else {
      // Blocker 2: Zeile hat supplierId null (Spalte vorhanden, Zelle leer)
      const missingSupplier = articles.filter(a => a.supplierId === null);
      // ... bis Zeile 224
    }
    // ── Ende Fail-Fast ──────
```

**Ersetze den gesamten `} else { ... }` Block durch nur die schließende Klammer `}`:**
```typescript
    }
    // ── Ende Fail-Fast ──────
```

##### Schritt 2: Per-Line Supplier-Warnung NACH dem Match-Loop einfügen

**Position:** Nach Zeile 257 (`const updatedLines: InvoiceLine[] = matchResults.map(r => r.line);`) und VOR Zeile 259 (`const stats = this.computeStats(updatedLines);`).

Die Variable `SUPPLIER_REGEX` kann oben bleiben (wird jetzt nur hier unten verwendet). Die Variable für den Timestamp muss dort definiert werden, da die bisherige `now2C` (Zeile 160) ggf. entfällt. Nutze die bestehende Variable `now` (Zeile 277) oder definiere sie früher.

**Einzufügender Code:**
```typescript
    // ── Post-Match: Per-Line Supplier-Validierung (PROJ-40 ADD-ON) ──────
    const supplierIssueLines = updatedLines.filter(
      l => l.matchStatus !== 'no-match' && l.matchStatus !== 'pending'
        && (!l.supplierId || !SUPPLIER_REGEX.test(l.supplierId))
    );
    if (supplierIssueLines.length > 0) {
      const now = new Date().toISOString();
      issues.push({
        id: `issue-${runId}-step2-supplier-item-${Date.now()}`,
        runId,
        severity: 'warning',
        stepNo: 2,
        type: 'supplier-missing',
        message: `Lieferant fehlt/ungültig bei ${supplierIssueLines.length} gematchten Artikeln`,
        details: supplierIssueLines
          .map(l => `${l.falmecArticleNo || l.manufacturerArticleNo}: "${l.supplierId ?? 'leer'}"`)
          .join(', '),
        relatedLineIds: supplierIssueLines.map(l => l.lineId),
        affectedLineIds: supplierIssueLines.map(l => l.lineId),
        status: 'open',
        createdAt: now,
        resolvedAt: null,
        resolutionNote: null,
      });
    }
```

**Hinweis für den Agent:** Prüfe ob der `IssueType` `'supplier-missing'` im Union-Type in `src/types/index.ts` existiert. Falls nicht, muss er dort ergänzt werden (suche nach `type IssueType` oder dem Typ-Literal auf dem `type`-Feld des `Issue`-Interface). Falls das Feld `type` ein freier String ist, ist keine Änderung nötig.

##### Schritt 3: Aufräumen

- Falls `now2C` (Zeile 160) nur für Blocker 2/3 genutzt wurde und Blocker 1 eine eigene Timestamp-Variable hat → `now2C` entfernen
- Falls `SUPPLIER_REGEX` (Zeile 159) nur für Blocker 3 genutzt wurde → prüfen ob es oben bleiben muss (Antwort: JA, es wird jetzt im Post-Match-Block gebraucht)

---

### ADD-ON Bug 2: Bezeichnung DE wird nicht gemappt — Alias `Matchcode_Artikel` fehlt

#### Symptom
`descriptionDE` bleibt für alle Artikel `null`. Die deutsche Bezeichnung wird in der UI nicht angezeigt.

#### Root Cause
**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts` — Zeile 133

Die Sage-Artikelliste hat die Spalte `Matchcode_Artikel` — dieser Name fehlt in der Alias-Liste für `descriptionDE`.

**Aktuell (Zeile 133):**
```typescript
aliases: ['Artikelmatchcode', 'Matchcode', 'Bezeichnung DE', 'Beschreibung', 'Beschreibung DE'],
```

#### Implementierungsanweisung

**Ersetze die Alias-Liste auf Zeile 133 durch:**
```typescript
aliases: [
  'Artikelmatchcode', 'Matchcode',
  'Bezeichnung DE', 'Beschreibung', 'Beschreibung DE',
  'Matchcode_Artikel', 'Matchcode Artikel',
  'Artikelbezeichnung', 'Bezeichnung', 'Kurztext',
  'Artikelname', 'Langtext',
],
```

**Hinweis:** Der Header-Matching im `masterDataParser.ts` nutzt `.trim().toUpperCase()` — daher matcht `Matchcode_Artikel` automatisch auch `MATCHCODE_ARTIKEL` und Varianten mit unterschiedlicher Groß-/Kleinschreibung. Unterstriche werden NICHT entfernt, deshalb brauchen wir sowohl `Matchcode_Artikel` (mit Unterstrich) als auch `Matchcode Artikel` (mit Leerzeichen).

---

### ADD-ON Bug 3: DE/IT Toggle fehlt im Tab „RE-Positionen"

#### Symptom
Der Kippschalter (Toggle) zum Umschalten zwischen Bezeichnung IT und Bezeichnung DE existiert im Tab „Artikelliste" (`ItemsTable.tsx`), fehlt aber im Tab „RE-Positionen" (`InvoicePreview.tsx`).

#### Root Cause
**Datei:** `src/components/run-detail/InvoicePreview.tsx`

| Aspekt | ItemsTable.tsx (funktioniert) | InvoicePreview.tsx (fehlt) |
|--------|-------------------------------|---------------------------|
| `showDE` State | Zeile 66: `const [showDE, setShowDE] = useState(true)` | **Fehlt** |
| Switch Import | Vorhanden | **Fehlt** |
| Header-Toggle | Zeile 318-323: Switch + Label | Zeile 395: nur Text `BEZEICHNUNG` |
| Zell-Rendering | Zeile 389-414: DE/IT mit Fallback | Zeile 465-472: nur `position.descriptionIT` |

#### Implementierungsanweisung

##### Schritt 1: Import hinzufügen

Am Anfang von `InvoicePreview.tsx`, bei den bestehenden Imports aus `@/components/ui/`:
```typescript
import { Switch } from '@/components/ui/switch';
```

##### Schritt 2: State hinzufügen

Bei den bestehenden `useState`-Deklarationen in der Komponente:
```typescript
const [showDE, setShowDE] = useState(true);
```

**Hinweis:** `useState` sollte bereits importiert sein (die Komponente nutzt es für andere States).

##### Schritt 3: Header „BEZEICHNUNG" ersetzen (Zeile 395)

**Alt (Zeile 395):**
```tsx
<TableHead className={expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>BEZEICHNUNG</TableHead>
```

**Neu:**
```tsx
<TableHead className={expandedPositions ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}>
  <div className="flex items-center gap-1.5">
    <span>BEZEICHNUNG</span>
    <Switch checked={showDE} onCheckedChange={setShowDE} className="scale-75" />
    <span className="text-[10px] text-muted-foreground">{showDE ? 'DE' : 'IT'}</span>
  </div>
</TableHead>
```

##### Schritt 4: Zell-Rendering ersetzen (Zeilen 464-472)

**WICHTIG — Datenzugriff:** `InvoicePreview` arbeitet mit `ParsedInvoiceLineExtended`-Positionen (Variable `position`), die KEIN `descriptionDE` haben. Die `descriptionDE` existiert nur auf `InvoiceLine` (nach Step-2-Matching). Zugriff über `posStatus?.representativeLine?.descriptionDE` — die Variable `posStatus` ist bereits vorhanden (Zeile 404: `const posStatus = positionStatusMap.get(position.positionIndex)`).

**Alt (Zeilen 464-472):**
```tsx
{/* Col 7: Bezeichnung — dynamic width, truncate by available space */}
<TableCell className="min-w-0">
  <div
    className="text-xs truncate w-full"
    title={position.descriptionIT || position.manufacturerArticleNo}
  >
    {position.descriptionIT || position.manufacturerArticleNo || ''}
  </div>
</TableCell>
```

**Neu:**
```tsx
{/* Col 7: Bezeichnung — DE/IT Toggle (PROJ-40 ADD-ON) */}
<TableCell className="min-w-0">
  {showDE ? (
    <>
      <div className="text-xs truncate w-full"
           title={posStatus?.representativeLine?.descriptionDE ?? position.descriptionIT ?? undefined}>
        {posStatus?.representativeLine?.descriptionDE ?? position.descriptionIT ?? ''}
      </div>
      {posStatus?.representativeLine?.descriptionDE && position.descriptionIT && (
        <div className="text-[11px] text-muted-foreground truncate w-full"
             title={position.descriptionIT ?? undefined}>
          {position.descriptionIT}
        </div>
      )}
    </>
  ) : (
    <div className="text-xs truncate w-full"
         title={position.descriptionIT ?? position.manufacturerArticleNo}>
      {position.descriptionIT || position.manufacturerArticleNo || ''}
    </div>
  )}
</TableCell>
```

**Verhalten:**
- **DE-Modus (Standard):** Zeigt `descriptionDE` als Primärtext. Falls vorhanden, zeigt `descriptionIT` als graue Sekundärzeile. Falls kein `descriptionDE` existiert (z.B. vor Step 2), fällt auf `descriptionIT` zurück.
- **IT-Modus:** Zeigt nur `descriptionIT` (wie bisher), Fallback auf `manufacturerArticleNo`.

---

### ADD-ON Betroffene Dateien (Komplett)

| # | Datei | Bug | Änderung |
|---|-------|-----|----------|
| 1 | `src/services/matchers/modules/FalmecMatcher_Master.ts` | Bug 1 | Blocker 2+3 entfernen, Post-Match Warning einfügen |
| 2 | `src/services/matchers/modules/FalmecMatcher_Master.ts` | Bug 2 | `descriptionDE` Alias-Liste erweitern um `Matchcode_Artikel` + weitere |
| 3 | `src/components/run-detail/InvoicePreview.tsx` | Bug 3 | Switch Import + State + Header + Zell-Rendering |
| 4 | `src/types/index.ts` | Bug 1 | Ggf. `IssueType` um `'supplier-missing'` erweitern (nur falls Union-Type) |

### ADD-ON Verifikation

- [ ] **Bug 1:** Artikelliste mit teilweise leeren Lieferantennummern hochladen → Matching läuft durch, Warnung (nicht Error!) im Fehlercenter
- [ ] **Bug 1:** Artikelliste OHNE Lieferant-Spalte → weiterhin harter Error (Blocker 1 unverändert)
- [ ] **Bug 2:** Artikelliste mit Spalte „Matchcode_Artikel" hochladen → `descriptionDE` wird korrekt erkannt und angezeigt
- [ ] **Bug 3:** Tab „RE-Positionen" → Toggle betätigen → Ansicht wechselt zwischen DE (Standard) und IT
- [ ] **Bug 3:** Vor Step 2 (kein Matching): Toggle auf DE zeigt Fallback auf `descriptionIT`
- [ ] **Regression:** `npx tsc --noEmit` → Zero Errors
- [ ] **Regression:** Bestehende Runs laden, Export prüfen, alle Tabs durchklicken

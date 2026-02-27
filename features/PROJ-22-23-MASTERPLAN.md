# PROJ-22 + PROJ-23: MASTERPLAN
# Enterprise UI/UX Polish + Architecture Pivot

> **Erstellt:** 2026-02-21
> **Status:** GEPLANT — Warte auf Execution-Freigabe
> **Scope:** Massiver Architektur-Pivot (State, OrderMapper, Persistenz) + Frontend-Polish

---

## Inhaltsverzeichnis

1. [Kontext & Motivation](#kontext--motivation)
2. [PROJ-23: Architecture Pivot (Phasen A1-A5)](#proj-23-architecture-pivot)
3. [PROJ-22: Enterprise UI/UX Polish (Phasen B1-B5)](#proj-22-enterprise-uiux-polish)
4. [Differenzierte READ-ONLY Regel](#differenzierte-read-only-regel)
5. [Dependency Graph & Sequenzierung](#dependency-graph--sequenzierung)
6. [Neue Dateien & Modifikationen](#neue-dateien--modifikationen)
7. [Verifikationsplan](#verifikationsplan)
8. [Agent Delegation](#agent-delegation)

---

## Kontext & Motivation

### Probleme im IST-Zustand

1. **Datenverlust bei F5:** Nach Page-Reload gehen alle Run-Daten verloren. Nur ArticleMaster[] (IndexedDB) und File-Metadaten (localStorage) ueberleben. localStorage ist auf 5MB limitiert.
2. **Blinde Order-Ladung:** Der OrderMapper laedt ALLE offenen Bestellungen ohne Filterung nach Rechnungsartikeln.
3. **Sofortige Expansion:** Step 1 expandiert sofort 45 Positionen zu ~295 Einzelzeilen (qty=1). Dies verhindert aggregierte Matching-Logik.
4. **Keine manuelle Rueckgabe:** Manuelle Bestellungs-Reassignment kann Bestellungen nicht in den Pool zuruecklegen.
5. **UI-Defizite:** Keine Sticky-Headers, inkonsistente Tabellen, kein Archiv-Zugriff auf alte Runs.

### Ziel-Zustand

- Vollstaendige Run-Persistenz in IndexedDB (ueberlebt F5, historischer Zugriff bis 12 Monate)
- Article-First OrderPool: Nur relevante Bestellungen werden geladen
- 3-Run Matching-Engine: Aggregiert (Runs 1-2) -> Expansion + FIFO (Run 3)
- Bidirektionales manuelles Assignment mit Pool-Tracking
- Polished Enterprise-UI mit Sticky-Headers, konsistenten Tabellen, Settings-Tabs

---

## PROJ-23: Architecture Pivot

### Phase A1: Aggregated-First Line Model (FOUNDATION)

**Ziel:** Step 1 speichert aggregierte Zeilen (qty>1) statt expandierter Einzelzeilen.

**Aktueller Zustand:**
- `expandInvoiceLines()` in `src/services/invoiceParserService.ts` (Zeile 128-204) wird in `updateRunWithParsedData()` (runStore.ts Zeile 1093) aufgerufen
- Ergebnis: 45 Positionen -> ~295 InvoiceLine mit qty=1

**Neuer Zustand:**
- `createAggregatedInvoiceLines()` erzeugt eine InvoiceLine pro geparster Position mit originalem `qty` (z.B. qty=7)
- LineId-Schema: `{runId}-line-{positionIndex}` (ohne `-{expansionIndex}` Suffix)
- `serialNumbers: []` bleibt leer (befuellt in Step 3)
- `allocatedOrders: []` bleibt leer (befuellt in Step 4)

**Migration-Strategie: SOFT-MIGRATION**
- `expandInvoiceLines()` bleibt im Code (markiert als `@deprecated`), wird aber im aktiven Workflow NICHT mehr aufgerufen
- Step 1 nutzt ab sofort 100% die neue `createAggregatedInvoiceLines()`
- Die Legacy-Funktion dient als Backup-Referenz und wird erst geloescht wenn alle Phasen getestet und abgenommen sind

**Dateien:**

| Datei | Aenderung |
|-------|-----------|
| `src/services/invoiceParserService.ts` | Neue Funktion `createAggregatedInvoiceLines()`, `expandInvoiceLines()` als `@deprecated` markieren |
| `src/types/index.ts` | `isExpanded: boolean` zu `Run` Interface hinzufuegen |
| `src/store/runStore.ts` | `expandInvoiceLines()` Aufruf (Zeile 1093) durch `createAggregatedInvoiceLines()` ersetzen. `isExpanded: false` bei neuen Runs |
| `src/components/run-detail/ItemsTable.tsx` | Beide Modi (aggregiert qty>1 und expandiert qty=1) basierend auf `run.isExpanded` darstellen |
| `src/components/run-detail/InvoicePreview.tsx` | Positionsstatus vereinfachen — jede Zeile IST eine Position |

**Downstream-Audit:**
- Step 2 (`executeMatcherCrossMatch`): Matcht nach Artikel-Identifiern, nicht qty -> funktioniert unveraendert
- Step 3 (`executeMatcherSerialExtract`): Muss `serialNumbers[]` Array befuellen (N Eintraege fuer qty=N)
- Step 4 (`executeOrderMapping`): Bereits fuer aggregierte Positionen dokumentiert

**Stolpersteine:**
- Alle Komponenten die `invoiceLines` aus dem Store lesen muessen beide Zustaende (aggregiert vs. expandiert) ueber `currentRun.isExpanded` unterscheiden
- `lineId`-Format wechselt: `{runId}-line-{pos}` (aggregiert) -> `{runId}-line-{pos}-{exp}` (nach Expansion)
- Issue `relatedLineIds` muessen beide Formate handhaben

---

### Phase A2: State-Persistenz ("Hausmeister") via IndexedDB

**Ziel:** Auto-Save gesamter Run-State in IndexedDB. Historische Runs laden. Speicher-Waechter.

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `src/services/runPersistenceService.ts` | Raw IndexedDB Wrapper (folgt `fileStorageService.ts` Pattern — KEINE externe Library) |
| `src/hooks/useRunAutoSave.ts` | Zustand `.subscribe()` + 2s Debounce Auto-Save |

**IndexedDB Schema** (Datenbank: `falmec-receiptpro-runs`, Version 1):

| Object Store | keyPath | Indexes | Inhalt |
|---|---|---|---|
| `runs` | `id` | `createdAt` | Vollstaendiger Run + invoiceLines + issues + auditLog pro Run |
| `metadata` | `key` | — | Storage-Statistiken Singleton |

**Persistiertes Objekt pro Run:**
```typescript
interface PersistedRunData {
  id: string;                          // Run.id = keyPath
  run: Run;                            // Vollstaendiges Run-Objekt
  invoiceLines: InvoiceLine[];         // Alle Zeilen dieses Runs
  issues: Issue[];                     // Alle Issues dieses Runs
  auditLog: AuditLogEntry[];
  parsedPositions: ParsedInvoiceLineExtended[];
  parserWarnings: InvoiceParserWarning[];
  orderPool: SerializedOrderPool | null; // Fuer manuelle Resolution nach Reload
  savedAt: string;                     // ISO Timestamp
  sizeEstimateBytes: number;           // JSON.stringify(data).length * 2
}
```

**NICHT persistiert** (volatile):
- `preFilteredSerials` — explizit memory-only, cleared nach Step 4
- `serialDocument` — explizit memory-only, cleared nach Step 4
- Uploaded File Binaries — bereits in separater `falmec-receiptpro-files` IndexedDB

**Warum KEIN Zustand persist Middleware:**
- Serialisiert gesamten Store auf jeden State-Change (Performance)
- Kein individuelles Run-Laden moeglich
- Keine Groessen-Schaetzung pro Run

**Auto-Save Hook:**
```typescript
// useRunAutoSave.ts — einmal in App.tsx aufgerufen
useRunStore.subscribe((state, prev) => {
  if (!state.currentRun) return;
  if (state.currentRun === prev.currentRun &&
      state.invoiceLines === prev.invoiceLines &&
      state.issues === prev.issues) return;
  // Debounce 2s, dann aktiven Run in IndexedDB speichern
});
```

**Neue Store-Actions in `runStore.ts`:**
- `loadPersistedRun(runId)`: Store aus IndexedDB hydrieren
- `loadPersistedRunList()`: Metadata-Only Liste fuer Archiv-Seite

**Speicher-Waechter:**
- `getStorageStats()`: Runs zaehlen + Gesamtgroesse via IndexedDB Cursor
- Warnung bei >50 Runs ODER >50MB geschaetzt
- UI-Meldung: "Speicher voll. Bitte Archiv synchronisieren"

**Archiv-Synchronisation (Settings-Button):**
- Nutzt **File System Access API** (`window.showDirectoryPicker()`)
- User waehlt Zielordner, JSONs werden direkt geschrieben
- Nur Chromium-Browser (Chrome/Edge) — kein Fallback noetig (Enterprise-App)
- Purge Runs > 12 Monate nach Export

**"Alten Run laden" auf Index.tsx:**
- On Mount: `loadPersistedRunList()` -> merge mit in-session `runs[]`
- Klick "oeffnen" auf persistierten Run -> `loadPersistedRun(runId)` -> navigate zu RunDetail

---

### Phase A3: Article-First OrderPool

**Ziel:** Nur Bestellungen laden deren ArtNoDE einem Rechnungsartikel entspricht.

**Neue Datei:**

| Datei | Zweck |
|-------|-------|
| `src/services/matching/orderPool.ts` | OrderPool Build/Consume/Return Operationen |

**Interfaces:**
```typescript
export interface OrderPoolEntry {
  position: ParsedOrderPosition;
  initialQty: number;       // Original openQuantity
  consumedQty: number;      // Bisher verbraucht
  remainingQty: number;     // = initialQty - consumedQty
}

export interface OrderPool {
  byArticle: Map<string, OrderPoolEntry[]>;  // artNoDE -> Entries (sorted oldest-first)
  byId: Map<string, OrderPoolEntry>;         // position.id -> Entry (O(1) Lookup)
  totalRemaining: number;
}
```

**`buildOrderPool(parsedOrders, invoiceLines, masterArticles)`:**
1. Sammle alle `falmecArticleNo` Werte aus Invoice Lines (nach Step 2 Matching)
2. Filtere `parsedOrders` auf nur jene wo `artNoDE` einem Rechnungsartikel entspricht
3. **Validation (Soft-Fail):** Bestellung hat `artNoDE` aber WEDER `ean` NOCH `artNoIT` -> Issue `severity: 'warning'`
4. Sortiere per Artikel: `orderYear ASC, belegnummer ASC`
5. **Composite Key:** Alle Referenzen verwenden `YYYY-XXXXX` Format

**Pool-Mutationen:**
- `consumeFromPool(pool, positionId, qty)`: `remainingQty -= qty`, `consumedQty += qty`
- `returnToPool(pool, positionId, qty)`: Umkehrung — fuer bidirektionales manuelles Assignment

**Store-Integration:**
```typescript
// Neues Feld in RunState:
orderPool: OrderPool | null;  // Gesetzt in Step 4, persistiert fuer manuelle Resolution
```

---

### Phase A4: 3-Run Matching Engine + Expansion

**Ziel:** Ersetze Single-Pass Waterfall durch 3 sequentielle Runs.

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `src/services/matching/matchingEngine.ts` | 3-Run Orchestrator |
| `src/services/matching/runs/run1PerfectMatch.ts` | Aggregiert: ArtNo + PDF-Ref + exakte Menge |
| `src/services/matching/runs/run2PartialFillup.ts` | Aggregiert: PDF-Refs ohne Perfect Match, Auffuellung |
| `src/services/matching/runs/run3ExpandFifo.ts` | Expansion + FIFO fuer verbleibende Einzelzeilen |

**Run 1 — Perfect Match (Aggregiert):**
- Fuer jede aggregierte Zeile: Pruefe PDF `orderCandidates` gegen OrderPool
- Match wenn: `orderCandidate` matcht Pool-Eintrag UND `pool.remainingQty === line.qty`
- **Aelteste zuerst bei Duplikaten:** `2024-10153` vor `2025-10153`
- Consume aus Pool, setze `allocatedOrders: [{orderNumber, orderYear, qty: line.qty, reason: 'perfect-match'}]`

**Run 2 — Partial/Fillup (Aggregiert):**
- Zeilen mit PDF-Refs die keinen Perfect Match bekamen
- Fuelllogik: Ref-Match -> alloziere verfuegbare Menge (Partial)
- Smart-Qty-Match: Genau EINE Bestellung mit remaining === verbleibende Menge
- Rest bleibt unassigned (fuer Run 3)

**Run 3 — Expansion + FIFO (KRITISCHER UEBERGANG):**

```typescript
function expandForMatching(aggregatedLines: InvoiceLine[], runId: string): InvoiceLine[] {
  const expanded: InvoiceLine[] = [];
  for (const line of aggregatedLines) {
    for (let i = 0; i < line.qty; i++) {
      expanded.push({
        ...line,
        lineId: `${runId}-line-${line.positionIndex}-${i}`,
        qty: 1,
        expansionIndex: i,
        totalLineAmount: line.unitPriceInvoice,
        // Serials verteilen
        serialNumbers: line.serialNumbers[i] ? [line.serialNumbers[i]] : [],
        // Bestehende AllocatedOrders aus Run 1-2 verteilen
        allocatedOrders: findOrderForExpansionIndex(line.allocatedOrders, i),
        orderAssignmentReason: /* abgeleitet oder 'pending' */,
      });
    }
  }
  return expanded;
}
```

Danach FIFO-Fill fuer alle unassigned expanded Lines:
- Gruppiere nach Artikel
- Fuer jeden Artikel: Consume aus aeltesten Pool-Eintraegen, einzeln

**Store-Update nach Run 3:**
```typescript
set({
  invoiceLines: expandedLines,        // ~295 Zeilen (qty=1)
  orderPool: result.pool,             // Mutierter Pool
  runs: [{ ...run, isExpanded: true }]
});
```

**Reuse aus bestehendem `orderMapper.ts`:**
- `findCandidateOrders()` Logik (Zeile 64-87) — refactored fuer OrderPool
- Stage-Sortierung (year ASC, belegnummer ASC)
- Issue-Erzeugungsmuster

**Stolpersteine:**
- Store-Shape aendert sich mid-workflow: ~45 -> ~295 Eintraege. `isExpanded` Flag als Diskriminator.
- Issues vor Expansion referenzieren aggregierte lineIds. Auto-Resolve muss beide Formate handhaben.
- Expansion ist EINWEG. Kein "Un-Expand".

---

### Phase A5: Manuelle Resolution UI & Bidirektionales Tracking

**Ziel:** Unassigned expanded Lines manuell Bestellungen zuweisen mit Pool-Buchhaltung.

**Neue Datei:**

| Datei | Zweck |
|-------|-------|
| `src/components/run-detail/ManualOrderPopup.tsx` | Dialog mit Dropdown + Freitext + Konflikt-Resolution |

**Popup-Struktur:**
1. **Dropdown:** Verbleibende OrderPool-Eintraege fuer diesen Artikel (`YYYY-XXXXX`). Letzter Eintrag: "NEU"
2. **Freitext-Eingabe:** Fuer manuelle Bestellnummer
3. **Leerstand:** "Keine Bestellung vorhanden" — nur "NEU" waehlbar
4. **Konflikt-Logik:** Dropdown gewaehlt UND Freitext befuellt -> Zwangsauswahl AlertDialog
5. **"Schliessen" Link** unten rechts

**Bidirektionales State-Update:**
```typescript
reassignOrder(lineId, newOrderPositionId | 'NEW', freeText?) {
  // 1. Alte Bestellung zurueck in Pool (+1 remaining)
  if (line.allocatedOrders.length > 0) returnToPool(oldOrder);
  // 2. Neue Bestellung aus Pool konsumieren (-1 remaining)
  if (newOrderPositionId !== 'NEW') consumeFromPool(newOrder);
  // 3. Line updaten
  line.allocatedOrders = [{ orderNumber, orderYear, qty: 1, reason: 'manual' }];
  // 4. Auto-Resolve Issues
  autoResolveIssues();
}
```

**Integration in ItemsTable.tsx (Artikelliste — NICHT InvoicePreview!):**
- "Bestellung" Spalte: Bei `run.isExpanded && !line.orderNumberAssigned` -> klickbares "--" oeffnet ManualOrderPopup
- Bei zugewiesener Bestellung: `YYYY-XXXXX` mit Stift-Icon fuer Reassignment
- **Dies ist die EINZIGE Stelle wo Bestellungen auf Einzelartikel-Ebene editiert werden**

**Typ-Ergaenzung:**
- `'manual'` und `'manual-ok'` zu `OrderAssignmentReason` Union hinzufuegen

---

## PROJ-22: Enterprise UI/UX Polish

### Phase B1: Global Layout, Sticky Headers & KPI-Kacheln

| Datei | Aenderung |
|-------|-----------|
| `src/index.css` | `.kpi-tile`: `p-4 gap-1` -> `p-3 gap-0.5`, `.kpi-tile-value`: `text-2xl` -> `text-xl` |
| `src/pages/RunDetail.tsx` | Kachel 1: "Positionen erhalten" (Sub: Fattura-Nr). Kachel 2: "Artikel extrahiert" (Sub: "X Artikel"). Kachel 3: "Serials geparst" (Nenner: Summe qty aller serialRequired) |
| `src/pages/RunDetail.tsx` | TabsList: `bg-[#c9c3b6]`. Artikelliste-Badge: `bg-[#008c99]` |
| `src/components/run-detail/ItemsTable.tsx` | `<TableHeader className="sticky top-0 z-10 bg-card">`, Default `max-h` fuer 5 Zeilen, Expand-Button `sticky bottom-0` und 25% groesser |
| `src/components/run-detail/InvoicePreview.tsx` | Gleiche Sticky-Header + 5-Zeilen-Default Behandlung |

---

### Phase B2: Tabellen-Sync & Differenzierte READ-ONLY

**Einheitliche Spaltenreihenfolge (beide Tabellen identisch):**

| Pos | Spalte | Anmerkung |
|-----|--------|-----------|
| 1 | Info-Icon | Detail-Popup Trigger — verschoben von letzter auf erste Position |
| 2 | Pos (#) | Positionsindex |
| 3 | Match-Status | Checkbox-Icon |
| 4 | **Art.-Nr.** | Umbenannt von "Art-# (DE)" |
| 5 | **Herstellerartikelnr.** | Vereinheitlicht, breitere Spalte |
| 6 | EAN | Monospace |
| 7 | Bezeichnung | Deutsche Beschreibung, max 35 Zeichen truncate + `title` Attribut |
| 8 | Menge | Rechtsbundig |
| 9 | Preis | PriceCell Komponente |
| 10 | SN | Serial-Status |
| 11 | **Bestellung** | Verschoben auf letzte Position |

**Differenzierte READ-ONLY Regel** (siehe dediziertes Kapitel unten)

**Weitere Aenderungen:**
- InvoicePreview: Ueberschrift rechtsbuendig, links Suchleiste
- ItemsTable: Links Suchleiste, rechts "Einzelartikel Listung"
- "PRUEFEN" -> "check" umbenennen (PriceCell.tsx, InvoicePreview.tsx, DetailPopup.tsx)

| Datei | Aenderung |
|-------|-----------|
| `src/components/run-detail/ItemsTable.tsx` | Spalten umordnen, PriceCell `readOnly={true}`, Bestellungs-Buttons AKTIV (fuer nach Expansion) |
| `src/components/run-detail/InvoicePreview.tsx` | Spalten synchronisieren, PriceCell `readOnly={false}` hinzufuegen |
| `src/components/run-detail/PriceCell.tsx` | `readOnly?: boolean` Prop, "PRUEFEN" -> "check" |

---

### Phase B3: Pop-ups (Preis & Artikeldetails)

| Datei | Aenderung |
|-------|-----------|
| `src/components/run-detail/InvoicePreview.tsx` | PriceCell Komponente importieren und einbinden (`readOnly={false}`) |
| `src/components/run-detail/DetailPopup.tsx` | Farben invertieren, Felder umordnen, S/N-Dropdown wenn >1, "Schliessen" Link |

**DetailPopup Feld-Umordnung:**
```
NEU: Art.-Nr., Herstellerartikelnr., EAN,
     Menge, Bezeichnung(DE), Bezeichnung(IT),
     Preis(Sage), Preis(Rechnung), Bestellmenge(offen), Preis(Final),
     Bestellnummer, Seriennummer (Dropdown wenn >1), Lagerort
```

---

### Phase B4: Sidebar & Settings-Popup

| Datei | Aenderung |
|-------|-----------|
| `src/components/AppFooter.tsx` | "Logfile" Button entfernen. Serial-Finder + OrderMapper Dropdowns hinzufuegen. Datenverzeichnis-Text als schwarzer klickbarer Link |
| `src/components/SettingsPopup.tsx` | Dynamische Breite (`max-w-[600px]`), vertikales Tab-Menu mit 6 Tabs, "Schliessen" Link |

**Settings-Tabs:**
1. **Uebersicht**: Logfile-Button (verschoben), aktive Parser-Anzeige, **"Speicher/Cache leeren"** Button (Hover: rot/weiss, Confirm-Dialog)
2. **Allgemein**: Maussperre, Preisbasis, Waehrung, Toleranz
3. **PDF-Parser**: Parser Import/Delete/Verwaltung
4. **Artikel extrahieren**: Matcher-Konfiguration
5. **Serial parsen**: Serial-Finder Konfiguration
6. **Bestellung mappen**: OrderMapper Konfiguration, "Archiv synchronisieren" Button

---

### Phase B5: Archiv Landing Page

| Datei | Aenderung |
|-------|-----------|
| `src/pages/Index.tsx` | Neue Spalten: "Rechnungssumme", "Rechnungspositionen", "Gesamtartikel". Rechtsbuendige Such-/Filterleiste |

---

## Differenzierte READ-ONLY Regel

> **KRITISCHE ARCHITEKTUR-ENTSCHEIDUNG**

Die Artikelliste (ItemsTable) und RE-Positionen (InvoicePreview) sind optisch identisch aufgebaut (gleiche Spalten, gleiche Reihenfolge). Die Edit-Faehigkeiten sind jedoch DIFFERENZIERT:

| Aktion | RE-Positionen (InvoicePreview) | Artikelliste (ItemsTable) |
|--------|-------------------------------|--------------------------|
| **Preis aendern** (PriceCell Popover) | AKTIV | READ-ONLY |
| **Bestellung zuweisen** (ManualOrderPopup) | READ-ONLY (zeigt nur an) | AKTIV (nach Expansion) |
| **S/N aendern** | READ-ONLY | AKTIV (nach Expansion) |
| **Artikeldetails ansehen** (DetailPopup) | AKTIV | AKTIV |
| **Such-/Filterleiste** | AKTIV | AKTIV |

**Begruendung:**
- Preise werden auf **aggregierter Positions-Ebene** geaendert (eine Aenderung betrifft alle Artikel dieser Position) -> RE-Positionen
- Bestellungen werden auf **Einzelartikel-Ebene** zugewiesen (nach Run 3 Expansion, jede Zeile qty=1) -> Artikelliste
- Dies verhindert versehentliche Einzelpreis-Aenderungen und ermoeglicht praezise Order-Zuweisung

---

## Dependency Graph & Sequenzierung

```
A1 (Aggregated-First) ────────────────────────────┐
   |                                                |
   ├── A3 (OrderPool) ── nach A1                   |
   |     |                                          |
   |     ├── A4 (3-Run Engine) ── nach A1+A3       |
   |     |     |                                    |
   |     |     └── A5 (Manual UI) ── nach A4       |
   |                                                |
   └── B2 (Table Sync/READ-ONLY) ── nach A1+B1    |
                                                    |
A2 (Persistence) ── unabhaengig, parallel zu A1 ───┤
   |                                                |
   └── B5 (Archive Page) ── nach A2                |
                                                    |
B1 (Layout/Tiles) ── unabhaengig ──────────────────┤
B4 (Settings) ── unabhaengig ──────────────────────┘
B3 (Popups) ── nach B2
```

**Empfohlene Ausfuehrungsreihenfolge:**

| Schritt | Phase(n) | Parallel moeglich |
|---------|----------|-------------------|
| 1 | A1 + B1 + B4 | Ja (Foundation + unabhaengige UI) |
| 2 | A2 + A3 | Ja (Persistence + Pool, beide nach A1) |
| 3 | B2 | Nach A1 + B1 |
| 4 | A4 | Nach A1 + A3 |
| 5 | B3 + B5 | Nach B2 / A2 |
| 6 | A5 | Nach A4 (letzter Schritt, braucht alles) |

---

## Neue Dateien & Modifikationen

### Neue Dateien (8)

| Datei | PROJ | Phase | Zweck |
|-------|------|-------|-------|
| `src/services/runPersistenceService.ts` | 23 | A2 | IndexedDB Persistence fuer Run-State |
| `src/hooks/useRunAutoSave.ts` | 23 | A2 | Zustand Subscription + Debounce Auto-Save |
| `src/services/matching/orderPool.ts` | 23 | A3 | OrderPool Build/Consume/Return |
| `src/services/matching/matchingEngine.ts` | 23 | A4 | 3-Run Orchestrator |
| `src/services/matching/runs/run1PerfectMatch.ts` | 23 | A4 | Run 1: Perfect Match aggregiert |
| `src/services/matching/runs/run2PartialFillup.ts` | 23 | A4 | Run 2: Partial/Fillup aggregiert |
| `src/services/matching/runs/run3ExpandFifo.ts` | 23 | A4 | Run 3: Expansion + FIFO |
| `src/components/run-detail/ManualOrderPopup.tsx` | 23 | A5 | Manuelles Order-Assignment Popup |

### Modifikationen (13)

| Datei | PROJs | Phasen |
|-------|-------|--------|
| `src/types/index.ts` | 23 | A1, A3, A5 |
| `src/store/runStore.ts` | 23 | A1, A2, A3, A4, A5 |
| `src/services/invoiceParserService.ts` | 23 | A1 |
| `src/services/matching/orderMapper.ts` | 23 | A4 (refactor in runs/) |
| `src/components/run-detail/ItemsTable.tsx` | 22+23 | B1, B2, A5 |
| `src/components/run-detail/InvoicePreview.tsx` | 22 | B1, B2, B3 |
| `src/components/run-detail/PriceCell.tsx` | 22 | B2, B3 |
| `src/components/run-detail/DetailPopup.tsx` | 22 | B3 |
| `src/components/SettingsPopup.tsx` | 22 | B4 |
| `src/components/AppFooter.tsx` | 22 | B4 |
| `src/pages/RunDetail.tsx` | 22 | B1 |
| `src/pages/Index.tsx` | 22+23 | A2, B5 |
| `src/index.css` | 22 | B1 |

---

## Verifikationsplan

| # | Phase | Test |
|---|-------|------|
| 1 | A1 | Neuer Run -> `invoiceLines` hat ~45 Eintraege mit `qty > 1` (nicht ~295 mit `qty: 1`) |
| 2 | A2 | Run erstellen -> F5 -> Run erscheint im Archiv -> oeffnen -> alle Daten intakt |
| 3 | A2 | >50 Runs -> Speicher-Warnung erscheint. "Archiv synchronisieren" -> JSONs auf Platte, alte Runs geloescht |
| 4 | A3 | Orders CSV hochladen -> nur Bestellungen fuer Rechnungsartikel im OrderPool. Warning fuer fehlende EAN+ArtNoIT |
| 5 | A4 | Step 4 ausfuehren -> Run 1 Perfect Matches -> Run 2 Partial Fills -> Run 3 Expansion (~45 -> ~295) -> FIFO Rest |
| 6 | A5 | Unassigned Line klicken -> Popup -> Order waehlen -> alte Order zurueck im Pool (+1), neue konsumiert (-1) |
| 7 | B1 | Visuell: KPI-Kacheln 20% kleiner, Sticky Headers, 5-Zeilen Default, groesserer Expand-Button |
| 8 | B2 | Beide Tabellen identische Spaltenreihenfolge. Artikelliste: Preis READ-ONLY, Bestellung AKTIV. RE-Pos: Preis AKTIV, Bestellung READ-ONLY |
| 9 | B3 | DetailPopup: invertierte Farben, umgeordnete Felder, S/N-Dropdown, "Schliessen" Link |
| 10 | B4 | Settings: 6 Tabs, dynamische Breite, Logfile verschoben, "Speicher/Cache leeren" mit rotem Hover |
| 11 | B5 | Archiv-Seite: neue Spalten + Suchleiste, persistierte Runs sichtbar |

---

## Agent Delegation

### Backend-Agent (Schwerpunkt: State, Logik, Persistenz)

**Verantwortlich fuer:**

| Phase | Arbeitspakete |
|-------|---------------|
| **A1** | `createAggregatedInvoiceLines()`, `isExpanded` Flag, runStore Anpassung, Step 2/3 Downstream-Fixes |
| **A2** | `runPersistenceService.ts`, `useRunAutoSave.ts`, Store-Actions (`loadPersistedRun`, `loadPersistedRunList`), Storage-Waechter, File System Access API Export |
| **A3** | `orderPool.ts` (Build/Consume/Return), OrderPool Typ-Definitionen, Store-Integration |
| **A4** | `matchingEngine.ts`, `run1PerfectMatch.ts`, `run2PartialFillup.ts`, `run3ExpandFifo.ts`, `executeMatchingEngine` Store-Action |
| **A5** (Logik) | `reassignOrder` Store-Action, bidirektionale Pool-Mutationen, Auto-Resolve Integration |

**Uebergabepunkte an Frontend-Agent:**
1. Nach A1: `isExpanded` Flag ist verfuegbar, `invoiceLines` kann aggregiert oder expandiert sein
2. Nach A2: `loadPersistedRunList()` liefert `PersistedRunSummary[]` fuer Archiv-UI
3. Nach A3: `orderPool` ist im Store verfuegbar mit `byArticle` Map
4. Nach A4: `run.isExpanded === true`, `invoiceLines` sind expandiert (~295 qty=1)
5. Nach A5 (Logik): `reassignOrder(lineId, orderPositionId)` Action ist aufrufbar

### Frontend-Agent (Schwerpunkt: UI, CSS, Komponenten)

**Verantwortlich fuer:**

| Phase | Arbeitspakete |
|-------|---------------|
| **B1** | KPI-Kacheln CSS/Texte, Sticky Headers, 5-Zeilen Default, Expand-Button, Tab-Farben |
| **B2** | Spalten-Umordnung (beide Tabellen), `readOnly` Prop fuer PriceCell, Such-/Filterleisten, Spalten-Umbenennung |
| **B3** | DetailPopup Redesign (Farben, Felder, S/N-Dropdown, "Schliessen"), PriceCell in InvoicePreview |
| **B4** | AppFooter Redesign, SettingsPopup Tab-Layout (6 Tabs), "Speicher/Cache leeren" Button |
| **B5** | Index.tsx neue Spalten, Such-/Filterleiste, Integration mit persistierten Run-Daten |
| **A5** (UI) | `ManualOrderPopup.tsx` Komponente, Integration in ItemsTable Bestellungs-Spalte |

**Uebergabepunkte an Backend-Agent:**
1. B2 braucht: `run.isExpanded` Flag (von A1) fuer bedingte Anzeige
2. B5 braucht: `PersistedRunSummary[]` (von A2) fuer Archiv-Tabelle
3. A5 UI braucht: `orderPool.byArticle` (von A3) fuer Dropdown-Optionen, `reassignOrder` Action (von A5 Logik)

### Parallele Ausfuehrung

```
Backend-Agent:  A1 ──> A2+A3 ──> A4 ──> A5(Logik)
                                              |
Frontend-Agent: B1+B4 ──> B2 ──> B3+B5 ──> A5(UI)
                                              |
                              Sync-Punkt: A5 = Backend-Logik + Frontend-UI
```

**Sync-Punkte:**
- **Nach A1 abgeschlossen:** Frontend kann B2 starten (braucht `isExpanded`)
- **Nach A2 abgeschlossen:** Frontend kann B5 starten (braucht Persistenz-API)
- **Nach A3+A4 abgeschlossen:** Frontend kann A5 UI starten (braucht OrderPool + Expansion)

---

## Nachtrag 2026-02-26 - ADD-ON: RE-Details Popup + Pending Platzhalter

### Zuordnung
- Projekt: `PROJ-22` (Phase `B3 Pop-ups`)
- Grund: Erweiterung/Verfeinerung der Detail-Popups im Run-Detail (RE-Positionen + Artikelliste)

### Problemstellung (Ist)
- In `Run-Detail > RE-Positionen > Tabelle > DETAILS` hat das Info-Icon zur `Artikelliste` umgeschaltet statt ein Detail-Popup zu oeffnen.
- In beiden Detail-Popups wurden fehlende Werte als `--` angezeigt; gewuenscht ist die bestehende Pending-Sanduhr-Visualisierung.

### Umsetzung (Soll -> Implementiert)
1. RE-Positionen: Info-Icon oeffnet jetzt ein eigenes Popup:
   - Titel: `Artikeldetails Rechnungszeile`
   - Datenverknuepfung ueber `positionIndex` (`parsedPositions` + run-spezifische `invoiceLines`)
2. Neues RE-Detailpopup mit read-only Feldern:
   - inkl. `Artikelliste [_sum=...]` fuer Summen-/Kontextanzeige auf Rechnungspositions-Ebene
   - Match-/Preis-/Order-/Serial-Infos positionsbezogen zusammengefuehrt
3. Platzhalter-Standardisierung:
   - In `DetailPopup` (Artikelliste) und `InvoiceLineDetailPopup` (RE-Positionen) wurden `--`-Fallbacks entfernt
   - Fehlende Werte zeigen jetzt die vorhandene Pending-Sanduhr (`PendingHourglassIcon`) inkl. Kreis-Hintergrund + Puls-Overlay

### Geaenderte Dateien
- `src/components/run-detail/InvoicePreview.tsx`
  - Info-Icon: Tab-Switch -> Popup-Open
  - Mapping: `linesByPosition` (positionIndex-basierte Datenzusammenfuehrung)
- `src/components/run-detail/InvoiceLineDetailPopup.tsx` (neu)
  - neues read-only Popup fuer RE-Positionen
- `src/components/run-detail/DetailPopup.tsx`
  - Placeholder-Fallback von `--` auf `PendingHourglassIcon`

### Verifikation
- Build erfolgreich: `npm run build`
- Manuelle UI-Pruefpunkte:
  1. RE-Positionen -> Details-Icon oeffnet Popup statt Tab-Wechsel
  2. Leere Felder im RE-Popup zeigen Sanduhr statt `--`
  3. Leere Felder im Artikellisten-Popup zeigen Sanduhr statt `--`

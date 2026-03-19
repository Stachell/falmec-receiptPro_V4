# PROJ-44-ADD-ON-Serial-Parser-Core_round6

> **Scope:** Legacy-Fix FalmecMatcher, Orphan-Serials Persistenz, Smarte SerialStatusDot-Navigation, Late-Fix Pop-up
> **Erstellt:** 2026-03-19
> **Abhängig von:** PROJ-45-ADD-ON-round5, PROJ-40-ADD-ON-3, PROJ-44
> **Betroffene Dateien:** ~8 Dateien (Details pro Phase unten)

---

## Übersicht der 3 Phasen

| Phase | Titel | Dateien | Risiko |
|-------|-------|---------|--------|
| 1 (A-E) | Backend & IndexedDB (Legacy-Fix + Orphan-Catcher + Bypass-Action) | 4 | Mittel |
| 2 (A-D) | Navigation & UI-Routing (Klickbarer SerialStatusDot) | 3 | Niedrig |
| 3 (A-B) | Late-Fix Pop-up (S/N-Pflicht + Nummer nachtragen) | 3 | Niedrig |

---

## Phase 1 — Backend & IndexedDB

### 1A. Legacy-Fix: `FalmecMatcher_Master.ts` (serialExtract)

**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts`
**Zeilen:** 544–605

**IST-Zustand (Bug):**
```typescript
// Zeile 544-562: Weist nur EINE S/N pro Zeile zu (serialNumber singular)
const availableRow = matchingRows.find(r => r.serialCandidate !== null && !r.consumed);
if (!availableRow) return line;
availableRow.consumed = true;
assignedCount++;
return {
  ...line,
  serialNumber: availableRow.serialCandidate,
  serialSource: 'serialList' as const,
};

// Zeile 565: requiredCount zählt nur Zeilen, nicht qty
const requiredCount = lines.filter(l => l.serialRequired && l.serialSource !== 'manual').length;
```

**Problem:** Der Legacy-Pfad wurde vor der Aggregated-Lines-Architektur (PROJ-23) geschrieben. Seit PROJ-23 können Zeilen `qty > 1` haben. Der Legacy-Pfad:
1. Weist nur `serialNumber` (singular) zu, aber NICHT `serialNumbers[]` (Array)
2. Zählt `requiredCount` als Anzahl Zeilen statt Summe der `qty`-Werte
3. Nimmt nur 1 Serial pro Zeile, auch wenn `qty > 1`

**SOLL-Zustand (Fix):**
```typescript
// Assignment-Loop (ersetze Zeilen 544-563):
let assignedCount = 0;
const updatedLines = lines.map(line => {
  if (line.serialSource === 'manual') return line;
  if (!line.serialRequired) return line;

  // Sammle bis zu line.qty unconsumed Serials
  const assigned: string[] = [];
  for (let i = 0; i < line.qty; i++) {
    const availableRow = matchingRows.find(r => r.serialCandidate !== null && !r.consumed);
    if (!availableRow) break;
    availableRow.consumed = true;
    assigned.push(availableRow.serialCandidate!);
  }

  if (assigned.length === 0) return line;
  assignedCount += assigned.length;

  return {
    ...line,
    serialNumbers: assigned,                    // NEU: Array
    serialNumber: assigned[0] ?? null,          // Compat: erstes Element
    serialSource: 'serialList' as const,
  };
});

// requiredCount (ersetze Zeile 565):
const requiredCount = lines
  .filter(l => l.serialRequired && l.serialSource !== 'manual')
  .reduce((sum, l) => sum + l.qty, 0);       // NEU: Summe qty statt Zeilenanzahl
```

**Auswirkung auf Checksum (Zeile 567):**
```typescript
// ALT: const checksumMatch = regexHits === assignedCount;
// Das bleibt korrekt — regexHits zählt alle verfügbaren S/N-Kandidaten,
// assignedCount zählt jetzt die tatsächlich zugewiesenen (bis zu qty pro Zeile).
```

**Auswirkung auf Stats (Zeile 600):**
```typescript
// stats.mismatchCount muss ebenfalls qty-basiert sein:
const mismatchCount = requiredCount - assignedCount;
// Das bleibt korrekt, da requiredCount jetzt qty-Summe ist.
```

---

### 1B. Neues Feld `orphanSerials` auf Run-Ebene

**Datei:** `src/types/index.ts`
**Zeile:** Nach Zeile 273 (in `Run` Interface)

```typescript
export interface Run {
  // ... bestehende Felder ...
  isExpanded: boolean;
  /** PROJ-44-R6: Unzugeordnete Seriennummern aus Step 3 (EAN ohne passende Rechnungsposition) */
  orphanSerials: string[];
}
```

**Warum auf `Run` statt `RunState`:** Das `Run`-Objekt wird als Teil von `PersistedRunData.run` automatisch in die IndexedDB serialisiert und beim Laden rehydriert. Kein zusätzlicher Persistenz-Code nötig.

**Default-Wert:** Überall wo ein `Run` konstruiert wird (3 Stellen in `runStore.ts`):
- Zeile ~840 (`createNewRunWithParsing`): `orphanSerials: []`
- Zeile ~956 (`createNewRun` Fallback): `orphanSerials: []`
- Zeile ~1454 (falls vorhanden, weitere Run-Konstruktion): `orphanSerials: []`

**Suchbefehl zur Identifikation aller Run-Konstruktionen:**
```bash
grep -n "isExpanded:" src/store/runStore.ts
# Ergebnis: 840, 956, 1454, 3140 → An allen 4 Stellen orphanSerials: [] ergänzen
```

**Backward-Compat für alte IndexedDB-Runs (PFLICHT):**
Alte persistierte Runs haben kein `orphanSerials`-Feld. Beim Laden aus IndexedDB ist `data.run.orphanSerials` dann `undefined` — ein Zugriff wie `run.orphanSerials.length` crashed zur Laufzeit. **Fix:** In `loadPersistedRun` (runStore.ts:~3866-3917) den geladenen Run normalisieren:

```typescript
// In loadPersistedRun, nach const data = await runPersistenceService.loadRun(runId):
// PROJ-44-R6: Backward-Compat — alte Runs ohne orphanSerials normalisieren
const normalizedRun: Run = { ...data.run, orphanSerials: data.run.orphanSerials ?? [] };
```

Dann überall in `loadPersistedRun` wo `data.run` verwendet wird, stattdessen `normalizedRun` einsetzen (Zeilen 3878, 3893).

---

### 1C. Orphan-Catcher im Hauptpfad (executeMatcherSerialExtract)

**Datei:** `src/store/runStore.ts`
**Zeilen:** 3649–3716 (nach Assignment-Loop, vor `set()`)

**Wo:** Direkt nach dem `updatedRunLines.map()` Block (Zeile 3649), vor dem `set()` Call (Zeile 3689).

**Implementierung:**
```typescript
// ── PROJ-44-R6: Orphan-Catcher — nicht zugeordnete Serials sammeln ──
const orphanSerials: string[] = [];
for (const [_ean, remaining] of eanToSerials.entries()) {
  orphanSerials.push(...remaining);
}

// Log wenn Orphans existieren
if (orphanSerials.length > 0) {
  logService.warn(
    `${orphanSerials.length} Seriennummer(n) ohne passende Rechnungsposition (Orphans)`,
    { runId, step: 'Seriennummer anfuegen' },
  );
}
```

**Integration in `set()` (Zeile 3689–3716):**
```typescript
// Im newRun-Objekt (nach Zeile 3693):
const newRun: Run = {
  ...updatedRun,
  orphanSerials,   // NEU: Orphan-Serials auf Run-Level
  stats: { ... },
  steps: [ ... ],
};
```

**Kein zusätzlicher Persistenz-Code nötig:** Da `orphanSerials` auf dem `Run`-Objekt sitzt, wird es automatisch von `buildAutoSavePayload` → `runPersistenceService.saveRun()` mitgenommen (das `run`-Feld im Payload enthält das volle `Run`-Objekt). Beim `loadPersistedRun` wird `data.run` komplett restauriert — `orphanSerials` ist automatisch enthalten.

---

### 1D. Legacy-Pfad Orphan-Catcher (PFLICHT)

**Datei:** `src/store/runStore.ts`
**Zeilen:** 3788–3815 (Legacy-Pfad `set()`)

Der Legacy-Pfad (`serialExtract` in FalmecMatcher_Master) kann ebenfalls Orphans produzieren. Die unconsumed Rows nach dem Assignment sind die Orphans.

**Implementierung in FalmecMatcher_Master.ts:**

Erweitere das `SerialExtractionResult`-Interface (in `src/services/matchers/types.ts` oder wo es definiert ist) um:
```typescript
export interface SerialExtractionResult {
  // ... bestehende Felder ...
  orphanSerials: string[];  // NEU
}
```

Am Ende von `serialExtract()` (vor dem `return`, Zeile ~598):
```typescript
// PROJ-44-R6: Unconsumed serials = Orphans
const orphanSerials = matchingRows
  .filter(r => r.serialCandidate !== null && !r.consumed)
  .map(r => r.serialCandidate!);
```

Und im Return-Objekt (Zeile 598-604):
```typescript
return {
  lines: updatedLines,
  stats: { assignedCount, requiredCount, mismatchCount },
  warnings,
  issues,
  checksum: { regexHits, assignedSNs: assignedCount, match: checksumMatch },
  orphanSerials,  // NEU
};
```

Im Legacy-Pfad `set()` in runStore.ts (Zeile ~3792):
```typescript
const newRun: Run = {
  ...updatedRun,
  orphanSerials: result.orphanSerials,  // NEU
  stats: { ... },
  steps: [ ... ],
};
```

---

### 1E. Dedizierte Bypass-Action: `updateLineSerialData` (NEU)

**Datei:** `src/store/runStore.ts`

> **WARNUNG — Buddyschutz-Alarm:** `setManualArticleByPosition` darf NICHT für das Late-Fix Pop-up (Phase 3) verwendet werden! Diese Action erfordert zwingend eine `falmecArticleNo`, überschreibt bei Fehlen bestehende Artikelnummern mit `undefined`, killt den Preis und fälscht den `matchStatus` auf `full-match`. Stattdessen wird eine chirurgische, dedizierte Action gebaut.

**Interface (im `RunState`-Interface, nach `setManualArticleByPosition`):**
```typescript
/** PROJ-44-R6: Chirurgischer S/N-Update — ändert NUR serial-relevante Felder, keine Artikel/Preis/Match-Daten */
updateLineSerialData: (positionIndex: number, serialRequired: boolean, serialNumbers: string[], runId?: string) => void;
```

**Implementierung (nach `setManualArticleByPosition` Action):**
```typescript
updateLineSerialData: (positionIndex, serialRequired, serialNumbers, runId?) => {
  const { currentRun, invoiceLines } = get();
  const targetRunId = runId ?? currentRun?.id;
  if (!targetRunId) return;

  const linePrefix = `${targetRunId}-line-`;
  const updatedLines = invoiceLines.map(line => {
    // Nur Zeilen dieses Runs mit passendem positionIndex
    if (!line.lineId.startsWith(linePrefix)) return line;
    if (line.positionIndex !== positionIndex) return line;

    return {
      ...line,
      serialRequired,
      serialNumbers,
      serialNumber: serialNumbers[0] ?? null,
      serialSource: serialNumbers.length > 0 ? 'manual' as const : line.serialSource,
    };
  });

  // Stats aktualisieren (serialMatchedCount / serialRequiredCount)
  const runLines = updatedLines.filter(l => l.lineId.startsWith(linePrefix));
  const serialRequiredCount = runLines
    .filter(l => l.serialRequired)
    .reduce((sum, l) => sum + l.qty, 0);
  const serialMatchedCount = runLines
    .filter(l => l.serialRequired)
    .reduce((sum, l) => sum + l.serialNumbers.length, 0);

  set(state => {
    const updatedRun = state.runs.find(r => r.id === targetRunId);
    if (!updatedRun) return { invoiceLines: updatedLines };

    const newRun: Run = {
      ...updatedRun,
      stats: {
        ...updatedRun.stats,
        serialRequiredCount,
        serialMatchedCount,
      },
    };

    return {
      runs: state.runs.map(r => r.id === targetRunId ? newRun : r),
      currentRun: state.currentRun?.id === targetRunId ? newRun : state.currentRun,
      invoiceLines: updatedLines,
    };
  });

  // Logging + AuditLog
  logService.info(
    `Manuelle S/N-Korrektur: Pos ${positionIndex + 1} — serialRequired=${serialRequired}, ${serialNumbers.length} S/N`,
    { runId: targetRunId, step: 'Seriennummer anfuegen' },
  );
  get().addAuditEntry({
    runId: targetRunId,
    action: 'manual-serial-update',
    details: `Pos ${positionIndex + 1}: serialRequired=${serialRequired}, serialNumbers=[${serialNumbers.join(', ')}]`,
    userId: 'system',   // PFLICHT — AuditLogEntry verlangt userId: string
  });

  // Hard-Persist in IndexedDB (analog Step-3 Hard Checkpoint)
  if (runPersistenceService.isAvailable()) {
    const payload = buildAutoSavePayload(targetRunId);
    if (payload) {
      runPersistenceService.saveRun(payload).catch(err =>
        console.error('[RunStore] updateLineSerialData persist failed:', err)
      );
    }
  }
},
```

**Was diese Action NICHT tut (by design):**
- Kein Stammdaten-Lookup (`useMasterDataStore`)
- Kein `falmecArticleNo`-Überschreiben
- Kein `matchStatus`-Neuberechnung
- Kein `priceCheckStatus`-Update
- Kein `storageLocation`-/`logicalStorageGroup`-Update
- Kein Step-2-Recompute / Auto-Advance-Manipulation

**Was diese Action TUT:**
- `serialRequired` / `serialNumbers` / `serialNumber` / `serialSource` auf allen Zeilen des `positionIndex` setzen
- `serialSource: 'manual'` wenn Nummern vorhanden → Step-3 Guard (`if (line.serialSource === 'manual') return line;`) schützt automatisch vor Überschreibung
- Run-Stats (`serialMatchedCount`/`serialRequiredCount`) aktualisieren
- Logging + AuditLog
- IndexedDB Hard-Persist

---

### Phase 1 — Zusammenfassung Dateien

| Datei | Änderung |
|-------|----------|
| `src/types/index.ts` | `orphanSerials: string[]` in `Run` Interface |
| `src/services/matchers/modules/FalmecMatcher_Master.ts` | Legacy-Fix (`serialNumbers[]`, qty-basiert) + Orphan-Return |
| `src/services/matchers/types.ts` | `orphanSerials` in `SerialExtractionResult` |
| `src/store/runStore.ts` | Orphan-Catcher (Hauptpfad + Legacy-Pfad), `orphanSerials: []` bei allen Run-Konstruktionen, **NEU: `updateLineSerialData` Action** |

**Persistenz automatisch gelöst:** `Run.orphanSerials` → `PersistedRunData.run.orphanSerials` → IndexedDB → `loadPersistedRun` → `data.run` enthält Orphans.

---

## Phase 2 — Navigation & UI-Routing

### 2A. SerialStatusDot klickbar machen

**Datei:** `src/components/run-detail/SerialStatusDot.tsx`
**Zeilen:** 1–33 (komplette Datei)

**IST-Zustand:**
```typescript
interface SerialStatusDotProps {
  serialRequired: boolean;
  serialAssigned: boolean;
}
// Render: <span> (nicht klickbar)
```

**SOLL-Zustand:**
```typescript
interface SerialStatusDotProps {
  serialRequired: boolean;
  serialAssigned: boolean;
  /** PROJ-44-R6: Klick-Handler — undefined = nicht klickbar (Backward-Compat) */
  onClick?: () => void;
}

export function SerialStatusDot({ serialRequired, serialAssigned, onClick }: SerialStatusDotProps) {
  const bg = !serialRequired
    ? '#000000'
    : serialAssigned
      ? '#22C55E'
      : '#E5E7EB';

  const border = !serialRequired
    ? '#000000'
    : serialAssigned
      ? '#16A34A'
      : '#9CA3AF';

  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      className={`inline-block w-3 h-3 rounded-sm border flex-shrink-0${onClick ? ' cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 focus:outline-none' : ''}`}
      style={{ backgroundColor: bg, borderColor: border }}
      onClick={onClick}
      {...(Tag === 'button' ? { type: 'button' as const } : {})}
    />
  );
}
```

**WICHTIG:** Die bestehenden Props `serialRequired` und `serialAssigned` bleiben EXAKT erhalten. `onClick` ist optional — alle bestehenden Nutzungen ohne onClick funktionieren weiterhin als reiner Indikator.

---

### 2B. Tab-Switch-Logik (Weiche)

**Kontext:**
- Tab-State: `activeTab` / `setActiveTab(tab)` in `runStore` (global)
- Tab-Werte: `'invoice-preview'` = RE-Positionen, `'items'` = Artikelliste
- "Ausgerollt" (Step 4 abgeschlossen): `currentRun.isExpanded === true`

**Logik-Matrix:**

| Klick-Ort | Run ausgerollt? | Aktion |
|-----------|-----------------|--------|
| InvoicePreview (RE-Pos.) | JA (`isExpanded`) | → Switch zu `'items'` Tab (Artikelliste) |
| InvoicePreview (RE-Pos.) | NEIN | → Pop-up öffnen (Phase 3) |
| ItemsTable (Artikelliste) | JA (`isExpanded`) | → Pop-up öffnen (Phase 3) |
| ItemsTable (Artikelliste) | NEIN | → Switch zu `'invoice-preview'` Tab (RE-Pos.) |

**Warum diese Logik:** Die Seriennummern-Bearbeitung muss architektonisch am "richtigen Ort" stattfinden:
- **Vor Step 4 (nicht ausgerollt):** Daten leben noch aggregiert in den RE-Positionen → Bearbeitung in InvoicePreview
- **Nach Step 4 (ausgerollt):** Daten sind auf Einzelzeilen expandiert → Bearbeitung in ItemsTable (Artikelliste)

---

### 2C. Integration in InvoicePreview.tsx

**Datei:** `src/components/run-detail/InvoicePreview.tsx`
**Zeile ~570-578** (dort wo `<SerialStatusDot>` gerendert wird)

**Benötigte Imports/State:**
```typescript
// Bereits vorhanden: import { useRunStore } from '@/store/runStore';
// Bereits vorhanden: import { SerialStatusDot } from './SerialStatusDot';
// NEU: State für Late-Fix Pop-up
const [serialFixTarget, setSerialFixTarget] = useState<{
  lineId: string;
  positionIndex: number;
  serialRequired: boolean;
  serialNumbers: string[];
  qty: number;
} | null>(null);
```

**onClick-Handler (als Callback innerhalb der Komponente):**
```typescript
const handleSerialDotClick = useCallback((line: InvoiceLine) => {
  const { currentRun, setActiveTab } = useRunStore.getState();
  if (!currentRun) return;

  if (currentRun.isExpanded) {
    // Ausgerollt → Artikelliste ist der richtige Ort → Tab wechseln
    setActiveTab('items');
  } else {
    // Nicht ausgerollt → hier ist der richtige Ort → Pop-up öffnen
    setSerialFixTarget({
      lineId: line.lineId,
      positionIndex: line.positionIndex,
      serialRequired: line.serialRequired,
      serialNumbers: line.serialNumbers,
      qty: line.qty,
    });
  }
}, []);
```

**JSX-Änderung (Zeile ~575):**
```tsx
<SerialStatusDot
  serialRequired={posStatus.serialRequired}
  serialAssigned={posStatus.serialAssigned}
  onClick={() => handleSerialDotClick(posStatus.representativeLine)}
/>
```

---

### 2D. Integration in ItemsTable.tsx

**Datei:** `src/components/run-detail/ItemsTable.tsx`
**Zeile ~435-438** (dort wo `<SerialStatusDot>` gerendert wird)

**Analoger Ansatz, invertierte Logik:**
```typescript
const handleSerialDotClick = useCallback((line: InvoiceLine) => {
  const { currentRun, setActiveTab } = useRunStore.getState();
  if (!currentRun) return;

  if (!currentRun.isExpanded) {
    // Nicht ausgerollt → RE-Positionen ist der richtige Ort → Tab wechseln
    setActiveTab('invoice-preview');
  } else {
    // Ausgerollt → hier ist der richtige Ort → Pop-up öffnen
    setSerialFixTarget({
      lineId: line.lineId,
      positionIndex: line.positionIndex,
      serialRequired: line.serialRequired,
      serialNumbers: line.serialNumbers,
      qty: line.qty,
    });
  }
}, []);
```

**JSX-Änderung (Zeile ~435):**
```tsx
<SerialStatusDot
  serialRequired={line.serialRequired}
  serialAssigned={!!line.serialNumber}
  onClick={() => handleSerialDotClick(line)}
/>
```

---

### Phase 2 — Zusammenfassung Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/run-detail/SerialStatusDot.tsx` | `onClick?` Prop, `button`/`span` Rendering |
| `src/components/run-detail/InvoicePreview.tsx` | `handleSerialDotClick` + `serialFixTarget` State |
| `src/components/run-detail/ItemsTable.tsx` | `handleSerialDotClick` + `serialFixTarget` State |

**Kein Prop-Drilling nötig:** `setActiveTab` wird direkt aus `useRunStore.getState()` gelesen (Transient Access Pattern — keine Subscription, kein Re-Render). Der `serialFixTarget` State ist lokal in der jeweiligen Komponente.

---

## Phase 3 — Late-Fix Pop-up

### 3A. SerialFixPopup Komponente

**Neue Datei:** `src/components/run-detail/SerialFixPopup.tsx`

**Props:**
```typescript
interface SerialFixPopupProps {
  /** Ziel-Zeile für die S/N-Bearbeitung */
  target: {
    lineId: string;
    positionIndex: number;
    serialRequired: boolean;
    serialNumbers: string[];
    qty: number;
  };
  /** Schließen-Callback */
  onClose: () => void;
}
```

**UI-Layout (shadcn Dialog):**
```
┌─────────────────────────────────────────┐
│  Seriennummer bearbeiten — Pos. {N}     │
├─────────────────────────────────────────┤
│                                         │
│  S/N-Pflicht:   [Toggle Ja/Nein]        │
│                                         │
│  ── Seriennummer(n) ──────────────────  │
│  S/N 1: [ K1234567890K ]               │
│  S/N 2: [ ____________ ]    (bei qty>1) │
│  ...                                    │
│                                         │
│  [Abbrechen]              [Speichern]   │
└─────────────────────────────────────────┘
```

**State-Management im Pop-up:**
```typescript
const [localSerialRequired, setLocalSerialRequired] = useState(target.serialRequired);
const [localSerialNumbers, setLocalSerialNumbers] = useState<string[]>(
  // Initialisiere mit vorhandenen Nummern, auffüllen auf qty leere Strings
  () => {
    const existing = [...target.serialNumbers];
    while (existing.length < target.qty) existing.push('');
    return existing.slice(0, target.qty);
  }
);
```

**Toggle "S/N-Pflicht":**
- `Switch` (shadcn/ui) — checked = `localSerialRequired`
- Wenn `false`: Input-Felder werden `disabled` + ausgegraut
- Wenn `true` → `false`: Seriennummern werden NICHT gelöscht (bleiben im State, nur visuell deaktiviert)

**Input-Felder:**
- Genau `target.qty` Stück (bei expandierten Zeilen qty=1)
- `disabled` wenn `!localSerialRequired`
- Validierung: Optional — leere Strings erlaubt (User kann speichern ohne alle zu füllen)

**Submit-Handler ("Speichern"):**
```typescript
const handleSave = () => {
  const { updateLineSerialData } = useRunStore.getState();

  // Filtere leere Strings raus
  const nonEmptySerials = localSerialRequired
    ? localSerialNumbers.filter(s => s.trim() !== '')
    : [];

  updateLineSerialData(target.positionIndex, localSerialRequired, nonEmptySerials);

  onClose();
};
```

**Warum `updateLineSerialData` (Phase 1E) statt `setManualArticleByPosition`:**

> ~~`setManualArticleByPosition`~~ **VERBOTEN** für diesen Use-Case!
> Diese Action erfordert zwingend `falmecArticleNo`, überschreibt bei Fehlen bestehende Artikelnummern mit `undefined`, killt den Preis (`unitPriceSage → null`) und fälscht den `matchStatus` auf `full-match`. Das zerschießt die kompletten Rechnungsdaten!

Die neue `updateLineSerialData` Action (Phase 1E) ist ein chirurgischer Bypass:
- Ändert **NUR** `serialRequired`, `serialNumbers`, `serialNumber`, `serialSource`
- Setzt `serialSource: 'manual'` → Step-3 Guard schützt automatisch vor Überschreibung
- Aktualisiert Run-Stats (`serialMatchedCount`/`serialRequiredCount`)
- Logging + AuditLog + IndexedDB Hard-Persist integriert
- **Null Seiteneffekte** auf Artikel, Preis, Match-Status oder Step-2-Logik

---

### 3B. Einbindung in InvoicePreview + ItemsTable

Beide Komponenten rendern das Pop-up am Ende ihres JSX-Baums:

```tsx
{serialFixTarget && (
  <SerialFixPopup
    target={serialFixTarget}
    onClose={() => setSerialFixTarget(null)}
  />
)}
```

---

### Phase 3 — Zusammenfassung Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/run-detail/SerialFixPopup.tsx` | **NEU** — Modal-Komponente |
| `src/components/run-detail/InvoicePreview.tsx` | `<SerialFixPopup>` Einbindung |
| `src/components/run-detail/ItemsTable.tsx` | `<SerialFixPopup>` Einbindung |

---

## Implementierungsreihenfolge

```
Phase 1A → 1B → 1C → 1D → 1E → tsc Check
     ↓
Phase 2A → 2B → 2C → 2D → tsc Check
     ↓
Phase 3A → 3B → tsc Check
     ↓
features/INDEX.md aktualisieren
```

**Gesamtänderungen:** ~7 Dateien (1 neue, 6 bestehende)
**Kritisch:** Phase 1E MUSS vor Phase 3A abgeschlossen sein — das Pop-up ruft `updateLineSerialData` auf.

---

## Risiken & Edge-Cases

| Risiko | Mitigation |
|--------|-----------|
| ~~`setManualArticleByPosition` für S/N-Updates~~ | **VERBOTEN** — dedizierte `updateLineSerialData` Action (Phase 1E) stattdessen |
| Legacy-Pfad nach Fix: `mismatchCount` kann negativ werden | `Math.max(0, requiredCount - assignedCount)` verwenden |
| `orphanSerials` bei Reload alter Runs leer | Default `[]` in `Run`-Konstruktion + TypeScript `??` Guard bei Zugriff |
| SerialStatusDot-Klick in InvoicePreview ohne `posStatus.representativeLine` | Null-Check vor Klick-Handler |
| `setActiveTab` aus `useRunStore.getState()` löst kein Re-Render aus | Gewünscht — transient read für einmalige Navigation |
| `updateLineSerialData` Stats-Recompute vergessen | Action rechnet `serialMatchedCount`/`serialRequiredCount` inline nach |

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden

### 1. SerialStatusDot Props — NICHTS LÖSCHEN
Die bestehenden Props `serialRequired` und `serialAssigned` müssen **exakt erhalten bleiben**. Der neue `onClick?`-Prop ist **optional**. Alle bestehenden Call-Sites in InvoicePreview.tsx (Zeile ~575) und ItemsTable.tsx (Zeile ~435) die keinen `onClick` übergeben, dürfen NICHT brechen. Teste nach der Änderung: `npx tsc --noEmit`.

### 2. Tab-Switch-Funktion sauber übergeben
**KEIN Prop-Drilling!** Der `setActiveTab` wird **nicht** als Prop durch die Komponentenhierarchie gereicht. Stattdessen:
```typescript
// RICHTIG: Transient Access Pattern (kein Re-Render, kein Prop)
const { setActiveTab } = useRunStore.getState();
setActiveTab('items');

// FALSCH: Prop-Drilling
<SerialStatusDot onSwitchTab={setActiveTab} />  // ← NICHT SO
```

Der `onClick`-Handler wird in der **Eltern-Komponente** (InvoicePreview / ItemsTable) definiert und als **Closure** an `SerialStatusDot` übergeben. Die SerialStatusDot-Komponente kennt weder Tabs noch Store — sie ruft einfach `onClick()` auf.

### 3. serialFixTarget State — lokaler State, NICHT im Store
Der `serialFixTarget` State für das Pop-up ist **lokaler React-State** (`useState`) in InvoicePreview bzw. ItemsTable. Er gehört NICHT in den Zustand-Store, da er:
- Nur innerhalb einer Komponente lebt
- Kein persistierungswürdiger Zustand ist
- Beim Unmount automatisch aufgeräumt wird

### 4. Run-Konstruktionen in runStore.ts — ALLE 4 STELLEN
Suche nach `isExpanded:` in `runStore.ts` (Treffer: Zeilen ~840, ~956, ~1454, ~3140). An **jeder** dieser Stellen muss `orphanSerials: []` ergänzt werden. Vergiss keine Stelle — eine fehlende führt zu einem Runtime-Error.

### 5. `SerialExtractionResult` Interface finden
Bevor du `orphanSerials` zum Return-Typ von `serialExtract()` hinzufügst, finde das Interface:
```bash
grep -rn "interface SerialExtractionResult" src/
```
Es könnte in `src/services/matchers/types.ts` oder direkt in `FalmecMatcher_Master.ts` definiert sein.

### 6. buildAutoSavePayload.ts — NICHT ANFASSEN
`orphanSerials` sitzt auf dem `Run`-Objekt. `buildAutoSavePayload` serialisiert bereits das volle `run`-Objekt (Zeile 38). Es ist **keine Änderung** an `buildAutoSavePayload.ts` oder `runPersistenceService.ts` nötig.

### 7. NIEMALS `setManualArticleByPosition` für das Pop-up verwenden!
**`setManualArticleByPosition` ist VERBOTEN für den S/N-Fix-Use-Case!** Diese Action:
- Erfordert zwingend `falmecArticleNo` — bei Fehlen → Artikelnummer wird `undefined`
- Überschreibt `unitPriceSage`, `matchStatus`, `storageLocation`, `logicalStorageGroup`
- Fälscht `matchStatus` auf `full-match` → Datenintegrität zerstört

Stattdessen: **`updateLineSerialData`** (Phase 1E) verwenden. Diese Action ist chirurgisch und ändert NUR S/N-relevante Felder. Wenn du im Pop-up-Submit-Handler `setManualArticleByPosition` siehst, ist das ein **sofortiger Blocker** — stoppe und korrigiere zu `updateLineSerialData`.

### 8. InvoicePreview posStatus-Objekt
In InvoicePreview wird `posStatus` berechnet (vermutlich über ein Lookup/Memo). `posStatus.representativeLine` enthält die vollständige `InvoiceLine`. Stelle sicher, dass `handleSerialDotClick` das korrekte Line-Objekt bekommt. Falls `representativeLine` nicht existiert, nutze das rohe Line-Objekt aus dem Render-Loop.

### 9. `addAuditEntry` verlangt IMMER `userId: 'system'`
`AuditLogEntry` hat `userId: string` als Pflichtfeld. `addAuditEntry` erwartet `Omit<AuditLogEntry, 'id' | 'timestamp'>`, also `{ runId, action, details, userId }`. Wenn du `userId` vergisst → **sofortiger tsc-Error**. Prüfe alle `addAuditEntry`-Aufrufe in neuen Actions.

### 10. `loadPersistedRun` Backward-Compat Guard
Alte Runs aus der IndexedDB haben kein `orphanSerials`. Ohne den `?? []` Guard in `loadPersistedRun` crashed die App beim Laden alter Runs. Siehe Phase 1B für die exakte Stelle.

### 11. tsc nach JEDER Phase
Führe `npx tsc --noEmit` nach jeder Phase aus (nicht erst am Ende). Ein Typ-Fehler in Phase 1 kann sich kaskadenförmig durch Phase 2+3 ziehen.

### 12. INDEX.md Entry
Am Ende muss ein Eintrag in `features/INDEX.md` stehen. Format:
```
| PROJ-44-ADD-ON-R6 | Serial Parser Core Round 6 | Done | Legacy-Fix FalmecMatcher (serialNumbers[]/qty), orphanSerials Persistenz auf Run-Level, klickbarer SerialStatusDot mit Tab-Weiche, SerialFixPopup für manuelle S/N-Pflicht und Nummern-Nachtrag. X Dateien, tsc 0 Errors. |
```

---

## Sonnet-Regeln (zwingend einzuhalten)

1. **IMMER** vorher in den Plan-Modus (thinking) gehen
2. **Skills verwenden:** Lade selbstständig `frontend` Skill für UI-Komponenten
3. **IMMER** in Projektdaten schreiben (`features/PROJ-44-ADD-ON-Serial-Parser-Core_round6.md`)
4. Am Ende selbstständig `npx tsc --noEmit` über Bash ausführen und Fehler beheben
5. `features/INDEX.md` aktualisieren

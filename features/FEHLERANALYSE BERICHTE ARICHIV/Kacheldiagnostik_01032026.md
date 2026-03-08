# Audit & Plan: Kachel 3, 4, 5 — Zähler/Nenner auf qty-Basis (2026-03-01)

## Problem-Kontext

Die KPI-Kacheln 3, 4 und 5 arbeiten fachlich auf ARTIKEL-Ebene (Stückzahl/`qty`).
Aktuell verwenden ihre Zähler `.count`-Felder aus `currentRun.stats` — diese zählen
**Invoice-Lines** (Zeilen), nicht `qty`. Das führt zu falschen Anzeigen, z. B. "45/45"
statt dem fachlich korrekten "295/295".

---

## Audit-Ergebnis: Ist-Zustand

### Typen-Grundlage (`src/types/index.ts`)

| Feld | Typ | Semantik |
|---|---|---|
| `qty` | `number` | Stückzahl der Zeile |
| `priceCheckStatus` | `'pending' \| 'ok' \| 'mismatch' \| 'missing' \| 'custom'` | Prüfergebnis Preis |
| `allocatedOrders` | `AllocatedOrder[]` | Bestellzuteilungen mit je eigenem `.qty`-Feld |
| `serialRequired` | `boolean` | SN-Pflicht |
| `serialNumbers` | `string[]` | Zugeordnete Seriennummern |

### Bestehende qty-basierende useMemos — WIEDERVERWENDUNG

In `src/pages/RunDetail.tsx` existieren bereits:

```typescript
// Nenner K4 (SN-Pflicht qty) — ca. Z. 75
const serialRequiredQtySum = useMemo(
  () => currentRunLines.filter(l => l.serialRequired === true).reduce((s, l) => s + l.qty, 0),
  [currentRunLines]
);

// SubValue K4 (ohne SN-Pflicht qty) — ca. Z. 79
const serialNotRequiredArticleCount = useMemo(
  () => currentRunLines.filter(l => l.serialRequired === false).reduce((s, l) => s + l.qty, 0),
  [currentRunLines]
);
```

→ Diese werden DIREKT wiederverwendet (kein Doppel-Code).

---

## Audit pro Kachel

### KACHEL 3 — Preise geprüft

| | Ist | Soll |
|---|---|---|
| **Zähler** | `currentRun.stats.priceOkCount` (Zeilenanzahl) | `priceOkQtySum` (Σ qty) |
| **Nenner** | `targetPositionsCount` (Zeilen-Snapshot — falsch) | `targetArticleCount` (Stück-Snapshot) |

`priceOkCount` wird in `runStore.ts` Z. 282 definiert als:
```typescript
priceOkCount: lines.filter(l => l.priceCheckStatus === 'ok').length
```
→ Das ist eine Zeilenzahl. Neu benötigt: Σ(l.qty) der Zeilen mit `priceCheckStatus === 'ok'`.

**Neues useMemo `priceOkQtySum`:**
```typescript
const priceOkQtySum = useMemo(
  () => currentRunLines
    .filter(l => l.priceCheckStatus === 'ok' || l.priceCheckStatus === 'custom')
    .reduce((s, l) => s + l.qty, 0),
  [currentRunLines]
);
```
> 'custom' eingeschlossen: manuell korrigierte Preise gelten als geprüft/ok.

**KPITile value (neu):**
```tsx
value={`${priceOkQtySum}/${currentRun.invoice.targetArticleCount ?? (currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines)}`}
```

`isKachel3Verified` bleibt unverändert — es prüft das Binärmerkmal "gibt es irgendwelche
Abweichungen?" und ist auf Linienzahl-Basis korrekt.

---

### KACHEL 4 — Serials geparst

| | Ist | Soll |
|---|---|---|
| **Zähler** | `currentRun.stats.serialMatchedCount` (Zeilenanzahl) | `serialMatchedQtySum` (Σ qty vollständig gematchter Zeilen) |
| **Nenner** | `currentRun.stats.serialRequiredCount \|\| '?'` (Zeilenanzahl) | `serialRequiredQtySum \|\| '?'` (bereits existierendes useMemo ✓) |
| **SubValue** | `${serialNotRequiredArticleCount} ohne S/N-Pflicht` | unverändert — bereits qty-basiert ✓ |

`serialMatchedCount` ist in runStore.ts eine Zeilenzahl. Neu benötigt: Σ(l.qty) der
SN-Pflicht-Zeilen, bei denen `serialNumbers.length >= qty` (vollständige SN-Abdeckung).

**Neues useMemo `serialMatchedQtySum`:**
```typescript
const serialMatchedQtySum = useMemo(
  () => currentRunLines
    .filter(l => l.serialRequired === true && l.serialNumbers.length >= l.qty)
    .reduce((s, l) => s + l.qty, 0),
  [currentRunLines]
);
```

**KPITile value (neu):**
```tsx
value={`${serialMatchedQtySum}/${serialRequiredQtySum || '?'}`}
```

`isKachel4Verified` bleibt unverändert — es prüft bereits qty-basiert
(`serialNotRequiredArticleCount + serialRequiredQtySum === totalQty`).

---

### KACHEL 5 — Beleg zugeteilt

| | Ist | Soll |
|---|---|---|
| **Zähler** | `currentRun.stats.matchedOrders` (Zeilenanzahl) | `matchedOrdersQtySum` (Σ zugeteilte qty aus `allocatedOrders`) |
| **Nenner** | `targetPositionsCount` (Zeilen-Snapshot — falsch) | `targetArticleCount` (Stück-Snapshot) |
| **SubValue** | `${allocatedOrderCount} Beleg-Nr. zugeteilt` | unverändert ✓ |

`matchedOrders` aus runStore.ts zählt Zeilen. Neu benötigt: Σ aller `allocatedOrders[].qty`
über alle Zeilen (= tatsächlich zugeteilte Stückzahl laut Bestellzuordnung).

**Neues useMemo `matchedOrdersQtySum`:**
```typescript
const matchedOrdersQtySum = useMemo(
  () => currentRunLines.reduce(
    (s, l) => s + l.allocatedOrders.reduce((a, o) => a + o.qty, 0),
    0
  ),
  [currentRunLines]
);
```

**KPITile value (neu):**
```tsx
value={`${matchedOrdersQtySum}/${currentRun.invoice.targetArticleCount ?? (currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines)}`}
```

`isKachel5Verified` bleibt unverändert — es prüft das Format-Kriterium der Bestellnummern.

---

## Zusammenfassung aller Code-Änderungen

### `src/pages/RunDetail.tsx`

**3 neue useMemos** (nach `serialNotRequiredArticleCount`, ca. Z. 85 einfügen):

```typescript
// PROJ-29 Korrektur: Kachel 3 — qty aller Zeilen mit ok/custom Preischeck
const priceOkQtySum = useMemo(
  () => currentRunLines
    .filter(l => l.priceCheckStatus === 'ok' || l.priceCheckStatus === 'custom')
    .reduce((s, l) => s + l.qty, 0),
  [currentRunLines]
);

// PROJ-29 Korrektur: Kachel 4 — qty aller SN-Pflicht-Zeilen mit vollständiger SN-Abdeckung
const serialMatchedQtySum = useMemo(
  () => currentRunLines
    .filter(l => l.serialRequired === true && l.serialNumbers.length >= l.qty)
    .reduce((s, l) => s + l.qty, 0),
  [currentRunLines]
);

// PROJ-29 Korrektur: Kachel 5 — Σ zugeteilte qty aus allocatedOrders
const matchedOrdersQtySum = useMemo(
  () => currentRunLines.reduce(
    (s, l) => s + l.allocatedOrders.reduce((a, o) => a + o.qty, 0),
    0
  ),
  [currentRunLines]
);
```

**3 KPITile value-Props ändern:**

| Kachel | Zähler alt → neu | Nenner alt → neu |
|---|---|---|
| K3 (ca. Z. 580) | `priceOkCount` → `priceOkQtySum` | `targetPositionsCount` → `targetArticleCount` |
| K4 (ca. Z. 588) | `serialMatchedCount` → `serialMatchedQtySum` | `serialRequiredCount \|\| '?'` → `serialRequiredQtySum \|\| '?'` |
| K5 (ca. Z. 601) | `matchedOrders` → `matchedOrdersQtySum` | `targetPositionsCount` → `targetArticleCount` |

### `features/PROJ-29-kpi-double-check.md`

Dokumentation anhängen: "Korrektur zu ADD-ON 12 Rev. 2: Kachel 3/4/5 Zähler+Nenner auf qty-Basis"

---

## Unverändertes (explizit bestätigt)

- `isKachel3Verified` — bleibt (binäre Abweichungsprüfung)
- `isKachel4Verified` — bleibt (qty-basiert, bereits korrekt)
- `isKachel5Verified` — bleibt (Format-Prüfung Bestellnummern)
- Kachel 1 und 2 — nicht angefasst
- Alle subValues — unverändert
- Kachel 1 / Parser-Logik / Warnungen — nicht angefasst

---

## Verifikation

1. `npx tsc --noEmit` → 0 Errors
2. Run mit 45 Positionen / 295 Stück laden:
   - K3 zeigt `295/295` (alle Preise ok) statt `45/45`
   - K4 zeigt Stückzahl der SN-Pflicht-Artikel (z. B. `120/120`)
   - K5 zeigt zugeteilte Stückzahl (z. B. `295/295`)
3. Kachel 1 und 2 unverändert
4. Fehler-Sample (50 EUR Differenz): Soft-Fail-Banner im Issues-Tab erscheint weiterhin korrekt

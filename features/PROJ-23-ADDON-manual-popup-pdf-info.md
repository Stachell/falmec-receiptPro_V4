# PROJ-23 ADD-ON: ManualOrderPopup — PDF-Kontext-Info-Zeile

**Status:** In Progress
**Scope:** `src/components/run-detail/ManualOrderPopup.tsx` — ausschließlich
**Ticket-Kontext:** PROJ-23 Phase A5 (ManualOrderPopup)
**Datum:** 2026-03-02

---

## Motivation

Das "Bestellung zuweisen"-Popup zeigt dem User bisher nur das Matching-Ergebnis aus Step 4 ("Aktuell: [Bestellnummer]"). Dem User fehlt der Kontext, welche Bestellnummer der **PDF-Parser in Step 1** direkt aus der Rechnung gelesen hat — bevor Step 4 irgendeine Zuweisung vorgenommen hat. Diese Information ist für manuelle Korrekturen essenziell.

---

## Datenquelle: parsedPositions

Der PDF-Rohwert liegt im unveränderlichen State-Slice `runStore.parsedPositions` (Typ: `ParsedInvoiceLineExtended[]`). Dieses Array wird nach Step 1 befüllt und danach nie modifiziert.

**Verknüpfung:** `InvoiceLine.positionIndex === ParsedInvoiceLineExtended.positionIndex`

**Verwendetes Feld:** `orderCandidatesText: string` — z. B. `"10153"` oder `"10153, 10154"` oder `""` wenn keine Bestellnummer erkannt.

---

## Implementierung

### ManualOrderPopup.tsx — 3 minimale Änderungen

**1. Store-Destructuring** (Zeile 44):
```typescript
// ALT
const { orderPool, reassignOrder } = useRunStore();
// NEU
const { orderPool, reassignOrder, parsedPositions } = useRunStore();
```

**2. Neue lokale Variable** (nach `artNoDE`, ca. Zeile 50):
```typescript
const pdfOrderText = parsedPositions
  .find(p => p.positionIndex === line.positionIndex)
  ?.orderCandidatesText ?? '';
```

**3. Reihenfolge im JSX** — "PDF übermittelt" steht **oberhalb** von "Aktuell:", dann Dropdown:
```
Bestellung zuweisen
PDF übermittelt: [Step-1-Rohwert]
Aktuell: [Step-4-Ergebnis] (reason)   ← nur wenn orderNumberAssigned gesetzt
** Dropdown **
```

```tsx
{/* PDF order hint — raw value from Step 1, never overwritten by matching */}
<div className="text-xs text-muted-foreground">
  PDF übermittelt:{' '}
  <span className="font-mono text-foreground">
    {pdfOrderText || '(keine Angabe)'}
  </span>
</div>

{/* Current assignment hint */}
{line.orderNumberAssigned && (
  <div className="text-xs text-muted-foreground">
    Aktuell: <span className="font-mono text-foreground">{line.orderNumberAssigned}</span>{' '}
    <span className="italic">({line.orderAssignmentReason})</span>
  </div>
)}
```

---

## Was sich NICHT ändert

- `InvoiceLine`-Interface — unberührt
- `runStore.ts` — unberührt (`parsedPositions` existiert bereits)
- `types/index.ts` — unberührt
- Matching-Logik, `reassignOrder`, `handleConfirm` — unberührt
- `ItemsTable.tsx`, `orderPool.ts` — unberührt

---

## Verifikation

| Test | Erwartung |
|------|-----------|
| Popup öffnen, PDF hat Bestellnummer erkannt | `PDF übermittelt: 10153` |
| Popup öffnen, PDF hat keine Bestellnummer | `PDF übermittelt: (keine Angabe)` |
| Manuell Bestellung reassignen | PDF-Zeile unverändert (parsedPositions ist immutable) |
| `tsc --noEmit` | 0 Fehler |

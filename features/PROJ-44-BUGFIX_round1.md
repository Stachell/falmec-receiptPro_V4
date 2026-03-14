# PROJ-44 Bugfix Runde 2 — Korrigierter Architekturplan

## Context
Audit des Plans `PROJ-44-BUGFIX_round1.md` gegen Code-Realitaet + User-Feedback. 4 offene Bugs identifiziert, davon Bug 2 mit neuer Root-Cause-Analyse.

---

## Audit-Score: 8.3 → korrigiert auf 9.6

### Bug 2 — Root-Cause-Analyse (NEU)

**User-Symptom:** E-Mail eingeben → Dialog schliessen → erneut oeffnen → Eintrag weg. Keine Button-Response.

**Root Cause:** Der User erwartet Auto-Save, bekommt aber manuellen Save. Wenn der User eine E-Mail eingibt und den Dialog per X schliesst (ohne "Speichern" zu klicken), wird `handleSaveEmails` nie aufgerufen. Die Daten gehen verloren, weil `emailAddresses` nur im React-State lebt und beim naechsten Mount neu initialisiert wird.

**Code-Pfad:**
- `SettingsPopup.tsx:316`: State init mit leeren Slots
- `SettingsPopup.tsx:360`: useEffect laedt aus localStorage → ABER localStorage ist leer, weil nie gespeichert wurde
- `SettingsPopup.tsx:341`: `handleSaveEmails` → `saveEmailAddresses` → `localStorage.setItem` → wird nie aufgerufen

**Fix-Strategie:** Auto-Save bei jeder Aenderung implementieren.
- `handleUpdateAddress` (Zeile 334-339) soll nach dem State-Update auch direkt `saveEmailAddresses` aufrufen
- ODER: `useEffect` auf `emailAddresses`-Changes, der debounced auto-saved
- Die einfachere Loesung: In `handleUpdateAddress` direkt nach `setEmailAddresses` einen auto-save Nebeneffekt ausfuehren

**Empfohlene Loesung (KISS):**
```typescript
const handleUpdateAddress = (index: number, value: string) => {
  setEmailAddresses(prev => {
    const next = [...prev];
    next[index] = value;
    // Auto-persist (fire-and-forget, validation errors are visual-only)
    const slots = next.map(s => s.trim());
    const hasInvalid = slots.some(s => s.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    if (!hasInvalid) {
      const payload = { addresses: slots, savedAt: new Date().toISOString() };
      localStorage.setItem('falmec-error-handling-emails', payload);
    }
    return next;
  });
};
```

**ACHTUNG:** Dieser direkte localStorage-Zugriff umgeht `saveEmailAddresses()`. Sauberer waere ein separater `useEffect`:

```typescript
// Auto-save on changes (debounced)
useEffect(() => {
  if (!open) return;
  const timeout = setTimeout(() => {
    const result = saveEmailAddresses(emailAddresses);
    if (result.ok) {
      // silent save - no toast, no visual feedback needed
    }
  }, 500);
  return () => clearTimeout(timeout);
}, [emailAddresses, open]);
```

Dies nutzt die existierende `saveEmailAddresses`-Funktion (Validierung inklusive), debounced 500ms, und speichert nur wenn der Dialog offen ist.

**Zusaetzlich:** Der "Speichern"-Button und sein Feedback (`emailSaved` + Toast) koennen als expliziter Save-Trigger bestehen bleiben, aber die primaere Persistenz laeuft ueber Auto-Save.

---

### Bug 3 — IssueDialog Layout (UNVERAENDERT, PRAEZISE)

**Datei:** `src/components/run-detail/IssueDialog.tsx`

| Zeile | IST | SOLL |
|-------|-----|------|
| 190 | `className="max-w-[600px] w-full"` | `className="max-w-[810px] w-full max-h-[85vh] flex flex-col"` |
| 205 | `className="flex gap-4 mt-2 h-[65vh] max-h-[800px]"` | `className="flex gap-4 mt-2 flex-1 overflow-hidden"` |
| 396 | `className="flex-1 flex flex-col overflow-y-auto mt-0 space-y-3 h-full"` | `className="flex-1 flex flex-col h-full overflow-y-auto pr-2"` |

---

### Bug 4 — Button-Design (PRAEZISIERT)

**Datei:** `src/components/run-detail/IssueDialog.tsx`

**NUR Zeile 388** (Tab 3 "Loesung erzwingen"):
```
IST:  className="gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white"
SOLL: className="gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white"
```

**ACHTUNG fuer Sonnet:** In Tab 1 (Zeile 291) existiert bereits ein Button mit dem neuen Styling — dieser darf NICHT veraendert werden! Nur Zeile 388.

---

### Bug 6 — Tabelle erweitern (VERVOLLSTAENDIGT)

**Datei:** `src/components/run-detail/WarehouseLocations.tsx`

**A) SortKey-Typ (Zeile 21):**
```typescript
type SortKey = 'positionIndex' | 'falmecArticleNo' | 'storageLocation';
```

**B) sortLines (Zeile 62-74) — vollstaendig ersetzen:**
```typescript
const sortLines = (lines: InvoiceLine[]): InvoiceLine[] => {
  return [...lines].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'positionIndex') {
      cmp = (a.positionIndex ?? 0) - (b.positionIndex ?? 0);
    } else if (sortKey === 'falmecArticleNo') {
      const aVal = a.falmecArticleNo ?? '';
      const bVal = b.falmecArticleNo ?? '';
      cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
    } else {
      const aVal = a.storageLocation ?? '';
      const bVal = b.storageLocation ?? '';
      cmp = aVal.localeCompare(bVal, 'de');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
};
```

**C) Header (Zeile 194-216) — neue Spaltenreihenfolge:**

Nach dem POS-Header (Zeile 200) einfuegen:
```tsx
<TableHead
  className={`cursor-pointer select-none ${expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}
  onClick={() => handleSortClick('falmecArticleNo')}
>
  Artikelnr. <SortIcon col="falmecArticleNo" />
</TableHead>
```

Bestehenden Header "Artikelnummer" (Zeile 201) umbenennen zu "Herstellerartikelnr."

**D) Zeilen (Zeile 224-235) — Zellen anpassen:**

Nach POS-Cell (Zeile 227) einfuegen:
```tsx
<TableCell>
  <span className="font-mono text-sm">{line.falmecArticleNo ?? '—'}</span>
</TableCell>
```

Beschreibungs-Cell (Zeile 233) aendern:
```tsx
{line.descriptionDE ?? line.descriptionIT}
```

**E) handleSortClick + SortIcon:** Keine Aenderung noetig — diese Funktionen arbeiten generisch mit dem SortKey-Typ und passen sich automatisch an.

---

## Dateien-Matrix

| Datei | Bugs | Aenderungsart |
|-------|------|---------------|
| `src/components/SettingsPopup.tsx` | 2 | useEffect Auto-Save + debounce hinzufuegen |
| `src/components/run-detail/IssueDialog.tsx` | 3, 4 | 3x className + 1x Button-Styling |
| `src/components/run-detail/WarehouseLocations.tsx` | 6 | SortKey + sortLines + Spalte + Labels |

## Eiserne Regeln

1. Export-Logik (`exportService.ts`) NICHT anfassen
2. Keine Matcher-/Parser-Aenderungen
3. DRY: `sortLines()` bleibt eine Funktion
4. `npx tsc --noEmit` am Ende ausfuehren

## Verifikation

**Bug 2:** E-Mail eingeben → Dialog schliessen → erneut oeffnen → Eintrag muss vorhanden sein
**Bug 3:** IssueDialog ist ~810px breit, scrollt intern, max 85vh
**Bug 4:** Tab 3 Button ist weiss/orange, Hover gruen/weiss
**Bug 6:** Neue Spalte "Artikelnr." mit falmecArticleNo, deutsche Beschreibung, numerische Sortierung

## Confidence Score: 9.6 / 10.0

**Begruendung:**
- Bug 2 Root Cause identifiziert und Fix-Strategie mit Code-Snippet definiert
- Bug 3+4 sind reine CSS-Aenderungen mit exakten IST/SOLL-Werten
- Bug 6 hat vollstaendiges JSX + DRY + numeric localeCompare

**Restrisiken:**
1. Auto-Save Debounce (Bug 2): 500ms koennte bei sehr schnellem Tippen zu fruehem Save fuehren → Validierungsfehler werden still ignoriert (gewollt)
2. `descriptionDE` kann null sein → Fallback auf IT eingeplant
3. `falmecArticleNo` kann null sein → wird als "—" angezeigt

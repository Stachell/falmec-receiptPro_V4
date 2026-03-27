# PROJ-44-ADD-ON-Preisabweichung_round7

## Zusammenfassung

Preisabweichungen (`price-mismatch`) sind absolute Hard-Fails, die Step 4 blockieren. Dieses ADD-ON implementiert drei chirurgische Verbesserungen:

1. **Store-Katastrophe fixen:** `setManualPrice` ruft `refreshIssues` nicht auf — Tabellen-Edits lösen den Fehler im IssueCenter nicht auf.
2. **UI-Schranke entfernen:** Die PriceCell im IssueDialog ist hinter `isExpanded === true` versteckt — vor Step 4 nicht nutzbar.
3. **Charmante Bestätigung:** Preisauswahl im Übersicht-Tab wird nicht sofort gespeichert, sondern als Pending-State in den "Lösung erzwingen"-Tab geleitet, wo der User explizit bestätigt.

**Dateien:** 2 (runStore.ts, IssueDialog.tsx)

---

## Phase 1: Store-Katastrophe fixen (KRITISCH)

### Befund

| Action | Datei | Zeile | Ruft `refreshIssues`? |
|--------|-------|-------|-----------------------|
| `setManualPrice` | runStore.ts | 2721–2758 | NEIN |
| `setManualPriceByPosition` | runStore.ts | 2760–2807 | JA (Z.2806) |
| `setManualArticleByPosition` | runStore.ts | ~2922 | JA |

`setManualPrice` aktualisiert `unitPriceFinal` + `priceCheckStatus` + PriceStats, ruft aber **nie** `refreshIssues` auf. Folge: Ein manuell korrigierter Preis in der Tabelle löst den `price-mismatch`-Issue im Fehler-Center nicht auf — der User sieht weiter einen roten Blocker, obwohl der Preis bereits korrekt ist.

### Fix

**Datei:** `src/store/runStore.ts`
**Stelle:** Am Ende von `setManualPrice` (nach dem PriceStats-Update-Block, ca. Zeile 2756)

```typescript
// PROJ-44-ADD-ON-R7: Auto-Resolve nach manuellem Preis (analog setManualPriceByPosition)
const runIdForRefresh = get().currentRun?.id;
if (runIdForRefresh) {
  get().refreshIssues(runIdForRefresh);
}
```

**Warum getrennte Variable `runIdForRefresh`?** `currentRun` wurde bereits oben in einem destructuring gelesen (Z.2738: `const { invoiceLines, currentRun, runs } = get()`), aber nach dem `set()` auf Z.2743 kann sich der State geändert haben. Sicherheitshalber frisch aus `get()` lesen.

### Risiko

Minimal. `refreshIssues` ist idempotent und wird bereits von `setManualPriceByPosition` und `setManualArticleByPosition` aufgerufen. Pattern ist identisch.

---

## Phase 2: UI-Schranke entfernen & Auswahl abfangen

### Befund

**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Zeile 534:**
```tsx
{issue?.type === 'price-mismatch' && (currentRun?.isExpanded ?? false) && (() => {
```

Die Bedingung `(currentRun?.isExpanded ?? false)` verhindert, dass die PriceCell im Übersicht-Tab angezeigt wird, solange der Run nicht "ausgerollt" (expanded) ist. Da `isExpanded` erst nach Step 4 auf `true` gesetzt wird, ist die Preis-Korrektur vor Step 4 im IssueDialog nicht möglich — genau dann, wenn man sie am meisten braucht.

**Zeile 552–558 (aktuelles Verhalten):**
```tsx
<PriceCell
  line={mismatchLine}
  onSetPrice={(_lineId, price) => {
    if (currentRun) {
      setManualPriceByPosition(mismatchLine.positionIndex, price, currentRun.id);
    }
  }}
/>
```

Die Auswahl feuert **sofort** `setManualPriceByPosition` — kein Sicherheitsnetz, kein "Are you sure?".

### Fix — Schritt 2a: Lokaler Pending-State + Reset bei Issue-Wechsel

**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Stelle:** Nach den bestehenden State-Deklarationen (ca. Zeile 381)

Neuen State einfügen:
```tsx
// PROJ-44-ADD-ON-R7: Pending-Preis für Bestätigungs-Workflow
const [pendingPrice, setPendingPrice] = useState<{
  positionIndex: number;
  price: number;
  lineLabel: string;
} | null>(null);
```

**KRITISCH — Ghost-Value-Schutz:** In der bestehenden `useEffect([issue])` (Zeile 393–399) muss `setPendingPrice(null)` ergänzt werden. Grund: In `IssuesCenter.tsx` wird `setSelectedIssue(newIssue)` direkt aufgerufen (Zeilen 594/596/621/623), ohne den Zwischenschritt `null`. Dadurch bleibt die `IssueDialog`-Komponente gemountet und `pendingPrice` aus dem vorherigen Issue lebt weiter.

**Zeile 393–399 ändern von:**
```tsx
useEffect(() => {
    if (issue) {
      setStoredEmails(getStoredEmailAddresses());
      setEmailBody(buildIssueClipboardText(issue, invoiceLines));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue]);
```
**zu:**
```tsx
useEffect(() => {
    if (issue) {
      setStoredEmails(getStoredEmailAddresses());
      setEmailBody(buildIssueClipboardText(issue, invoiceLines));
    }
    // PROJ-44-ADD-ON-R7: Pending-Preis zurücksetzen bei Issue-Wechsel (Ghost-Value-Schutz)
    setPendingPrice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue]);
```

**Warum `setPendingPrice(null)` AUSSERHALB des `if (issue)`?** Auch bei `issue === null` (Dialog schließt) soll der State sauber aufgeräumt werden — defensives Programmieren für den Fall, dass Radix das Content-Element nicht sofort unmountet (Close-Animation).

### Fix — Schritt 2b: `isExpanded`-Schranke entfernen

**Zeile 534 ändern von:**
```tsx
{issue?.type === 'price-mismatch' && (currentRun?.isExpanded ?? false) && (() => {
```
**zu:**
```tsx
{issue?.type === 'price-mismatch' && (() => {
```

### Fix — Schritt 2c: PriceCell-Callback abfangen

**Zeilen 552–558 ändern von:**
```tsx
<PriceCell
  line={mismatchLine}
  onSetPrice={(_lineId, price) => {
    if (currentRun) {
      setManualPriceByPosition(mismatchLine.positionIndex, price, currentRun.id);
    }
  }}
/>
```
**zu:**
```tsx
<PriceCell
  line={mismatchLine}
  onSetPrice={(_lineId, price) => {
    // PROJ-44-ADD-ON-R7: Nicht sofort speichern — in Pending-State merken + Tab wechseln
    setPendingPrice({
      positionIndex: mismatchLine.positionIndex,
      price,
      lineLabel: getLineLabel(issue, mismatchLine),
    });
    setActiveTab('resolve');
  }}
/>
```

### Risiko

Keines. `isExpanded` war eine willkürliche UI-Schranke, keine Datenintegrität-Bedingung. Die PriceCell rendert nur, wenn `mismatchLine` existiert. Der `setActiveTab('resolve')` nutzt den bestehenden lokalen Tab-State.

---

## Phase 3: Charmante Bestätigung im "Lösung erzwingen"-Tab (KISS)

### Befund

**Datei:** `src/components/run-detail/IssueDialog.tsx`
**Zeilen 645–720:** Tab "Lösung erzwingen" (`value="resolve"`)

Aktueller Aufbau:
1. Orange Warnbox (Z.648–650)
2. Zeilen-Auswahl mit Checkboxen (Z.653–694)
3. Lösungsbeschreibung Textarea (Z.697–706)
4. "Lösung anwenden" Button (Z.710–717)

### KISS-Prinzip: Bestehenden Button kapern, keine neuen Buttons

Statt eigene Buttons zu bauen, wird der **bereits existierende** "Lösung anwenden"-Button (Z.710–717) wiederverwendet. Nur eine Info-Box wird neu eingefügt.

### Fix — Schritt 3a: Reine Info-Anzeige einfügen (keine Buttons!)

**Stelle:** Direkt nach der orangen Warnbox (nach Zeile 650), VOR der Zeilen-Auswahl.

Neuen Block einfügen:
```tsx
{/* PROJ-44-ADD-ON-R7: Pending-Preis Info-Anzeige (rein visuell, kein eigener Button!) */}
{issue.type === 'price-mismatch' && pendingPrice && (
  <div className="rounded-lg border-2 border-teal-400/60 bg-teal-50/20 p-3 space-y-1">
    <p className="text-sm font-semibold text-teal-800">
      Preiskorrektur bestätigen
    </p>
    <p className="text-xs text-muted-foreground">
      Bitte bestätigen Sie die Auswahl mit dem Button unten:
    </p>
    <div className="flex items-center gap-3 rounded border border-teal-300/50 bg-white/40 px-3 py-2">
      <span className="text-xs font-mono text-foreground">{pendingPrice.lineLabel}</span>
      <span className="ml-auto text-sm font-bold text-teal-700">
        {pendingPrice.price.toFixed(2)} EUR
      </span>
    </div>
  </div>
)}
```

### Fix — Schritt 3b: Bestehenden "Lösung anwenden"-Button kapern

**Zeilen 710–717 — bestehender Handler:**
```tsx
<Button
  onClick={handleResolve}
  disabled={!resolutionNote.trim()}
  className="gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white"
>
  <AlertTriangle className="w-3.5 h-3.5" />
  Loesung anwenden
</Button>
```

**Ändern zu:**
```tsx
<Button
  onClick={() => {
    // PROJ-44-ADD-ON-R7: Price-Mismatch Shortcut — pendingPrice hat Vorrang
    if (issue.type === 'price-mismatch' && pendingPrice && currentRun) {
      setManualPriceByPosition(pendingPrice.positionIndex, pendingPrice.price, currentRun.id);
      setPendingPrice(null);
      onClose();
      return;
    }
    // Fallback: regulärer Resolve-Flow (Textarea-Begründung)
    handleResolve();
  }}
  disabled={issue.type === 'price-mismatch' && pendingPrice ? false : !resolutionNote.trim()}
  className="gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white"
>
  <AlertTriangle className="w-3.5 h-3.5" />
  {issue.type === 'price-mismatch' && pendingPrice ? 'Preis uebernehmen' : 'Loesung anwenden'}
</Button>
```

**Schlüssellogik:**
- `onClick`: Wenn `price-mismatch` + `pendingPrice` → `setManualPriceByPosition` + Dialog schließen. Sonst → reguläres `handleResolve()`.
- `disabled`: Bei `pendingPrice` ist der Button IMMER aktiv (kein Textarea-Zwang). Sonst → bisherige Logik (`!resolutionNote.trim()`).
- Label: Dynamisch — "Preis uebernehmen" bei pendingPrice, sonst "Loesung anwenden".

### Verhalten

1. User öffnet IssueDialog für einen `price-mismatch` Issue.
2. Im **Übersicht**-Tab sieht er die PriceCell (jetzt IMMER sichtbar, nicht nur bei `isExpanded`).
3. User wählt einen Preis (z.B. "Rechnungspreis" oder "Sage-Preis") aus dem Dropdown.
4. **Statt sofortigem Speichern:** Der Wert wird in `pendingPrice` gemerkt, der Tab wechselt automatisch auf "Lösung erzwingen".
5. Im **Lösung erzwingen**-Tab sieht der User prominent die Info-Box mit dem gewählten Preis.
6. Der **bestehende** Button zeigt jetzt "Preis uebernehmen" und ist sofort klickbar (kein Textarea-Pflichtfeld).
7. Klick → `setManualPriceByPosition` feuert, Dialog schließt sich.
8. Für alle anderen Issue-Typen bleibt der Button-Workflow komplett identisch (Textarea + "Lösung anwenden").

### Risiko

Minimal. Kein neues UI-Element mit eigenem Handler. Der bestehende Button bekommt lediglich eine Weiche im `onClick` und `disabled`-Prop. Für nicht-price-mismatch Issues ändert sich exakt nichts.

---

## Zusammenfassung der Änderungen

| # | Datei | Zeilen (ca.) | Änderung |
|---|-------|--------------|----------|
| 1 | `src/store/runStore.ts` | ~2756 | `refreshIssues(runId)` am Ende von `setManualPrice` |
| 2 | `src/components/run-detail/IssueDialog.tsx` | ~381 | Neuer State `pendingPrice` |
| 3 | `src/components/run-detail/IssueDialog.tsx` | 393–399 | `setPendingPrice(null)` in `useEffect([issue])` (Ghost-Value-Schutz) |
| 4 | `src/components/run-detail/IssueDialog.tsx` | 534 | `isExpanded`-Bedingung entfernen |
| 5 | `src/components/run-detail/IssueDialog.tsx` | 552–558 | PriceCell-Callback → `setPendingPrice` + `setActiveTab('resolve')` |
| 6 | `src/components/run-detail/IssueDialog.tsx` | ~651 | Info-Box für `pendingPrice` im Resolve-Tab (nur Anzeige, keine Buttons) |
| 7 | `src/components/run-detail/IssueDialog.tsx` | 710–717 | Bestehenden "Lösung anwenden"-Button kapern (onClick-Weiche + dynamisches Label) |

**Gesamtumfang:** ~30 Zeilen neuer Code, ~12 Zeilen geändert, 1 Bedingung entfernt. 2 Dateien. 0 neue Buttons.

---

## Nützliche Hinweise für Sonnet

### 1. Typisierung von `setManualPrice` NICHT verletzen

Die Action `setManualPrice` hat die Signatur `(lineId: string, price: number) => void`. Sie nimmt KEINEN `runId`-Parameter entgegen (anders als `setManualPriceByPosition`). Der `runId` für `refreshIssues` muss INNERHALB der Action aus `get().currentRun?.id` gelesen werden — NICHT als neuen Parameter hinzufügen! Das würde das Interface im Store und alle Call-Sites brechen.

```typescript
// RICHTIG:
const runIdForRefresh = get().currentRun?.id;
if (runIdForRefresh) {
  get().refreshIssues(runIdForRefresh);
}

// FALSCH — verändert die Signatur!
setManualPrice: (lineId, price, runId) => { ... }
```

### 2. Tab-Wechsel ist LOKAL, nicht global

Der `activeTab`-State ist ein lokaler `useState` im `IssueDialog` (Zeile 376):
```tsx
const [activeTab, setActiveTab] = useState('overview');
```

Das ist KEIN globaler Store-Tab und KEIN Router-Tab. `setActiveTab('resolve')` wechselt nur den internen Dialog-Tab. Es gibt bereits Precedent dafür — siehe Zeile 604 (`onClick={() => setActiveTab('email')}`) und Zeile 613 (`onClick={() => setActiveTab('resolve')}`).

### 3. `pendingPrice` Reset — DREI Stellen, nicht eine!

Der `pendingPrice`-State MUSS an drei Stellen auf `null` gesetzt werden:

1. **`useEffect([issue])` (Schritt 2a):** Pflicht! In `IssuesCenter.tsx` kann der User direkt von Issue A auf Issue B klicken (`setSelectedIssue(newIssue)` ohne `null`-Zwischenschritt, Z.594/596/621/623). Die Komponente bleibt gemountet, `pendingPrice` aus Issue A überlebt → Ghost-Value. Der Reset im `useEffect` fängt das ab.
2. **`onClick`-Handler des Buttons (Schritt 3b):** Explizit `setPendingPrice(null)` vor `onClose()` — defensiv für den Fall, dass Radix die Close-Animation asynchron ausführt und der State kurzzeitig weiterlebt.
3. **React Unmount (automatisch):** Wenn der Dialog normal schließt (`issue → null`), zerstört React den lokalen State. Das ist das Backup, aber NICHT die einzige Absicherung.

### 3b. `disabled`-Prop Weiche nicht vergessen

Der bestehende Button hat `disabled={!resolutionNote.trim()}`. Bei `pendingPrice` darf der Button NICHT disabled sein (User muss kein Textarea ausfüllen für eine Preiskorrektur). Die Weiche: `disabled={issue.type === 'price-mismatch' && pendingPrice ? false : !resolutionNote.trim()}`.

### 4. `getLineLabel` ist bereits verfügbar

Die Funktion `getLineLabel(issue, line)` (Zeile 90–107) erzeugt ein lesbares Label wie `Pos. 3: 123456 — RE 12.50 EUR vs. Sage 14.00 EUR`. Diese Funktion im `pendingPrice`-State nutzen, um das Label beim Abfangen zu speichern (statt es im Resolve-Tab neu zu berechnen).

### 5. PriceCell Import + Props

`PriceCell` ist bereits importiert (Zeile 60: `import { PriceCell } from './PriceCell'`). Die relevante Prop ist `onSetPrice: (lineId: string, price: number) => void`. Im neuen Callback wird `_lineId` ignoriert (wie bisher), da `setManualPriceByPosition` über `positionIndex` arbeitet.

### 6. tsc-Prüfung am Ende

Nach allen Änderungen ZWINGEND `npx tsc --noEmit` ausführen. Typische Fallstricke:
- `pendingPrice` State-Type muss `null` als Union-Member haben
- `mismatchLine` könnte `undefined` sein → Optional Chaining oder Guard prüfen
- `issue.type` Vergleich ist String-Literal — keine Typisierungsprobleme erwartet

### 7. Reihenfolge der Implementierung

1. **Zuerst Phase 1** (runStore.ts) — das ist ein 3-Zeilen-Fix
2. **Dann Phase 2** (IssueDialog.tsx) — State + Bedingung + Callback
3. **Dann Phase 3** (IssueDialog.tsx) — Bestätigungs-Block im Resolve-Tab
4. **Zuletzt** `npx tsc --noEmit` + `features/INDEX.md` aktualisieren

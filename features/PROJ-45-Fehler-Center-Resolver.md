# PROJ-45: Fehler-Center-Resolver — Implementierungsplan
## Status: Done — Implementiert 2026-03-15, tsc 0 Errors

## Big Picture (Kontext & Vision)

**Vision:** Das Fehlercenter muss nach der FIFO-Expansion (Step 4) weiterhin voll funktionsfähig und bedienbar bleiben, ohne dass wir redundante UI-Komponenten bauen.

**Problem:** Issues werden in Step 2 (vor FIFO-Expansion) erstellt und speichern `relatedLineIds` im Format `{runId}-line-{positionIndex}`. Nach Step 4 erhalten alle Zeilen neue IDs im Format `{runId}-line-{positionIndex}-{expansionIndex}`. Die Funktion `checkIssueStillActive()` (runStore.ts:200-242) findet per `lines.filter(l => issue.relatedLineIds.includes(l.lineId))` keine Treffer mehr — Auto-Resolve ist nach Step 4 komplett tot.

**Zusatzproblem:** Auch `affectedLineIds` in IssueCard (IssuesCenter.tsx:140-146) und IssueDialog (IssueDialog.tsx:152-158) liefern nach Expansion leere Ergebnisse — die Issues zeigen keine betroffenen Zeilen mehr an.

**Ziel:** Zentralen Resolver erstellen, der alte IDs auf expandierte Zeilen mappt. Preis-Popup aus Artikelliste im Fehlercenter wiederverwenden. Auto-Resolve reparieren.

---

## Handschellen (Strikte Regeln)

1. **Kein Over-Engineering:** Keine neuen UI-Komponenten für Preiskorrektur. PriceCell 1:1 wiederverwenden.
2. **Striktes ID-Matching:** `{runId}-line-1` darf NICHT `{runId}-line-10-1` triggern.
3. **Vererbungs-Regel:** Preis im Fehlercenter → synchron auf ALLE expandierten Zeilen propagieren.
4. **Auto-Resolve:** Muss nach Preiskorrektur automatisch feuern.
5. **Workflow-Schutz:** Bestehende Workflows, Export-Guards, Step-Logik, InvoicePreview, ItemsTable NICHT beschädigen.
6. **DRY:** Resolver-Logik existiert exakt 1x im gesamten Projekt (`resolveIssueLines`).

---

## Komponente A: `resolveIssueLines()` — Zentraler DRY-Helper (runStore.ts)

**Ort:** Exportierte Funktion in `src/store/runStore.ts`, direkt vor `checkIssueStillActive()` (~Zeile 195)

**SSOT-Prinzip:** Diese eine Funktion ist der Single Source of Truth für ALLE ID-Auflösungen im gesamten Projekt — Store-intern (Auto-Resolve) UND UI (IssueCard, IssueDialog, handleIsolate).

```typescript
/**
 * PROJ-45: Zentraler Resolver — mappt alte Pre-Expansion-IDs auf aktuelle Zeilen.
 * Arbeitet in 2 Stufen:
 *   1. Direkte lineId-Matches (vor Expansion / IDs stimmen noch)
 *   2. Position-basierter Fallback per positionIndex (nach Expansion)
 *
 * @param ids       - relatedLineIds ODER affectedLineIds aus einem Issue
 * @param lines     - aktuelle InvoiceLine[] (evtl. bereits expandiert)
 * @param deduplicate - true: nur 1 Repräsentant pro positionIndex (UI-Anzeige)
 *                      false: alle expandierten Zeilen (Auto-Resolve, Isolier-Filter)
 */
export function resolveIssueLines(
  ids: string[],
  lines: InvoiceLine[],
  deduplicate: boolean = true,
): InvoiceLine[] {
  if (!ids || ids.length === 0) return [];

  // Stufe 1: Direkte ID-Matches (vor Expansion — IDs stimmen noch)
  const lineMap = new Map(lines.map(l => [l.lineId, l]));
  const direct = ids.map(id => lineMap.get(id)).filter((l): l is InvoiceLine => l != null);
  if (direct.length > 0) return direct;

  // Stufe 2: Position-basierter Fallback (nach Expansion)
  const positionSet = new Set<number>();
  for (const id of ids) {
    const m = id.match(/^.+-line-(\d+)$/);  // ← matcht NUR aggregierte IDs, NICHT expandierte
    if (m) positionSet.add(parseInt(m[1], 10));
  }
  if (positionSet.size === 0) return [];

  if (!deduplicate) {
    return lines.filter(l => positionSet.has(l.positionIndex));
  }

  // Deduplizierung: 1 Repräsentant pro positionIndex
  const seen = new Set<number>();
  return lines.filter(l => {
    if (!positionSet.has(l.positionIndex)) return false;
    if (seen.has(l.positionIndex)) return false;
    seen.add(l.positionIndex);
    return true;
  });
}
```

**Warum Regex `^.+-line-(\d+)$`:** Das `$` am Ende stellt sicher, dass NUR aggregierte IDs matchen (`run123-line-5` ✓), NICHT expandierte (`run123-line-5-0` ✗) und NICHT Position 10 bei Suche nach Position 1 (`run123-line-10-1` ✗).

**Warum im runStore.ts und kein neues File:** Die Funktion ist ~25 Zeilen, eng gekoppelt an `InvoiceLine` und `checkIssueStillActive`. Ein eigenes File wäre Over-Engineering. Wird als `export function` deklariert (freistehend, nicht im Store-Objekt), damit die UI-Komponenten sie importieren können.

### DRY-Übersicht: Wer ruft `resolveIssueLines` wie auf

| Aufrufer | `deduplicate` | Grund |
|----------|--------------|-------|
| `checkIssueStillActive()` (runStore.ts) | `false` | Auto-Resolve muss ALLE Geschwister prüfen |
| IssueCard `affectedLines` (IssuesCenter.tsx) | `true` | UI zeigt 1 Repräsentant pro Position |
| IssueDialog `affectedLines` (IssueDialog.tsx) | `true` | UI zeigt 1 Repräsentant pro Position |
| `handleIsolate()` (IssuesCenter.tsx) | `false` | Filter braucht ALLE expandierte lineIds |

---

## Komponente B: `checkIssueStillActive()` Fix (runStore.ts:204)

**Änderung:** 1 Zeile ersetzen — nutzt jetzt den zentralen Helper mit `deduplicate: false`.

```diff
- const related = lines.filter(l => issue.relatedLineIds.includes(l.lineId));
+ const related = resolveIssueLines(issue.relatedLineIds, lines, false);
```

Alle `switch`-Cases (price-mismatch, no-article-match, serial-mismatch, order-no-match, etc.) arbeiten weiter auf dem `InvoiceLine[]`-Array — keine weitere Änderung nötig.

---

## Komponente C: `setManualPriceByPosition()` Store-Action (runStore.ts)

**Interface** (~Zeile 487, nach `setManualPrice`):
```typescript
/** PROJ-45: Bulk-Preis auf alle expandierten Zeilen einer Position setzen */
setManualPriceByPosition: (positionIndex: number, price: number, runId: string) => void;
```

**Implementation** (nach `setManualPrice` ~Zeile 2679):
Folgt dem exakten Pattern von `setManualPrice` (Zeilen 2642-2679):

1. `set()` — alle Lines mit `line.positionIndex === positionIndex && line.lineId.startsWith(runId + '-line-')` bekommen `unitPriceFinal: price` + `priceCheckStatus: 'custom'`
2. `logService.info()` + `addAuditEntry()` (Audit-Trail wie setManualPrice:2657-2658)
3. Price-Stats neu berechnen (Pattern von setManualPrice:2661-2678)
4. `refreshIssues(runId)` aufrufen → Auto-Resolve feuert → price-mismatch Issue wird geschlossen

---

## Komponente D: IssuesCenter PriceCell-Integration (IssuesCenter.tsx)

### D1: Neue Props auf IssueCardProps (Zeile 124-130)
```typescript
interface IssueCardProps {
  issue: Issue;
  invoiceLines: InvoiceLine[];
  onSend: (issue: Issue) => void;
  onIsolate: (ids: string[]) => void;
  onEdit?: (issue: Issue) => void;
  // PROJ-45:
  isExpanded?: boolean;
  onBulkSetPrice?: (positionIndex: number, price: number) => void;
}
```

### D2: affectedLines-Memo ersetzen (IssueCard, Zeile 140-146)

Bestehenden Memo-Block durch Einzeiler mit dem zentralen Helper ersetzen:

```typescript
// PROJ-45: Zentraler Resolver — dedupliziert für UI-Anzeige
const affectedLines = useMemo(
  () => resolveIssueLines(issue.affectedLineIds ?? [], invoiceLines, true),
  [issue.affectedLineIds, invoiceLines],
);
```

Import: `import { resolveIssueLines } from '@/store/runStore';`

### D3: PriceCell-Rendering in IssueCard

**ACHTUNG Multi-Position:** Ein `price-mismatch` Issue kann MEHRERE Positionen enthalten (runStore.ts:3223 sammelt alle Mismatch-Zeilen). Deshalb NICHT `affectedLines[0]` verwenden — nach Fixierung der ersten Position zeigt das immer noch die bereits korrigierte Zeile (blaues Badge).

**Stattdessen:** Immer die NÄCHSTE unfixierte Position per `.find()` ermitteln:

```tsx
{/* PROJ-45: PriceCell nur für nächste unfixierte Mismatch-Position */}
{issue.type === 'price-mismatch' && isExpanded && (() => {
  const mismatchLine = affectedLines.find(l => l.priceCheckStatus === 'mismatch');
  if (!mismatchLine) return null;
  return (
    <PriceCell
      line={mismatchLine}
      onSetPrice={(_lineId, price) => {
        onBulkSetPrice?.(mismatchLine.positionIndex, price);
      }}
    />
  );
})()}
```

**Verhalten:** PriceCell rotiert automatisch durch alle Positionen. Wenn alle Positionen `'custom'` haben → kein PriceCell mehr → Auto-Resolve feuert.

Platzierung: Im Action-Buttons-Bereich (Zeile 201), VOR dem "Zeilen isolieren"-Button.
Import: `import { PriceCell } from './PriceCell';`

### D4: handleIsolate Fix (Zeile 407-409)

Bestehende Funktion ersetzen — nutzt den zentralen Helper mit `deduplicate: false`:

```typescript
const handleIsolate = (ids: string[]) => {
  // PROJ-45: IDs via Resolver auflösen (ohne Dedup — alle expandierten Zeilen für Filter)
  const resolved = resolveIssueLines(ids, invoiceLines, false);
  const filterIds = resolved.length > 0 ? resolved.map(l => l.lineId) : ids;
  setActiveIssueFilterIds(filterIds);
  setActiveTab('items');
};
```

### D5: Props durchreichen in IssuesCenter (bei allen `<IssueCard>`-Stellen)
```tsx
<IssueCard
  ...existing props...
  isExpanded={currentRun?.isExpanded ?? false}
  onBulkSetPrice={(positionIndex, price) => {
    if (currentRun) setManualPriceByPosition(positionIndex, price, currentRun.id);
  }}
/>
```

Store-Destructure erweitern: `setManualPriceByPosition` aus `useRunStore()` hinzufügen.

---

## Komponente E: IssueDialog affectedLines-Fix (IssueDialog.tsx:152-158)

Identischer Einzeiler wie D2 — ersetzt den bestehenden Memo-Block:

```typescript
// PROJ-45: Zentraler Resolver — dedupliziert für UI-Anzeige
const affectedLines = useMemo(
  () => issue ? resolveIssueLines(issue.affectedLineIds ?? [], invoiceLines, true) : [],
  [issue, invoiceLines],
);
```

Import: `import { resolveIssueLines } from '@/store/runStore';`

---

## Implementierungsreihenfolge

| # | Datei | Was | ~Zeilen |
|---|-------|-----|---------|
| 1 | `src/store/runStore.ts` | `resolveIssueLines()` exportierter Helper (~Z.195) | +25 |
| 2 | `src/store/runStore.ts` | `checkIssueStillActive()` 1-Zeilen-Fix (Z.204) | 1 geändert |
| 3 | `src/store/runStore.ts` | `setManualPriceByPosition` Interface + Impl | +2 Interface, +35 Impl |
| 4 | `src/components/run-detail/IssuesCenter.tsx` | Import `resolveIssueLines` + `PriceCell`, IssueCard Props+Memo+PriceCell, handleIsolate-Fix, Props durchreichen | ~30 |
| 5 | `src/components/run-detail/IssueDialog.tsx` | Import `resolveIssueLines`, affectedLines-Memo ersetzen | ~3 |

**Geschätzt:** ~100 Zeilen in 3 Dateien. Keine neuen Dateien. Resolver-Logik existiert exakt 1x.

---

## Kritische Dateien (Referenz, keine Änderung)

- `src/components/run-detail/PriceCell.tsx` — wird 1:1 wiederverwendet, Props: `line`, `onSetPrice(lineId, price, source)`, `readOnly?`, `onJumpToArticleList?`
- `src/services/matching/runs/run3ExpandFifo.ts` — bestätigt ID-Format `{runId}-line-{posIndex}-{expIndex}` + positionIndex-Erhalt via Spread
- `src/components/run-detail/ItemsTable.tsx` — bestätigt `activeIssueFilterIds.includes(line.lineId)` Filterlogik (Z.100-101)

---

## Verifikation

1. **Pre-Expansion (kein Regression):** Run starten, bei Step 2 stoppen. Price-Mismatch-Issue muss betroffene Zeilen anzeigen. Auto-Resolve muss mit direkten IDs funktionieren.
2. **Post-Expansion Auto-Resolve über Artikelliste:** Run bis Step 4. In Artikelliste Preis manuell setzen für ALLE expandierten Zeilen einer Position → Issue muss auto-resolven.
3. **Post-Expansion Preis via Fehlercenter:** Price-Mismatch-Issue öffnen. PriceCell-Popup im IssueCard nutzen → Preis auf ALLE Geschwister-Zeilen propagiert → Issue auto-resolved.
4. **Kein False-Positive ID-Matching:** Run mit Positionen 1, 10, 11. Issue für Position 1 darf NICHT Zeilen von Position 10/11 auflösen.
5. **IssueDialog:** Nach Expansion muss Tab "Uebersicht" betroffene Positionen anzeigen (nicht leer).
6. **Zeilen isolieren:** Nach Expansion muss "Zeilen isolieren" die expandierten IDs an ItemsTable übergeben.
7. **`npx tsc --noEmit`**: 0 Errors.

---

## Bekannte Limitierungen (Out of Scope — NICHT in PROJ-45 fixen)

1. **`buildIssueClipboardText` + `generateMailtoLink`** (issueLineFormatter.ts:52-55, 172-176) — machen direkte ID-Lookups (`lineMap.get(id)`). Nach Expansion leerer Zeilen-Abschnitt in Clipboard/E-Mail. Unkritisch, da `issue.details` weiterhin die Zusammenfassung enthält. **Potentieller ADDON:** `resolveIssueLines` auch dort einsetzen.

2. **`splitIssue` ID-Mismatch** (runStore.ts:2402) — "Loesung erzwingen" Tab 3 zeigt nach unserem Fix expandierte Zeilen, aber `splitIssue` vergleicht expandierte IDs mit alten `affectedLineIds` (Ergebnis: 0 Matches → Split funktioniert nicht korrekt). **War bereits vor PROJ-45 kaputt** — Tab war nach Expansion komplett leer. PriceCell-Workflow ist die bessere Lösung für price-mismatch und macht Split überflüssig. **Potentieller ADDON:** `splitIssue` mit Resolver erweitern.

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden

### Regex-Fallstricke
- **KRITISCH:** Die Regex `/^.+-line-(\d+)$/` ist bewusst so gewählt. Das `$` am Ende stellt sicher, dass NUR aggregierte IDs (`run-line-5`) matchen, NICHT expandierte (`run-line-5-0`). NIEMALS das `$` entfernen oder die Regex ändern.
- `.+` am Anfang ist greedy — das ist korrekt, weil runIds beliebige Zeichen enthalten können (z.B. `Fattura-2025123456-20260315-143022`).

### DRY: resolveIssueLines ist der EINZIGE Ort für ID-Auflösung
- Die Regex, die lineMap-Konstruktion und die Position-Fallback-Logik dürfen NUR in `resolveIssueLines` existieren.
- Alle Aufrufer (checkIssueStillActive, IssueCard, IssueDialog, handleIsolate) nutzen ausschließlich diesen Helper.
- Wenn Logik in einem Aufrufer dupliziert wird, ist das ein Bug.

### State-Update-Reihenfolge
- In `setManualPriceByPosition`: Erst `set()` für Lines, DANN Price-Stats berechnen (per `get()` nach dem set), DANN `refreshIssues()`. Die Reihenfolge ist identisch mit `setManualPrice` (Z.2642-2679) — dort nachschauen als Vorlage.
- `refreshIssues` ist synchron (Z.2386-2393) — kein async/await nötig.

### PriceCell Wiederverwendung
- PriceCell erwartet `onSetPrice: (lineId: string, price: number, source) => void`. Der `lineId` Parameter wird im Callback empfangen, aber wir brauchen den `positionIndex`. Lösung: `mismatchLine.positionIndex` aus dem Closure verwenden (`.find()` Ergebnis), NICHT versuchen den positionIndex aus dem lineId zu parsen.
- **NIEMALS `affectedLines[0]`** verwenden — bei Multi-Position-Issues zeigt das nach der ersten Korrektur die bereits fixierte Zeile statt der nächsten unfixierten. Immer `affectedLines.find(l => l.priceCheckStatus === 'mismatch')`.
- PriceCell hat `readOnly` Prop — NICHT setzen, sonst ist das Popup deaktiviert.
- PriceCell hat `onJumpToArticleList` Prop — NICHT setzen, sonst wird ein Jump statt Popup ausgelöst.

### affectedLines Deduplizierung
- Nach Expansion hat eine Position mit qty=10 genau 10 expandierte Zeilen. Im IssueCard/IssueDialog nur 1 Repräsentant pro Position zeigen (`deduplicate: true`), sonst entstehen 10 identische Einträge.
- Für `handleIsolate` dagegen ALLE expandierten IDs übergeben (`deduplicate: false`), damit ItemsTable alle Zeilen filtert.

### Bestehende Workflows nicht berühren
- `relatedLineIds` NIEMALS mutieren — nur die Auflösung ändern (Resolver).
- `setManualPrice` (einzelne Zeile) bleibt unverändert — wird weiterhin von ItemsTable/InvoicePreview genutzt.
- Export-Guards, Step-Logik, InvoicePreview, ItemsTable — keine Änderungen.

### TypeScript
- `setManualPriceByPosition` muss in die `RunStoreState`-Interface-Definition (~Z.487) UND in die `create()`-Implementation. Beide Stellen vergessen → tsc-Error.
- `IssueCardProps` ist lokal in IssuesCenter.tsx definiert (Z.124-130) — dort erweitern.
- `resolveIssueLines` wird als `export function` deklariert (nicht im Store-Objekt, sondern als freistehende Funktion im selben File).

---

## Sonnet-Regeln (ZWINGEND bei Ausführung)

1. **IMMER** vorher in den Plan-Modus (thinking) gehen.
2. **SKILLS VERWENDEN:** Zwingend die Skills `frontend`, `react-dev`, `qa` und `find-skills` laden.
3. **IMMER** Ergebnisse in die Projektdaten schreiben (`features/PROJ-45-Fehler-Center-Resolver.md`).
4. Am Ende selbstständig `npx tsc --noEmit` über das Bash-Terminal ausführen und **alle TypeScript-Fehler fixen**.
5. Die Datei `features/INDEX.md` aktualisieren (neue Zeile für PROJ-45).

---

## QA Test Results

**Getestet:** 2026-03-15
**QA Engineer:** Claude Sonnet 4.6
**Branch:** master (staged, nicht committed)
**TypeScript-Check:** `npx tsc --noEmit` — **0 Errors** ✓

---

### Acceptance Criteria — Ergebnis

| # | Kriterium | Status | Notiz |
|---|-----------|--------|-------|
| AC-1 | `resolveIssueLines()` als exportierte freistehende Funktion in `runStore.ts` | PASS | Korrekt als `export function` vor `checkIssueStillActive` platziert (Z.207) |
| AC-2 | Regex `/^.+-line-(\d+)$/` — `$` am Ende, kein false-positive matching | PASS | Regex 1:1 wie im Spec, `$` vorhanden, NICHT expandierte IDs (`-line-5-0`) werden nicht gematcht |
| AC-3 | Stufe 1: Direkte lineId-Matches vor Expansion | PASS | `lineMap.get(id)` filter korrekt implementiert |
| AC-4 | Stufe 2: Position-basierter Fallback nach Expansion | PASS | `positionSet` mit parseInt korrekt befüllt |
| AC-5 | `deduplicate: false` — alle expandierten Zeilen | PASS | Filter auf `positionSet.has(l.positionIndex)` ohne Dedup |
| AC-6 | `deduplicate: true` — 1 Repräsentant pro positionIndex | PASS | `seen`-Set verhindert Duplikate korrekt |
| AC-7 | `checkIssueStillActive()` nutzt `resolveIssueLines(…, false)` | PASS | 1-Zeilen-Fix korrekt (Z.251) |
| AC-8 | `setManualPriceByPosition` Interface in `RunStoreState` | PASS | Z.536 — korrekt typisiert |
| AC-9 | `setManualPriceByPosition` Implementation — alle expandierten Zeilen einer Position | PASS | Filter: `positionIndex === X && lineId.startsWith(runId + '-line-')` (Z.2734) |
| AC-10 | `setManualPriceByPosition` setzt `priceCheckStatus: 'custom'` | PASS | Korrekt mit `as const` |
| AC-11 | `setManualPriceByPosition` aktualisiert Price-Stats | PASS | Identisches Pattern wie `setManualPrice`, `get()` nach `set()` |
| AC-12 | `setManualPriceByPosition` ruft `refreshIssues()` auf → Auto-Resolve | PASS | Z.2776 — korrekt am Ende |
| AC-13 | IssueCard: `affectedLines`-Memo via `resolveIssueLines(…, true)` | PASS | Z.144-147 in IssuesCenter.tsx |
| AC-14 | IssueCard: PriceCell nur für `price-mismatch` + `isExpanded` | PASS | IIFE-Pattern korrekt (Z.204-215) |
| AC-15 | IssueCard: `affectedLines.find(l => l.priceCheckStatus === 'mismatch')` — nicht `[0]` | PASS | `.find()` korrekt verwendet, kein `affectedLines[0]` |
| AC-16 | IssueCard: PriceCell OHNE `readOnly` und OHNE `onJumpToArticleList` | PASS | Beide optionalen Props nicht gesetzt |
| AC-17 | IssueCard: `onBulkSetPrice` via `mismatchLine.positionIndex` — NICHT aus lineId geparst | PASS | Closure-Variable `mismatchLine.positionIndex` korrekt verwendet |
| AC-18 | `handleIsolate`: Resolver mit `deduplicate: false`, Fallback auf Original-IDs | PASS | Z.424-425 — `resolved.length > 0 ? resolved.map(l => l.lineId) : ids` |
| AC-19 | Beide aktive IssueCard-Renderstellen haben `isExpanded` + `onBulkSetPrice` Props | PASS | Z.590-601 (gruppierte Issues) + Z.617-628 (pending Issues) |
| AC-20 | IssueDialog: `affectedLines`-Memo via `resolveIssueLines(…, true)` | PASS | Z.152-155 in IssueDialog.tsx |
| AC-21 | DRY: Resolver-Logik nur 1x in `resolveIssueLines` | PASS | Grep bestätigt: 0 duplizierte Regex/lineMap-Logik in Aufrufer-Stellen |
| AC-22 | `setManualPrice` (Einzelzeile) unverändert | PASS | Keine Änderungen an `setManualPrice` |
| AC-23 | Export-Guards, Step-Logik, InvoicePreview, ItemsTable unverändert | PASS | Nur 3 Dateien geändert: runStore.ts, IssuesCenter.tsx, IssueDialog.tsx |

**Acceptance Criteria Gesamt: 23/23 PASS**

---

### Edge Cases — Ergebnis

| # | Edge Case | Status | Notiz |
|---|-----------|--------|-------|
| EC-1 | `resolveIssueLines` mit leeren `ids` → leeres Array | PASS | `if (!ids \|\| ids.length === 0) return []` |
| EC-2 | Kein false-positive: Position 1 matcht NICHT Position 10, 11 | PASS | Regex `^.+-line-(\d+)$` mit `$` verhindert Substring-Matches |
| EC-3 | `positionSet.size === 0` nach fehlgeschlagener Regex → leeres Array | PASS | Early return nach Regex-Phase korrekt |
| EC-4 | Multi-Position Issue: PriceCell rotiert zur nächsten unfixierten Position | PASS | `.find(l => l.priceCheckStatus === 'mismatch')` gibt null zurück wenn alle `'custom'` |
| EC-5 | Alle Positionen custom → kein PriceCell → Auto-Resolve feuert | PASS | `if (!mismatchLine) return null` + `refreshIssues()` in `setManualPriceByPosition` |
| EC-6 | `targetRun` nicht gefunden in `setManualPriceByPosition` → early return | PASS | Z.2758 — `if (!targetRun) return` |
| EC-7 | `resolveIssueLines` für Issues ohne `affectedLineIds` (null/undefined) | PASS | `issue.affectedLineIds ?? []` in allen Aufrufen |
| EC-8 | `invoiceLines` in IssuesCenter korrekt auf aktuellen Run gefiltert | PASS | Z.349-351 — `allInvoiceLines.filter(l => l.lineId.startsWith(runId + '-line-'))` |
| EC-9 | `handleIsolate` beim Aufruf mit bereits expandierten IDs (Stufe 1 greift) | PASS | Stufe 1 in `resolveIssueLines` liefert direkte Matches zurück |
| EC-10 | expandierte IDs in `ids`-Array (`-line-5-0`) gehen durch Regex-Phase ohne Match | PASS | Regex `^.+-line-(\d+)$` matcht NICHT auf `-line-5-0` wegen `$`-Anker |

**Edge Cases Gesamt: 10/10 PASS**

---

### Security Audit (Red-Team)

| Bereich | Befund | Bewertung |
|---------|--------|-----------|
| Injection via lineId | `ids`-Parameter wird nur für Map-Lookup und Regex-Matching verwendet — kein eval, kein DOM-Injection-Pfad | Keine Vulnerabilität |
| Price-Manipulation | `setManualPriceByPosition` setzt beliebigen Float — kein Limit, keine Validierung. Entspricht aber exakt dem Pattern von `setManualPrice`. Rein clientseitig, keine Backend-Persistenz im üblichen Sinn | Kein Sicherheitsproblem (App ist SPA ohne Backend-Auth) |
| `parseInt` Radix 10 | Korrekt angegeben: `parseInt(m[1], 10)` — kein Octal-Parsing-Bug | Keine Vulnerabilität |
| Exposed Store-Funktion | `resolveIssueLines` ist exportiert — könnte von Modulen außerhalb des Stores genutzt werden. Das ist bewusst by Design (SSOT) und verursacht kein Sicherheitsproblem | Akzeptiert by Design |

**Security: Keine Vulnerabilitäten gefunden**

---

### Bekannte Limitierungen (dokumentiert, Out of Scope)

1. **`buildIssueClipboardText` + `generateMailtoLink`** (`src/lib/issueLineFormatter.ts` Z.52-55, 172-176) — direkter `lineMap.get(id)` Lookup ohne Resolver. Nach Expansion ist der Zeilen-Abschnitt in Clipboard/E-Mail leer. `issue.details` enthält weiterhin die Zusammenfassung, daher unkritisch.
   - **Severity: Low** (nur Darstellungsproblem, kein Datenverlust)
   - **Empfehlung:** Als ADDON `resolveIssueLines` dort einsetzen

2. **`splitIssue` ID-Mismatch** (`runStore.ts` Z.2450-2451) — vergleicht übergebene `resolvedLineIds` (expandierte IDs nach PROJ-45-Fix) mit `original.affectedLineIds` (alte aggregierte IDs). `remainingLineIds` ist nach Expansion immer leer oder falsch. War vor PROJ-45 durch leere affectedLines komplett broken — nach Fix ist es partial broken (Zeilen werden angezeigt, Split-Logik stimmt nicht).
   - **Severity: Low** (Tab "Loesung erzwingen" / Split war bereits vorher nach Expansion dysfunktional; PriceCell-Workflow ist für price-mismatch der korrekte Pfad)
   - **Empfehlung:** Als ADDON `splitIssue` mit Resolver erweitern

---

### Regression Testing

| Bereich | Ergebnis |
|---------|----------|
| `setManualPrice` (Einzelzeile, ItemsTable/InvoicePreview) | Unverändert — kein Regressions-Risiko |
| `checkIssueStillActive` Pre-Expansion (direkte ID-Matches) | Stufe 1 des Resolvers greift identisch zu vorherigem Code — kein Regression |
| `autoResolveIssues` allgemein | Einzige Änderung ist die Resolver-Nutzung in `checkIssueStillActive` — alle Switch-Cases unverändert |
| IssueCard (nicht price-mismatch Issues) | `isExpanded` + `onBulkSetPrice` sind optional-Props mit `?.` guard — kein Effekt bei anderen Issue-Typen |
| IssueDialog Tab 1 (Uebersicht) | `affectedLines` Memo nun via Resolver — Pre-Expansion: Stufe 1 greift, identisches Ergebnis |
| SettingsPopup (PROJ-27-ADDON-3) | Keine Überschneidung, unberührt |

---

### Bugs gefunden

**Keine kritischen oder hohen Bugs.**

**Low (dokumentierte Limitierungen, Out of Scope):**
- **BUG-L1:** `buildIssueClipboardText` / `generateMailtoLink` nutzen direkten ID-Lookup ohne Resolver → leerer Zeilen-Abschnitt in Clipboard/E-Mail nach Expansion. Betrifft `src/lib/issueLineFormatter.ts` Z.52-55 und Z.172-176.
- **BUG-L2:** `splitIssue` ID-Mismatch — `remainingLineIds` nach Expansion falsch berechnet. Betrifft `src/store/runStore.ts` Z.2451. Bereits vor PROJ-45 broken.

---

### Production-Ready Entscheidung

**READY ✓**

- 23/23 Acceptance Criteria: PASS
- 10/10 Edge Cases: PASS
- 0 Critical / 0 High / 2 Low Bugs (beide dokumentierte Out-of-Scope Limitierungen)
- `npx tsc --noEmit`: 0 Errors
- Security: Keine Vulnerabilitäten
- DRY-Prinzip eingehalten: `resolveIssueLines` existiert exakt 1x im Projekt

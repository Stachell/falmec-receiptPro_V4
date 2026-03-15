# PROJ-45-ADD-ON-round1: Fehler-Center Verfeinerung — Implementierungsplan
## Status: Open — Geplant 2026-03-15

## Big Picture (Kontext & Vision)

**Vision:** Die Fehlerbehebung muss nahtlos, intuitiv und an einem zentralen Ort (im IssueDialog) stattfinden, waehrend Exporte (E-Mail, Clipboard) und Statusanzeigen (Startseite) 100% konsistente Daten liefern.

**Endziel:** Wir verfeinern das Fehlerhandling aus PROJ-45. Die Loesungs-Buttons (PriceCell) ziehen in den `IssueDialog` um. Der E-Mail-Text wird editierbar. Der neue `resolveIssueLines` Helper wird an die Export-Funktionen (Clipboard/Mail) angebunden. Auf der Startseite wird visuell klar unterschieden, ob ein Fehler noch offen ist oder "erzwungen" (resolved) wurde.

**Warum (KISS & Revisionssicherheit):** Ein zersplittertes UI verwirrt den User. Wenn der Dialog geoeffnet wird, muss die Loesung dort direkt griffbereit sein. Gleichzeitig muessen wir sicherstellen, dass E-Mails vor dem Versand bearbeitet werden koennen und unsere Export-Texte dank des Resolvers nicht mehr leer bleiben.

---

## Handschellen (Strikte Regeln)

1. **Kein Over-Engineering:** Erfinde keine neuen Loesungs-Buttons. Nutze die bestehende `PriceCell`-Logik (Popover mit Rechnungspreis / Sage-Preis / Manuelle Eingabe).
2. **KISS bei der E-Mail (Punkt 3):** Editierbarkeit erfordert nur lokalen State im Dialog. Kein Store, kein Persistieren. Beim Klick auf "E-Mail erzeugen" wird der editierte Text in den `mailto:`-Body gepackt.
3. **DRY bei Punkt 4 & 5:** ZWINGEND den `resolveIssueLines`-Helper aus `runStore.ts` nutzen, um die E-Mail- und Clipboard-Texte in `issueLineFormatter.ts` zu reparieren.
4. **Keine neuen Dateien:** Alle Aenderungen in bestehenden Dateien.

---

## Punkt 1: Startseite — Fehler-Spalte mit Resolved-Status

### Ist-Zustand
- **Datei:** `src/pages/Index.tsx`, Zeile 347-357
- **FEHLER-Spalte:** Zeigt `row.totalIssues` als Zahl mit gelbem `AlertTriangle`-Icon (`text-status-soft-fail`)
- `totalIssues` wird in `toTableRow()` (Z.71) berechnet: `run.steps.reduce((acc, step) => acc + step.issuesCount, 0)` — kennt keinen Status (open/resolved/pending)
- Die `issues`-Liste im Store hat pro Issue ein `status`-Feld (`'open' | 'pending' | 'resolved'`)

### Soll-Zustand
- Wenn ALLE Issues eines Runs `status === 'resolved'` haben UND `totalIssues > 0`: **Gruenes CheckCircle2-Icon** + Anzahl in `text-status-ok`
- Wenn mindestens 1 Issue `status === 'open' || status === 'pending'` hat: **Gelbes AlertTriangle-Icon** wie bisher
- Wenn `totalIssues === 0`: Dash wie bisher

### Implementierung

#### 1a. `TableRow_`-Interface erweitern (Z.49-68)
```typescript
interface TableRow_ {
  // ... bestehende Felder ...
  totalIssues: number;
  /** PROJ-45-ADD-ON: true wenn alle Issues resolved sind */
  allIssuesResolved: boolean;
}
```

#### 1b. `toTableRow()` erweitern (Z.70-89)
Braucht Zugriff auf die `issues`-Liste aus dem Store. Da `toTableRow` eine reine Funktion ist, muss `issues` als Parameter uebergeben werden:

```typescript
function toTableRow(run: Run, issues: Issue[]): TableRow_ {
  const totalIssues = run.steps.reduce((acc, step) => acc + step.issuesCount, 0);
  const runIssues = issues.filter(i => i.runId === run.id);
  const allIssuesResolved = totalIssues > 0 && runIssues.length > 0
    && runIssues.every(i => i.status === 'resolved');
  return {
    // ... bestehende Felder ...
    allIssuesResolved,
  };
}
```

#### 1c. `persistedToTableRow()` erweitern (Z.91+)
Persisted-only Runs haben keine Issues im Store. Default: `allIssuesResolved: false`.

#### 1d. Aufrufstellen von `toTableRow` aktualisieren
`issues` aus `useRunStore()` destructuren und durchreichen. Aktuell wird `toTableRow(run)` aufgerufen — aendern zu `toTableRow(run, issues)`.

#### 1e. FEHLER-Spalte rendern (Z.347-357)
```tsx
{/* FEHLER */}
<TableCell>
  {row.totalIssues > 0 ? (
    row.allIssuesResolved ? (
      <span className="flex items-center gap-1.5 text-status-ok">
        <CheckCircle2 className="w-4 h-4" />
        {row.totalIssues}
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-status-soft-fail">
        <AlertTriangle className="w-4 h-4" />
        {row.totalIssues}
      </span>
    )
  ) : (
    <span className="text-muted-foreground">-</span>
  )}
</TableCell>
```

#### 1f. Import `CheckCircle2` ergaenzen
`CheckCircle2` aus `lucide-react` importieren (falls nicht bereits importiert).

**Dateien:** 1 (`src/pages/Index.tsx`)
**Geschaetzt:** ~15 Zeilen geaendert/hinzugefuegt

---

## Punkt 2: Dialog-Umbau 'Uebersicht' — PriceCell-Integration

### Ist-Zustand
- **Datei:** `src/components/run-detail/IssueDialog.tsx`, Tab 1 "Uebersicht" (Z.240-304)
- Zeigt: Context-Box (expectedValue/actualValue), `issue.details` als Text, "Betroffene Positionen (max. 5)", Action-Buttons (E-Mail/Loesung erzwingen)
- **Kein PriceCell** im Dialog — Preiskorrektur nur in IssueCard (IssuesCenter.tsx) moeglich

### Soll-Zustand
- **Beibehalten:** Context-Box (Feld/Erwartet/Aktuell) + "Betroffene Positionen (max. 5)"
- **Entfernen:** Die redundante `issue.details`-Zeile (Z.256) — der Fehlerbericht-Text ist identisch und lebt in Tab 2
- **Neu einfuegen (nach "Betroffene Positionen"):**
  1. Warntext: *"ACHTUNG: Um Uploadfehler zu vermeiden, muss bei Auswahl des Rechnungspreises dieser bereits in Sage ERP hinterlegt sein."* — nur bei `issue.type === 'price-mismatch'`
  2. PriceCell-Popup fuer die naechste unfixierte Mismatch-Position — identische Logik wie in IssueCard (PROJ-45 D3)
- **Beibehalten:** Action-Buttons (E-Mail / Loesung erzwingen) am Ende

### Implementierung

#### 2a. Store-Zugriff erweitern
`setManualPriceByPosition` und `currentRun` sind bereits im Store-Destructure (Z.113-121). `currentRun` ist vorhanden. `setManualPriceByPosition` muss hinzugefuegt werden:
```typescript
const {
  // ... bestehend ...
  setManualPriceByPosition,
} = useRunStore();
```

#### 2b. `issue.details`-Zeile entfernen
Zeile 256 entfernen:
```tsx
// ENTFERNEN:
<p className="text-sm text-foreground/80">{issue.details}</p>
```

#### 2c. Warntext + PriceCell einfuegen (nach "Betroffene Positionen"-Block, vor Action-Buttons)
```tsx
{/* PROJ-45-ADD-ON: Warntext + PriceCell fuer price-mismatch */}
{issue.type === 'price-mismatch' && (
  <div className="rounded border border-orange-300/60 bg-orange-50/10 p-2 text-xs text-orange-700">
    <span className="font-semibold">ACHTUNG:</span> Um Uploadfehler zu vermeiden, muss bei Auswahl
    des Rechnungspreises dieser bereits in Sage ERP hinterlegt sein.
  </div>
)}

{issue.type === 'price-mismatch' && (currentRun?.isExpanded ?? false) && (() => {
  const mismatchLine = affectedLines.find(l => l.priceCheckStatus === 'mismatch');
  if (!mismatchLine) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Preis anpassen:</span>
      <PriceCell
        line={mismatchLine}
        onSetPrice={(_lineId, price) => {
          if (currentRun) {
            setManualPriceByPosition(mismatchLine.positionIndex, price, currentRun.id);
          }
        }}
      />
    </div>
  );
})()}
```

#### 2d. PriceCell importieren
```typescript
import { PriceCell } from './PriceCell';
```

**Dateien:** 1 (`src/components/run-detail/IssueDialog.tsx`)
**Geschaetzt:** ~25 Zeilen geaendert/hinzugefuegt

---

## Punkt 3: Editierbare E-Mail — Tab 4

### Ist-Zustand
- **Datei:** `src/components/run-detail/IssueDialog.tsx`, Tab 4 "E-Mail erzeugen" (Z.407-476)
- Die Vorschau ist ein **read-only `<pre>`-Tag** (Z.450-452) das `buildIssueClipboardText()` direkt rendert
- `handleSendMail` (Z.173-181) ruft `generateMailtoLink()` und `copy(buildIssueClipboardText())` auf — verwendet immer den generierten Text, nicht den angezeigten

### Soll-Zustand
- Die Vorschau wird ein **editierbares `<Textarea>`**
- Initialer Inhalt: `buildIssueClipboardText(issue, invoiceLines)` (via Resolver, nach Punkt 4/5)
- Wenn der User den Text aendert, wird der editierte Text beim Klick auf "E-Mail erzeugen" verwendet
- `handleSendMail` nutzt den editierten Body fuer `mailto:` UND Clipboard

### Implementierung

#### 3a. Neuer State fuer editierbaren E-Mail-Body
```typescript
const [emailBody, setEmailBody] = useState('');
```

#### 3b. E-Mail-Body initialisieren wenn Dialog oeffnet / Issue wechselt
Im bestehenden `useEffect([issue])` (Z.137-141) oder als separater Effekt:
```typescript
useEffect(() => {
  if (issue) {
    setEmailBody(buildIssueClipboardText(issue, invoiceLines));
  }
}, [issue, invoiceLines]);
```
**Achtung:** `invoiceLines` als Dependency — wenn sich Lines aendern (z.B. nach Preiskorrektur), aktualisiert sich der initiale Text. Der User kann trotzdem manuell editieren — der Reset passiert nur bei Issue-Wechsel/Dialog-Oeffnung.

**Problem:** Wenn der User den Text editiert hat und dann eine Preiskorrektur macht (ohne Dialog zu schliessen), wuerde der editierte Text ueberschrieben. Loesung: Nur bei `issue`-Wechsel resetten, NICHT bei `invoiceLines`-Aenderung. So bleibt der editierte Text stabil:
```typescript
useEffect(() => {
  if (issue) {
    setEmailBody(buildIssueClipboardText(issue, invoiceLines));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps — bewusst nur auf issue reagieren
}, [issue]);
```

**Aber:** Der initiale Text soll den Resolver nutzen (Punkt 4/5), also `invoiceLines` braucht er. Da `invoiceLines` sich bei Dialog-Oeffnung nicht aendert (nur bei Store-Mutation), ist `[issue]` als Dependency korrekt — beim Dialog-Oeffnen hat `invoiceLines` bereits den aktuellen Stand.

#### 3c. `<pre>` durch `<Textarea>` ersetzen in Tab 4 Vorschau (Z.450-452)
```tsx
{/* Vorher: read-only pre */}
{/* <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed mt-1">
  {buildIssueClipboardText(issue, invoiceLines)}
</pre> */}

{/* Nachher: editierbare Textarea */}
<Textarea
  value={emailBody}
  onChange={(e) => setEmailBody(e.target.value)}
  className="text-xs font-mono bg-white/40 whitespace-pre-wrap leading-relaxed mt-1 min-h-[120px]"
  rows={8}
/>
```

#### 3d. `handleSendMail` anpassen (Z.173-181)
Statt `generateMailtoLink(issue, ...)` den `emailBody` direkt in den mailto-Link einbauen:
```typescript
const handleSendMail = () => {
  if (!effectiveRecipient.trim()) return;
  const severityLabel = issue.severity === 'error' ? 'Fehler' : issue.severity === 'warning' ? 'Warnung' : 'Info';
  const subject = encodeURIComponent(`[FALMEC-ReceiptPro] ${severityLabel}: ${issue.message}`);
  const body = encodeURIComponent(emailBody);
  const link = `mailto:${encodeURIComponent(effectiveRecipient)}?subject=${subject}&body=${body}`;
  window.location.href = link;
  copy(emailBody);
  escalateIssue(issue.id, effectiveRecipient);
  onClose();
};
```

#### 3e. `handleCopyReport` anpassen (Z.183-186)
Tab 2 "Fehlerbericht" nutzt ebenfalls `buildIssueClipboardText` — dieser bleibt unveraendert (immer den generierten Text kopieren, NICHT den editierten E-Mail-Body). Kein Change noetig.

**Dateien:** 1 (`src/components/run-detail/IssueDialog.tsx`)
**Geschaetzt:** ~20 Zeilen geaendert/hinzugefuegt

---

## Punkt 4 & 5: Export reparieren — resolveIssueLines in issueLineFormatter.ts

### Ist-Zustand
- **Datei:** `src/lib/issueLineFormatter.ts`
- `generateMailtoLink` (Z.52-55): Direkter `lineMap.get(id)` Lookup — nach Expansion leere `affectedLines`
- `buildIssueClipboardText` (Z.172-176): Identischer direkter Lookup — nach Expansion leerer Zeilen-Abschnitt

### Soll-Zustand
- Beide Funktionen nutzen `resolveIssueLines` aus `runStore.ts` statt direktem `lineMap.get(id)`
- Nach Expansion werden die expandierten Zeilen korrekt aufgeloest (dedupliziert fuer Anzeige)

### Implementierung

#### 4a. Import `resolveIssueLines` in `issueLineFormatter.ts`
```typescript
import { resolveIssueLines } from '@/store/runStore';
```

**Zirkulaere-Import-Check:** `issueLineFormatter.ts` importiert nur `@/types`. `runStore.ts` importiert nichts aus `issueLineFormatter.ts` (wird nur in UI-Komponenten genutzt). Kein zirkulaerer Import.

#### 4b. `generateMailtoLink` — Resolver statt lineMap (Z.52-55)
```typescript
// Vorher:
const lineMap = new Map(allLines.map(l => [l.lineId, l]));
const affectedLines = (issue.affectedLineIds ?? [])
  .map(id => lineMap.get(id))
  .filter((l): l is InvoiceLine => l != null);

// Nachher:
const affectedLines = resolveIssueLines(issue.affectedLineIds ?? [], allLines, true);
```

#### 4c. `buildIssueClipboardText` — Resolver statt lineMap (Z.172-176)
```typescript
// Vorher:
if (issue.affectedLineIds.length > 0) {
  const lineMap = new Map(allLines.map(l => [l.lineId, l]));
  const affectedLines = issue.affectedLineIds
    .map(id => lineMap.get(id))
    .filter((l): l is InvoiceLine => l != null);

// Nachher:
if (issue.affectedLineIds.length > 0) {
  const affectedLines = resolveIssueLines(issue.affectedLineIds, allLines, true);
```

**Warum `deduplicate: true`:** Im Clipboard/E-Mail-Text wollen wir 1 Zeile pro Position, nicht 10 expandierte Zeilen mit identischem Inhalt.

**Dateien:** 1 (`src/lib/issueLineFormatter.ts`)
**Geschaetzt:** ~5 Zeilen geaendert

---

## Implementierungsreihenfolge

| # | Datei | Was | ~Zeilen |
|---|-------|-----|---------|
| 1 | `src/lib/issueLineFormatter.ts` | Import `resolveIssueLines`, Resolver in `generateMailtoLink` + `buildIssueClipboardText` | ~5 |
| 2 | `src/components/run-detail/IssueDialog.tsx` | Punkt 2: `issue.details` entfernen, Warntext + PriceCell einfuegen, Import PriceCell + setManualPriceByPosition | ~25 |
| 3 | `src/components/run-detail/IssueDialog.tsx` | Punkt 3: `emailBody` State, Textarea statt pre, handleSendMail anpassen | ~20 |
| 4 | `src/pages/Index.tsx` | Punkt 1: `allIssuesResolved` in TableRow_, toTableRow + persistedToTableRow, FEHLER-Spalte conditional render, CheckCircle2 Import | ~15 |

**Gesamt:** ~65 Zeilen in 3 Dateien. Keine neuen Dateien.

---

## Kritische Dateien (Referenz, keine Aenderung)

- `src/store/runStore.ts` — `resolveIssueLines` (exportiert, freistehend), `setManualPriceByPosition` (Store-Action) — beide aus PROJ-45, 1:1 wiederverwendet
- `src/components/run-detail/PriceCell.tsx` — wird 1:1 wiederverwendet, Props: `line`, `onSetPrice(lineId, price, source)`. NICHT `readOnly` oder `onJumpToArticleList` setzen
- `src/components/run-detail/IssuesCenter.tsx` — IssueCard hat bereits PriceCell-Integration (PROJ-45). Keine Aenderung noetig
- `src/components/StatusChip.tsx` — definiert `status-chip-ok` (gruen) und `status-chip-soft-fail` (gelb)

---

## Verifikation

1. **Punkt 1 (Startseite):** Run mit price-mismatch Issues starten. Issues via PriceCell resolvieren. Startseite oeffnen — FEHLER-Spalte muss gruen (CheckCircle2 + Anzahl) statt gelb (AlertTriangle) zeigen.
2. **Punkt 1 (Startseite, Teilresolved):** Run mit 2 Issues, nur 1 resolven — FEHLER-Spalte muss weiterhin gelb bleiben (nicht alle resolved).
3. **Punkt 2 (Dialog Uebersicht):** IssueDialog oeffnen fuer price-mismatch Issue. Tab "Uebersicht" zeigt: Context-Box, Betroffene Positionen, Warntext, PriceCell-Popup. Kein `issue.details`-Text mehr.
4. **Punkt 2 (PriceCell im Dialog):** Preis via PriceCell im Dialog setzen → alle expandierten Zeilen der Position erhalten neuen Preis → Auto-Resolve feuert.
5. **Punkt 2 (Nicht-Preis-Issue):** IssueDialog fuer `no-article-match` oeffnen — kein Warntext, kein PriceCell.
6. **Punkt 3 (Editierbare E-Mail):** Tab 4 oeffnen — Textarea mit generiertem Text. Text editieren. "E-Mail erzeugen" klicken — mailto-Link enthaelt editierten Text.
7. **Punkt 3 (E-Mail ohne Edit):** Tab 4 oeffnen, nichts editieren, "E-Mail erzeugen" klicken — mailto-Link enthaelt generierten Text (identisch zu vorher).
8. **Punkt 4/5 (Clipboard nach Expansion):** Run bis Step 4 durchfuehren. Issue im IssueCard — "kopieren" klicken. Clipboard-Text muss betroffene Positionen enthalten (nicht leer).
9. **Punkt 4/5 (E-Mail nach Expansion):** Issue-Dialog Tab 4, "E-Mail erzeugen" — mailto-Body muss betroffene Positionen enthalten.
10. **Punkt 4/5 (Fehlerbericht nach Expansion):** Issue-Dialog Tab 2 — `<pre>` muss betroffene Positionen enthalten.
11. **`npx tsc --noEmit`:** 0 Errors.

---

## Nützliche Hinweise fuer Sonnet bei der Durchfuehrung des Plans um Fehler zu vermeiden

### Punkt 1 — Startseite

- **Issues-Store-Zugriff:** `useRunStore()` in `Index.tsx` muss `issues` destructuren. Die existierende Destructure-Stelle suchen und dort `issues` hinzufuegen.
- **`toTableRow` Signatur-Aenderung:** ALLE Aufrufstellen von `toTableRow(run)` muessen auf `toTableRow(run, issues)` geaendert werden. Es gibt vermutlich eine `useMemo`-Stelle wo `runs.map(toTableRow)` aufgerufen wird — dort `issues` als Dependency in den useMemo aufnehmen.
- **`persistedToTableRow`:** Persisted-only Runs haben KEINE Issues im Store. `allIssuesResolved: false` hart kodieren — sicherster Default.
- **`CheckCircle2` Import:** Pruefen ob `CheckCircle2` bereits aus `lucide-react` importiert wird. Falls nicht, hinzufuegen.
- **Tailwind-Klassen:** `text-status-ok` fuer Gruen (wie in IssuesCenter.tsx Z.538-539), `text-status-soft-fail` fuer Gelb (Z.528).

### Punkt 2 — IssueDialog Uebersicht

- **PriceCell Import-Pfad:** `import { PriceCell } from './PriceCell';` — relativer Import, da IssueDialog und PriceCell im selben Verzeichnis (`src/components/run-detail/`) liegen.
- **`setManualPriceByPosition` im Destructure:** Muss aus `useRunStore()` gezogen werden. Aktueller Destructure (Z.113-121) enthaelt es NICHT — hinzufuegen.
- **NIEMALS `affectedLines[0]`:** Immer `affectedLines.find(l => l.priceCheckStatus === 'mismatch')` verwenden (Multi-Position-Issues).
- **IIFE-Pattern:** Das `(() => { ... })()` Pattern ist bewusst — JSX erlaubt keine Statements in geschweiften Klammern. Alternativ ein eigenes Memo verwenden.
- **`currentRun?.isExpanded`:** Pruefen ob `currentRun` im Destructure vorhanden ist — ja, Z.116.
- **Warntext nur bei `price-mismatch`:** Die Bedingung `issue.type === 'price-mismatch'` ist ZWINGEND. Nicht bei anderen Issue-Typen anzeigen.
- **PriceCell OHNE `readOnly` und OHNE `onJumpToArticleList`:** Beide Props NICHT setzen, sonst wird das Popover deaktiviert oder ein Jump ausgeloest.

### Punkt 3 — Editierbare E-Mail

- **`emailBody` State vs. initiale Berechnung:** Der State wird per `useEffect([issue])` initialisiert. NICHT `[issue, invoiceLines]` als Dependencies — sonst wird der editierte Text bei jeder Store-Mutation ueberschrieben.
- **`Textarea` aus shadcn:** Bereits importiert in IssueDialog.tsx (Z.47: `import { Textarea } from '@/components/ui/textarea'`). Kein neuer Import noetig.
- **`handleSendMail`-Umbau:** `generateMailtoLink` wird NICHT MEHR aufgerufen. Stattdessen wird der mailto-Link direkt aus `emailBody` + `effectiveRecipient` gebaut. Der Subject bleibt wie bisher.
- **Tab 2 "Fehlerbericht":** `handleCopyReport` (Z.183-186) und die `<pre>` in Tab 2 (Z.309-311) bleiben UNVERAENDERT — sie nutzen immer den generierten (nicht editierten) Text. Das ist korrekt so.
- **URI-Laenge:** `mailto:` hat Browser-Limits (~2000 Zeichen in URL). `buildIssueClipboardText` hat `LINE_LIMIT = 30` und `MAILTO_LINE_LIMIT = 10`. Da wir jetzt den vollen `emailBody` im mailto verwenden (nicht `generateMailtoLink`), MUSS der User selbst darauf achten, den Text nicht zu lang zu machen. Das ist akzeptabel, weil der Clipboard-Fallback (`copy(emailBody)`) immer funktioniert.

### Punkt 4/5 — issueLineFormatter.ts Resolver

- **Kein zirkulaerer Import:** `issueLineFormatter.ts` → `runStore.ts` ist sicher (runStore importiert nichts aus issueLineFormatter).
- **`deduplicate: true`:** Im Clipboard/E-Mail-Text 1 Zeile pro Position (nicht 10 expandierte Zeilen). IMMER `true` verwenden.
- **`lineMap`-Variablen komplett entfernen:** Die lokalen `lineMap = new Map(...)` Variablen werden durch den Resolver ersetzt. Keine toten Variablen hinterlassen.
- **`buildIssueClipboardText` Null-Check:** `issue.affectedLineIds` kann theoretisch `undefined` sein. Der bestehende Code prueft `issue.affectedLineIds.length > 0` direkt — das ist sicher, weil das Interface `string[]` (nicht optional) definiert. Aber sicherheitshalber `(issue.affectedLineIds ?? [])` verwenden wie im Resolver-Aufruf in IssueDialog.

### Allgemeine Fallstricke

- **Props-Weitergabe:** Wenn neue Props an Subkomponenten weitergegeben werden muessen, IMMER das Interface erweitern UND die Destructure-Stelle aktualisieren.
- **useMemo Dependencies:** Wenn ein neues Feld zum `TableRow_`-Mapping hinzukommt und das Mapping in einem `useMemo` sitzt, muss die neue Dependency (z.B. `issues`) dort aufgenommen werden.
- **Tailwind-Merge:** shadcn nutzt `cn()` (clsx + tailwind-merge). Inline-Styles ueberschreiben immer — bevorzuge Tailwind-Klassen, aber bei Konflikten ist Inline-Style die Nuklear-Option.
- **React Keys:** PriceCell braucht KEINEN Key wenn es als einzelnes Element gerendert wird (IIFE-Pattern).

---

## Sonnet-Regeln (ZWINGEND bei Ausfuehrung)

1. **IMMER** vorher in den Plan-Modus (thinking) gehen.
2. **SKILLS VERWENDEN:** Zwingend die Skills `frontend`, `react-dev`, `qa` und `find-skills` laden.
3. **IMMER** Ergebnisse in die Projektdaten schreiben (`features/PROJ-45-ADD-ON-round1.md`).
4. Am Ende selbststaendig `npx tsc --noEmit` ueber das Bash-Terminal ausfuehren und **alle TypeScript-Fehler fixen**.
5. Die Datei `features/INDEX.md` aktualisieren (neue Zeile fuer PROJ-45-ADD-ON-round1).

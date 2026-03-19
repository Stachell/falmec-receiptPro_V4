# PROJ-45-ADD-ON-Serial-Artikel-Fehlerhandling — Round 5

> **Ziel:** Manuelle Formulardaten (S/N-Pflicht, Preis, Menge, Seriennummern) sind heilig — weder leere Stammdaten noch Step 3 dürfen sie überschreiben. Neue UX-Felder (Sage-Preis, Mengen-Stepper, S/N-Dialog) machen die Eingabe DAU-sicher.
>
> **Erstellt:** 2026-03-19 | **Status:** Done

---

## Betroffene Dateien (Übersicht)

| Datei | Änderungstyp | Phase |
|---|---|---|
| `src/store/runStore.ts` (Z.411-421, Z.2802-2866, Z.3615-3636) | Interface + Store-Action + Guard | 1 + 3 |
| `src/services/matchers/modules/FalmecMatcher_Master.ts` (Z.546-561) | Guard (Legacy-Pfad) | 3 |
| `src/components/run-detail/IssueDialog.tsx` (Z.108-249) | UI-Erweiterung | 2 |

---

## Phase 1: Store & Model Upgrade

### 1A — ManualArticleData erweitern

**Datei:** `src/store/runStore.ts` Zeilen 411-421

**Aktuell:**
```typescript
interface ManualArticleData {
  falmecArticleNo: string;
  manufacturerArticleNo?: string;
  ean?: string;
  serialRequired?: boolean;
  storageLocation?: string;
  descriptionDE?: string;
  supplierId?: string;
  orderNumberAssigned?: string;
}
```

**Neu (3 Felder hinzufügen):**
```typescript
interface ManualArticleData {
  falmecArticleNo: string;
  manufacturerArticleNo?: string;
  ean?: string;
  serialRequired?: boolean;
  storageLocation?: string;
  descriptionDE?: string;
  supplierId?: string;
  orderNumberAssigned?: string;
  unitPriceSage?: number;       // NEU: Manueller Sage ERP Netto-Preis
  quantity?: number;            // NEU: Manuelle Rechnungsmenge
  serialNumbers?: string[];     // NEU: Manuell eingegebene Seriennummern
}
```

### 1B — serialRequired-Bug fixen (matched-Pfad)

**Datei:** `src/store/runStore.ts` Zeile 2839

**Aktuell (BUG — Formular wird ignoriert wenn Stammdaten-Treffer):**
```typescript
serialRequired: matched.serialRequirement,  // serialRequirement → serialRequired!
```

**Neu (Formular gewinnt!):**
```typescript
serialRequired: data.serialRequired ?? matched.serialRequirement,
```

**Begründung:** Wenn der User im Formular explizit `serialRequired: true` setzt, muss das die leere/falsche Stammdaten-Info übersteuern. `??` (Nullish Coalescing) sorgt dafür, dass nur bei `undefined` (= User hat nichts geändert) der Stammdaten-Wert greift.

### 1C — Neue Felder in setManualArticleByPosition durchreichen

**Datei:** `src/store/runStore.ts` Zeilen 2830-2865

**matched-Pfad (Z.2830-2847) — folgende Felder hinzufügen:**
```typescript
if (matched) {
  return {
    ...line,
    // ... bestehende Felder ...
    serialRequired: data.serialRequired ?? matched.serialRequirement,  // 1B Fix
    unitPriceSage: data.unitPriceSage ?? matched.unitPriceNet,         // NEU
    qty: data.quantity ?? line.qty,                                     // NEU: Menge überschreiben
    serialNumbers: data.serialNumbers?.length ? data.serialNumbers : line.serialNumbers,  // NEU
    serialNumber: data.serialNumbers?.length ? data.serialNumbers[0] : line.serialNumber, // NEU
    serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,     // NEU
    // ... rest ...
  };
}
```

**!matched-Pfad (Z.2848-2865) — identische Erweiterung:**
```typescript
else {
  return {
    ...line,
    // ... bestehende Felder ...
    unitPriceSage: data.unitPriceSage ?? null,                          // NEU
    qty: data.quantity ?? line.qty,                                     // NEU
    serialNumbers: data.serialNumbers?.length ? data.serialNumbers : line.serialNumbers,  // NEU
    serialNumber: data.serialNumbers?.length ? data.serialNumbers[0] : line.serialNumber, // NEU
    serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,     // NEU
    // ... rest ...
  };
}
```

### 1D — PriceCheck-Logik anpassen (unitPriceSage-Override)

**Datei:** `src/store/runStore.ts` Zeilen 2822-2828

**Aktuell:**
```typescript
const finalPrice = matched?.unitPriceNet ?? null;
```

**Neu (manueller Sage-Preis hat Vorrang):**
```typescript
const finalPrice = data.unitPriceSage ?? matched?.unitPriceNet ?? null;
```

So wird der manuelle Preis sowohl für den PriceCheck als auch für `unitPriceFinal` verwendet, wenn der User einen Wert eingibt.

---

## Phase 2: ArticleMatchCard UI-Erweiterung

**Datei:** `src/components/run-detail/IssueDialog.tsx` Zeilen 108-249

### 2A — ArticleFormData Interface erweitern

**Aktuell (Z.111-120):**
```typescript
interface ArticleFormData {
  falmecArticleNo: string;
  manufacturerArticleNo: string;
  ean: string;
  serialRequired: boolean;
  storageLocation: string;
  descriptionDE: string;
  supplierId: string;
  orderNumberAssigned: string;
}
```

**Neu (3 Felder — kein Switch!):**
```typescript
interface ArticleFormData {
  falmecArticleNo: string;
  manufacturerArticleNo: string;
  ean: string;
  serialRequired: boolean;
  storageLocation: string;
  descriptionDE: string;
  supplierId: string;
  orderNumberAssigned: string;
  unitPriceSage: string;         // NEU: String wegen Input (parseFloat bei Submit)
  quantity: number;              // NEU: Zahl, min=1
  serialNumbers: string[];       // NEU: Array für S/N-Pop-up
}
```

### 2B — State-Initialisierung

**In `useState<ArticleFormData>(() => ({` (Z.124-133) ergänzen:**
```typescript
unitPriceSage: line.unitPriceSage != null ? String(line.unitPriceSage) : '',
quantity: line.qty ?? 1,
serialNumbers: line.serialNumbers?.length ? [...line.serialNumbers] : [],
```

### 2C — Neues Input: Sage ERP Preis

**Position:** Im `grid grid-cols-2`-Block (Z.167-232), als 9. Feld nach "Bestellnummer"

```tsx
<div>
  <Label className="text-xs mb-0.5 block">Sage ERP Preis (Netto)</Label>
  <Input
    type="number"
    step="0.01"
    min="0"
    value={formData.unitPriceSage}
    onChange={(e) => {
      setSaved(false);
      setFormData(prev => ({ ...prev, unitPriceSage: e.target.value }));
    }}
    placeholder="0.00"
    className="h-7 text-xs text-white"
  />
</div>
```

### 2D — Neues Input: Menge (Stepper)

**Position:** Im Grid, als 10. Feld neben Sage-Preis

**Optik:** Exakt wie Toleranz-Input in SettingsPopup (h-8 w-28, type="number", native Pfeile)

```tsx
<div>
  <Label className="text-xs mb-0.5 block">Menge</Label>
  <Input
    type="number"
    min={1}
    step={1}
    value={formData.quantity}
    onChange={(e) => {
      setSaved(false);
      const val = Math.max(1, parseInt(e.target.value, 10) || 1);
      setFormData(prev => ({
        ...prev,
        quantity: val,
        // WICHTIG: Überschüssige S/N abschneiden wenn Menge reduziert wird!
        serialNumbers: prev.serialNumbers.slice(0, val),
      }));
    }}
    className="h-7 w-20 text-xs text-white"
  />
</div>
```

> **ACHTUNG:** Wenn `quantity` reduziert wird, muss `serialNumbers` sofort auf `slice(0, val)` gekürzt werden. Sonst werden zu viele S/N an den Store gesendet!

### 2E — Button "Serial eintragen" + S/N-Dialog (Modal)

**Bedingung:** Sichtbar wenn `formData.serialRequired === true`. Kein Switch, kein Gate — KISS.

**Button:**
```tsx
{formData.serialRequired && (
  <button
    type="button"
    onClick={() => setShowSerialDialog(true)}
    className="h-7 px-3 text-xs rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors"
  >
    Serial eintragen ({formData.serialNumbers.filter(s => s.trim()).length}/{formData.quantity})
  </button>
)}
```

**Neuer State in ArticleMatchCard:**
```typescript
const [showSerialDialog, setShowSerialDialog] = useState(false);
```

**S/N-Dialog (innerhalb ArticleMatchCard, als Sub-Komponente oder inline):**

Verwendet `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogFooter` aus `@/components/ui/dialog` (shadcn).

```tsx
<Dialog open={showSerialDialog} onOpenChange={setShowSerialDialog}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle className="text-sm">
        Seriennummern eintragen ({formData.quantity} Stück)
      </DialogTitle>
    </DialogHeader>
    <div className="space-y-2 max-h-[40vh] overflow-y-auto py-2">
      {Array.from({ length: formData.quantity }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Label className="text-xs w-8 shrink-0">#{i + 1}</Label>
          <Input
            value={formData.serialNumbers[i] ?? ''}
            onChange={(e) => {
              setSaved(false);
              setFormData(prev => {
                const updated = [...prev.serialNumbers];
                // Auffüllen bis Index i
                while (updated.length <= i) updated.push('');
                updated[i] = e.target.value;
                return { ...prev, serialNumbers: updated };
              });
            }}
            placeholder="z.B. K25645407008K"
            className="h-7 text-xs"
          />
        </div>
      ))}
    </div>
    <DialogFooter>
      <button
        onClick={() => setShowSerialDialog(false)}
        className="h-7 px-3 text-xs rounded bg-teal-600 text-white hover:bg-teal-700"
      >
        Übernehmen
      </button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Wichtig:** Der Dialog generiert **exakt `formData.quantity` Eingabefelder**. Das Array `formData.serialNumbers` wird beim Schließen nicht bereinigt — das passiert nur bei `handleSubmit` (Phase 2F).

### 2F — handleSubmit erweitern

**Aktuell (Z.147-159):**
```typescript
const handleSubmit = () => {
  if (!isValid) return;
  setManualArticleByPosition(line.positionIndex, {
    falmecArticleNo: formData.falmecArticleNo.trim(),
    manufacturerArticleNo: formData.manufacturerArticleNo || undefined,
    ean: formData.ean || undefined,
    serialRequired: formData.serialRequired,
    storageLocation: formData.storageLocation || undefined,
    descriptionDE: formData.descriptionDE || undefined,
    supplierId: formData.supplierId || undefined,
    orderNumberAssigned: formData.orderNumberAssigned || undefined,
  }, runId);
  setSaved(true);
};
```

**Neu:**
```typescript
const handleSubmit = () => {
  if (!isValid) return;

  // S/N bereinigen: nur nicht-leere Strings, exakt bis quantity abschneiden
  const cleanedSerials = formData.serialNumbers
    .slice(0, formData.quantity)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  setManualArticleByPosition(line.positionIndex, {
    falmecArticleNo: formData.falmecArticleNo.trim(),
    manufacturerArticleNo: formData.manufacturerArticleNo || undefined,
    ean: formData.ean || undefined,
    serialRequired: formData.serialRequired,
    storageLocation: formData.storageLocation || undefined,
    descriptionDE: formData.descriptionDE || undefined,
    supplierId: formData.supplierId || undefined,
    orderNumberAssigned: formData.orderNumberAssigned || undefined,
    unitPriceSage: formData.unitPriceSage ? parseFloat(formData.unitPriceSage) : undefined,
    quantity: formData.quantity,
    serialNumbers: cleanedSerials.length > 0 ? cleanedSerials : undefined,
  }, runId);
  setSaved(true);
};
```

**Smarte Logik:** Wenn `cleanedSerials.length > 0` → Store bekommt die S/N und setzt `serialSource: 'manual'` (Phase 1C). Wenn das Pop-up leer blieb (`cleanedSerials.length === 0`) → `serialNumbers: undefined` → Store belässt die Zeile wie sie ist und Step 3 kann später normal übernehmen.

---

## Phase 3: Step-3-Schutzschild (Parser-Guard)

### 3A — SerialFinder-Pfad (Neuer Pfad)

**Datei:** `src/store/runStore.ts` Zeile 3615-3616

**Aktuell:**
```typescript
const updatedRunLines = runLines.map(line => {
  if (!line.serialRequired) return line;
```

**Neu (Guard VOR dem serialRequired-Check):**
```typescript
const updatedRunLines = runLines.map(line => {
  // PROJ-45-R5: Manuelle S/N sind heilig — Step 3 darf sie nicht überschreiben
  if (line.serialSource === 'manual') return line;
  if (!line.serialRequired) return line;
```

### 3B — Legacy-Matcher-Pfad

**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts` Zeile 546-547

**Aktuell:**
```typescript
const updatedLines = lines.map(line => {
  if (!line.serialRequired) return line;
```

**Neu (Guard VOR dem serialRequired-Check):**
```typescript
const updatedLines = lines.map(line => {
  // PROJ-45-R5: Manuelle S/N sind heilig — Step 3 darf sie nicht überschreiben
  if (line.serialSource === 'manual') return line;
  if (!line.serialRequired) return line;
```

### 3C — requiredCount-Anpassung im Legacy-Pfad (PFLICHT)

**Begründung:** Wenn eine Zeile manuell S/N hat, soll sie auch nicht in den `requiredCount` einfließen (sonst entsteht eine Falsch-Warnung "S/N fehlen").

**SerialFinder-Pfad (Z.3617):** Kein separater Fix nötig — der Guard in 3A returned die Zeile bevor Z.3617 (`requiredCount += line.qty`) erreicht wird. Implizit erfüllt.

**Legacy-Pfad (Z.563) — MUSS gefixt werden (separater `.filter()` auf Original-Array!):**
```typescript
// Aktuell:
const requiredCount = lines.filter(l => l.serialRequired).length;
// Neu:
const requiredCount = lines.filter(l => l.serialRequired && l.serialSource !== 'manual').length;
```
**Warum PFLICHT:** Im Gegensatz zum SerialFinder-Pfad wird `requiredCount` hier NACH dem `.map()` berechnet, mit `.filter()` auf dem **Original-Array `lines`**. Ohne diesen Fix zählt eine manuelle Zeile mit `serialRequired: true` noch im Nenner mit und erzeugt eine Ghost-Warnung.

---

## Zusammenfassung der Änderungen

| Phase | Datei | Zeile(n) | Änderung |
|---|---|---|---|
| 1A | runStore.ts | 411-421 | +3 Felder in ManualArticleData |
| 1B | runStore.ts | 2839 | serialRequired-Bug fix (matched-Pfad) |
| 1C | runStore.ts | 2830-2865 | +unitPriceSage, qty, serialNumbers, serialSource in beiden Pfaden |
| 1D | runStore.ts | 2822 | finalPrice-Override mit data.unitPriceSage |
| 2A | IssueDialog.tsx | 111-120 | +3 Felder in ArticleFormData (kein Switch!) |
| 2B | IssueDialog.tsx | 124-133 | State-Init für neue Felder (kein hasSerialDocument!) |
| 2C | IssueDialog.tsx | ~232 | Sage ERP Preis Input |
| 2D | IssueDialog.tsx | ~232 | Mengen-Stepper Input |
| 2E | IssueDialog.tsx | ~233 | "Serial eintragen" Button (immer bei serialRequired) + S/N-Dialog |
| 2F | IssueDialog.tsx | 147-159 | handleSubmit mit neuen Feldern + S/N-Bereinigung |
| 3A | runStore.ts | 3615-3616 | Guard: `serialSource === 'manual'` (SerialFinder) |
| 3B | FalmecMatcher_Master.ts | 546-547 | Guard: `serialSource === 'manual'` (Legacy) |
| 3C | FalmecMatcher_Master.ts | 563 | requiredCount exkludiert manuelle Zeilen |

---

## Imports (zwingend anpassen!)

**IssueDialog.tsx (Z.27-33) — `DialogFooter` fehlt und muss ergänzt werden:**

Aktueller Import:
```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
```

Neuer Import (`DialogFooter` hinzufügen):
```typescript
import {
  Dialog,
  DialogContent,
  DialogFooter,    // NEU: für S/N-Pop-up
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
```

---

## Sonnet-Regeln (Zwingend!)

1. **Plan-Modus:** IMMER zuerst in den Plan-Modus (thinking) gehen.
2. **Skills:** Lade selbstständig Skills (`frontend`, `find-skills`, `qa`), wenn sie dir helfen.
3. **Feature-Datei:** Alle Änderungen dokumentieren in `features/PROJ-45-ADD-ON-Serial-Artikel-Fehlerhandling_round5.md`.
4. **TypeScript-Check:** Am Ende selbstständig `npx tsc --noEmit` ausführen und **alle** Fehler fixen.
5. **INDEX:** `features/INDEX.md` aktualisieren.

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden

### Hinweis 1: S/N-Array und Menge synchron halten (KRITISCH)
Wenn der User die `quantity` im Mengen-Stepper **reduziert**, muss `serialNumbers` sofort mit `.slice(0, newQuantity)` gekürzt werden. Andernfalls werden zu viele Seriennummern an den Store gesendet. Der `onChange`-Handler des Quantity-Inputs **muss** beides gleichzeitig updaten:
```typescript
setFormData(prev => ({
  ...prev,
  quantity: val,
  serialNumbers: prev.serialNumbers.slice(0, val),
}));
```

### Hinweis 2: handleSubmit S/N-Bereinigung
Vor dem Senden an `setManualArticleByPosition` müssen die S/N bereinigt werden:
1. `.slice(0, formData.quantity)` — nicht mehr als die Menge
2. `.map(s => s.trim())` — Whitespace entfernen
3. `.filter(s => s.length > 0)` — Leere Strings rauswerfen

Nur wenn `cleanedSerials.length > 0` wird das Array gesendet, sonst `undefined`. So wird kein leeres Array geschrieben und Step 3 kann später normal übernehmen.

### Hinweis 3: unitPriceSage als String im State
Der `unitPriceSage` wird im Formular als `string` geführt (wegen Input-Binding). Erst bei `handleSubmit` wird `parseFloat()` aufgerufen. **Nicht vergessen!** Sonst bekommt der Store einen String statt einer Zahl.

### Hinweis 4: Dialog-Imports
`IssueDialog.tsx` importiert bereits `Dialog`, `DialogContent` etc. aus `@/components/ui/dialog` (es ist selbst ein Dialog). **Prüfe die bestehenden Imports** bevor du neue hinzufügst — Duplikate vermeiden!

### Hinweis 5: Guard-Reihenfolge in Phase 3
Der `serialSource === 'manual'` Guard muss **VOR** dem `!line.serialRequired` Check stehen. Warum: Eine Zeile kann `serialRequired: true` UND `serialSource: 'manual'` haben — in dem Fall soll sie trotzdem übersprungen werden.

### Hinweis 6: Kein `activeFlag`-Check in serialRequired
In `setManualArticleByPosition` den `activeFlag`-Wert nicht mit serialRequired verwechseln. `serialRequirement` ist das Feld im ArticleMaster, `serialRequired` auf der InvoiceLine.

### Hinweis 7: S/N-Dialog-State nicht im Formular
`showSerialDialog` ist ein **separater** `useState(false)`, nicht Teil von `ArticleFormData`. Die S/N-Werte selbst leben weiterhin in `formData.serialNumbers` — der Dialog liest und schreibt dort direkt.

### Hinweis 8: Bestehende update()-Funktion
Die generische `update(field)` Funktion in ArticleMatchCard arbeitet nur mit `e.target.value` (String). Für `quantity` (number) und `serialNumbers` (array) brauchst du **eigene Handler** — nicht die bestehende `update()`-Funktion verwenden!

### Hinweis 9: `qty` vs `quantity`
Auf der `InvoiceLine` heißt das Feld `qty` (number). Im `ManualArticleData` Interface heißt das neue Feld `quantity`. In `setManualArticleByPosition` muss die Zuordnung `qty: data.quantity ?? line.qty` lauten.

### Hinweis 10: KEIN `text-white` im S/N-Dialog! (Farb-Falle)
Die Inputs **im ArticleMatchCard-Grid** brauchen `text-white` (weil sie auf dem teal IssueDialog-Hintergrund sitzen). Die Inputs **im S/N-Pop-up-Dialog** (`<Dialog open={showSerialDialog}>`) brauchen KEIN `text-white`! Der S/N-Dialog ist ein eigenständiger shadcn `<Dialog>` der als Portal mit weißem `bg-background` gerendert wird. `text-white` dort = weißer Text auf weißem Grund = unsichtbar. Also: `className="h-7 text-xs"` ist korrekt für die S/N-Dialog-Inputs.

### Hinweis 11: `DialogFooter` Import nicht vergessen
Der bestehende Dialog-Import in IssueDialog.tsx enthält KEIN `DialogFooter`. Es muss explizit zum Import hinzugefügt werden (siehe Imports-Sektion). Ohne diesen Import → tsc-Fehler.

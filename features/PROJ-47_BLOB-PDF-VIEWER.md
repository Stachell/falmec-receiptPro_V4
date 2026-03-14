# PROJ-47: BLOB-PDF-VIEWER — Architektur-Plan

**Status:** Done
**Ziel-Datei:** `src/components/run-detail/OverviewPanel.tsx`
**Sektion:** "LINK" (aktuell Zeilen 130–151)
**Erstellt:** 2026-03-14

---

## 1. Big Picture

Die hochgeladenen Original-Dokumente (Rechnung, Warenbegleitschein) liegen als `File`-Objekte im Zustand-Store (`uploadedFiles[]`). Der `File`-Typ ist eine Subklasse von `Blob` — daher kann `URL.createObjectURL()` direkt auf `file.file` angewendet werden, **ohne** vorherige `ArrayBuffer → Blob`-Konvertierung. Das erzeugte `blob:`-URL wird in einem neuen Browser-Tab geöffnet, wo der integrierte PDF-Viewer des Browsers das Dokument anzeigt.

---

## 2. Ist-Zustand (OverviewPanel.tsx)

### 2.1 Aktuelle Imports (Zeile 1–6)
```typescript
import { Run } from '@/types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { FileText, Calendar, Settings2, Package, Layers, FolderOpen } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { Button } from '@/components/ui/button';
```

### 2.2 Aktuelle Store-Nutzung (Zeile 13)
```typescript
const { parsedInvoiceResult } = useRunStore();
```

### 2.3 Aktuelle LINK-Sektion (Zeilen 130–151)
- 1 Button: "Öffnet die Original-Rechnung" (falsche Beschriftung — öffnet tatsächlich den Archiv-Ordner)
- 1 Hilfstext: "Öffnet den Archiv-Ordner im Windows Explorer" + dynamischer Pfad
- Styling: `variant="outline"`, inline-style `backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666'`
- Icon: `FolderOpen` (w-4 h-4 mr-2)

---

## 3. Soll-Zustand (3-Button-Layout)

### 3.1 Neue/geänderte Imports

**Hinzufügen:**
```typescript
import { Eye } from 'lucide-react';  // Für die PDF-Viewer-Buttons
```

**Anmerkung:** `FileText` ist bereits importiert, wird aber aktuell nur in der Rechnungsdetails-Sektion verwendet. Für die PDF-Buttons wird `Eye` als passendes "Ansehen"-Icon empfohlen. Alternativ kann `FileText` wiederverwendet werden — Entscheidung liegt beim Implementierer, solange beide neuen Buttons das gleiche Icon verwenden.

### 3.2 Erweiterte Store-Nutzung

```typescript
const { parsedInvoiceResult, uploadedFiles } = useRunStore();
```

**Kein neuer Selector nötig.** `uploadedFiles` ist bereits im RunState-Interface vorhanden und wird direkt destrukturiert.

### 3.3 Datei-Lookup (innerhalb der Komponente, vor dem Return)

```typescript
const invoiceFile = uploadedFiles.find(f => f.type === 'invoice');
const openWEFile = uploadedFiles.find(f => f.type === 'openWE');
```

### 3.4 Blob-URL-Handler (Helper-Funktion, innerhalb oder außerhalb der Komponente)

```typescript
const openFileInNewTab = (file: File) => {
  const url = URL.createObjectURL(file);
  window.open(url, '_blank');
  // Revoke nach 60 Sekunden — der neue Tab hat längst geladen
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
```

**Warum 60s Timeout:** Bei `window.open` wird der Blob-URL vom neuen Tab konsumiert. Ein sofortiges `revokeObjectURL` würde die URL ungültig machen, bevor der Tab sie vollständig geladen hat. 60 Sekunden ist ein sicherer Puffer. Siehe Abschnitt 6 für Details.

---

## 4. UI-Spezifikation der LINK-Sektion

### 4.1 Layout-Struktur

```
┌─────────────────────────────────────────────────────────┐
│  LINK                                                    │
│                                                          │
│  ┌─ Button 1 ─────────────────────────────────────────┐ │
│  │ 👁 Original-Rechnung öffnen                         │ │
│  └─────────────────────────────────────────────────────┘ │
│  Öffnet die Original-Rechnung im Browser                 │
│                                                          │
│  ┌─ Button 2 ─────────────────────────────────────────┐ │
│  │ 👁 Warenbegleitschein öffnen          [ggf. disabled]│ │
│  └─────────────────────────────────────────────────────┘ │
│  Öffnet den Lieferschein im Browser                      │
│                                                          │
│  ┌─ Button 3 ─────────────────────────────────────────┐ │
│  │ 📁 Archiv im Explorer öffnen                       │ │
│  └─────────────────────────────────────────────────────┘ │
│  Öffnet den Archiv-Ordner im Windows Explorer (Pfad)     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Vertikaler Abstand zwischen Buttons

Jeder Button + Hilfstext bildet eine Gruppe. Zwischen den Gruppen wird `mt-3` als Abstandshalter verwendet. Die erste Gruppe beginnt direkt nach dem `<h3>`.

### 4.3 Exakte JSX-Struktur (Pseudocode)

```tsx
{/* LINK — Dokumente & Archiv */}
<div className="enterprise-card p-6 lg:col-span-3">
  <h3 className="font-semibold text-foreground mb-3">LINK</h3>

  {/* --- Button 1: Original-Rechnung --- */}
  <div>
    <Button
      variant="outline"
      style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
      disabled={!invoiceFile}
      onClick={() => invoiceFile && openFileInNewTab(invoiceFile.file)}
    >
      <Eye className="w-4 h-4 mr-2" />
      Original-Rechnung öffnen
    </Button>
    <p className="text-xs text-muted-foreground mt-2">
      Öffnet die Original-Rechnung im Browser
    </p>
  </div>

  {/* --- Button 2: Warenbegleitschein --- */}
  <div className="mt-3">
    <Button
      variant="outline"
      style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
      disabled={!openWEFile}
      onClick={() => openWEFile && openFileInNewTab(openWEFile.file)}
    >
      <Eye className="w-4 h-4 mr-2" />
      Warenbegleitschein öffnen
    </Button>
    <p className="text-xs text-muted-foreground mt-2">
      Öffnet den Lieferschein im Browser
    </p>
  </div>

  {/* --- Button 3: Archiv im Explorer (bestehend) --- */}
  <div className="mt-3">
    <Button
      variant="outline"
      style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
      onClick={() => {
        const subfolder = run.archivePath;
        const url = subfolder
          ? `/api/dev/open-folder?subfolder=${encodeURIComponent(subfolder)}`
          : '/api/dev/open-folder';
        fetch(url);
      }}
    >
      <FolderOpen className="w-4 h-4 mr-2" />
      Archiv im Explorer öffnen
    </Button>
    <p className="text-xs text-muted-foreground mt-2">
      Öffnet den Archiv-Ordner im Windows Explorer
      {run.archivePath ? ` (${run.archivePath})` : ''}
    </p>
  </div>
</div>
```

---

## 5. Änderungsliste (Checkliste für Implementierung)

| # | Was | Wo (Datei:Zeile) | Aktion |
|---|-----|-------------------|--------|
| 1 | Icon `Eye` importieren | `OverviewPanel.tsx:4` | `Eye` zur lucide-Import-Liste hinzufügen |
| 2 | `uploadedFiles` aus Store holen | `OverviewPanel.tsx:13` | Destrukturierung erweitern |
| 3 | File-Lookups definieren | `OverviewPanel.tsx:15` (nach invoiceTotal) | `invoiceFile` und `openWEFile` per `.find()` |
| 4 | Helper `openFileInNewTab` definieren | `OverviewPanel.tsx:17` (vor dem return) | Neue Funktion, 4 Zeilen |
| 5 | LINK-Sektion komplett ersetzen | `OverviewPanel.tsx:130–151` | Alte Sektion durch 3-Button-Layout ersetzen |

**Keine anderen Dateien werden berührt.** Kein neuer Service, kein neuer Hook, kein Store-Change.

---

## 6. Edge Cases & Fehlerbehandlung

| Edge Case | Handling |
|-----------|----------|
| `invoiceFile` ist `undefined` (kein File im Store) | Button 1 wird `disabled`. Guard-Check `invoiceFile &&` im onClick. |
| `openWEFile` ist `undefined` (kein Warenbegleitschein) | Button 2 wird `disabled`. Guard-Check `openWEFile &&` im onClick. |
| Datei ist kein PDF (z.B. `.xlsx`) | `URL.createObjectURL` funktioniert trotzdem — der Browser entscheidet, wie er den MIME-Type handhabt. Bei `.xlsx` wird der Browser typischerweise einen Download anbieten statt inline anzuzeigen. **Kein spezielles Handling nötig.** |
| `run.archivePath` ist leer/undefined | Bestehendes Verhalten bleibt: Fallback auf `/api/dev/open-folder` ohne Parameter. |
| Popup-Blocker verhindert `window.open` | Standard-Browser-Verhalten. Kein spezielles Handling. User muss Popup erlauben. |
| `uploadedFiles` ist leeres Array (App-Start, Files noch nicht geladen) | Beide Buttons `disabled` — korrekt, da keine Files verfügbar. |

---

## 7. Was sich NICHT ändert

- ❌ Kein neuer Service oder Hook
- ❌ Kein Zugriff auf `fileStorageService` (Files sind bereits im Store als `File`-Objekte)
- ❌ Kein `ArrayBuffer`-Handling (File ist bereits ein Blob)
- ❌ Keine Änderung an anderen Tabs oder Komponenten
- ❌ Kein Backend-Aufruf für Button 1 & 2
- ❌ Keine Änderung an der Archiv-Button-Logik (nur Label-Update)

---

## 8. Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden

### 8.1 Memory-Leak-Vermeidung bei Blob-URLs

**Das Problem:** `URL.createObjectURL()` erstellt eine Referenz im Browser-Speicher. Wenn diese nie via `URL.revokeObjectURL()` freigegeben wird, bleibt der Speicher belegt (Memory Leak).

**Die Falle bei `window.open()`:** Anders als beim Download-Pattern (wo man sofort `revokeObjectURL` rufen kann, weil der Download gestartet wurde) muss bei `window.open` die URL so lange gültig bleiben, bis der neue Tab sie geladen hat. Ein sofortiges `revokeObjectURL()` nach `window.open()` führt dazu, dass der neue Tab eine leere oder fehlerhafte Seite zeigt.

**Die Lösung:** Verwende einen `setTimeout` mit 60 Sekunden Verzögerung:
```typescript
const url = URL.createObjectURL(file);
window.open(url, '_blank');
setTimeout(() => URL.revokeObjectURL(url), 60_000);
```
**Warum das sicher ist:** Der Browser-Tab lädt die PDF in Millisekunden bis wenigen Sekunden. Nach 60 Sekunden ist die PDF garantiert geladen und die Blob-URL kann bedenkenlos freigegeben werden. Selbst wenn der User den Button 100x klickt, entstehen maximal 100 temporäre Blob-URLs, die sich nach je 60s selbst aufräumen.

**Warum KEIN `useRef` + Cleanup nötig ist:** Da wir die URLs per Timeout aufräumen, brauchen wir keinen React-Ref oder Unmount-Cleanup. Das würde unnötige Komplexität hinzufügen. KISS.

### 8.2 Flexbox/Grid-Layout nicht zerschießen

**Kritisch:** Die LINK-Sektion hat `lg:col-span-3` — sie spannt die gesamte Breite des 3-Spalten-Grids. Das MUSS erhalten bleiben.

**Die Falle:** Wenn man innerhalb der LINK-Sektion ein neues Grid oder Flexbox-Layout einführt (z.B. `flex gap-4` um die Buttons nebeneinander zu legen), kann das auf kleinen Bildschirmen brechen.

**Die sichere Variante:** Die Buttons werden **vertikal gestapelt** (kein Flex-Row!). Jede Button-Gruppe ist ein einfaches `<div>` mit `mt-3` für den Abstand. Kein verschachteltes Grid, kein Flexbox. Einfach Block-Layout.

**Was erhalten bleiben muss:**
- `className="enterprise-card p-6 lg:col-span-3"` auf dem Container-Div
- `<h3 className="font-semibold text-foreground mb-3">LINK</h3>` als Überschrift
- Styling aller Buttons identisch: `variant="outline"` + `style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}`
- Icons: `className="w-4 h-4 mr-2"` (identische Größe und Margin wie `FolderOpen`)
- Hilfstexte: `className="text-xs text-muted-foreground mt-2"` (identisch zum bestehenden)

### 8.3 TypeScript-Typsicherheit

**Der `File`-Zugriff:** `invoiceFile.file` ist vom Typ `File` (ein nativer Browser-Typ, Subklasse von `Blob`). `URL.createObjectURL()` akzeptiert `Blob | MediaSource` — da `File extends Blob`, ist das typesicher. **Kein Cast nötig.**

**Guard-Check:** Im `onClick`-Handler immer `invoiceFile &&` prüfen, obwohl der Button `disabled` ist. Grund: `disabled` verhindert den Klick nur visuell — TypeScript weiß nicht, dass `invoiceFile` dann garantiert existiert.

### 8.4 Import-Reihenfolge

Lucide-Icons werden in einer einzigen Import-Zeile aufgelistet. **`Eye` einfach alphabetisch in die bestehende Liste einfügen:**
```typescript
import { Calendar, Eye, FileText, FolderOpen, Layers, Package, Settings2 } from 'lucide-react';
```
(Alphabetisch sortiert — `Eye` kommt zwischen `Calendar` und `FileText`.)

### 8.5 Hilfstext-Zeichenlimit

Die Anforderung sagt: **Maximal 44 Zeichen** für den grauen Hilfstext. Zählung:
- Button 1: "Öffnet die Original-Rechnung im Browser" = **41 Zeichen** ✅
- Button 2: "Öffnet den Lieferschein im Browser" = **35 Zeichen** ✅
- Button 3: "Öffnet den Archiv-Ordner im Windows Explorer" = **46 Zeichen** — das ist der bestehende Text und darf so bleiben (wurde nicht geändert, Bestandsschutz).

### 8.6 Kein `async` nötig

Die `File`-Objekte liegen bereits im Zustand-Store im Speicher. Es ist **kein** asynchroner Zugriff auf IndexedDB nötig. `URL.createObjectURL(file)` ist synchron. `window.open()` ist synchron. Die gesamte Button-Logik ist rein synchron.

### 8.7 Test nach Implementierung

Nach der Implementierung:
1. `npx tsc --noEmit` — muss 0 Errors ergeben
2. Manuell testen: Run starten mit PDF-Rechnung → Tab "Details" → LINK-Sektion → Alle 3 Buttons prüfen
3. Edge Case: Run ohne Warenbegleitschein → Button 2 muss disabled sein
4. Edge Case: Frisch geladene App (Files aus IndexedDB rekonstruiert) → Buttons müssen funktionieren

---

## 9. Implementierungs-Summary (2026-03-14)

**Implementiert von:** Claude Sonnet 4.6
**Datei geändert:** `src/components/run-detail/OverviewPanel.tsx` (einzige Änderung)

**Durchgeführte Änderungen:**
1. `Eye` alphabetisch in lucide-Import eingefügt (zwischen `Calendar` und `FileText`)
2. `uploadedFiles` aus `useRunStore()` destrukturiert
3. `invoiceFile`/`openWEFile` per `.find()` + `openFileInNewTab`-Helper (4 Zeilen, 60s Timeout) vor dem Return definiert
4. LINK-Sektion (Zeilen 130–151) durch 3-Button-Layout ersetzt — vertikal gestapelt (`mt-3`), kein Flexbox-Row, `lg:col-span-3` erhalten, alle Button-Styles identisch

**`npx tsc --noEmit`:** 0 Errors ✅

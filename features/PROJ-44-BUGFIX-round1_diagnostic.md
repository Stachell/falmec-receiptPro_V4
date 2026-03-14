# PROJ-44 BUGFIX ROUND1 - IST-Analyse

Stand: 2026-03-13

## 1) Toter E-Mail-Button (`SettingsPopup.tsx`)

### 1.1 Exakte Funktion `handleSaveEmails`
Datei: `src/components/SettingsPopup.tsx` (Zeilen 341-351)

```tsx
const handleSaveEmails = () => {
  const result = saveEmailAddresses(emailAddresses);
  if (!result.ok) {
    toast.error(result.message);
    return;
  }
  setEmailAddresses(result.addresses);
  toast.success('E-Mail-Adressen gespeichert');
  setEmailSaved(true);
  setTimeout(() => setEmailSaved(false), 2000);
};
```

### 1.2 Klickpfad vom Button
Datei: `src/components/SettingsPopup.tsx` (Zeile 1015)

```tsx
<Button size="sm" onClick={handleSaveEmails} className="gap-1.5 min-w-[110px]">
```

### 1.3 Verknüpfung zur Speicherlogik
Import in `SettingsPopup.tsx` (Zeilen 61-66):

```tsx
import {
  ERROR_HANDLING_EMAIL_SLOT_COUNT,
  getStoredEmailSlots,
  saveEmailAddresses,
  isValidEmail,
} from '@/lib/errorHandlingConfig';
```

Persistenz in `src/lib/errorHandlingConfig.ts` (Zeilen 72-115, Kern Zeile 113):

```ts
export function saveEmailAddresses(addresses: string[]): SaveEmailAddressesResult {
  const slots = normalizeSlots(addresses);
  // ... Validierung (invalid/duplicate)
  const payload: ErrorHandlingEmails = {
    addresses: slots,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return { ok: true, addresses: slots };
}
```

Befund:
- `handleSaveEmails` ruft **aktiv** Persistenz auf (`saveEmailAddresses` -> `localStorage.setItem(...)`).
- `handleSaveEmails` ruft **nicht** `setGlobalConfig` auf.
- Es ist **kein leerer Toast-Stub**. Bei Validierungsfehlern (`!result.ok`) wird nur `toast.error(...)` gezeigt und bewusst **nicht** gespeichert.

## 2) Explodiertes Pop-up (`IssueDialog.tsx`) - aktuelle Container-Klassen

Datei: `src/components/run-detail/IssueDialog.tsx`

### 2.1 `<DialogContent>`
Zeile 190:

```tsx
<DialogContent className="max-w-[600px] w-full" style={{ backgroundColor: '#D8E6E7' }}>
```

### 2.2 `<Tabs>` (Haupt-Wrapper)
Zeilen 201-206:

```tsx
<Tabs
  value={activeTab}
  onValueChange={setActiveTab}
  orientation="vertical"
  className="flex gap-4 mt-2 h-[65vh] max-h-[800px]"
>
```

### 2.3 `<TabsList>` (linke Leiste)
Zeilen 207-210:

```tsx
<TabsList
  className="flex flex-col h-auto items-start justify-start gap-0.5 p-1 w-44 shrink-0"
  style={{ backgroundColor: '#c9c3b6', borderRadius: '0.5rem' }}
>
```

### 2.4 `<TabsContent>` (rechte Inhalte)
Aktuelle `className`-Werte:
- Zeile 234 (`overview`): `"flex-1 overflow-y-auto mt-0 space-y-3"`
- Zeile 301 (`report`): `"flex-1 overflow-y-auto mt-0 space-y-3"`
- Zeile 324 (`resolve`): `"flex-1 overflow-y-auto mt-0 space-y-3"`
- Zeile 396 (`email`): `"flex-1 flex flex-col overflow-y-auto mt-0 space-y-3 h-full"`
- Zeile 460 (`pending`): `"flex-1 overflow-y-auto mt-0 space-y-3"`

Befund:
- `DialogContent` hat aktuell **keine feste Höhe**, nur Breitenlimit.
- `TabsList` ist fix `w-44 shrink-0`.
- `TabsContent` nutzt `flex-1` + `overflow-y-auto`; ein explizites `overflow-hidden` ist dort aktuell **nicht** gesetzt.

## 3) Lagerort-Tabelle (`WarehouseLocations.tsx`)

Datei: `src/components/run-detail/WarehouseLocations.tsx`

### 3.1 Aktueller Tabellenkopf (`<thead>`)
Zeilen 191-217:

```tsx
<table className="w-full caption-bottom text-sm">
  <TableHeader className="bg-[hsl(var(--surface-sunken))]">
    <TableRow className="data-table-header">
      <TableHead ...>Pos <SortIcon col="positionIndex" /></TableHead>
      <TableHead ...>Artikelnummer</TableHead>
      <TableHead ...>Beschreibung</TableHead>
      <TableHead ...>Menge</TableHead>
      <TableHead ...>Aktueller Lagerort <SortIcon col="storageLocation" /></TableHead>
      {editMode && (
        <TableHead ...>
          Neuer Lagerort
        </TableHead>
      )}
    </TableRow>
  </TableHeader>
```

### 3.2 Aktuelles Zellen-Mapping (`<td>` / `TableCell`)
Zeilen 225-266:

```tsx
<TableCell>
  <span className="font-mono text-xs text-muted-foreground">{line.positionIndex + 1}</span>
</TableCell>
<TableCell>
  <span className="font-mono text-sm">{line.manufacturerArticleNo}</span>
</TableCell>
<TableCell>
  <span className="text-sm truncate max-w-[200px] block">
    {line.descriptionIT}
  </span>
</TableCell>
<TableCell>
  <span className="font-medium">{line.qty}</span>
</TableCell>
<TableCell>
  {line.storageLocation ? (
    <span className="text-sm">{line.storageLocation}</span>
  ) : (
    <span className="text-sm text-status-failed font-medium">Nicht zugewiesen</span>
  )}
</TableCell>
{editMode && (
  <TableCell>
    <Select
      value={line.storageLocation || ''}
      onValueChange={(value) =>
        updateInvoiceLine(line.lineId, { storageLocation: value as StorageLocation })
      }
    >
```

Befund zum Ist-Zustand:
- Spalte `Artikelnummer` zeigt derzeit `line.manufacturerArticleNo`.
- Spalte `Beschreibung` zeigt derzeit `line.descriptionIT` (italienisch), **nicht** die deutsche Bezeichnung.
- Eine eigene Spalte für `line.falmecArticleNo` existiert in dieser Tabelle derzeit nicht.

### 3.3 Verfügbare Properties auf `line`/`article`

`InvoiceLine` in `src/types/index.ts`:
- Zeile 279: `manufacturerArticleNo: string;`
- Zeile 289: `falmecArticleNo: string | null;`
- Zeile 290: `descriptionDE: string | null;`
- Zeile 281: `descriptionIT: string;`

`ArticleMaster` in `src/types/index.ts`:
- Zeile 353: `falmecArticleNo: string;`
- Zeile 354: `manufacturerArticleNo: string;`
- Zeile 360: `descriptionDE: string | null;`

Feldmapping (Masterdatenparser) in `src/services/masterDataParser.ts`:
- Zeile 13: `artNoDE -> falmecArticleNo`
- Zeile 14: `artNoIT -> manufacturerArticleNo`

### 3.4 Antworten auf die 4 Pflichtpunkte

1. Deutsche Artikelbezeichnung (statt IT):
- Vorhanden als `line.descriptionDE` (`string | null`) und `article.descriptionDE` (`string | null`).

2. Herstellerartikelnummer:
- Vorhanden als `line.manufacturerArticleNo` (`string`) und `article.manufacturerArticleNo` (`string`).

3. Deutsche Falmec-Artikelnummer (neue Spalte `ARTIKELNR.`):
- Vorhanden als `line.falmecArticleNo` (`string | null`) und `article.falmecArticleNo` (`string`).
- Herkunft laut Mapping: `artNoDE -> falmecArticleNo`.

4. Datentyp der Falmec-Artikelnummer (für Sortierung):
- **String-basiert**, nicht Number (`string | null` auf `line`, `string` auf `article`).
- Zusätzlich bestätigt durch Parser-Leselogik (`cellStr(...)`), d.h. selbst numerisch aussehende Werte werden als Text geführt.

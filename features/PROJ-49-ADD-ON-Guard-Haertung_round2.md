# PROJ-49 ADD-ON Guard-Haertung — Round 2: Chirurgischer Sniper-Plan

> Erstellt: 2026-03-30
> Letzte Aktualisierung: 2026-03-30 (Logik-Luecken v2 geschlossen)
> Erstellt von: Opus (Planungsmeister)
> Grundlage: Diagnostik-Ergebnis (4 Verdrahtungsfehler + 3 Vertragsbrueche) + Code-Analyse + SSOT-Architektur
> Status: **PLAN — noch keine Code-Aenderungen durchgefuehrt**
> Tracking: Dieses Dokument ist das zentrale Tracking bis alle 4 Fixes umgesetzt sind.

---

## UX-Kontext (Big Picture)

Die `serialList` ist die EINZIGE optionale Upload-Datei. Bei reinen Ersatzteilbestellungen ist es fuer den User charmanter, 1-2 Seriennummern spaeter ueber das Fehler-Management manuell abzuarbeiten, anstatt ein leeres Excel hochzuladen. Die 3 anderen Dateien (`invoice`, `articleList`, `openWE`) sind striktes ERP-Pflichtprogramm.

Fehlen Pflichtspalten in einer Tabelle, gibt es einen Hard-Fail mit glasklarer Meldung, damit der User seine Aliase in den Settings anpassen kann (KISS-Prinzip).

---

## Fix-Uebersicht

| # | Titel | Dateien | Schwere | Status |
|---|-------|---------|---------|--------|
| 1 | Tippfehler `artNo` → `falmecArticleNo` + Schema-Vertrag `required: true` fuer storageLocation/supplierId | `runStore.ts`, `FalmecMatcher_Master.ts`, `masterDataParser.ts` | **KRITISCH** | [x] erledigt |
| 2 | Startscreen-Blockade + openWE Backend-Pflicht (Hard-Fail) | `NewRun.tsx`, `runStore.ts`, `runPersistenceService.ts` | **KRITISCH** | [x] erledigt |
| 3 | Step-2-Guard: SSOT-konforme IDB-Quelle + semantische Umbenennung `parsedArticlePool` | `stepGuard.ts` | **HOCH** | [x] erledigt |
| 4 | Pseudo-Run-Logs mit `runId: 'sys'` | `runStore.ts` | **MITTEL** | [x] erledigt |

---

## Fix 1: Tippfehler + Parser-Vertrag schliessen

### 1A — Fataler Tippfehler in der Validierung

**Datei:** `src/store/runStore.ts`, Zeile 1615

Das `ArticleMaster`-Interface (`src/types/index.ts:367-378`) definiert das Feld als `falmecArticleNo`. Der Validierungsfilter nutzt aber `a.artNo` — ein Property das auf dem Typ nicht existiert. JavaScript gibt `undefined` zurueck (falsy), deshalb filtert der Filter **ALLE** Zeilen raus. `validRows` ist **immer leer**. Jede Artikelliste wird als `invalid` abgelehnt.

```
// types/index.ts:367-378
export interface ArticleMaster {
  id: string;
  falmecArticleNo: string;    // <-- DAS ist der korrekte Feldname
  manufacturerArticleNo: string;
  ean: string;
  storageLocation: string;
  unitPriceNet: number;
  activeFlag: boolean;
  serialRequirement: boolean;
  descriptionDE: string | null;
  supplierId: string | null;
}
```

#### Vorher (runStore.ts:1615-1627)

```typescript
const validRows = result.articles.filter(a => a.artNo && a.storageLocation && a.supplierId != null);
if (validRows.length > 0) {
  articleStatus = 'ready';
  parsedArticlePool = result.articles;
  // ...
} else {
  failedSources.push(`Artikelliste (keine valide Zeile mit artNo + storageLocation + supplierId in '${fileSnapshot.articleList.name}')`);
  logService.error('[Phase1] Artikelliste invalid: keine valide Zeile', { runId, step: 'System' });
}
```

#### Nachher

```typescript
// Hard-Fail bei fehlenden Pflichtspalten (Parser liefert missingRequiredFields)
if (result.missingRequiredFields.length > 0) {
  const missing = result.missingRequiredFields.map(fid => {
    const labels: Record<string, string> = { artNoDE: 'Artikelnummer', storageLocation: 'Lagerort/Hauptlager', supplierId: 'Lieferant' };
    return labels[fid] ?? fid;
  }).join(', ');
  failedSources.push(
    `Artikelliste ungueltig: Pflichtspalten fehlen (${missing}) in '${fileSnapshot.articleList.name}'. Pruefe Spaltennamen oder Aliase in den Einstellungen.`
  );
  logService.error(`[Phase1] Artikelliste invalid: Pflichtspalten fehlen (${result.missingRequiredFields.join(', ')})`, { runId, step: 'System' });
} else {
  const validRows = result.articles.filter(a => a.falmecArticleNo && a.storageLocation && a.supplierId != null);
  if (validRows.length > 0) {
    articleStatus = 'ready';
    parsedArticlePool = result.articles;
    await useMasterDataStore.getState().save(result.articles, fileSnapshot.articleList.name);
    logService.info(
      `[Phase1] Artikelliste ready: ${result.rowCount} Artikel, ${validRows.length} valide`,
      { runId, step: 'System' },
    );
  } else {
    failedSources.push(
      `Artikelliste ungueltig: Keine Zeile mit gueltigem Wert fuer Artikelnummer, Hauptlager und Lieferant in '${fileSnapshot.articleList.name}'. Pruefe Spaltennamen oder Aliase in den Einstellungen.`
    );
    logService.error('[Phase1] Artikelliste invalid: keine valide Zeile (falmecArticleNo + storageLocation + supplierId)', { runId, step: 'System' });
  }
}
```

### 1B — Schema: `storageLocation` und `supplierId` auf `required: true`

**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts`, Zeile 116-128

Aktuell steht `required: false` fuer beide Felder. Das ist inkonsistent mit der Phase-1-Validierung, die `storageLocation && supplierId != null` prueft. Konsequenz: Der Parser warnt nicht bei fehlenden Spalten, die Phase 1 aber spaeter als Hard-Fail behandelt. User bekommt eine kryptische Fehlermeldung.

#### Vorher (FalmecMatcher_Master.ts:115-129)

```typescript
    {
      fieldId: 'storageLocation',
      label: 'Lagerort',
      aliases: ['Lagerort', 'Storage Location', 'Magazzino', 'Hauptlagerplatz', 'Hauptlager'],
      required: false,
    },
    {
      fieldId: 'supplierId',
      label: 'Lieferant',
      aliases: [
        'Lieferant', 'Supplier', 'Fornitore', 'Hauptlieferant',
        'Hersteller', 'Lieferantennummer', 'Lieferanten-Nr.', 'Lieferantennr.', 'fornitore',
      ],
      required: false,
    },
```

#### Nachher

```typescript
    {
      fieldId: 'storageLocation',
      label: 'Lagerort',
      aliases: ['Lagerort', 'Storage Location', 'Magazzino', 'Hauptlagerplatz', 'Hauptlager'],
      required: true,
    },
    {
      fieldId: 'supplierId',
      label: 'Lieferant',
      aliases: [
        'Lieferant', 'Supplier', 'Fornitore', 'Hauptlieferant',
        'Hersteller', 'Lieferantennummer', 'Lieferanten-Nr.', 'Lieferantennr.', 'fornitore',
      ],
      required: true,
    },
```

### 1C — Parser: `missingRequiredFields` im Rueckgabewert exponieren

**Datei:** `src/services/masterDataParser.ts`

Aktuell sammelt der Parser fehlende Pflichtfelder nur als Warnungen (Zeile 208-213). Es gibt keinen strukturierten Rueckkanal, ueber den `ingestAndPersistRunData` fehlende Spalten **vor** dem Row-Parsing erkennen kann. Wir ergaenzen ein `missingRequiredFields`-Array.

#### Vorher (masterDataParser.ts:30-36 — Interface)

```typescript
export interface MasterDataParseResult {
  articles: ArticleMaster[];
  rowCount: number;
  columnMap: Record<string, string>;
  collisions: Array<{ fieldId: string; winner: string; loser: string }>;
  warnings: string[];
}
```

#### Nachher

```typescript
export interface MasterDataParseResult {
  articles: ArticleMaster[];
  rowCount: number;
  columnMap: Record<string, string>;
  collisions: Array<{ fieldId: string; winner: string; loser: string }>;
  warnings: string[];
  missingRequiredFields: string[];  // fieldIds mit required:true die in der Excel fehlen
}
```

#### Vorher (masterDataParser.ts:208-214 — Required-Check)

```typescript
  // Warn about missing required fields
  const requiredFields = FALMEC_SCHEMA.fields.filter(f => f.required).map(f => f.fieldId);
  for (const fid of requiredFields) {
    if (!elected.has(fid)) {
      warnings.push(`Pflichtfeld '${fid}' (${FALMEC_SCHEMA.fields.find(f => f.fieldId === fid)?.label}) nicht in der Excel-Datei gefunden.`);
    }
  }
```

#### Nachher

```typescript
  // Collect missing required fields — strukturiert fuer Hard-Fail in Phase 1
  const requiredFields = FALMEC_SCHEMA.fields.filter(f => f.required).map(f => f.fieldId);
  const missingRequiredFields: string[] = [];
  for (const fid of requiredFields) {
    if (!elected.has(fid)) {
      missingRequiredFields.push(fid);
      warnings.push(`Pflichtfeld '${fid}' (${FALMEC_SCHEMA.fields.find(f => f.fieldId === fid)?.label}) nicht in der Excel-Datei gefunden.`);
    }
  }
```

#### Vorher (masterDataParser.ts:270-277 — Return)

```typescript
  return {
    articles,
    rowCount: articles.length,
    columnMap,
    collisions,
    warnings,
  };
```

#### Nachher

```typescript
  return {
    articles,
    rowCount: articles.length,
    columnMap,
    collisions,
    warnings,
    missingRequiredFields,
  };
```

### Aenderungen Fix 1 — Gesamtuebersicht

| Datei | Stelle | Was |
|-------|--------|-----|
| `FalmecMatcher_Master.ts:119` | Schema | `storageLocation` → `required: true` |
| `FalmecMatcher_Master.ts:128` | Schema | `supplierId` → `required: true` |
| `masterDataParser.ts:30-36` | Interface | `missingRequiredFields: string[]` ergaenzen |
| `masterDataParser.ts:208-214` | Required-Check | `missingRequiredFields`-Array befuellen |
| `masterDataParser.ts:270-277` | Return | `missingRequiredFields` zurueckgeben |
| `runStore.ts:1615` | Filter-Property | `a.artNo` → `a.falmecArticleNo` |
| `runStore.ts:1609-1628` | Validierungsblock | `missingRequiredFields`-Check VOR `validRows`-Filter, sprechende Fehlermeldungen |

---

## Fix 2: Startscreen-Blockade + openWE Backend-Pflicht

### 2A — UI: serialList ist optional, openWE bleibt Pflicht

**Datei:** `src/pages/NewRun.tsx`

#### Vorher (NewRun.tsx:48-51)

```typescript
const allFilesUploaded = invoiceFile && openWEFile && serialListFile && articleListFile;
// Also check fileSystemService directly – the folder might have been
// configured via the AppFooter after this page mounted.
const canStartProcessing = allFilesUploaded && (isDirectoryConfigured || !!fileSystemService.getDataPath());
```

#### Nachher

```typescript
// Pflicht: invoice + articleList + openWE. Optional: serialList (UX: Ersatzteilbestellungen)
const requiredFilesUploaded = invoiceFile && articleListFile && openWEFile;
const canStartProcessing = requiredFilesUploaded && (isDirectoryConfigured || !!fileSystemService.getDataPath());
```

#### Vorher (NewRun.tsx:197-208 — FileUploadZone serialList)

```tsx
<FileUploadZone
  label="Warenbegleitschein / Seriennummernliste (XLS)"
  description="Datenauszug zur Rechnung aus Italien (ndmatricolek...)"
  accept={{
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
  }}
  fileType="serialList"
  onFileAccepted={(file) => addUploadedFile(file)}
  onFileRemoved={() => removeUploadedFile('serialList')}
  currentFile={serialListFile}
  required
/>
```

#### Nachher

```tsx
<FileUploadZone
  label="Warenbegleitschein / Seriennummernliste (XLS) — optional"
  description="Datenauszug zur Rechnung aus Italien (ndmatricolek...) — kann spaeter ueber Fehler-Management ergaenzt werden"
  accept={{
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
  }}
  fileType="serialList"
  onFileAccepted={(file) => addUploadedFile(file)}
  onFileRemoved={() => removeUploadedFile('serialList')}
  currentFile={serialListFile}
/>
```

#### Vorher (NewRun.tsx:228-239 — Hinweis-Text + Button-Disable)

```tsx
{!allFilesUploaded && (
  <p className="text-sm text-muted-foreground">
    Bitte laden Sie alle erforderlichen Dateien hoch
  </p>
)}
{allFilesUploaded && !canStartProcessing && (
  <p className="text-sm text-yellow-600 flex items-center gap-1.5">
    <AlertTriangle className="w-4 h-4" />
    Bitte waehlen Sie ein Datenverzeichnis im Footer
  </p>
)}
```

und Zeile 256:

```tsx
disabled={!allFilesUploaded || isLocked('start')}
```

#### Nachher

```tsx
{!requiredFilesUploaded && (
  <p className="text-sm text-muted-foreground">
    Bitte laden Sie die 3 Pflichtdateien hoch (Rechnung, Artikelliste, offene WE)
  </p>
)}
{requiredFilesUploaded && !canStartProcessing && (
  <p className="text-sm text-yellow-600 flex items-center gap-1.5">
    <AlertTriangle className="w-4 h-4" />
    Bitte waehlen Sie ein Datenverzeichnis im Footer
  </p>
)}
```

und Zeile 256:

```tsx
disabled={!requiredFilesUploaded || isLocked('start')}
```

### 2B — Backend: openWE als Pflichtfeld durchsetzen (Hard-Fail)

**Datei:** `src/store/runStore.ts`, Zeile 1684-1717

Aktuell behandelt `ingestAndPersistRunData` ein fehlendes `openWE` als `not_provided` (optional). Das widerspricht der ERP-Pflicht. **AUSSCHLIESSLICH `serialList` darf den Status `not_provided` erhalten.** Ein fehlendes `openWE` muss zwingend zu `invalid` + Hard-Fail fuehren.

#### Vorher (runStore.ts:1684-1691)

```typescript
    // Step 4: openWE parsen (optional)
    set({ parsingProgress: 'Bestelldaten validieren...' });
    let openWEStatus: 'ready' | 'not_provided' | 'invalid' = 'not_provided';
    let parsedOrderPool: ParsedOrderPosition[] | undefined;

    if (!fileSnapshot.openWE?.file) {
      openWEStatus = 'not_provided';
      logService.info('[Phase1] openWE not_provided (optional)', { runId, step: 'System' });
    } else {
```

#### Nachher

```typescript
    // Step 4: openWE parsen (PFLICHT — ERP-Vorbeleg)
    set({ parsingProgress: 'Bestelldaten validieren...' });
    let openWEStatus: 'ready' | 'invalid' = 'invalid';
    let parsedOrderPool: ParsedOrderPosition[] | undefined;

    if (!fileSnapshot.openWE?.file) {
      failedSources.push('Offene Wareneingaenge (Pflichtfeld — nicht hochgeladen)');
      logService.error('[Phase1] openWE fehlt (Pflichtfeld)', { runId, step: 'System' });
    } else {
```

### 2C — Typ-Anpassung: `openWE` verliert `not_provided`

**Datei:** `src/services/runPersistenceService.ts`, Zeile 56

Der Typ fuer `openWE` im `ingestStatus` traegt noch `'not_provided'` als erlaubten Wert. Da openWE ab sofort Pflicht ist, entfaellt dieser Zustand fuer neue Runs. **Fuer Rueckwaertskompatibilitaet mit alten IDB-Eintraegen bleibt der Typ UNVERAENDERT.** Die Downstream-Checks in Step 4 (`openWEStatus === 'not_provided'`) bleiben als defensive Guards fuer Legacy-Daten bestehen, werden fuer neue SSOT-Runs aber nie erreicht.

> **Design-Entscheidung:** Typ bleibt `'ready' | 'not_provided' | 'invalid' | 'pending'`. Kein Breaking Change an der Persistenz-Schicht. Lediglich die Laufzeitlogik in `ingestAndPersistRunData` setzt `not_provided` fuer openWE nie mehr.

### Aenderungen Fix 2 — Gesamtuebersicht

| Datei | Stelle | Was |
|-------|--------|-----|
| `NewRun.tsx:48` | Guard-Variable | `allFilesUploaded` → `requiredFilesUploaded` (ohne `serialListFile`) |
| `NewRun.tsx:51` | `canStartProcessing` | Nutzt `requiredFilesUploaded` |
| `NewRun.tsx:197` | FileUploadZone label | `— optional` Suffix |
| `NewRun.tsx:198` | FileUploadZone description | Hinweis auf spaetere Ergaenzung |
| `NewRun.tsx:207` | FileUploadZone required | `required`-Prop entfernen |
| `NewRun.tsx:228` | Hinweis-Text | Sprechender: "3 Pflichtdateien" |
| `NewRun.tsx:233` | Hinweis-Text | Nutzt `requiredFilesUploaded` |
| `NewRun.tsx:256` | Button disabled | Nutzt `requiredFilesUploaded` |
| `runStore.ts:1684` | Kommentar | "optional" → "PFLICHT" |
| `runStore.ts:1686` | Typ-Zuweisung | `'not_provided'` aus Initialwert entfernen → `'invalid'` |
| `runStore.ts:1689-1691` | Fehlende-Datei-Pfad | `not_provided` → `invalid` + Hard-Fail + `failedSources.push` |

---

## Fix 3: Step-2-Guard auf SSOT-konforme IDB-Quelle + semantische Trennung

### 3A — Befund

**Datei:** `src/services/stepGuard.ts`, Zeile 95-98 (validateStep2) + Zeile 314-323 (applyStepRepairs)

Der Step-2-Guard prueft die Artikel-Readiness ueber `useMasterDataStore.getState().articles` — ein globaler In-Memory-Store der nicht run-isoliert ist. Fuer SSOT-Runs ist `idbData.parsedArticlePool` die einzige autoritative Quelle.

**Problem-Kaskade bei Browser-Reload:**
1. User startet SSOT-Run → Phase 1 schreibt `parsedArticlePool` in IDB + befuellt `masterDataStore`
2. User schliesst Tab, oeffnet erneut → `masterDataStore` ist leer (fluechtig)
3. Step 2 Guard prueft `masterDataStore` → leer → `available: 'masterDataStore'`
4. Repair ruft `masterDataStore.load()` → laedt aus separater masterData-IDB (ggf. Daten eines ANDEREN Runs)
5. Guard sagt "ok" basierend auf falschen Daten

**Semantisches Problem:** Solange der Guard nach `masterArticles` fragt, ist die Gefahr gross, dass zukuenftige Entwickler ihn wieder an den globalen Store haengen. Der Feldname muss klar signalisieren: bei SSOT-Runs kommt die Quelle aus der IDB.

### 3B — Guard-Feld umbenennen: `masterArticles` → `parsedArticlePool`

#### Vorher (stepGuard.ts:93-98 — validateStep2)

```typescript
  // 3. masterArticles loaded?
  const masterArticles = useMasterDataStore.getState().articles;
  if (masterArticles.length === 0) {
    missingFields.push({ field: 'masterArticles', available: 'masterDataStore' });
  }
```

#### Nachher

```typescript
  // 3. Artikelstammdaten verfuegbar?
  // Feldname 'parsedArticlePool' signalisiert: SSOT-Runs nutzen IDB, nicht den globalen Store.
  // Sync-Pfad kann nicht zwischen SSOT/Legacy unterscheiden — IDB-Read ist async.
  // Deshalb: immer als 'idb' markieren, damit applyStepRepairs den SSOT-aware Pfad nutzt.
  const masterArticles = useMasterDataStore.getState().articles;
  if (masterArticles.length === 0) {
    missingFields.push({ field: 'parsedArticlePool', available: 'idb' });
  }
```

### 3C — Repair-Logik SSOT-aware umbauen

#### Vorher (stepGuard.ts:316-323 — applyStepRepairs, case 'masterArticles')

```typescript
      case 'masterArticles': {
        await useMasterDataStore.getState().load();
        if (useMasterDataStore.getState().articles.length > 0) {
          repairedFields.push('masterArticles');
        } else {
          field.available = 'none';
        }
        break;
      }
```

#### Nachher

```typescript
      case 'parsedArticlePool': {
        // SSOT-Runs: parsedArticlePool aus run-spezifischer IDB ist autoritativ.
        // Legacy-Runs: Fallback auf globalen masterDataStore.
        const idbData = await runPersistenceService.loadRun(runId);
        if (idbData?.ingestStatus) {
          // SSOT-Run: AUSSCHLIESSLICH parsedArticlePool aus IDB
          if (idbData.parsedArticlePool && idbData.parsedArticlePool.length > 0) {
            repairedFields.push('parsedArticlePool');
          } else {
            field.available = 'none';
          }
        } else {
          // Legacy-Run: masterDataStore laden (bestehende Logik)
          await useMasterDataStore.getState().load();
          if (useMasterDataStore.getState().articles.length > 0) {
            repairedFields.push('parsedArticlePool');
          } else {
            field.available = 'none';
          }
        }
        break;
      }
```

> **Hinweis:** `runPersistenceService` wird bereits in Zeile 23 importiert. Kein neuer Import noetig.

### Aenderungen Fix 3 — Gesamtuebersicht

| Stelle | Was | Aenderung |
|--------|-----|-----------|
| stepGuard.ts:95 | Feldname | `'masterArticles'` → `'parsedArticlePool'` |
| stepGuard.ts:97 | available-Wert | `'masterDataStore'` → `'idb'` |
| stepGuard.ts:316 | case-Label | `'masterArticles'` → `'parsedArticlePool'` |
| stepGuard.ts:316-323 | Repair-Logik | SSOT: `idbData.parsedArticlePool`, Legacy: `masterDataStore.load()` |
| stepGuard.ts:319, 322 | repairedFields-Eintrag | `'masterArticles'` → `'parsedArticlePool'` |

---

## Fix 4: Pseudo-Run-Logs (`runId: 'sys'`) entfernen

### Befund

**Datei:** `src/store/runStore.ts`, Zeile 1760 und 1773

`startWorkflowPhase2()` loggt Fehler mit `{ runId: 'sys' }`. Das erzeugt Muell-Eintraege, weil `logService` fuer jede einzigartige `runId` einen Buffer anlegt. `'sys'` ist keine gueltige Run-ID und erzeugt Ghost-Log-Eintraege die nie exportiert oder bereinigt werden.

Die `logService`-Signatur definiert `runId` als optional (`runId?: string`). Systemweite Logs koennen einfach ohne `runId` uebergeben werden.

### Vorher (runStore.ts:1760)

```typescript
logService.error(`[startWorkflowPhase2] loadPersistedRun fehlgeschlagen für ${runId}`, { runId: 'sys' });
```

### Nachher

```typescript
logService.error(`[startWorkflowPhase2] loadPersistedRun fehlgeschlagen für ${runId}`, { step: 'System' });
```

### Vorher (runStore.ts:1771-1773)

```typescript
logService.error(
  `[startWorkflowPhase2] Integritätsfehler: Step 1 Status='${step1?.status ?? 'unbekannt'}' — erwartet ok/soft-fail`,
  { runId: 'sys' },
);
```

### Nachher

```typescript
logService.error(
  `[startWorkflowPhase2] Integritätsfehler: Step 1 Status='${step1?.status ?? 'unbekannt'}' — erwartet ok/soft-fail`,
  { runId, step: 'System' },
);
```

> **Hinweis:** Beim zweiten Log (Integritaetsfehler) haben wir eine gueltige `runId` im Scope. Diese sollte mitgegeben werden — der Run existiert ja, nur sein Step-1-Status stimmt nicht.

### Aenderungen Fix 4 — Gesamtuebersicht

| Zeile | Was | Aenderung |
|-------|-----|-----------|
| 1760 | logService.error | `{ runId: 'sys' }` → `{ step: 'System' }` |
| 1773 | logService.error | `{ runId: 'sys' }` → `{ runId, step: 'System' }` |

---

## Validierung nach Umsetzung

### TypeScript-Pruefung

```bash
npx tsc --noEmit
# Erwartung: 0 Errors
```

### Regressions-Checkliste

| Test | Erwartung | Prueft Fix |
|------|-----------|------------|
| Upload: nur invoice + articleList + openWE → Button klickbar | Button aktiv, Run startet | Fix 2A |
| Upload: alle 4 Dateien → Run startet normal | Kein Regressionsbruch | Fix 2A |
| Upload: nur invoice + articleList (ohne openWE) → Button gesperrt | Button disabled | Fix 2A |
| Phase 1: gueltige Artikelliste → `articleStatus = 'ready'` | validRows > 0 | Fix 1A |
| Phase 1: Artikelliste ohne Lagerort-Spalte → Hard-Fail | Dialog: "Pflichtspalten fehlen (Lagerort)" | Fix 1B/1C |
| Phase 1: Artikelliste ohne Lieferant-Spalte → Hard-Fail | Dialog: "Pflichtspalten fehlen (Lieferant)" | Fix 1B/1C |
| Phase 1: ohne openWE-Datei (Bypass-Szenario) → Hard-Fail | failedSources enthaelt openWE-Meldung | Fix 2B |
| Phase 2: Step 2 nach Browser-Reload → Guard nutzt IDB | parsedArticlePool aus IDB, nicht masterDataStore | Fix 3 |
| Phase 2: Legacy-Run → Guard nutzt masterDataStore | Rueckwaertskompatibilitaet | Fix 3 |
| Log-Dateien: keine `sys`-Eintraege mehr | `logService.getRunLog('sys')` liefert leer | Fix 4 |

---

## Abhaengigkeiten zwischen Fixes

```
Fix 1A (artNo-Tippfehler)    ← haengt von Fix 1C ab (missingRequiredFields im Interface)
Fix 1B (Schema required)     ← unabhaengig, aber logische Voraussetzung fuer Fix 1C
Fix 1C (Parser-Rueckkanal)   ← Voraussetzung fuer Fix 1A (neues Feld)
Fix 2A (UI optional)         ← unabhaengig
Fix 2B (Backend openWE)      ← unabhaengig
Fix 3  (Guard SSOT)          ← unabhaengig
Fix 4  (Pseudo-RunId)        ← unabhaengig
```

**Empfohlene Reihenfolge:** Fix 1B → Fix 1C → Fix 1A → Fix 2A + 2B → Fix 3 → Fix 4

---

## Betroffene Dateien — Gesamtuebersicht

| Datei | Fixes | Stellen |
|-------|-------|---------|
| `src/services/matchers/modules/FalmecMatcher_Master.ts` | Fix 1B | Zeile 119, 128 |
| `src/services/masterDataParser.ts` | Fix 1C | Zeile 30-36, 208-214, 270-277 |
| `src/store/runStore.ts` | Fix 1A, 2B, 4 | 1609-1628, 1684-1691, 1760, 1773 |
| `src/pages/NewRun.tsx` | Fix 2A | 48, 51, 197-207, 228-233, 256 |
| `src/services/stepGuard.ts` | Fix 3 | 93-98, 316-323 |

---

> Dieses Dokument wird durch die erfolgreiche Umsetzung aller Fixes obsolet.
> Status-Tracking: Checkboxen oben in der Fix-Uebersicht abhaken nach jedem Fix.

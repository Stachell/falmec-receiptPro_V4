# PROJ-50 — TEST-ARENA (Die Giftküche)

**Status:** DONE — Umsetzung + Post-Audit-Cleanup abgeschlossen 2026-04-22 (tsc 0 Errors, INV-WSA-1..6 erfüllt, alle Blöcke A/B/D integriert; Block C bleibt planmäßig V2-Platzhalter; Post-Audit-Fixes Rev 7 eingearbeitet — s. Sektion 12)
**Datum:** 2026-04-22 (Update: Rd. 6 — Dialog-Lifecycle-Realität korrekt modelliert, Toast-after-Close als Feature anerkannt, `isMountedRef` als True-Unmount-Defense scharfgestellt; Rev 7 — Post-Audit-Cleanup: umfassender `ifMounted`-Guard, Zombie-DB-Schutz, `any` eliminiert)
**Scope:**
- `src/components/SettingsPopup.tsx` (UI — neuer Tab + **SSOT-Export `SettingsTabKey`**)
- `src/components/AppFooter.tsx` (Import-Only — lokale `SettingsTabKey`-Duplikation entfernen)
- `src/services/qaSamplesService.ts` (NEU — **Zwei-Store-Architektur**, isolierte IDB)
- `src/hooks/useQaSamples.ts` (NEU — React-Hook mit `isActive`-Guard)

**Auslöser:** Browser-Sandbox-Restriktionen blockieren wiederholte Disk-Uploads beim LLM-Testen. Interner IDB-Speicher („Giftküche") soll Test-Samples persistent vorhalten und später direkt in die Ingest-Engine feuern.

---

## 0. Schnüffler-Review (Re-Evaluierung 2026-04-22)

Drei harte Einwände durch Codex/Schnüffler geprüft — **alle drei valide**, Plan wurde angepasst:

| # | Einwand | Prüfergebnis | Architektur-Korrektur |
|---|---|---|---|
| 1 | `getAll()` lädt alle Blobs in RAM (keine Feldprojektion in IDB) | **Bestätigt** — IDB hat keine Projection-API; `cursor`-Traversal lädt Records immer voll | **Zwei-Store-Split** (Index/Blobs) — siehe Block B.1 |
| 2 | Kein Cleanup/Guard bei async IDB-Load in `useEffect` | **Bestätigt** — `SettingsPopup.tsx:430-439` hat KEINEN Cleanup, ganze Codebase hat KEIN `isActive`/`AbortController`-Pattern | **`useQaSamples`-Hook mit `isActive`-Sentinel** — siehe Block A.5 |
| 3 | `SettingsTabKey` dupliziert | **Bestätigt, sogar divergent:** `AppFooter.tsx:23` hat `'misc'`, `SettingsPopup.tsx:86` hat es NICHT. Unterschied ist stille Tech-Debt. | **SSOT-Export** aus `SettingsPopup.tsx`, Import in `AppFooter.tsx` — siehe Block D |

---

## 0.2 Schnüffler-Review Runde 2 (2026-04-22, Conditional-GO)

Drei weitere Einwände geprüft — **alle drei valide**, KISS/YAGNI-konform aufgelöst:

| # | Einwand | Schweregrad | Prüfergebnis | Architektur-Korrektur |
|---|---|---|---|---|
| 4 | Re-Upload = `deleteSample` (Tx1) + Rewrites (Tx2) → Datenverlust wenn Tx2 an Quota scheitert | **Must-Fix** | **Bestätigt** — in Runde 1 war Vorab-`deleteSample` separat in „Idempotenz & Guards" dokumentiert (eigene Transaktion). IDB gibt ACID **nur innerhalb** einer Transaktion. | **Cursor-Delete + Writes in EINER Transaktion** → siehe B.5 Rev 2. Atomar, automatischer Rollback via `tx.abort()` bei QuotaExceededError. |
| 5 | `sampleId = folderName.replace(/[^\w.-]/g, '_')` → `"Ordner A"` und `"Ordner_A"` kollidieren stillschweigend | **Must-Fix** | **Bestätigt** — IDB-Keys sind beliebige Strings (IDBValidKey, byteweise Vergleich), **keine** FS-Sanitization nötig. Pattern aus `runPersistenceService.ts:517` gilt nur für FS-Export-Pfade. Kopie davon hier = gefährliche Über-Anwendung. | **Sanitization ersatzlos streichen.** `sampleId` = `folderName` wörtlich. FS-Sanitization erst bei künftigem FS-Export (V2/Block C), nie bei IDB-Keys. |
| 6 | Bei 9 Tabs + `max-w-[800px]` droht TabsList-Overflow auf kleineren Viewports | Medium | **Bestätigt** — `SettingsPopup.tsx:859` nutzt `flex flex-row` ohne Wrap/Scroll. 9 Trigger × ~95 px ≈ 855 px > 800 px Container-Breite. | **EINE Klasse `flex-wrap` ergänzen** → siehe A.2 Rev 2. Zero-Logic, alle Tabs sichtbar, `h-fit` lässt Leiste natürlich auf zweite Zeile wachsen. |

---

## 0.3 Schnüffler-Review Runde 3 (2026-04-22, Confidence 84 % → 99 %)

Drei Must-Fixes und eine Härtung geprüft — **alle vier valide**, architektonisch aufgelöst:

| # | Einwand | Schweregrad | Prüfergebnis | Architektur-Korrektur |
|---|---|---|---|---|
| 7 | Cursor-Purge + `put`s **nicht** garantiert sequenziert: `put`s werden synchron nach `openCursor` enqueued, also VOR `cur.delete()` aus dem onsuccess-Callback. Frisch geschriebene Records können durch nachlaufende Cursor-Deletes wieder entfernt werden. | **Must-Fix** | **Bestätigt auf IDB-Spec-Ebene** — IDB-Requests werden in Enqueue-Reihenfolge verarbeitet. Mein Rd.-2-Pseudocode enqueuete `put(index)`/`put(blob*)` synchron direkt nach `openCursor`. Cursor-`delete`s werden erst in onsuccess-Callbacks enqueued → landen HINTER den Puts. Tatsächlich überlappen Index-Put + Blob-Puts und Cursor-Deletes. Race ist real. | **Puts ausschließlich im Terminal-Zweig (`cur === null`) des onsuccess-Handlers enqueuen.** Damit sind alle `delete`s erst aus dem Queue gezogen, bevor auch nur **ein** `put` enqueued ist → IDB verarbeitet strikt seriell → Purge komplett abgeschlossen. Siehe B.5 Rev 3 Pseudocode. |
| 8 | Bulk-Upload liest ALLE Sub-Samples vorab in ein `samples[]`-Array (O(Σ size) RAM) — löscht exakt den Vorteil der Zwei-Store-Architektur wieder aus. | **Must-Fix** | **Bestätigt** — Mein Rd.-2-Plan (B.5) hatte bewusst "Alle Sub-Dirs VORAB vollständig lesen" dokumentiert, aus Sorge um Tx-Auto-Abort bei async waits. Fehler: Tx-Auto-Abort gilt **innerhalb einer Transaktion**, nicht zwischen Transaktionen. Per-Sample eine Tx öffnen (NACH dem Read) löst beides: kein Auto-Abort, kein RAM-Spike. | **Loop Rev 3: Read → Tx-Open → Purge+Writes → `oncomplete` → Scope verlassen.** ArrayBuffers fallen pro Iteration aus dem JS-Scope → GC reclaimt vor dem nächsten Sample. Peak-RAM ≈ max(sample.size), nicht Σ(size). Siehe B.5 Rev 3. |
| 9 | Widerspruch in 9.3 (Operations-Reihenfolge): Sonnet darf „zusätzliche Schritte (z.B. Vorab-`deleteSample`) einfügen" — widerspricht Rd.-2-ACID-Regel. | **Must-Fix** | **Bestätigt** — Zeile 510 hat den Rd.-2-Fix nicht nachgezogen. Stale Rd.-1-Formulierung. | **9.3 neu schreiben:** explizites Verbot eines separaten `deleteSample`-Calls im Upload-Pfad. Einzige zulässige Purge-Form = Cursor-Iteration innerhalb derselben Tx. Siehe 9.3 Rev 3. |
| 10 | `${sampleId}::${fileName}` als String-Separator funktioniert, ist aber schwächer als nativer IDB-Array-Key `[sampleId, fileName]`. Mit verbatim-`sampleId` (Leerzeichen, Umlaute, `:`) steigt die Wahrscheinlichkeit, dass der Separator irgendwann doch im Content vorkommt. | Härtung | **Bestätigt** — macOS erlaubt `:` in Dateinamen. Auch wenn selten, ist Separator-Hygiene nicht garantiert. IDB unterstützt Array-Keys **nativ** (IDBValidKey), Lexikographie auf Tupel ist spec-fest. | **keyPath `['sampleId', 'fileName']`.** Kein Separator mehr, keine Escape-Logik, self-documenting. `QaSampleBlob.key` entfällt als Feld (wird von IDB aus den Record-Properties gebaut). Sekundär-Index `by-sampleId` bleibt für KISS-klare Cursor-Queries. Siehe B.2/B.3/B.5 Rev 3. |

---

## 1. Problemanalyse

Heute müssen Tester PDF + JSON + `.md`-Beschreibung pro Testfall jedes Mal aus dem Explorer neu auswählen (`FileUploadZone` → `fileStorageService`). Das ist (a) langsam, (b) fehleranfällig bei Bulk-Regressionen, (c) blockiert durch den Directory-Picker-Consent bei jedem Reload.

**Lösung:** Neuer Settings-Tab „Test-Arena" mit **isoliertem IDB-Silo** (`falmec-receiptpro-qa-samples`) in **Zwei-Store-Struktur** (Metadaten-Index + Blob-Payloads getrennt), damit der Settings-Tab auch bei 500 MB Samples stabil bleibt.

---

## 2. Impact-Matrix

| Geplante Änderung | Betroffene Funktionen | Betroffene Module | Risiko wenn vergessen |
|---|---|---|---|
| `SettingsTabKey` als **Export** (SSOT) | `SettingsPopup.tsx:86` | `SettingsPopup` + Importer | TS-Divergenz (Ist-Zustand!) |
| `SettingsTabKey` Import | `AppFooter.tsx:23` — lokale Kopie **ersatzlos löschen** | `AppFooter` | Typ-Duplikation bleibt, `'testarena'` nicht aufrufbar aus Footer |
| Neue `TabsTrigger` + `TabsContent` | `SettingsPopup.tsx:858-869`, `:871-1402` | Nur `SettingsPopup` | — |
| Neue IDB: `falmec-receiptpro-qa-samples` (v1) mit **2 Object-Stores** | — | NEU | — |
| Neue Datei `src/services/qaSamplesService.ts` | — | NEU | — |
| Neuer Hook `src/hooks/useQaSamples.ts` | — | NEU | Stale-State-Leak |
| Kein Eingriff in `runStore`, `globalConfig`, `runPersistenceService`, `fileStorageService` | — | — | — |

---

## 3. Circuit & Standards-Check

| Datei | Regel | Betroffen? | Schutzmaßnahme |
|---|---|---|---|
| C.md | A1–A16 (Workflow-Engine) | Nein | Test-Arena ist Silo |
| I.md | A1–A13 (Drillinge, Timer, Step-State) | Nein | Keine Workflow-Writes |
| S.md | S1 (Vite, Alias) | Ja | Alle Imports via `@/` |
| S.md | S4 (Tailwind-Only, shadcn-Wrapper) | Ja | `FooterButton`-Wrapper aus `SettingsPopup.tsx:89` wiederverwenden |
| S.md | S5 (Farben, Button-Typen) | Ja | `FooterButton` + semantische Tokens; kein neues Hex |
| **S.md (neu, Sektion B)** | **Hook-Cleanup-Pattern** | — | Vorschlag S.B (unten) |

---

## 4. State-Snapshotting

**Pfad A: Upload (Bulk-Ordner → IDB)**
```
[Button Upload] → window.showDirectoryPicker({mode:'read'})
  → qaSamplesService.ingestDirectory(dirHandle)
    → pro Sub-Ordner: {pdf?, json?, md?} einsammeln
    → IDB-Transaktion (readwrite über BEIDE Stores):
        - qa-sample-index.put({sampleId, description, fileMeta[], sizeEstimateBytes})
        - qa-sample-blobs.put({sampleId, fileName, kind, mimeType, data: ArrayBuffer})  × N
          (Primary-Key wird aus keyPath ['sampleId','fileName'] von IDB gebildet)
  → useQaSamples-Hook triggert reload
  → Liste zeigt neue Samples
```

**Pfad B: Listen-Refresh (BILLIG, reaktiv)**
```
useQaSamples({ enabled: open && activeTab === 'testarena' })
  → qaSamplesService.loadAllSummaries()
    → transaction('qa-sample-index', 'readonly').getAll()
    → Nur Index-Records (KEINE Blobs) in RAM
  → setQaSamples(summaries) NUR wenn isActive === true
```

**Pfad C: Sample-Detail-Load (TEUER, on-demand in V2)**
```
[späterer Ingest-Trigger] → qaSamplesService.loadSample(sampleId)
  → 1× index.get(sampleId) + N × blobs.get([sampleId, fileName]) (nur die benötigten)
  → Blob-ArrayBuffer nur punktuell im RAM
```

**Pfad D: Clear**
```
AlertDialog-Bestätigung
  → qaSamplesService.clearAll() → beide Stores in EINER Transaktion leeren
  → useQaSamples triggert reload → leere Liste
```

---

## 5. Transitions-Analyse

### 5a. Datenfluß-Vorbedingungen

| Neuer Code liest | Wert | Writer | Existiert Write in SOLL? |
|---|---|---|---|
| `qa-sample-index.getAll()` | `QaSampleIndexEntry[]` | `ingestDirectory` | Ja |
| `qa-sample-blobs.get([sampleId, fileName])` | `QaSampleBlob` (`{sampleId, fileName, kind, mimeType, data: ArrayBuffer}`) | `ingestDirectory` | Ja (nur in Ingest-Pfad V2) |
| `open && activeTab === 'testarena'` | boolean | `useState` in `SettingsPopup` | Ja (unchanged) |
| `useQaSamples.samples` | `QaSampleSummary[]` | Hook-interner `setState` | Ja (mit `isActive`-Guard) |

### 5b. Mechanismus-Sicherheit (Schnüffler-Kernpunkt)

| Altes Konstrukt | Neues Konstrukt | Fehlerklasse Alt | Fehlerklasse Neu | Auffangnetz? |
|---|---|---|---|---|
| **Single-Store mit Blob-Strip im Load** (V1-Plan) | **Zwei-Store-Split** (Index + Blobs) | RAM-Spike proportional zu Blob-Gesamtgröße | RAM-Spike proportional zu N_samples × O(200 B) Metadaten | **Ja — strukturell gelöst** |
| `useEffect(() => load().then(setState))` (Ist-Pattern in Codebase) | `isActive`-Sentinel + `AbortController` | Stale-setState nach Unmount/Tab-Wechsel, React-Warning | keine | **Ja — Hook kapselt** |
| Lokaler `type SettingsTabKey` an 2 Stellen | Einziger `export type` | Silent Divergenz (AppFooter hat bereits `'misc'`, Popup nicht) | keine | **Ja — SSOT** |
| IDB-`put` ohne Transaktions-Wrap für Multi-Store | `db.transaction([INDEX, BLOBS], 'readwrite')` atomar | partieller Write (Index gesetzt, Blob fehlt) | keine | **Ja — atomar** |
| **Cursor-Purge + Puts synchron parallel enqueued** (Rd. 3 #7) | **Puts nur im Terminal-Zweig `cur===null` enqueuen** | Racy: nachlaufende Deletes löschen frische Puts | keine | **Ja — strikte Enqueue-Reihenfolge** |
| **Vorab-Samples-Array im RAM akkumulieren** (Rd. 3 #8) | **Streaming-Loop: read→tx→write→out-of-scope pro Sample** | O(Σ size) RAM-Spike | O(max size) | **Ja — GC nach jeder Iteration** |
| String-Separator-Key `${sampleId}::${fileName}` | **Array-Key `[sampleId, fileName]`** (Rd. 3 #10) | Separator-Kollision bei exotischen Inhalten | keine | **Ja — IDBValidKey-Tupel** |

### 5c. Dispatch-Vollständigkeit

| Funktion | Parameter | Mögliche Werte | Verhalten |
|---|---|---|---|
| `classify(filename)` | `.pdf`/`.json`/`.md`/`.txt`/etc. | `'pdf'\|'json'\|'md'\|'other'` | `'other'` → skip + warn-log |
| `parseMarkdownDescription(buf)` | `undefined` / empty / kein Heading / >100KB | — | Fallbacks: `''`, `'(keine Beschreibung)'`, Truncate auf 400 Zeichen |
| Directory-Picker | `AbortError` (User-Cancel) | — | `toast.info('Abgebrochen')` — NIE `toast.error` |
| Directory-Picker | `SecurityError` (z.B. non-secure context) | — | `toast.error('File System Access erfordert HTTPS/localhost')` |
| `useQaSamples` | `enabled: false` während Load läuft | — | `isActive = false` verhindert `setState` |
| Sample ohne PDF | — | — | skipped++, toast.warning — IDB-Write unterbleibt |
| Sample mit Duplikat-Filename | — | — | letzter Blob gewinnt (gleicher Array-Key `[sampleId, fileName]`) |

---

## 6. Test-Kriterien

| # | Typ | Beschreibung | Erwartetes Ergebnis |
|---|---|---|---|
| 1 | Happy | 3 Sub-Ordner, je PDF+JSON+MD | 3 Samples, Liste zeigt 3 Einträge mit korrekter Beschreibung |
| 2 | Business | Sub-Ordner ohne PDF | Skipped, Warn-Toast, andere Samples OK |
| 3 | Infra | Firefox (kein File-System-Access) | Button disabled + Hinweistext |
| 4 | Edge | 50-MB-PDF | Erfolg **oder** Quota-Toast; kein Crash |
| 5 | Edge | MD ohne Heading | description = erste 200 Zeichen; kein Crash |
| 6 | Idempotenz | Gleicher Ordner 2× | Zweiter Upload überschreibt via `put` — kein Duplikat |
| 7 | Isolation | Nach Upload: existierende DBs vergleichen | `falmec-receiptpro-files` + `-runs` bitweise unverändert |
| 8 | Clear | [Leeren] nach Upload | Beide `qa-*`-Stores leer; andere DBs unberührt |
| 9 | **Performance (neu)** | 100 Samples à 10 MB in IDB, Tab öffnen | Tab rendert in < 500 ms; RAM-Increase < 20 MB (nur Index geladen) |
| 10 | **Lifecycle (neu)** | Tab „testarena" öffnen → sofort auf „export" wechseln während Load läuft | Keine React-Warning („setState on unmounted"), kein Überschreiben fremden State |
| 11 | **Lifecycle (neu)** | Popup schließen während Upload läuft | Upload läuft still zu Ende (IDB-Transaktion atomar), kein State-Leak in Component |
| 12 | **Type-SSOT (neu)** | `AppFooter.openSettingsAtTab('testarena')` compiliert | `npx tsc --noEmit` grün |
| 13 | **ACID (Rd. 2 #4)** | Re-Upload eines Samples bei simuliertem Quota-Fehler in der zweiten Hälfte der Tx | Alter Sample-Stand bleibt vollständig intakt (Index + Blobs unverändert); toast.error; `saved` nicht hochgezählt |
| 14 | **ID-Unique (Rd. 2 #5)** | Zwei Sub-Ordner `"Ordner A"` und `"Ordner_A"` im gleichen Upload | Zwei separate Samples in IDB (beide `sampleId`s bleiben verschieden); keine stille Überschreibung |
| 15 | **ID-Verbatim (Rd. 2 #5)** | Ordnername mit Leerzeichen/Umlauten `"Fehler müde"` | `sampleId === "Fehler müde"` in IDB; Wiederfinden via `index.get("Fehler müde")` funktioniert |
| 16 | **UI-Overflow (Rd. 2 #6)** | Popup bei 800 px Viewport mit allen 9 Tabs rendern | Tabs umbrechen automatisch in zweite Zeile, keine Tabs abgeschnitten, kein horizontaler Scroll |
| 17 | **Cursor-Sequencing (Rd. 3 #7)** | Re-Upload eines Samples, bei dem 3 alte Blobs dieselben `fileName`s wie neue haben. | Nach `tx.oncomplete`: genau die **neuen** 3 Blobs liegen in IDB; keine der neuen Records wurde durch den Purge nachträglich gelöscht. |
| 18 | **Streaming-Upload-RAM (Rd. 3 #8)** | 50 Samples à 20 MB hochladen; mehrere Heap-Snapshots während des Uploads erfassen. | **Kein lineares O(n)-Wachstum des Heaps mit der Zahl der bereits verarbeiteten Samples.** Peak-RAM bleibt grob proportional zum größten **einzelnen** Sample zzgl. Browser-/IDB-Overhead. GC-Timing ist nicht-deterministisch — keine harten Byte-Schwellen prüfen, sondern die **Trajektorie**: nach jedem abgeschlossenen `tx.oncomplete` darf der Heap zurückfallen, wenn der GC läuft. Regression liegt vor, wenn der Heap streng monoton wächst (klassisches Memory-Leak). |
| 19 | **Array-Key (Rd. 3 #10)** | Blob mit `fileName = "a::b.pdf"` (enthält Separator) + ein zweiter Blob mit `fileName = "a"` und eigener `sampleId = "::b.pdf"` | Beide Blobs koexistieren kollisionsfrei (Array-Keys `["sampleA","a::b.pdf"]` ≠ `["::b.pdf","a"]`) — Test zeigt Robustheit gegen hypothetische Separator-Konflikte |
| 20 | **Dialog-Close-während-Upload (Rd. 6 #1 — Lifecycle-realistisch)** | Upload starten (große Sample-Menge, ~30 s Laufzeit), Popup innerhalb der ersten 5 s schließen. `SettingsPopup` bleibt gemountet (Radix-Dialog ohne `forceMount`), nur visuell ausgeblendet. | **(a)** Kein React-Warning („Can't perform a React state update on an unmounted component") in der Dev-Console. **(b)** Upload-Tx läuft still zu Ende, IDB enthält alle erfolgreichen Samples. **(c)** `toast.success` feuert global via Sonner-Portal — ist **erwünschtes** Background-Feedback, KEINE Regression. **(d)** `qaBusy` bleibt `true` bis `finally`, Upload-/Leeren-Buttons sind bei Reopen disabled, solange der Upload läuft — verhindert Doppelstart. **(e)** Beim nächsten Popup-Öffnen nach Upload-Ende (`enabled` flippt false→true) führt der Hook einen frischen Load aus und zeigt alle Samples. |
| 20b | **True-Unmount-Defense (Rd. 6 #1)** | Hypothetisch: Wenn AppFooter künftig conditional gerendert wird und unmountet während `handleUploadSamples` läuft. | `isMountedRef.current === false` unterbindet `safeSetQaBusy(false)` im `finally` — kein State-Write auf toten Baum. Upload-Tx läuft in IDB zu Ende, Daten sind persistent. |

---

## 7. Umsetzungsplan

### Block A — UI: Settings-Tab „Test-Arena"

**A.1 `SettingsTabKey` als SSOT** — `src/components/SettingsPopup.tsx:86`
```ts
// VORHER: type SettingsTabKey = '...';
// NACHHER:
export type SettingsTabKey =
  | 'general' | 'errorhandling' | 'parser' | 'matcher'
  | 'serial'  | 'ordermapper'   | 'export' | 'overview'
  | 'testarena';
```

**A.2 Tab-Registrierung (Rev 2 — Überlauf-Schutz)** — `SettingsPopup.tsx`

**A.2.a — Neuen Trigger einfügen**
- In `<TabsList>` (Zeile 858-869) **nach** `overview` ergänzen:
  ```tsx
  <TabsTrigger value="testarena" className="<kopiere klasse von zeile 868>">
    <FlaskConical className="w-3 h-3" />Test-Arena
  </TabsTrigger>
  ```
  Lucide-Import: `FlaskConical` zu Zeile 42 hinzufügen.
- Neuer `<TabsContent value="testarena" className="mt-0 space-y-3">` **nach** Zeile 1400 (`<ExportConfigTab />`).

**A.2.b — `TabsList`-Overflow-Fix (Schnüffler Rd. 2 #6)**
- **Ist-Zustand** `SettingsPopup.tsx:859`:
  ```
  className="flex flex-row h-fit bg-[#c9c3b6] border border-border tab-bar-raised p-1 gap-1 rounded-md mb-3 shrink-0"
  ```
- **Soll-Zustand** — eine Klasse ergänzen (`flex-wrap`):
  ```
  className="flex flex-row flex-wrap h-fit bg-[#c9c3b6] border border-border tab-bar-raised p-1 gap-1 rounded-md mb-3 shrink-0"
  ```
- **Warum KISS:** `h-fit` existiert bereits → die Leiste wächst vertikal, sobald Trigger nicht mehr in eine Zeile passen. `gap-1` wirkt symmetrisch auf x+y, somit kein Zusatz-Class für Row-Gap nötig. **Null** Logik, **null** Breakpoints, **null** Scroll-Handling. Alle Tabs bleiben sichtbar, barrierefrei (Screenreader + Keyboard-Navigation unverändert, da Radix die Semantik managed).
- **Verworfene Alternativen:**
  - `overflow-x-auto` + `whitespace-nowrap`: Tabs verschwinden am Rand, User-Awareness leidet.
  - Responsive Schrumpfen / weniger Icons: YAGNI — 9 Tabs sind kein Dauerzustand, weitere Tabs sind nicht geplant.
  - Vertikales Tab-Menü: Over-Engineering, würde das gesamte Popup-Layout umbauen.

**A.3 Sektion 1 — Interner Testspeicher**
- Separator wie Zeile 874.
- Button-Reihe:
  - `<FooterButton onClick={handleUploadSamples} disabled={qaBusy || !fsApiAvailable}>` mit `<Upload />` + „Upload"
  - `<FooterButton danger onClick={() => setClearQaConfirmOpen(true)} disabled={qaBusy || samples.length === 0}>` mit `<Trash2 />` + „Leeren"
- Fallback-Text wenn `!fsApiAvailable`: „File System Access API — nur Chrome/Edge auf HTTPS oder localhost".
- Diagnose-Zeile: `{samples.length} Samples · {formatBytes(totalBytes)}`.
- Display-Container (scrollbar):
  ```tsx
  <div className="rounded-md border border-border bg-white/50 p-2 space-y-2 overflow-y-auto max-h-[260px]">
    {samples.length === 0
      ? <p className="text-xs text-muted-foreground">Keine Samples geladen.</p>
      : samples.map(s => <SampleCard key={s.sampleId} sample={s} />)}
  </div>
  ```
- `SampleCard`: Ordnername fett, `fileMeta`-Badges (`pdf`/`json`/`md` + Size), `description` als `<p className="text-xs">`.

**A.4 Sektion 2 — Testdaten schicken (Platzhalter)**
- Separator „Testdaten schicken".
- `<div className="rounded-md border border-dashed border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Folgt in nächster Version.</p></div>`

**A.5 React-Hook `useQaSamples` — `src/hooks/useQaSamples.ts` (NEU)**

Kapselt Async-Load mit **`isActive`-Sentinel** + AbortController-kompatibler Abort-Flag. Löst die Schnüffler-Sorge Nr. 2:

```ts
import { useEffect, useState, useCallback } from 'react';
import { qaSamplesService, type QaSampleSummary } from '@/services/qaSamplesService';

interface UseQaSamplesOptions { enabled: boolean; }
interface UseQaSamplesResult {
  samples: QaSampleSummary[];
  totalBytes: number;
  isLoading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useQaSamples({ enabled }: UseQaSamplesOptions): UseQaSamplesResult {
  const [samples, setSamples]   = useState<QaSampleSummary[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<Error | null>(null);
  const [bump, setBump]         = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let isActive = true;               // ← Schnüffler Nr. 2: Stale-Guard
    setLoading(true);
    qaSamplesService.loadAllSummaries()
      .then(list => {
        if (!isActive) return;          // Pop-Up zu / Tab gewechselt → kein setState
        setSamples(list);
        setError(null);
      })
      .catch(err => { if (isActive) setError(err); })
      .finally(() => { if (isActive) setLoading(false); });
    return () => { isActive = false; }; // ← Cleanup bei Unmount / deps-change
  }, [enabled, bump]);

  const reload = useCallback(() => setBump(n => n + 1), []);
  const totalBytes = samples.reduce((sum, s) => sum + s.sizeEstimateBytes, 0);
  return { samples, totalBytes, isLoading: loading, error, reload };
}
```

**A.6 Handler im Component (Rev 6 — Lifecycle-Realität korrekt modelliert)**

- Lokaler State: `qaBusy`, `clearQaConfirmOpen`, `fsApiAvailable` (`useMemo(() => 'showDirectoryPicker' in window, [])`).
- Hook-Call: `const { samples, totalBytes, reload } = useQaSamples({ enabled: open && activeTab === 'testarena' });`

**Lifecycle-Fakten (Schnüffler Rd. 6 #1):**

Der `SettingsPopup` wird in `AppFooter.tsx:433-446` **dauerhaft gerendert**. Die `open`-Prop steuert nur die visuelle Sichtbarkeit via Radix-`Dialog` (`DialogContent` wird im geschlossenen Zustand ausgeblendet, aber **nicht** aus dem React-Baum entfernt — shadcn-Default ohne `forceMount` nutzt Radix-Controlled-Open-Pattern).

**Konsequenz:** Ein reiner `isMountedRef`-Unmount-Guard **feuert unter Normalbedingungen nie**, weil die Komponente gemountet bleibt, solange `AppFooter` gemountet ist (also Applebenszeit).

**Korrekte Zielsetzung (KISS):** Wir brauchen zwei verschiedene Konzepte, nicht ein Über-Guard:

| Szenario | Was passieren soll | Mechanismus |
|---|---|---|
| True-Unmount (z.B. künftiges Conditional-Render von AppFooter) | Keine React-Warning, keine State-Writes auf toten Baum | `isMountedRef` bleibt als defensive Belt-and-Suspenders |
| User schließt Popup während Upload läuft | Upload-Tx läuft zu Ende (ACID), `qaBusy` bleibt `true` bis fertig → verhindert Doppel-Upload bei Reopen | Keine Extra-Logik — `setQaBusy(false)` im `finally` ist **gewollt** und korrekt |
| Upload fertig, Popup ist geschlossen | Toast erscheint global (Sonner-Portal im `body`), User sieht Background-Completion-Feedback | Kein Toast-Unterdrücken — **bewusste UX** |
| Upload fertig, Popup ist geschlossen, `reload()` läuft | Hook hat `enabled: open && tab==='testarena'` → bei `open===false` wird der Effect no-op (Hook-interner Guard). Beim Reopen triggert `enabled: false→true` ein frisches Load. | Kein Extra-Guard — `useQaSamples`-Logik greift bereits |

**Tatsächliches Pattern — minimal und KISS:**

```ts
const isMountedRef = useRef(true);
useEffect(() => {
  isMountedRef.current = true;
  return () => { isMountedRef.current = false; };   // ← True-Unmount-Defense only
}, []);

const safeSetQaBusy = (v: boolean) => {
  if (isMountedRef.current) setQaBusy(v);
};
```

- `handleUploadSamples`:
  ```ts
  safeSetQaBusy(true);
  try {
    const dir    = await window.showDirectoryPicker({ mode: 'read' });
    const result = await qaSamplesService.ingestDirectory(dir);
    toast.success(`${result.saved} Samples gespeichert, ${result.skipped} übersprungen`);
    reload();                                    // useQaSamples hat eigenen isActive-Guard
  } catch (e: any) {
    if (e?.name === 'AbortError')       toast.info('Abgebrochen');
    else if (e?.name === 'SecurityError') toast.error('HTTPS oder localhost erforderlich');
    else                                  toast.error(`Upload fehlgeschlagen: ${e?.message ?? 'Unbekannt'}`);
  } finally {
    safeSetQaBusy(false);
  }
  ```

**Warum KEIN `openRef`/`open`-Tracking hinzugefügt wird (YAGNI):**
- **Toast nach Schließen ist Feature, kein Bug:** Sonner rendert Toasts im `body`-Portal (außerhalb des Popups). Ein User, der 30 s auf den Upload wartet und dann wegklickt, erwartet zu Recht ein kurzes „7 Samples gespeichert" — sonst bleibt er im Unklaren, ob die Operation erfolgreich war. Ein `open`-Guard würde diese erwünschte Feedback-Schleife stummschalten.
- **`qaBusy`-Persistenz ist Feature, kein Bug:** Bleibt `qaBusy===true` während der Upload noch läuft, sind die Upload/Leeren-Buttons beim Reopen zu Recht disabled → verhindert Doppelstart und Race-Conditions in der IDB-Quota-Nutzung.
- **`reload()` während `open===false` ist No-op:** Der Hook prüft `enabled` als erste Zeile im `useEffect` und returned bei `false`. Kein unnötiger IDB-Read.
- Ein zusätzlicher `openRef`/`setOpenRef`-Guard würde diese drei korrekten Verhalten verletzen, ohne ein echtes Problem zu lösen. **Das ist exakt der YAGNI-Moment.**

**Warum `useRef` statt `useState` (für `isMountedRef`):**
- Ref-Updates lösen KEINE Re-Renders aus.
- Ref-Wert ist stabil über async-Grenzen hinweg (kein Stale-Closure).
- React-Canon für „Is this component still alive?"-Checks.

- `handleClearQa`: analog mit `safeSetQaBusy`. Toast feuert auch, wenn Popup inzwischen geschlossen wurde (gewollt).

### Block B — Logik: IDB-Backend (Zwei-Store-Architektur)

**B.1 Architektur-Entscheidung (Schnüffler-Kernpunkt)**

**Problem:** IDB erlaubt keine Field-Projection. `store.getAll()` muss jedes Record vollständig deserialisieren — inklusive der `ArrayBuffer`-Payloads. Bei 100 Samples × 10 MB → **1 GB RAM-Spike** nur um die Liste zu rendern.

**Lösung: Zwei-Store-Split in EINER DB:**
- **Store 1 — `qa-sample-index`** (keyPath: `sampleId`):
  enthält Metadaten, **keine Blobs**. `getAll()` dieses Stores ist billig (~200 B pro Record).
- **Store 2 — `qa-sample-blobs`** (keyPath: `['sampleId', 'fileName']` — **IDB-Array-Key**, Rd. 3 #10):
  enthält nur `{ sampleId, fileName, kind, mimeType, data: ArrayBuffer }`.
  Wird NIE via `getAll()` angesprochen, nur via `get([sampleId, fileName])` für den späteren Ingest.

**B.2 DB-Setup — `src/services/qaSamplesService.ts` (NEU)**

```ts
const DB_NAME      = 'falmec-receiptpro-qa-samples';  // isolierte DB
const DB_VERSION   = 1;
const INDEX_STORE  = 'qa-sample-index';
const BLOB_STORE   = 'qa-sample-blobs';

// onupgradeneeded:
//   db.createObjectStore(INDEX_STORE, { keyPath: 'sampleId' });
//   const blobStore = db.createObjectStore(BLOB_STORE, { keyPath: ['sampleId', 'fileName'] });
//   blobStore.createIndex('by-sampleId', 'sampleId', { unique: false });
```

**B.3 Interfaces**

```ts
export type QaFileKind = 'pdf' | 'json' | 'md';

export interface QaSampleFileMeta {
  name: string;           // 'rechnung.pdf'
  kind: QaFileKind;
  mimeType: string;
  size: number;
}

export interface QaSampleIndexEntry {    // in INDEX_STORE
  sampleId: string;                       // keyPath = Ordnername
  folderName: string;
  description: string;                    // geparst aus .md
  fileMeta: QaSampleFileMeta[];           // OHNE data
  uploadedAt: string;
  sizeEstimateBytes: number;
}

export interface QaSampleBlob {           // in BLOB_STORE
  // keyPath: ['sampleId', 'fileName'] — IDB baut den Primary Key aus diesen beiden Feldern
  sampleId: string;
  fileName: string;
  kind: QaFileKind;
  mimeType: string;
  data: ArrayBuffer;
}

export type QaSampleSummary = QaSampleIndexEntry;  // Alias — listen-freundlich
```

**B.4 Public API**

```ts
export const qaSamplesService = {
  isAvailable(): boolean,
  ingestDirectory(dir: FileSystemDirectoryHandle):
    Promise<{ saved: number; skipped: number; errors: string[] }>,
  loadAllSummaries(): Promise<QaSampleSummary[]>,   // billig — nur Index
  loadSample(sampleId: string):
    Promise<{ index: QaSampleIndexEntry; blobs: QaSampleBlob[] } | null>,  // teuer — on-demand
  deleteSample(sampleId: string): Promise<boolean>, // löscht Index + alle Blobs via index('by-sampleId')
  clearAll(): Promise<boolean>,                      // beide Stores in einer Transaktion
  getStats(): Promise<{ sampleCount: number; totalBytes: number }>,
};
```

**B.5 `ingestDirectory` — Streaming-Upload mit wasserdichter Tx-Sequenzierung (Rev 3)**

**Schnüffler Rd. 3 #7+#8:** Rev 2 hatte (a) Cursor-Deletes und `put`s parallel enqueued (Race) und (b) alle Samples vorab in RAM gelesen (OOM). Rev 3 löst beides mit demselben Re-Design:

```
FOR EACH sub-dir in dir.values():    // ← Streaming: pro Iteration ein Sample
  // --- Phase 1: File-System-Reads (außerhalb der IDB-Tx) ---
  files = []
  for await (fileEntry in sub-dir.values()):
    kind = classify(fileEntry.name)
    if kind === 'other' → warn + skip this file
    file = await fileEntry.getFile()
    buf  = await file.arrayBuffer()            // ← einziger RAM-Spike dieses Samples
    files.push({ name: file.name, kind, mimeType: file.type, size: file.size, data: buf })

  if !files.some(f => f.kind === 'pdf') →
    skipped++; toast.warning(sub-dir.name + ': PDF fehlt'); continue

  sampleId       = sub-dir.name            // verbatim, KEINE Sanitization
  description    = parseMarkdownDescription(files.find(f=>f.kind==='md')?.data)
  fileMeta       = files.map(f => ({ name, kind, mimeType, size }))
  indexRecord    = { sampleId, folderName: sub-dir.name, description, fileMeta,
                     uploadedAt: new Date().toISOString(),
                     sizeEstimateBytes: files.reduce((s,f)=>s+f.size, 0) }
  blobRecords    = files.map(f => ({ sampleId, fileName: f.name, kind: f.kind,
                                     mimeType: f.mimeType, data: f.data }))

  // --- Phase 2: Atomare Tx für genau dieses Sample ---
  try:
    await writeSampleAtomically(db, indexRecord, blobRecords)
    saved++
  catch err:
    errors.push(sampleId + ': ' + (err.name ?? err.message))

  // Hier verlassen `files`, `blobRecords`, `indexRecord` den JS-Scope.
  // Die ArrayBuffer-Referenzen werden damit für den GC freigegeben — der
  // Garbage Collector KANN sie reclaimen, sobald er läuft. Timing ist nicht
  // deterministisch (Browser-Engine-Sache), aber es existiert keine
  // app-seitige Referenz mehr, die die Buffers am Leben halten würde.
  // Erwartung: Peak-RAM bleibt grob proportional zu max(sample.size),
  // NICHT zu Σ(samples.size) — Messung siehe Test-Kriterium #18.

RETURN { saved, skipped, errors }
```

**`writeSampleAtomically` — Cursor-gated Puts (Rd. 3 #7):**

```ts
function writeSampleAtomically(db, indexRecord, blobRecords): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx         = db.transaction([INDEX_STORE, BLOB_STORE], 'readwrite');
    const indexStore = tx.objectStore(INDEX_STORE);
    const blobStore  = tx.objectStore(BLOB_STORE);
    const byId       = blobStore.index('by-sampleId');
    const req        = byId.openCursor(IDBKeyRange.only(indexRecord.sampleId));

    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) {
        cur.delete();          // enqueued vor dem nächsten continue()-Request
        cur.continue();        // triggert erneut diesen onsuccess-Handler
        return;                // ← KEIN put hier! Puts erst im Terminal-Zweig.
      }
      // cur === null → Cursor erschöpft, ALLE delete()-Requests sind enqueued.
      // Erst JETZT puts enqueuen — IDB verarbeitet seriell in Enqueue-Reihenfolge,
      // also sind sämtliche Deletes garantiert VOR den Puts ausgeführt.
      indexStore.put(indexRecord);
      for (const blob of blobRecords) blobStore.put(blob);
    };

    req.onerror  = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error ?? new Error('Tx error'));
    tx.onabort    = () => reject(tx.error ?? new Error('Tx aborted'));
  });
}
```

**Warum das wasserdicht ist:**
- IDB-Requests werden strikt in **Enqueue-Reihenfolge** verarbeitet (W3C IDB-Spec).
- `req = openCursor(...)` ist der einzige Request, der synchron vor Tx-Aktivierung enqueued wird.
- Jeder `cur.delete()` + `cur.continue()` innerhalb onsuccess enqueued weitere Requests, die HINTER dem aktuellen Cursor-Request laufen.
- Erst wenn `cur === null` (Terminal-Zweig), werden `indexStore.put` + `blobStore.put(...)` enqueued — jetzt hinter allen delete-Operationen.
- **Garantie:** Alle Deletes abgeschlossen, **bevor** auch nur ein Put startet. Kein Datenverlust durch nachlaufende Cursor-Deletes.

**ACID-Garantien durch IDB-Semantik (unverändert):**
- `tx.abort()` bzw. impliziter Abort (z.B. `QuotaExceededError`) rollt **alle** Operationen zurück — inklusive der Cursor-Deletes.
- Bei Fehler bleibt der alte Sample-Stand vollständig intakt.
- Pro Sample eine eigene Tx → Fehler bei Sample X blockiert nicht Y oder Z.

**Tx-Lebensdauer-Regel:** `file.arrayBuffer()`-Reads passieren in Phase 1 (außerhalb jeder Tx). In Phase 2 wird die Tx geöffnet, alle Operationen sind rein IDB-synchron (Cursor + put), `tx.oncomplete` schließt ab. Kein Auto-Abort-Risiko durch Fremd-Promise.

**B.6 `deleteSample` — Kaskade via Secondary-Index (Rev 3)**

Standalone-Delete (wird nur von `clearAll` und ggf. UI-„Einzelsample löschen"-Feature aufgerufen, **nicht** vom Upload-Pfad). Da hier KEINE neuen Puts folgen, ist die Cursor-Sequenzierung aus B.5 nicht nötig — Index-Delete und Cursor-Deletes können parallel enqueued werden, IDB rollt bei Fehler alles gemeinsam zurück.

```ts
function deleteSample(sampleId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction([INDEX_STORE, BLOB_STORE], 'readwrite');
    tx.objectStore(INDEX_STORE).delete(sampleId);
    const req = tx.objectStore(BLOB_STORE)
                  .index('by-sampleId')
                  .openCursor(IDBKeyRange.only(sampleId));
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) { cur.delete(); cur.continue(); }
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error ?? new Error('Tx aborted'));
  });
}
```

### Block C — Ingest-Brücke (V2, NICHT V1)
`qaSamplesService.loadSample(id)` → `blobs[]` → `new File([blob], fileName)`-Rekonstruktion (Pattern `fileStorageService.ts:126-131`) → Push an `useRunStore.getState().parseInvoiceForIngest(runId, snapshot)`. Bleibt Platzhalter in V1.

### Block D — Type-SSOT-Korrektur (Schnüffler Nr. 3)

**D.1 Export in SettingsPopup** — `SettingsPopup.tsx:86` → `export type SettingsTabKey = ...`

**D.2 Refactor AppFooter** — `AppFooter.tsx:23`
```ts
// VORHER (eigene, divergierende Kopie mit 'misc'):
type SettingsTabKey = 'general' | ... | 'overview' | 'misc';

// NACHHER:
import type { SettingsTabKey } from '@/components/SettingsPopup';
```

**D.3 `'misc'` — Abklärung**
- Grep bestätigt: `'misc'` wird an **keiner** Stelle als Wert gesetzt oder gelesen. Es ist toter Typ-Eintrag.
- **Entscheidung:** Ersatzlos streichen (kein Code referenziert diesen Tab).
- Fallback: Falls jemand tatsächlich einen Misc-Tab plante und nicht mehr existiert → als Sektion-B-Memo in I.md vermerken.

---

## 8. Hinweise für Coder-LLM (Sonnet)

### Fallstricke
1. **KEINE Version-Bumps** existierender DBs `falmec-receiptpro-files` (v1) und `falmec-receiptpro-runs` (v1).
2. **Tab-Styling EXAKT** von Zeile 861-868 in `SettingsPopup.tsx` übernehmen — S5-konform. **TabsList (Zeile 859) ergänzend `flex-wrap`.**
3. **Async-Guard:** **NIE** `loadAllSummaries().then(setQaSamples)` direkt aus `useEffect` — immer durch den `useQaSamples`-Hook. Andere Komponenten, die später auf den Hook zugreifen, erben den Guard automatisch.
4. **Directory-Picker-Cancel**: `AbortError` → `toast.info`, nicht `.error`.
5. **SecurityError**: Bei non-secure context (http ohne localhost) klare Fehlermeldung.
6. **Array-Key (Rd. 3 #10):** `BLOB_STORE` nutzt `keyPath: ['sampleId', 'fileName']` — **kein** String-Separator mehr. `get/put` übergeben `[sampleId, fileName]` als IDBValidKey. Kein Escaping, keine Konvention, kollisionsfrei gegen Separator-Zeichen im Content.
7. **KEINE `sampleId`-Sanitization (Schnüffler Rd. 2 #5):** Der Runde-1-Plan empfahl `folderName.replace(/[^\w.-]/g, '_')` — das ist gestrichen. IDB-Keys sind beliebige Strings; Sanitization würde `"Ordner A"` und `"Ordner_A"` stillschweigend verschmelzen. FS-Sanitization greift erst, wenn Samples wieder auf Disk exportiert werden (V2/Block C) — dann im Export-Pfad, nie im IDB-Key.
8. **`FileSystemDirectoryHandle.values()`** ist Async-Iterator → `for await (const entry of dir.values())`.
9. **Transaktions-Scope (Rev 3 — ACID + Sequencing):** Pro Sample **eine** `db.transaction([INDEX, BLOBS], 'readwrite')`. Cursor-basierte Stale-Purge UND `put`s müssen durch **`writeSampleAtomically`** (B.5) geleitet werden — Puts enqueuen **ausschließlich** im Terminal-Zweig (`cur === null`) des Cursor-Handlers. **KEIN** separater `deleteSample`-Call davor (bricht ACID). **KEIN** `put` synchron vor/neben dem Cursor (Race).
10. **Streaming-Loop (Rev 3 — OOM-Schutz):** Loop liest ein Sample → öffnet Tx → schreibt → `await tx.oncomplete` → Scope verlassen. ArrayBuffers dürfen NICHT in einem Vorab-`samples[]`-Array akkumuliert werden.
11. **File-Reads außerhalb der Tx:** `arrayBuffer()`-Promises laufen **vor** `db.transaction(...)` für das aktuelle Sample. Innerhalb der Tx nur IDB-synchrone Operationen (Cursor + put). Kein `await` auf Fremd-Promises.
12. **`'misc'`-Entfernung in AppFooter**: vorher `grep -rn "'misc'" src/` — falls doch irgendwo gelesen, Strategie erneut abklären. (Bereits in Runde 1 verifiziert: 0 Treffer.)

### Geschützte Verbindungen
- `qaSamplesService` importiert **NICHT**: `runStore`, `runPersistenceService`, `fileStorageService`, `globalConfig`, `ingestSlice`.
- `AppFooter` bleibt dumb — er passt nur seinen TabKey-Typ an.

### Datenfluß-Warnungen
- Der `useQaSamples`-Hook bleibt `enabled: false` solange entweder Popup zu **oder** Tab != `'testarena'` ist → Zero IDB-Traffic beim Öffnen anderer Tabs.
- `reload()` des Hooks muss nach `ingestDirectory`/`clearAll` **explizit** gerufen werden (Hook hat keinen eigenen Change-Feed auf IDB).

### Dispatch-Warnungen
- `ingestDirectory` gibt `{saved, skipped, errors}` **vollständig** zurück. Kein stummes Schlucken — jeder Nicht-Happy-Pfad erhöht einen Zähler.
- `loadSample` gibt `null` zurück, wenn `sampleId` nicht existiert — Caller muss null-checken.

### Idempotenz & Guards
- `ingestDirectory` 2× desselben Ordners → Cursor-Purge (Teil derselben Tx) entfernt stale Blob-Keys deren Filename nicht mehr existiert, danach werden die neuen Index-/Blob-Records geschrieben. **Alles in einer Transaktion.** Bei Fehler: kompletter Rollback.
- `clearAll()` bestätigt durch AlertDialog (Pattern `SettingsPopup.tsx:1472-1491`).

---

## 9. Phase V — Code-Validierung

**Architektur-Review-Status:** VALIDATED (auf Basis Schnüffler-Review Runde 1-5, 2026-04-22).
**Phase-V-Status:** Scope-Validator-Run für die neuen Funktionen wird **vor Merge** nachgereicht (analog zu allen neuen Store-/Service-Funktionen).

---

### 9.0 ★ PHASE-V-HERZSTÜCK ★ — `writeSampleAtomically` (Rd. 5 eskaliert)

**Diese Funktion ist der ACID-Kern des gesamten Features. Sie wird in Phase V separat und vor allen anderen Tabellen geprüft. Ohne ihre Korrektheit ist das gesamte Feature NICHT mergefähig, selbst wenn alle anderen Prüfungen grün sind.**

Verbindliche Invarianten — jede MUSS lexikalisch am finalen Code nachweisbar sein:

| Invariante | Warum kritisch | Prüfpunkt im Code |
|---|---|---|
| **INV-WSA-1: Terminal-Zweig-Put** | Ohne diese Invariante existiert eine Race-Condition, die frisch geschriebene Records durch nachlaufende Cursor-Deletes wieder entfernt (Rd. 3 #7). | `indexStore.put(...)` und `blobStore.put(...)` erscheinen AUSSCHLIESSLICH im `cur === null`-Zweig des `onsuccess`-Handlers — lexikalisch nach einem `return` im Delete-Zweig. |
| **INV-WSA-2: Keine Pre-Cursor-Puts** | Synchrone Puts vor dem ersten `openCursor`-onsuccess landen VOR den Cursor-Deletes in der Tx-Queue — exakt der Race aus Rd. 3 #7. | Im gesamten Funktionskörper von `writeSampleAtomically` gibt es VOR dem Zeilen-Block `req.onsuccess = ...` keinen einzigen `.put(...)`-Aufruf. |
| **INV-WSA-3: Einheitlicher Tx-Scope** | Beide Stores (INDEX + BLOBS) müssen in derselben Transaktion erreichbar sein, sonst droht partieller State (Rd. 2 #4). | Exakt EINE `db.transaction([INDEX_STORE, BLOB_STORE], 'readwrite')`-Instanz pro Funktionsaufruf; keine geschachtelten Transaktionen. |
| **INV-WSA-4: Kein Fremd-Await** | `await` auf Nicht-IDB-Promises innerhalb einer aktiven Tx führt zum Auto-Abort des Browsers. | Innerhalb `writeSampleAtomically` gibt es **keine** `await`s außer implizit via `tx.oncomplete`-Promise-Wrapper. File-Reads sind zu diesem Zeitpunkt bereits abgeschlossen. |
| **INV-WSA-5: Promise-Terminierung** | Ohne `tx.onerror`/`onabort`-Handling bleibt die Promise hängen, wenn die Tx scheitert — Upstream erfährt nichts. | `tx.oncomplete → resolve()`, `tx.onerror → reject(tx.error)`, `tx.onabort → reject(tx.error ?? new Error('Tx aborted'))`. Alle drei Handler vorhanden. |
| **INV-WSA-6: Kein separater Pre-Delete** | ACID-Bruch bei Quota-Fehler (Rd. 2 #4). | Im gesamten `ingestDirectory`-Pfad wird `deleteSample(sampleId)` NICHT synchron vor `writeSampleAtomically` aufgerufen. Purge läuft ausschließlich cursor-basiert innerhalb derselben Tx. |

**Phase-V-Prozedur für `writeSampleAtomically`:**
1. Sonnet implementiert die Funktion nach Pseudocode B.5 Rev 3.
2. Sonnet markiert im PR-Diff für jede Invariante INV-WSA-1..6 die konkreten Zeilen, die sie einhalten.
3. Erst nach Abhaken aller sechs Invarianten darf die restliche Phase V (9.1–9.5) angegangen werden.
4. Bei Zweifel an einer Invariante: STOPP und Rückfrage an Dom, kein "vermutlich korrekt"-Commit.

---

### 9.1 Validierungstabelle (Audit-Befunde — CONFI 100 % da Zeilen-verifiziert)

| # | Behauptung | Datei | Zeile | Code-Auszug | Stimmt? | CONFI |
|---|---|---|---|---|---|---|
| 1 | `SettingsTabKey` lokal in SettingsPopup | `src/components/SettingsPopup.tsx` | 86 | `type SettingsTabKey = 'general' \| 'errorhandling' \| 'parser' \| 'matcher' \| 'serial' \| 'ordermapper' \| 'export' \| 'overview';` | ✓ | 100 % |
| 2 | `SettingsTabKey` divergent dupliziert | `src/components/AppFooter.tsx` | 23 | `type SettingsTabKey = 'general' \| 'errorhandling' \| 'parser' \| 'matcher' \| 'serial' \| 'ordermapper' \| 'export' \| 'overview' \| 'misc';` | ✓ — enthält `'misc'` | 100 % |
| 3 | `'misc'` wird nirgendwo als Wert verwendet | repo-weit | — | `grep -rn "'misc'" src/` liefert nur Zeile 23 | ✓ | 100 % |
| 4 | Existierende useEffect-Loads ohne Cleanup | `src/components/SettingsPopup.tsx` | 430-439 | `useEffect(() => { if (!open) return; runPersistenceService.loadRunList().then(list => { setDiagRunCount(list.length); }).catch(...); ... }, [open]);` | ✓ — kein `return () => {...}` | 100 % |
| 5 | Codebase hat KEIN `isActive`/`AbortController`-Pattern | `src/components/`, `src/hooks/` | — | `grep -rn "isActive\|AbortController\|isMounted"` ergibt nur NavLink/shadcn-UI (unrelated) | ✓ | 100 % |
| 6 | `openDatabase`-Pattern wiederverwendbar | `src/services/fileStorageService.ts` | 31-54 | `indexedDB.open(DB_NAME, DB_VERSION)` mit `onupgradeneeded` | ✓ | 100 % |
| 7 | Directory-Picker-Pattern etabliert | `src/services/runPersistenceService.ts` | 487-494 | `if (!('showDirectoryPicker' in window)) ... dirHandle = await (window as any).showDirectoryPicker(...)` | ✓ | 100 % |
| 8 | `FooterButton` als UI-Wrapper | `src/components/SettingsPopup.tsx` | 89-119 | `function FooterButton({ onClick, children, danger, disabled, className })` | ✓ | 100 % |
| 9 | AppFooter ist einziger externer Aufrufer | — | — | `grep -rn "SettingsPopup " src/` → nur `AppFooter.tsx:13` | ✓ | 100 % |

### 9.2 Exit-Pfad-Inventur

Für V1-Umsetzung auszufüllen durch Sonnet (neue Funktionen `handleUploadSamples`, `handleClearQa`, `ingestDirectory`, `loadAllSummaries`, `useQaSamples`).

### 9.3 Operations-Reihenfolge (Rev 3 — Widerspruch aufgelöst, Schnüffler Rd. 3 #9)

`ingestDirectory` ist in B.5 Rev 3 verbindlich festgelegt. **Sonnet darf die Reihenfolge nicht umbauen.** Insbesondere:

- **VERBOTEN:** Ein separater `deleteSample(sampleId)`-Call im Upload-Pfad vor der Tx. Das bricht ACID (Rd. 2 #4).
- **VERBOTEN:** `indexStore.put(...)` oder `blobStore.put(...)` synchron **neben** dem `openCursor(...)` enqueuen. Das bricht die Cursor-Sequenzierung (Rd. 3 #7).
- **VERBOTEN:** Samples in einem Vorab-`samples[]`-Array akkumulieren. Das bricht die Streaming-RAM-Garantie (Rd. 3 #8).
- **ZULÄSSIG** und erwartet: Die gesamte Purge-+-Write-Logik läuft durch `writeSampleAtomically` (B.5 Rev 3). Nur **innerhalb** dieser Funktion, **ausschließlich** im Terminal-Zweig `cur === null`, werden `put`s enqueued.

### 9.4 Datenstruktur-Verifikation

Alle Typen (`QaSampleIndexEntry`, `QaSampleBlob`, `QaSampleSummary`) sind neu — keine IST-Code-Abgleichung möglich. Nach Implementation Phase V-Tabelle füllen.

### 9.5 Abnahme — Architektur-Review

- [x] Schnüffler-Einwand 1 (IDB-getAll-RAM-Spike) architektonisch gelöst — Zwei-Store-Split
- [x] Schnüffler-Einwand 2 (Stale-State) gelöst — `useQaSamples`-Hook mit `isActive`-Sentinel
- [x] Schnüffler-Einwand 3 (Type-Duplikation) gelöst — SSOT-Export + Import in AppFooter
- [x] **Schnüffler Rd. 2 #4 (ACID-Falle) gelöst** — Cursor-Purge + Writes in EINER Tx, atomarer Rollback
- [x] **Schnüffler Rd. 2 #5 (ID-Kollision) gelöst** — Sanitization ersatzlos gestrichen, `sampleId` verbatim
- [x] **Schnüffler Rd. 2 #6 (UI-Overflow) gelöst** — `flex-wrap` auf TabsList, KISS
- [x] **Schnüffler Rd. 3 #7 (Cursor-Sequencing) gelöst** — Puts nur im Terminal-Zweig `cur===null`, `writeSampleAtomically` kapselt
- [x] **Schnüffler Rd. 3 #8 (OOM-RAM-Spike) gelöst** — Streaming-Loop, ArrayBuffers out-of-scope nach jeder Iteration
- [x] **Schnüffler Rd. 3 #9 (Plan-Widerspruch 9.3) gelöst** — 9.3 Rev 3 verbietet separaten `deleteSample` im Upload-Pfad explizit
- [x] **Schnüffler Rd. 3 #10 (String-Separator) gelöst** — Array-Key `[sampleId, fileName]` als `keyPath`
- [x] **Schnüffler Rd. 4 #1 (Textleichen) gelöst** — State-Snapshot, Transitions-Tabelle, I.B-TA6 auf Array-Key + korrektes GC-Wording
- [x] **Schnüffler Rd. 4 #2 (RAM-Test realistisch) gelöst** — Test #18 prüft Trajektorie, nicht Bytes
- [x] **Schnüffler Rd. 4 #3 (Phase-V-Checklist) gelöst** — 4 Phase-V-Critical-Einträge in Sektion 10
- [x] **Schnüffler Rd. 5 #1 (GC-Garantie-Wording) gelöst** — Kommentare im B.5-Pseudocode sprechen nur noch von "KANN reclaimen", keine harte Engine-Garantie
- [x] **Schnüffler Rd. 5 #2 (`writeSampleAtomically` eskaliert) gelöst** — Sektion 9.0 als eigenes Phase-V-Herzstück mit 6 Invarianten INV-WSA-1..6
- [x] **Schnüffler Rd. 5 #3 (Mounted-Guard) gelöst** — `isMountedRef` + `safeSetQaBusy` in A.6 Rev 5
- [x] **Schnüffler Rd. 6 #1 (Dialog-Lifecycle-Realität) gelöst** — A.6 Rev 6 dokumentiert: `SettingsPopup` bleibt via `AppFooter.tsx:433` dauerhaft gemountet, `open`-Prop ist nur visuell. `isMountedRef` bleibt als True-Unmount-Defense; zusätzlicher `openRef` wurde KISS/YAGNI-konform abgelehnt, Toast-nach-Close ist bewusste UX (Sonner-Portal global). Test #20 entsprechend realistisch umformuliert + #20b für echten Unmount-Fall ergänzt.
- [x] Scope-Validator-Kandidaten benannt (siehe 9.2)
- [x] Code-Zitate in 9.1 mit 100 % CONFI
- [x] Atomare IDB-Transaktion für Multi-Store-Writes spezifiziert
- [x] Directory-Picker-Fehlerklassen (`AbortError`, `SecurityError`) dispatched
- [ ] **Bei Umsetzung:** `npm run scope-check` + Tabellen 9.2/9.4 füllen
- [ ] **Bei Umsetzung:** INV-WSA-1..6 (Sektion 9.0) nachweisen

**→ STATUS: VALIDATED — READY FOR IMPLEMENTATION** (Architektur — Runde 5, Confidence 100 %). Finale Scope-Validator-Runs folgen im Umsetzungs-PR vor Merge.

---

## 10. Abschluss-Checkliste für Sonnet

- [ ] `npx tsc --noEmit` grün
- [ ] `'misc'` aus `AppFooter.tsx:23` ersatzlos entfernt, durch Import aus SettingsPopup ersetzt
- [ ] `useQaSamples`-Hook nutzt `isActive`-Guard in Cleanup
- [ ] IDB-Transaktion in `ingestDirectory` spannt **beide** Stores
- [ ] **Phase-V-Critical (Rd. 4): `writeSampleAtomically` enqueued `indexStore.put(...)` und `blobStore.put(...)` AUSSCHLIESSLICH im Terminal-Zweig `cur === null` des Cursor-`onsuccess`-Handlers.** Kein Put synchron neben `openCursor(...)`. Kein Put in einem Zweig mit `cur !== null`. Visueller Check: im endgültigen Code muss der erste `put`-Aufruf lexikalisch **innerhalb** des `else`- bzw. Terminal-Zweigs stehen, nach dem `return` des Delete-Zweigs.
- [ ] **Phase-V-Critical (Rd. 4): Streaming-Loop** — Keine Datei-ArrayBuffers werden in einem Vorab-Array (`samples[]` o.ä.) über mehrere Sub-Ordner hinweg gehalten. `files`/`blobRecords` werden **pro Sub-Ordner-Iteration** lokal deklariert und nach `await tx.oncomplete` aus dem Scope gelassen.
- [ ] **Phase-V-Critical (Rd. 4): Keyspace** — `BLOB_STORE` hat `keyPath: ['sampleId', 'fileName']`. `QaSampleBlob` enthält **kein** `key`-Feld. Alle `get()`-Aufrufe nutzen `[sampleId, fileName]` als Key, nie `${sampleId}::${fileName}`.
- [ ] **Phase-V-Critical (Rd. 4): Keine Upload-Vorab-Purge** — `ingestDirectory` ruft an keiner Stelle `deleteSample(sampleId)` als eigenständige Transaktion auf. Die einzige Purge-Form im Upload-Pfad ist die Cursor-Iteration innerhalb `writeSampleAtomically`.
- [ ] `features/INDEX.md` ergänzt
- [ ] I.md Sektion B geprüft (Vorschläge unten)
- [ ] C.md Sektion B geprüft
- [ ] S.md Sektion B geprüft

---

## 11. Neue Vorschläge für I.md / C.md / S.md

### C.B-Vorschlag (CONFI 95 %)
> **C.B-TA1 — Test-Arena-Silo:** `qaSamplesService` darf NICHT `runStore`, `runPersistenceService`, `fileStorageService`, `globalConfig` oder Workflow-Engine-Funktionen importieren. Bruch = Vermischung von Produktiv-Run-Daten und Test-Samples.

### I.B-Vorschlag (CONFI 95 %)
> **I.B-TA1 — Isolierte IDB für interne Tools:** Neue IDB-Stores für diagnostische/interne Tools nutzen eine **eigenständige** Datenbank (neuer `DB_NAME`). Kein Versions-Bump bestehender DBs (`falmec-receiptpro-files`, `falmec-receiptpro-runs`) für isolierte Features.

> **I.B-TA2 — IDB-Zwei-Store-Pattern für Blob-schwere Daten:** Wenn ein Store sowohl Metadaten (häufig gelistet) als auch Binär-Payloads (selten geladen) enthalten soll, MÜSSEN diese in getrennte Object-Stores innerhalb derselben DB gesplittet werden. Begründung: IDB hat keine Field-Projection → `getAll()` lädt immer alle Felder in RAM.

> **I.B-TA3 — IDB-Update-Atomizität:** Updates, die alte Records entfernen UND neue schreiben (Re-Upload-Pattern), MÜSSEN in EINER `db.transaction([...], 'readwrite')` stattfinden. Getrennte Transaktionen = Datenverlust-Risiko bei Fehlern zwischen den Phasen (z.B. Quota). Cursor-basierte Purge gehört in dieselbe Tx wie die Writes.

> **I.B-TA4 — IDB-Keys sind keine FS-Pfade:** IDB-Keys akzeptieren beliebige Strings (IDBValidKey). FS-Sanitization (`replace(/[^\w.-]/g, '_')`) darf **nicht** auf IDB-Keys angewendet werden — sie erzeugt stille Kollisionen. Sanitization gehört ausschließlich an die Grenze zum Dateisystem (Export-Pfade).

> **I.B-TA5 — Cursor-Delete-vor-Put-Sequenzierung:** Wenn eine Transaktion sowohl Cursor-basierte Deletes als auch anschließende `put`s enthält, müssen die `put`s **ausschließlich** im Terminal-Zweig (`cursor === null`) des `onsuccess`-Handlers enqueued werden. `put`s synchron neben `openCursor(...)` sind Race-Risiken: frisch geschriebene Records werden durch nachlaufende Cursor-Deletes entfernt.

> **I.B-TA6 — Streaming-Upload-Pattern für Blob-Bulk-Imports:** Bulk-Uploads mit N Dateien dürfen Daten **nicht** vorab in einem Array akkumulieren. Muster: FS-Read eines Items → IDB-Tx öffnen → `oncomplete` abwarten → Scope verlassen → GC **kann** reclaimen (nicht-deterministisch) → nächstes Item. Designziel: Peak-RAM ≈ O(max item), nicht O(Σ items). Kein Stück App-Code darf Referenzen länger als nötig halten.

> **I.B-TA7 — Array-Keys für zusammengesetzte IDB-Primary-Keys:** Compound-Keys (z.B. `[parentId, childName]`) SOLLEN als IDB-Array-Keys modelliert werden, nicht als String-Konkatenation mit Separator. Array-Keys sind spec-fest, escape-frei und immun gegen Separator-Kollisionen im Content.

### S.B-Vorschlag (CONFI 90 %)
> **S.B-TA1 — Async-Load-Hook-Pattern:** Komponenten mit Async-IDB-/Netzwerk-Loads MÜSSEN `isActive`-Sentinel (oder `AbortController`) im `useEffect`-Cleanup nutzen. Kein direktes `.then(setState)` mehr ohne Guard. Referenz-Pattern: `useQaSamples`.

> **S.B-TA2 — Listen-Container-Standard:** `rounded-md border border-border bg-white/50 p-2 space-y-2 overflow-y-auto max-h-[260px]` als Basis-Rahmen für scrollbare Listen-Container im Settings-Dialog.

> **S.B-TA3 — SSOT für UI-interne Union-Types:** Wenn ein Literal-Union (z.B. Tab-Keys) an mehr als einer Stelle genutzt wird, MUSS er aus **einem** Modul exportiert werden. Lokale Duplikate sind verboten.

---

## 12. Post-Audit-Cleanup (Rev 7 — 2026-04-22)

Das Post-Execution-Audit identifizierte drei handwerkliche Regressionen. Keine davon berührt die ACID- oder RAM-Architektur von `writeSampleAtomically` / Streaming-Loop — beide bleiben unverändert.

| # | Regression | Scope | Fix |
|---|---|---|---|
| R7-1 | `reloadQaSamples()` und `setClearQaConfirmOpen(false)` feuerten ungeschützt nach `await` → potenzielle State-Writes auf toten Baum bei True-Unmount. | `SettingsPopup.tsx` (handleUploadSamples, handleClearQa) | Generischer `ifMounted(fn)`-Helper ersetzt `safeSetQaBusy`. Jeder Post-Await-Side-Effect (State-Setter, Toasts, `reloadQaSamples`, `setClearQaConfirmOpen`) läuft durch den Guard. |
| R7-2 | IDB-`onerror`/`onabort`-Pfade in `loadAllSummaries`, `loadSample`, `deleteSample`, `clearAll` rejecteten die Promise **ohne** `db.close()` → Zombie-Connections. `ingestDirectory` schloss die DB nur bei Success-Pfad. | `qaSamplesService.ts` | `db.close()` ist jetzt auf ALLEN Exit-Pfaden (oncomplete **und** onerror **und** onabort) garantiert. `ingestDirectory` nutzt `try/finally` um die Loop herum — DB-Close auch bei unerwarteter Exception im FS-Read. |
| R7-3 | Zwei `any`-Casts in `SettingsPopup.tsx` (Directory-Picker-Call + Catch-Bindings). | `SettingsPopup.tsx` | `unknown`-Catches mit narrowing auf `{ name?, message? }`. Directory-Picker via `window as unknown as { showDirectoryPicker: (...) => Promise<FileSystemDirectoryHandle> }` — kein `any` mehr. |

**Nicht berührt:** `writeSampleAtomically` (INV-WSA-1..6 weiterhin Zeile für Zeile nachweisbar), Streaming-Loop pro Sample, Zwei-Store-Keyspace, `useQaSamples`-Hook. Die Cleanup-Runde ist rein defensiv.

**Compiler:** `npx tsc --noEmit` → EXIT 0.

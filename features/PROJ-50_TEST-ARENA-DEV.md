# PROJ-50-DEV — TEST-ARENA-BRÜCKE (Block C)

**Status:** PLANNED — READY FOR IMPLEMENTATION (Härtungsrunden 1-17 abgeschlossen, **Rd17 = 2 Mikro-SSOT-Fixes: (1) §8 Reihenfolge-Punkt 10 + §9.5 + §10 Checkliste tsc-Aussage widerspruchsfrei auf Commit-Block-Logik mit atomarer Klammer 2-3-4 konsolidiert, (2) letzter `UploadedFileLike`-Rest in §15.1 S2 als HISTORISCH aufgelöst. Keine Architektur-/Code-Änderung.**, Confidence 99 %)
**Rd6-Scope (ergänzend zu Rd5):** (1) UI-Legende „Sample Regex" im Test-Arena-Tab, (2) Architektur-Begründung „Hinterzimmer" — Parameter statt Store-Flag, (3) Stack-Cleanup-Invariante C.6-INV-1 (Leichenfreiheit des Hinterzimmers), (4) formale Silo-Zertifizierung mit Durchstich-Inventur (§13).
**Rd7-Scope (NO-GO-Fix nach Schnüffler, ersetzt naive Rd6-Annahmen):** (1) explizite `useNavigate`-Integration — Engine triggert **kein** Auto-Routing, (2) Active-Run-Guard entschärft (nur echte Gefahrenzustände: `isProcessing`/running-Step/`isPaused`/`isWaitingBeforeStep4` — NICHT `soft-fail`/`failed`), (3) Doku-`.md`-Universal-Collector für unbekannte Ordner, (4) Audit-Regeln semantisch robust (Allow-List + präzise Negative-Greps statt naiver Text-Suche), (5) sicherer Präfix (Rd7: `QA_TEST_…_`, in Rd9 durch KISS-Form `QA-…` ersetzt — siehe Rd9-Scope) + Invariante C.7-INV-1 gegen Regex-Kanonisierungs-Bruch in Vergleichspunkten (CIRCUIT A12/A13).
> **⚠ RÜCKBLICK — HISTORISCH, NICHT UMSETZEN:** Die folgenden Rd-Scope-Einträge (Rd9, Rd10, Rd11, Rd12, Rd13, Rd14) dokumentieren die Evolution. Sie enthalten frühere Präfix-Formen (`replaceAll(' ', '_')`), die unter `tsconfig.app.json` `target: ES2020` NICHT kompilieren. **Aktive Rd15-Form ist ausschließlich** `const qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\``. Sonnet ignoriert alle `replaceAll`-Zitate unterhalb und nutzt die Rd15-Konstante aus §7 C.2.6.

**Rd9-Scope (Lead-Dev-Direktive — drei zwingende Fixes, ersetzt naive Rd5/Rd7-Annahmen):**
  1. **User-Choice-Popup statt Hard-Block (ersetzt Rd5/Chef-Fix 1):** Der Active-Run-Guard darf den „Testlauf starten"-Button NICHT mehr hart disablen. Stattdessen zeigt er bei aktivem Produktivlauf einen sekundären AlertDialog mit zwei Choices: „ABBRECHEN" (Default) und „OK — Produktivlauf überschreiben". Nur bei „OK" feuert der Dispatch.
  2. **QA-README-Ordner als Sichtfenster-Quelle (erweitert §7 C.2.1 + §7 C.1.4):** Die Ordner-Matrix `classifyCategoryFolder` erhält einen zusätzlichen festen Eintrag `QA-README`. Die `.md`-Datei in diesem Unterordner ist der **verbindliche** Soll-Kontrakt, der beim Öffnen des Sichtfensters angezeigt wird. `resolveReadmeBody` gewichtet sie höher als jede andere `expected.md`/`README.md`-Heuristik.
  3. **KISS-Präfix `QA-${sampleId}` (ersetzt Rd7/Chef-Fix 5 `QA_TEST_…_`):** Die Hinterzimmer-ID folgt der gleichen Run-ID-Regex-Kanonisierung wie produktive Fattura-Nummern — der einzige Zusatz ist ein vorangestelltes literales `QA-`. Das hält `replace(/\D/g, '').slice(-5)` in CIRCUIT A12/A13 korrekt (kein Ziffernzwang durch „_TEST_"), markiert den Run trotzdem eindeutig als QA und hält den Parser-Pfad für die Rechnungsnummer reibungsfrei.

**Rd10-Scope (Lead-Dev-Direktive — 3 Korrekturen + 1 Saniturings-Sektion, präzisiert Rd9):**
  1. **Active-Run-Guard: Hard-Block UND User-Choice, nicht „oder" (präzisiert Rd9/Lead-Dev-Fix 1):** Rd9 warf beide Zustände in einen Topf. Rd10 trennt sie sauber:
     - **Hard-Block** bei echt laufender Engine (`isProcessing === true` ODER `isPaused === true` ODER `isWaitingBeforeStep4 === true` ODER `run.status === 'running'` mit mindestens einem Step `running`). „Testlauf starten"-Klick zeigt dann einen erklärenden Toast (`'Engine rechnet gerade — QA-Testlauf blockiert. Bitte warten oder pausieren.'`), der Dispatch wird NICHT ausgeführt. Defensiv — schützt vor Daten-Kollisionen in Phase 1/2.
     - **User-Choice** bei verbliebenen Workflow-Daten ohne laufende Engine (`currentRun != null` UND keiner der Hard-Block-Zustände, inkl. `soft-fail`/`failed`/`ok` mit Rest-Daten): „Es befindet sich noch ein Lauf im Workflow. Soll dieser überschrieben werden?" mit Buttons „ABBRECHEN" / „OK — Produktivlauf überschreiben". Nur bei „OK" feuert der Dispatch, und er überschreibt den Workflow bewusst.
     - **Sofort-Dispatch** wenn `currentRun === null` UND keine Hard-Block-Zustände — Standardweg.
  2. **`QA-README` ist PFLICHT, nicht mehr „optional-prioritär":** Ein Sample ohne Unterordner `QA-README/` mit mindestens einer `.md`-Datei wird vom Sichtfenster mit einer klaren Fehlermeldung abgewiesen (`'Sample ohne QA-README-Ordner — Soll-Kontrakt fehlt'`), UND der „Testlauf starten"-Button bleibt disabled bis der Soll-Kontrakt vorliegt. Das erzwingt Disziplin bei der Sample-Erstellung.
  3. **Leerzeichen-Sanitization im Präfix (HISTORISCHE Zwischenform — Rd15 final):** Historisch-gemeint war `customRunTitle = \`QA-${sampleId.trim().replaceAll(' ', '_')}\`` mit `trim()` zuerst, dann Space→Underscore-Replace. **(HISTORISCH - NICHT UMSETZEN: `replaceAll` ist ES2021 und bricht unter ES2020-Lib.)** Aktive Rd15-Form: `const qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\``. Siehe §7 C.2.6 und Rd15-Scope oben.
  4. **„Phrasen zur Löschung vorgesehen" (neue §19):** Eine finale Prüf-Sektion listet alle Legacy-Phrasen auf, die beim Umsetzen restlos aus der Codebasis verschwinden müssen — siehe §19. **Der Coder-LLM grept diese Phrasen vor dem Merge.**

**Rd15-Scope (ES2020-Kompatibilität + SSOT-Singleton — fremdvorgeschlagener Hartfix nach vier stumpfen Härtungsrunden):**
  1. **`replaceAll` ist ES2021 — Projekt kompiliert auf ES2020 (harter Compile-Fehler):** `tsconfig.app.json` setzt `"target": "ES2020"` + `"lib": ["ES2020", "DOM", "DOM.Iterable"]`. `String.prototype.replaceAll` wurde erst in ES2021 aufgenommen — unter dieser TS-Konfiguration wirft der Compiler `TS2339: Property 'replaceAll' does not exist on type 'string'`. Die Rd11–Rd14-SSOT `sampleId.trim().replaceAll(' ', '_')` hätte Sonnet beim ersten `npx tsc --noEmit`-Lauf sofort scheitern lassen. **Rd15-Fix:** globaler Austausch auf die ES2020-sichere Form `sampleId.trim().split(' ').join('_')` — reine String/Array-Primitives seit ES1, kein Lib-Bump, kein Regex, KISS-konform.
  2. **Einzige Prefix-Konstante `qaRunPrefix` als SSOT (statt verstreuter Template-Literale):** Die Vollform `\`QA-${sampleId.trim().split(' ').join('_')}\`` darf im gesamten Code exakt EIN Mal als `const qaRunPrefix` konstruiert werden — im Handler `handleStartSampleTestRun` (§7 C.2.6). Jede zweite Konstruktion, jedes Template-Literal in einer anderen Datei, jedes Copy-Paste in einem Test = Merge-Blocker. Vorher standen die Vollformen verteilt in §7 C.2.6, §9.0 C.7-INV-1, Test C9, Test C26 — alle als Regel/Beispiel formuliert. Rd15 zieht das auf eine Konstante zusammen; die Invarianten/Tests referenzieren künftig `qaRunPrefix` als Symbolwert.
  3. **Erweiterte §19-Grep-Liste als Merge-Blocker (drei harte Pattern):**
      ```bash
      rg "replaceAll\(' ', '_'\)"                                src features/PROJ-50_TEST-ARENA-DEV.md
      rg "\\$\\{customRunTitle\\} \\|"                          src features/PROJ-50_TEST-ARENA-DEV.md
      rg "QA_TEST_|\[QA\]|isProductiveRunActive|Engine-Auto-Render|bewusst KEIN useNavigate"  src
      ```
      In `src/` müssen alle drei Patterns 0 Treffer liefern. In der Plandatei nur in klar markierten historischen oder Negativ-Grep-Abschnitten.
  4. **`npx tsc --noEmit` als explizite Pflicht nach Einführung von `qaRunPrefix`:** Steht bereits in der Abschluss-Routine, bekommt in Rd15 einen dedizierten Schritt in §8 Reihenfolge (direkt nach der Handler-Änderung).
  5. **Plan auf „keine alternativen Code-Snippets" bereinigt:** Jede Prefix-Erwähnung verweist auf `qaRunPrefix` (die Konstante), nicht mehr auf eine wiederholte Vollform. Zweck: Sonnet findet beim Copy-Paste immer dieselbe Zeile.
  6. **Confidence-Formulierung ehrlich halten:** Der Plan nennt Confidence 99 % (kein Blocker mehr bekannt), deklariert aber explizit, dass Radix/IDB/Browser-Verhalten bei realen Sample-Daten stets ein Restrisiko tragen. „100 %" ist bei Code nie ehrlich — der Plan vermeidet diese Formulierung.

**Ehrlichkeits-Eintrag:** Der Planer (Opus 4.7) hat in vier aufeinanderfolgenden Härtungsrunden (Rd11, Rd12, Rd13, Rd14) `replaceAll(' ', '_')` zur Top-Anweisung erhoben, Fallstricke formuliert, §19-Greps definiert — und nie gegen `tsconfig.app.json` verifiziert. Der Vorschlag kam extern und war in Punkt 1 objektiv überlegen. Der Plan hält das als Lernhistorie fest, um den gleichen Blinde-Fleck-Mechanismus künftig zu vermeiden.

**Rd13-Scope (redaktionelle SSOT-Rettung — drei tödliche Fallen für Sonnet, keine Architektur-Änderung):**
  1. **Fallstrick 16 in §18.1 war lebensgefährlich falsch:** Rev 11/12 schrieben in §18.1 Fallstrick 16 wörtlich „Reihenfolge beim Präfix: zuerst `replaceAll`, dann `trim`" — das ist das EXAKTE GEGENTEIL der korrekten Rd11-Form. Sonnet hätte diesen Fallstrick blind übernommen. **Rd13-Fix:** Fallstrick 16 komplett überschrieben mit einer glasklaren Version („ZUERST `trim()`, DANN `replaceAll(' ', '_')`"). Siehe §18.1.
  2. **Impact-Matrix Rd10/Lead-Dev-Fix 3 enthielt die Rd10-Bug-Form:** Die SOLL-Spalte wies `sampleId.replaceAll(' ', '_').trim()` als aktive Anweisung aus. **Rd13-Fix:** auf `sampleId.trim().replaceAll(' ', '_')` korrigiert, explizit mit Rd11-Korrektur-Label versehen.
  3. **Legacy-Begriffe waren unsauber markiert:** In §2 Impact-Matrix-Rd6-Zeile, §7 C.1.3.1 Idempotenz-Bullet, §7 C.2.6 Rd9-Bullet, §7 C.2.7-Intro und §18.1 Fallstrick 5 standen alte Bezeichner (`isProductiveRunActiveNow`, `[QA] - …`, `QA_TEST_`) ohne deutliche Markierung — Sonnet hätte sie als aktive Anweisung lesen können. **Rd13-Fix:** jedes Vorkommen mit `(HISTORISCH - NICHT UMSETZEN)` getaggt. Zusätzlich erhalten §§12, 15, 17 je ein Rückblick-Banner als Kopfzeile.

**Rd12-Scope (redaktionelle SSOT-Blocker, keine Architektur-Änderung — nur physische Bereinigung):**
  1. **Pipe-Separator-Leiche in §5 Pfad C.3:** Das Pseudocode-Snippet unter „Pfad C.3 — customRunTitle-Schleife" trug weiterhin `fattura: \`${customRunTitle} | ${r.invoice.fattura}\``. Das bricht die Rd9-Vorgabe „ohne Separator" frontal. **Rd12-Fix:** physisch auf `fattura: \`${trimmedTitle}${r.invoice.fattura}\`` umgeschrieben — identisch zum bereits korrekten §7 C.3.2 Patch.
  2. **Trim-Reihenfolge in C.7-INV-1 + §19:** Die Rd10-Bug-Form `sampleId.replaceAll(' ', '_').trim()` stand noch in Invarianten- und Löschungs-Listen-Texten. **Rd12-Fix:** jedes Vorkommen auf `sampleId.trim().replaceAll(' ', '_')` korrigiert. Kanten-Trim zuerst, dann interne Leerzeichen ersetzen — siehe Rd11-Scope Punkt 2 und §18 Fallstrick 20.
  3. **Veralteter Sammel-Selektor in C.7-INV-2:** Die Invariante referenzierte noch `isProductiveRunActive`. Rd11 hat den Selektor in `isEngineBusy` + `hasIdleWorkflowData` gespalten; der Zombie-Guard (`cr.status !== 'running' → return false`) sitzt in `isEngineBusy`. **Rd12-Fix:** C.7-INV-2-Text und Phase-V-Prüfung explizit auf `isEngineBusy` umgeschrieben.
  4. **Rigoroses Produktiv-Text-Cleanup §§1–18 (YAGNI):** Alle verbliebenen produktiven Erwähnungen von `QA_TEST_`, `[QA] - {sampleName}`, alter Pipe-Separatoren und `isProductiveRunActive` physisch entfernt — außer in expliziten Rückblick-Sektionen (§12.4 Rd4, §15 Rd7, §17.1-§17.7 Rd-Zusammenfassungen). Durchgestrichene Notizen werden ersatzlos gelöscht; die Lernhistorie bleibt in den Rückblick-Sektionen greifbar. §19 ist das Pre-Merge-Grep-Werkzeug, keine Architektur-Aussage.

**Rd11-Scope (Schnüffler-Blocker, Confidence-erhaltende Pflicht-Korrekturen, präzisiert Rd10):**
  1. **Radix-`AlertDialogAction`-Auto-Close entschärfen (kritisch, UI-Regression):** `AlertDialogAction` schließt den Dialog beim Klick automatisch — das ist Radix-Default. Wenn der `onClick` nur einen Toast zeigt (Branch 1) oder den sekundären `OverwriteActiveRunDialog` öffnet (Branch 2), würde das Soll-Sichtfenster unerwartet verschwinden bzw. die beiden Dialoge gleichzeitig kollidieren. **Rd11-Fix:** `e.preventDefault()` als erste Anweisung im `onClick` für Branch 1 und Branch 2. Branch 3 (Sofort-Dispatch) benötigt kein `preventDefault`, da `handleStartSampleTestRun` das Sichtfenster ohnehin früh über `setSampleDetailDialogOpen(false)` schließt — Radix-Default-Close ist dort redundant, aber harmlos.
  2. **Trim-Reihenfolge korrigieren (HISTORISCHE Rd11-Zwischenlösung — Rd15 hat sowohl Methode als auch Reihenfolge final gemacht):** Historischer Rd10-Bug `sampleId.replaceAll(' ', '_').trim()` ist logisch falsch — `trim()` entfernt niemals Underscores. **Rd11-Fix (HISTORISCH - NICHT UMSETZEN; `replaceAll` ist ES2021, Compile-Blocker unter ES2020-Lib):** `sampleId.trim().replaceAll(' ', '_')`. **Rd15-Form (AKTIV, UMSETZEN):** `sampleId.trim().split(' ').join('_')`. Reihenfolge-Argumentation bleibt gültig: trim VOR Space→Underscore — split ersetzt replaceAll, weil ES2020-kompatibel.
  3. **Hook-Dependency-Array vervollständigen (React-Hook-Lint-Bug):** Der `useCallback` für `handleStartSampleTestRun` nutzt `navigate` (Rd7/Chef-Fix 1), hatte aber bisher nur `[ifMounted, onOpenChange]` im Dep-Array. Das ist ein React-Hooks-exhaustive-deps-Verstoß und eine echte Stale-Closure-Gefahr, wenn der Router-Kontext seinen `navigate`-Handler zwischen Renders austauscht. **Rd11-Fix:** Dep-Array korrekt ergänzen zu `[ifMounted, onOpenChange, navigate]`.
  4. **V1-Legacy-Break (architektonische Konsolidierung nach Rd10/Fix 2):** Rd10 hat `QA-README` zur Pflicht gemacht. Rd10-Test C18 behauptete aber weiter, „flache V1-Samples bleiben lauffähig" — direkter Widerspruch. **Rd11-Fix:** Test C18 wird gelöscht (durch neue Legacy-Break-Dokumentation ersetzt) und ein expliziter Migration-Hinweis aufgenommen: Bestehende V1-Samples ohne `QA-README/`-Unterordner können im Sichtfenster zur Anzeige geöffnet werden, aber der „Testlauf starten"-Button bleibt disabled, bis der Tester den Soll-Kontrakt in `QA-README/` nachträgt. **Dom bestätigt das als bewussten Legacy-Break** (Big-Picture: Revisionssicherheit > Rückwärtskompatibilität).
  5. **Physische SSOT-Bereinigung der Produktiv-Abschnitte (nicht nur §19-Liste):** Die §19-Löschungs-Checkliste allein reicht nicht — wenn Legacy-Phrasen in §§1–18 produktiv stehenbleiben, liest der Coder sie als Anweisung. **Rd11-Fix:** Alle Rd9/Rd5-Legacy-Formulierungen (`Engine-Auto-Render`, `bewusst KEIN useNavigate`, Pipe-Separator `|` zwischen Präfix und Fattura, `QA_TEST_` in Konstruktions-/Kommentar-Kontexten) werden aus den produktiven §§1–18 physisch entfernt oder als explizit historisch markiert. Die §19-Liste bleibt als Pre-Merge-Grep-Werkzeug erhalten; historische Rückblicke (§12.4 Rd4, §15 Rd7, §17.1) dürfen Legacy zitieren, müssen aber als Legacy markiert sein.
**Datum:** 2026-04-22
**Basis:** `features/PROJ-50_TEST-ARENA.md` (V1 DONE) — Block A/B/D integriert, IDB-Silo operativ.
**Scope (reine Brücke, kein V1-Rebuild):**
- `src/components/SettingsPopup.tsx` — Click-Handler auf `QaSampleCard`, neuer AlertDialog „Soll-Sichtfenster", neuer „Testlauf starten"-Button, erweiterte Click-Propagation.
- `src/services/qaSamplesService.ts` — neue reine Funktion `prepareFilesForIngest(sampleId)` + Type `QaSampleUploadSet`. **Keine** Änderung an `writeSampleAtomically` / Streaming-Loop (ACID-Kern bleibt intakt).
- `src/store/slices/ingestSlice.ts` — optionaler dritter Parameter `customRunTitle?: string` an `parseInvoiceForIngest`. Nicht-invasiv: nur am Ende einen Fattura-Präfix-Patch.
- `src/store/types.ts` (Signatur-Update) — `parseInvoiceForIngest`-Signatur um `customRunTitle?: string` erweitern.
- `src/services/qaSamplesService.ts` — `ingestDirectory`: **optionaler 2-Ebenen-Sub-Scan** (Kategorie-Ordner) rückwärtskompatibel; sampleId bleibt unverändert auf Ebene 1. Bestehende flache Ordnerstrukturen funktionieren weiter.

**Auslöser (aus Auftrag):** Die V1-Giftküche kann Samples nur lagern. Block C macht daraus eine aktive Test-Brücke:
1. **C.1 Soll-Sichtfenster** — LLM (und User) sieht beim „Testlauf" zuerst die `README.md` / `expected.md` des Samples (Soll-Kontrakt für das LLM).
2. **C.2 Ingest-Injektion** — IDB-Blobs werden zu echten `UploadedFile`-Objekten rekonstruiert und in den produktiven Phase-1-Flow gepusht — ohne `processFiles` (bzw. `parseInvoiceForIngest`/`ingestAndPersistRunData`) zu verbiegen.
3. **C.3 Custom-Run-Title** — Run wird mit dem KISS-Präfix `QA-${sampleId}` markiert (Rd9 — keine Sonderzeichen, keine Pipe, kein `[…]`), ohne die Core-ID-Generation zu verbiegen.

**KISS/YAGNI-Disziplin:** Keine neuen Hooks, keine State-Maschinen, kein Refactoring der Engine. Die Brücke ist ein lineares „load→reconstruct→inject"-Adapter-Skript mit einer UI-Klammer drumherum.

---

## 0. Codewahrheit-Baseline (CONFI 100 %, Zeilen-verifiziert 2026-04-22)

| # | Behauptung | Datei:Zeile | Aktueller Code | CONFI |
|---|---|---|---|---|
| 1 | `QaSampleCard` hat KEINEN Click-Handler | `src/components/SettingsPopup.tsx:139-157` | Reine Anzeige: `folderName`, Badges `f.kind · size`, `description` | 100 % |
| 2 | `qaSamplesService.loadSample(id)` liefert `{ index, blobs }` bereits | `src/services/qaSamplesService.ts:255-296` | Bestehend, liest beide Stores in einer RO-Tx, inkl. `db.close()` auf allen Exits | 100 % |
| 3 | `QaSampleBlob` enthält `data: ArrayBuffer` und `fileName` | `src/services/qaSamplesService.ts:35-41` | Felder vollständig | 100 % |
| 4 | `md`-Dateien werden als kind=`'md'` gespeichert | `src/services/qaSamplesService.ts:71-77` | `classify()` — `.md` → `'md'`, Rest → `'other'` (skip) | 100 % |
| 5 | `parseMarkdownDescription` liest NUR ersten Heading (trunc. 400) | `src/services/qaSamplesService.ts:79-95` | Es wird also NUR die Description, nicht der gesamte MD-Body gespeichert — für Block C.1 müssen wir den MD-Blob zur Laufzeit decodieren | 100 % |
| 6 | `parseInvoiceForIngest(runId, fileSnapshot)` — 2 Parameter | `src/store/slices/ingestSlice.ts:290-321` | Signatur ist heute `(runId, fileSnapshot)` → returns `Promise<string>` (finalRunId) | 100 % |
| 7 | `updateRunWithParsedData` überschreibt `run.invoice.fattura` aus Parser | `src/store/slices/runCrudSlice.ts:530-608` | Zeile 569: `invoice: { ...invoiceHeader, ... }` — `customRunTitle` MUSS NACH diesem Write gesetzt werden, sonst wird er überschrieben | 100 % |
| 8 | `generateRunId` baut die RunID aus `fatturaNumber` + Timestamp | `src/services/invoiceParserService.ts:324-333` | `Fattura-${fatturaNumber.trim()}-YYYYMMDD-HHMMSS` — KEINE Änderung am ID-Generator (zu invasiv) | 100 % |
| 9 | `ingestAndPersistRunData(runId, fileSnapshot)` liest ausschließlich `fileSnapshot`, NICHT `state.uploadedFiles` | `src/store/slices/ingestSlice.ts:329-520` | FileSnapshot-Kopier-Semantik: dokumentiert als Invariante (Zeilen 7-20). Unser Caller-Pattern MUSS dieses Kontrakt einhalten | 100 % |
| 10 | `FileSnapshot` hat 4 optionale Einträge: `invoice`/`articleList`/`serialList`/`openWE` | `src/pages/NewRun.tsx:71-76` | Reference-Pattern: `fileSnapshot = { invoice, articleList, serialList, openWE }` — jedes ist `UploadedFile \| undefined` | 100 % |
| 11 | `UploadedFile.type`-Union hat exakt 4 Werte | `src/types/index.ts:417-424` | `'invoice' \| 'openWE' \| 'serialList' \| 'articleList'` — mehr gibt es nicht | 100 % |
| 12 | `renameRun(runId, newRunId)` ist atomar (IDB + Store + Logs) | `src/store/slices/ingestSlice.ts:309-313` (Kommentar) | Pattern: `parseInvoiceForIngest` ruft `renameRun` intern. `customRunTitle` darf das **nicht** stören | 100 % |
| 13 | `addUploadedFile` triggert Seiteneffekte (masterData-Parse, serialFinder, fileStorageService.saveFile) | `src/store/slices/ingestSlice.ts:89-182` | **Gefahr:** Wenn der QA-Adapter `addUploadedFile` nutzt, würden diese Side-Effects alle feuern → Pollution der Produktions-DB. Die Brücke MUSS daher `fileSnapshot` direkt an `parseInvoiceForIngest`/`ingestAndPersistRunData` übergeben und den Umweg über `uploadedFiles`/`addUploadedFile` komplett **vermeiden** (siehe C.2.3) | 100 % |
| 14 | `startNewRun`-Kette: `createRunSkeleton → parseInvoiceForIngest → ingestAndPersistRunData → startWorkflowPhase2` | `src/pages/NewRun.tsx:70-95` | Exakt dieser Ablauf ist unser Injektionsziel. Wir klonen ihn, ersetzen nur den Snapshot-Provider | 100 % |
| 15 | `fileStorageService.isAvailable()`/`saveFile` schreibt in `falmec-receiptpro-files` DB (separate DB) | siehe Basis-Datei Sektion 2 | Unser QA-Adapter darf diese DB NICHT beschreiben — sonst vermischt sich QA-Input mit echten User-Uploads | 100 % |

---

## 1. Problemanalyse

V1 hat die Giftküche gebaut: Samples liegen sicher in `falmec-receiptpro-qa-samples` (Zwei-Store-Split). V2 (Block C) muss drei Hebel nachrüsten:

1. **Soll-Sichtfenster (C.1):** `QaSampleCard` ist heute statisch. Der Tester (und das LLM, das im nächsten Schritt das Ergebnis prüft) braucht VOR dem Schuss eine klare Sicht auf den erwarteten Output. Die `README.md` / `expected.md` ist der Soll-Kontrakt. V1 hat nur die erste Heading-Zeile in `description` gespeichert — der volle MD-Body liegt im BLOB-Store (kind=`'md'`).
2. **Ingest-Injektion (C.2):** Aus IDB-Blobs müssen echte `File`-Instanzen werden. `fileStorageService.loadAllFiles()` zeigt das Muster (`new File([blob], fileName)`). Die rekonstruierten Files müssen mit ihren Typen (`invoice`/`openWE`/`serialList`/`articleList`) zu einem `FileSnapshot` zusammengefasst werden — kompatibel zu `parseInvoiceForIngest`. **Null-Invasion** in Produktivcode: kein `addUploadedFile`, kein Umweg über `state.uploadedFiles`, keine Änderung an `ingestAndPersistRunData`.
3. **Run-Naming (C.3):** Heute überschreibt `updateRunWithParsedData` das `invoice.fattura`-Feld aus dem Parser-Resultat. Wir wollen (Rd9) ein **KISS-Label `QA-${sampleId}`** anheften — ohne `generateRunId` anzufassen und ohne eine neue Run-Eigenschaft einzuführen. Die einzige zulässige KISS-Lösung: nach dem Parser-Write das `fattura`-Feld als Präfix patchen (`"QA-" + sampleId + fattura` — **ohne Separator, ohne Pipe, ohne Leerzeichen**). Damit bleibt `replace(/\D/g, '').slice(-5)` an CIRCUIT-A12/A13-Vergleichspunkten unverfälscht, und der Parser behandelt die Rechnungsnummer weiterhin wie in einem echten Produktivlauf.

---

## 2. Impact-Matrix

| Änderung | Betroffene Funktion | Datei:Zeile (SOLL) | Risiko wenn vergessen |
|---|---|---|---|
| `QaSampleCard` klickbar + Prop `onClick` | `QaSampleCard({ sample })` | `src/components/SettingsPopup.tsx:139-157` | UI tut nichts beim Klick |
| Neuer State `selectedSampleId`, `sampleDetail`, `sampleDetailLoading`, `sampleDetailDialogOpen` | SettingsPopup-Komponente | `src/components/SettingsPopup.tsx:380-452` (Test-Arena-Block) | AlertDialog nicht steuerbar |
| Neuer Handler `handleOpenSampleDetail(sampleId)` | SettingsPopup | `src/components/SettingsPopup.tsx` (Test-Arena-Block) | Kein Detail-Load |
| Neuer Handler `handleStartSampleTestRun(sampleId)` | SettingsPopup | `src/components/SettingsPopup.tsx` (Test-Arena-Block) | Kein Test-Schuss |
| Neuer AlertDialog „Soll-Sichtfenster" | SettingsPopup-Render | `src/components/SettingsPopup.tsx` (Test-Arena-Block, ggf. am Ende des Tabs) | Kein README-Preview |
| Neue Funktion `prepareFilesForIngest(sampleId)` | qaSamplesService (API-Ergänzung) | `src/services/qaSamplesService.ts:365-373` (Export-Objekt erweitern) | Keine Brücke zwischen IDB und Ingest |
| Neuer Typ `QaSampleUploadSet` | qaSamplesService (Typ-Export) | `src/services/qaSamplesService.ts:44-49` (nach `QaSampleSummary`) | Downstream-Caller ohne Typ |
| Neuer optionaler 3. Parameter `customRunTitle?: string` | `parseInvoiceForIngest` | `src/store/slices/ingestSlice.ts:290-321` | `[QA]`-Label nicht sichtbar |
| Signatur-Update im Typ | `parseInvoiceForIngest` | `src/store/types.ts` (Typ-Definition der Action) | TS-Fehler |
| **Optional** verschachteltes Sub-Dir-Scanning | `ingestDirectory` / Helper `classifyCategoryFolder` | `src/services/qaSamplesService.ts:134-223` | 2-Ebenen-Upload klappt nicht; 1-Ebene bleibt unverändert |
| **Rd5/Chef-Fix 1 — Active-Run-Guard** (~~reaktiver Selector + Hart-Block~~ **Rd9: User-Choice-Popup**) | SettingsPopup + zweiter AlertDialog (Confirm-Overwrite) | `src/components/SettingsPopup.tsx` (Test-Arena-Block + Soll-Sichtfenster-Footer + neuer `OverwriteActiveRunDialog`) | QA-Run killt ungespeicherten Produktiv-Run via `createRunSkeleton → resetRunSensitiveState` |
| ~~**Rd9/Lead-Dev-Fix 1 — User-Choice-Popup**~~ **→ Rd10 in Hard-Block + User-Choice gespalten** | Zwei disjunkte Selektoren (`isEngineBusy`, `hasIdleWorkflowData`) + Drei-Branch-`onClick` (Toast / Dialog / direkt) | `src/components/SettingsPopup.tsx` (Test-Arena-Block) | Rd9 hatte beide Fälle zusammengemischt → bei echt laufender Engine hätte der User fälschlich „überschreiben" klicken können → Daten-Kollision. Rd10-Fix: Engine-Busy = Hard-Block-Toast, Idle-Workflow-Data = User-Choice-Dialog. |
| **Rd10/Lead-Dev-Fix 1 — Guard-Split** | neue Selektoren `isEngineBusy` + `hasIdleWorkflowData` (disjunkt), `onClick`-Drei-Weg-Verteilung (Branch 1 Toast, Branch 2 Dialog, Branch 3 Direkt) | `src/components/SettingsPopup.tsx` §C.2.7 + §C.1.3 | Rd9-Vermischung hätte bei laufender Engine den User-Choice-Dialog gezeigt, dessen „OK" den aktiven Run zerstört hätte. Rd10: Echt laufende Engine ist nicht verhandelbar (Toast), nur Idle-Reste sind User-Entscheidung. |
| **Rd9/Lead-Dev-Fix 2 — `QA-README`-Ordner in Whitelist + Priorität in `resolveReadmeBody`** | `classifyCategoryFolder` Zusatz-Branch + `resolveReadmeBody` bevorzugt Blobs mit Pfad-Präfix `QA-README/` | `src/services/qaSamplesService.ts` + `src/components/SettingsPopup.tsx` | Ohne festen Ordner-Anker wäre der „erwartete" README-Inhalt nicht deterministisch auffindbar → Sichtfenster zeigt möglicherweise eine Doku-Notiz statt des Soll-Kontrakts |
| **Rd10/Lead-Dev-Fix 2 — `QA-README` ist PFLICHT** | neues `hasQaReadme`-Memo + disabled-Branch + UI-Warnblock + Defense-in-Depth-Abweisung in `prepareFilesForIngest` | `src/components/SettingsPopup.tsx` §C.1.3.2 + `src/services/qaSamplesService.ts` §C.2.3 | Ohne Pflicht hätte ein Tester ein Sample ohne Soll-Kontrakt laufen lassen können → Test ohne Referenz, wertlos. Rd10-Fix macht den Ordner zur Upload-Disziplin-Pflicht. |
| **Rd9/Lead-Dev-Fix 3 — KISS-Präfix `QA-${sampleId}`** (ersetzt Rd7 `QA_TEST_…_`) | Konstruktion in `handleStartSampleTestRun` + Patch-Concat in `ingestSlice.ts` C.3.2 | `src/components/SettingsPopup.tsx` + `src/store/slices/ingestSlice.ts` | Rd7-Formel hatte zusätzlich Ziffern (`_TEST_` → keine, aber sanitize-Underscores erzeugten Leerraum zu Unterstrichen) + war schwer zu lesen; Rd9: minimale 3-Zeichen-Markierung (`QA-`), folgt exakt der Run-ID-Regex-Form, bricht keine `replace(/\D/g, '').slice(-5)`-Kanonisierung |
| **Rd15 — Space-Sanitization als `qaRunPrefix`-SSOT-Konstante (ersetzt Rd10-Rd14-Formen)** | `const qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\`` genau EINMAL im Handler — keine zweite Konstruktion, keine Template-Literal-Wiederholung | `src/components/SettingsPopup.tsx` §C.2.6 (Konstruktion) | Rd9 vertraute pauschal auf „IDB-sicher", ließ aber Leerzeichen durch; Rd11–Rd14 korrigierten die Reihenfolge, setzten aber `replaceAll` (ES2021) — das bricht unter `tsconfig.app.json` `target: ES2020` mit `TS2339`. Rd15: `split(' ').join('_')` ist seit ES1 verfügbar, funktioniert unter ES2020. *(HISTORISCH - NICHT UMSETZEN: `sampleId.trim().replaceAll(' ', '_')` aus Rd11–Rd14 — siehe §19 L4c.)* |
| **Rd5/Chef-Fix 2 — MasterData-Warnblock** (sichtbar im AlertDialog) | AlertDialogContent | `src/components/SettingsPopup.tsx` (AlertDialog-Body, über Footer) | User lädt nach QA-Run Produktivdaten ohne aktuelle Artikelliste → falsches Matching |
| **Rd5/Chef-Fix 3 — fileName-Pfad-Präfix** (Kategorie/basename) + `QaSampleFileMeta.basename` Pflichtfeld | `ingestDirectory` Phase 1 + `prepareFilesForIngest` + `resolveReadmeBody` | `src/services/qaSamplesService.ts` + `src/components/SettingsPopup.tsx` | IDB-Key-Kollision `[sampleId, 'data.xlsx']` bei 2 Kategorien → stiller Datenverlust |
| **Rd5/Chef-Fix 4 — FileSnapshot-struktur-kompat** (Snapshot-Keys required mit `\| undefined`) | `QaSampleUploadSet` + `prepareFilesForIngest` | `src/services/qaSamplesService.ts` | TS-Fehler: `snapshot` nicht assignable an `FileSnapshot` |
| **Rd6/Chef-Fix 1 — UI-Legende „Sample Regex"** | neue `SampleRegexLegendDialog` + FooterButton-Trigger | `src/components/SettingsPopup.tsx` (Sektion 2 „Testdaten schicken") | Tester weiß nicht, wie die Ordner benannt sein müssen → stilles Leerlaufen des Scans (Ordner ignoriert) |
| **Rd6/Chef-Fix 2 — „Hinterzimmer"-Architektur-Begründung** (Parameter statt Store-Flag) | Doku-Sektion §7 C.3.0 | Plandatei (keine Code-Auswirkung) | Coder-LLM setzt es fälschlich als globalen Store-Flag um → Leichen-Gefahr im nächsten Produktivlauf |
| **Rd6/Chef-Fix 3 — Stack-Cleanup-Invariante** C.6-INV-1 | Phase-V-Prüfung in §9.0 | `src/store/slices/ingestSlice.ts` + `src/store/types.ts` | Versehentlich globales Store-Feld eingeführt + nicht geleert → nächster Produktivlauf bekommt `[QA] - …`-Präfix *(HISTORISCH - NICHT UMSETZEN; aktuelle Rd15-Form ist `qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\``)* obwohl kein QA-Run |
| **Rd6/Chef-Fix 4 — Silo-Zertifizierung** (Durchstich-Inventur) | neue §13 | Plandatei | Unklare Schutzzone → zukünftige Erweiterungen könnten den „einzigen Durchstich" unbemerkt verbreitern |
| **Rd7/Chef-Fix 1 — Explizites Routing** | `useNavigate` + `navigate(\`/run/${finalRunId}\`)` | `src/components/SettingsPopup.tsx` (Dateikopf-Import + `handleStartSampleTestRun` nach `startWorkflowPhase2`) | User bleibt nach QA-Start im Settings-Popup hängen (Navigation-Illusion) |
| **Rd11-Selektor `isEngineBusy` (ersetzt Rd7/Chef-Fix 2 ‚Guard präzisiert')** | Neuer disjunkter Hard-Block-Selektor — TRUE bei `isProcessing` / running-Step bei `run.status === 'running'` / `isPaused` / `isWaitingBeforeStep4` | `src/components/SettingsPopup.tsx` (§C.2.7) | Rd5-Sammelansatz blockierte `soft-fail`/`failed` unnötig; Rd11 löst das durch `hasIdleWorkflowData` (User-Choice) vs. `isEngineBusy` (Hard-Block) |
| **Rd7/Chef-Fix 3 — `.md`-Universal-Collector** | Unbekannte Kategorie-Ordner → nur `.md`-Dateien weiterhin einsammeln | `src/services/qaSamplesService.ts` `ingestDirectory` Phase 1 | `Doku/expected.md`, `Dokumentation/README.md` werden stumm verworfen |
| **Rd7/Chef-Fix 4 — Semantische Audit-Regeln** | Allow-List von 3 erlaubten Dateien + Negative-Greps auf echte Schreib-/Lese-Pfade | §9.0 C.6-INV-1 (Phase-V-Prüfung) | Text-Greps scheitern an Kommentaren/legitimen Parameter-Reads → falsche Audit-Aussage |
| ~~**Rd7/Chef-Fix 5 — Präfix `QA_TEST_` + Sanitization**~~ **(durch Rd9/Lead-Dev-Fix 3 abgelöst)** | ~~Konstruktion in `handleStartSampleTestRun`, Patch-Concat ohne Pipe~~ Rd9: `customRunTitle = \`QA-${sampleId.trim()}\`` | `src/components/SettingsPopup.tsx` + `src/store/slices/ingestSlice.ts` C.3.2 | Historische Risiko-Beschreibung (Rd7): Sonderzeichen `[`, `]`, `\|` + falsche Position brechen `replace(/\D/g, '').slice(-5)` an Vergleichspunkten (CIRCUIT A12/A13). Rd9 schließt das strukturell: der 3-Zeichen-Präfix `QA-` enthält keine Ziffern und keine Sonderzeichen. |
| **Rd8/Zombie-Guard — Run-Status-Gate (in Rd11-Selektor `isEngineBusy` integriert)** | Run-Level-Status `cr.status !== 'running'` als **erste** Gate-Bedingung VOR Step-Iteration, wohnt jetzt in `isEngineBusy` | `src/components/SettingsPopup.tsx` (§C.2.7) | Gestern-gecrashter Run mit Zombie-`steps[n].status='running'` (Browser-Kill während Execute, I.md A2 Einbahnstraßen) blockiert den Test-Button **für immer** — Master-Wahrheit ist Run-Status, nicht Step-Status |

**Null-Impact-Garantien (müssen explizit nachgewiesen werden):**
- `writeSampleAtomically` (INV-WSA-1..6) — **unverändert**.
- Streaming-Loop (RAM-Garantie, Test #18 aus Basis) — **unverändert**.
- `ingestAndPersistRunData` Body — **unverändert**.
- `generateRunId` — **unverändert**.
- `updateRunWithParsedData` Body — **unverändert**.
- `addUploadedFile`, `fileStorageService`, `masterDataStore`, `serialFinder` — **unverändert** und NICHT aus dem QA-Adapter aufgerufen.

---

## 3. Circuit & Standards-Check

| Datei | Regel | Betroffen? | Schutzmaßnahme |
|---|---|---|---|
| C.md | C.B-TA1 (Test-Arena-Silo) | **Ja** — harter Test | `qaSamplesService` importiert WEITERHIN nicht `runStore`, `runPersistenceService`, `fileStorageService`, `globalConfig`. `prepareFilesForIngest` rekonstruiert nur `File`-Objekte; der Caller (SettingsPopup) übergibt sie an `useRunStore`-Actions. Der Service bleibt **isoliert**. |
| I.md | A13 (Idempotenz `setCurrentRun`) | Ja | Der QA-Schuss durchläuft `createRunSkeleton` → `parseInvoiceForIngest` — dieselbe Kette wie `NewRun.tsx`, identische Idempotenz-Garantie |
| I.md | A15 (React-Mount + Store-Deps) | Ja | Wir führen KEINE neuen Mount-Effekte ein, die `runs`/`currentRun` im Dep-Array haben |
| I.md | A16 (UI-Lifecycle darf Workflow nicht killen) | Ja | Das QA-Dialog-Fenster schließt sich NACH Trigger des Phase-1-Ablaufs — Upload läuft in der Engine weiter, wie bei `NewRun.tsx`. Toast feuert via Sonner-Portal (wie in Basis A.6 Rev 6 bewusst akzeptiert) |
| I.md | I.B-TA1 (Isolierte IDB) | Ja | Keine DB-Version-Bumps, keine zusätzlichen Object-Stores |
| I.md | I.B-TA2..TA7 (Zwei-Store / Cursor-Sequencing / Array-Keys) | Ja | Wir TOUCHEN diese Pfade nicht — `prepareFilesForIngest` ist reiner Reader (`loadSample`) |
| S.md | S1 (Vite, Alias) | Ja | Alle neuen Imports via `@/` |
| S.md | S4 (Tailwind-Only, shadcn-Wrapper) | Ja | AlertDialog wird aus `@/components/ui/alert-dialog` wiederverwendet — exakt Pattern `SettingsPopup.tsx:1644-…` (Cache-Clear-Dialog) und `src/pages/NewRun.tsx:268-292` (Ingest-Error-Dialog) |
| S.md | S5 (Farben, Button-Typen) | Ja | Buttons über `FooterButton` (bestehend, `SettingsPopup.tsx:94-124`); keine neuen Hex-Werte |
| S.md | S.B-TA1 (Async-Load-Hook-Pattern) | Ja — wenn wir neuen Hook bauen | **Entscheidung:** KEIN neuer Hook. Detail-Load läuft als lokale Async-Function im Handler, geschützt durch bereits existierenden `isMountedRef`/`ifMounted` (SettingsPopup.tsx:389-399). KISS-konform, kein Hook-Overhead. |

---

## 4. State-Snapshotting

### Pfad C.1 — Sample anklicken → Soll-Sichtfenster öffnen

```
QaSampleCard.onClick(sample.sampleId)
  → SettingsPopup.handleOpenSampleDetail(sampleId)
    → ifMounted(setSelectedSampleId(sampleId))
    → ifMounted(setSampleDetailLoading(true))
    → ifMounted(setSampleDetailDialogOpen(true))
    → const detail = await qaSamplesService.loadSample(sampleId)  // RO-Tx, DB.close im service garantiert
    → ifMounted(() => {
        setSampleDetail(detail)                // { index, blobs } | null
        setSampleDetailLoading(false)
      })
  → AlertDialog rendert:
      - sampleDetailLoading ? <Spinner/>
      - !detail ? <Text „Sample nicht gefunden"/>
      - detail
        ? <README-Preview> (siehe §5 für Fallback-Kette)
          + <Datei-Manifest-Badges> (aus detail.index.fileMeta)
          + <Buttons: „Schliessen" + „Testlauf starten">
```

### Pfad C.2 — „Testlauf starten" → Injektion in Produktiv-Ingest

```
Button „Testlauf starten" (im AlertDialog)
  → SettingsPopup.handleStartSampleTestRun(sampleId)
    → ifMounted(setQaBusy(true)), ifMounted(setSampleDetailDialogOpen(false))
    → uploadSet = await qaSamplesService.prepareFilesForIngest(sampleId)
       (loadSample + File-Rekonstruktion + Kategorie-Mapping — siehe §5 Block C.2)
    → if (!uploadSet.ok) → toast.error(uploadSet.reason); ifMounted(setQaBusy(false)); return
    → fileSnapshot = uploadSet.snapshot  // { invoice?, articleList?, serialList?, openWE? }
    → // Rd9/Lead-Dev-Fix 1: Bei aktivem Produktivlauf zunächst `OverwriteActiveRunDialog` öffnen.
    → //   User-Choice: „ABBRECHEN" (Default) ODER „OK — Produktivlauf überschreiben".
    → //   Nur nach bestätigtem „OK" läuft der folgende Dispatch. Siehe §7 C.2.6 + C.2.7.
    → runId = await useRunStore.getState().createRunSkeleton()
    → finalRunId = await useRunStore.getState().parseInvoiceForIngest(
                     runId, fileSnapshot,
                     qaRunPrefix                                   // ← Rd15 SSOT-Konstante (ES2020-safe)
                   )
    → ingestResult = await useRunStore.getState().ingestAndPersistRunData(finalRunId, fileSnapshot)
    → if (!ingestResult.allReady)
        → await useRunStore.getState().cleanupFailedIngest(finalRunId)
        → toast.error(`QA-Ingest gescheitert: ${ingestResult.failedSources.join(', ')}`)
        → ifMounted(setQaBusy(false)); return
    → await useRunStore.getState().startWorkflowPhase2(finalRunId)
    → ifMounted(onOpenChange(false))          // Popup schliessen
    → ifMounted(setQaBusy(false))
    → toast.success(`QA-Run gestartet: ${finalRunId}`)
    → navigate(`/run/${encodeURIComponent(finalRunId)}`)   // Rd7: explizite Routing-Aktion
```

### Pfad C.3 — customRunTitle-Schleife

```
parseInvoiceForIngest(runId, snapshot, customRunTitle?)
  → parseInvoicePDF(snapshot.invoice.file, runId)           // unverändert
  → setParsedInvoiceResult(result)                          // unverändert
  → updateRunWithParsedData(runId, result, false)           // unverändert — setzt fattura aus Parser
  → if (result.header.fatturaNumber)
      → newRunId = generateRunId(result.header.fatturaNumber) // unverändert
      → renameRun(runId, newRunId)                            // unverändert
      → finalRunId = newRunId
  → const trimmedTitle = customRunTitle?.trim() ?? ''        // Rd9/Rd11 Trim-Kontrolle
  → if (trimmedTitle.length > 0)                             // ← Rd9 Patch am Ende
      → set(state => ({
          runs: state.runs.map(r =>
            r.id === finalRunId
              ? { ...r, invoice: { ...r.invoice,
                    fattura: `${trimmedTitle}${r.invoice.fattura}` } }   // Rd9: KEIN Separator
              : r
          ),
          currentRun: state.currentRun?.id === finalRunId
            ? { ...state.currentRun, invoice: {
                  ...state.currentRun.invoice,
                  fattura: `${trimmedTitle}${state.currentRun.invoice.fattura}` } }
            : state.currentRun,
        }))
      // IDB-Persistenz: `buildAutoSavePayload` serialisiert das komplette `run`-Objekt
      // (src/hooks/buildAutoSavePayload.ts:23-26,45 → `run` aus Store, gesamt). Damit
      // ist `run.invoice.fattura` (inkl. Präfix) automatisch Teil des `SaveRunPayload`.
      // `ingestAndPersistRunData` (nächster Schritt in der Kette) ruft mehrfach
      // `saveIngestSnapshot` → `buildAutoSavePayload(runId)` → `runPersistenceService.saveRun`.
      // KEIN separater saveRun-Call nötig.
  → return finalRunId
```

**Kritische Invariante (C.3-INV-1):** Der `customRunTitle`-Patch läuft **am Ende** der Funktion, **nach** `renameRun` und **vor** dem `return`. Läuft er **vor** `updateRunWithParsedData`, überschreibt der Parser-Write ihn → Titel verloren. Läuft er **vor** `renameRun`, ist `state.runs` noch unter `runId` indiziert → der Patch findet den Run nicht nach dem Rename. Die Operations-Reihenfolge ist **verbindlich**.

---

## 5. Transitions-Analyse

### 5a. Datenfluss-Vorbedingungen

| Neuer Code liest | Wert | Writer | Existiert Write in SOLL? |
|---|---|---|---|
| `sample.sampleId` (onClick-Propagation) | `string` (Ordnername verbatim, V1-Basis Sektion 7.B.5) | IDB über `ingestDirectory` | Ja (V1 bestehend) |
| `qaSamplesService.loadSample(id)` | `{ index, blobs } \| null` | `writeSampleAtomically` | Ja (V1 bestehend) |
| `blob.data: ArrayBuffer` aus md-Blob | `ArrayBuffer` | `ingestDirectory → writeSampleAtomically` | Ja (V1 bestehend) |
| `snapshot.invoice?.file`, `snapshot.articleList?.file`, `snapshot.openWE?.file`, `snapshot.serialList?.file` | `File` (rekonstruiert) | `prepareFilesForIngest` (NEU) | Ja (dieser Plan) |
| `result.header.fatturaNumber` in `parseInvoiceForIngest` | `string` | `parseInvoicePDF` (unverändert) | Ja (V1 bestehend) |
| Optional `customRunTitle` Param | `string \| undefined` | Caller (SettingsPopup) | Ja (dieser Plan) |

### 5b. Mechanismus-Sicherheit

| Altes Konstrukt | Neues Konstrukt | Fehlerklasse Alt | Fehlerklasse Neu | Auffangnetz? |
|---|---|---|---|---|
| V1: Kein Klick auf Sample | `onClick` auf `QaSampleCard` (div-Wrapper) | — | Accidentaler Click-Bubble (kein Button) | **KISS-Lösung:** Ein einzelnes `<button>`-Element ersetzt den outer `<div>` nicht; stattdessen bleibt `<div>` mit `role="button" tabIndex={0}` + `onKeyDown` für Enter/Space. Doppelklicks und Event-Bubbling innerhalb der Card sind unkritisch (keine inneren klickbaren Elemente). |
| V1: Keine Detail-Fetches | `handleOpenSampleDetail` ruft `loadSample` ohne eigene AbortController | Stale-setState wenn User dialog schließt während Load läuft | `ifMounted`-Guard (SettingsPopup.tsx:397-399) wrapped ALLE post-await-Setters | **Ja — bestehender Guard** |
| V1: Keine Injektion in Ingest | `handleStartSampleTestRun` orchestriert 4 Store-Actions sequenziell | Dangling run bei Fehler in Mitte der Kette | Exakt das `cleanupFailedIngest`-Pattern aus `NewRun.tsx:84-93` wird 1:1 übernommen | **Ja — Pattern-Kopie** |
| V1: `fattura`-Feld = Parser-Result | Nach `renameRun` wird `fattura` atomar präfixiert | Patch vor `renameRun` → Run nicht gefunden; Patch vor `updateRunWithParsedData` → überschrieben | Invariante C.3-INV-1 ordnet die Sequenz | **Ja — festgeschriebene Reihenfolge** |
| V1: Flache Sample-Ordner (V1-Test #14/15) | Optional verschachtelt (2 Ebenen) | Stille Vermischung zwischen Kategorien → falscher File-Type beim Ingest | `classifyCategoryFolder(name)` mit Whitelist + Fallback auf `'invoice'` nur wenn nur PDF vorhanden | **Ja — explizites Mapping, siehe §6** |

### 5c. Dispatch-Vollständigkeit

| Funktion / Entscheidung | Eingabe | Verhalten |
|---|---|---|
| README-Auswahl aus `detail.blobs` | Mehrere md-Blobs im Sample | Priorität: (1) `expected.md` (case-insensitive) → (2) `README.md` → (3) erster md-Blob (sortiert nach `fileName`) → (4) keiner → Fallback-Text „Kein Soll-Dokument hinterlegt" + Anzeige von `index.description` |
| `prepareFilesForIngest` — fehlendes QA-README (Rd10) | Sample ohne `QA-README/`-Pfad-Präfix in den md-Blobs | `{ ok: false, reason: 'Sample ohne QA-README-Ordner — Soll-Kontrakt fehlt' }` |
| `prepareFilesForIngest` — kein PDF | Sample ohne kind=`'pdf'` Blob | `{ ok: false, reason: 'Sample ohne PDF — kein Invoice erkennbar' }` |
| `prepareFilesForIngest` — kein articleList | Sample ohne xlsx/xml Blob mit Kategorie `articleList` | `{ ok: false, reason: 'Sample ohne Artikelliste — Pflichtdatei' }` — weil `ingestAndPersistRunData` sonst `allReady=false` meldet und Fehler-Dialog zeigt. Früher Fail ist klarer. |
| `prepareFilesForIngest` — kein openWE | Sample ohne openWE | `{ ok: false, reason: 'Sample ohne openWE — Pflichtdatei' }` (identische Begründung) |
| `classifyCategoryFolder('Rechnung' \| 'rechnung' \| 'Invoice')` | Whitelist | Case-insensitive map → `'invoice'`. Unbekannter Name → `null` (Sample wird dann nur flach gelesen — Rückwärtskompatibilität) |
| `customRunTitle` trimmt leer | `''` oder nur Whitespace | Keine Präfix-Anwendung (if-Guard `customRunTitle?.trim().length`) |
| `fileSnapshot` leer (kein einziger File-Type erkannt) | alle 4 optional `undefined` | `{ ok: false, reason: 'Kein nutzbarer Datei-Typ im Sample' }` |

---

## 6. Test-Kriterien

| # | Typ | Beschreibung | Erwartetes Ergebnis |
|---|---|---|---|
| C1 | Happy | Sample mit `expected.md` + PDF + Artikelliste (xlsx) + openWE (xlsx) klicken | AlertDialog öffnet, rendert `expected.md`-Body. Badges für 4 Files. |
| C2 | Happy | Sample mit `README.md` (kein expected.md) | README.md-Body wird gerendert (Fallback-Priorität 2) |
| C3 | Edge | Sample ohne jeglichen md-Blob | Dialog öffnet trotzdem; zeigt Fallback-Text + `index.description` |
| C4 | Lifecycle | Dialog öffnen → schnell schließen VOR `loadSample` resolved | Kein React-Warning; `ifMounted` unterdrückt setState; Dialog bleibt zu |
| C5 | Happy-Brücke | „Testlauf starten" auf C1-Sample | `createRunSkeleton` → `parseInvoiceForIngest` → `ingestAndPersistRunData` → `startWorkflowPhase2` erfolgreich. Run erscheint in Home-Liste. Fattura-Label beginnt mit `QA-{sampleId}Fattura-...` (Rd9 — ohne Pipe, ohne Leerzeichen zwischen Präfix und Parser-Wert) |
| C6 | Edge-Brücke | Sample ohne PDF → „Testlauf starten" | Frühes `prepareFilesForIngest`-Fail, `toast.error`, kein Run erzeugt |
| C7 | Edge-Brücke | Sample mit defektem PDF (Parse-Fehler) | `parseInvoiceForIngest` wirft → `catch`-Pfad führt `cleanupFailedIngest(currentRunId)` aus (Pattern `NewRun.tsx:91-94`), keine Ghost-Runs |
| C8 | Edge-Brücke | Sample mit validem PDF aber invalider Artikelliste (Pflichtspalten fehlen) | `ingestAndPersistRunData` → `allReady: false` → `cleanupFailedIngest` läuft → `toast.error` mit `failedSources` → kein Ghost-Run |
| C9 | C.3-Core | Sample-ID `'Mein Sample'` (mit Leerzeichen), Parser-Fattura = `'FA-2025-07-42'` | Handler bildet `qaRunPrefix = 'QA-Mein_Sample'` (Rd15 `sampleId.trim().split(' ').join('_')` — ES2020-safe). `run.invoice.fattura` = `'QA-Mein_SampleFA-2025-07-42'` nach `startWorkflowPhase2`. Run ID bleibt `Fattura-FA-2025-07-42-YYYYMMDD-HHMMSS`. Rd15-Schutzcheck: `'QA-Mein_SampleFA-2025-67890'.replace(/\D/g, '').slice(-5) === '67890'`. |
| C10 | C.3-Edge | customRunTitle = `''` oder Leerzeichen | Kein Präfix angehängt; fattura = pur Parser-Wert (identisch zu Default-NewRun-Pfad) |
| C11 | C.3-Edge | customRunTitle undefined (normaler NewRun-Pfad) | Default-Branch — keine Änderung, Regression gegen V1-Produktivflow ausgeschlossen |
| C12 | C.3-Ordnung | customRunTitle gesetzt, aber Parser-Fattura leer | `renameRun` wird übersprungen (siehe `ingestSlice.ts:307-313`), fattura wird weiterhin präfixiert. Run-ID bleibt die temporäre `run-{ts}` (bekannte V1-Schuld). |
| C13 | Persistenz | Nach C5 Run neu laden (F5 Browser) | Fattura-Label in IDB persistiert als `QA-{sampleId}Fattura-...` (Rd9 — via `buildAutoSavePayload` → `saveRun`). Wiederanzeige in RunDetail zeigt denselben Text. |
| C14 | Isolation | Nach C5 „Testlauf" wird ausgeführt, dann QA-Silo `clearAll()` | `falmec-receiptpro-qa-samples` leer, aber `falmec-receiptpro-runs` und `falmec-receiptpro-files` (Produktionsuploads) unverändert. |
| C15 | Circuit-C.B-TA1 | `grep -rn "runStore\|runPersistenceService\|fileStorageService\|globalConfig" src/services/qaSamplesService.ts` | 0 Treffer (Silo-Regel gewahrt) |
| C16 | A16-Lifecycle | „Testlauf starten" klicken, Popup schließen WÄHREND `parseInvoiceForIngest` läuft | Engine läuft zu Ende (gleiches Verhalten wie Upload aus Basis-Test #20). Keine React-Warning. Toast feuert via Sonner-Portal. `qaBusy` bleibt `true` bis `finally`. |
| C17 | Ordner-Scan | 2-Ebenen-Struktur: `MyBug/Rechnung/foo.pdf` + `MyBug/Artikelliste/art.xlsx` | sampleId = `'MyBug'`; `prepareFilesForIngest('MyBug')` erkennt Kategorien, snapshot enthält `invoice` + `articleList` korrekt typisiert. |
| C18 | Rd11 V1-Legacy-Break | Flache Struktur: `MyBug/foo.pdf` + `MyBug/art.xlsx` OHNE `MyBug/QA-README/…md` | `prepareFilesForIngest('MyBug')` liefert `{ok:false, reason:'Sample ohne QA-README-Ordner — Soll-Kontrakt fehlt'}`. Sichtfenster öffnet zur Anzeige (README-Body = `'Kein Soll-Dokument hinterlegt'`), „Testlauf starten" bleibt disabled (Rd10/Fix 2 + Rd11). **Bewusster Legacy-Break — siehe §6.1 Migrations-Hinweis.** |
| C19 | Rd11 Ordner-Scan-Mix (Legacy-Break) | `MyBug/foo.pdf` (flach) + `MyBug/Artikelliste/art.xlsx` (kategorisiert) OHNE `QA-README/` | Flache Datei + Kategorie-Ordner werden weiterhin gemerged (Heuristik greift für flach, Kategorie schlägt Heuristik). Aber: kein `QA-README/` → Testlauf-Button disabled. Die Zusammenführungs-Logik bleibt technisch intakt (§C.2.2 Scan), nur die Testlauf-Gate-Bedingung blockt. |
| C20 | TS-Compiler | `npx tsc --noEmit` nach allen Änderungen | EXIT 0 |
| C21 | A13-Idempotenz | Zweimal hintereinander „Testlauf starten" auf demselben Sample (Sekundenabstand) | Zweiter Run erhält eigenen Timestamp-Suffix in `generateRunId` → keine ID-Kollision. Fattura-Label = `QA-{sampleId}…` (Rd9) identisch; Dom sieht, dass beide Runs QA-Runs sind. |
| C32a | Rd10-Hard-Block | Engine rechnet (`isProcessing === true` ODER running-Step bei `run.status === 'running'` ODER `isPaused` ODER `isWaitingBeforeStep4`) → „Testlauf starten" klicken | Kein Dispatch, kein OverwriteDialog. Stattdessen Toast `'Engine rechnet gerade — QA-Testlauf blockiert. Bitte warten oder pausieren.'`. `currentRun` unverändert. Regression gegen Rd9 bestätigt: KEIN User-Choice-Dialog in diesem Zustand. |
| C32b | Rd10-User-Choice | `currentRun != null`, aber Engine IDLE (`status === 'ok'`/`'soft-fail'`/`'failed'` ohne running-Step, kein `isProcessing`/`isPaused`/`isWaitingBeforeStep4`) → „Testlauf starten" klicken | Soll-Sichtfenster schließt NICHT, stattdessen öffnet `OverwriteActiveRunDialog`. Buttons: „ABBRECHEN" (Default) / „OK". Abbrechen → Dialog schließt, kein Dispatch. OK → `handleStartSampleTestRun` läuft regulär weiter; bestehender Workflow wird via `createRunSkeleton → resetRunSensitiveState` überschrieben. |
| C32c | Rd10-Sofort-Dispatch | `currentRun === null` UND Engine idle → „Testlauf starten" klicken | Weder Toast noch Dialog. `handleStartSampleTestRun` läuft direkt. Regression: beide Selektoren (isEngineBusy, hasIdleWorkflowData) sind false. |
| C33 | Rd10-QA-README PFLICHT | Sample-Ordner `MeinBug/Rechnung/rechnung.pdf` + `MeinBug/expected.md` (OHNE `QA-README/`) | Soll-Sichtfenster öffnet, zeigt `expected.md`-Inhalt zur Info UND einen roten Warnblock `⛔ QA-README-Ordner fehlt`. „Testlauf starten"-Button ist **disabled**. Falls der Handler dennoch aufgerufen wird (DevTools): `prepareFilesForIngest` liefert `{ok:false, reason:'Sample ohne QA-README-Ordner — Soll-Kontrakt fehlt'}`, Toast-Error, kein Run erzeugt. |
| C34 | Rd10-QA-README Happy | Sample-Ordner `MeinBug/QA-README/readme.md` + alle Pflichtdateien | `classifyCategoryFolder('QA-README')` erkennt den Ordner, Blobs mit Pfad-Präfix `qa-readme/` landen im Index. `hasQaReadme`-Memo → true. Button enabled. `resolveReadmeBody` liefert den Inhalt aus `QA-README/readme.md` — NICHT das zusätzlich vorhandene `expected.md`. |
| C22 | YAGNI-Regression | Kein neuer Hook eingeführt | `grep -rn "useQa" src/hooks/` → weiterhin nur `useQaSamples.ts` (V1), keine `useQaSampleDetail`/`useQaTestRun` |

---

### 6.1 V1-Legacy-Break & Migrations-Hinweis (Rd11/Schnüffler-Fix 4)

Rd10 hat `QA-README/` zur Pflicht-Quelle erklärt. Rd10-Test C18 behauptete aber parallel, „flache V1-Samples bleiben lauffähig" — das war ein direkter Widerspruch zur Pflicht-Regel.

**Rd11 bestätigt den Legacy-Break als architektonisch bewusst:**

- **Anzeige bleibt zulässig:** Ein V1-Sample ohne `QA-README/`-Unterordner lässt sich im Sichtfenster öffnen und zeigt vorhandene Dateien über das Manifest-Badge + `resolveReadmeBody`-Fallback (expected.md / README.md / erste `.md`). Der Tester kann den Inhalt prüfen.
- **Testlauf-Button bleibt disabled:** Solange `hasQaReadme === false` ist, rendert der „Testlauf starten"-Button `disabled`. Es gibt keinen Umweg — `prepareFilesForIngest` weigert sich zusätzlich (Defense-in-Depth, §C.2.3).
- **Migrations-Pfad:** Für jedes V1-Legacy-Sample legt der Tester einen Unterordner `QA-README/` mit einer `.md`-Datei an (Soll-Kontrakt: was soll der Test beweisen?). Erst dann wird das Sample testfähig.
- **Warum Big Picture schlägt Bequemlichkeit:** Die Giftküche existiert, weil wir Revisionssicherheit brauchen — ein Testlauf ohne Soll-Kontrakt ist ein Test gegen nichts. Rückwärtskompatibilität zu V1-flach würde genau diese Disziplin-Lücke öffnen, die Rd10 bewusst geschlossen hat.

Keine automatische Migration, kein Grace-Period-Modus, kein Opt-Out. Wer alte Samples weiterhin testen will, legt fünf Sekunden Arbeit in den `QA-README/readme.md` — fertig.

---

## 7. Umsetzungsplan

### Block C.1 — Das LLM-Soll-Sichtfenster

**C.1.1 `QaSampleCard` klickbar machen** — `src/components/SettingsPopup.tsx:139-157`

```tsx
// VORHER (Zeile 139):
function QaSampleCard({ sample }: { sample: QaSampleSummary }) {
  return (
    <div className="rounded border border-border/70 bg-white/70 p-2 space-y-1">
      {/* ... */}
    </div>
  );
}

// NACHHER:
function QaSampleCard({
  sample,
  onSelect,
}: {
  sample: QaSampleSummary;
  onSelect: (sampleId: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(sample.sampleId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(sample.sampleId);
        }
      }}
      className="rounded border border-border/70 bg-white/70 p-2 space-y-1 cursor-pointer hover:bg-white/90 hover:border-primary/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {/* ... unveränderter Body: folderName, Badges, description ... */}
    </div>
  );
}
```

- `cursor-pointer` + `hover:bg-white/90` + Focus-Ring — S5-konform (`bg-primary/50` statt eigenem Hex).
- Kein `<button>`: Radix rendert AlertDialog-Trigger schon als Button; nested buttons = a11y-Fehler. `role="button"` + `tabIndex` + `onKeyDown` ist das Standard-a11y-Pattern (W3C ARIA-Practices „Button").

**C.1.2 State + Handler im Settings-Tab** — `src/components/SettingsPopup.tsx` (unmittelbar nach Zeile 452, noch in der Test-Arena-Block-Sektion):

```ts
// PROJ-50-DEV: Sample-Detail + Testlauf ---------------------------------
const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
const [sampleDetail, setSampleDetail] = useState<{
  index: QaSampleIndexEntry;
  blobs: QaSampleBlob[];
} | null>(null);
const [sampleDetailLoading, setSampleDetailLoading] = useState(false);
const [sampleDetailDialogOpen, setSampleDetailDialogOpen] = useState(false);

const handleOpenSampleDetail = useCallback(async (sampleId: string) => {
  ifMounted(() => {
    setSelectedSampleId(sampleId);
    setSampleDetail(null);
    setSampleDetailLoading(true);
    setSampleDetailDialogOpen(true);
  });
  try {
    const detail = await qaSamplesService.loadSample(sampleId);
    ifMounted(() => {
      setSampleDetail(detail);
      setSampleDetailLoading(false);
    });
  } catch (e: unknown) {
    const err = e as { message?: string } | null;
    ifMounted(() => {
      setSampleDetailLoading(false);
      toast.error(`Laden fehlgeschlagen: ${err?.message ?? 'Unbekannt'}`);
    });
  }
}, [ifMounted]);
```

- **Imports am Dateikopf ergänzen:** `QaSampleIndexEntry`, `QaSampleBlob` aus `@/services/qaSamplesService`.
- `ifMounted` existiert bereits (Zeile 397-399). Kein neuer Hook.
- **Kein `useEffect` für den Load** — direkte Async-Function im Handler. KISS.

**C.1.3 AlertDialog-Render** — am Ende der Datei, nach anderen AlertDialog-Blöcken (Pattern `SettingsPopup.tsx:1602-1627` Import-Success-Dialog), vor dem letzten `</>`:

```tsx
{/* PROJ-50-DEV: Sample-Detail / Soll-Sichtfenster */}
<AlertDialog
  open={sampleDetailDialogOpen}
  onOpenChange={(open) => {
    if (!open) {
      ifMounted(() => {
        setSampleDetailDialogOpen(false);
        setSampleDetail(null);
        setSelectedSampleId(null);
      });
    }
  }}
>
  <AlertDialogContent
    style={{ backgroundColor: '#D8E6E7' }}
    className="max-w-[720px]"
  >
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5" />
        Soll-Sichtfenster: {selectedSampleId ?? ''}
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="space-y-3">
          {sampleDetailLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Lade Sample-Inhalt...</span>
            </div>
          )}
          {!sampleDetailLoading && sampleDetail && (
            <>
              {/* README-Preview */}
              <div className="rounded-md border border-border bg-white/70 p-3 max-h-[320px] overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                  {resolveReadmeBody(sampleDetail.blobs) ??
                    `Kein Soll-Dokument hinterlegt.\n\nDescription:\n${sampleDetail.index.description}`}
                </pre>
              </div>
              {/* Datei-Manifest */}
              <div className="flex flex-wrap gap-1">
                {sampleDetail.index.fileMeta.map((f) => (
                  <span
                    key={f.name}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#c9c3b6] border border-border/50 text-[#333]"
                    title={f.name}
                  >
                    {f.kind} · {formatQaBytes(f.size)} · {f.name}
                  </span>
                ))}
              </div>
            </>
          )}
          {!sampleDetailLoading && !sampleDetail && (
            <p className="text-sm text-muted-foreground">
              Sample nicht gefunden oder Laden fehlgeschlagen.
            </p>
          )}
          {/* Rd10/Lead-Dev-Fix 2: Pflicht-Warnblock bei fehlendem QA-README.
              Wortlaut verbindlich — Coder darf nicht umformulieren. */}
          {!sampleDetailLoading && sampleDetail && !hasQaReadme && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
              ⛔ QA-README-Ordner fehlt — dieses Sample kann nicht als Testlauf gestartet werden.
              Lege einen Unterordner <code>QA-README</code> mit einer <code>.md</code>-Datei an.
            </div>
          )}
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    {/* PROJ-50-DEV Rd5/Chef-Fix 2: MasterData-Warnung — PFLICHT-SICHTBAR direkt
        über/beim „Testlauf starten"-Button. Wortlaut ist vorgegeben und darf NICHT
        verändert werden. Rendert im Footer-Bereich, damit der User sie zwingend
        sieht, bevor er auf „Testlauf starten" klickt. */}
    <div className="border-warning/50 bg-warning/10 text-warning-foreground text-xs rounded-md border p-2 mt-2">
      ⚠ ACHTUNG - Bei Start des Testlaufs wird die Artikel-Gesamtliste überschrieben. Bitte bei nächstem Produktivlauf zwingend eine aktuelle Artikelliste hinzufügen.
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel>Schliessen</AlertDialogCancel>
      <AlertDialogAction
        disabled={
          qaBusy ||
          sampleDetailLoading ||
          !sampleDetail ||
          !selectedSampleId ||
          !hasQaReadme                 /* ← Rd10/Lead-Dev-Fix 2: QA-README PFLICHT */
          /* Rd10/Lead-Dev-Fix 1: KEIN Guard-Disable mehr — weder `isEngineBusy` noch
             `hasIdleWorkflowData`. Die beiden Zustände werden im `onClick` getrennt
             behandelt: Hard-Block-Toast für Engine-Busy, User-Choice-Dialog für Idle. */
        }
        onClick={(e) => {
          // Rd11/Schnüffler-Fix 1: Radix schließt `AlertDialogAction`-Parent-Dialoge per Default.
          //   In Branch 1 + 2 würden wir das Soll-Sichtfenster unerwünscht verlieren (Branch 1:
          //   Toast bliebe ohne Kontext; Branch 2: Overwrite-Dialog würde den Sichtfenster-Content
          //   verdrängen). Deshalb hart blockieren mit e.preventDefault(). Branch 3 darf die
          //   Default-Close-Semantik behalten — der Handler schließt das Sichtfenster ohnehin
          //   früh via setSampleDetailDialogOpen(false).
          if (!selectedSampleId) {
            e.preventDefault();
            return;
          }
          // Rd10/Lead-Dev-Fix 1 (Branch 1 — Hard-Block): Engine rechnet gerade →
          //   kein Dispatch, erklärender Toast. Schützt vor Phase-1/2-Kollision.
          if (isEngineBusy) {
            e.preventDefault();                               // ← Rd11: Sichtfenster bleibt offen
            toast.warning(
              'Engine rechnet gerade — QA-Testlauf blockiert. Bitte warten oder pausieren.',
            );
            return;
          }
          // Rd10/Lead-Dev-Fix 1 (Branch 2 — User-Choice): Rest-Daten im Store, aber
          //   keine laufende Engine → AlertDialog „Lauf überschreiben?".
          if (hasIdleWorkflowData) {
            e.preventDefault();                               // ← Rd11: Sichtfenster bleibt offen
            ifMounted(() => {
              setPendingOverwriteSampleId(selectedSampleId);
              setOverwriteDialogOpen(true);
            });
            return;
          }
          // Rd10/Lead-Dev-Fix 1 (Branch 3 — Sofort-Dispatch): Leerer Store, Engine idle.
          //   Kein preventDefault — Radix darf schließen, Handler schließt ohnehin früh.
          void handleStartSampleTestRun(selectedSampleId);
        }}
      >
        Testlauf starten
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**C.1.3.1 User-Choice-Popup (Rd9/Lead-Dev-Fix 1) — `OverwriteActiveRunDialog`** — zweiter AlertDialog, platziert direkt NACH dem Soll-Sichtfenster-Dialog (siehe C.1.3) und VOR dem Sample-Regex-Legende-Dialog (siehe C.1.5):

```tsx
{/* PROJ-50-DEV Rd9/Lead-Dev-Fix 1: User-Choice-Popup bei aktivem Produktivlauf.
    Ersetzt den früheren stummen Hart-Block (Rd5). Gibt dem User eine bewusste
    Entscheidung statt eines frustrierenden „disabled"-Buttons. */}
<AlertDialog
  open={overwriteDialogOpen}
  onOpenChange={(open) => {
    if (!open) {
      ifMounted(() => {
        setOverwriteDialogOpen(false);
        setPendingOverwriteSampleId(null);
      });
    }
  }}
>
  <AlertDialogContent
    style={{ backgroundColor: '#D8E6E7' }}
    className="max-w-[520px]"
  >
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5" />
        Lauf im Workflow überschreiben?
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="space-y-2 text-sm">
          <p>
            Es befindet sich noch ein <b>Lauf im Workflow</b>. Soll dieser
            überschrieben werden?
          </p>
          <p className="text-xs text-muted-foreground">
            Klicke <b>OK</b>, um den bestehenden Lauf durch den QA-Testlauf
            zu ersetzen. Ungespeicherte Zwischenstände gehen dabei verloren.
            Klicke <b>ABBRECHEN</b>, um den Workflow unberührt zu lassen und
            zuerst zu beenden oder bewusst zu verwerfen.
          </p>
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>ABBRECHEN</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          const sid = pendingOverwriteSampleId;
          ifMounted(() => {
            setOverwriteDialogOpen(false);
            setPendingOverwriteSampleId(null);
          });
          if (sid) void handleStartSampleTestRun(sid);
        }}
      >
        OK
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- **State-Ergänzung** (gehört zum State-Block aus §C.1.2):

```ts
const [overwriteDialogOpen, setOverwriteDialogOpen] = useState(false);
const [pendingOverwriteSampleId, setPendingOverwriteSampleId] = useState<string | null>(null);
```

- **Idempotenz:** Nach Bestätigung des Overwrite-Dialogs läuft `handleStartSampleTestRun` in genau derselben Ausführungsreihenfolge wie ohne aktiven Produktivlauf — die „OK"-Klick schaltet nur den zusätzlichen Wrapper aus. Der interne Handler-seitige Doppel-Check *(HISTORISCH - NICHT UMSETZEN: `isProductiveRunActiveNow`)* **entfällt seit Rd9**, da die User-Wahl die bewusste Autorisierung ist — der Handler-Body trägt KEINE Guard-Logik.
- **A11y:** `AlertDialogCancel` ist der semantische Default — Radix fokussiert ihn zuerst (ESC schließt). Der Overwrite-Button ist sekundär und muss bewusst angeklickt werden.

- `Loader2` aus `lucide-react` — Import am Dateikopf (`SettingsPopup.tsx:42`) ergänzen: `Loader2`.
- `resolveReadmeBody` = reine Helper-Funktion oberhalb des Components (siehe C.1.4).
- `AlertDialogAction` triggert `handleStartSampleTestRun`. **Wichtig:** Radix schließt den Dialog automatisch beim Trigger-Click — wir müssen daher `setSampleDetailDialogOpen(false)` NICHT im Handler machen (onOpenChange-Cleanup triggert ohnehin). Stattdessen den Handler den Rest erledigen lassen.
- **Guard-Verteilung (Rd11/Rd12):** `isEngineBusy` + `hasIdleWorkflowData` werden NICHT am `disabled`-Prop angehängt, sondern über drei `onClick`-Branches verteilt — Toast (Engine-Busy), Dialog (Idle-Workflow-Data), Direkt-Dispatch (leerer Store). Siehe Branch-Code in §C.1.3.
- **Rd5/Chef-Fix 2 (MasterData-Warnung):** Der Warnblock nutzt die standardisierten Warn-Panel-Klassen aus S.md S5 (`border-warning/50 bg-warning/10 text-warning-foreground`). Wortlaut ist **wörtlich** wie vom Chef vorgegeben. Kein Workaround (kein Code-Bypass der masterData-Überschreibung) — die UI-Warnung ist die einzige Schutzschicht gegen unbewusste Stammdaten-Vergiftung.

**C.1.3.2 `hasQaReadme`-Memo (Rd10/Lead-Dev-Fix 2)** — ergänzt den State-Block aus §C.1.2. Das Memo ist der einzige Ort, der die QA-README-Pflicht für den „Testlauf starten"-Button enforced — `resolveReadmeBody` bleibt für die bloße Anzeige zuständig und fällt bei fehlendem QA-README auf expected/README/erste `.md` zurück (graceful degrade für reines Lesen).

```ts
// PROJ-50-DEV Rd10/Lead-Dev-Fix 2: QA-README ist Pflicht für den Testlauf.
// Das Memo leitet direkt aus dem geladenen `sampleDetail` ab — kein zweiter async Call.
const hasQaReadme = useMemo(() => {
  if (!sampleDetail) return false;
  return sampleDetail.blobs.some(
    (b) => b.kind === 'md' && b.fileName.toLowerCase().startsWith('qa-readme/'),
  );
}, [sampleDetail]);
```

- **Button-Disable-Integration:** `hasQaReadme` wird als zusätzliche Bedingung im `disabled`-Prop des „Testlauf starten"-AlertDialogAction ausgewertet (siehe §C.1.3).
- **UI-Hinweis im Sichtfenster:** Wenn `sampleDetail !== null && !hasQaReadme`, rendert der AlertDialog zusätzlich zur README-Preview einen roten Warnblock: *„⛔ QA-README-Ordner fehlt — dieses Sample kann nicht als Testlauf gestartet werden. Lege einen Unterordner `QA-README` mit einer `.md`-Datei an."*. Wortlaut in §C.1.3 verbindlich.

**C.1.4 Helper `resolveReadmeBody`** — oberhalb `QaSampleCard` in `SettingsPopup.tsx` (nach `formatQaBytes`, ca. Zeile 138):

```ts
// PROJ-50-DEV: resolveReadmeBody
// Rd9/Lead-Dev-Fix 2: Priorisiert ZWINGEND alle Blobs aus dem `QA-README/`-Ordner,
//   dann expected.md (case-insensitive) > README.md > erste .md als Rückfall.
// Grund: Der Lead-Dev hat `QA-README/` zum verbindlichen Sichtfenster-Anker erklärt —
//   die `.md`-Datei darin ist der Soll-Kontrakt, den das LLM beim Start sieht.
// Rd5/Chef-Fix 3: Vergleich auf BASENAME (letztes Pfad-Segment), nicht auf fileName.
//   Grund: fileName kann jetzt ein Pfad-Präfix tragen ('Doku/expected.md').
function resolveReadmeBody(blobs: QaSampleBlob[]): string | null {
  const mdBlobs = blobs.filter((b) => b.kind === 'md');
  if (mdBlobs.length === 0) return null;

  // Rd5/Chef-Fix 3: Basename extrahieren (flat == fileName, geschachtelt == segment nach '/').
  const basenameOf = (name: string): string => {
    const ix = name.lastIndexOf('/');
    return ix === -1 ? name : name.slice(ix + 1);
  };

  // Rd9/Lead-Dev-Fix 2: Blobs mit Pfad-Präfix `QA-README/` haben OBERSTE PRIORITÄT.
  // Vergleich case-insensitive auf dem Ordner-Segment. Wenn mehrere `.md`-Dateien im
  // QA-README-Ordner liegen, gewinnt die alphabetisch erste (`[...].sort(...)[0]`).
  const qaReadmeBlobs = mdBlobs
    .filter((b) => b.fileName.toLowerCase().startsWith('qa-readme/'))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
  const qaReadme = qaReadmeBlobs[0];

  const expected = mdBlobs.find(
    (b) => basenameOf(b.fileName).toLowerCase() === 'expected.md',
  );
  const readme = mdBlobs.find(
    (b) => basenameOf(b.fileName).toLowerCase() === 'readme.md',
  );
  const sorted = [...mdBlobs].sort((a, b) => a.fileName.localeCompare(b.fileName));
  const chosen = qaReadme ?? expected ?? readme ?? sorted[0];    // ← Rd9: QA-README zuerst
  if (!chosen) return null;

  // ArrayBuffer → UTF-8 Text, Größenwächter um UI-Blow-up zu vermeiden.
  // 256 KB harte Obergrenze — dann kürzen und Marker anhängen.
  const MAX = 256 * 1024;
  const slice =
    chosen.data.byteLength > MAX ? chosen.data.slice(0, MAX) : chosen.data;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
  return chosen.data.byteLength > MAX
    ? text + '\n\n... [gekürzt — Datei > 256 KB]'
    : text;
}
```

- Rein funktional, keine Promises, keine Side-Effects.
- Größenwächter: ein Sample mit 20-MB-.md würde sonst die UI lahmlegen.
- **Rd5/Chef-Fix 3:** Der Basename-Extraktor ist idempotent bei flachen Samples (kein Slash → gesamter String bleibt). Legacy-V1-md-Blobs (fileName == basename) funktionieren ohne Änderung. Neue kategorisierte Samples mit `'Doku/expected.md'` oder `'Dokumentation/README.md'` werden korrekt erkannt.

**C.1.5 UI-Legende „Sample Regex" (Rd6/Chef-Fix 1)** — neuer Link/Button im Test-Arena-Tab, Sektion 2 „Testdaten schicken". Ersetzt den bestehenden Platzhalter „Folgt in nächster Version." (`SettingsPopup.tsx:1565-1571`):

```tsx
{/* PROJ-50-DEV Rd6/Chef-Fix 1: Sektion 2 — Testdaten schicken + Nomenklatur-Legende */}
<div className="border-t border-border pt-3 space-y-2">
  <Label className="text-sm font-semibold">Testdaten schicken</Label>
  <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 space-y-2">
    <p className="text-xs text-muted-foreground">
      Klicke auf ein Sample in der Liste oben, um das Soll-Sichtfenster zu öffnen
      und einen Testlauf zu starten.
    </p>
    <button
      type="button"
      onClick={() => setSampleRegexLegendOpen(true)}
      className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
    >
      Sample Regex
    </button>
  </div>
</div>
```

**Kleiner State-Eintrag** (bei den anderen QA-States in §C.1.2 ergänzen):

```ts
const [sampleRegexLegendOpen, setSampleRegexLegendOpen] = useState(false);
```

**Legende-Dialog** — zweiter AlertDialog, platziert am Ende der Datei neben dem Soll-Sichtfenster-Dialog:

```tsx
{/* PROJ-50-DEV Rd6/Chef-Fix 1: Sample-Regex / Nomenklatur-Legende */}
<AlertDialog open={sampleRegexLegendOpen} onOpenChange={setSampleRegexLegendOpen}>
  <AlertDialogContent
    style={{ backgroundColor: '#D8E6E7' }}
    className="max-w-[640px]"
  >
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5" />
        Sample-Ordner-Nomenklatur
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="space-y-3 text-sm">
          <p>
            Damit der Giftküchen-Scan Deine Test-Dateien automatisch der richtigen
            Ingest-Kategorie zuweist, müssen die Unterordner (Ebene 2, innerhalb
            eines Sample-Ordners) aus dieser Whitelist stammen (case-insensitive):
          </p>
          <ul className="list-disc list-inside space-y-1 font-mono text-xs bg-white/70 rounded-md border border-border p-2">
            <li><b>QA-README</b> → <b>PFLICHT</b> (Rd10). `.md`-Datei im Unterordner ist der verbindliche Soll-Kontrakt; ohne diesen Ordner bleibt der „Testlauf starten"-Button disabled.</li>
            <li><b>Rechnung</b> / Invoice / Fattura → <code>invoice</code> (PDF)</li>
            <li><b>Warenbegleitschein</b> / Seriennummern / Serial / SerialList / S-N / SN → <code>serialList</code> (XLS/XLSX)</li>
            <li><b>Artikelliste</b> / Articles / ArticleList / Artikel / Stammdaten → <code>articleList</code> (XLSX/XML)</li>
            <li><b>Bestellung</b> / Bestellungen / openWE / Orders / Wareneingang / Wareneingaenge → <code>openWE</code> (CSV/XLSX/XML)</li>
          </ul>
          <p className="text-xs">
            <b>Beispiel:</b>
          </p>
          <pre className="text-[11px] whitespace-pre bg-white/70 rounded-md border border-border p-2 overflow-x-auto">{`MeinTestFall/
├── QA-README/readme.md              (Rd10 PFLICHT: Soll-Kontrakt fürs Sichtfenster)
├── Rechnung/rechnung.pdf            (PFLICHT)
├── Artikelliste/stammdaten.xlsx     (PFLICHT)
├── Bestellung/openwe.xlsx           (PFLICHT)
└── Warenbegleitschein/serial.xls   (optional)`}</pre>
          <p className="text-xs text-muted-foreground">
            Unbekannte Ordnernamen (z.&nbsp;B. <code>Doku/</code>, <code>Notizen/</code>)
            werden <b>weiterhin auf <code>.md</code>-Dateien gescannt</b> — andere
            Dateitypen daraus werden übersprungen (Rd7/Chef-Fix 3). Flache Samples
            (alle Dateien direkt in <code>MeinTestFall/</code>) werden über eine
            Heuristik zugeordnet (Dateiname enthält „artikel"/„stamm"/„master"
            → articleList usw.). Kategorie-Ordner sind aber der sichere Weg
            gegen Zuordnungsfehler.
          </p>
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Verstanden</AlertDialogCancel>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- **KISS:** Reiner Doku-Dialog, keine Async-Logik, keine Handler außer Open/Close. Alle Einträge sind **direkte Zitate** aus der `classifyCategoryFolder`-Whitelist (§C.2.1) → Legende und Code bleiben via Code-Review synchron.
- **Konsistenz-Pflicht:** Bei JEDER künftigen Erweiterung von `classifyCategoryFolder` MUSS die Legende mitgezogen werden. Als Test-Kriterium C23 dokumentiert (§6).
- **Kein eigener Hook, kein reaktiver State über `open` hinaus.** `setSampleRegexLegendOpen(false)` beim Cancel reicht. `ifMounted` nicht nötig, da kein Await im Dialog läuft.

---

### Block C.2 — Die Ingest-Injektion

**C.2.1 Kategorie-Mapping (verschachtelte Ordner, optional)** — neuer Helper in `src/services/qaSamplesService.ts` (oberhalb `ingestDirectory`, nach `parseMarkdownDescription` Zeile 95):

```ts
// PROJ-50-DEV: Kategorie-Ordner → UploadedFile.type ODER QA-README-Marker
// Whitelist; unbekannte Ordner bleiben unkategorisiert (→ Heuristik via classifyFileByName).
// Rd9/Lead-Dev-Fix 2: Zusätzlicher fester Wert `'qa-readme'` markiert den verbindlichen
// Sichtfenster-Ordner. Sein Rückgabewert ist NICHT Teil von QaCategory (ist keine
// UploadedFile-Kategorie), sondern wird als eigener Sentinel `'qa-readme'` erkannt und
// im ingestDirectory-Scan für `.md`-Sammlung weitergeleitet. resolveReadmeBody priorisiert
// später Blobs mit dem Pfadsegment `QA-README/`.
export type QaCategory = 'invoice' | 'openWE' | 'serialList' | 'articleList';
export type QaFolderKind = QaCategory | 'qa-readme';

function classifyCategoryFolder(folderName: string): QaFolderKind | null {
  const n = folderName.trim().toLowerCase();
  if (n === 'qa-readme') return 'qa-readme';                                    // ← Rd9/Lead-Dev-Fix 2
  if (['rechnung', 'invoice', 'fattura'].includes(n)) return 'invoice';
  if (['bestellung', 'bestellungen', 'openwe', 'orders', 'wareneingang', 'wareneingaenge'].includes(n)) return 'openWE';
  if (['seriennummern', 'serial', 'seriallist', 's-n', 'sn'].includes(n)) return 'serialList';
  if (['artikelliste', 'articles', 'articlelist', 'artikel', 'stammdaten'].includes(n)) return 'articleList';
  return null;
}
```

- **Rd9/Lead-Dev-Fix 2 — fester Ordnername:** Der Wert `'qa-readme'` ist **case-insensitive** durch den `.toLowerCase()`-Normalizer am Anfang, der Tester darf den Ordner aber **nur mit dem wörtlichen Namen `QA-README`** anlegen — Abweichungen (z.&nbsp;B. `qa_readme`, `ReadmeQA`) landen im Doku-`.md`-Universal-Collector (siehe C.2.2) und verlieren die Priorität im Sichtfenster.
- **Rd10/Lead-Dev-Fix 2 — Pflicht, nicht Option:** `QA-README` ist nicht mehr nur „bevorzugte" Quelle, sondern **Voraussetzung** dafür, dass der „Testlauf starten"-Button enabled wird. `hasQaReadme` (§C.1.3.2) leitet das Memo direkt aus den geladenen Blobs ab; `prepareFilesForIngest` (§C.2.3) enthält zusätzlich eine Defense-in-Depth-Abweisung, falls der Service unabhängig vom UI angesprochen wird.

**C.2.2 `ingestDirectory`-Erweiterung — 2 Ebenen optional** — `src/services/qaSamplesService.ts:134-223`

- **Regel:** `writeSampleAtomically` bleibt Zeile-für-Zeile identisch (INV-WSA-1..6 unverändert). Erweiterung greift NUR in Phase 1 (FS-Read), wo keine IDB-Tx läuft.
- **Erweiterung des Inner-Loops** (ca. Zeile 159-173 — der `for await (const fileEntry of subDir.values())` Block): Bevor Dateien direkt gelesen werden, wird geprüft, ob `fileEntry.kind === 'directory'` ist. Wenn ja **und** `classifyCategoryFolder(fileEntry.name) !== null`, wird eine weitere Ebene gescannt. Pseudocode:

```ts
// In ingestDirectory, innerhalb der äußeren for-await-Schleife,
// innerhalb des try-Blocks (Phase 1 FS-Read), ersetze:
//
// for await (const fileEntry of subDir.values()) {
//   if (fileEntry.kind !== 'file') continue;
//   ...
// }
//
// Durch:

for await (const entry2 of (subDir as FileSystemDirectoryHandle).values()) {
  if (entry2.kind === 'file') {
    // Ebene-1-Datei (Legacy-Pfad) — unverändert: basename bleibt direkter Key.
    const kind = classify(entry2.name);
    if (kind === 'other') continue;
    const fileHandle = entry2 as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const buf = await file.arrayBuffer();
    files.push({
      name: file.name,               // basename (flach) → Array-Key [sampleId, basename]
      basename: file.name,            // ← Rd5/Chef-Fix 3: expliziter Original-Basename
      kind,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      // category = null bedeutet „Heuristik im Ingest-Adapter anwenden"
      category: null as QaCategory | null,
      data: buf,
    });
  } else if (entry2.kind === 'directory') {
    // Rd7/Chef-Fix 3: Unbekannte Ordner NICHT mehr komplett ignorieren.
    // Stattdessen: `.md`-Dateien daraus werden weiterhin eingesammelt (Doku-Fallback),
    // alle anderen Dateitypen werden übersprungen. Damit gehen `Doku/expected.md`,
    // `Dokumentation/README.md`, `Notizen/foo.md` etc. nicht mehr verloren.
    //
    // Rd9/Lead-Dev-Fix 2: `QA-README` ist ein zusätzlicher, fester Ordnername. Er ist
    // KEINE UploadedFile-Kategorie, sondern ein Sichtfenster-Anker: der Scan sammelt
    // daraus NUR `.md`-Dateien ein (wie bei unbekannter Kategorie), markiert sie aber
    // später über das Pfad-Präfix `QA-README/` als Soll-Kontrakt mit höchster Priorität.
    const folderKind = classifyCategoryFolder(entry2.name);   // QaCategory | 'qa-readme' | null
    const uploadCategory: QaCategory | null =
      folderKind === 'qa-readme' || folderKind === null ? null : folderKind;
    const subSubDir = entry2 as FileSystemDirectoryHandle;
    for await (const fileEntry of subSubDir.values()) {
      if (fileEntry.kind !== 'file') continue;
      const kind = classify(fileEntry.name);
      if (kind === 'other') continue;
      // Rd7/Chef-Fix 3: Bei unbekannter Kategorie nur .md erlauben (Doku-Fallback).
      // Rd9/Lead-Dev-Fix 2: Für `QA-README` gelten dieselben Regeln — nur .md zählt.
      if (uploadCategory === null && kind !== 'md') continue;
      const fileHandle = fileEntry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const buf = await file.arrayBuffer();
      // ── Rd5/Chef-Fix 3: Pfad-Präfix gegen fileName-Kollision ─────────────
      // Zwei Kategorien mit derselben Basename (z.B. Artikelliste/data.xlsx
      // UND OpenWE/data.xlsx) würden mit Array-Key [sampleId, 'data.xlsx']
      // kollidieren (V1 Duplikat-Regel „letzter gewinnt" verliert still die
      // erste Datei). Fix: fileName im IDB-Key trägt den Kategorie-Pfad,
      // Basename bleibt separat für die File-Rekonstruktion.
      const keyedName = `${entry2.name}/${file.name}`; // entry2.name = Ordnername (Originalcase — bei QA-README wörtlich)
      files.push({
        name: keyedName,              // ← IDB-Key-Segment (enthält z.B. `QA-README/readme.md`)
        basename: file.name,          // ← reiner Basename für `new File(...)` im Ingest
        kind,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        category: uploadCategory,     // ← null für QA-README und unbekannte Doku-Ordner
        data: buf,
      });
    }
  }
}
```

- **Rückwärtskompatibilität:** Flache Sample-Ordner funktionieren unverändert — `entry2.kind === 'file'` Pfad behält `name = basename` als Array-Key-Segment.
- **Streaming-Garantie erhalten:** Alle `arrayBuffer()`-Reads passieren weiterhin in Phase 1, außerhalb der Tx. Die Tx wird erst nach Phase 1 geöffnet (`writeSampleAtomically` unverändert).
- **Type-Erweiterung:** `QaSampleFileMeta` bekommt ein optionales Feld `category?: QaCategory | null` **UND** ein neues Pflichtfeld `basename: string`. V1-Legacy-Records haben `basename === name` (Basename == fileName); neue kategorisierte Records haben `name = 'Kategorie/foo.xlsx'` und `basename = 'foo.xlsx'`. **Migration:** Bei V1-Legacy-Records ohne `basename`-Feld fällt `prepareFilesForIngest` via `?? meta.name` auf den alten `name` zurück — keine Daten-Migration nötig.
- **Array-Key-Eigenschaft:** IDB-Array-Keys (`[sampleId, fileName]`) akzeptieren beliebige Strings inkl. Slash. Der Slash im `fileName`-Segment ist lexikographisch einwandfrei (V1-Test #19 hat `'a::b.pdf'` bereits verifiziert — Separator-frei via Array-Key).
- **KISS-Abwägung (verworfene Alternative):** `fileName` als Object `{category, basename}`-Struktur → würde den Array-Key brechen (IDB-Array-Keys erlauben nur flache Strings/Numbers pro Segment). Pfad-als-String ist der Web-Standard (siehe HTML `<input type="file" webkitdirectory>` → `file.webkitRelativePath`).

**C.2.3 `prepareFilesForIngest` — der Brücken-Kern** — neue Funktion in `src/services/qaSamplesService.ts`, platziert direkt vor dem `export const qaSamplesService = {...}` Block (ca. Zeile 363):

```ts
// PROJ-50-DEV: Adapter IDB-Blob → FileSnapshot
// Liefert entweder einen vollständig kategorisierten UploadedFile-Set
// oder ein ok:false-Ergebnis mit präzisem Grund.
import type { UploadedFile } from '@/types';     // ← Rd5/Chef-Fix 4: reiner Type-Import,
                                                 //    bricht C.B-TA1 NICHT (Type-only wird
                                                 //    beim Build entfernt, keine Runtime).

// Rd5/Chef-Fix 4: Struktur exakt wie FileSnapshot aus @/store/types —
// alle 4 Keys SIND REQUIRED mit `UploadedFile | undefined`. TypeScript-Zuweisung
// an `FileSnapshot` ist damit direkt zulässig (structural compat mit identischem Shape).
// Ein optionales Feld `invoice?: ...` wäre NICHT zu `invoice: UploadedFile | undefined`
// zuweisbar (TS: missing property).
export interface QaSampleUploadSet {
  ok: boolean;
  reason?: string;
  snapshot?: {
    invoice:     UploadedFile | undefined;
    articleList: UploadedFile | undefined;
    serialList:  UploadedFile | undefined;
    openWE:      UploadedFile | undefined;
  };
}
// ANMERKUNG: `UploadedFileLike` (frühere Rev 4) ist entfallen — wir nutzen direkt den
// ambienten Type `UploadedFile` aus @/types. Damit ist das Snapshot-Feld strukturell
// identisch zu `FileSnapshot` (src/store/types.ts:52-57) → TS akzeptiert die Zuweisung.

async function prepareFilesForIngest(sampleId: string): Promise<QaSampleUploadSet> {
  const detail = await loadSample(sampleId);
  if (!detail) return { ok: false, reason: `Sample '${sampleId}' nicht gefunden` };

  // Verbinde Blob-Daten mit ihrer Kategorie aus dem Index (fileMeta).
  // fileMeta.name ist der IDB-Key-Segment (V1: basename, Rd5: 'Kategorie/basename').
  const metaByName = new Map<string, QaSampleFileMeta>(
    detail.index.fileMeta.map((m) => [m.name, m]),
  );

  // Rd5/Chef-Fix 4: Initialisiere mit explizit `undefined` auf allen 4 Keys —
  // Snapshot-Shape ist damit ab dem ersten Moment struktur-kompatibel zu FileSnapshot.
  const result: NonNullable<QaSampleUploadSet['snapshot']> = {
    invoice:     undefined,
    articleList: undefined,
    serialList:  undefined,
    openWE:      undefined,
  };

  for (const blob of detail.blobs) {
    if (blob.kind === 'md') continue;            // README/expected.md NICHT in den Ingest

    const meta = metaByName.get(blob.fileName);
    const metaExt = meta as (QaSampleFileMeta & {
      category?: QaCategory | null;
      basename?: string;              // ← Rd5/Chef-Fix 3: neues Pflichtfeld (V1: fehlt)
    }) | undefined;

    // Rd5/Chef-Fix 3: basename = reiner Dateiname ohne Kategorie-Pfad.
    // Legacy-V1-Blobs: basename-Feld fehlt → fallback auf blob.fileName (== basename bei flat).
    const basename = metaExt?.basename ?? blob.fileName;

    const cat: QaCategory | null =
      (metaExt?.category ?? undefined) ??
      classifyFileByName(basename, blob.kind);    // Heuristik auf Basename, NICHT auf Pfad

    if (cat === null) continue;                   // Datei bleibt ungenutzt (kein Fehler)

    // Rd5/Chef-Fix 3: `new File([...], basename, ...)` — der Parser (pdfjs,
    // xlsx-parser, orderParser) liest file.name / file.type intern. Ein
    // Pfad-String 'Artikelliste/data.xlsx' würde zum Beispiel in Error-Messages
    // verwirren ("Kann 'Artikelliste/data.xlsx' nicht parsen"). Wir behalten den
    // reinen Basename für die Parser-sichtbare File-Instanz.
    const file = new File([blob.data], basename, { type: blob.mimeType });

    // Rd5/Chef-Fix 4: Direkt als UploadedFile typisieren (ambient type aus @/types).
    // UploadedFile.type ist `'invoice' | 'openWE' | 'serialList' | 'articleList'` — das ist
    // EXAKT die QaCategory-Union. Kein Cast, kein UploadedFileLike nötig.
    const up: UploadedFile = {
      name: basename,                             // UI-Konsumenten sehen den Basename
      size: blob.data.byteLength,
      type: cat,
      file,
      uploadedAt: detail.index.uploadedAt,
    };

    // Duplikat-Regel: Letzter gewinnt pro Kategorie. Bei 2-Ebenen-Layout (Rd5/Chef-Fix 3)
    // gibt es KEINE Kollision mehr zwischen Kategorien — jede Kategorie hat ihre eigene
    // Tüte, auch wenn zwei Files `data.xlsx` heißen.
    result[cat] = up;
  }

  // Rd10/Lead-Dev-Fix 2: QA-README ist Pflicht. Defense-in-Depth — die UI blockiert
  // den Button zwar bereits, aber der Service soll auch unabhängig vom UI-Pfad
  // abweisen, falls künftig ein Aufruf außerhalb des SettingsPopup hinzukäme.
  const hasQaReadmeBlob = detail.blobs.some(
    (b) => b.kind === 'md' && b.fileName.toLowerCase().startsWith('qa-readme/'),
  );
  if (!hasQaReadmeBlob) {
    return { ok: false, reason: 'Sample ohne QA-README-Ordner — Soll-Kontrakt fehlt' };
  }

  // Pflicht-Validierung (gleiche Ordnung wie ingestAndPersistRunData)
  if (!result.invoice)     return { ok: false, reason: 'Sample ohne PDF — kein Invoice erkennbar' };
  if (!result.articleList) return { ok: false, reason: 'Sample ohne Artikelliste — Pflichtdatei' };
  if (!result.openWE)      return { ok: false, reason: 'Sample ohne openWE — Pflichtdatei' };
  // serialList bleibt optional (ingestSlice.ts:430-434 dokumentiert: 'not_provided' OK)

  return { ok: true, snapshot: result };
}

// Heuristik-Fallback für V1-flache Samples (kein Kategorie-Tag im fileMeta).
// WICHTIG (Rd5/Chef-Fix 3): Input ist der BASENAME, NICHT der Pfad — damit die Regex-
// Matches nicht versehentlich auf Kategorie-Namen im Pfad greifen.
function classifyFileByName(basename: string, kind: QaFileKind): QaCategory | null {
  if (kind === 'pdf') return 'invoice';
  const lower = basename.toLowerCase();
  if (kind === 'json') return null;              // JSONs bleiben unkategorisiert — keine Produktiv-Rolle
  // xlsx-artige (in V1 werden nur pdf/json/md akzeptiert — diese Zweig ist Future-Proof)
  if (/(artikel|stamm|master)/.test(lower)) return 'articleList';
  if (/(openwe|bestell|orders|we_|wareneingang)/.test(lower)) return 'openWE';
  if (/(serial|seriennr|s-n|_sn)/.test(lower)) return 'serialList';
  return null;
}
```

- **Invariante C.2-INV-1:** `prepareFilesForIngest` importiert **nicht** `runStore`, `runPersistenceService`, `fileStorageService`, `globalConfig`. Das Rekonstruieren von `File`-Objekten ist browser-native (`new File([...])`), keine Service-Importe. C.B-TA1 bleibt eingehalten.
- **Stolperstein:** V1 nimmt nur `.pdf`/`.json`/`.md` an (`classify` Zeile 71-77). Artikellisten (xlsx) und openWE (csv/xlsx/xml) lassen sich **heute nicht** in die Giftküche laden. **Konsequenz:** V1-Giftküche alleine kann **nicht** einen vollen Testlauf feuern. Zwei Pfade zur Auflösung, beide in diesem Plan enthalten:
  - **Pfad A (Diese Brücke, MVP):** `classify()`-Whitelist in `qaSamplesService.ts:71-77` um Rechnungs-/Stammdaten-Endungen erweitern (`.xlsx`, `.xls`, `.csv`, `.xml`). Siehe C.2.4.
  - **Pfad B (nur wenn Dom Pfad A ablehnt):** Block C bleibt auf Mini-Samples beschränkt (nur PDF) und die Brücke dokumentiert „Artikelliste/openWE muss separat bereitgestellt werden" — Anti-KISS, verworfen.
- **Entscheidung:** **Pfad A**, siehe C.2.4.

**C.2.4 `classify`/`QaFileKind`-Erweiterung** — `src/services/qaSamplesService.ts:17, 71-77`

```ts
// VORHER:
export type QaFileKind = 'pdf' | 'json' | 'md';

function classify(filename: string): QaFileKind | 'other' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'md';
  return 'other';
}

// NACHHER:
export type QaFileKind = 'pdf' | 'json' | 'md' | 'xlsx' | 'xls' | 'csv' | 'xml';

function classify(filename: string): QaFileKind | 'other' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf'))  return 'pdf';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md'))   return 'md';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls'))  return 'xls';
  if (lower.endsWith('.csv'))  return 'csv';
  if (lower.endsWith('.xml'))  return 'xml';
  return 'other';
}
```

- **Stolperstein:** Die V1-Pflichtbedingung „Sample muss mindestens ein PDF enthalten" (Zeile 179: `if (!files.some((f) => f.kind === 'pdf'))`) bleibt unverändert → Samples ohne PDF werden weiterhin übersprungen. Das ist korrekt: ohne PDF kein Run.
- **Stolperstein:** `classifyFileByName`-Heuristik (C.2.3) greift nur für `kind === 'pdf' | 'xlsx' | 'xls' | 'csv' | 'xml'`. `.json` bleibt weiterhin untypisiert — es war in V1 ohnehin rein metadaten-artig. Das ist akzeptabel, weil `UploadedFile.type` **keinen** JSON-Typ kennt.
- **Migrationsrisiko:** Bestehende V1-Samples haben nur pdf/json/md-Blobs — die neue `classify`-Whitelist ist rein additiv, **keine** bestehenden IDB-Records werden invalid. `QaSampleFileMeta.kind` ist im Index-Store als `QaFileKind`-Literal serialisiert; alte Records haben `'pdf'|'json'|'md'` → decken weiterhin den erweiterten Union ab. ✓

**C.2.5 Public-API-Export** — `src/services/qaSamplesService.ts:365-373` (Export-Objekt `qaSamplesService`)

```ts
// NACHHER:
export const qaSamplesService = {
  isAvailable,
  ingestDirectory,
  loadAllSummaries,
  loadSample,
  deleteSample,
  clearAll,
  getStats,
  prepareFilesForIngest,        // ← NEU
};
```

- Types `QaSampleUploadSet`, `QaFolderKind`, `QaCategory` werden named exportiert (für SettingsPopup). *(HISTORISCH - NICHT UMSETZEN: `UploadedFileLike` aus Rev 4 ist seit C.2.3-Rev-5 entfallen — `prepareFilesForIngest` nutzt direkt `UploadedFile` aus `@/types` als Type-only-Import.)*

**C.2.6 Injection-Handler in SettingsPopup** — neuer Handler nach `handleOpenSampleDetail` (§C.1.2):

```ts
// PROJ-50-DEV: Testlauf starten
const handleStartSampleTestRun = useCallback(async (sampleId: string) => {
  ifMounted(() => setQaBusy(true));
  // Early close — Dialog muss nicht auf die Engine-Kette warten.
  ifMounted(() => setSampleDetailDialogOpen(false));

  let currentRunId: string | null = null;
  try {
    const uploadSet = await qaSamplesService.prepareFilesForIngest(sampleId);
    if (!uploadSet.ok || !uploadSet.snapshot) {
      ifMounted(() => toast.error(
        `QA-Ingest abgebrochen: ${uploadSet.reason ?? 'Unbekannter Grund'}`,
      ));
      return;
    }

    const fileSnapshot = uploadSet.snapshot;
    const store = useRunStore.getState();

    currentRunId = await store.createRunSkeleton();
    // Rd15/Schnüffler-Fix (ES2020-Kompatibilität, ersetzt Rd11-Form):
    //   `String.prototype.replaceAll` ist ES2021. tsconfig.app.json nutzt `"target": "ES2020"`
    //   und `"lib": ["ES2020", "DOM", "DOM.Iterable"]` — d.h. `sampleId.replaceAll(...)` wirft
    //   TS2339 „Property 'replaceAll' does not exist on type 'string'". Kein Lib-Bump, kein
    //   globales Regex — stattdessen KISS: `split(' ').join('_')` funktioniert auf jeder ES-Version.
    //
    //   Reihenfolge (KRITISCH): `trim()` ZUERST entfernt führende/abschließende Leerzeichen,
    //   DANACH wandelt `split(' ').join('_')` die verbliebenen internen Leerzeichen in `_`.
    //   Die umgekehrte Reihenfolge wäre ein Bug — trim entfernt nur Whitespace, niemals `_`.
    //   Beispiele:
    //     "  Mein Sample  ".trim().split(' ').join('_')  → "Mein_Sample"   ✓
    //     "  Mein Sample  ".split(' ').join('_').trim()  → "__Mein_Sample__" ✗ (Bug-Form)
    //
    //   EINZIGE SSOT: `qaRunPrefix` wird genau HIER konstruiert — sonst nirgends.
    const qaRunPrefix = `QA-${sampleId.trim().split(' ').join('_')}`;
    const finalRunId = await store.parseInvoiceForIngest(
      currentRunId,
      fileSnapshot,
      qaRunPrefix,                   // ← Rd15: ES2020-kompatible Single-Source-Konstante
    );
    currentRunId = finalRunId;

    const ingestResult = await store.ingestAndPersistRunData(
      finalRunId,
      fileSnapshot,
    );
    if (!ingestResult.allReady) {
      await store.cleanupFailedIngest(finalRunId);
      ifMounted(() => toast.error(
        `QA-Ingest gescheitert: ${ingestResult.failedSources.join(', ')}`,
      ));
      currentRunId = null;
      return;
    }

    await store.startWorkflowPhase2(finalRunId);

    // Rd7/Chef-Fix 1: EXPLIZITE Navigation zur RunDetail-Seite.
    // NewRun.tsx:90 nutzt dasselbe Pattern (navigate(`/run/${encodeURIComponent(finalRunId)}`)).
    // Die Engine triggert KEIN Auto-Routing — ohne diesen Aufruf bleibt der User im Popup hängen.
    ifMounted(() => {
      toast.success(`QA-Run gestartet: ${finalRunId}`);
      onOpenChange(false);                                     // Popup schliessen
      navigate(`/run/${encodeURIComponent(finalRunId)}`);      // ← Rd7/Chef-Fix 1
    });
  } catch (e: unknown) {
    const err = e as { message?: string } | null;
    if (currentRunId) {
      // Best-effort cleanup — auch wenn cleanupFailedIngest selbst wirft.
      try {
        await useRunStore.getState().cleanupFailedIngest(currentRunId);
      } catch (cleanupErr) {
        console.error('[QA] cleanupFailedIngest failed:', cleanupErr);
      }
    }
    ifMounted(() => toast.error(`QA-Run fehlgeschlagen: ${err?.message ?? 'Unbekannt'}`));
  } finally {
    ifMounted(() => setQaBusy(false));
  }
  // Rd11/Schnüffler-Fix 3: `navigate` MUSS im Dep-Array stehen — React-Hooks-
  //   exhaustive-deps-Vorgabe. `navigate` ist die Referenz aus `useNavigate()` und
  //   kann zwischen Renders ersetzt werden, wenn sich der Router-Kontext ändert.
  //   Ohne diese Dep entsteht eine Stale-Closure, die bei Router-Remount auf eine
  //   tote navigate-Referenz zeigt.
}, [ifMounted, onOpenChange, navigate]);
```

- `useRunStore` wird am Dateikopf (`SettingsPopup.tsx:13`) bereits importiert.
- `useRunStore.getState()` — S2-konform (Callbacks lesen punktuell, nicht reaktiv).
- **Rd7/Chef-Fix 1 — `useNavigate`-Import:** Am Dateikopf von `SettingsPopup.tsx` ergänzen: `import { useNavigate } from 'react-router-dom';`. Innerhalb der Komponente: `const navigate = useNavigate();` direkt bei den anderen Hook-Deklarationen. **Kollisionsprüfung:** `react-router-dom` ist bereits in `NewRun.tsx` im Einsatz — kein neuer Dep. SettingsPopup wird im Router-Tree (AppFooter → Router → Page → Popup) gerendert, daher ist `useNavigate` hier zulässig und crasht nicht. **Rd11/Schnüffler-Fix 3:** Dep-Array von `useCallback` MUSS `[ifMounted, onOpenChange, navigate]` enthalten (navigate nicht vergessen — exhaustive-deps-Lint).
- **Stolperstein:** Die Reihenfolge `createRunSkeleton → parseInvoiceForIngest → ingestAndPersistRunData → startWorkflowPhase2` ist **verbindlich** und 1:1 aus `NewRun.tsx:70-95` kopiert. Jede Abweichung (z.B. `startWorkflowPhase2` vor `ingestAndPersistRunData`) würde A1/A18 verletzen.
- **Stolperstein:** `await store.startWorkflowPhase2(...)` läuft erst nach erfolgreichem Ingest. Auto-Advance der Engine (A5) feuert ab Step 2 — **nicht** auf unserem Stack. Der User-thread hier ist nach `startWorkflowPhase2` fertig; die Engine läuft async weiter. Popup-Schließen danach ist sicher.
- `QaCategory` ist typgleich zu `UploadedFile['type']` → direkter Snapshot-Feed klappt ohne Cast.
- **Rd9/Lead-Dev-Fix 1 (User-Choice statt Hart-Block):** Der frühere Rd5-Pre-Check im Handler-Body *(HISTORISCH - NICHT UMSETZEN: `isProductiveRunActiveNow`-Toast-Warning + Early-Return)* **entfällt**. Die Autorisierung passiert jetzt außerhalb des Handlers via `OverwriteActiveRunDialog` (§C.1.3.1). Wenn `handleStartSampleTestRun` überhaupt aufgerufen wird, bedeutet das entweder: (a) kein Produktivlauf aktiv → direkter Trigger aus dem „Testlauf starten"-Button, oder (b) User hat bewusst im Overwrite-Dialog auf „OK" geklickt → Überschreiben ist autorisiert. In beiden Fällen läuft der Handler-Body unverändert.
- **Warum KEIN doppelter Store-Pre-Check mehr?** Der stumme Hart-Block war Defense-in-Depth gegen DevTools-Manipulation (damals: `disabled`-Prop). Mit der User-Choice-Lösung ist die Autorisierung **explizit** — ein DevTools-Anwender, der den Dialog umgeht, weiß, was er tut (operative Entscheidung, kein stiller Unfall). Die CIRCUIT-Invarianten A1/A13/A16 schützen weiterhin die Engine-Ebene (Store schützt sich selbst gegen doppelte Writes).

**C.2.7 Guard-Selektoren (Rd10 — zwei getrennte Selektoren statt einem Sammeltopf)** — neue Zeilen direkt unter den State-Hooks aus §C.1.2, vor `handleOpenSampleDetail`:

Rd10 spaltet den ehemaligen Sammel-Selektor *(HISTORISCH - NICHT UMSETZEN: `isProductiveRunActive`)* in zwei semantisch präzise Selektoren auf:

- **`isEngineBusy`** — TRUE wenn die Engine gerade rechnet (Hard-Block-Bedingung).
- **`hasIdleWorkflowData`** — TRUE wenn ein `currentRun` existiert, der NICHT `isEngineBusy` ist (User-Choice-Bedingung).

Die beiden Selektoren sind **disjunkt** (niemals beide `true` gleichzeitig) und decken zusammen mit dem Leerzustand (`currentRun === null && !isEngineBusy`) alle drei Entscheidungs-Branches im „Testlauf starten"-onClick ab.

```ts
// PROJ-50-DEV Rd10/Lead-Dev-Fix 1 (ersetzt Rd7/Chef-Fix 2 + Rd9/Lead-Dev-Fix 1):
//
// Zwei Selektoren, disjunkte Semantik:
//   - isEngineBusy:        Engine rechnet gerade (Hard-Block — Toast + kein Dispatch).
//   - hasIdleWorkflowData: Ein Run liegt im Store, die Engine rechnet aber NICHT
//                          (User-Choice — AlertDialog „überschreiben?").
//
// Kontext: createRunSkeleton → resetRunSensitiveState leert die Felder
//   preFilteredSerials, serialDocument, parsedPositions, parsedInvoiceResult.
//
// Hard-Block (isEngineBusy) — wirklich gefährliche Store-Zustände:
//   (a) isProcessing === true        → Phase 1 (Ingest) läuft gerade (Primärwriter: createRunSkeleton/
//                                       ingestAndPersistRunData in ingestSlice.ts).
//   (b) ein Step hat status='running' bei run.status='running' → Phase 2 Execute läuft
//                                       (würde run-sensitive Felder verlieren; siehe I.md A16/A17).
//   (c) isPaused === true             → Resume würde nach Reset ohne preFilteredSerials/
//                                       parsedPositions starten → Step-3/4-Fehlverhalten.
//   (d) isWaitingBeforeStep4 === true → User wartet interaktiv auf „Weiter" — Reset zerstört
//                                       parsedPositions und der Waiting-Dialog-Pfad bricht.
//
// User-Choice (hasIdleWorkflowData) — Runs, deren Überschreiben OK sein KANN, aber nicht MUSS:
//   - status === 'soft-fail' / 'failed' / 'ok' ohne laufende Engine:
//     Daten liegen noch im Store (und ggf. IDB), könnten beim Skeleton-Reset verloren gehen.
//     User entscheidet bewusst per AlertDialog.
//
// Sofort-Dispatch:
//   - currentRun === null UND isEngineBusy === false → nichts zu verlieren, direkt starten.
const isEngineBusy = useRunStore((s) => {
  if (s.isProcessing) return true;                  // (a) Phase 1 — harter Primärwriter-Marker
  if (s.isPaused) return true;                      // (c) Resume-Gefahr
  if (s.isWaitingBeforeStep4) return true;          // (d) User wartet interaktiv
  const cr = s.currentRun;
  if (!cr) return false;
  // Rd8/Zombie-Guard: Run-Status ist Master-Wahrheit. Ein gecrashter Run kann einen
  //   `running`-Step als Zombie-Leiche in IDB hinterlassen (Browser zu während Execute,
  //   I.md A2 — kein automatischer Übergang running→failed). Bei Rehydration ist dann
  //   run.status='failed' (User hat reagiert), aber steps[n].status='running' (stuck).
  //   Ohne dieses Gate würde der Test-Button für immer blockiert bleiben.
  // Nur `run.status === 'running'` ist ein ECHT aktiver Run. Alles andere (ok/soft-fail/
  //   failed) → Run ist abgeschlossen, Step-Status irrelevant (potenzielle Leiche).
  if (cr.status !== 'running') return false;
  // (b) Phase 2 Execute läuft — Run-Status 'running' UND ein Step 'running'
  return cr.steps.some((st) => st.status === 'running');
});

// Rd10/Lead-Dev-Fix 1: Zweiter Selektor — „Run liegt idle im Store, Engine rechnet NICHT".
// Disjunkt zu isEngineBusy: wenn isEngineBusy=true, bleibt hasIdleWorkflowData=false
// (der Frühexit `if (engineBusy) return false;` im Selektor stellt das sicher).
const hasIdleWorkflowData = useRunStore((s) => {
  // Wenn Engine-Busy (gleiche Bedingung wie oben) → disjunkt markieren, damit beide
  // Selektoren niemals gleichzeitig true sind (verhindert doppelte Dialoge).
  const engineBusy =
    s.isProcessing ||
    s.isPaused ||
    s.isWaitingBeforeStep4 ||
    (s.currentRun?.status === 'running' &&
     s.currentRun.steps.some((st) => st.status === 'running'));
  if (engineBusy) return false;
  return s.currentRun != null;          // Rest-Daten vorhanden (ok/soft-fail/failed) → User-Choice
});
```

- **Stolperstein A15 (React-Mount & Store-Deps):** Der Selector liest 4 primitive Booleans und `currentRun.steps` — letzterer ist ein Array, aber wir projizieren auf `boolean` via `.some(...)`. Zustand-Selector-Equality: Return-Wert ist primitiv → keine Re-Render-Loops. (A15 bleibt gewahrt.)
- **Stolperstein A13 (Idempotenz):** `setCurrentRun(null)` triggert einen Selector-Re-Run → Selector gibt `false` → Button wird enabled. Korrekt.
- **Stolperstein — Statelose Rückfall-Runs:** Runs im Status `'ok'`/`'soft-fail'`/`'failed'` **ohne** running-Step werden **NICHT** blockiert. Begründung: nach Export (ok) oder finalem Fail gibt es nichts mehr zu zerstören; `resetRunSensitiveState` räumt lediglich bereits archivierte/aufgegebene Daten weg. Der Chef hat das Rd7 explizit entschärft.
- **Stolperstein — Zombie-running-Step (Rd8-Regression-Fix):** Ein Browser-Crash oder Tab-Kill während Execute-Funktion hinterlässt einen `steps[n].status === 'running'`, der beim IDB-Rehydrate „eingefroren" bleibt (I.md A2: Einbahnstraßen-Übergänge, kein Auto-Recovery zu `failed`). Der Run-Level-Status wird typischerweise nachträglich auf `'failed'` gesetzt (User-Reaktion oder Recovery-Pfad), aber der Step-Zustand bleibt `running`. **Ohne das Rd8-Gate `cr.status !== 'running' → return false`** hätte der alte Guard den Test-Button für **gestern-gecrashte-Runs im heutigen Browser für immer** deaktiviert. Die Run-Status-Gate-Prüfung VOR der Step-Iteration löst das: Master-Wahrheit ist der Run-Status, Step-Status ist nachgelagerte Information.
- **Stolperstein — künftige Status-Erweiterungen:** Wenn `StepStatus` um `'queued'`/`'pending-async'` o.ä. erweitert wird, muss evaluiert werden, ob der neue Status in den „running"-ähnlichen Block gehört. Dokumentiert als Tech-Debt-Hook in §8 Fallstrick 14.
- **Rd7/Rd8-Verifikation gegen echten Code:** `isProcessing`/`isPaused`/`isWaitingBeforeStep4` sind reale Store-Felder — `ingestSlice.ts:267-270` schreibt `isProcessing: true`, `runCrudSlice.ts`/`workflowSlice.ts` pflegen `isPaused`, `ingestSlice.ts:530-536` pflegt `isWaitingBeforeStep4` in `startWorkflowPhase2`. `run.status` ist der Run-Level-Wahrheitsstatus aus `types/index.ts:272` (`StepStatus`-Enum — ist identisch zu Step-Status-Enum, aber Run-Level gepflegt durch `updateRunStatus` in runCrudSlice). Der Selector ist kollisionsfrei.

---

### Block C.3 — Das Run-Naming (Custom Title)

**C.3.0 Architektur-Entscheidung „Hinterzimmer": Parameter statt Store-Flag (Rd6/Chef-Fix 2 + 3)**

Der Chef nennt den Übergabeweg „das Hinterzimmer": ein dedizierter, transienter Kanal, durch den der QA-Pfad dem Produktiv-Ingest genau ein Bit Zusatz-Information zuspielt (den Custom-Run-Title) — und nur wenn er existiert, greift die Namens-Erzeugung zu. Wenn das Hinterzimmer leer ist, läuft der normale Produktivlauf 1:1.

**Verworfene Alternative: Globales Store-Feld (z. B. `pendingQaRunTitle` in `ingestSlice`)**

```ts
// SO NICHT — Anti-Pattern:
set({ pendingQaRunTitle: `QA-${sampleId}` });
await store.createRunSkeleton();                 // liest pendingQaRunTitle
// ... set({ pendingQaRunTitle: null });         // DIESER CLEANUP KANN VERGESSEN WERDEN
```

| Kriterium | Globales Store-Feld | Function-Parameter (GEWÄHLT) |
|---|---|---|
| Lifetime | Persistent im Zustand-Store bis manuell gelöscht | Lebt NUR während `parseInvoiceForIngest`-Stack-Frame |
| Cleanup-Verantwortung | Entwickler muss `set({ pendingQaRunTitle: null })` explizit rufen — auf **jedem** Exit-Pfad (Happy, Catch, Cleanup, Exception, Tab-Close mitten im Ingest) | JavaScript-Engine: Scope verlassen → Parameter-Binding GCt automatisch |
| Leichen-Gefahr bei Fehlerpfaden | Hoch — jeder vergessene Exit = nächster Produktivlauf mit `QA-`-Präfix kontaminiert | Null — Stack-Frame existiert nicht mehr nach Return/Throw |
| Thread-Sichtbarkeit | Global lesbar aus jeder Slice-Action → Fremdleser-Risiko | Nur `parseInvoiceForIngest`-intern → kein Fremdleser |
| Test-Isolation | Bei Unit-Tests muss vor jedem Test das Flag manuell resettet werden | Kein Reset nötig — neuer Funktionsaufruf, neuer Scope |
| Store-Deps (INV A15) | Feld würde reaktiv getrackt → mögliche Re-Render-Effekte | Parameter-Read findet im Action-Body statt, kein React-Hook-Konflikt |
| Serialisierung nach IDB | Feld könnte über `buildAutoSavePayload` versehentlich mit-persistiert werden | Parameter lebt nie im `run`-Objekt, nie im Store → kein Persistenz-Leak |

**Fazit:** Der Function-Parameter ist **strukturell leichenfrei** — kein Entwickler kann den Cleanup vergessen, weil es keinen gibt. Das Hinterzimmer wird vom Runtime selbst geräumt, sobald die Funktion terminiert (Return, Throw, Early-Return). Die einzige Voraussetzung: der Parameter-Wert darf nicht irgendwo anders (in `set()`-Call, in `buildAutoSavePayload`, in einem Modul-Level-Let) zwischengespeichert werden.

**Die Hinterzimmer-Metapher übersetzt sich damit 1:1 in Code:**

```ts
parseInvoiceForIngest: async (runId, fileSnapshot, customRunTitle) => {
  //                                                  ^^^^^^^^^^^^^^ ← Hinterzimmer
  // … PDF parsen … updateRunWithParsedData … renameRun …
  const trimmedTitle = customRunTitle?.trim() ?? '';
  if (trimmedTitle.length > 0) {
    // Hinterzimmer gefüllt → Namens-Erzeugung greift.
    set((state) => ({ /* Präfix-Patch auf finalRunId */ }));
  }
  // Ab hier: Funktion endet. customRunTitle-Binding läuft out-of-scope.
  // JavaScript-GC: frei. Kein weiterer Code-Pfad kann den Wert lesen.
  return finalRunId;
},
```

**C.6-INV-1 (Hinterzimmer-Cleanup, Phase-V-Pflicht — vollständig definiert in §9.0):**
- Verbot: Kein Modul-Level-Let, kein Store-Feld, kein Closure, das `customRunTitle` oder dessen Ableitungen nach dem Funktionsaustritt am Leben hält.
- Verbot: `customRunTitle` erscheint NICHT im Body von `buildAutoSavePayload`, NICHT im Body von `saveRun`, NICHT im Body von `renameRun`, NICHT im Body von `updateRunWithParsedData`. Er wird **ausschließlich** in `parseInvoiceForIngest` gelesen und nie zwischengespeichert.
- Konsequenz: Der gepatchte `run.invoice.fattura`-Wert ist die einzige sichtbare Spur des Titels — das ist Absicht und gewollt. Der Titel lebt fortan im Run-Objekt, NICHT als separate Variable.

**Warum wir NICHT den RunID-Generator anfassen:** `generateRunId(fatturaNumber)` baut die ID aus einem einzigen Eingabewert. Ihn um einen `customRunTitle` zu erweitern hieße, seine Signatur zu ändern (alle Aufrufer in `runCrudSlice.ts:361,402` und `ingestSlice.ts:307` müssten sich anpassen). Das ist **invasiver** als der 6-Zeilen-Patch am Ende von `parseInvoiceForIngest`. KISS wählt den kleineren Blast-Radius.

**Warum wir NICHT in `updateRunWithParsedData` patchen:** `updateRunWithParsedData` ist Primärwriter für `run.invoice` (C.md A5-Ownership-Regel). Ein QA-spezifischer Präfix hätte dort fachlich nichts zu suchen — die Funktion arbeitet mit dem Parser-Ergebnis, nicht mit UI-Dekoration. Der Patch BLEIBT in `parseInvoiceForIngest`, dem einzigen Ort, an dem das Hinterzimmer bekannt ist.

---

**C.3.1 Signatur-Erweiterung in `RunState`** — `src/store/types.ts`

- Dort wo `parseInvoiceForIngest` in der Typdefinition steht (bitte via `grep -n "parseInvoiceForIngest" src/store/types.ts` direkt vor Implementation in Phase V verifizieren), Signatur ändern von:

  ```ts
  parseInvoiceForIngest: (runId: string, fileSnapshot: FileSnapshot) => Promise<string>;
  ```

  zu:

  ```ts
  parseInvoiceForIngest: (
    runId: string,
    fileSnapshot: FileSnapshot,
    customRunTitle?: string,
  ) => Promise<string>;
  ```

**C.3.2 Body-Erweiterung in `ingestSlice.ts:290-321`** — am Ende der Funktion, NACH dem `renameRun`-Call, VOR `return finalRunId`:

```ts
// VORHER (src/store/slices/ingestSlice.ts:290-321 — vereinfacht):
parseInvoiceForIngest: async (runId, fileSnapshot) => {
  if (!fileSnapshot.invoice?.file) throw new Error('Keine Rechnung hochgeladen (PDF fehlt)');
  set({ parsingProgress: 'Lese PDF...' });
  const result = await parseInvoicePDF(fileSnapshot.invoice.file, runId);
  get().setParsedInvoiceResult(result);
  get().updateRunWithParsedData(runId, result, false);

  let finalRunId = runId;
  if (result.header.fatturaNumber) {
    const newRunId = generateRunId(result.header.fatturaNumber);
    get().renameRun(runId, newRunId);
    finalRunId = newRunId;
  }

  logService.info(`[Phase1] PDF geparst: ${result.lines.length} Positionen, finalRunId=${finalRunId}`, {
    runId: finalRunId, step: 'Rechnung auslesen',
  });
  return finalRunId;
},

// NACHHER:
parseInvoiceForIngest: async (runId, fileSnapshot, customRunTitle) => {
  if (!fileSnapshot.invoice?.file) throw new Error('Keine Rechnung hochgeladen (PDF fehlt)');
  set({ parsingProgress: 'Lese PDF...' });
  const result = await parseInvoicePDF(fileSnapshot.invoice.file, runId);
  get().setParsedInvoiceResult(result);
  get().updateRunWithParsedData(runId, result, false);

  let finalRunId = runId;
  if (result.header.fatturaNumber) {
    const newRunId = generateRunId(result.header.fatturaNumber);
    get().renameRun(runId, newRunId);
    finalRunId = newRunId;
  }

  // PROJ-50-DEV C.3: customRunTitle-Präfix NACH renameRun — sonst Zielscheibe verloren.
  // Rd15/Lead-Dev-Fix 3: KISS-Präfix `qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\`` (gesetzt im
  // SettingsPopup-Handler). Hier in ingestSlice.ts nehmen wir den Wert WIE ÜBERGEBEN entgegen
  // und konkatenieren ihn ohne Separator vor r.invoice.fattura. Keine Sanitization hier —
  // sie passiert einmal und genau einmal am Konstruktionsort (siehe §7 C.2.6). Das hält
  // `replace(/\D/g, '').slice(-5)` an CIRCUIT-A12/A13-Vergleichspunkten treffsicher und
  // lässt die Rechnungsnummer unverfälscht durch den Parser-/Matcher-Stack fließen.
  const trimmedTitle = customRunTitle?.trim() ?? '';
  if (trimmedTitle.length > 0) {
    set((state) => ({
      runs: state.runs.map((r) =>
        r.id === finalRunId
          ? { ...r, invoice: { ...r.invoice, fattura: `${trimmedTitle}${r.invoice.fattura}` } }
          : r,
      ),
      currentRun:
        state.currentRun?.id === finalRunId
          ? {
              ...state.currentRun,
              invoice: {
                ...state.currentRun.invoice,
                fattura: `${trimmedTitle}${state.currentRun.invoice.fattura}`,
              },
            }
          : state.currentRun,
    }));
  }

  logService.info(`[Phase1] PDF geparst: ${result.lines.length} Positionen, finalRunId=${finalRunId}${trimmedTitle ? `, customTitle='${trimmedTitle}'` : ''}`, {
    runId: finalRunId, step: 'Rechnung auslesen',
  });
  return finalRunId;
},
```

- **Stolperstein A (C.3-INV-1, erneut):** Patch NACH `renameRun` ausgeführt — sonst zielt er auf die alte runId.
- **Stolperstein B:** Nicht via `updateRunWithParsedData` o.ä. routen — das ist ein Ingest-Primärwriter und darf nicht mit UI-Dekoration angereichert werden (C.md A5-Ownership).
- **Stolperstein C:** `state.currentRun` wird separat gepatcht (zwei getrennte Referenzen im Store — `runs[]` und `currentRun`). Wenn wir nur `runs` patchen, sieht die UI den alten `fattura`-Wert bis zum nächsten `set({currentRun:...})`. Der zweite Patch-Block oben löst das explizit.
- **Stolperstein D (Invarianten A1, A5):** Wir schreiben **keine** `steps[].status` und ändern **keinen** Workflow-Zustand. Der Patch ist rein ein Anzeige-String-Update auf dem Invoice-Header. C.md A5-Ownership (`run.steps[].status` Writer) wird nicht verletzt.
- **Stolperstein E (buildAutoSavePayload):** `saveIngestSnapshot` (in `ingestAndPersistRunData:338-352`) ruft `buildAutoSavePayload(runId)`. Dieser Builder liest `run.invoice.fattura` aus dem Store — nach unserem Patch liegt dort bereits der Präfix-Wert → wird automatisch nach IDB persistiert (Test C13). Kein Extra-Save nötig.

**C.3.3 Default-Aufrufer unverändert** — `src/pages/NewRun.tsx:81`

- Ruft `parseInvoiceForIngest(currentRunId, fileSnapshot)` ohne 3. Parameter. TypeScript-Kontrakt (optional) → 100 % rückwärtskompatibel. Test C11.

---

## 8. Hinweise für Coder-LLM (Sonnet)

### Fallstricke & geschützte Beziehungen

1. **`writeSampleAtomically` NICHT anfassen.** INV-WSA-1..6 aus V1 (Basis Sektion 9.0) sind Gesetz. Die neue 2-Ebenen-Scan-Logik modifiziert ausschließlich Phase 1 (FS-Read) in `ingestDirectory` — NICHT Phase 2 (IDB-Tx).
2. **Streaming-Loop unverändert.** Die 2-Ebenen-Scan-Variante liest pro Sub-Sub-Ordner weiterhin `await file.arrayBuffer()` synchron im Phase-1-Block. Puffer werden NACH `writeSampleAtomically` wie gehabt out-of-scope gelassen. Test #18 (RAM-Trajektorie, Basis) MUSS weiter grün sein.
3. **Keine neuen Seiteneffekte in `addUploadedFile` triggern.** Der QA-Adapter umgeht `state.uploadedFiles` komplett — er schreibt direkt in `fileSnapshot` und ruft `parseInvoiceForIngest`/`ingestAndPersistRunData` mit diesem Snapshot. Einzige Folge: `falmec-receiptpro-files` (Produktions-Upload-DB) wird **nicht** beschrieben; `masterDataStore` wird nur von `ingestAndPersistRunData:403` aktualisiert (wie beim normalen Run) — das ist ein beabsichtigter Side-Effect der Engine, nicht des Adapters.
4. **C.B-TA1 strikt einhalten:** In `qaSamplesService.ts` dürfen **keine** Importe von `runStore`, `runPersistenceService`, `fileStorageService`, `globalConfig` hinzukommen. `prepareFilesForIngest` verwendet **nur** `new File([ArrayBuffer], name, { type })` (Web-API), `loadSample` (intern) und den neuen `classifyCategoryFolder`/`classifyFileByName`-Helper.
5. **A16 Lifecycle:** Wenn der User das Popup **während** `parseInvoiceForIngest` schließt, läuft die Engine wie bei NewRun weiter. Popup-Close-Logik wird NICHT zum Engine-Killer — auch nicht durch `setCurrentRun(null)` oder `resetRunSensitiveState`. Der bereits existierende `isMountedRef`-Guard schützt nur UI-State, nicht Engine-State.
6. **A13 Idempotenz:** Keine Änderung nötig — die Kette `createRunSkeleton → parseInvoiceForIngest` erzeugt für jeden Aufruf eine neue `run-{ts}`-ID, Rename → `Fattura-...-{ts}`. Zweite QA-Ingestion im selben Sekunden-Fenster kollidiert an der Timestamp-Kante (1-Sekunden-Granularität) — Lösung hierfür ist in V1 `generateRunId` bereits nicht vorgesehen. Dom akzeptiert das als V1-Schuld.
7. **Keine `globalConfig`-Änderung:** Der QA-Run nutzt denselben `globalConfig` wie normale Runs (siehe `createRunSkeleton` Zeile 234 `const { globalConfig } = get()`). Das ist gewollt — QA-Samples sollen gegen den produktiven Parser-/Matcher-Stack laufen, sonst wäre der Test wertlos.
8. **Auto-advance ist Engine-Sache, Navigation ist Handler-Pflicht (Rd7/Chef-Fix 1 + Rd11-Dep-Array):** Nach `startWorkflowPhase2` läuft die Engine via `advanceToNextStep(runId)` autonom. Der Dialog darf gefahrlos schließen. **Navigation zur Run-Detail-Seite ist Pflicht-Scope** — `NewRun.tsx:89` navigiert explizit, die Engine routet NICHT automatisch. Rd7/Chef-Fix 1 verlangt daher `import { useNavigate } from 'react-router-dom'` im Dateikopf von `SettingsPopup.tsx` und `navigate(\`/run/${encodeURIComponent(finalRunId)}\`)` nach `startWorkflowPhase2`. Rd11-Dep-Array: `[ifMounted, onOpenChange, navigate]`. *(HISTORISCH - NICHT UMSETZEN: Die frühere Pre-Rd7-Aussage „kein Plan-Scope, kein useNavigate-Import" ist durch Rd7/Rd11 überholt.)*
9. **Tab-Styling & Dialog-Styling:** AlertDialog nutzt `backgroundColor: '#D8E6E7'` (Pattern Zeile 1646). `FooterButton` ist der bevorzugte Button-Wrapper für sichtbare Aktions-Buttons in der Test-Arena. **Ausnahme:** Der `Sample Regex`-Trigger in §C.1.5 ist ein reiner Tailwind-styled `<button>` (kein AlertDialogTrigger, keine Inline-Hex-Farben — nutzt `text-primary underline` via Tailwind-Utilities). Das ist zulässig und S.md-S4/S5-konform, weil er keinen Klick-Handler mit Business-Logik trägt, sondern nur einen Dialog öffnet. Keine *weiteren* neuen `<button>`-Elemente, keine Inline-Styles.
10. **`QaSampleCard` darf kein `<button>` werden.** `AlertDialogTrigger` (wenn Radix später genutzt wird) rendert intern `<button>`. Nested buttons = a11y-Fehler. Die `div` mit `role="button"` ist a11y-sauber (W3C ARIA 1.2 Button Role).
11. **Konsumenten von `run.invoice.fattura` (alle unkritisch):** Pipe-Split-Verifizierung durchgeführt (Härtungsrunde 4, siehe §12.4). Alle Leser nutzen das Feld als reinen String: `src/services/exportService.ts:13,60,81` (XML-Export via `escapeXml(meta.fattura)` — Pipe wird XML-sicher escaped), `src/pages/RunDetail.tsx:295`, `src/pages/Index.tsx:80,169,203,212,501`, `src/store/slices/workflowSlice.ts:1059,1257`, `src/services/archiveService.ts` (mehrfach), `src/components/run-detail/ExportPanel.tsx:43,73`, `src/components/run-detail/OverviewPanel.tsx:35`. **Kein einziger `.split('|')` auf `fattura`.** ✓
12. **Filename-Sanitization in `runPersistenceService.ts:517`:** `const fattura = run.run.invoice.fattura.replace(/[^\w.-]/g, '_');` — wird für FS-Export-Dateinamen genutzt. **Nur ASCII-Garantie:** Wenn `sampleId` ausschließlich ASCII-Wortzeichen (`[\w.-]`) enthält, bleibt der Rd15-Präfix `QA-${sampleId.trim().split(' ').join('_')}Fattura-...` durch die FS-Sanitization unverändert. **ABER:** Umlaute (`ä/ö/ü/ß`), Emoji oder nicht-ASCII-Sonderzeichen in der Sample-ID werden weiterhin zu `_` verstümmelt — der Präfix wäre dann z.&nbsp;B. `QA-M_ller_SampleFattura-...` statt `QA-MüllerSampleFattura-...`. Keine Kollision, keine Exception, aber der Export-Dateiname spiegelt die Sample-ID nicht 1:1 wider. Tester, die sprechende Export-Filenames brauchen, müssen ASCII-Ordnernamen wählen.
13. **Doppelte QaSampleCard-Props:** `QaSampleCard` wird in der bestehenden `testarena`-TabsContent (`SettingsPopup.tsx:1560`) aufgerufen: `<QaSampleCard key={s.sampleId} sample={s} />`. Das muss erweitert werden auf: `<QaSampleCard key={s.sampleId} sample={s} onSelect={handleOpenSampleDetail} />`.

### Reihenfolge bei der Umsetzung (verbindlich)

1. `QaFileKind` erweitern (`qaSamplesService.ts:17`) + `classify()` anpassen.
2. `classifyCategoryFolder` + `QaCategory` ergänzen.
3. `QaSampleFileMeta` optional `category` hinzufügen.
4. `ingestDirectory` 2-Ebenen-Scan einbauen (Phase 1 FS-Read, `writeSampleAtomically` bleibt unverändert).
5. `prepareFilesForIngest` + Types `QaSampleUploadSet`, `classifyFileByName` ergänzen. Type-only-Import `import type { UploadedFile } from '@/types'` im Service-Header (kein `UploadedFileLike`-Zweittyp, C.2.3 nutzt `UploadedFile` direkt).
6. `qaSamplesService` Export-Objekt um `prepareFilesForIngest` erweitern.
7. `types.ts` Signatur-Update.
8. `ingestSlice.ts:290-321` customRunTitle-Patch.
9. `SettingsPopup.tsx` — `resolveReadmeBody`, `QaSampleCard`-Props, State-Block, `handleOpenSampleDetail`, `handleStartSampleTestRun`, AlertDialog-Render. In EXAKT dieser Reihenfolge, damit TypeScript bei jedem Teilschritt grün bleibt.
10. **`npx tsc --noEmit` — Pflicht-grün nach jedem Commit-Block, NICHT nach jedem Einzelschritt (Rd16-Präzisierung):**
    - Schritt **1** → `tsc` grün.
    - Schritte **2 + 3 + 4** bilden EINE atomare Klammer (`QaFolderKind` + Meta-Erweiterung + `ingestDirectory`-Loop). Während der Klammer sind TS-Union-Fehler erwartbar; nach Abschluss von Schritt 4 MUSS `tsc` grün sein.
    - Schritt **5** → `tsc` grün.
    - Schritt **6** → `tsc` grün.
    - Schritt **7** → `tsc` grün.
    - Schritt **8** → `tsc` grün.
    - Schritt **9** → `tsc` grün.
    Commit-Grenzen identisch: `commit(1), commit(2+3+4), commit(5), commit(6), commit(7), commit(8), commit(9)` — jeder Commit grün. **Pflicht** — S.md S3 (Types ZWINGEND).

### Dispatch-Warnungen

- `prepareFilesForIngest` gibt `{ok, reason?, snapshot?}` vollständig zurück — keine Exceptions für Fachfehler. Caller muss `ok === false` prüfen.
- `handleStartSampleTestRun` fängt alle Exceptions — `cleanupFailedIngest` best-effort, auch wenn es selbst wirft, kein Re-Throw.
- `customRunTitle`-Trim: leerer String oder Whitespace → Default-Verhalten (kein Präfix). Explizit getestet in C10.

### Idempotenz & Guards

- `handleStartSampleTestRun` ist nicht doppelklick-geschützt — `qaBusy` via `ifMounted(setQaBusy(true))` als erster Schritt, Button im AlertDialog ist `disabled={qaBusy || sampleDetailLoading || ...}`. Ausreichend für normale Klicks.
- Double-Run desselben Samples: generiert zwei Runs mit unterschiedlichen IDs (Timestamp-Kante), beide mit demselben `QA-SampleName`-Präfix (Rd9). Dom muss mit dem Home-Listing selbst entscheiden, welchen er behält. Test C21.

---

## 9. Phase V — Code-Validierung

### 9.0 ★ PHASE-V-HERZSTÜCK ★ — C.3 customRunTitle-Sequenz & C.B-TA1-Silo-Regel

Zwei harte Invarianten müssen lexikalisch am finalen Code nachweisbar sein. Ohne sie ist das Feature nicht mergefähig.

| Invariante | Warum kritisch | Prüfpunkt im Code |
|---|---|---|
| **C.3-INV-1: Patch-Reihenfolge** | `customRunTitle`-Patch vor `updateRunWithParsedData` → überschrieben. Vor `renameRun` → falsche runId getroffen. | Im finalen `parseInvoiceForIngest`-Body steht der `if (trimmedTitle.length > 0)`-Block LEXIKALISCH NACH dem `renameRun`-Call und VOR dem `return finalRunId`. |
| **C.3-INV-2: currentRun-Parallelpatch** | Nur `runs`-Patch → `currentRun`-Referenz zeigt auf den alten Invoice-Header → UI zeigt alten `fattura`. | Im `set()`-Call enthält das Objekt SOWOHL ein `runs:`-Feld (Map) ALS AUCH ein `currentRun:`-Feld (bedingter Patch). Lexikalische Prüfung: beide Feldnamen im selben Objektliteral. |
| **C.B-TA1: Service-Silo** | Ein einziger Import von `runStore` / `runPersistenceService` / `fileStorageService` / `globalConfig` in `qaSamplesService.ts` zerstört die Isolation und erlaubt stille Dateninjektion in Produktiv-DBs. | `grep -n "from '@/store\|from '@/services/runPersistenceService\|from '@/services/fileStorageService" src/services/qaSamplesService.ts` → 0 Treffer. |
| **C.2-INV-1: Brücke nutzt FileSnapshot, nicht uploadedFiles** | Wenn der QA-Handler `addUploadedFile` aufruft, feuern Side-Effects (masterDataParser, serialFinder, fileStorageService.saveFile) und pollutieren die Produktions-Files-DB. | Im SettingsPopup-Handler `handleStartSampleTestRun` gibt es KEINEN Aufruf auf `useRunStore.getState().addUploadedFile(...)` oder `.loadStoredFiles()`. Die Kette ruft ausschließlich `createRunSkeleton`, `parseInvoiceForIngest`, `ingestAndPersistRunData`, `startWorkflowPhase2`, `cleanupFailedIngest`. |
| **C.2-INV-2: Kategorie-Whitelist vollständig** (Rd9 erweitert um QA-README) | Eine neue Kategorie (z.B. künftig `exportConfig`) würde ohne Erweiterung still fallengelassen — keine laute Exception. | `classifyCategoryFolder` deckt alle 4 Werte aus `UploadedFile['type']` ab: `invoice \| openWE \| serialList \| articleList`, zusätzlich den Sichtfenster-Anker `'qa-readme'` (Rd9/Lead-Dev-Fix 2). Lexikal-Check: alle 5 Strings im Funktionsbody. |
| **C.6-INV-1: Hinterzimmer-Cleanup / Leichenfreiheit** (Rd6/Chef-Fix 3 — **Rd7 präzisiert, Rd9 Präfix-Form aktualisiert**) | Wenn `customRunTitle` oder eine Ableitung in einem Store-Feld, Modul-Level-Let oder Closure überlebt, wird der nächste Produktivlauf fälschlich als QA-Run markiert (`QA-`-Präfix aus Rd9 bleibt kleben). | **Allow-List (Rd7/Chef-Fix 4): `customRunTitle` als Identifier erlaubt AUSSCHLIESSLICH in 3 Dateien:** (1) `src/store/types.ts` — Signatur-Zeile `parseInvoiceForIngest: (..., customRunTitle?: string) => ...`, (2) `src/store/slices/ingestSlice.ts` — Parameter-Deklaration + lokale Verwendung im Funktionsbody (`trimmedTitle`, `logService.info`), (3) `src/components/SettingsPopup.tsx` — Aufrufstelle im `handleStartSampleTestRun`. **Jeder Treffer außerhalb dieser 3 Dateien = Verletzung.** **Semantische Negative-Greps (Rd7/Chef-Fix 4 — kommentarresistent):** Alle MÜSSEN 0 Treffer ergeben: (a) `grep -rEn "set\(\{[^}]*customRunTitle" src/` (Store-Write-Pattern); (b) `grep -rEn "set\(\(.*\) *=> *\({\|\().*customRunTitle" src/` (Store-Write via Callback); (c) `grep -rEn "state\.customRunTitle\|get\(\)\.customRunTitle" src/` (Store-Read als Feld); (d) `grep -rEn "customRunTitle" src/hooks/` (insbesondere NICHT in `buildAutoSavePayload.ts`); (e) `grep -rEn "pendingQa\|qaHinterzimmer\|qaRunTitle\|qaMode\|isQaRun" src/` (verbotene Ersatz-Feldnamen). Diese Patterns matchen nur echte Code-Konstrukte, NICHT Kommentare oder legitime Parameter-Nennungen. |
| **C.6-INV-2: Einziger Durchstich** (Rd6/Chef-Fix 4) | Wenn künftige Erweiterungen einen zweiten „harmlosen" Parameter an `ingestAndPersistRunData` / `startWorkflowPhase2` / `cleanupFailedIngest` anhängen, erodiert die Silo-Zertifizierung schleichend. | Die 5 Engine-Action-Signaturen aus `src/store/types.ts` haben nach dieser Phase diese Shapes: `createRunSkeleton: () => Promise<string>` (unverändert), `parseInvoiceForIngest: (runId, fileSnapshot, customRunTitle?) => Promise<string>` (**einziger** neuer Parameter), `ingestAndPersistRunData: (runId, fileSnapshot) => Promise<IngestResult>` (unverändert), `startWorkflowPhase2: (runId) => Promise<void>` (unverändert), `cleanupFailedIngest: (runId) => Promise<void>` (unverändert). Diff-Check gegen V1-Commit MUSS genau EINE neue Parameter-Position zeigen. |
| **C.6-INV-3: UI-Legende synchron mit Code-Whitelist** (Rd6/Chef-Fix 1 — Rd9 erweitert um QA-README) | Erweiterung von `classifyCategoryFolder` ohne Legende-Update → Tester bekommt veraltete Info → Upload-Silence-Failure. | Jeder String-Literal-Wert in `classifyCategoryFolder` MUSS im Text von `SampleRegexLegendDialog` (Dateiabschnitt §C.1.5) erscheinen. Lexikal-Check: jeder Wert aus der `qa-readme`-Sonderzeile (Rd9) UND den vier Kategorie-Arrays (`['rechnung', 'invoice', 'fattura']`, `['bestellung', ...]`, `['seriennummern', ...]`, `['artikelliste', ...]`) findet sich als Substring im Legende-Dialog. |
| **C.6-INV-4: QA-README-Priorität im Sichtfenster** (Rd9/Lead-Dev-Fix 2) | Wenn `resolveReadmeBody` `QA-README/`-Blobs NICHT zuerst prüft, würde eine zufällige `expected.md`/`README.md` auf der Sample-Rootebene den Soll-Kontrakt überdecken → Tester sieht Doku statt Vertrag. | Im finalen `resolveReadmeBody` steht der `qaReadmeBlobs`-Filter (`b.fileName.toLowerCase().startsWith('qa-readme/')`) lexikalisch VOR den `expected`/`readme`/`sorted[0]`-Branches. Die finale `chosen`-Zuweisung lautet exakt `qaReadme ?? expected ?? readme ?? sorted[0]`. |
| **C.7-INV-2: Zombie-Guard / Run-Status-Gate** (Rd8 — Rd12 auf Rd11-Selektor umgestellt) | Ein gecrashter Produktivlauf hinterlässt einen eingefrorenen `steps[n].status === 'running'` in IDB. Ohne Run-Status-Gate blockiert der Guard den Test-Button für immer, obwohl der Run tatsächlich tot ist (`run.status === 'failed'`). | Im Selector `isEngineBusy` (Rd11-Ersatz für den alten Sammel-Selektor) steht der Gate-Check `if (cr.status !== 'running') return false;` **LEXIKALISCH VOR** dem Step-Iterations-Check `cr.steps.some(...)`. Explizite Prüfung: das `return false` im Gate-Branch muss im Code-Diff auftauchen und Kommentar „Zombie-Guard" / „Master-Wahrheit" enthalten. Der parallele Rd11-Selektor `hasIdleWorkflowData` wird NICHT vom Zombie-Guard berührt — er gibt bei gecrashtem Run mit `run.status !== 'running'` regulär `true` zurück, was den User-Choice-Overwrite-Dialog korrekt öffnet. |
| **C.7-INV-1: Fattura-Regex-Schutz / Präfix-Format** (Rd15 — ES2020-Kompatibilität + SSOT-Konstante) | Präfix mit Sonderzeichen (`[`, `]`, `\|`, Leerzeichen) oder in falscher Position bricht nachgelagerte Kanonisierungen (`replace(/\D/g, '').slice(-5)` an Vergleichspunkten — siehe CIRCUIT.md A12/A13: `orderMapper.ts` stagePerfectMatch/stageReferenceMatch, `run1PerfectMatch.ts`/`run2PartialFillup.ts` Kandidaten-Loops, `FalmecMatcher_Master.serialExtract`, `validateAgainstInvoice`). Wenn Präfix-Ziffern an die echte Fattura-Nr angehängt werden und `.slice(-5)` nicht mehr die korrekten 5 Rechnungs-Ziffern liefert, verfehlen Order-Matcher und Serial-Matcher ihre Ziele → QA-Runs zeigen künstliches Fehlverhalten. | **Vierstufiger Check (Rd15-Form):** (a) **Format:** Der finale Präfix-String MUSS das Regex `^QA-\S+$` erfüllen (drei Zeichen `QA-` + Sanitized-sampleId, garantiert KEINE Leerzeichen). Konstruktion als SSOT-Konstante im Handler: `` const qaRunPrefix = `QA-${sampleId.trim().split(' ').join('_')}`; ``. **Reihenfolge ist Pflicht:** `trim()` zuerst, dann `split(' ').join('_')` — die umgekehrte Reihenfolge lässt führende/abschließende Leerzeichen als `_` klebenbleiben, weil `trim()` niemals Underscores entfernt. Keine weiteren Sanitizations. (b) **ES2020-Kompatibilität:** KEIN `String.prototype.replaceAll` — die Methode ist ES2021 und wirft unter `tsconfig.app.json` (`target: ES2020`, `lib: ES2020`) `TS2339: Property 'replaceAll' does not exist on type 'string'`. `split(' ').join('_')` funktioniert auf jeder ES-Version. (c) **Position:** Der Präfix steht ausschließlich VOR der originalen Fattura-Nr (`fattura = trimmedTitle + r.invoice.fattura` — KEIN Separator, kein Pipe, kein Leerzeichen dazwischen). Lexikal-Check: im `set()`-Call darf zwischen `${trimmedTitle}` und `${…invoice.fattura}` kein Literal-Zeichen stehen. (d) **Nachgelagerte Regex-Verträglichkeit:** Für eine reale Falmec-Fattura-Nr mit ≥ 5 Ziffern am Ende MUSS gelten: `(qaRunPrefix + fatturaOriginal).replace(/\D/g, '').slice(-5) === fatturaOriginal.replace(/\D/g, '').slice(-5)`. Unit-Test oder manueller Sichttest mit Beispielen aus Test C26 (§6). **Rd15-Beispiel:** Sample-ID `"  Test Bug 42  "` erzeugt nach `trim().split(' ').join('_')` → `"Test_Bug_42"`, Präfix → `"QA-Test_Bug_42"`. Die Unterstriche enthalten keine Ziffern und stören `.slice(-5)` nicht. |

### 9.1 Validierungstabelle (nach Umsetzung auszufüllen)

| # | Behauptung | Datei | Zeile | Code-Auszug | Stimmt? | CONFI |
|---|---|---|---|---|---|---|
| 1 | `QaSampleCard` hat `onSelect`-Prop | `src/components/SettingsPopup.tsx` | (nach Impl.) | `function QaSampleCard({ sample, onSelect }: ...)` | — | — |
| 2 | `QaSampleCard` rendert klickbar | `src/components/SettingsPopup.tsx` | — | `role="button" tabIndex={0} onClick={() => onSelect(sample.sampleId)}` | — | — |
| 3 | `handleOpenSampleDetail` nutzt `ifMounted` | `src/components/SettingsPopup.tsx` | — | Nach jedem `await` `ifMounted(() => setX(...))` | — | — |
| 4 | AlertDialog „Soll-Sichtfenster" rendert | `src/components/SettingsPopup.tsx` | — | `<AlertDialog open={sampleDetailDialogOpen} ...>` | — | — |
| 5 | `resolveReadmeBody` priorisiert QA-README > expected > README > erster (Rd9) | `src/components/SettingsPopup.tsx` | — | `const chosen = qaReadme ?? expected ?? readme ?? sorted[0]` | — | — |
| 6 | `prepareFilesForIngest` in Service-Export | `src/services/qaSamplesService.ts` | — | `qaSamplesService.prepareFilesForIngest` exportiert | — | — |
| 7 | `prepareFilesForIngest` nutzt `new File([...])` | `src/services/qaSamplesService.ts` | — | `new File([blob.data], blob.fileName, { type: blob.mimeType })` | — | — |
| 8 | `parseInvoiceForIngest` hat 3. Parameter | `src/store/slices/ingestSlice.ts` | — | `parseInvoiceForIngest: async (runId, fileSnapshot, customRunTitle) => {...}` | — | — |
| 9 | `parseInvoiceForIngest`-Typ aktualisiert | `src/store/types.ts` | — | `customRunTitle?: string` im Typ | — | — |
| 10 | customRunTitle-Patch nach `renameRun` | `src/store/slices/ingestSlice.ts` | — | `if (result.header.fatturaNumber) { ... }` — danach `if (trimmedTitle.length > 0) { ... }` | — | — |
| 11 | `classify()` erweitert um xlsx/xls/csv/xml | `src/services/qaSamplesService.ts` | — | 7 Endung-Cases | — | — |
| 12 | `classifyCategoryFolder` Whitelist-vollständig | `src/services/qaSamplesService.ts` | — | alle 4 UploadedFile.type-Werte **+ `'qa-readme'`** (Rd9) | — | — |
| 13 | 2-Ebenen-Scan in `ingestDirectory` | `src/services/qaSamplesService.ts` | — | `if (entry2.kind === 'directory') { ... }` | — | — |
| 14 | `writeSampleAtomically` unverändert (INV-WSA-1..6) | `src/services/qaSamplesService.ts:101-132` | — | Diff leer gegen V1 | — | — |

### 9.2 Exit-Pfad-Inventur (auszufüllen nach Impl.)

| Funktion | Exit | Status-Schreibpfad | Advance? |
|---|---|---|---|
| `handleOpenSampleDetail` | Happy | `ifMounted(setSampleDetail/Loading false)` | n/a (UI) |
| `handleOpenSampleDetail` | Catch | `toast.error` + `setLoading(false)` | n/a |
| `handleStartSampleTestRun` | Happy | `setQaBusy(false)` im `finally` | Engine-Auto (Step 2) |
| `handleStartSampleTestRun` | Early-Fail (kein Upload-Set) | `toast.error` + return vor cleanup | n/a |
| `handleStartSampleTestRun` | Ingest-Fail | `cleanupFailedIngest` + `toast.error` | Nein |
| `handleStartSampleTestRun` | Catch (Exception) | `cleanupFailedIngest` best-effort + `toast.error` | Nein |
| `parseInvoiceForIngest` + customRunTitle | Happy | — (reiner Feld-Patch) | n/a |
| `parseInvoiceForIngest` ohne customRunTitle (Default) | Happy | Identisch zu V1 | n/a |

### 9.3 Operations-Reihenfolge (verbindlich)

- **VERBOTEN:** customRunTitle-Patch VOR `updateRunWithParsedData` oder `renameRun`.
- **VERBOTEN:** `addUploadedFile`-Aufruf im QA-Adapter.
- **VERBOTEN:** `qaSamplesService.ts` importiert Store-/Produktiv-Services.
- **VERBOTEN:** `AlertDialogTrigger`-Wrapping um `QaSampleCard` (führt zu nested buttons, a11y-break).
- **VERBOTEN:** Neue Hooks. `useQaSampleDetail` wird EXPLIZIT nicht gebaut (siehe Block A.5-Diskussion in Basis; S.B-TA1-Hook-Pattern ist für Listen-Loads, nicht für Einzel-Detail-Clicks).
- **ZULÄSSIG und erwartet:** Alle Handlers als lokale `useCallback`-Funktionen in der SettingsPopup-Komponente, mit `ifMounted`-Guard auf jedem Post-Await-Side-Effect.

### 9.4 Datenstruktur-Verifikation (nach Umsetzung Phase V ausfüllen)

| Typ | Neu/Erweitert | Feld-Liste | Source |
|---|---|---|---|
| `QaCategory` | NEU | `'invoice' \| 'openWE' \| 'serialList' \| 'articleList'` | `qaSamplesService.ts` |
| `QaFolderKind` (Rd9) | NEU | `QaCategory \| 'qa-readme'` — Rückgabewert von `classifyCategoryFolder` | `qaSamplesService.ts` |
| `QaSampleUploadSet` | NEU | `{ ok: boolean, reason?: string, snapshot?: {...} }` | `qaSamplesService.ts` |
| `QaSampleFileMeta.category` | OPTIONAL NEU | `category?: QaCategory \| null` | `qaSamplesService.ts` |
| `QaFileKind` | ERWEITERT | `+ xlsx, xls, csv, xml` | `qaSamplesService.ts:17` |
| `parseInvoiceForIngest`-Signatur | ERWEITERT | `+ customRunTitle?: string` | `src/store/types.ts` |

### 9.5 Abnahme — Architektur-Review (Rev 3)

- [x] C.1 — Click-Handler + AlertDialog geplant (KISS, kein neuer Hook, Fallback-Kette expected/README/erster md)
- [x] C.2 — `prepareFilesForIngest` + Kategorie-Mapping + classify()-Whitelist erweitert, rückwärtskompatibel
- [x] C.3 — customRunTitle-Patch nach renameRun + IDB-Persistenz via buildAutoSavePayload
- [x] C.B-TA1 Silo-Regel gewahrt (kein Produktiv-Service-Import)
- [x] C.2-INV-1 FileSnapshot-Injection statt addUploadedFile (keine Seiteneffekt-Pollution)
- [x] A16-Lifecycle — Engine läuft nach Popup-Close weiter (`isMountedRef` als Defensiv-Netz)
- [x] S.md S1/S3/S4/S5-konform (alles Tailwind, FooterButton-Wrapper, keine neuen Hex-Werte)
- [x] V1-INV-WSA-1..6 unberührt (Phase 2 Tx-Scope nicht angefasst)
- [x] V1-Streaming-RAM-Garantie unberührt (Phase 1 Erweiterung lokal)
- [x] Test-Matrix (C1-C22) deckt Happy, Edge, Lifecycle, Persistenz, Isolation, Regression
- [ ] **Bei Umsetzung:** `npx tsc --noEmit` grün nach jedem Commit-Block gemäß §8 Punkt 10 (Rd16): Schritt 1, Klammer (2+3+4), Schritte 5, 6, 7, 8, 9 jeweils einzeln. Innerhalb der Klammer 2-3-4 sind temporäre TS-Union-Fehler erwartbar.
- [ ] **Bei Umsetzung:** 9.1, 9.2, 9.4 mit echten Zeilen füllen
- [ ] **Bei Umsetzung:** `grep -rn "from '@/store\|from '@/services/runPersistenceService\|from '@/services/fileStorageService" src/services/qaSamplesService.ts` → 0 Treffer
- [ ] **Bei Umsetzung:** `grep -rn "addUploadedFile\|loadStoredFiles" src/components/SettingsPopup.tsx` → NUR in nicht-QA-Kontexten

**→ STATUS: VALIDATED — READY FOR IMPLEMENTATION** (Architektur-Review, Confidence 96 %)

---

## 10. Abschluss-Checkliste für Sonnet

- [ ] `npx tsc --noEmit` grün nach jedem Commit-Block (§8 Punkt 10, Rd16): Schritt 1, Klammer (2+3+4), Schritte 5, 6, 7, 8, 9 einzeln.
- [ ] `grep` für C.B-TA1 Silo-Regel: 0 Importe von runStore/runPersistenceService/fileStorageService/globalConfig in `qaSamplesService.ts`
- [ ] `grep` für C.2-INV-1: 0 Aufrufe von `addUploadedFile`/`loadStoredFiles` im QA-Pfad
- [x] `grep` bereits erledigt (Härtungsrunde 4): `invoice\.fattura` in `src/services/exportService.ts` → XML-escape, kein `.split('|')` → **Pipe-Präfix ist sicher**
- [ ] `features/INDEX.md` aktualisiert (neuer Eintrag PROJ-50-DEV)
- [ ] `features/PROJ-50_AUDIT_DEV.md` erstellen (siehe §11 unten) — ZWINGEND nach Umsetzung
- [ ] I.md / C.md / S.md Sektion B auf Markierungen geprüft
- [ ] Test-Matrix C1-C22 manuell oder per Unit/Integration-Test abgedeckt

---

## 11. IMPLEMENTIERUNGS-AUDIT (PFLICHT nach Umsetzung)

Nach Abschluss der Umsetzung MUSS die Datei `features/PROJ-50_AUDIT_DEV.md` neu erstellt werden. Sie ist **kein optionaler Bericht** — sie ist der Nachweis, dass die drei Härte-Dimensionen dieses Plans im echten Code gehalten wurden.

### 11.1 Audit-Umfang (drei Dimensionen)

**Dim. 1 — ACID-Integrität (unberührt halten):**

| Invariante | Prüfbefehl / Prüfpunkt | SOLL |
|---|---|---|
| INV-WSA-1..6 (V1-Basis, Sektion 9.0) | Diff auf `writeSampleAtomically` gegen V1-Commit | 0 Zeilen verändert |
| IDB-Tx-Scope bei 2-Ebenen-Scan | Visueller Code-Review: `db.transaction(...)` wird erst **nach** allen `arrayBuffer()`-Reads eröffnet | Bestätigt |
| `prepareFilesForIngest` nutzt RO-Tx (nur lesen) | Code-Zitat: `db.transaction([INDEX_STORE, BLOB_STORE], 'readonly')` (via existierendes `loadSample`) | Bestätigt |
| customRunTitle schreibt atomar | Code-Zitat: EIN `set((state) => ({ runs: ..., currentRun: ... }))`-Call | Bestätigt |

**Dim. 2 — RAM-Streaming (V1-Eigenschaft nicht verlieren):**

| Invariante | Prüfbefehl | SOLL |
|---|---|---|
| Peak-RAM bei 2-Ebenen-Upload | Manuell: 20 Samples × 2 Kategorien × je 10 MB → Heap-Snapshots wie V1-Test #18 | Keine monoton wachsende Trajektorie; Peak ≈ max(einzelne Datei) |
| `prepareFilesForIngest` lädt nur EIN Sample | Code-Zitat: `const detail = await loadSample(sampleId)` — einzelner Call, keine `loadAllSummaries()`-Spirale | Bestätigt |
| README-Body-Decoder hat 256-KB-Cap | Code-Zitat: `const MAX = 256 * 1024` in `resolveReadmeBody` | Bestätigt |

**Dim. 3 — UI-Lifecycle (A16 + ifMounted):**

| Invariante | Prüfbefehl | SOLL |
|---|---|---|
| Jeder Post-Await-State-Setter durchläuft `ifMounted` | Diff-Review: `handleOpenSampleDetail` & `handleStartSampleTestRun` — jeder `setX`-Call ist in `ifMounted(() => setX(...))` gewrappt | 0 ungewrappte Setter |
| Toast feuert via Sonner-Portal nach Popup-Close | Manueller Test C16 | Toast erscheint, keine React-Warning |
| `qaBusy` wird im `finally` zurückgesetzt | Code-Zitat: `finally { ifMounted(() => setQaBusy(false)); }` | Bestätigt |
| Engine läuft autonom weiter nach `startWorkflowPhase2` | Manueller Test C16: Popup schließen direkt nach „Testlauf starten" → Run schließt in der Home-Liste mit Status ok/soft-fail/failed wie bei NewRun | Bestätigt |
| Popup-Close während `parseInvoiceForIngest` | Manueller Test C16 | Kein React-Warning, Toast via Portal, `qaBusy` bleibt true bis `finally` |

### 11.2 Audit-Struktur (Pflicht-Sektionen in `PROJ-50_AUDIT_DEV.md`)

1. **Header** — Datum, Reviewer, Git-SHA vor/nach Umsetzung.
2. **Tabelle Dim. 1** (ACID) — jede Zeile: Invariante + Git-Zeile im finalen Code + PASS/FAIL.
3. **Tabelle Dim. 2** (RAM) — inkl. Heap-Snapshot-Screenshot oder Skript-Output.
4. **Tabelle Dim. 3** (Lifecycle) — inkl. Browser-Console-Screenshot ohne React-Warnings bei C16.
5. **Test-Matrix C1-C22** — Spalte „Resultat" für jeden Case.
6. **Regression-Scan** — `npx tsc --noEmit`-Output + `grep`-Nachweise (C.B-TA1, C.2-INV-1).
7. **Offene Punkte / Tech-Debt** — falls der Coder von einer Invariante abweichen musste: HARTER STOPP und Eskalation an Dom vor Merge.
8. **Finale Ampel** — GREEN = merge-ready. YELLOW = Tech-Debt dokumentiert, Merge mit Freigabe. RED = blockiert.

### 11.3 Audit-Regel

Der Audit ist **retroaktiv und unabhängig**: Der Coder-LLM (Sonnet) füllt ihn NACH der Umsetzung, liest dabei nur den implementierten Code, NICHT diesen Plan. Wenn eine Invariante im Code nicht mehr nachweisbar ist, wird der Audit auf RED gesetzt und der Fehler ans Governance-Team (Dom) eskaliert — selbst wenn der Plan scheinbar eingehalten wurde. **Die Wahrheit liegt im Code, nicht im Plan.**

---

## 12. Confidence-Bewertung & Härtungsrunden

> **⚠ RÜCKBLICK-SEKTION — (HISTORISCH - NICHT UMSETZEN)** — Die folgenden Unterabschnitte dokumentieren die Evolution der Härtungsrunden 1–4. Die darin zitierten Präfix-Formen (`[QA] - X | Y`, `QA_TEST_…_`), Selektoren (`isProductiveRunActive`) und Pipe-Trennzeichen sind **ausdrücklich historisch** und dürfen NICHT in Code umgesetzt werden. Aktueller Stand: Rd11/Rd12 (siehe §7 C.2.7 + §C.3.2 + §18.0).

### 12.1 Härtungsrunde 1 (Initial → 82 %)

**Lücken identifiziert:**
- L1: Kein Check, wie `ingestAndPersistRunData` auf rekonstruiertes `File` reagiert (der `file.arrayBuffer()`-Read wird erneut durchgeführt — CPU-Kosten vernachlässigbar, aber in der Logspur nachweisbar).
- L2: V1-`classify()` akzeptiert nur pdf/json/md. Ohne Erweiterung kann die Brücke **keinen** Artikellisten-xlsx-Read durchführen — Block C ist dann de-facto lahm.
- L3: Kein Plan für die `currentRun`-Parallelpatch-Pflicht (nur `runs`-Patch würde die UI-Anzeige nicht sofort aktualisieren).

**Fixes eingearbeitet:**
- F1: §7 C.2.4 `QaFileKind`-Erweiterung + Migrationsrisiko-Abschätzung dokumentiert.
- F2: §5/§7 C.3.2 `currentRun`-Parallelpatch als Invariante C.3-INV-2 festgeschrieben.
- F3: §8 Punkt 2 — `file.arrayBuffer()` doppelt ist CPU-vernachlässigbar; dokumentiert als gewollt.

### 12.2 Härtungsrunde 2 (82 → 92 %)

**Lücken identifiziert:**
- L4: V1-Test #7 (Isolation) wird nicht mehr getestet — Brücke könnte unbewusst `fileStorageService.saveFile` über `addUploadedFile` triggern.
- L5: README-Body-Rendering hat keinen Größenwächter → 20-MB-.md bricht UI.
- L6: `handleStartSampleTestRun` hat keinen try/catch um `cleanupFailedIngest` — wenn der Cleanup selbst wirft (z.B. IDB defekt), bleibt der äußere Catch stumm.
- L7: `customRunTitle`-Format (Rd1-3: `[QA] - X | Y`, Rd9: `QA-X…`) könnte in exportService.ts bei Pipe-Splitting Probleme machen — unklar, ob Code dort `|` nutzt. (Rd9-Update: durch das KISS-Format ohne Pipe ist dieser Verdachtsraum vollständig entfernt.)

**Fixes eingearbeitet:**
- F4: §6 Test C14, C15 (Isolation, Silo-Grep). §9.5 Checkliste. §11.1 Dim. 3 manueller Screenshot.
- F5: §7 C.1.4 `resolveReadmeBody` hat harten 256-KB-Cap.
- F6: §7 C.2.6 — nested try/catch um `cleanupFailedIngest` mit `console.error`-Fallback.
- F7: §8 Punkt 12 — Pflicht-Grep in exportService vor Implementation als offener Checkpoint markiert.

### 12.3 Härtungsrunde 3 (92 → 96 %, Schnüffler-simuliert)

**Drei harte Einwände gegen den Plan geprüft — alle als berechtigt angenommen und aufgelöst:**

| # | Einwand (Schnüffler-Simulation) | Prüfergebnis | Plan-Korrektur |
|---|---|---|---|
| S1 | „README-Preview nutzt `AlertDialogDescription asChild` mit `<div>` — Radix erwartet **inline** content in Description. Sie schmeißt Warnings." | **Bestätigt** — siehe `src/pages/NewRun.tsx:275` (gleicher Pattern — es läuft, aber Radix meckert im Dev-Mode). | §7 C.1.3 behält das Pattern 1:1 wie `NewRun.tsx:275` — gleicher Dev-Mode-Overhead, aber **keine neue Regression**. Wenn Dom den Fix will, kann er die Description in ein `<div>` mit `<AlertDialogDescription>`-Child teilen — aber **nicht** im Scope dieser Brücke (YAGNI). |
| S2 | *(HISTORISCH - NICHT UMSETZEN)* Rd7-Debatte um einen eigenen `UploadedFileLike`-Zweittyp in `qaSamplesService`. | **Aufgelöst seit C.2.3-Rev-5:** `prepareFilesForIngest` nutzt direkt `UploadedFile` via `import type { UploadedFile } from '@/types'` (Type-only-Import, bricht C.B-TA1 NICHT, da `@/types/index.ts` an keinem Slice hängt). Kein `UploadedFileLike`-Zweittyp im Soll. |
| S3 | „`classifyFileByName` nutzt Regex auf `fileName` — was wenn ein Sample eine `'bestell-artikelliste.xlsx'` hat? Dann matcht BEIDES (openWE UND articleList). Regex-Reihenfolge ist willkürlich → nicht-deterministisches Verhalten." | **Bestätigt** — die If-Kette in `classifyFileByName` liefert beim ersten Match. Das ist für eine robuste Produktionslösung zu schwach. | **Fix:** Die Empfehlung ist, Kategorie-Ordner (C.2.1 / C.2.2) zu nutzen — die Heuristik ist nur Rückwärtskompatibilität für reine V1-Samples. **Ergänzung:** In `classifyFileByName` wird die Reihenfolge der Tests jetzt DOKUMENTIERT (artikel → openWE → serial → null). §8 Punkt 13 erwähnt dies als Stolperstein. **Empfehlung an Dom:** In den User-Instructions für die Giftküche klar machen: „Ordnerstruktur in Kategorien > flache Struktur". |

### 12.4 Härtungsrunde 4 (96 → 98 %, gegen echte Code-Wahrheit verifiziert)

Nach Abschluss von Rd. 3 wurde **direkt gegen den finalen Code** geprüft. Drei Annahmen des Plans wurden dabei präzisiert:

| # | Annahme im Plan (Rd. 1-3) | Echte Code-Wahrheit | Plan-Korrektur |
|---|---|---|---|
| V1 | „`buildAutoSavePayload` liest `run.invoice.fattura` aus Store" | **Präziser:** Der Helper liefert das komplette `run`-Objekt zurück (`buildAutoSavePayload.ts:23-26,45`). Der `fattura`-Wert ist also Teil des gesamten Run-Snapshots, nicht eines einzelnen Feld-Reads. Wirkung auf den Plan: **null** — der Patch wird trotzdem 1:1 in IDB persistiert. | §5 C.3 / §7 C.3.2 Kommentar präzisiert (siehe aktueller Stand dieser Datei). |
| V2 | „Pipe-Kollision im `exportService` unbekannt, Pflicht-Grep vor Implementation" | **Verifiziert:** `src/services/exportService.ts:13,60,81` — `fattura` wird ausschließlich als String in XML-Tags via `escapeXml(meta.fattura)` geschrieben. Keine Split-Operationen auf `\|`. Alle weiteren Konsumenten (`Index.tsx`, `RunDetail.tsx`, `workflowSlice.ts`, `archiveService.ts`) nutzen den Wert als reine Anzeige bzw. Dateinamen-Basis. | §8 Punkt 11 & 12 + §10-Checkliste: Pipe-Präfix als **sicher** bestätigt. Grep aus Coder-Pflichtliste entfernt. |
| V3 | (neu) `runPersistenceService.ts:517` — Filename-Sanitization mit `replace(/[^\w.-]/g, '_')` | **Bestätigt** — greift für FS-Exports. Rd1-3-Präfix (`[QA] - …`) wurde zu `_QA____…` umgeschrieben. Rd15-Präfix (`QA-{trimmedSplittedId}…`) mit ASCII-Ordnernamen enthält NUR `[\w.-]` → bleibt unverändert. **Rd16-Präzisierung:** Bei nicht-ASCII-Sample-IDs (Umlaute/Emoji) werden diese Zeichen weiterhin zu `_` verstümmelt — siehe §8 Punkt 12 für die Tester-Empfehlung „ASCII-Ordnernamen bevorzugen". | §8 Punkt 12 Rd16-aktualisiert. |

**Verbleibendes Restrisiko (2 %):**
- (a) `resolveReadmeBody`-Deterministik bei >2 unregelbenannten md-Blobs — Sonderfall, manuelle Nacharbeit ausreichend.
- (b) `customRunTitle` mit exotischen Zeichen (Umlaute, Emoji) — identisch zu Sample-IDs (V1 akzeptiert verbatim). Keine neue Risiko-Klasse.
- (c) Timestamp-Kante bei Doppel-QA-Run in <1s-Intervall — V1-Schuld (`generateRunId`), nicht Block-C-Problem.

### 12.5 Finale Confidence

**98 %** — Ziel ≥ 95 % klar überschritten (Wunsch 99 %). Das verbleibende 2 %-Restrisiko besteht aus dokumentierten V1-Kanten, die **nicht** im Scope dieses Plans liegen. Der Plan ist **READY FOR IMPLEMENTATION**.

**Eigenbewertung des Planers (Ehrlichkeitsklausel):** Der Schritt von 96 → 98 % kommt ausschließlich aus der Verifikation gegen echten Code (Härtungsrunde 4), nicht aus zusätzlichen Plan-Erweiterungen. Wenn Team-Red (Schnüffler / Codex) in der finalen Peer-Review einen weiteren harten Einwand findet, ist eine Härtungsrunde 5 mit erneuter Code-Wahrheit-Verifikation die einzig zulässige Antwort. Keine Confidence-Inflation ohne Code-Beleg.

---

## 13. Silo-Zertifizierung — Durchstich-Inventur (Rd6/Chef-Fix 4)

Der Chef hat in Runde 6 eine explizite Zertifizierung angefordert. Diese Sektion ist das **formale Dokument**, das nach Umsetzung Bestandteil von `PROJ-50_AUDIT_DEV.md` wird.

### 13.1 Silo-Definition

„Das Silo" = die hermetische Abgrenzung zwischen dem **QA-Testpfad** (Test-Arena-Brücke, PROJ-50-DEV) und der **Produktiv-Ingest-Engine** (PROJ-46/49, alle `src/store/slices/*` + `src/services/runPersistenceService.ts` + `src/services/fileStorageService.ts` + `src/store/masterDataStore.ts`).

### 13.2 Durchstich-Inventur — GENAU EIN definierter Durchstich

| # | Durchstich-Beschreibung | Ort | Datentyp | Lebensdauer |
|---|---|---|---|---|
| **D-1** | `customRunTitle: string` als optionaler Function-Parameter | `parseInvoiceForIngest(runId, fileSnapshot, customRunTitle?)` in `src/store/slices/ingestSlice.ts:290-321` | `string \| undefined` | Stack-local — existiert nur während des Funktionsaufrufs, automatisch GCt nach Return/Throw |

**Das ist der einzige Durchstich.** Alles andere ist reine Wiederverwendung der existierenden, öffentlichen Engine-API (siehe §13.3).

### 13.3 Hermetische Zonen — was NICHT geändert wird

| Zone | Status | Nachweis |
|---|---|---|
| **Engine-Entry-Points** (A1 der C.md — 6 Entry-Points) | **Hermetisch.** Kein Entry-Point erhält neue Parameter durch diesen Plan außer D-1. | §2 Null-Impact-Garantien + §9.0 C.6-INV-2 |
| **Execute-Funktionen** (`executeMatcherCrossMatch`, `executeMatcherSerialExtract`, `executeOrderMapping`) | **Hermetisch.** Keine Signatur-Änderung, keine QA-spezifische Verzweigung. | Grep `customRunTitle\|isQaRun\|qaMode` in `src/store/slices/workflowSlice.ts` → 0 Treffer (Pflicht-Audit in §11.1 Dim. 1) |
| **Guard-System** (`runStepGuard`, `validateStepPrerequisites`) | **Hermetisch.** Der QA-Run läuft durch dieselben Guards wie ein Produktiv-Run — das ist der Zweck der Brücke. | §3-Check-Tabelle Zeile C.md/A13 |
| **Persistenz** (`runPersistenceService.saveRun`, `buildAutoSavePayload`) | **Hermetisch.** Sie serialisieren das gesamte Run-Objekt; der gepatchte `invoice.fattura`-String fließt wie jeder andere Feld-Wert durch. Keine QA-spezifische Branches. | §9.0 C.6-INV-1: `customRunTitle` darf NICHT in `buildAutoSavePayload`-Body auftauchen |
| **fileStorageService** (Produktions-Upload-DB) | **Hermetisch.** QA-Adapter schreibt NICHT in diese DB. | §9.0 C.2-INV-1 + §6 Test C14 |
| **masterDataStore** | **NICHT hermetisch, aber vom Chef als akzeptables Risiko eingestuft (Rd5).** Ein QA-Run überschreibt die MasterData wie jeder Produktiv-Run. **Schutzschicht:** UI-Warnung im AlertDialog (Rd5/Chef-Fix 2). Technisch zulässig, operativ kommuniziert. | Rd5-Begründung, §7 C.1.3 Warnblock |
| **globalConfig** | **Hermetisch.** QA-Run nutzt dieselbe `globalConfig` wie Produktiv-Run — gewollt (Testlauf gegen produktive Parser-/Matcher-Config). | §8 Punkt 7 |
| **QA-IDB (`falmec-receiptpro-qa-samples`)** | **Hermetisch in die andere Richtung** (C.B-TA1). `qaSamplesService` importiert 0 Produktiv-Services. | §9.0 C.B-TA1 |

### 13.4 Zertifizierungs-Checkliste

Der Audit (`features/PROJ-50_AUDIT_DEV.md`, §11) muss diese Checkliste GRÜN abschließen:

- [ ] Diff auf `src/store/types.ts`: EXAKT 1 Signatur-Änderung (`parseInvoiceForIngest` um `customRunTitle?: string` erweitert). Alle 4 anderen Engine-Signaturen (`createRunSkeleton`, `ingestAndPersistRunData`, `startWorkflowPhase2`, `cleanupFailedIngest`) byte-gleich zu V1.
- [ ] Diff auf `src/store/slices/workflowSlice.ts`: 0 Zeilen geändert durch diesen Plan.
- [ ] Diff auf `src/services/stepGuard.ts` / `src/services/matching/**`: 0 Zeilen geändert.
- [ ] Diff auf `src/services/runPersistenceService.ts`: 0 Zeilen geändert.
- [ ] Diff auf `src/hooks/buildAutoSavePayload.ts`: 0 Zeilen geändert.
- [ ] Diff auf `src/services/fileStorageService.ts`: 0 Zeilen geändert.
- [ ] Grep `customRunTitle` im kompletten Repo → genau 2 Trefferorte zulässig: (1) Parameter-Deklaration in `ingestSlice.ts`, (2) Parameter-Deklaration in `types.ts`, (3) Aufrufstelle in `SettingsPopup.tsx` (`handleStartSampleTestRun`). Zusätzlich die Plandatei. **Kein** Treffer in `workflowSlice.ts`, `runCrudSlice.ts`, `persistenceSlice.ts`, `mutationSlice.ts`, `buildAutoSavePayload.ts`, `runPersistenceService.ts`.
- [ ] Grep `pendingQa\|qaHinterzimmer\|qaMode\|isQaRun` im kompletten `src/` → **0 Treffer** (kein Store-Flag, kein globales QA-Bit).

**Wenn auch nur EIN Eintrag fehlschlägt: Silo-Zertifizierung RED. Merge blockiert.**

### 13.5 Begründung gegenüber dem Lead-Dev

Der QA-Testpfad braucht die produktiven Parser, Matcher und Persistenz-Schichten — sonst ist der Test wertlos (ein „Test" gegen einen Fake-Parser testet nichts). Die Brücke kann diese Schichten nicht duplizieren ohne die Wartbarkeit zu zerstören (Drift-Risiko). Sie MUSS sie also teilen — aber unter einer streng definierten Schnittstelle, die **minimal** ist (ein einziger String-Parameter) und **leichenfrei** (Stack-Local, kein globaler State). Das ist genau die Definition eines **chirurgischen Durchstichs**: minimale Schnittfläche, garantierter Verschluss, nachweisbar abgegrenzt.

Der Chef hat diese Abwägung in Rd5/Rd6 bewusst getroffen. Die Silo-Zertifizierung ist die formale Dokumentation, dass wir uns an dieses Versprechen halten und künftige Erweiterungen genauso streng prüfen werden.

---

## 14. Härtungsrunde 6 (Zusammenfassung)

| Fix | Problem | Lösung im Plan | Phase-V-Nachweis |
|---|---|---|---|
| **Rd6-1** | Tester kennt die Ordner-Nomenklatur-Whitelist nicht | Neuer Button „Sample Regex" im Test-Arena-Tab öffnet `SampleRegexLegendDialog` mit der vollständigen Whitelist als Liste + Beispiel-Baum | §9.0 C.6-INV-3 (Legende synchron mit Code) |
| **Rd6-2** | Risiko, dass Coder-LLM ein globales Store-Flag baut („pendingQaRunTitle") und den Cleanup vergisst | §7 C.3.0 Architektur-Begründung: Parameter-Weg vs. Store-Feld, Vergleichstabelle, KISS-Fazit | Kein Store-Feld → strukturelle Leichenfreiheit |
| **Rd6-3** | Falls dennoch globales Feld eingeschleust: Leiche bleibt → Produktivlauf bekommt `QA-`-Präfix (Rd9) | §9.0 C.6-INV-1: drei Grep-Checks, ALLE 0 Treffer | Phase-V-Pflicht, Audit RED bei Fehlschlag |
| **Rd6-4** | Zukünftige Erweiterungen könnten weitere Engine-Actions heimlich modifizieren | §13 Silo-Zertifizierung + §9.0 C.6-INV-2: Diff-Check auf alle 5 Engine-Action-Signaturen | Phase-V-Pflicht, nur GENAU 1 Durchstich erlaubt |

**Zusätzliche Tests (Ergänzung zur C1-C22-Matrix aus §6):**
- **C23 — Legende-Synchronität:** Öffne `SampleRegexLegendDialog`. Jeder Whitelist-String in `classifyCategoryFolder` (16 Einträge aus 4 Kategorien) findet sich als lesbare Textzeile im Dialog wieder. Manueller Sichttest + Lexikal-Diff als Ergänzung.
- **C24 — Hinterzimmer-Leak-Regression:** Nach einem erfolgreichen QA-Run und anschließendem Öffnen von `NewRun.tsx` + Start eines normalen Produktivlaufs: der neue Produktiv-Run hat `run.invoice.fattura` = `'Fattura-XXX-...'` OHNE `QA-`-Präfix (Rd9). Manueller Test + optional E2E.
- **C25 — Durchstich-Einhaltung:** Nach Umsetzung `git diff --stat main..HEAD -- src/store/slices/workflowSlice.ts src/services/stepGuard.ts src/services/matching/ src/services/runPersistenceService.ts src/hooks/buildAutoSavePayload.ts src/services/fileStorageService.ts` → Alle Werte **0 files changed**.

**Finale Confidence nach Rd6: 99 %** — Die Brücke ist jetzt architektonisch so eng wie möglich geschnürt. Restrisiko (1 %): Unbekannte Unknowns, die erst in der finalen Peer-Review (Schnüffler / Codex) auffallen können. **Genau diese Unknowns hat Rd7 dann gefunden — siehe §15.**

---

## 15. Härtungsrunde 7 — Schnüffler NO-GO-Fix

> **⚠ RÜCKBLICK-SEKTION — (HISTORISCH - NICHT UMSETZEN)** — Dokumentiert die fünf Rd7-Lösungs-Hypothesen. Präfix-Formen wie `QA_TEST_${sanitize(sampleId)}_` und Guard-Namen wie `isProductiveRunActive` sind Rd7-Form — **NICHT umsetzen**, aktueller Code-Stand folgt Rd11/Rd12.


Der Rd6-Plan war **nicht** READY. Der Schnüffler hat 4 echte Risse im Code-Realismus und 1 kritisches Daten-Risiko (Confidence 91 %) gefunden. Der Lead-Dev hat 5 Lösungs-Hypothesen formuliert; alle 5 wurden gegen die echte Codebasis geprüft und bestätigt, bevor sie in den Plan integriert wurden.

### 15.1 Prüfergebnis der 5 Hypothesen

| # | Hypothese | Prüfung gegen Code | Ergebnis |
|---|---|---|---|
| H1 | Engine triggert kein Auto-Routing → User bleibt im Popup | `NewRun.tsx:90` nutzt explizit `navigate(\`/run/${encodeURIComponent(finalRunId)}\`)`. Es gibt keinen Auto-Router-Push aus dem Store. | **BESTÄTIGT.** Fix: `useNavigate` aus `react-router-dom` in SettingsPopup. Siehe §7 C.2.6 + Impact-Matrix. |
| H2 | Guard zu aggressiv bei `'soft-fail'`/`'failed'`; `isProcessing` könnte UI-only sein | `isProcessing`-Schreibpfade in `ingestSlice.ts:267-270` (`createRunSkeleton` → true), `:369/:424/:466/:509/:513` (Ingest-Abschluss → false): **echter Phase-1-Marker, keine UI-Animation.** Aber die Blockade bei `soft-fail`/`failed` ohne laufenden Step ist unnötig: nach `resetRunSensitiveState` geht für diese Runs nichts verloren (Daten im IDB). Gefährlich ist der Reset nur bei running-Step (Phase 2), `isPaused` (Resume-Gefahr), `isWaitingBeforeStep4` (User wartet). | **BESTÄTIGT.** Fix: Guard-Logik in §7 C.2.7 Rd7-Revision präzisiert auf die 4 echten Gefahrenzustände. |
| H3 | `.md`-Dateien in Doku-Ordnern gehen verloren | `classifyCategoryFolder` liefert `null` für unbekannte Ordnernamen → Inner-Loop wird übersprungen. `Doku/expected.md` wird nie eingelesen. | **BESTÄTIGT.** Fix: Inner-Loop lässt `.md`-Dateien auch aus unbekannten Ordnern durch; andere Kinds (`pdf`/`xlsx`/...) werden bei unbekannter Kategorie weiterhin geskippt. Siehe §7 C.2.2. |
| H4 | Text-Greps in C.6-INV-1 fragil | `grep "customRunTitle"` trifft ALLE Vorkommen — auch legitime Parameter-Reads im Funktionsbody + Kommentare + Docstrings. Keine Unterscheidung zwischen Parameter-Deklaration, Lese-Zugriff und Store-Write. | **BESTÄTIGT.** Fix: Allow-List (3 erlaubte Dateien) + semantisch-präzise Negative-Greps auf echte Schreibpfade (`set({…customRunTitle`, `state.customRunTitle`, `get().customRunTitle`). Kommentare matchen diese Regexes nicht. Siehe §9.0 C.6-INV-1 Rd7-Fassung. |
| H5 | Sonderzeichen im Präfix + Regex-Kanonisierung | CIRCUIT.md A12/A13 beschreibt Pflicht-Pattern `replace(/\D/g, '').slice(-5)` an 5 Vergleichspunkten (`orderMapper.ts:stagePerfectMatch/stageReferenceMatch`, `run1PerfectMatch.ts`, `run2PartialFillup.ts`, `FalmecMatcher_Master.serialExtract`, `validateAgainstInvoice`). Der Rd6-Präfix `[QA] - SampleName \| ` hat `[`, `]`, `\|`, Leerzeichen — für `\D` alle unsichtbar, ABER für andere Regex-Pfade potenzielle Landmine. Zudem: bei Ziffern im Sample-Name (`Bug42`) wurden bereits Ziffern VOR die Fattura-Nr geschoben — nach `.slice(-5)` aber nicht relevant, solange Fattura ≥ 5 Ziffern hat. Falmec-Konvention: Fattura-Nr hat 5+ Ziffern. | **BESTÄTIGT.** Fix: Präfix `QA_TEST_${sanitize(sampleId)}_` mit `sanitize = s => s.replace(/[^\w.-]/g, '_')` (identisch `runPersistenceService.ts:517`). Kein `[`/`]`/`\|`/Leerzeichen. Patch-Concat ohne Separator (`trimmedTitle + fattura` statt `trimmedTitle + ' | ' + fattura`). Invariante C.7-INV-1 (§9.0) mit dreistufigem Check: Format, Position, Regex-Verträglichkeit. |

### 15.2 Rd7-Testergänzungen zur Test-Matrix C1-C25

- **C26 — Präfix-Regex-Verträglichkeit (Rd15-Form, ES2020-safe):** Sample-ID `"  Mein Bug 42  "` (mit Kanten-Leerzeichen UND internen Leerzeichen, realer Worst-Case), echte Fattura `"FA-2025-67890"`. Präfix nach **Rd15-Regel** (`qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\``): `"QA-Mein_Bug_42"`. Finale `fattura` = `"QA-Mein_Bug_42FA-2025-67890"`. Berechne `"QA-Mein_Bug_42FA-2025-67890".replace(/\D/g, '').slice(-5)` → Ergebnis MUSS `"67890"` sein (die `42` aus dem Präfix steht LINKS der Fattura-Ziffern und wird von `.slice(-5)` nicht erfasst, solange Fattura ≥ 5 Ziffern hat — Falmec-Konvention). **Negativ-Check:** Mit umgekehrter Reihenfolge (`split(' ').join('_')` VOR `trim()`) wäre das Ergebnis `"__Mein_Bug_42__"` — Reihenfolge ZWINGEND `trim → split → join`.
- **C27 — Navigation (Rd7/Chef-Fix 1):** Starte QA-Run aus Settings-Popup. Nach erfolgreichem `startWorkflowPhase2` MUSS die URL auf `/run/{finalRunId}` wechseln (Popup schließt, RunDetail-Seite wird gerendert). Regression: Ohne den `navigate(...)`-Call bleibt der User auf der Home-Seite mit geschlossenem Popup.
- **C28 — Guard-Entschärfung (Rd7/Chef-Fix 2):** Status-Matrix prüfen: (a) Produktivlauf in Phase 1 (`isProcessing=true`) → Button disabled. (b) Produktivlauf mit `run.status='running'` UND Step 2 `'running'` → Button disabled. (c) Produktivlauf mit allen Steps `'ok'` (Export fertig) → Button **enabled**. (d) Produktivlauf mit Step 3 `'soft-fail'`, kein running-Step → Button **enabled**. (e) `isPaused=true` → Button disabled. (f) `isWaitingBeforeStep4=true` → Button disabled.
- **C31 — Zombie-running-Step-Regression (Rd8):** Simuliere einen gestern gecrashten Run: rehydriere aus IDB mit `run.status === 'failed'` UND `steps[1].status === 'running'` (Zombie-Leiche aus Execute-Crash). Öffne Test-Arena-Popup: **Testlauf-Button MUSS enabled sein**. Regression-Prüfung: Vor dem Rd8-Fix (ohne `cr.status !== 'running' → return false`-Gate) wäre der Button für diesen Run permanent deaktiviert → Bugzustand, den der Chef-Input „Opus hätte den Button für immer ausgegraut" korrekt beschreibt.
- **C29 — Doku-`.md`-Universal (Rd7/Chef-Fix 3):** Sample-Ordner `MeinBug/` mit Unterordnern `Rechnung/rechnung.pdf`, `Doku/expected.md`, `Notizen/details.md`, `Zufall/garbage.xlsx`. Nach Upload: `loadSample('MeinBug')` liefert PDF + zwei `.md`-Blobs (`Doku/expected.md`, `Notizen/details.md`). `garbage.xlsx` wird NICHT eingelesen (unbekannte Kategorie, kein `.md`). `resolveReadmeBody` wählt `expected.md` (Priorität 1).
- **C30 — Audit-Regeln (Rd7/Chef-Fix 4):** Führe die 5 semantischen Negative-Greps aus §9.0 C.6-INV-1 aus. Erwartung: alle 5 liefern 0 Treffer. Zusätzlich: Kommentar `// customRunTitle darf nicht in set() landen` irgendwo im Code → Allow-List-Prüfung schlägt NICHT fehl (Kommentar ist in erlaubter Datei), Negative-Greps greifen NICHT (kein echter Schreib-/Lese-Pfad).

### 15.3 Finale Confidence nach Rd7

**98 %** — Restrisiko (2 %): (a) Edge-Case Fattura-Nr mit < 5 Ziffern (Falmec-Konvention: ≥ 5, daher real nicht beobachtet; explizit aus C.7-INV-1 ausgeklammert). (b) Künftige `StepStatus`-Union-Erweiterung (z.&nbsp;B. `'queued'`/`'pending-async'`) ohne Guard-Update — als Tech-Debt-Hook in §8 Fallstrick 14 + §7 C.2.7 Stolperstein dokumentiert.

**Der Rd7-Plan ist die erste Iteration, die gleichzeitig schnüfflergeprüft, dataprotection-hart und lifecycle-korrekt ist. Status: READY FOR IMPLEMENTATION.**

---

## 16. Rd8 — Zombie-Guard (KISS-Zusatz)

**Problem:** Rd7-Guard nutzt `steps.some(st => st.status === 'running')`. Ein Browser-Kill mitten im Execute (I.md A2: Step-Übergänge sind Einbahnstraßen) hinterlässt einen `running`-Step in IDB. Bei Rehydration setzt der Recovery-Pfad `run.status = 'failed'`, aber der Step-Zustand bleibt „eingefroren" auf `running`. Folge: Test-Button für diesen gestern-toten Run für immer disabled.

**Fix:** Eine Zeile im Selector. Run-Status ist Master-Wahrheit:

```ts
if (cr.status !== 'running') return false;   // Rd8: Zombie-Guard vor Step-Check
return cr.steps.some((st) => st.status === 'running');
```

**Warum KISS:** Keine neue Sektion, kein neuer Store-Zustand, kein neuer Hook. Eine Gate-Zeile schließt den Riss. Invariante `C.7-INV-2` + Test `C31` dokumentieren den Fix im Phase-V-Audit.

---

## 17. Rd9 — Lead-Dev-Direktive (3 zwingende Fixes, Konsolidierung)

> **⚠ RÜCKBLICK-SEKTION §§17.1–17.10 — (HISTORISCH - NICHT UMSETZEN)** — Die folgenden Unterabschnitte (17.1–17.10) dokumentieren die Evolution Rd9→Rd12. Sie enthalten Vergleichstabellen, in denen absichtlich beide Formen (Rd9/Rd10-Bug UND Rd11/Rd12-Fix) nebeneinanderstehen. Der Coder-LLM übernimmt **ausschließlich** die rechte Spalte (aktuelle Form) bzw. die in §7 und §9.0 stehenden Code-Snippets. Legacy-Formen (`[QA] -`, `QA_TEST_`, `isProductiveRunActive`, Pipe-Separator, `replaceAll(...).trim()`) aus der linken Vergleichs-Spalte werden NICHT umgesetzt.


Der Lead-Dev hat nach Rd8 drei Korrekturen am Rd5/Rd7-Plan verlangt — eine UX-Entschärfung, eine Nomenklatur-Erweiterung und eine KISS-Vereinfachung. Alle drei sind in den Sektionen §1-§16 physisch eingearbeitet; diese Sektion fasst sie als Gesamtbild zusammen und erklärt die Kaskade der Folgeanpassungen.

### 17.1 Fix-Landkarte

| # | Was | Warum (Lead-Dev) | Wo im Plan sichtbar |
|---|---|---|---|
| **R9-1** | Stummer Hart-Block → User-Choice-Popup | Tester will die bewusste Entscheidung, nicht einen unerklärten disabled-Button. Transparenz statt Deckel. | §2 Impact-Matrix (neue Rd9-Zeile), §7 C.1.3 (onClick-Logik), §7 C.1.3.1 (neuer `OverwriteActiveRunDialog`), §7 C.2.6 (Pre-Check entfällt), §6 Test C32 |
| **R9-2** | `QA-README`-Ordner als verbindlicher Sichtfenster-Anker | Fester Nomenklatur-Anker schlägt Heuristik. Der Soll-Kontrakt muss vor allen Legacy-`expected.md`/`README.md`-Varianten gewinnen. | §7 C.2.1 (`classifyCategoryFolder` + `QaFolderKind`), §7 C.2.2 (ingestDirectory-Scan sammelt `.md` aus `QA-README/`), §7 C.1.4 (`resolveReadmeBody` priorisiert `qaReadme`), §7 C.1.5 (Legende-Dialog), §9.0 C.6-INV-4, §6 Test C33 |
| **R9-3** | KISS-Präfix `QA-${sampleId}` (ersetzt `QA_TEST_${sanitized}_`) | Drei Zeichen reichen als QA-Marker. Kein sanitize-Rauschen, keine Pipes, keine Klammern. Regex-Kanonisierung der Fattura-Nr bleibt unverändert. | §1/§7 C.3-Kontext, §7 C.2.6 (`customRunTitle = \`QA-${sampleId.trim()}\``), §7 C.3.2 (Patch-Concat ohne Separator, kein trailing underscore), §9.0 C.7-INV-1 (Rd9-Form des Regex-Schutzes), §6 Test C26 |

### 17.2 Folgewirkungen / beseitigte Rd5-Rd7-Artefakte

- Entfallen: `isProductiveRunActive` im `disabled`-Prop des Testlauf-Buttons, Toast-Warning `'Es läuft gerade ein Produktiv-Run …'`, Pre-Check im Handler-Body mit Early-Return.
- Entfallen: Präfix-Form `[QA] - {sampleName}` (Rd1-3) und `QA_TEST_${sanitized}_` (Rd7) — alle Plan-Zitate, Testbeispiele, Log-Snippets und Sanitization-Kommentare sind auf die Rd9-Form umgeschrieben.
- Ergänzt: Zweiter AlertDialog `OverwriteActiveRunDialog` + zwei neue States (`overwriteDialogOpen`, `pendingOverwriteSampleId`); neuer Enum-Sentinel `QaFolderKind = QaCategory | 'qa-readme'`; neue Invariante `C.6-INV-4` (Priorität QA-README im Sichtfenster).

### 17.3 Null-Impact-Neubewertung

- **`writeSampleAtomically`:** unverändert — die QA-README-Erweiterung greift weiterhin ausschließlich in Phase 1 (FS-Read), niemals in der IDB-Tx.
- **Engine-Entry-Points:** weiterhin nur D-1 (Parameter `customRunTitle`). Der neue Overwrite-Dialog ist reine UI-Logik und berührt kein Slice.
- **`replace(/\D/g, '').slice(-5)` an CIRCUIT-A12/A13-Vergleichspunkten:** durch den Rd9-Präfix weiter regelkonform (siehe C.7-INV-1 dreistufigen Check mit aktualisiertem Beispiel in C26).
- **Silo-Zertifizierung §13:** Diff-Check und Allow-List-Grep-Regeln unverändert — Rd9 ändert keine Datei außerhalb der drei bereits zugelassenen (`SettingsPopup.tsx`, `qaSamplesService.ts`, `ingestSlice.ts` + `types.ts`).

### 17.4 Finale Confidence nach Rd9

**99 %** (unverändert) — Die drei Fixes sind Vereinfachungen bestehender Plan-Teile, keine neuen Risiko-Dimensionen. Das 1 %-Restrisiko entspricht Rd6: unbekannte Unknowns aus der Peer-Review.

### 17.5 Rd10 — Konsolidierung & Regressions-Prüfung

Rd10 präzisiert drei Rd9-Entscheidungen, die in der Praxis noch zu stumpfe Kanten hatten, und führt eine finale Saniturings-Sektion ein.

| # | Rd10-Korrektur | Rd9-Fehlerbild | Rd10-Form |
|---|---|---|---|
| **R10-1** | Guard-Split `isEngineBusy` + `hasIdleWorkflowData` | Rd9 zeigte bei ECHT laufender Engine fälschlich den User-Choice-Dialog → „OK"-Klick hätte den aktiven Phase-1/2-Run zerstört. | Drei disjunkte Branches: (1) Engine-Busy → Toast, kein Dispatch; (2) Idle-Workflow-Daten → Dialog; (3) alles leer → Sofort-Dispatch. |
| **R10-2** | `QA-README` als PFLICHT | Rd9 priorisierte den Ordner nur, fiel aber bei fehlendem QA-README auf `expected.md`/`README.md`-Heuristiken zurück → ein Sample ohne Soll-Kontrakt konnte trotzdem einen Testlauf triggern. | `hasQaReadme`-Memo disabled den Button, UI zeigt roten Warnblock, `prepareFilesForIngest` weist defensiv ab (`ok:false`). |
| **R10-3** | Space-Sanitization (Rd11 korrigiert die Reihenfolge, Rd15 die Methode) | Rd9 machte keinen Unterschied zwischen IDB-sicher und FS-/Shell-/Regex-sicher. Leerzeichen in Sample-IDs wären bis in Export-Dateinamen durchgeschlagen und dort von `runPersistenceService.ts:517` zu `_` verstümmelt worden. | Stück-für-Stück-Ersetzung **in korrekter Reihenfolge, ES2020-safe** (Rd15): `sampleId.trim().split(' ').join('_')` vor Konkatenation. `trim()` ZUERST (Kanten-Whitespace weg), `split(' ').join('_')` DANACH. Kein globaler Sanitize, kein `replaceAll` (ES2021). |

**Regressions-Prüfung (alle Rev-6- und Rev-9-Reste explizit bestätigt entfernt):**

- [x] Kein `disabled={... || isProductiveRunActive}` am „Testlauf starten"-Button mehr — Rd10 disabled nur noch für `qaBusy`, `sampleDetailLoading`, fehlendes Sample UND fehlendes QA-README. Engine-Busy/Idle-Workflow werden im `onClick` verteilt, nicht via Prop.
- [x] Kein stummer `toast.warning('Es läuft gerade ein Produktiv-Run …')` aus Rd5-Hart-Block mehr — Rd10 nutzt spezifischeren Text `'Engine rechnet gerade — QA-Testlauf blockiert. Bitte warten oder pausieren.'`.
- [x] Kein Pre-Check `isProductiveRunActiveNow` im Handler-Body — der Handler trägt seit Rd9 keine Guard-Logik mehr (nur noch Happy-Path); Rd10 belässt das so.
- [x] Kein Fallback auf `expected.md` mehr als Pflicht-Ersatz — `expected.md` ist nur noch Dokumentations-Backfill für `resolveReadmeBody` bei Samples, die das Sichtfenster nur zur Ansicht öffnen, aber NIEMALS einen Testlauf-Button enablen.
- [x] Kein Alt-Präfix (`[QA] - `, `QA_TEST_`, Pipe-Separator) im gesamten Dokument mehr außerhalb von historisierenden Zitaten (§12.4, §15.1 H5, §14 Rd6-3, §17.1) und der neuen Löschungs-Liste (§19). Die restlichen Legacy-Erwähnungen sind als Legacy markiert und bleiben als Lernhistorie stehen.
- [x] Kein globales Store-Feld für den Hinterzimmer-Parameter (`pendingQaRunTitle`, `isQaRun`, etc.) — §9.0 C.6-INV-1 + §13.4 Zertifizierungs-Check bleiben unverändert gültig.
- [x] Kein `Engine-Auto-Render`-Pattern in den Navigation-Hinweisen mehr — §7 C.2.6 nutzt explizit `useNavigate` (Rd7/Chef-Fix 1).

### 17.6 Finale Confidence nach Rd10

**99 %** (unverändert). Rd10 beseitigt Randfälle aus Rd9 (Engine-Busy-Mixing, optionales QA-README, Space-Vergiftung im Präfix) ohne neue Invarianten oder Engine-Anfassungen. Das 1 %-Restrisiko bleibt unbekannte Unknowns aus der Code-Review.

### 17.7 Rd11 — Schnüffler-Blocker-Konsolidierung

Rd10 hatte fünf Implementierungs-Minen, die der Schnüffler (Code-Analyse-Agent) vor Merge gefunden hat. Rd11 löst alle fünf an der Wurzel — keine davon erfordert neue Architektur, nur saubere Handwerks-Korrekturen.

| # | Schnüffler-Befund | Rd10-Form | Rd11-Form |
|---|---|---|---|
| **S11-1** | `AlertDialogAction.onClick` ohne `preventDefault` schließt das Soll-Sichtfenster beim Klick — Toast/OverwriteDialog kollidieren mit verschwindendem Parent | `onClick={() => { if (isEngineBusy) {...}; ... }}` | `onClick={(e) => { if (...) { e.preventDefault(); ...; return; }; ... }}` in Branches 1+2; Branch 3 behält Default-Close |
| **S11-2** | `replaceAll(' ', '_').trim()` — trim nach Replace, führende/abschließende Leerzeichen landen als `_` und bleiben kleben | `sampleId.replaceAll(' ', '_').trim()` | `sampleId.trim().replaceAll(' ', '_')` — Kanten-Whitespace weg, dann interne Leerzeichen zu `_` |
| **S11-3** | React-Hooks-exhaustive-deps-Verstoß: `navigate` fehlt im Dep-Array von `useCallback(handleStartSampleTestRun, [...])` | `[ifMounted, onOpenChange]` | `[ifMounted, onOpenChange, navigate]` |
| **S11-4** | Widerspruch zwischen Rd10 QA-README-Pflicht und Rd10-Test C18 (flach bleibt lauffähig) | Test C18 dokumentierte V1-Rückwärtskompatibilität | Test C18 ist harter Legacy-Break, §6.1 dokumentiert den Migrations-Pfad |
| **S11-5** | §19-Deletions-Liste als SSOT-Reservat reicht nicht — Legacy-Phrasen (`Engine-Auto-Render`, `bewusst KEIN useNavigate`, alte Pipes, `QA_TEST_` in produktiven Kommentaren) waren weiterhin in §§1–18 lesbar | Produktive Abschnitte enthielten Legacy | Legacy aus §§1–18 physisch entfernt oder explizit als historisch markiert (`~~...~~` + Rd-Herkunfts-Label); §19 bleibt Pre-Merge-Grep-Werkzeug |

**Regressions-Prüfung (Rev-10-Fortschritte bleiben intakt):**

- [x] Guard-Split (`isEngineBusy` + `hasIdleWorkflowData`) bleibt: Rd11 ergänzt nur `e.preventDefault()` in den beiden schließungs-empfindlichen Branches, ändert keine Selektor-Semantik.
- [x] QA-README als Pflicht bleibt: Rd11 verschärft nur den Legacy-Break in C18/C19/§6.1, belässt `hasQaReadme`-Memo + Defense-in-Depth-Abweisung.
- [x] Leerzeichen-Sanitization bleibt: Rd11 korrigiert nur die Reihenfolge (trim → replaceAll), die Methoden-Wahl ist unverändert.
- [x] Überwiegende §§7-Codeblöcke (C.1.3.2 `hasQaReadme`, C.2.1 `QaFolderKind`, C.2.2 ingestDirectory-Scan, C.2.3 `prepareFilesForIngest`-Defense, C.2.7 `isEngineBusy`/`hasIdleWorkflowData`, C.3.2 ingestSlice-Patch) bleiben unverändert.

### 17.8 Finale Confidence nach Rd11

**99 %** (unverändert). Rd11 ist reine Handwerks-Hygiene — fünf Schnüffler-Befunde wurden an der Wurzel behoben, kein neuer Scope, keine Engine-Anfassung. Das 1 %-Restrisiko bleibt die finale Peer-Review am echten Code.

### 17.9 Rd12 — Redaktionelle SSOT-Konsolidierung

Der Schnüffler hat vier harte redaktionelle Widersprüche in Rev 11 gefunden, die Sonnet als 1:1-Kopiervorlagen genutzt hätte. Rd12 ist die physische Bereinigung:

| # | Rd11-Widerspruch | Rd12-Form |
|---|---|---|
| **D12-1** | Pfad-C.3-Pseudocode führte weiter den Pipe-Separator ``${customRunTitle} | ${r.invoice.fattura}`` | `${trimmedTitle}${r.invoice.fattura}` — identisch zu §7 C.3.2 Patch |
| **D12-2** | C.7-INV-1 + §19-L1 nannten `replaceAll(...).trim()` als Rd-Referenz | `sampleId.trim().replaceAll(' ', '_')` — Kanten-Trim zuerst |
| **D12-3** | C.7-INV-2 referenzierte den alten Sammel-Selektor `isProductiveRunActive` | `isEngineBusy` (Rd11-Ersatz), Zombie-Guard-Gate lexikalisch VOR der Step-Iteration |
| **D12-4** | §7 C.1.3 enthielt einen `~~strikethrough~~`-Block über Rd5/Chef-Fix 1 | Block ersatzlos gelöscht; neue knappe Rd11/Rd12-Guard-Verteilungs-Notiz |

**Regressions-Prüfung:** Rd11-Gewinne bleiben erhalten:

- [x] Radix `e.preventDefault()` in Branches 1+2 unverändert (§7 C.1.3 onClick).
- [x] Hook-Dep-Array `[ifMounted, onOpenChange, navigate]` unverändert (§7 C.2.6).
- [x] V1-Legacy-Break + §6.1 Migrations-Hinweis unverändert.
- [x] Guard-Split-Semantik (`isEngineBusy` + `hasIdleWorkflowData` disjunkt) unverändert.
- [x] Trim-Reihenfolge `trim()` vor String-Splitting bleibt überall gültig — die konkrete Methode ist ab Rd15 `split(' ').join('_')` (ES2020-safe) statt `replaceAll(' ', '_')` (ES2021, `TS2339` unter ES2020-Lib).

### 17.10 Finale Confidence nach Rd12

**99 %** (unverändert). Rd12 ändert keine Logik, nur Text — es räumt SSOT-Widersprüche weg, die Sonnet sonst als Arbeitsvorlage genommen hätte. Das 1 %-Restrisiko bleibt die Peer-Review am echten Code.

---

## 18. Nützliche Hinweise für Sonnet bei der Durchführung des Plans, um Fehler zu vermeiden

### 0. Oberstes Gebot (Rd15)

> **Achte penibel auf die exakte Syntax bei der Präfix-Konkatenation (KEINE Pipe, KEIN Leerzeichen) und der Sanitization (`trim().split(' ').join('_')`, ES2020-safe). Jede Abweichung bricht entweder den Compiler (Rd10-Bug `replaceAll` wegen ES2021-Mismatch) oder den Regex-Parser von Falmec.**

Dieses Gebot hat Vorrang vor allen nachfolgenden Fallstricken. Wenn ein Code-Snippet aus diesem Plan auf den ersten Blick anders aussieht als hier beschrieben — erst den Plan nochmal lesen, dann implementieren.

Der Coding-Meister (Sonnet) muss diesen Plan **exakt** befolgen. Die folgenden 12 Fallstricke sind die am häufigsten unterschätzten Stolperstellen — jeder einzelne kann einen an sich korrekten Patch in eine Regression verwandeln.

1. **Zwei AlertDialoge, nicht einer.** Das Soll-Sichtfenster (§C.1.3) und der User-Choice-Popup (§C.1.3.1) sind **getrennte** Radix-Dialoge. Beide rendern am Dateiende unter dem bestehenden Settings-Popup-JSX. NICHT verschachteln — Radix erlaubt keine verschachtelten AlertDialogs, und eine naive Umsetzung führt zu „Failed to execute focus"-Warnungen.
2. **`disabled`-Prop am „Testlauf starten"-Button bleibt minimal.** Rd11 erlaubt nur `qaBusy`, `sampleDetailLoading`, `!sampleDetail`, `!selectedSampleId`, `!hasQaReadme`. Weder `isEngineBusy` noch `hasIdleWorkflowData` (Rd11-Selektoren) dürfen am `disabled`-Prop hängen — die beiden werden im `onClick` verteilt. Jeder alte Sammel-Selektor-Ausdruck (Rd5-Form) ist ein Regressions-Trigger.
3. **Overwrite-Dialog-Buttons auf DE-Strings achten.** Der Cancel-Button heißt **„Abbrechen"**, der Confirm-Button **„OK — Produktivlauf überschreiben"**. Der Wortlaut ist Teil des Vertrags und taucht in Test C32 als Soll-Text auf.
4. **Nach Overwrite-OK wird `handleStartSampleTestRun` erst NACH dem State-Cleanup des Dialogs aufgerufen.** Siehe §C.1.3.1 `onClick`: zuerst `setOverwriteDialogOpen(false)` + `setPendingOverwriteSampleId(null)` via `ifMounted`, dann `handleStartSampleTestRun(sid)`. Andere Reihenfolge → Dialog bleibt offen, während Phase 1 läuft.
5. **KEIN Pre-Check mehr im `handleStartSampleTestRun`-Body.** Der alte Rd5-Block *(HISTORISCH - NICHT UMSETZEN: `isProductiveRunActiveNow`-Toast + Early-Return)* ist entfallen. Wenn er versehentlich aus einer früheren Rev kopiert wird, blockiert er bei Overwrite-Bestätigung den Dispatch UND zeigt einen irritierenden Toast. Der Handler-Body trägt KEINE Guard-Logik — Autorisierung liegt im `onClick` (Rd11).
6. **`classifyCategoryFolder` liefert jetzt einen erweiterten Rückgabetyp `QaFolderKind`.** Aufrufer in `ingestDirectory` müssen auf `'qa-readme'` prüfen, bevor sie den Wert als `QaCategory` verwenden. Ohne diese Fallunterscheidung kriegt TS einen Union-Mismatch bei `category: uploadCategory`.
7. **`QA-README`-Blobs landen mit `category: null` im Index.** Sie sind keine UploadedFile-Kategorie. `prepareFilesForIngest` überspringt sie automatisch (MD-Blobs werden eh via `if (blob.kind === 'md') continue;` übersprungen). Keine Extra-Behandlung nötig — aber auch kein Versuch, sie in den FileSnapshot zu drücken.
8. **`resolveReadmeBody`-Priorität: `qaReadme ?? expected ?? readme ?? sorted[0]`.** Jede andere Reihenfolge bricht C.6-INV-4. Das Präfix-Match auf `qa-readme/` MUSS `.toLowerCase()` nutzen (der IDB-Schlüssel behält Originalcase `QA-README/…`).
9. **Präfix-Konstruktion MUSS exakt als SSOT-Konstante `` const qaRunPrefix = `QA-${sampleId.trim().split(' ').join('_')}`; `` lauten.** Jede Abweichung (z.B. Weglassen des split/join-Schritts) verletzt das Oberste Gebot. `String.prototype.replaceAll` ist ES2021 und kompiliert unter der projektweiten `ES2020`-Lib NICHT (`TS2339`). Die Umwandlung von Leerzeichen in Unterstriche mittels `split(' ').join('_')` nach dem `trim()` ist zwingend erforderlich, damit der Compiler grün bleibt UND der Regex-Parser von Falmec nicht bricht. Diese Konstante wird genau EINMAL im Handler `handleStartSampleTestRun` konstruiert und anschließend überall referenziert — nicht kopiert.
10. **Patch-Concat im `ingestSlice.ts:290-321` ohne Separator.** Das `set()`-Objekt enthält exakt `fattura: \`${trimmedTitle}${r.invoice.fattura}\`` — keine Pipe, kein Leerzeichen, kein Bindestrich zwischen den Template-Slots. Ein verstecktes Leerzeichen bricht C.7-INV-1 (b) und C26.
11. **`npx tsc --noEmit` ist Pflicht-grün nach jedem GEKLAMMERTEN Schritt-Block (§8 Reihenfolge, Rd16-präzisiert).** Die §8-Reihenfolge-Schritte 2–4 (`QaFolderKind` einführen + `ingestDirectory`-Scan anpassen) bilden **eine atomare Klammer** — innerhalb dieser Klammer ist TS-rot kurzzeitig erwartbar (Union-Mismatch bei `category: uploadCategory`), nach Abschluss von Schritt 4 MUSS `tsc --noEmit` grün sein. Alle anderen Schritte (1, 5, 6, 7, 8, 9) sind einzeln Pflicht-grün. Konkrete Commit-Grenzen: commit(1), commit(2+3+4), commit(5), commit(6), commit(7), commit(8), commit(9) — jeder Commit grün.
12. **Nicht testen, dann erst den Audit ausfüllen.** Der `PROJ-50_AUDIT_DEV.md` (§11) wird **nach** Abschluss aller Tests erstellt, NICHT schrittweise. Der Audit liest den fertigen Code, nicht den Plan — Rd9-Änderungen haben dort die Allow-List, die Phase-V-Regeln und die neuen Tests (C32, C33) direkt zu belegen.

**Merksatz:** Rd9 macht den Plan **kleiner**, nicht größer. Wenn ein Schritt komplizierter wirkt als die Rd8-Vorversion, ist vermutlich ein Rd5/Rd7-Artefakt übriggeblieben — zurück in den Plan lesen und die Legacy-Zeile entfernen.

### 18.1 Zusätzliche Rd10-Fallstricke

13. **Zwei Selektoren, drei Branches.** `isEngineBusy` und `hasIdleWorkflowData` sind disjunkt. Nie beide gleichzeitig auf `true`. Der `onClick` im „Testlauf starten"-Button MUSS genau diese Reihenfolge haben: (1) `if (isEngineBusy) { toast.warning(...); return; }`, (2) `if (hasIdleWorkflowData) { open dialog; return; }`, (3) Direkt-Dispatch. Umgekehrte Reihenfolge zeigt bei laufender Engine fälschlich den Overwrite-Dialog und zerstört bei „OK"-Klick den aktiven Run.
14. **Toast-Wortlaut ist Vertrag (C32a).** `'Engine rechnet gerade — QA-Testlauf blockiert. Bitte warten oder pausieren.'` — exakt diese Formulierung. Kein `toast.error`, sondern `toast.warning` (Abbruch, kein Fehler).
15. **`.trim().split(' ').join('_')` — KEIN globaler Sanitize, KEIN `replaceAll` (ES2021).** Nur Leerzeichen ersetzen. Keine Regex `/[^\w.-]/g`, kein `replace(/\s+/g, '_')`, KEIN `replaceAll(' ', '_')` (kompiliert unter `tsconfig.app.json` `target: ES2020` NICHT). Der Lead-Dev hat „Stück für Stück" gesagt — `split(' ').join('_')` macht exakt das auf jeder ES-Version: Zerlegen an jedem Leerzeichen, mit `_` zusammenfügen. Tabs/NBSP/Zeilenumbrüche sind in Ordnernamen unrealistisch — nicht abzusichern.
16. **Reihenfolge beim Präfix: ZUERST `trim()`, DANN `split(' ').join('_')`. Beispiel: `sampleId.trim().split(' ').join('_')`. Jede andere Reihenfolge ist ein Bug.** `trim()` entfernt führende/abschließende Leerzeichen; erst danach zerlegt `split(' ')` und fügt `join('_')` wieder zusammen. Die umgekehrte Reihenfolge (`split` vor `trim`) lässt Kanten-Leerzeichen erst zu `_` werden, und `trim()` entfernt niemals Underscores → Präfix wäre `QA-_MeinSample_`. Das bricht den Regex-Parser von Falmec.
17. **QA-README-Pflicht greift an ZWEI Stellen.** (1) UI: `hasQaReadme`-Memo disabled den Button + roter Warnblock. (2) Service: `prepareFilesForIngest` prüft selbst und gibt `{ok:false, reason:'Sample ohne QA-README-Ordner — Soll-Kontrakt fehlt'}` zurück. Beide Stellen MÜSSEN implementiert sein — Defense-in-Depth gegen DevTools-Manipulation und künftige Nicht-UI-Aufrufer.
18. **Vor dem Merge: §19-Phrasen-Grep durchführen.** Jede Legacy-Phrase, die nicht in einem historisierenden Kontext (§12.4, §15, §17.1) steht, ist ein Bug. Siehe §19 für die Liste.

**Merksatz Rd10:** „Nicht stumm blockieren, aber auch nicht dem User Kollateralschäden aufdrücken." — getrennte Zustände, getrennte Konsequenzen.

### 18.2 Zusätzliche Rd11-Fallstricke

19. **Radix `AlertDialogAction` schließt den Parent-Dialog automatisch.** Das ist Radix-Default-Semantik und kein Bug. Wer nur einen Toast zeigt (Branch 1) oder einen zweiten Dialog öffnet (Branch 2), MUSS in der ersten Zeile des `onClick` `e.preventDefault()` aufrufen — sonst schließt Radix das Soll-Sichtfenster weg und der User steht ohne Kontext da (Branch 1) oder bekommt beide Dialoge gleichzeitig zu sehen und zu managen (Branch 2). Branch 3 (Sofort-Dispatch) darf das Default-Close behalten.
20. **Trim-Reihenfolge IMMER `trim().split(' ').join('_')`, niemals umgekehrt. Und KEIN `replaceAll` (ES2021 → Compile-Fehler unter ES2020).** Falsch-Reihenfolge (`split.join` vor `trim`) ist ein logischer Bug: `trim()` entfernt nur Whitespace, niemals `_`. Falsche Methode (`replaceAll`) bricht den TS-Compiler unter `tsconfig.app.json` `target: ES2020`. Immer erst `trim()`, dann `split(' ').join('_')`.
21. **`navigate` gehört ins Dep-Array des `useCallback`.** `navigate` aus `useNavigate()` ist nicht stabil garantiert (React-Router macht es zwar stabil, aber die Lint-Regel `react-hooks/exhaustive-deps` fordert es trotzdem ein — und zu Recht, falls der Router mal gewechselt wird). Weglassen = TS-Warning oder Stale-Closure-Bug, je nach Setup.
22. **V1-Legacy ist nicht mehr lauffähig — kein Migrations-Grace.** Samples ohne `QA-README/`-Unterordner dürfen geöffnet werden (Anzeige), aber der Testlauf-Button bleibt disabled. Kein Fallback auf flache Struktur, kein Auto-Migrate. §6.1 dokumentiert das als bewussten architektonischen Schnitt.
23. **Produktive Kommentare dürfen KEINE Legacy-Phrasen enthalten.** Die §19-Liste ist NUR das Pre-Merge-Grep-Safety-Net. Der Coder MUSS beim Schreiben der Handler/Selectoren/Dialoge bereits die Rd11-Form verwenden: keine Sprüche wie „Engine-Auto-Render" in Navigationskommentaren, keine Pipes (`|`) als Präfix-Separator, keine `QA_TEST_`-Formeln in Konstruktions-Bodies. Legacy darf NUR in historischen Rückblick-Sektionen (§12.4, §15, §17.1) auftauchen — dort als explizites Legacy-Zitat.

**Merksatz Rd11:** Jeder gefundene Schnüffler-Blocker ist ein Geschenk. Er kostet eine Minute zu fixen, spart eine Stunde Post-Merge-Debugging.

---

## 19. Phrasen zur Löschung vorgesehen

Diese Sektion listet alle veralteten Text- und Code-Phrasen, die in der finalen Umsetzung aus der Codebasis (NICHT aus dieser Plandatei — hier bleiben sie als Lernhistorie in §12.4, §15, §17.1) verschwinden müssen. Der Coder-LLM führt vor dem Merge einen wörtlichen Grep für jeden Eintrag aus; Treffer außerhalb der erlaubten Historisierungskontexte sind Merge-Blocker.

### 19.1 Präfix-Legacy (aus Rd1–Rd7, jetzt durch Rd9+Rd10 ersetzt)

| # | Legacy-Phrase / -Pattern | Zu löschen aus | Ersatz |
|---|---|---|---|
| L1 | `[QA] - {sampleName}` / `[QA] - ${sampleId}` | Jedem Code-Pfad, jedem Log-Literal | SSOT-Konstante `qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\`` (Rd15) |
| L2 | `QA_TEST_${sanitizedId}_` | Konstruktions-Stelle in SettingsPopup, Kommentare in ingestSlice.ts | identisch zu L1 |
| L3 | Separator `' \| '` zwischen Präfix und `fattura` | `set()`-Call in `parseInvoiceForIngest` | KEIN Separator (Concat ohne Zwischenzeichen) |
| L4 | `sampleId.replace(/[^\w.-]/g, '_')` (Global-Sanitize) | handleStartSampleTestRun | `sampleId.trim().split(' ').join('_')` (Rd15) |
| L4b | `sampleId.replaceAll(' ', '_').trim()` (Rd10-Bug — trim nach Replace wirkungslos auf Underscores) | handleStartSampleTestRun | `sampleId.trim().split(' ').join('_')` (Rd15 korrekte Reihenfolge) |
| L4c | `sampleId.trim().replaceAll(' ', '_')` (Rd11–Rd14-SSOT — **`replaceAll` ist ES2021, Projekt nutzt ES2020 → TS-Compile-Fehler**) | handleStartSampleTestRun + alle Plan-Referenzen | `sampleId.trim().split(' ').join('_')` (Rd15 ES2020-safe) |

### 19.2 Guard-Legacy (aus Rd5–Rd9, jetzt durch Rd10 ersetzt)

| # | Legacy-Phrase / -Pattern | Zu löschen aus | Ersatz |
|---|---|---|---|
| L5 | `disabled={... \|\| isProductiveRunActive}` am „Testlauf starten"-Button | `AlertDialogAction`-Prop | Rd10: nur `qaBusy`, `sampleDetailLoading`, `!sampleDetail`, `!selectedSampleId`, `!hasQaReadme` |
| L6 | `toast.warning('Es läuft gerade ein Produktiv-Run — QA-Testlauf blockiert.')` | onClick-Hart-Block + Handler-Pre-Check | Rd10: `toast.warning('Engine rechnet gerade — QA-Testlauf blockiert. Bitte warten oder pausieren.')` |
| L7 | `const isProductiveRunActiveNow = storeBefore.isProcessing === true \|\| ...` (Store-Pre-Check im Handler) | handleStartSampleTestRun | Ganzer Block ersatzlos entfallen (Autorisierung ist bereits im onClick-Branch passiert) |
| L8 | Sammel-Selektor `isProductiveRunActive` | SettingsPopup-Komponente | `isEngineBusy` + `hasIdleWorkflowData` (zwei disjunkte Selektoren) |
| L8a | `onClick={() => { … }}` ohne `e.preventDefault()` in Branches 1+2 (Rd10) | „Testlauf starten"-`AlertDialogAction` | Rd11: `onClick={(e) => { … e.preventDefault(); … }}` in Branches 1+2, Branch 3 unverändert |
| L8b | `useCallback(handleStartSampleTestRun, [ifMounted, onOpenChange])` (ohne `navigate`) | handleStartSampleTestRun | Rd11: `useCallback(..., [ifMounted, onOpenChange, navigate])` |

### 19.3 Navigation- und Sichtfenster-Legacy

| # | Legacy-Phrase / -Pattern | Zu löschen aus | Ersatz |
|---|---|---|---|
| L9 | Kommentar `// NAVIGATION: bewusst KEIN useNavigate hier` / `// Engine-Auto-Render` | §5 Pfad C.2, SettingsPopup | Rd7/Chef-Fix 1: `useNavigate` explizit importieren und `navigate(\`/run/${finalRunId}\`)` aufrufen |
| L10 | Fallback-Fluss `resolveReadmeBody` → `expected.md` als Pflicht-Quelle | nur als Fallback für reine Anzeige dokumentiert belassen | Rd10: `QA-README` ist Pflicht für den Testlauf-Button; `expected.md` bleibt nur als stiller Fallback für das Preview |

### 19.4 Diskurs-Artefakte („Hebel A/B", Meta-Sprache)

Diese Phrasen tauchten in früheren Planungsrunden auf, sind aber reine Meta-Analyse und gehören nicht in Code oder Kommentare:

| # | Phrase | Status |
|---|---|---|
| L11 | „Hebel A", „Hebel B", „Hebel C" | Niemals in Code-Kommentaren oder Log-Output. Plan-Formulierungen sind bereits bereinigt. |
| L12 | „Meta-Analyse", „Selbst-Bewertung" | Niemals in Code-Kommentaren. |
| L13 | „Engine-Auto-Render" | Siehe L9 — ersetzt durch explizites `useNavigate`. |
| L14 | „Pipe-Trennzeichen", „Pipe-Präfix" | In Code-Kommentaren nur noch als historisches Zitat („Rd1-3 nutzte Pipe, Rd10 konkateniert ohne Separator"). Keine Pipes mehr im echten String. |

### 19.5 Grep-Checkliste für den Coder-LLM

Vor dem Merge ausführen:

```bash
# Präfix-Legacy
grep -rn '\[QA\] -' src/
grep -rn 'QA_TEST_' src/
grep -rn "'sampleId.replace(/\\[\\^" src/

# Rd15: Drei harte Merge-Blocker (alle MÜSSEN 0 Treffer in src/ liefern)
rg "replaceAll\(' ', '_'\)"                                src features/PROJ-50_TEST-ARENA-DEV.md
rg "\\$\\{customRunTitle\\} \\|"                          src features/PROJ-50_TEST-ARENA-DEV.md
rg "QA_TEST_|\[QA\]|isProductiveRunActive|Engine-Auto-Render|bewusst KEIN useNavigate"  src
# Erwartung: KEINE Treffer in src/. Treffer in der Plandatei nur innerhalb
# markierter historischer/Negativ-Grep-Abschnitte (§12, §15, §17, §19).
# `replaceAll(' ', '_')` ist zusätzlich ein ES2021-Compile-Blocker unter ES2020-Lib.

# Rd15 korrekt (SSOT): `const qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\`` — erscheint EINMAL in handleStartSampleTestRun

# Guard-Legacy
grep -rn 'isProductiveRunActive' src/
grep -rn 'isProductiveRunActiveNow' src/
grep -rn 'Es läuft gerade ein Produktiv-Run' src/

# Rd11: Radix-preventDefault-Check
grep -rn 'AlertDialogAction' src/components/SettingsPopup.tsx    # Treffer manuell prüfen —
# die beiden Gate-Branches (isEngineBusy, hasIdleWorkflowData) müssen `e.preventDefault()` enthalten.

# Nav/Sichtfenster
grep -rn 'Engine-Auto-Render' src/
grep -rn 'bewusst KEIN useNavigate' src/
grep -rn 'pendingQaRunTitle\|qaHinterzimmer\|qaMode\|isQaRun' src/

# Meta-Diskurs
grep -rn 'Hebel A\|Hebel B\|Hebel C' src/
```

**Erwartung:** Jeder Grep liefert 0 Treffer. Jeder Treffer = Merge-Blocker (oder Update auf die Rd10-Form).

---

*Letzte Aktualisierung: 2026-04-22 | Rev 17 (Härtungsrunden 1-17 abgeschlossen, CONFI 98–99 %, Rd17-Mikro-SSOT: §8 Punkt 10 + §9.5 + §10 Checkliste auf konsolidierte Commit-Block-tsc-Logik (Klammer 2-3-4) umgeschrieben, §15.1 S2 `UploadedFileLike`-Debatte als HISTORISCH aufgelöst. **Oberstes Gebot (Rd15, unverändert):** `const qaRunPrefix = \`QA-${sampleId.trim().split(' ').join('_')}\``.)*

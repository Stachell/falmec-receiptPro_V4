# PROJ-50 — STEP 4 Diagnostic-Härtung & UI-Polishing

**Status:** PLAN (diagnostic, wartet auf Dom-Freigabe je Block)
**Datum:** 2026-04-20
**Scope (READ-ONLY bis Freigabe):**
- `src/store/slices/ingestSlice.ts`
- `src/store/slices/workflowSlice.ts`
- `src/store/slices/persistenceSlice.ts`
- `src/hooks/buildAutoSavePayload.ts`
- `src/services/matching/runs/run3ExpandFifo.ts`
- `src/services/matching/orderMapper.ts`
- `src/pages/RunDetail.tsx`
- `src/components/run-detail/*` (nur KPITile-Aufruf)
**Auslöser:** Nachlese-Befunde aus M4 (PROJ-46). Kein Code in dieser Datei — nur Analyse + Fix-Skizze.

---

## Block 1 — Die 3 wahrscheinlichsten Architektur-Bugs (Prüfung am harten Code steht aus)

### 1.1 Der Matching-False-Positive (Warum der Live-Run lügen könnte)
**Beobachtung:** Im Live-Run nach dem Ingest greift die FIFO-Regel bei bestimmten Artikeln nicht, obwohl für diese absichtlich keine offenen Bestellungen im ERP hinterlegt wurden. Der Workflow tut scheinbar so, als hätte er ein Match gefunden.
**Hypothese:** Ein Mapping-Fehler im Ingest/Parser schiebt sehr wahrscheinlich die Artikel-Modellbezeichnung (z. B. `KACL.1036`) fälschlicherweise in das Feld `orderNumber`. Der Matcher in Step 4 wirft diese "Schrott-Bestellnummer" gegen das ERP und erzeugt durch eine zu unscharfe Fuzzy-Logik fälschlicherweise ein `reference-match` oder `perfect-match`. 
**Auftrag & Fix-Skizze:**
- **Prüfen:** Code (`run3ExpandFifo.ts` / Ingest) auf dieses falsche Mapping durchsuchen.
- **Fix:** Ursprung stopfen (Modellnummer darf nicht ins `orderNumber`-Feld) und Matcher härten.

### 1.2 Der Cross-Run-State-Leak (Ghost-Issues)
**Beobachtung:** Die Konsole zeigt React-Key-Warnings (`Encountered two children with the same key`). Das UI blendet teils Warnungen aus, die im State existieren.
**Zusatz-Beobachtung (B-Block):** Beim Wiedereinstieg über das Dashboard/Archiv sind Daten inkonsistent. Das System "schluckt" vorhandene Fehler und markiert Läufe fälschlicherweise als fehlerfrei. Dies untermauert die Hypothese des Datenverlusts beim Serialisierungs-Pfad (Hydration).
**Hypothese:** Bei einem neuen PDF-Upload (Live-Ingest) wird das globale `issues`-Array im Zustand-Store vermutlich nicht geleert oder nach der neuen `runId` gefiltert. Issues aus einem vorherigen Run bleiben als Altlasten im neuen Run erhalten.
**Auftrag & Fix-Skizze:**
- **Prüfen:** Redux/Zustand-Store (`ingestSlice` / `runCrudSlice`) beim Initialisieren eines Runs checken.
- **Fix:** Array zwingend leeren/filtern, um Cross-Run-Leaks zu verhindern.

### 1.3 Der IDB-Hydrations-Bug (Header-Verlust & Geister-Runs)
**Beobachtung:** Nach einem Reload (Archiv oder "Neu verarbeiten") stürzt der UI-Reiter "RE-Positionen" mit der Meldung *"Keine Parsing-Daten verfuegbar"* ab. Step 4 fällt nun aber korrekt auf FIFO zurück.
**Hypothese:** Die App verliert beim Speichern oder Laden das `parsedInvoiceResult`-Objekt. Sehr wahrscheinlich blockiert hier das Timing des PROJ-49-Ownership-Guards (`buildAutoSavePayload.ts`) das Speichern des Rechnungskopfes.
**Auftrag & Fix-Skizze:**
- **Prüfen:** `buildAutoSavePayload.ts` und `persistenceSlice.ts` auf Datenverlust beim Header analysieren.
- **Fix:** Sicheres Persistieren garantieren, ohne die Schutzregeln von PROJ-49 auszuhebeln.

---

## Block 2 — Audit der Schnüffler-Restposten (Legacy-`startsWith(runId)`-Filter)

### 2.1 Fundstellen

Grep-Ergebnis (nur die vom Auditor bemängelten Stellen ohne `-line-`-Suffix):

| Datei | Zeile | Snippet |
|---|---|---|
| `src/store/slices/persistenceSlice.ts` | 34 | `state.invoiceLines.filter(l => l.lineId.startsWith(runId))` |
| `src/store/slices/workflowSlice.ts` | 572 | `state.invoiceLines.filter(l => l.lineId.startsWith(runId))` |
| `src/store/slices/runCrudSlice.ts` | 602 | `...state.invoiceLines.filter(l => !l.lineId.startsWith(runId))` |
| `src/store/slices/runCrudSlice.ts` | 724 | `state.invoiceLines.filter(l => !l.lineId.startsWith(runId))` |

Kanonische Form (neu, korrekt): ``${runId}-line-`` — so z. B. in `persistenceSlice.ts:172`, `workflowSlice.ts:411`, `mutationSlice.ts:164, 191, 235, 290, 327`, `buildAutoSavePayload.ts:28`.

### 2.2 Analyse: Toter Code oder aktiv?

**`persistenceSlice.ts:34` — `archiveRun`**
- Läuft bei jedem Archivierungs-Aufruf. **Aktiv.**
- Kollisionsrisiko: `runId` könnte Präfix eines anderen `lineId` sein? Praktisch nein — `runId` hat UUID-/Timestamp-Form, das Suffix ist `-line-N-M`. `startsWith(runId)` matcht alles mit `-line-`-Suffix. **Semantisch äquivalent**, aber **fragile** (wenn jemals zwei runIds Präfix-überlappen).
- **Migration** (empfohlen): `.startsWith(\`${runId}-line-\`)`.

**`workflowSlice.ts:572` — `generateStep5Issues`**
- Wird bei jedem Step-5-Abschluss aufgerufen (Issue-Berechnung). **Aktiv.**
- Gleiche Semantik-Äquivalenz / Fragilität wie oben. **Migration** empfohlen.

**`runCrudSlice.ts:602` — `updateRunWithParsedData` (Neu-Parse-Pfad)**
- Setzt invoiceLines neu: `[...neue, ...alte-ohne-diesen-run]`. **Aktiv.**
- Negation (`!l.lineId.startsWith(runId)`) bedeutet „alle Zeilen, die nicht zu diesem Run gehören, behalten". Mit der alten Form würden theoretisch auch Zeilen *anderer* Runs gelöscht, deren `runId` ein Suffix von diesem wäre. **Migration** empfohlen.

**`runCrudSlice.ts:724` — `deleteRun`**
- Gleiches Muster, beim Löschen eines Runs. **Aktiv.** **Migration** empfohlen.

### 2.3 Empfehlung

> **Kein toter Code**. Alle vier Stellen sind aktiv. Die Wirkung ist **funktional heute unauffällig**, aber die Präfix-Kollisions-Gefahr verletzt die in PROJ-46 eingeführte Line-Kanon. Einheitlicher Ersatz: ``l.lineId.startsWith(`${runId}-line-`)`` bzw. die Negation davon.
>
> **Wartet auf Dom-Freigabe.** Änderung ist 4 Einzeiler, kein Logik-Risiko, Tests unverändert. Vorschlag: in einem einzigen, atomaren Commit "chore(store): Line-Präfix-Filter auf kanonische Form migrieren".

---

## Block 3 — Optische Korrektur: Run-Detail Kachel 2 „Positionen extrahiert"

### 3.1 IST-Zustand

`RunDetail.tsx:735–745`:

```tsx
<KPITile
  value={`${currentRun.stats.articleMatchedCount}/${currentRun.invoice.targetPositionsCount ?? (currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines)}`}
  label="Positionen extrahiert"
  subValue={kachel2SubValue}
  …
/>
```

- **Nenner heute:** `targetPositionsCount ?? (expandedLineCount || parsedInvoiceLines)`.
  - `expandedLineCount` = Summe der Einzelprodukte (Zähler nach Expansion, `runCrudSlice.ts:585`: `invoiceLines.reduce((sum, l) => sum + l.qty, 0)`).
  - `parsedInvoiceLines` = Anzahl echter Rechnungszeilen (`result.lines.length`).
- **Zähler heute:** `articleMatchedCount` — Anzahl gematchter Zeilen (nach Step 2/3 Logik).
- **Problem:** Zähler zählt Positionen, Nenner kippt nach Step 3 auf expandierte Einzelprodukte → Bruch verliert Sinn (z. B. 25 gematchte Positionen / 47 Einzelprodukte → wirkt wie „Lücke").

### 3.2 SOLL-Zustand (rein optisch, Store bleibt unverändert)

- **Bruch Zähler/Nenner:** beide auf echte **InvoiceLines** (Rechnungszeilen). Konkret:
  - Nenner: `currentRun.stats.parsedInvoiceLines` (direkt, kein Fallback auf `expandedLineCount`).
  - Zähler: `articleMatchedCount` bleibt, aber nur wenn semantisch auch gegen `parsedInvoiceLines` gezählt wird. **Annahme zu prüfen** (Umsetzungs-Task): ist `articleMatchedCount` Positions- oder Expanded-granular? Wenn Expanded, brauchen wir einen Display-Wert, der Positions-granular ist — am einfachsten per `Math.min(articleMatchedCount, parsedInvoiceLines)` (reine UI-Klemmung) oder per neuem Derived-Selektor `articleMatchedPositionsCount` (nur Lesen aus `invoiceLines` + `distinct positionIndex`).
  - **Minimal-invasiv (empfohlen):** Kein neuer Store-Wert, kein Derived-Selektor-Reshuffle. Wir nutzen in der UI:
    ```ts
    const matchedPositions = new Set(
      invoiceLines
        .filter(l => l.lineId.startsWith(`${currentRun.id}-line-`) && l.matchStatus !== 'pending')
        .map(l => l.positionIndex)
    ).size;
    ```
    Das ist eine reine UI-Ableitung, kein Store-Schreib. Siehe auch STANDARDS.md (Vite, Zustand) — UI-Derivation ist konform.

- **Ergänzender Badge (Expanded-Zahl):**
  - Unterhalb/neben dem Bruch ein kleines `Badge` oder `subValue`-Text: `inkl. ${expandedLineCount} Einzelprodukte` (nur anzeigen, wenn `expandedLineCount > parsedInvoiceLines`).
  - Implementiert über das bereits existierende `subValue`-Prop von `KPITile` (s. `RunDetail.tsx:738`). Kein neues Prop, kein neues Styling.

### 3.3 Fix-Skizze (nur `RunDetail.tsx`, nur JSX)

1. Direkt vor dem KPITile-Block `kachel2*`-Berechnung: neuen `matchedPositions`-Selector lokal ableiten (siehe 3.2).
2. `value`-Prop ändern zu:
   ```
   `${matchedPositions}/${currentRun.stats.parsedInvoiceLines}`
   ```
3. `subValue` erweitern:
   - Wenn `expandedLineCount > parsedInvoiceLines`: `inkl. ${expandedLineCount} Einzelprodukte` (zusätzlich zum bisherigen `kachel2SubValue`).
4. **Keine Änderung an:** Kachel 1, Kachel 3, Kachel 4, Store, Archive, Export.
5. **Keine Änderung an** `run.stats.articleMatchedCount` — das bleibt die Store-Wahrheit.

### 3.4 Warnung / Invariante

- `parsedInvoiceLines` darf **nie 0 werden**, wenn Zeilen existieren. `runCrudSlice.ts:584` schreibt `result.lines.length` — OK.
- Wenn `targetPositionsCount` explizit gesetzt ist (Frozen-Snapshot, `types/index.ts:239` Kommentar), ist das die autoritativste Quelle → Fallback-Reihenfolge: `targetPositionsCount ?? parsedInvoiceLines`. `expandedLineCount` fällt komplett aus dem Bruch-Nenner raus.

---

## 4. Abhängigkeiten / Reihenfolge der Umsetzung

1. **Block 2 (Präfix-Migration)** — trivial, risikofrei, kann zuerst ausgeführt werden sobald freigegeben.
2. **Block 3 (Kachel 2)** — isoliert, keine State-Änderung, gute Zwischen-Lieferung für Dom.
3. **Block 1 Defekt B (KACL)** — zuerst Logging-Runde, dann Contract-Gate im OpenWE-Import + Invariante in `run3ExpandFifo`. Benötigt Dom-Verifikation eines Live-Archivs.
4. **Block 1 Defekt A (Belegnummer)** — fällt ggf. teilweise durch Block-B-Fix weg, wenn es sich als derselbe Pfad erweist. Ansonsten Preview-Fallback + Ownership-Guard-Logging.

## 5. Offene Fragen für Dom

- (Q1) Ist Block 2 als eigener chore-Commit OK, oder soll er mit Block 3 gebündelt werden?
- (Q2) Darf ich für Block 1 eine temporäre Debug-Logging-Runde einziehen (2–3 `console.log` / `logService.debug`), oder soll der Fix direkt „blind" ausgeliefert werden?
- (Q3) Für Block 3: soll die Badge-Anzeige auch dann erscheinen, wenn `parsedInvoiceLines === expandedLineCount` (also kein echter Expand stattgefunden hat)? Vorschlag: nein — nur wenn es was zu sagen gibt.

## Block 4 — Refactoring: Nostalgie-Renaming (3 Run Engine v.23)
**Beobachtung / Ziel:** Der interne Bezeichner "PROJ-23 (3-Run-Engine)" ist nicht mehr zeitgemäß, soll aber aus Nostalgie in "3 Run Engine v.23" geändert werden, ohne die App zu brechen.
**Auftrag & Fix-Skizze:**
- **Prüfen:** Alle Referenzen, Typings und Abhängigkeiten zu diesem String im Code aufspüren (z. B. in `orderMapper.ts`, Run-Stats, Logs oder UI-Komponenten).
- **Fix:** Den String nahtlos umbenennen, sodass keine bestehenden Auswertungen, historische IDB-Daten oder Engine-Zuweisungen ins Leere laufen. 

## Block 5 — IDB Storage-Wartung: Export & Delete-Blockade
**Beobachtung:** Im Bereich `/Settings/Speicher` klappt der JSON-Export, aber die Option "Komplettes Archiv erzwingen & leeren" löscht das IDB-Archiv nicht. Zudem lassen 3 korrupte/fehlerhafte Runs den gesamten Export/Lösch-Prozess crashen.
**Hypothese:** Die alte Speicher-Logik ist nach unserer Umstellung auf IndexedDB und den neuen `runCrudSlice` nicht mehr sauber verdrahtet. Die korrupten Runs werfen vermutlich einen ungefangenen Error, der den kompletten Lösch-Loop (z.B. ein fehlendes Error-Handling im `Promise.all`) abbrechen lässt.
**Auftrag & Fix-Skizze:**
- **Prüfen:** Verdrahtung der Lösch-Funktion gegen die neue `runPersistenceService`-API checken und das JSON-Export-Format validieren.
- **Fix:** Try-Catch-Blockadebrecher einbauen (defekte Runs dürfen den Bulk-Export/Delete nicht stoppen, sondern müssen geloggt/übersprungen werden). Den Löschbefehl hart und verlässlich mit der IDB synchronisieren.

## Block 6 — System-Telemetrie: Globales Logfile härten
**Beobachtung:** Das globale Logfile muss um systemweite Events erweitert werden, um nutzbar zu sein, darf aber nicht durch Run-spezifische Details zugemüllt werden.
**Auftrag & Fix-Skizze:**
- **Prüfen:** Welche systemweiten Meta-Events (Store-Init, IDB-Bulk-Cleanups, Settings-Änderungen, Auth-States) fehlen aktuell im Global-Log?
- **Fix:** Globales Logfile um Meta-Events erweitern. Strikte Trennung wahren: Run-spezifische Aktionen bleiben ausschließlich im Run-eigenen `auditLog`. Das globale Log protokolliert maximal übergeordnete Meilensteine (z. B. "Run 123 gestartet / archiviert / gelöscht").


## Block 7 — ERROR-RESOLVER-STADIUM (DYNAMISCHE FEHLER-HÄRTUNG)

### 7.0 Darstellung der Fehler-Bodys im Tab-Reiter "Fehler":
Die Fenster, bzw. Bodys sind mit am unteren Rand mit dem "ausklappen"-Pfeil abgebildet. Das ist eine Funktion die haben wir z.B. in den Tabs "RE-Positionen - Body", "Artikelliste - Body", "Export - XML-Vorschau", etc. - DASS MUSS UNBEDINGT SO BLEIBEN- FOLGENDE ÄNDERUNGEN BEZIEHEN SICH AUSSCHLIESSLICH AUF DEN BODY DER ERZEUGTEN FEHLER IM TAG-FELD "FEHLER" AUF DER RUN-DETAIL.
 - Im Tab-Bereich "Fehler" auf der Run-Detail und nur dort sollen die Pfeile zum ausklappen NICHT dargestellt werden, es sei denn der Text läuft über die bestehende Größe der aktuellen Fehlerbodys hinaus.
 - Begründung: Wenn kein Inhalt vorhanden ist, denkt man es wäre Inhalt vorhanden, klappt aus und merkt das dies nicht der Fall ist. Das wirkt unprofessionell und sorgt für Verwirrung.

### 7.1 Fehlermeldung - Inhalt: 
** Problem:** In den Fehlerdaten sind Daten wie Artikelnummer, Herstellerartikelnummer bzw. Bestellnummer, EAN, etc. allerdings keine Bezeichnung der Geräte. Das ist für den Benutzer nicht lesefreundlich**
** Auftrag:**
- **Datenergänzung im Fehlercenter:** Die deutsche Artikelbezeichnung als Text muss in die jeweilige Fehlerzeile in allen Fehler mit integriert werden.
- **Anordnung:**: Die Fehlerausgabe bringt je Fehler eine Zeile, diese ist lesbar formatiert für den User. Diese leicht lesbare Formatierung unbedingt beibehalten.
- **Fehlererläuterung:**: Am Ende der Zeile wäre noch eine kurze Erläuterung von bis zu 40-50 Zeichen, jedoch so knapp wie möglich formuliert um den Fehler selbst abgesehen von der Überschrift zu erläutern. Beispiel bei FIFO - am Ende der Zeile: "FIFO: Bestellnummer aus Beleg nicht vorhanden, verfügbare offene Position verwendet."

### 7.2 FIFO-Fix: "Lösung erzwingen" & Bestellnummer-Korrektur
**Problem:** FIFO-Warnungen können aktuell nicht manuell erledigt werden. Es fehlt die visuelle Brücke zur Bestellnummer-Auswahl.
**Auftrag:**
- **UI-Anpassung:** Tab "Lösung erzwingen" erhält analog zur Preisabweichung das Feld "Bestellnummer korrigieren".
- **Optik:** Rahmen-Button mit integriertem Auswahl-Popup. Darstellung: Aktuelle Auswahl als Text + Checkbox (dynamische Ausgabe). Design muss zu 100% konsistent zum Rest der App bleiben.
- **Logik:** Auswahl einer anderen Bestellnummer setzt das FIFO-Issue auf `resolved`.

### 7.3 Visual Gate: Die "Zweite Sicherheitsstufe" (Beleg zugeteilt)
**Problem:** Der User braucht eine optische Bestätigung, dass FIFO nur ein "Notnagel" ist.
**Auftrag:**
- **Mechanismus:** Solange ein FIFO-Warning aktiv (oder Mail-Anfrage offen) ist, wird die ZWEITE Checkbox der Kachel "Bestellung zugeteilt" blockiert (bleibt grau/leer).
- **Ziel:** Rein optische Sperre. Erst nach manueller Korrektur (7.1) oder expliziter Bestätigung wird die Kachel vollständig "grün".

### 7.4 Seriennummern-Härtung (Masken-Recycling)
**Problem:** "Seriennummer fehlt" bietet aktuell keine Bearbeitung an. Das Handling von Dubletten/Fehlern ist blockiert.
**Auftrag:**
- **Recycling:** Nutze die Maske von "Stammdaten/EAN nicht gefunden" als Kopiervorlage.
- **Erweiterung:** Feld "Seriennummernpflichtig" (JA/NEIN) einbauen. Bei "JA" erscheint das Eingabefeld "Seriennummer eintragen".
- **Visuals:** Popup-Schrift Weiß auf Dunkelgrün (CI-konform).
- **Eintrag:** Das Feld wird zur Dropdown: Bestehende Einträge (aus ERP/Scan) + Option "Selbst wählen" für manuellen externen Wert.
- **Strategie:** Erst-Installation bei "Stammdaten nicht gefunden" als Prototyp/Vorlage, dann Rollout für Seriennummern-Fehler.

### 7.5 Hard-Stop: Artikel ohne Belegzuweisung (ERP-Schutz)
**Problem:** Aktuell löst ein Artikel ohne zugeordneten Beleg/Rechnung keinen blockierenden Fehler aus. Dies führt zu einem fehlerhaften Export, der vom Ziel-ERP-System komplett abgewiesen wird (Import-Stopp).
**Auftrag & Fix-Skizze:**
- **Severity-Upgrade:** Die fehlende Belegzuweisung muss in der Engine zwingend als harter Fehler (`severity: 'error'`) eingestuft werden.
- **Workflow-Guard (Hard-Stop):** Die Engine muss den Workflow blockieren. Die Export-Freigabe darf nicht erteilt werden.
- **Resolution:** Der Fehler muss in der UI aktiv behoben (Beleg zuweisen) oder über die "Lösung erzwingen"-Funktion bestätigt werden, bevor der Run weiterlaufen oder exportiert werden darf.


## Block 8 — SECURITY-GUARD (Block4Step Härtung & Persistence)

### 8.1 Persistence-Fix & SSOT-Verdrahtung
**Problem:** Der "Block4Step"-Schieberegler (Preis-Stop) verliert bei Refresh, hartem Beenden oder "Neu verarbeiten" seinen Zustand und fällt auf Default zurück.
**Hypothese:** Der Regler in der Run-Detail ist nicht fest mit dem `settingsSlice` (Global) oder dem persistierten `Run`-Objekt (IDB) verdrahtet. Beim Reprocessing wird der lokale State überschrieben.
**Auftrag & Fix-Skizze:**
- **Synchronisation:** Der Schieberegler muss bidirektional mit `Settings > Matcher > Preisabweichungen blockieren Step 2` verknüpft sein.
- **Default-Härtung:** Die Standardeinstellung im System-Init muss auf "BLOCKIEREN" stehen (Sicherheits-Standard).
- **Persistenz:** Sicherstellen, dass der Zustand im `Run`-Objekt in der IndexedDB gespeichert wird, damit er einen "Reprocess"-Cycle überlebt.

### 8.2 UI/UX: Dynamisches Schloss & Tooltips
**Auftrag:**
- **Schloss-Icon:** Ein dynamisches Schloss-Icon (Geschlossen/Offen) vor dem Regler in der `RunDetail` und in den `Settings`.
- **Hoover-Effekt (Tooltips):** Integration von Erklärtexten:
  - *Text:* "Aktivieren/Deaktivieren Sie einen STOP vor Teilung der Rechnungszeilen."
  - *Zusatz:* Erklärung der Zustände (z.B. "Aktiv: Workflow hält bei Preisfehlern an" / "Deaktiviert: Workflow läuft trotz Fehlern durch").
- **Visuals:** Wiedererkennungswert durch identische Icons in Settings und Run-Detail Header.

## Block 9 — UX-SHIELD (Processing-Overlay)

### 9.1 Die "Chaos-Shield" Animation
**Problem:** Beim Klick auf "Verarbeitung starten" sieht der User kurzzeitig das "Chaos" im Hintergrund (leere Kachel-Frames, zuckende Layouts), bevor die ersten Daten stehen.
**Lösung:** Ein `ProcessingOverlay` (Glassmorphismus).
**Auftrag & Fix-Skizze:**
- **Visual:** Sobald die Verarbeitung startet, wird der gesamte Viewport leicht verschwommen (CSS `backdrop-filter: blur(8px)`) und ein zentrales, animiertes Falmec- oder Engine-Icon dreht sich in der Mitte.
- **Guard-Logik:** Das Overlay wird bei Klick auf den Start-Button aktiviert.
- **Termination:** Das Shield verschwindet automatisch, sobald der Ingest-Status auf "Invoicelines integriert" springt oder die erste Zahl in den Dashboard-Kacheln erscheint.
- **Ziel:** Verbergen der initialen Rechenlast/Layout-Verschiebungen für ein flüssiges UI-Gefühl.

## Block 10 - 1.Verklinkung "Archiv im Explorer öffnen" korrigieren + 2. Erweiterung um ein weiteres Link-Feld + 3. Optikanpassung

### 10.1 Vorhandene Verlinkung korrigieren ""Archiv im Explorer öffnen"
Location: Run-Detail > Tab "Details" > Body "Link".
- Der Pfad bei Klick sollte den Speicherort des Runs öffnen - falls vorhanden. Falls noch nicht vorhanden soll der Button ausgegraut sein.
- Der Button sollte intuitiver beschriftet werden, statt "Archiv im Explorer anzeigen" sollte er benannt werden in "Run-Archiv im Explorer öffnen.
- Falls eine neue Zugriffsanfrage notwendig ist, soll diese erscheinen - der User klickt auf OK und kann wie gewünscht Fortfahren.

### 10.2 Erweiterung um ein weiteres Link-Feld
Location: Run-Detail > Tab "Details" > Body "Link".
KONTEXT: Eine Möglichkeit via Button, also Klick den Ordner zu öffnen in dem die Uploaddateien liegen um diese ggf. zu prüfen. 
- Die Upoaddateien Rechnung und Warenbegleitschein werden vom System gesichert. Das soll so bleiben, die Buttons für den Speicherort haben somit eine zusätzliche Funktion können gerne in einen separaten Body dargestellt werden.
- Bei Upload der Dateien soll jeweils bei jeder Datei der Uplaod-Pfad gesichert werden und je Uplaoddatei soll ein Button für das Öffnen des Speicherortes zur Verfügung gestellt werden mit hinterlegtem Uplaod-Pfad. 
     - Begründung: Falls die Daten nicht alle in einem Ordner liegen, müssen sie einzeln im Speicherort zu öffnen sein.
     - Falls alle Daten in einem Speicherort liegen, ist 4x der gleiche Pfad hinterlegt. Das ist okay, das kann ich KISS hinnehmen - dafür habe ich eine global funktionierende Regel.
	 - **FALLS** eine erneute Freigabe auf die Ordnerstruktur notwendig ist, weil nicht mehr hinterlegt soll eine neue Anfrage erscheinenen, der User kann mit JA bestätigen und ist direkt bei seinen hochgeladenen Upload-Datein z.B. zur Prüfung.

### 10.3 Optikanpassung
Location: Run-Detail > Tab "Details" > Body "Link".
Die Buttons liegen optisch untereinander angesetzt, dass lässt den Rest des Bodys zum einen größer aber auch leer wirken. 
- Anpassung um das optisch besser darzustellen könnte sein, könnten die Links nebeneinander angordnet sein. 


---

## Hinweise für Sonnet/Opus (Umsetzung)

- **STRICT:** Kein Scope-Creep. Block für Block. Zwischen Blöcken auf Dom warten.
- `INVARIANTS.md`, `CIRCUIT.md`, `STANDARDS.md` VOR jedem Block lesen.
- Vor jeder Code-Änderung `npx tsc --noEmit` als Baseline.
- Block 1 Defekt B erfordert Verifikation gegen ein reales Archiv — bitte vor dem Schreiben von Contract-Gates das Log-Beweisstück einholen.
- Block 3 rührt **den Store nicht an**. Sollte ein „schöner" Refactor auffallen (Derived-Selector im Store anlegen): notieren, NICHT bauen.



BLOCK 7 TAUSCHEN:
LAGERPLÄTZE KORREKTE REGEX FÜR MATCH IM ERP UND ERWEITERUNG UM KD;0;0;0:

>> HAUPTLAGERPLATZ 1: "WE LAGER;0;0;0"
>> HAUPTLAGERPLATZ 2: "WE KDD;0;0;0"
>> NEBENLAGERPLATZ 3: "KD;0;0;0"
>> NEBENLAGERPLATZ 4: "LKW5;0;0;0"
>> NEBENLAGERPLATZ 5: "LKW6;0;0;0"
>> NEBENLAGERPLATZ 6: "LKW7;0;0;0"
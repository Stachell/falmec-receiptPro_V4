# PROJ-43: IssueCenter Overhaul — Master-Architekturplan

## Context

Das Fehlercenter (Reiter "Fehler" in der Run-Detail-Ansicht) ist aktuell eine semi-statische Anzeigetafel mit unvollstaendigen Daten, einem optisch kaputten Popup und fehlender Interaktivitaet. PROJ-43 transformiert es in eine interaktive, revisionssichere **Schaltzentrale zur Datenrettung** mit lueckenlosem Audit-Trail.

### Bestaetigte Bugs (Codebase-Analyse)

| # | Bug | Datei | Zeilen |
|---|-----|-------|--------|
| 1 | Step-2-Issues (`price-mismatch`, `inactive-article`) fehlt `affectedLineIds` komplett | `runStore.ts` | 2956-3001 |
| 2 | `blockStep2OnPriceMismatch`-Guard prueft `severity === 'error'`, aber price-mismatch wird als `'warning'` erzeugt — Guard greift NIE | `runStore.ts` | 1441-1444 vs 2959 |
| 3 | Step 5 erzeugt keine Issue-Objekte — Export-Blocker sind nur inline-Booleans in `ExportPanel.tsx` | `ExportPanel.tsx` | 36-39 |
| 4 | Kein `'pending'`-Status — Escalation setzt `escalatedAt`/`escalatedTo`, aber Status bleibt `'open'` (PROJ-39-Kommentar: "KISS: no new enum value") | `types/index.ts` | 379 |

---

## PHASE 1: Daten-Fundament & Audit-Trail

### Ziel
Alle generierten Issues MUESSEN `affectedLineIds` enthalten. Step 5 muss echte Issue-Objekte generieren. Hard/Soft-Fail-Logik wird sauber getrennt. Jede State-Aenderung wird lueckenlos geloggt.

### 1.1 Type-Erweiterungen

**Datei: `src/types/index.ts`**
- `Issue.status`: `'open' | 'pending' | 'resolved'` (PROJ-39-Kommentar aktualisieren)
- Neue `IssueType`-Werte: `'missing-storage-location'` (falls nicht vorhanden), `'export-no-lines'`

### 1.2 Bug-Fix: `affectedLineIds` in Step 2

**Datei: `src/store/runStore.ts`** (Zeilen 2956-3001)
- **price-mismatch** (Zeile 2966): `affectedLineIds: priceMismatchLines.map(l => l.lineId)` ergaenzen
- **inactive-article** (Zeile 2994): `affectedLineIds: inactiveLines.map(l => l.lineId)` ergaenzen
- Pattern: Identisch zu `relatedLineIds`-Zuweisung in derselben Zeile

### 1.3 Bug-Fix: Severity-Guard-Alignment

**Datei: `src/store/runStore.ts`** (Zeilen 1441-1444)
- Guard aendern: Severity-Check entfernen, Status-Check von Anfang an mit `'pending'`:
  `i.type === 'price-mismatch' && (i.status === 'open' || i.status === 'pending')`
- Begruendung: Der Config-Flag `blockStep2OnPriceMismatch` drueckt bereits die Blocking-Absicht aus — eine zusaetzliche Severity-Pruefung ist redundant und aktuell kaputt. Der `'pending'`-Status muss sofort mitgedacht werden, da ein eskalierter price-mismatch weiterhin blockieren soll

### 1.4 Step-5-Issue-Generierung (mit Lifecycle!)

**Datei: `src/store/runStore.ts`** — Neue Aktion `generateStep5Issues(runId: string)`

**Erzeugung:** Scannt aktuelle `invoiceLines` des Runs:
- Zeilen ohne `storageLocation` → Issue `'missing-storage-location'`, severity `'error'`, stepNo 5
- `invoiceLines.length === 0` → Issue `'export-no-lines'`, severity `'error'`, stepNo 5
- `affectedLineIds` = betroffene lineIds

**Auto-Resolve (KRITISCH!):** Die Funktion muss ZUERST alle bestehenden Step-5-Issues pruefen:
- Fuer jeden offenen `'missing-storage-location'`-Issue: Pruefen ob ALLE `affectedLineIds` nun einen `storageLocation`-Wert haben → wenn ja, Issue auf `status: 'resolved'` setzen mit `resolutionNote: 'Automatisch geloest: Lagerorte nachgetragen'`
- Fuer `'export-no-lines'`: Pruefen ob `invoiceLines.length > 0` → wenn ja, resolven
- Erst DANACH neue Issues fuer noch fehlende Bedingungen erzeugen (keine Duplikate!)

**Aufruf-Zeitpunkte (3 Trigger):**
1. **Automatisch** wenn `advanceToNextStep` den Step 5 erreicht (in der Step-Transition-Logik)
2. **Manuell** via Aktualisieren-Button (`refreshIssues`, Phase 2)
3. **Vor Export** als letzte Validierung

- Bestehende `isExportReady`-Logik in `ExportPanel.tsx` bleibt als Fallback-Guard

### 1.5 Audit-Trail-Haertung

Bereits vorhandene Logging-Punkte (bestaetigt):
- `resolveIssue()` → logService.info + addAuditEntry ✓
- `escalateIssue()` → logService.info + addAuditEntry ✓
- `setManualPrice()` → addAuditEntry ✓

**Neu hinzuzufuegen:**
- `splitIssue()` (Phase 4): logService.info mit Split-Details
- `reopenIssue()` (Phase 4): logService.info mit Begruendung
- Status-Transition `open → pending`: Bereits durch `escalateIssue` geloggt, nur Anpassung auf neuen Status

### Dateien Phase 1
| Datei | Aenderung |
|-------|-----------|
| `src/types/index.ts` | `'pending'` zu Status-Union, neue IssueTypes |
| `src/store/runStore.ts` | affectedLineIds-Fix (2x), Severity-Guard-Fix, `generateStep5Issues` |

---

## PHASE 2: State-Synchronisation (Aktualisieren-Button)

### Ziel
Ein Button im Fehler-Tab evaluiert den aktuellen Store-State neu und markiert geloeste Fehler automatisch. Kein Parser, kein Import, keine Step-Ausfuehrung.

### 2.1 Neue Store-Aktion

**Datei: `src/store/runStore.ts`** — `refreshIssues(runId: string)`

Algorithmus:
1. `invoiceLines` und `issues` aus State holen
2. `autoResolveIssues(issues, lines, runId)` aufrufen (existiert: Zeilen 248-266)
3. `generateStep5Issues(runId)` aufrufen (neu aus Phase 1)
4. Aktualisierte Issues in State setzen
5. `logService.info('Issues aktualisiert', { runId, step: 'Issues' })`

**EISERNE REGEL:** Kein Aufruf von `parseInvoice`, `advanceToNextStep`, `retryStep`, `executeMatcherCrossMatch`, `executeMatcherSerialExtract` oder irgendeiner Step-Logik.

### 2.2 UI: Button-Platzierung

**Datei: `src/components/run-detail/IssuesCenter.tsx`**
- Platzierung: In der Filter-Bar (rechte Seite), neben bestehendem Layout
- Icon: `RefreshCw` (lucide-react)
- Label: "Aktualisieren"
- Visuelles Feedback: Kurzer Spin-Animation auf dem Icon waehrend Ausfuehrung

### Dateien Phase 2
| Datei | Aenderung |
|-------|-----------|
| `src/store/runStore.ts` | `refreshIssues` Aktion |
| `src/components/run-detail/IssuesCenter.tsx` | Aktualisieren-Button in Filter-Bar |

---

## PHASE 3: UI-Facelift & Routing

### Ziel
Das Popup uebernimmt exakt das Design des SettingsPopup (600px, vertikale Tabs, gleiche Farben). 5 Tabs ersetzen die aktuelle Flat-Struktur.

### 3.1 Neue Komponente: IssueDialog

**Neue Datei: `src/components/run-detail/IssueDialog.tsx`**

Extrahiert aus `IssuesCenter.tsx` (Zeilen 713-955 aktuell).

#### Dialog-Struktur (SettingsPopup-Pattern)
```
Dialog (max-w-[600px], bg=#D8E6E7)
  DialogHeader: Issue-Titel + SeverityBadge
  Tabs (orientation="vertical", flex gap-4, h-[65vh] max-h-[800px])
    TabsList (w-44, bg=#c9c3b6)
      [1] "Uebersicht"          (immer sichtbar)
      [2] "Fehlerbericht"       (immer sichtbar)
      [3] "Loesung erzwingen"   (immer sichtbar, AlertTriangle-Icon)
      [4] "E-Mail erzeugen"     (immer sichtbar, Mail-Icon)
      [5] "Anfragen"            (NUR sichtbar wenn pending-Issues existieren)
```

#### Tab-Inhalte

**Tab 1 — Uebersicht (Home):**
- SeverityBadge + Typ-Label
- Message + Details
- Max. 5 betroffene Zeilen (aus `affectedLineIds`, mit Positionsindex + Artikelnr)
- Context-Info (expectedValue vs actualValue)
- Zwei prominente Buttons:
  - "E-Mail erzeugen" (Mail-Icon) → springt zu Tab 4
  - "Loesung erzwingen" (AlertTriangle-Icon) → springt zu Tab 3

**Tab 2 — Fehlerbericht:**
- Kompletter Fehler-String (Message + Details + betroffene Zeilen + Timestamps)
- Escalation-Historie (falls vorhanden)
- "Kopieren"-Button (useCopyToClipboard)

**Tab 3 — Loesung erzwingen:**
- Warnhinweis: "Achtung: Manuelle Loesungen koennen die Sage-ERP-Integritaet beeintraechtigen."
- Dropdown: "Alle Zeilen" oder einzelne Zeilen (Checkbox-Liste)
- **WICHTIG — Lesbare Zeilen-Darstellung:** Die `affectedLineIds` MUESSEN gegen `useRunStore().invoiceLines` gematcht werden, um in der Checkbox-Liste **lesbare Daten** anzuzeigen:
  - `price-mismatch`: Positionsindex, Artikelname/Nr, Rechnungspreis vs. Sage-Preis
  - `no-article-match`: Positionsindex, EAN, Herstellerartikelnr, Bezeichnung
  - `serial-mismatch`: Positionsindex, Artikelname, benoetigte vs. zugewiesene Seriennummern-Anzahl
  - `missing-storage-location`: Positionsindex, Artikelname, aktueller Lagerort-Wert (leer)
  - Fallback: Positionsindex + lineId als Tooltip
- Der User muss auf den ersten Blick erkennen, WELCHE Zeile er anklickt — rohe `lineId`-Strings sind VERBOTEN!
- Dynamische Loesungs-Buttons je nach `issue.type`:
  - `price-mismatch`: "Sage-Preis waehlen", "Rechnungspreis behalten", "Manuell eingeben"
  - `no-article-match`: "Artikel manuell zuweisen"
  - `serial-mismatch`: "Ohne Seriennummer fortfahren"
  - `missing-storage-location`: "Lagerort zuweisen"
  - Default: "Als geloest markieren"
- Textfeld fuer Loesungsbeschreibung (Pflicht bei "Loesung erzwingen")
- Button: "Loesung anwenden" (ruft `resolveIssue` oder `splitIssue` auf)

**Tab 4 — E-Mail erzeugen:**
- Dropdown: Empfaenger aus gespeicherten Email-Slots (`getStoredEmailAddresses()`)
- Fallback: Manuelles Eingabefeld
- Editierbarer Mail-Body (Textarea, vorausgefuellt via `generateMailtoLink`)
- "E-Mail erzeugen"-Button (Mailto-Link, setzt Status auf `'pending'`)

**Tab 5 — Anfragen bearbeiten:**
- Dynamisch: Nur sichtbar wenn `issues.filter(i => i.status === 'pending').length > 0`
- Liste aller Pending-Issues des aktuellen Runs
- Pro Issue: Empfaenger, Timestamp, Buttons:
  - "Als geloest markieren" → `resolveIssue()`
  - "Erneut senden" → oeffnet Tab 4
  - "Zurueck zu Offen" → `reopenIssue()` (neue Aktion)

### 3.2 Design-Referenz (SettingsPopup.tsx)

Exakte Uebernahme dieser Werte:
```tsx
<DialogContent className="max-w-[600px] w-full" style={{ backgroundColor: '#D8E6E7' }}>
<Tabs orientation="vertical" className="flex gap-4 mt-2 h-[65vh] max-h-[800px]">
<TabsList className="flex flex-col h-auto items-start justify-start gap-0.5 p-1 w-44 shrink-0"
  style={{ backgroundColor: '#c9c3b6', borderRadius: '0.5rem' }}>
```

### 3.3 IssuesCenter.tsx Cleanup

- Inline-Dialog (Zeilen 713-955) komplett entfernen → ersetzt durch `<IssueDialog />`
- AlertDialogs (Zeilen 887-955) in IssueDialog verschieben
- IssuesCenter behaelt: Filter-Bar, Summary, Quick-Fix-Banner, Issue-Cards, Resolved-Section
- IssueCard: `onEdit`-Callback oeffnet den neuen IssueDialog

### 3.4 IssueCard-Updates

- Neuer visueller Status fuer `'pending'`: Amber-Border + Hourglass-Icon + "In Klaerung"
- Button-Labels:
  - `status === 'open'` ohne Escalation: "Bearbeiten"
  - `status === 'open'` mit Escalation: "Erneut senden"
  - `status === 'pending'`: "Anfrage pruefen"

### Dateien Phase 3
| Datei | Aenderung |
|-------|-----------|
| `src/components/run-detail/IssueDialog.tsx` | **NEU** — Tabbed Dialog |
| `src/components/run-detail/IssuesCenter.tsx` | Dialog entfernen, IssueDialog importieren, IssueCard updaten |

---

## PHASE 4: Interaktive Loesungs-Maschine

### Ziel
Pending-Zustand, Issue-Splitting und Reaktivierung als vollstaendige Zustandsmaschine.

### 4.1 Pending-Status-Transition

**Datei: `src/store/runStore.ts`** — `escalateIssue` modifizieren:
```typescript
escalateIssue: (issueId, recipientEmail) => {
  // Status: 'open' → 'pending' (war: bleibt 'open')
  // escalatedAt + escalatedTo setzen
  // logService.info + addAuditEntry
}
```

**Impact-Analyse fuer `'pending'` (VOLLSTAENDIG — 9 Stellen gefunden):**
| Stelle | Aktuelle Logik | Anpassung noetig |
|--------|---------------|-----------------|
| `autoResolveIssues` (runStore.ts:251) | Filtert `status === 'open'` | NEIN — pending wird korrekt uebersprungen |
| `ExportPanel.tsx:37` | `i.status === 'open' && i.severity === 'error'` | JA — `(status === 'open' \|\| status === 'pending')` |
| `RunDetail.tsx:246` | `i.status === 'open' && i.severity === 'error'` (DUPLIKAT!) | JA — identische Anpassung wie ExportPanel |
| `blockStep2OnPriceMismatch` (runStore.ts:1443) | `i.status === 'open'` | JA — bereits in Phase 1.3 gefixt |
| `IssuesCenter.tsx:396` openIssues | `i.status === 'open'` | JA — Dritte Kategorie: pending zwischen open und resolved anzeigen |
| `IssuesCenter.tsx:397` resolvedIssues | `i.status === 'resolved'` | NEIN — bleibt korrekt |
| `archiveService.ts:293` | `i.status === 'open'` (Archiv-Summary) | JA — `pendingIssues`-Zaehler ergaenzen |
| `archiveService.ts:685` | `i.status === 'open'` (Duplikat) | JA — identische Anpassung |
| `buildAutoSavePayload.ts:40` | Generische Serialisierung | NEIN — `'pending'` ueberlebt Persistenz automatisch |

### 4.2 Issue-Splitting (Koenigsdisziplin)

**Datei: `src/store/runStore.ts`** — Neue Aktion `splitIssue(issueId, resolvedLineIds, resolutionNote)`

Algorithmus (IMMUTABLE!):
1. Original-Issue finden
2. Validieren: `resolvedLineIds ⊆ issue.affectedLineIds`
3. `remainingLineIds = issue.affectedLineIds.filter(id => !new Set(resolvedLineIds).has(id))`
4. Wenn `remainingLineIds.length === 0` → direkt `resolveIssue()` delegieren
5. Sonst:
   - **Neuer resolved Issue** (Klon):
     - `id: ${originalId}-split-${Date.now()}`
     - `affectedLineIds: [...resolvedLineIds]` (KOPIE! — nur UI-Anzeige)
     - `relatedLineIds: [...issue.relatedLineIds]` (VOLLSTAENDIGE KOPIE vom Original! NICHT resolvedLineIds!)
     - `status: 'resolved'`, `resolvedAt: now`
     - `resolutionNote: 'Teilaufloesung: ${note}'`
     - `message: '${base} (${count} Positionen geloest)'`
   - **Original-Issue updaten** (IMMUTABLE via map):
     - `affectedLineIds: [...remainingLineIds]` (KOPIE! — nur UI-Anzeige)
     - `relatedLineIds: [...issue.relatedLineIds]` (UNVERAENDERT! Vollstaendige Kopie behalten!)
     - `message: '${base} (${remaining} Positionen verbleibend)'`
   - **ACHTUNG:** `relatedLineIds` werden fuer Auto-Resolve und Jump-Links benutzt (PROJ-21-Kommentar: "DO NOT CHANGE"). Sie enthalten Querverweise zu Artikeln/Bestellungen und duerfen NIEMALS durch `resolvedLineIds` oder `remainingLineIds` ersetzt werden! Nur `affectedLineIds` (UI-only) wird gesplittet.
6. Beide Issues in Array setzen (via `state.issues.map` + concat)
7. logService.info + addAuditEntry mit Split-Details

### 4.3 Issue-Reaktivierung

**Datei: `src/store/runStore.ts`** — Neue Aktion `reopenIssue(issueId)`
- `status: 'pending' → 'open'`
- `escalatedAt` und `escalatedTo` bleiben erhalten (Historie)
- logService.info + addAuditEntry

### 4.4 Guard-Anpassungen (VOLLSTAENDIGE LISTE)

**Datei: `src/store/runStore.ts`**
- Alle `status === 'open'`-Checks die Blocking-Logik steuern muessen `'pending'` einschliessen
- `autoResolveIssues` (Z.251) NICHT aendern (pending soll bewusst uebersprungen werden)

**Datei: `src/components/run-detail/ExportPanel.tsx`** (Z.37)
- Blocking-Check: `(i.status === 'open' || i.status === 'pending') && i.severity === 'error'`

**Datei: `src/pages/RunDetail.tsx`** (Z.246) — DUPLIKAT-GUARD!
- Identische Anpassung wie ExportPanel: `(i.status === 'open' || i.status === 'pending') && i.severity === 'error'`

**Datei: `src/services/archiveService.ts`** (Z.293 + Z.685) — ARCHIV-SUMMARY!
- Neuen Zaehler `pendingIssues` ergaenzen oder pending zu `openIssues` zaehlen
- BEIDE Stellen anpassen (Code ist dupliziert)

### Dateien Phase 4
| Datei | Aenderung |
|-------|-----------|
| `src/store/runStore.ts` | `escalateIssue` modifizieren, `splitIssue` + `reopenIssue` hinzufuegen, Guards updaten |
| `src/components/run-detail/ExportPanel.tsx` | Blocking-Check fuer `'pending'` |
| `src/pages/RunDetail.tsx` | Blocking-Check fuer `'pending'` (Duplikat-Guard Z.246) |
| `src/services/archiveService.ts` | Archiv-Summary: `pendingIssues`-Zaehler (Z.293 + Z.685) |
| `src/components/run-detail/IssueDialog.tsx` | Splitting-UI (Checkbox-Liste), Pending-Tab-Logik |
| `src/components/run-detail/IssuesCenter.tsx` | Pending-Kategorie in Liste |

---

## Datenfluss-Diagramme

### Issue-Splitting
```
User oeffnet Issue (5 affectedLineIds) → Tab "Loesung erzwingen"
  → Waehlt 2 von 5 Zeilen via Checkbox
  → Klickt "Loesung anwenden"
  → splitIssue(issueId, [line1, line2], "Preis manuell korrigiert")
    → Original: affectedLineIds=[line3,line4,line5], status='open'
    → Neuer Klon: affectedLineIds=[line1,line2], status='resolved'
    → logService.info + addAuditEntry
```

### Pending-Zustandsmaschine
```
[open] --escalateIssue()--> [pending] --resolveIssue()--> [resolved]
[open] --resolveIssue()---> [resolved]
[pending] --reopenIssue()--> [open]
[pending] --resolveIssue()--> [resolved]
```

### Aktualisieren-Flow
```
User klickt "Aktualisieren"
  → refreshIssues(runId)
    → autoResolveIssues() [bestehend]
    → generateStep5Issues() [neu]
    → State-Update
    → logService.info
  → KEIN Parser/Matcher/Step-Neustart!
```

---

## STOLPERSTEINE & REGELN FUER SONNET

### Stolperstein 1: Issue-Splitting
**EXTREM auf Immutability achten!** Beim Zerschneiden von `affectedLineIds`:
- IMMER `[...array]` Spread oder `.filter()` (erzeugt neues Array)
- NIE Referenzen auf den originalen Store-State ueberschreiben
- `new Set(resolvedLineIds)` fuer O(1)-Lookup bei der Filterung
- Jedes neue Issue-Objekt muss ein komplett neues Objekt sein (kein Shallow-Copy mit Referenz-Sharing)

### Stolperstein 2: Aktualisieren-Button
Dieser Button darf **NUR** den State neu ableiten. Er darf **KEINESFALLS**:
- Einen Import starten
- Einen Parser-Step neu starten
- `advanceToNextStep`, `retryStep`, `executeMatcherCrossMatch`, `executeMatcherSerialExtract` aufrufen
- Dateien erneut parsen

### Stolperstein 3: Hard/Soft-Fail
**Keine bestehenden Guards veraendern**, ohne die Severity-Abfrage (`error` vs `warning`) exakt auf die neue fachliche Logik abzustimmen. Konkret:
- Der `blockStep2OnPriceMismatch`-Guard wird auf Typ-Check umgestellt (kein Severity-Check mehr)
- Alle anderen Guards bleiben unveraendert
- `autoResolveIssues` wird NICHT fuer `'pending'`-Issues aufgerufen (korrekt so)

### Stolperstein 4: `'pending'`-Status bricht bestehende Guards
Jede Stelle die `status === 'open'` fuer Blocking-Logik prueft, MUSS auf `'pending'`-Einschluss geprueft werden:
- `ExportPanel.tsx` Blocking-Check → JA, einschliessen
- `blockStep2OnPriceMismatch` → JA, einschliessen
- `autoResolveIssues` → NEIN, bewusst auslassen

### Eiserne Sonnet-Regeln
1. **IMMER** vorher in den Plan-Modus gehen (`/plan`)
2. **IMMER** in die Projektdaten schreiben (`MEMORY.md`)
3. Am Ende selbststaendig `npx tsc --noEmit` ueber das Terminal ausfuehren und Fehler fixen
4. Die Datei `features/INDEX.md` aktualisieren
5. **NIEMALS** `archiveService.ts`, `clearAllFiles()`, `loadStoredFiles()` anfassen

---

## Verifizierung / Testplan

### Pro Phase:
- `npx tsc --noEmit` → 0 Errors

### Funktionale Tests:
1. **Phase 1:** Step-2-Run durchfuehren → price-mismatch-Issue muss `affectedLineIds` haben → IssueCard zeigt betroffene Zeilen
2. **Phase 1:** Export ohne Lagerorte → Step-5-Issue `'missing-storage-location'` wird im Fehlercenter angezeigt
3. **Phase 2:** Preis manuell aendern (Tab "Eigenschaften") → "Aktualisieren" klicken → price-mismatch-Issue wird auto-resolved
4. **Phase 3:** Issue-Popup oeffnen → 5 Tabs sichtbar, Design identisch zu SettingsPopup
5. **Phase 4:** 2 von 5 Zeilen loesen → Original-Issue hat 3 remaining, neuer resolved Issue hat 2
6. **Phase 4:** E-Mail senden → Status wechselt zu `'pending'` → Export bleibt blockiert → "Zurueck zu Offen" setzt Status zurueck

### Regression:
- Bestehende Auto-Resolve-Logik funktioniert weiterhin
- Export-Guards blockieren korrekt bei open UND pending error-Issues
- Step-Transitions werden nicht durch Aktualisieren-Button getriggert
- Archiv-Summaries zaehlen alle drei Status korrekt
- RunDetail.tsx:246 Duplikat-Guard blockiert identisch zu ExportPanel

### Step-5-Auto-Complete Besonderheit:
Step 5 wird aktuell via setTimeout (100ms) auto-completed (runStore.ts:1690-1702). `generateStep5Issues` muss VOR diesem Auto-Complete aufgerufen werden, sonst ist der Run schon "ok" bevor die Issues existieren. Empfehlung: `generateStep5Issues(runId)` direkt in den `if (nextStep.stepNo === 5)` Block einbauen, BEVOR der setTimeout startet.

---

## Kritische Dateien (Gesamtuebersicht)

| Datei | Rolle |
|-------|-------|
| `src/types/index.ts` | Type-Foundation: `'pending'`, neue IssueTypes |
| `src/store/runStore.ts` | Kern-Logik: Bug-Fixes, neue Aktionen, Guard-Updates |
| `src/components/run-detail/IssueDialog.tsx` | **NEU** — Tabbed Dialog (Phase 3+4) |
| `src/components/run-detail/IssuesCenter.tsx` | Refactoring: Dialog-Extraktion, Aktualisieren-Button, Pending-UI |
| `src/components/run-detail/ExportPanel.tsx` | Guard-Update fuer `'pending'` |
| `src/pages/RunDetail.tsx` | Guard-Update fuer `'pending'` (Duplikat Z.246) |
| `src/services/archiveService.ts` | Archiv-Summary: `pendingIssues`-Zaehler (Z.293 + Z.685) |
| `src/components/SettingsPopup.tsx` | **NUR LESEN** — Design-Referenz |
| `src/services/logService.ts` | **NUR LESEN** — bestehendes API nutzen |
| `src/lib/errorHandlingConfig.ts` | **NUR LESEN** — Email-Slots API nutzen |
| `src/lib/issueLineFormatter.ts` | **NUR LESEN** — Mailto-Generation nutzen |

---

## KONFIDENZ-BEWERTUNG: 88%

### Begruendung:
Die Architektur ist nach 3 Revisionsrunden und einem exhaustiven Sanity-Check ueber ALLE 9 `status === 'open'`-Stellen, ALLE 6 `relatedLineIds`-Lesezugriffe und ALLE 6 `affectedLineIds`-Lesezugriffe vollstaendig durchleuchtet. Die vier bestaetigten Bugs haben klare, chirurgische Fixes. Die Zustandsmaschine (`open ↔ pending → resolved`) ist sauber und bricht keine bestehende Logik.

### Warum nicht 100% (Restrisiken fuer Sonnet):

1. **Step-5 Auto-Complete Timing (HOCH):** `advanceToNextStep` ruft Step 5 via setTimeout(100ms) auf und auto-completed ihn sofort. `generateStep5Issues` muss exakt VOR diesem Auto-Complete greifen. Falsches Timing → Issues werden erzeugt NACHDEM der Run als "ok" markiert ist → inkonsistenter State. Sonnet muss das Timing akribisch pruefen.

2. **`generateStep5Issues` Duplikat-Vermeidung (MITTEL):** Wenn der User mehrfach "Aktualisieren" klickt, darf die Funktion keine doppelten `missing-storage-location`-Issues erzeugen. Sonnet muss eine Guard-Logik einbauen: "Existiert bereits ein offener Issue dieses Typs fuer diese lineIds? → Kein neuer Issue."

3. **`checkIssueStillActive` + Splitting (NIEDRIG):** Nach einem Split hat der verbleibende offene Issue die VOLLEN `relatedLineIds` (korrekt!), aber `checkIssueStillActive` prueft Bedingungen gegen ALLE related Lines. Wenn die gesplitteten Zeilen inzwischen gefixt wurden, koennten die Bedingungen fuer die verbleibenden 3 Zeilen trotzdem noch aktiv sein → Auto-Resolve loest korrekt NICHT aus. Aber: Wenn spaeter auch die 3 restlichen Zeilen gefixt werden, resolved Auto-Resolve korrekt. Kein Bug, aber Sonnet muss verstehen warum `relatedLineIds` ungekuerzt bleiben.

4. **archiveService.ts Duplikat-Code (NIEDRIG):** Der Archiv-Summary-Code ist an zwei Stellen dupliziert (Z.293 + Z.685). Sonnet muss BEIDE Stellen identisch anpassen — eine zu vergessen waere ein stiller Datenverlust im Archiv.

5. **RunDetail.tsx:246 Duplikat-Guard (NIEDRIG):** Identische Blocking-Logik wie ExportPanel.tsx:37. Sonnet muss BEIDE synchron halten.

---

### Bestehende Funktionen wiederverwenden (NICHT neu bauen):
- `autoResolveIssues()` (runStore.ts:248-266)
- `checkIssueStillActive()` (runStore.ts:208-241)
- `resolveIssue()` (runStore.ts:1919-1932)
- `escalateIssue()` (runStore.ts:1935-1948)
- `setManualPrice()` (runStore.ts:2367-2404)
- `generateMailtoLink()` (issueLineFormatter.ts)
- `getStoredEmailAddresses()` (errorHandlingConfig.ts)
- `useCopyToClipboard()` Hook
- `useClickLock()` Hook

---

## QA Test Results

**QA-Datum:** 2026-03-10
**Tester:** QA Engineer (Claude)
**TypeScript-Check:** `npx tsc --noEmit` → **0 Errors** ✓

---

### Acceptance Criteria — Ergebnis

| # | Kriterium | Status | Anmerkung |
|---|-----------|--------|-----------|
| P1.1 | `Issue.status` um `'pending'` erweitert | PASS | `src/types/index.ts` Z.373 |
| P1.2 | Neue IssueTypes `'missing-storage-location'` + `'export-no-lines'` | PASS | `src/types/index.ts` Z.11+35 |
| P1.3 | `affectedLineIds` in Step-2-Issues (price-mismatch, inactive-article) | PASS | `runStore.ts` Z.3224+3254 |
| P1.4 | `blockStep2OnPriceMismatch`-Guard: Typ-Check statt Severity-Check, `'pending'` eingeschlossen | PASS | `runStore.ts` Z.1479-1481 |
| P1.5 | `generateStep5Issues` mit Auto-Resolve + Duplikat-Guard | PASS | `runStore.ts` Z.2269-2364 |
| P1.6 | `generateStep5Issues` VOR Step-5-Auto-Complete aufgerufen | PASS | `runStore.ts` Z.1739-1740 (BEVOR setTimeout fuer Auto-Complete) |
| P2.1 | `refreshIssues`-Aktion: autoResolve + generateStep5Issues, KEIN Step-Restart | PASS | `runStore.ts` Z.2367-2374 |
| P2.2 | "Aktualisieren"-Button in IssuesCenter Filter-Bar, RefreshCw-Spin | PASS | `IssuesCenter.tsx` Z.413-418, 495 |
| P3.1 | Neue Komponente `IssueDialog.tsx` (517 Zeilen) | PASS | `src/components/run-detail/IssueDialog.tsx` |
| P3.2 | Dialog-Design: 600px, bg=#D8E6E7, TabsList bg=#c9c3b6 — identisch SettingsPopup | PASS | `IssueDialog.tsx` Z.190, 207-210 |
| P3.3 | 5 Tabs: Uebersicht / Fehlerbericht / Loesung erzwingen / E-Mail erzeugen / Anfragen | PASS | Z.211-230 |
| P3.4 | Tab 5 "Anfragen" nur sichtbar wenn pending issues > 0 | PASS | Bedingtes Rendering Z.225+457 |
| P3.5 | Tab 1: Betroffene Zeilen (max. 5), Context-Info, Quick-Buttons | PASS | Z.252-297 |
| P3.6 | Tab 2: Fehlerbericht mit Kopieren-Button + Escalation-Historie | PASS | Z.300-321 |
| P3.7 | Tab 3: Warnhinweis, Checkbox-Liste mit lesbaren Labels (kein roher lineId-String), Pflichtfeld Beschreibung | PASS | Z.323-393 |
| P3.8 | Tab 4: Gespeicherte Emails + manuelles Eingabefeld, Mailto-Link, Status → pending | PASS | Z.395-453 |
| P3.9 | Tab 5: Pending-Issues mit "Als geloest", "Erneut senden", "Zurueck zu Offen" | PASS | Z.456-511 |
| P3.10 | IssueCard: pending → Amber-Border + Clock-Icon + "In Klaerung" | PASS (Minor) | Clock-Icon statt Hourglass — siehe Bug #1 |
| P3.11 | IssueCard: Button-Labels nach Status (Bearbeiten/Erneut senden/Anfrage pruefen) | PASS | Z.237-267 |
| P4.1 | `escalateIssue` setzt Status `'pending'` | PASS | `runStore.ts` Z.1991 |
| P4.2 | `splitIssue`: Immutable, relatedLineIds unveraendert, affectedLineIds gesplittet, Logging | PASS | Z.2377-2427 |
| P4.3 | `reopenIssue`: pending → open, Escalation-Historie bleibt erhalten, Logging | PASS | Z.2430-2443 |
| P4.4 | ExportPanel-Guard: `(open \|\| pending) && error` | PASS | `ExportPanel.tsx` Z.38 |
| P4.5 | RunDetail-Guard (Duplikat): `(open \|\| pending) && error` | PASS | `RunDetail.tsx` Z.270 |
| P4.6 | archiveService: pendingIssues-Zaehler an BEIDEN Stellen (Z.293+Z.685) | PASS | `archiveService.ts` Z.293+295 und Z.687+689 |
| P4.7 | IssuesCenter: Pending-Kategorie zwischen open und resolved | PASS | Z.360+586-601 |

---

### Gefundene Bugs

#### Bug #1 — LOW: Icon-Abweichung — Clock statt Hourglass bei Pending-IssueCard
- **Datei:** `src/components/run-detail/IssuesCenter.tsx` Z.185
- **Spec-Anforderung:** "Hourglass-Icon" fuer pending-Status
- **Ist-Zustand:** `Clock`-Icon aus lucide-react
- **Befund:** `lucide-react` enthaelt das `Hourglass`-Icon (`import { Hourglass } from 'lucide-react'`). Die Implementierung nutzt `Clock`, das semantisch aehnlich ist, aber nicht der Spec entspricht.
- **Impact:** Rein kosmetisch — keine Funktionalitaet beeintraechtigt.
- **Reproduktion:** Issue eskalieren → IssueCard zeigt Clock-Icon statt Hourglass

---

### Regressionstest

| Pruefpunkt | Status | Anmerkung |
|------------|--------|-----------|
| Auto-Resolve-Logik besteht weiter (`autoResolveIssues` nicht fuer pending) | PASS | Z.251 in runStore unveraendert |
| Export-Guard blockiert korrekt bei open UND pending error-Issues | PASS | ExportPanel + RunDetail beide aktualisiert |
| Aktualisieren-Button triggert KEINEN Step-Restart | PASS | `refreshIssues` ruft nur autoResolve + generateStep5 |
| archiveService: beide Stellen fuer pendingIssues aktualisiert | PASS | Z.293+295 und Z.687+689 |
| Step-5-Timing: Issues VOR Auto-Complete generiert | PASS | generateStep5Issues vor setTimeout |
| Duplikat-Guard: mehrfacher Aktualisieren-Klick erzeugt keine doppelten Issues | PASS | existingOpen-Check in generateStep5Issues Z.2311-2313, 2338-2340 |

---

### Sicherheits-Audit

- Keine Server-Kommunikation — pure SPA, kein XSS-Risiko durch Issue-Daten (werden in DOM-Text-Nodes gerendert, nicht als innerHTML)
- `generateMailtoLink` erzeugt mailto:-URL — kein direkter HTTP-Request, oeffnet lokales Mail-Programm
- `window.location.href = link` fuer mailto: ist sicher, da keine externe URL moglich
- Keine neuen localStorage-Keys eingefuehrt
- `pending`-Status persistiert korrekt ueber IndexedDB (buildAutoSavePayload generische Serialisierung)

---

### Entscheidung

**PRODUCTION READY: JA**

Begruendung: Alle 26 Acceptance Criteria bestehen. 1 Low-Bug gefunden (kosmetisches Icon). Keine Critical/High-Bugs. TypeScript: 0 Errors.

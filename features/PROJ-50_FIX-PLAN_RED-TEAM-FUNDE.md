# PROJ-50 — FIX-PLAN (Red-Team-Funde) — Rev 1

**Status:** 🟡 DRAFT (wartet auf Dom-Freigabe — kein Code wird ohne Genehmigung angefasst)
**Datum:** 2026-04-23
**Auslöser:** Team-Red-Audit gegen `PROJ-50_TEST-ARENA-DEV-FAST_BUTFIX.md` Rev 6 + `PROJ-50_AUDIT_FAST-BUGFIX.md` Rev 3
**Scope:** **Dokumentations-Korrektur** als Hauptpfad (0 Laufzeit-Regression), optionaler Code-Hardening-Pfad als Tech-Debt-Kandidat (isolierbar).
**Confidence im Plan:** 96 % (identisch mit Red-Team-Confidence gegen IST-Code)

---

## 1. Big Picture

Das Red-Team-Audit hat **keinen Laufzeit-Bug** gefunden. Der implementierte Code (Mark-First-Then-Delete + 6-fach-konjunktiver `isTombstoneRecord`-Filter + 14b-Legacy-Backup) ist in sich konsistent und typ-korrekt. `npx tsc --noEmit` exit 0.

Aber: **Plan Rev 6 §11.4 (Zeilen 501-502) widerspricht dem implementierten Code** für Fall 1c (serialList-only + IDB-Doppel-Fail) und Fall 2c (openWE-only + IDB-Doppel-Fail). Der Plan behauptet „✓ vom 4-Feld-Filter erkannt", der Code braucht aber *zusätzlich* `status='failed'` + leere Fattura + `parsedInvoiceLines=0` + leere Steps + alle 4 Stati `invalid`. Fall 1c/2c liegen damit **de facto im Double-Failure-Restrisiko** wie Fall 3c — ausserhalb des Garantiescopes.

**Kernfrage für Dom:** Wollen wir den Plan an den Code angleichen (Option A, KISS) oder den Code an den ursprünglichen Plan-Anspruch (Option B, strengerer Schutz mit false-positive-Risiko)?

---

## 2. Referenzen

- [`features/PROJ-50_TEST-ARENA-DEV-FAST_BUTFIX.md`](./PROJ-50_TEST-ARENA-DEV-FAST_BUTFIX.md) (Rev 6 FINAL)
- [`features/PROJ-50_AUDIT_FAST-BUGFIX.md`](./PROJ-50_AUDIT_FAST-BUGFIX.md) (Rev 3 FINAL-FIX)
- Red-Team-Prüfungsprotokoll (diese Session, Chat-Ausgabe)
- Code-IST:
  - [src/services/runPersistenceService.ts:106-121](../src/services/runPersistenceService.ts) — 6-fach-konjunktiver Filter
  - [src/store/slices/persistenceSlice.ts:144-168](../src/store/slices/persistenceSlice.ts) — Tombstone + 14b-Legacy
  - [src/store/slices/ingestSlice.ts:619-704](../src/store/slices/ingestSlice.ts) — Mark-First-Then-Delete

---

## 3. Leitplanken

- **GW-flow / C.A-Invarianten unangetastet.** Keine Änderung an den 6 Audit-Invarianten.
- **Silo C.B-TA1 unverletzt.** `qaSamplesService.ts` bleibt hermetisch.
- **Regressionsfreiheit Option A = 100 %** (reine Doku-Edits).
- **Regressionsfreiheit Option B nur bei isoliertem Filter-Zusatz** mit explizitem „Auto-Delete"-Pfad (kein Sichtbarkeits-Flackern).
- **Step-by-Step:** Jeder Sub-Commit einzeln prüfbar, `tsc --noEmit` grün nach jedem Schritt.

---

## 4. Befund-Katalog (aus Red-Team-Prüfung)

| # | Schweregrad | Ort | Befund | Option A | Option B |
|---|---|---|---|---|---|
| F1 | 🔴 Plan-Drift | Plan §11.4 Zeile 501 | Fall 1c „✓ 4-Feld-Filter" — Code (6-fach-Konjunktion) greift nicht. | Plan umformulieren → Restrisiko | Filter erweitern |
| F2 | 🔴 Plan-Drift | Plan §11.4 Zeile 502 | Fall 2c „analog ✓" — gleiche Drift wie F1. | Plan umformulieren → Restrisiko | Filter erweitern |
| F3 | 🟡 Plan-Scope | Plan §13.1 | Nur Fall 3c als ausserhalb Scope benannt. 1c/2c implizit ausserhalb, aber nicht expliziert. | §13 Scope um 1c/2c erweitern | (entfällt bei Code-Fix) |
| F4 | 🟡 Audit-Drift | Audit §6.1 | Nur „Double-Failure" allgemein genannt; nicht explizit auf 1c/2c/3c aufgeschlüsselt. | Audit §6.1 Aufschlüsselung ergänzen | Audit nur nach Code-Fix ändern |
| F5 | 🟢 Minor UX | `SettingsPopup.tsx` Dialog-Text | Warn-Dialog erscheint immer — Audit §6.3 „bewusst akzeptiert". | Keine Änderung (bewusste Designentscheidung) | Keine Änderung |
| F6 | 🟢 Verifikations-Gap | - | Kein E2E-UI-Smoketest (Audit §6.2). | Test-Protokoll in Audit §6.2 ergänzen | Test-Protokoll + Filter-Unit-Test |

---

## 5. Option A — **Dokumentations-Fix (empfohlen)**

### 5.1 Rationale

- **0 Laufzeit-Regression** (keine Code-Zeile angefasst).
- Code-IST ist semantisch korrekt und im Audit §3.1 ehrlich beschrieben. Nur Plan §11.4 hinkt hinterher.
- IDB-Doppel-Fail ist in der Praxis (Electron/Chromium auf Windows-Server) ein sehr seltenes Ereignis → aktueller Schutz ist ausreichend.

### 5.2 Arbeitspakete

#### AP-A1 — Plan §11.4 Tabelle umformulieren

**Datei:** `features/PROJ-50_TEST-ARENA-DEV-FAST_BUTFIX.md`

**Zeilen 501-502 (Fall 1c + 2c):**

- **Vorher:**
  ```
  | 1c | serialList-Fehler, beide fail | ... | fail | fail | Original-Record mit `serialList:'invalid'` → vom 4-Feld-Filter erkannt ✓ |
  | 2  | openWE-Fehler (...) | ... | analog | analog | analog — Fälle a/b/c identisch ✓ |
  ```

- **Nachher:** Fall 1c und 2c auf Restrisiko-Status setzen, analog Fall 3c Wortlaut:
  ```
  | 1c | serialList-Fehler, beide fail | {pdf:'ready', articleList:'ready', serialList:'invalid', openWE:'pending'} | fail | fail | Original-Record hat nur serialList:'invalid' + status≠'failed' → **NICHT** vom 6-fach-konjunktiven Filter erkannt. IDB-Doppel-Fail — Restrisiko analog Fall 3c (§13.2). |
  | 2c | openWE-Fehler, beide fail | {pdf:'ready', articleList:'ready', serialList:'ready', openWE:'invalid'} | fail | fail | analog Fall 1c — Restrisiko §13.2. |
  ```
- Satz unter Tabelle „Resultat" angleichen: „Alle praktisch auftretenden Fälle sind abgedeckt, solange mind. eine IDB-Operation erfolgreich ist. IDB-Doppel-Fail-Fälle 1c/2c/3c bleiben Restrisiko (§13.2)."

#### AP-A2 — Plan §13.2 Scope-Definition erweitern

**Datei:** `features/PROJ-50_TEST-ARENA-DEV-FAST_BUTFIX.md`

Im Abschnitt §13.2 den Ausnahme-Paragraphen erweitern:

- **Ergänzen:** „Die gleiche Infrastruktur-Fehlerklasse umfasst auch Fall 1c (serialList-only-invalid + IDB-Doppel-Fail) und Fall 2c (openWE-only-invalid + IDB-Doppel-Fail). In allen drei Fällen (1c/2c/3c) bleibt der Original-Record mit `status='running'` (oder dem zum Fehler-Zeitpunkt aktiven Status) und einem einzigen `invalid`-Feld ungefiltert sichtbar, weil der 6-fach-konjunktive `isTombstoneRecord`-Filter alle vier ingestStatus-Felder === `'invalid'` UND weitere Marker verlangt."

#### AP-A3 — Plan §11.7 Restrisiko-Liste erweitern

Ergänze Bullet-Punkt:

- **Ergänzen:** „Fälle 1c und 2c (IDB-Doppel-Fail mit serialList-only oder openWE-only invalid) sind infrastrukturell identisch mit Fall 3c — der 6-fach-konjunktive Filter unterdrückt sie nicht, weil er alle vier ingestStatus=`invalid` plus status=`failed` + leere Fattura + `parsedInvoiceLines=0` + leere Steps verlangt. Mitigiert durch 4-Fall-Logging in `cleanupFailedIngest`."

#### AP-A4 — Plan §9 Regressions-Aussage anpassen

**Zeile 434 (Punkt 4 „B6 geschlossen"):** Wortlaut anpassen auf „im Logikpfad bei mindestens einem erfolgreichen IDB-Write. Bei IDB-Doppel-Fail (Fall 1c/2c/3c) ist der Record-Shape infrastrukturell nicht rekonstruierbar → Restrisiko §13.2." Keine neue Aussage, nur Präzisierung.

#### AP-A5 — Audit §6.1 Aufschlüsselung

**Datei:** `features/PROJ-50_AUDIT_FAST-BUGFIX.md`

Abschnitt §6.1 Double-Failure ergänzen um explizite 3-Unterfälle:

- **Ergänzen:** Tabelle mit den drei Shape-Varianten (1c/2c/3c), analog der Erklärung in Plan §13.2.

#### AP-A6 — Audit §6.2 Verifikations-Gap konkretisieren

Manuelle UI-Test-Checkliste ergänzen (5 Minuten Dom-Test):
1. Test-Arena öffnen, Sample mit provoziertem ingest-Fehler starten.
2. Nach Fehler-Toast: Reload der App.
3. Dashboard + Archive prüfen: Kein `QA-*`-Run sichtbar.
4. IndexedDB via DevTools prüfen: Kein Ghost-Run im `runs`-Store.
5. Positiv-Fall: Zweiten Sample-Lauf normal durchlaufen lassen, Dashboard-Integrität prüfen.

### 5.3 Abschluss-Checkliste Option A

- [ ] Plan §11.4 Tabelle aktualisiert (F1 + F2).
- [ ] Plan §13.2 erweitert (F3).
- [ ] Plan §11.7 erweitert.
- [ ] Plan §9 präzisiert.
- [ ] Audit §6.1 aufgeschlüsselt (F4).
- [ ] Audit §6.2 Test-Checkliste (F6).
- [ ] Kein Code-Diff (`git diff src/` → leer).
- [ ] Kein `tsc`-Lauf nötig (reine .md-Änderung).
- [ ] `features/INDEX.md` aktualisieren (falls Fix-Plan indiziert wird).

### 5.4 Regressionsrisiko Option A

**0 %** — kein Code angefasst. Einzige nicht-neutrale Änderung: Semantik der Regressions-Aussage in Plan §9 wird konditional („im Logikpfad bei ≥1 erfolgreichem IDB-Write"), was lediglich die Audit-Invarianten **C.A-2** und **C.A-6** exakt widerspiegelt (beide bereits konditional formuliert).

---

## 6. Option B — **Code-Hardening (optional, falls absolute Garantie gewünscht)**

### 6.1 Rationale

Nur wählen, wenn Dom absolute Ghost-Run-Unmöglichkeit verlangt. Bringt höhere Sicherheit gegen IDB-Doppel-Fail-Fälle 1c/2c, aber führt false-positive-Risiko ein: Legitime partial-failed-Runs mit serialList=`invalid` (z. B. User hat versehentlich korrupte Serial-XLS hochgeladen, will später reparieren) würden dann auto-gelöscht.

### 6.2 Arbeitspaket (Vorschlag für separaten Commit)

#### AP-B1 — Erweiterung 14b-Legacy-Backup in `loadPersistedRun`

**Datei:** `src/store/slices/persistenceSlice.ts` (Zeilen 158-168)

**Heute:** 14b prüft nur `pdf !== 'ready' || articleList !== 'ready'`. Fall 1c (pdf/articleList ready, serialList invalid) wird ignoriert.

**Vorschlag:** Zusätzliche Bedingung hinzufügen — Record auto-löschen, wenn **irgendein** `ingestStatus`-Feld `invalid` ist UND der Record **nicht produktiv nutzbar** aussieht. „Produktiv nutzbar" konservativ definiert:

- `status === 'running'` ODER
- `stats.parsedInvoiceLines === 0` mit `steps.length === 0`.

**Pseudocode (Kontrakt, nicht final):**

```ts
if (data.ingestStatus) {
  const s = data.ingestStatus;
  const anyInvalid =
    s.pdf === 'invalid' || s.articleList === 'invalid' ||
    s.serialList === 'invalid' || s.openWE === 'invalid';
  const notProductive =
    data.run.status === 'running' ||
    ((data.run.stats?.parsedInvoiceLines ?? 0) === 0 &&
     (data.run.steps?.length ?? 0) === 0);
  if (anyInvalid && notProductive) {
    // Auto-Delete-Pfad analog zum existierenden 14b-Block
  }
}
```

**Begründung:** Produktive failed-Runs mit echter Fattura + Stats + Steps bleiben unberührt. Ghost-Runs aus cleanupFailedIngest (alle Stats=0, keine Steps) werden erkannt.

#### AP-B2 — Filter-Symmetrie

Wenn B1 durchgeht: Prüfen, ob `isTombstoneRecord` selbst um den gleichen „anyInvalid + notProductive"-Zweig erweitert werden sollte, damit `loadRunList` / `getStorageStats` / `exportToDirectory` konsistent sind. Alternative: Service-Filter beibehalten (konservativ), Slice-Level übernimmt die Erweiterung (14b).

#### AP-B3 — Unit-Test

Neue Unit-Test-Datei (Vitest) für `isTombstoneRecord` + `loadPersistedRun`-Decision-Tree:
- 9 Szenarien (Fall 1/1a/1b/1c, 2/2a/2b/2c, 3c) — Input-Shape → Erwartetes Filter-/Delete-Ergebnis.
- Gate-Anforderung: alle Szenarien grün VOR Merge.

### 6.3 Abschluss-Checkliste Option B

- [ ] `persistenceSlice.ts` 14b erweitert (AP-B1).
- [ ] `isTombstoneRecord` ggf. erweitert (AP-B2).
- [ ] Unit-Test-Suite grün (AP-B3).
- [ ] `npx tsc --noEmit` exit 0.
- [ ] Manueller UI-Test gemäss AP-A6-Checkliste.
- [ ] Audit §3.1 Filter-Definition aktualisieren.
- [ ] Audit §6.1 neu bewerten (Restrisiko schrumpft auf „beide IDB-Reads failen"-Fall).

### 6.4 Regressionsrisiken Option B

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| False-Positive: Legitimer partial-Run mit serialList=`invalid` wird auto-gelöscht | **Mittel** — Legacy-Runs aus PROJ-49-Übergangsphase könnten betroffen sein | „notProductive"-Klausel (status=`running` ODER parsedInvoiceLines=0+steps=0) filtert produktive Runs aus |
| Flackern im Dashboard: `loadRunList` zeigt Record, `loadPersistedRun` löscht ihn beim Klick | **Niedrig** | AP-B2 sorgt für Symmetrie — Service-Filter + Slice-Filter konsistent |
| Tests ohne Abdeckung des Ghost-Run-Pfads → spätere Regressions-Bugs | **Mittel** ohne Unit-Tests | AP-B3 zwingend vor Merge |
| Scope-Creep: „Nur ein bisschen Hardening" wird zu Infrastruktur-Refactor | **Niedrig-Mittel** | Strikt auf die 2 Zeilen-Blöcke beschränken, keine weiteren Filter-Sites anfassen |

---

## 7. Empfehlung

1. **Jetzt: Option A umsetzen** (Doku-Fix, 0 Regression, schliesst F1–F4 + F6).
2. **Später: Option B als separate Tech-Debt-Story** in Backlog schieben, falls Governance absolute Ghost-Run-Garantie fordert. Im aktuellen YAGNI-Kontext (Audit §6.1 „reale Wahrscheinlichkeit sehr niedrig") nicht priorisieren.

## 8. Umsetzungsreihenfolge (nur Option A)

1. **Commit 1:** Plan §11.4 + §13.2 + §11.7 + §9 (AP-A1 bis AP-A4). Alle vier AP im gleichen Commit, da semantisch zusammenhängend.
2. **Commit 2:** Audit §6.1 + §6.2 (AP-A5 + AP-A6).
3. **Commit 3** (falls gewünscht): `features/INDEX.md` + Red-Team-Protokoll-Verweis.

Pro Commit keine Code-Tests nötig — `git diff src/` muss leer sein.

## 9. Hinweise für den Mechaniker

1. **Keine Code-Zeile anfassen bei Option A.** Wenn Dom Option B freigibt, zweiter Plan-Durchlauf mit Planungs-Katalysator §5 CLAUDE.md (dann Scope-Validator + Phase V).
2. **Kein Umformulieren der Audit-Invarianten C.A-1..C.A-6.** Sie beschreiben bereits korrekt den IST-Zustand — nur §11.4/§13/§11.7-Texte sind inkonsistent mit den Invarianten.
3. **`features/INDEX.md`** zum Abschluss aktualisieren.
4. **Vor Merge:** Red-Team-Nachkontrolle — kurzer Grep-Check, dass §11.4 keine „✓"-Einträge für 1c/2c mehr zeigt.

---

## 10. Neue Vorschläge (Sektion B — wartet auf Dom-Freigabe)

- `[  ]` AP-A1 bis AP-A6 durchführen (Doku-Fix).
- `[  ]` AP-B1 bis AP-B3 (Code-Hardening) als separate Phase im Backlog parken.
- `[  ]` Unit-Test-Suite für `isTombstoneRecord` auch bei Option-A-only als Tech-Debt aufnehmen (würde F6 vollständig schliessen).

---

*Letzte Aktualisierung: 2026-04-23 | Rev 1 — Fix-Plan auf Basis Red-Team-Funde F1-F6. Option A empfohlen, Option B als optionaler Nachfolger.*

# Serials Persistenz Diagnostic Take 2

**Datum:** 2026-03-07  
**Autor:** Detective-Analyse (ohne Codeaenderung)  
**Datei-Ziel:** `features/Serials_persistenz_diagnostic_take2.md`

---

## 1) Executive Summary

Der Bug ist **nicht vollstaendig erledigt**.  
Das bereits angelegte Projekt **PROJ-40-ADD-ON-2** hat wichtige Teilfixes umgesetzt (A/B/C), aber die Persistenzkette fuer Archiv-Open/Reload ist weiterhin nicht belastbar.

**Kernaussage:**
- `serialNumbers[]` koennen persistiert werden.
- Die End-to-End-Sicherheit (Step-3-Ergebnis sicher in IndexedDB + robustes Wiederfinden beim Archiv-Lauf) ist weiterhin lueckig.

Damit ist das richtige Fortsetzungsziel:

## **PROJ-40-ADD-ON-2 als ADD-ON-3 (Reopen/Fortfuehrung)**

---

## 2) Welche Projektdatei ist die korrekte Basis?

### Primar zu verwenden
1. `features/PROJ-40-ADDON-2_Step3_Persistenz.md`
- Enthält genau diesen Bugkontext (Step-3/Serial-Persistenz, Neu verarbeiten, Archiv-Reload).

2. `features/PROJ-40_IndexedDB_Architekturplan.md`
- Definiert das Sollbild fuer Rehydrierung (`serialDocument`, `uploadMetadata`, `loadPersistedRun`).

3. `features/INDEX.md`
- Fuehrt PROJ-40-ADD-ON-2 als "Done".

### Sekundaere Kontextdatei
4. `features/INDEXED_ARCHIV_BERICHT_26022026.md`
- Historische Architektur-/Archivbefunde, die den aktuellen Restfehler plausibel stuetzen.

---

## 3) Ist-Zustand im Code (forensisch)

## 3.1 Was aus PROJ-40-ADD-ON-2 **ausgefuehrt** wurde

### Fix B vorhanden: `serialDocument` wird beim Upload aufgebaut
- `src/store/runStore.ts:624-640`
- Ergebnis: `preFilteredSerials` + `serialDocument` werden zusammen gesetzt.

### Fix C vorhanden: `consumed` Reset vor Legacy-Matching
- `src/store/runStore.ts:3112-3117`
- Ergebnis: persistierte consumed-Flags blockieren Wiederzuordnung nicht mehr.

### Fix A indirekt vorhanden: Step-4-Cleanup dieser Cache-Felder ist entfernt
- In aktueller Datei kein alter Block `set({ preFilteredSerials: [], serialDocument: null })` mehr im Step-4-Ende.

---

## 3.2 Was weiterhin kritisch ist (Restbug)

### A) Persistenz-Write ist nur debounced und an `currentRun` gekoppelt
- `src/hooks/useRunAutoSave.ts:21` (2s debounce)
- `src/hooks/useRunAutoSave.ts:34` (Guard: kein Save ohne `currentRun`)
- `src/hooks/useRunAutoSave.ts:54-56` (Timer feuert spaeter, liest aktuellen Store)

**Konsequenz:** Wenn vor Timer-Flush navigiert wird, kann der letzte Serial-Stand nicht gespeichert werden.

### B) RunDetail setzt bei Unmount `currentRun` auf `null`
- `src/pages/RunDetail.tsx:289`

**Konsequenz:** offener debounce-Write wird effektiv neutralisiert (Guard greift), wenn Navigation schnell genug ist.

### C) Es gibt keinen expliziten "harte Persistenz"-Checkpoint nach Step 3
- Einziger Save-Pfad: AutoSave (`runPersistenceService.saveRun`) aus Hook.
- Keine direkte Persist-Sicherung unmittelbar nach Step-3-Zuteilung.

### D) Archiv-Cleanup loescht Upload-Dateien global
- `src/services/archiveService.ts:543-545` (`fileStorageService.clearAllFiles()`)

**Konsequenz:** Reprocess/Quelle nach Archivierung ist fragil; zwar nicht alleiniger Grund fuer fehlende Anzeige, aber ein zentraler Instabilitaetsfaktor fuer Wiederverarbeitung.

### E) `loadStoredFiles()` baut `preFilteredSerials` nicht neu auf
- `src/store/runStore.ts:704-717`

**Konsequenz:** Nach Reload kommt Quelle nur ueber persistiertes `serialDocument`; fehlt dieses wegen (A/B/C), kippt Step-3-Faehigkeit.

---

## 4) Planungs-/Doku-Luecken (warum "Done" zu frueh war)

## 4.1 In PROJ-40-ADD-ON-2 selbst bewusst ausgeklammert
- `features/PROJ-40-ADDON-2_Step3_Persistenz.md:31-35`
- Nicht-Ziele enthalten explizit:
  - keine Aenderung an `useRunAutoSave.ts`
  - `archiveService.ts` unangetastet

Genau diese beiden Bereiche sind aber im Restbug relevant.

## 4.2 Status-Konflikt
- `PROJ-40-ADDON-2` Dokument steht auf **"Planungsphase"** (`...:4`)
- `features/INDEX.md` fuehrt denselben Punkt als **Done**.

Das ist ein Governance-Problem: Done-Markierung ohne belastbare Endabnahme.

## 4.3 Referenz-Konflikt in `INDEX.md`
- INDEX verweist bei PROJ-40-ADD-ON-2 auf `Step4-Serial_Indexed_persis_diganostic_NEW.md`.
- Diese Datei ist inhaltlich ein **Dual-Log-Plan** (nicht Serial-Persistenz).

Konsequenz: falsche Referenz erschwert korrekte Nachverfolgung und hat die Restluecke vermutlich verdeckt.

---

## 5) Was muss fortgefuehrt werden?

## **Fortsetzung als: PROJ-40-ADD-ON-3 (Serial-Persistenz Finalisierung)**

Begruendung:
- PROJ-40 ist fachlich der richtige Strang (IndexedDB + Rehydrierung).
- PROJ-40-ADD-ON-2 hat Vorarbeit geliefert, aber die Persistenz-Endkette nicht abgeschlossen.

---

## 6) Erweiterter Plan (wo der alte Plan erweitert werden muss)

### Phase 1 - Persistenzgarantie
1. "Save-Checkpoint" fuer kritische Momente definieren:
- nach Step-3-Zuteilung
- vor RunDetail-Unmount/Run-Wechsel
- nach `loadPersistedRun`-Merge

2. Debounce-only als alleiniges Sicherheitsnetz beenden (fuer kritische Events).

### Phase 2 - Archiv-/Quelle stabilisieren
1. Archiv-Cleanup auf run-bezogene oder explizit manuelle Bereinigung umstellen (kein globales `clearAllFiles()` als Standard).
2. Rehydrierungspfad klar trennen:
- Anzeige historischer `serialNumbers[]`
- Wiederverarbeitung mit valider Quelle (`serialDocument`/rebuild)

### Phase 3 - Rebuild-Strategie
1. Bei `loadStoredFiles()` optionalen rebuild fuer `preFilteredSerials` aus `serialList` ausfuehren.
2. Fallback-Reihenfolge fuer Step 3 dokumentieren und testbar machen.

### Phase 4 - Dokumentationshygiene
1. `INDEX.md` Referenz bei PROJ-40-ADD-ON-2 korrigieren.
2. Status angleichen (Planungsphase vs Done).
3. Eindeutige Akzeptanztests als "Done-Gate" festschreiben.

---

## 7) Wo wurde der alte Plan nicht korrekt ausgefuehrt?

Nicht im Sinne "falsch implementiert", sondern **unvollstaendig abgeschlossen**:

1. Die drei geplanten Fixes A/B/C sind umgesetzt.
2. Aber die End-to-End-Annahme "Archiv-Open hat Serials immer" ist nicht abgesichert, weil:
- Persistenzzeitpunkt nicht garantiert (Debounce + `currentRun`-Guard)
- relevante Non-Goals (`useRunAutoSave`, `archiveService`) offen blieben

Das ist ein klassischer "Teilfix als Done markiert"-Zustand.

---

## 8) Klare Empfehlung zur Behebung

1. **Projektpfad:** PROJ-40-ADD-ON-2 wieder oeffnen und als **ADD-ON-3** fortsetzen.
2. **Scope erweitern:** zusaetzlich `useRunAutoSave.ts`, `RunDetail.tsx` (Unmount-Flow), `archiveService.ts`, `runStore.ts` (Checkpoint/rebuild).
3. **Done-Gate definieren (Pflicht):**
- Fall A: Step 3 fertig -> direkt weg navigieren -> wieder laden -> Serials vorhanden.
- Fall B: Run archivieren -> App neu laden -> Run aus Archiv öffnen -> Serials vorhanden.
- Fall C: Neu verarbeiten nach Archiv-Open ohne Neu-Upload -> Step 3 reproduzierbar.
4. **INDEX/Referenzen bereinigen:** richtige Datei verlinken, Status konsistent setzen.

---

## 9) Entscheidungsvorlage (kurz)

- **Weiterfuehren:** Ja  
- **Projekt:** PROJ-40-ADD-ON-2 -> ADD-ON-3  
- **Grund:** Restluecke in Persistenz-Endkette (Timing + Cleanup + Rehydrierungspfad)  
- **Risiko bei Nichtbehebung:** Archiv-Runs zeigen weiterhin sporadisch fehlende Serials trotz korrekter Step-3-Verarbeitung


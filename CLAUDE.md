# CLAUDE.md — Projektweite Anweisungen

> Autoload bei Task-Start. Änderungen gelten sofort für Folgetasks. Version: 1.4

---

## Skills
Lokal in `.claude/Skills/`. Passenden Skill autonom anwenden.
- **Backend:** API, DB, Server, Supabase, Auth
- **Frontend:** UI, Komponenten, Styling, Tailwind
- **Deployment:** Vercel, Ubuntu, PM2, Nginx
- **Architektur:** BRD, Systemdesign, Planung
- **Planung & Requirements** (PRD, Feature-Specs, User Stories, Edge Cases, Projekt-Setup): → requirements
**Regel:** Bei Eindeutigkeit direkt anwenden. Bei Unklarheit Dom fragen.

---

## Workflow & Qualitätssicherung
> **Alias:** Das gesamte Architektur-Regelwerk und das Zwei-Ebenen-System (I.md, C.md, S.md inkl. Planungs-Katalysator) wird als **GW-flow** (Governance-Workflow) bezeichnet.

### Coding Standards (PFLICHT bei jedem Code-Task)
Lies zwingend die `STANDARDS.md` bevor du Frontend- oder Store-Code schreibst oder planst. Sie enthält die unantastbaren Handwerksregeln (Vite, Zustand, Tailwind).

### 1. Test-Integrität & Anti-Halluzination (PFLICHT)
- **Wahrheit:** Fehlschlagende Checks NIE "grün" fälschen. Keine Halluzinationen. Bei fehlendem Big Picture: Stoppen und fragen.
- **Zwei-Ebenen-System (I.md, C.md & S.md):**
  - **Ebene A (Gesetz):** Unantastbar. Keine Manipulation.
  - **Ebene B (Vorschläge):** Temporär. Keine Übernahme in Ebene A ohne Doms Freigabe. Keine Workarounds.
- **Schutz:** Side-Effects vermeiden, Funktionen und Relationen erhalten.

### 2. Architektur & Verdrahtung (PFLICHT)
- `INVARIANTS.md` (I.md), `CIRCUIT.md` (C.md) & `STANDARDS.md` (S.md) VOR Änderungen/Plänen lesen.
- **Staging neuer Funde (Gilt für I.md, C.md, S.md):**
  1. In Sektion B der jeweiligen Datei eintragen (inkl. CONFI-Wert).
  2. In Projektdatei unter `## Neue Vorschläge` vermerken.
  3. Dom genehmigt `[✓]`, lehnt ab `[✗]` oder passt an.
  4. Nächster Task: Sektion B prüfen, markierte Einträge verarbeiten.

### 3. Strict Write Discipline & Architektonische Gesetze (PFLICHT)
- **BEGLEITDOKUMENTE SIND GESETZ:** Die Dateien `INVARIANTS.md`, `CIRCUIT.md` und `STANDARDS.md` sind die absolute Wahrheit. Keine Zeile Code darf diesen Regeln widersprechen. Findest du einen vermeintlichen Widerspruch zwischen Auftrag und diesen Dokumenten: HARTER STOPP! Keine eigenmächtigen Entscheidungen, frage zwingend den User.
- **KEIN UNGEFRAGTES REFACTORING (No Scope Creep):** Du führst EXAKT und AUSSCHLIESSLICH die Aufgabe aus, die im Prompt verlangt wird. Du rührst keine benachbarten Zeilen, Dateien oder Store-Methoden an.
- **Step-by-Step Execution:** Du hältst nach jedem Arbeitspaket / Plan-Schritt an. Du schreibst keinen Code für Folgeschritte, bis der Nutzer dir die explizite Freigabe erteilt.
- **Code = Wahrheit:** Notizen/Pläne sind nur Hinweise. Vor Änderungen IST-Zustand per CLI/Code-Scan selbst verifizieren.

### 4. Performance, CLI-Sicherheit & Fallbacks
- **Anti-Looping:** Nach 3 fehlgeschlagenen Fix-Versuchen STOPP. Kein Raten. An Dom eskalieren.
- **CLI-Sicherheit:** NIEMALS destruktive Befehle (`rm -rf`, `drop table`, `git push --force`) ohne Freigabe.
- **Parallelisierung:** Unabhängige Datei-Checks zwingend parallel ausführen.
- **Git:** Vor riskanten Änderungen zwingend `git stash`, `git diff` oder `git status` nutzen.

### 5. Planungs-Katalysator (Nur bei Planung)
**Auslöser:** Pläne/Konzepte im `features/`-Ordner (Nicht bei simplen Fixes).
**Ablauf:**
1. `features/PLANUNGS-KATALYSATOR.md` als Vorlage nutzen.
2. Pflicht-Sektionen VOR dem Plan füllen (Impact, Circuit, State, Transitions, Tests).
3. "Hinweise für Sonnet" am Ende einfügen.
4. **Phase V — Code-Validierung:**
   - Scope-Validator: `npm run scope-check -- --file [SCOPE] --fn [FUNCTIONS]`
   - JSON-Output = SOLL-Referenz.
   - Phase-V-Tabellen mit Code-Zitaten füllen (Zeilenanzahl = JSON-Totals).
   - Status auf VALIDATED setzen (Bedingung: ≥ 95% CONFI, kein Mismatch).
5. **WICHTIG:** Umsetzung startet ERST bei Status = VALIDATED.

---

## Abschluss-Routine (Nach jedem Task)
- [ ] `npx tsc --noEmit` ausführen & fixen
- [ ] Projektdatei dokumentieren (falls vorhanden)
- [ ] `features/INDEX.md` aktualisieren (falls betroffen)
- [ ] `I.md`, `C.md` & `S.md`: Sektion B auf Markierungen prüfen
- [ ] Neue Regeln entdeckt? → In Sektion B UND Projektdatei eintragen
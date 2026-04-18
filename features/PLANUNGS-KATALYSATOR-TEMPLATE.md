# PLANUNGS-KATALYSATOR — Verbindliches Template für Projektdateien

> **Was ist das?** Diese Datei ist die Vorlage für ALLE Pläne die im `features/`-Ordner erstellt werden.
> **Wie nutzen?** Kopiere die Struktur, fülle die Sektionen, lösche diese Einleitung in der Kopie.
> **Version:** 1.4 — Scope-Validator als deterministische Prüfsumme in Phase V

---

## Projektdatei Pflicht-Struktur

```markdown
# [TICKET-ID] [Titel]

**Status:** PLAN | VALIDATED | IN PROGRESS | DONE
**Datum:** [YYYY-MM-DD]
**Scope:** [Betroffene Dateien]
**Auslöser:** [Bug-Report / Feature-Request / Refactoring-Bedarf]

---

## 1. Problemanalyse
[Was ist kaputt oder fehlt? Warum ist das ein Problem?]

---

## 2. Impact-Matrix (PFLICHT VOR Plan)

| Geplante Änderung | Betroffene Funktionen | Betroffene Steps/Module | Risiko wenn vergessen |
|---|---|---|---|
| | | | |

> **Prüffrage:** "Welche anderen Funktionen lesen oder schreiben denselben State den ich ändere?"
> **Regel:** < 2 Zeilen = ungründlich. INVARIANTS.md A1 (Drillinge) prüfen!

---

## 3. Circuit & Standards-Check (PFLICHT — VOR dem Plan ausfüllen)

| Datei | Regel / Verbindung | Betroffen? | Schutzmaßnahme |
|---|---|---|---|
| C.md | [z.B. A2 Guard-Kette] | | |
| S.md | [z.B. S5 Farb-Vorgaben] | | |

> **Prüffragen:** > - C.md: "Unterbreche ich eine bestätigte Verbindung?"
> - S.md: "Verletzt meine geplante UI die strikten Design- und Farb-Standards?"
> **Achtung:** Sektion A UND Sektion B prüfen.

---

## 4. State-Snapshotting (PFLICHT — VOR dem Plan ausfüllen)

**Pfad A: [Name]**
```
VORHER:  [Step X] → [was passiert] → [Step Y] → [Ergebnis]
NACHHER: [Step X] → [was passiert NEU] → [Step Y] → [Ergebnis]
```

> **Prüffrage:** "Kommt am Ende dasselbe Produkt raus?"

---

## 5. Transitions-Analyse (PFLICHT — VOR dem Plan ausfüllen)

### 5a. Datenfluß-Vorbedingungen

| Neuer Code liest | Erwarteter Wert | Wer schreibt diesen Wert? | Existiert der Write im IST-Code? | Existiert er im SOLL-Code? |
|---|---|---|---|---|
| | | | | |

> **Prüffrage 1:** "Für jeden State-Read: Wo genau ist der korrespondierende Write?"
> **Prüffrage 2:** "Gibt es einen Pfad der den Write UMGEHT aber trotzdem den nachfolgenden Schritt braucht?"

### 5b. Mechanismus-Sicherheit

| Altes Konstrukt | Neues Konstrukt | Fehlerklasse des Alten | Fehlerklasse des Neuen | Auffangnetz vorhanden? |
|---|---|---|---|---|
| | | | | |

> **Prüffrage:** "Hat das neue Konstrukt Fehlerklassen die das alte nicht hatte?"

### 5c. Dispatch-Vollständigkeit

| Funktion | Neuer Parameter | Mögliche Werte | Verhalten bei jedem Wert | Branching spezifiziert? |
|---|---|---|---|---|
| | | | | |

> **Prüffrage:** "Was passiert bei undefined?"

---

## 6. Test-Kriterien (PFLICHT VOR Planerstellung)

| # | Typ | Beschreibung | Erwartetes Ergebnis |
|---|---|---|---|
| 1 | Happy Path | | |
| 2 | Fehlerfall (Business) | | |
| 3 | Fehlerfall (Infrastruktur) | | |
| 4 | Edge Case | | |

---

## 7. Umsetzungsplan

> **Kein Code aus dem Gedächtnis (I.md A12).** Beschreibe WAS, WO, BEDINGUNG. Syntax in Phase V validieren.

[Plan formulieren.]

---

## 8. Hinweise für Coder-LLM (vermut. Sonnet) bei der Umsetzung (PFLICHT für Opus)

### Fallstricke
### Geschützte Verbindungen (aus Circuit-Check)
### Datenfluß-Warnungen (aus 5a)
### Dispatch-Warnungen (aus 5c)
### Idempotenz & Guards

---

## 9. Phase V — Code-Validierung (PFLICHT nach Plan, VOR Umsetzung)

> **Status darf erst auf VALIDATED wechseln wenn Phase V abgeschlossen ist.**
> **Sonnet darf erst bei VALIDATED implementieren.**
>
> **PROOF-OF-WORK:** Jeder Prüfpunkt MUSS wörtliches Code-Zitat enthalten (sonst 0% CONFI). 
> **Coder LLM (z.B. Sonnet) implementiert ERST bei Status = VALIDATED.**

### 9.0 Scope-Validator ausführen (PFLICHT vor allen Tabellen)

Führe für JEDE Funktion im Scope aus:
```bash
npm run scope-check -- --file [DATEI] --fn [FUNKTION1],[FUNKTION2],...
```

Kopiere die JSON-Ausgabe hierher:
```json
[JSON einfügen]
```

> Kein Skript-Bypass: Schlägt das Skript fehl, STOPPE sofort. KEIN manueller Fallback. Liefere Dom unaufgefordert zur Diagnose:
> 1. Exakter Bash-Befehl
> 2. Komplette Error-Ausgabe aus dem Terminal
> 3. Kurze technische Fehler-Analyse
> Weiterarbeit NUR nach Doms expliziter Freigabe.

Die Totals aus dem JSON sind die SOLL-Werte für die nachfolgenden Tabellen:
- `exitPaths.total` = Anzahl Zeilen in der Exit-Pfad-Inventur (9.2)
- `stateWrites.total` = Anzahl Write-Einträge in der Validierungstabelle (9.1)
- `stateReads.total` = Anzahl Read-Einträge in der Validierungstabelle (9.1)

**Bei Mismatch zwischen JSON-Totals und Tabellenzeilen → Tabelle ist unvollständig. NICHT VALIDATED.**

### 9.1 Validierungstabelle

| # | Behauptung im Plan | Datei | Zeile | Exakter Code-Auszug (wörtlich kopiert) | Stimmt? | CONFI | Korrektur |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### 9.2 Exit-Pfad-Inventur (PFLICHT für jede Funktion im Scope)

**Funktion: [Name]** (SOLL laut Scope-Validator: X Exit-Pfade)
| # | Zeile | Code-Auszug (wörtlich) | Typ (return/throw/skip) | Status bei Exit | Advance nötig? | Im Plan erfasst? |
|---|---|---|---|---|---|---|
| | | | | | | |

> **Regel:** Tabellenzeilen MÜSSEN mit `exitPaths.total` aus dem Scope-Validator übereinstimmen.
> Wenn "Advance nötig? = Ja" und "Im Plan erfasst? = Nein" → PLAN IST UNVOLLSTÄNDIG.

### 9.3 Operations-Reihenfolge (PFLICHT für Funktionen die umgeschrieben werden)

**Funktion: [Name]**
```
IST-Reihenfolge (aus dem echten Code):
  1. Zeile [X]: [exakter Code] — [was passiert]
  2. Zeile [Y]: [exakter Code] — [was passiert]

SOLL-Reihenfolge (aus dem Plan):
  1. [was passiert laut Plan]
  2. ...

Abweichungen: [Keine / Liste der Unterschiede]
```

> **Regel:** Unbegründete Abweichung = Plan korrigieren.

### 9.4 Datenstruktur-Verifikation (PFLICHT für alle Typ-Zugriffe im Plan)

| Zugriff im Plan | Angenommene Struktur | Echte Typdefinition (Datei + Zeile + Code) | Stimmt? |
|---|---|---|---|
| | | | |

### 9.5 Abnahme

- [ ] Scope-Validator JSON eingefügt
- [ ] Validierungstabelle: Alle Punkte ≥ 95% CONFI MIT Code-Zitat
- [ ] Exit-Pfad-Inventur: Zeilenanzahl matcht Scope-Validator `exitPaths.total`
- [ ] Exit-Pfad-Inventur: Jede "Advance nötig = Ja"-Zeile ist im Plan erfasst
- [ ] Operations-Reihenfolge: Keine unbegründeten Abweichungen
- [ ] Datenstruktur-Verifikation: Alle Zugriffe stimmen mit echten Typen überein
- [ ] **ERST DANN:** Status → VALIDATED

---

## 10. Abschluss-Checkliste für Sonnet

- [ ] `npx tsc --noEmit` ausgeführt und fehlerfrei
- [ ] Änderungen in dieser Projektdatei dokumentiert
- [ ] `features/INDEX.md` aktualisiert (falls betroffen)
- [ ] I.md geprüft — neue Regel? → Sektion B
- [ ] C.md geprüft — neue Verbindung? → Sektion B
- [ ] S.md geprüft — neues UI-Pattern/Farbe? → Sektion B

---

## 11. Neue Vorschläge für I.md / C.md / S.md

*(Noch keine Vorschläge)*

---

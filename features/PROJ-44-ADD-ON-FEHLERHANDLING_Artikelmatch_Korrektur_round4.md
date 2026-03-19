# PROJ-44-ADD-ON-FEHLERHANDLING: Artikelmatch Fehler-Deduplizierung + Schriftfarbe

**Status:** Open
**Typ:** Bugfix (ADD-ON zu PROJ-44)
**Erstellt:** 2026-03-19
**Betroffene Bereiche:** Fehler-Center, IssueDialog, FalmecMatcher_Master

---

## 1. Big Picture / Kontext

### Was macht das System?
Beim Verarbeitungsschritt 2 ("Artikel extrahieren") wird jede Rechnungszeile gegen die Artikelstammdaten gematched. Wenn ein Artikel weder per Herstellerartikelnummer noch per EAN gefunden wird, erzeugt `FalmecMatcher_Master.crossMatch()` Fehler-Issues, die im **Fehler-Center** (Tab "Fehler") angezeigt werden. Der User kann diese Fehler dann im **IssueDialog** bearbeiten — inklusive manueller Artikelzuordnung über die `ArticleMatchCard`.

### Was ist das Problem?
**Problem 1 — Doppelter Fehler:** Wenn ein Artikel nicht im Stamm gefunden wird, erzeugt der Matcher ZWEI separate Issues:
- `no-article-match` (Typ: Rollup-Summary) — "X Artikel ohne Match in Stammdaten"
- `match-artno-not-found` (Typ: Granular) — "X Zeilen: Artikelnummer/EAN nicht im Stamm gefunden"

Beide referenzieren IDENTISCHE `affectedLineIds` und erscheinen als zwei separate Fehler-Karten im Fehler-Center. Für den User ist das verwirrend, weil es so aussieht als gäbe es zwei unterschiedliche Probleme, obwohl es dasselbe ist.

**Problem 2 — Schriftfarbe:** Im IssueDialog-Formular (`ArticleMatchCard`) haben die Input- und Select-Felder einen dunklen teal-Hintergrund (`bg-background` = `#3F6C79`) mit schwarzer Schrift (`text-foreground` = `#282828`). Die Werte sind dadurch kaum lesbar. Die Feldwerte brauchen weiße Schrift.

### Warum existiert der Doppel-Fehler?
In `FalmecMatcher_Master.ts` (PROJ-17) wurde ein 3-stufiges Issue-System eingebaut:
1. `no-article-match` — Rollup aller no-match-Zeilen (Conflict + Non-Conflict) → "Abwärtskompatibilität"
2. `match-artno-not-found` — Nur Non-Conflict no-match-Zeilen → "Granulare Unterscheidung"
3. `match-conflict-id` — Nur Conflict-Zeilen (ArtNo zeigt auf Artikel A, EAN auf Artikel B)

Wenn es KEINE Conflicts gibt (Normalfall), haben Issue 1 und Issue 2 **exakt identische** affectedLineIds. Der Rollup `no-article-match` ist dann redundant.

### Entscheidung: Welchen Fehler entfernen?
**`no-article-match` (Rollup) wird NICHT MEHR ERZEUGT.** Begründung:
- `match-artno-not-found` deckt alle Non-Conflict-Fälle ab
- `match-conflict-id` deckt alle Conflict-Fälle ab
- Zusammen ersetzen sie den Rollup vollständig, ohne Informationsverlust
- Der Rollup war "backward-compat", verursacht aber die User-Verwirrung

**WICHTIG:** Label-Maps, quickFixHints, formatLineForDisplay-Cases und IssueDialog-Conditional-Rendering für `no-article-match` werden BEIBEHALTEN (nicht löschen!). Grund: In IndexedDB persistierte alte Runs können noch `no-article-match`-Issues enthalten. Diese müssen weiterhin korrekt angezeigt und bedient werden können.

---

## 2. Betroffene Dateien — Chirurgische Eingriffe

### Fix 1: Fehler-Deduplizierung (1 Datei, 1 Stelle)

| Datei | Zeilen (ca.) | Aktion |
|---|---|---|
| `src/services/matchers/modules/FalmecMatcher_Master.ts` | 265–283 | **ENTFERNEN:** Den gesamten Block der `no-article-match`-Issue-Erzeugung. Die Variable `allNoMatch` (Zeile 266) wird ebenfalls nicht mehr benötigt. |

**Exakter Code-Block zum Entfernen (Zeilen 265–283):**
```typescript
// Rollup: no-article-match (backwards-compatible summary)
const allNoMatch = matchResults.filter(r => r.line.matchStatus === 'no-match');
if (allNoMatch.length > 0) {
  issues.push({
    id: `issue-${runId}-step2-no-match-${Date.now()}`,
    runId,
    severity: 'error',
    stepNo: 2,
    type: 'no-article-match',
    message: `${allNoMatch.length} Artikel ohne Match in Stammdaten`,
    details: `${allNoMatch.length} Artikel ohne Match in Stammdaten`,
    relatedLineIds: allNoMatch.map(r => r.line.lineId),
    affectedLineIds: allNoMatch.map(r => r.line.lineId),
    status: 'open',
    createdAt: now,
    resolvedAt: null,
    resolutionNote: null,
  });
}
```

**NICHT ANFASSEN (Backward-Compat für alte persistierte Runs):**
- `IssuesCenter.tsx:46` — Label `'no-article-match': 'Artikel nicht gefunden'`
- `IssuesCenter.tsx:84-85` — quickFixHint für `no-article-match`
- `IssueDialog.tsx:70` — Label-Map-Eintrag
- `IssueDialog.tsx:94` — formatLineForDisplay case
- `IssueDialog.tsx:459` — ArticleMatchCard Conditional (zeigt Formular auch für alte `no-article-match`-Issues)
- `runStore.ts:259` — `checkIssueStillActive` case für `no-article-match`
- `issueLineFormatter.ts:20` — Label-Map-Eintrag
- `types/index.ts:14` — IssueType Union-Member

### Fix 2: Schriftfarbe weiß (1 Datei, ~6 Stellen)

| Datei | Zeilen (ca.) | Aktion |
|---|---|---|
| `src/components/run-detail/IssueDialog.tsx` | 170–232 | `text-white` zu den className-Props der Input- und SelectTrigger-Komponenten innerhalb der `ArticleMatchCard` hinzufügen |

**Betroffene Felder in ArticleMatchCard (Zeilen 162–249):**

1. **Artikelnr (Falmec)*** — Input Zeile ~174: `className={...}` → `text-white` ergänzen
2. **Hersteller-Art-Nr** — Input Zeile ~182: `className="h-7 text-xs"` → `"h-7 text-xs text-white"`
3. **EAN** — Input Zeile ~186: `className="h-7 text-xs"` → `"h-7 text-xs text-white"`
4. **Bezeichnung (DE)** — Input Zeile ~190: `className="h-7 text-xs"` → `"h-7 text-xs text-white"`
5. **S/N-Pflicht** — SelectTrigger Zeile ~201: `className="h-7 text-xs"` → `"h-7 text-xs text-white"`
6. **Wareneingangslager** — SelectTrigger Zeile ~217: `className="h-7 text-xs"` → `"h-7 text-xs text-white"`
7. **Lieferant** — Input Zeile ~227: `className="h-7 text-xs"` → `"h-7 text-xs text-white"`
8. **Bestellnummer** — Input Zeile ~231: `className="h-7 text-xs"` → `"h-7 text-xs text-white"`

**ACHTUNG — NUR die Input/SelectTrigger-Elemente innerhalb `ArticleMatchCard`!**
- NICHT die Labels (`<Label>`) — die bleiben wie sie sind
- NICHT den "Übernehmen"-Button — der hat bereits `text-white`
- NICHT die POS-Info-Zeile (`<p className="text-xs text-muted-foreground">`)
- NICHT die Überschriften im IssueDialog selbst
- NICHT die Inputs/Selects in anderen Bereichen des IssueDialog (z.B. Tab "Lösung erzwingen", Tab "E-Mail")

**Spezialfall Artikelnr (Falmec)*:** Dieses Input hat eine dynamische className mit Conditional:
```typescript
className={`h-7 text-xs ${!isValid && formData.falmecArticleNo ? 'border-red-400' : ''}`}
```
Hier `text-white` ergänzen:
```typescript
className={`h-7 text-xs text-white ${!isValid && formData.falmecArticleNo ? 'border-red-400' : ''}`}
```

---

## 3. Schritt-für-Schritt Implementierungsplan

### Schritt 1: Fix Fehler-Deduplizierung
1. Öffne `src/services/matchers/modules/FalmecMatcher_Master.ts`
2. Finde den Block ab Zeile ~265 (Kommentar: `// Rollup: no-article-match`)
3. Lösche den gesamten Block (Zeilen 265–283) inklusive der `allNoMatch`-Variable
4. Verifiziere: Der nachfolgende Block `// Granular: match-artno-not-found` (Zeilen 285–302) und `// Granular: match-conflict-id` (Zeilen 304–321) bleiben UNVERÄNDERT

### Schritt 2: Fix Schriftfarbe
1. Öffne `src/components/run-detail/IssueDialog.tsx`
2. Finde die Funktion `ArticleMatchCard` (Zeile ~122)
3. Füge `text-white` zu allen 8 Input/SelectTrigger-className-Props hinzu (nur innerhalb dieser Funktion!)

### Schritt 3: TypeScript-Check
```bash
npx tsc --noEmit
```
Muss 0 Errors ergeben.

### Schritt 4: Manuelle Verifikation
- Lade eine Testdatei hoch die einen unbekannten Artikel enthält
- Prüfe: Im Fehler-Center erscheint NUR NOCH EIN Fehler (nicht zwei)
- Prüfe: Klick auf "Bearbeiten" öffnet den IssueDialog mit der ArticleMatchCard
- Prüfe: Formularfelder haben weiße Schrift auf dunklem Hintergrund
- Prüfe: Labels bleiben unverändert (kein weiß)
- Prüfe: Alte Runs mit `no-article-match`-Issues werden weiterhin korrekt angezeigt

---

## 4. Stolperfallen & Warnungen

### Stolperfalle 1: Zeilen-Offset nach Löschung
Nach dem Entfernen des 19-Zeilen-Blocks (265–283) verschieben sich alle nachfolgenden Zeilennummern um ~19. Die Zeilen im Plan beziehen sich auf den IST-Zustand VOR der Änderung.

### Stolperfalle 2: `allNoMatch` vs `noMatchNoConflict`
- `allNoMatch` = `matchResults.filter(r => r.line.matchStatus === 'no-match')` — ENTHÄLT Conflicts
- `noMatchNoConflict` = `matchResults.filter(r => r.line.matchStatus === 'no-match' && !r.isConflict)` — OHNE Conflicts
- Die Variable `noMatchNoConflict` (Zeile 262) MUSS BLEIBEN — sie wird für `match-artno-not-found` verwendet!
- Die Variable `allNoMatch` (Zeile 266) wird NUR für den gelöschten Block verwendet und kann mit entfernt werden.

### Stolperfalle 3: Kein IssueType entfernen!
`'no-article-match'` darf NICHT aus dem `IssueType`-Union (`types/index.ts`) entfernt werden. Alte persistierte Runs enthalten diesen Typ in ihren gespeicherten Issues. Wenn der Typ aus dem Union entfernt wird, gibt es TypeScript-Fehler beim Laden alter Daten.

### Stolperfalle 4: Schriftfarbe — Scope begrenzen!
`text-white` darf NUR auf die Felder in `ArticleMatchCard` (Zeilen ~162–249 in IssueDialog.tsx). Der IssueDialog hat weitere Input/Select-Elemente in anderen Tabs (z.B. Resolutionsnote, E-Mail-Adresse) — diese NICHT ändern.

### Stolperfalle 5: Placeholder-Farbe
Das `text-white` könnte auch die Placeholder-Texte (z.B. "1XXXXX", "Wählen...", "2024-0001") beeinflussen. Das ist OK — weiße Placeholder auf dunklem Hintergrund sind besser lesbar als graue. Falls gewünscht: `placeholder:text-white/60` für leicht gedimmte Placeholder.

### Stolperfalle 6: SelectTrigger ChevronDown-Icon
Der `<SelectTrigger>` enthält intern ein ChevronDown-Icon mit `opacity-50`. Durch `text-white` auf dem Trigger wird auch das Icon weiß — das ist gewünscht (besser sichtbar).

---

## 5. Akzeptanzkriterien

| # | Kriterium | Prüfmethode |
|---|---|---|
| AC-1 | Neuer Run mit unbekanntem Artikel erzeugt genau 1 Fehler (nicht 2) im Fehler-Center | Manueller Test |
| AC-2 | Der verbleibende Fehler hat Typ `match-artno-not-found` | Issue-Karte prüfen |
| AC-3 | Klick auf "Bearbeiten" öffnet IssueDialog mit ArticleMatchCard-Formular | UI-Test |
| AC-4 | Manuelle Artikelzuordnung funktioniert (setManualArticleByPosition wird aufgerufen) | Formular ausfüllen + "Übernehmen" |
| AC-5 | Fehler wird nach manueller Zuordnung automatisch resolved (Auto-Resolve) | Fehler-Center Status prüfen |
| AC-6 | Input-/Select-Felder in ArticleMatchCard zeigen weiße Schrift | Visuell prüfen |
| AC-7 | Labels in ArticleMatchCard bleiben unverändert (nicht weiß) | Visuell prüfen |
| AC-8 | Alte Runs mit `no-article-match`-Issues werden weiterhin korrekt angezeigt | Alten Run öffnen |
| AC-9 | `npx tsc --noEmit` = 0 Errors | CLI |
| AC-10 | Keine anderen Dateien verändert als FalmecMatcher_Master.ts und IssueDialog.tsx | `git diff --stat` |

---

## 6. Inception-Prompt für Sonnet

```
Du bist ein chirurgischer Code-Editor für das Projekt falmec-receiptPro v3.

## Dein Auftrag
Führe EXAKT die zwei Fixes aus dem Feature-Plan PROJ-44-ADD-ON-FEHLERHANDLING durch.
Der Plan steht in: features/PROJ-44-ADD-ON-FEHLERHANDLING_Artikelmatch_Korrektur.md

## HANDSCHELLEN — Strikte Regeln

### Erlaubte Dateien (NUR diese 2 Dateien darfst du editieren):
1. src/services/matchers/modules/FalmecMatcher_Master.ts
2. src/components/run-detail/IssueDialog.tsx

### VERBOTEN — Unter keinen Umständen:
- KEINE anderen Dateien öffnen, editieren oder erstellen
- KEINE Änderungen an types/index.ts, runStore.ts, IssuesCenter.tsx, issueLineFormatter.ts
- KEINEN IssueType aus dem Union entfernen
- KEINE Label-Maps, quickFixHints oder formatLineForDisplay-Cases ändern
- KEINE Styling-Änderungen außerhalb der ArticleMatchCard-Funktion (Zeilen ~122–249 in IssueDialog.tsx)
- KEIN Refactoring, keine Verbesserungen, keine Aufräumarbeiten
- KEINE Kommentare hinzufügen oder ändern (außer der gelöschte Block-Kommentar)
- KEINE neuen Features oder "Verbesserungsideen" einbauen

### Fix 1 — Fehler-Deduplizierung:
- Lösche in FalmecMatcher_Master.ts den Block Zeilen ~265–283 (no-article-match Rollup-Issue-Erzeugung)
- Lösche auch die Variable allNoMatch (Zeile ~266) die nur von diesem Block verwendet wird
- BEHALTE die Variable noMatchNoConflict (Zeile ~262) — die wird weiterhin gebraucht
- BEHALTE den Block match-artno-not-found (Zeilen ~285–302) UNVERÄNDERT
- BEHALTE den Block match-conflict-id (Zeilen ~304–321) UNVERÄNDERT

### Fix 2 — Schriftfarbe:
- Füge `text-white` zu den className-Props aller Input- und SelectTrigger-Elemente
  innerhalb der Funktion ArticleMatchCard hinzu (8 Felder total)
- NUR innerhalb ArticleMatchCard (Zeilen ~162–249)
- NICHT die Labels, NICHT den Button, NICHT die POS-Info-Zeile
- NICHT Inputs/Selects in anderen IssueDialog-Bereichen

### Nach den Änderungen:
- Führe `npx tsc --noEmit` aus — muss 0 Errors ergeben
- Prüfe mit `git diff --stat` dass NUR die 2 erlaubten Dateien geändert wurden

### Wenn du unsicher bist:
- LIES den vollständigen Plan in der Feature-Datei
- Im Zweifel: WENIGER ändern, nicht mehr
- Frag den User bevor du etwas tust das nicht im Plan steht
```

---

## 7. Dateien-Checkliste nach Abschluss

- [ ] `src/services/matchers/modules/FalmecMatcher_Master.ts` — Block gelöscht
- [ ] `src/components/run-detail/IssueDialog.tsx` — 8x `text-white` ergänzt
- [ ] `npx tsc --noEmit` — 0 Errors
- [ ] `features/INDEX.md` — neuen Eintrag ergänzt
- [ ] Manueller Test durchgeführt

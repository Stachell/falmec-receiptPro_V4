##### BUG ANALYSE - SONNET ÜBER CHROME BROWSER ERWEITERUNG ######
** USERFUND: Nach erfolgreichem Durchlauf und Export erstett sich eigenständig ein Filter, ähnlich aus dem Fehler-Center und ist so eingestellt, dass keine Daten mehr angezeigt werden.
	- Mann kann ihn auf "X" schließen
	- Beschriftung: "Zeige 0 isolierte Problem-Zeilen (RE-Positionen)"
	- Trägt die Optik von "Zeile isolieren" aus dem Fehlerblöcken im Tab Fehler (Body Überschrift im Fehlerblock)


## Bug-Analyse: Isolier-Filter bleibt nach Export aktiv

**Bug bestätigt und Ursache gefunden.**

---

### Was passiert genau

Der `activeIssueFilterIds`-State enthält nach dem Export noch den Wert aus dem **vorherigen Run**:
```
activeIssueFilterIds: ["Fattura-20.007-20260421-170236-line-26"]
```
Die aktuelle Run-ID ist `185845`, aber der Filter-Eintrag gehört zu Run `170236`. Das heißt: Beim Laden/Wechsel auf den neuen Run wurde dieser State-Wert **nicht zurückgesetzt**.

---

### Die Ursache im Code

In **`/src/store/slices/workflowSlice.ts`** gibt es eine Funktion, die beim Run-Neustart/-Wechsel den Store-State zurücksetzt (ca. Zeilen 392–441). Der `set()`-Aufruf setzt diese Felder:

```
runs:                  ...resetRun
currentRun:            ...resetRun  
invoiceLines:          resetLines
issues:                keptIssues
orderPool:             null
currentParsedRunId:    runId
```

**`activeIssueFilterIds: null` fehlt in dieser Liste vollständig.**

Der `setActiveIssueFilterIds`-Setter (definiert in `runCrudSlice.ts`, Zeile 66) ist eine separate Aktion – sie wird beim Run-Reset nicht aufgerufen. Der Initial-State ist zwar `null` (runCrudSlice, Zeile 43), aber dieser wird beim programmatischen Reset-`set()` **nicht erneut angewendet**, weil nur die obigen 6 Felder explizit gesetzt werden.

---

### Warum tritt es speziell nach dem Export auf

Die „Isolieren"-Funktion (aus dem Fehler-Tab) setzt `activeIssueFilterIds` auf eine Liste von Zeilen-IDs und wechselt dabei auf die Artikelliste. Nach dem **Export** wird ein neuer Run-Prozess gestartet – der Reset-`set()` setzt den State zurück, **aber vergisst `activeIssueFilterIds: null`**. Der Filter aus der vorherigen Sitzung bleibt deshalb aktiv, auch obwohl er für den neuen Run keine passenden Zeilen findet (→ "Zeige **0** isolierte Problem-Zeilen").

---

### Fix

In `workflowSlice.ts` in dem `set()`-Block beim Run-Reset folgende Zeile **ergänzen**:

```typescript
set((s) => ({
  runs: s.runs.map(...),
  currentRun: ...,
  invoiceLines: resetLines,
  issues: keptIssues,
  orderPool: null,
  currentParsedRunId: runId,
  activeIssueFilterIds: null,   // ← DAS FEHLT
  highlightedLineIds: [],        // optional: auch das beim Reset leeren
  scrollToLineId: null,          // optional: ebenfalls zurücksetzen
}));
```

---

### Nebenbefund

Im gleichen Zusammenhang gibt es massenhaft React-Warnungen wegen **doppelter Keys** in `ItemsTable.tsx` (z.B. `Fattura-20.007-20260421-105128-line-18-0`). Das ist ein separater Bug, aber es deutet darauf hin, dass beim Generieren der Zeilen-Keys ein Suffix (`-0`) nicht eindeutig genug ist, wenn ein Invoice mehrfach dieselbe Zeilen-Nummer hat.
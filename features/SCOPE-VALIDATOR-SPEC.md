# SCOPE-VALIDATOR — Spezifikation

> **Zweck:** Deterministisches Prüfwerkzeug für Phase V. Liefert unbestechliche Zahlen
> gegen die Opus seine Validierungstabellen matchen muss.
> **Speicherort:** `scripts/scope-validator.ts`
> **Dependency:** `ts-morph` (einmalig `npm install ts-morph --save-dev`)

---

## 1. Aufruf

```bash
npx ts-node scripts/scope-validator.ts --file src/store/runStore.ts --fn executeMatcherCrossMatch
```

Mehrere Funktionen:
```bash
npx ts-node scripts/scope-validator.ts --file src/store/runStore.ts --fn executeMatcherCrossMatch,retryStep,resumeRun
```

Optional als npm-Script in `package.json`:
```json
{
  "scripts": {
    "scope-check": "ts-node scripts/scope-validator.ts"
  }
}
```
Dann: `npm run scope-check -- --file src/store/runStore.ts --fn advanceToNextStep`

---

## 2. Was das Script tut (drei Schritte)

### Schritt A: Initialisierung
- Lädt `tsconfig.json` aus dem Projekt-Root (nötig für Path-Aliases wie `@/services/...`)
- Öffnet die Zieldatei über ts-morph
- Findet die Funktion per Name im AST
- Wenn Funktion nicht gefunden → Fehlermeldung mit verfügbaren Funktionsnamen

### Schritt B: AST-Scanning
Traversiert den Syntax-Baum der gefundenen Funktion und sammelt:

**Exit-Pfade:**
- Alle `ReturnStatement`-Nodes → Zeilennummer
- Alle `ThrowStatement`-Nodes → Zeilennummer
- Implizites Ende der Funktion (kein expliziter Return am Ende) → letzte Zeile

**State-Writes:**
- Alle `CallExpression` wo der Aufruf `set(` oder `updateStepStatus(` ist → Zeilennummer
- Hinweis: `set()` ist Zustand's direkter State-Write, `updateStepStatus()` ist der Store-Action-Wrapper

**State-Reads:**
- Alle `CallExpression` wo der Aufruf `get()` ist → Zeilennummer

**Ausgehende Funktionsaufrufe:**
- Alle `CallExpression` die auf Store-Actions zeigen → Name + Zeilennummer
- Filter: Nur `get().xxx()` Aufrufe (Store-Actions), nicht interne Hilfsfunktionen

### Schritt C: JSON-Output
Gibt ein JSON-Objekt auf stdout aus. Kein Logging, keine Erklärungen — nur das JSON.

---

## 3. Output-Format

```json
{
  "file": "src/store/runStore.ts",
  "functions": [
    {
      "name": "executeMatcherCrossMatch",
      "range": [4615, 4892],
      "exitPaths": {
        "lines": [4723, 4756, 4840, 4878],
        "total": 4
      },
      "stateWrites": {
        "lines": [4756, 4840],
        "total": 2
      },
      "stateReads": {
        "lines": [4650, 4660, 4710],
        "total": 3
      },
      "storeActionCalls": {
        "calls": [
          { "line": 4756, "name": "updateStepStatus" },
          { "line": 4878, "name": "advanceToNextStep" },
          { "line": 4862, "name": "setStepDiagnostics" }
        ],
        "total": 3
      }
    }
  ]
}
```

**Design-Entscheidungen:**
- Zeilennummern JA (zum Abgleich wenn was fehlt)
- Code-Snippets NEIN (hält den Output kompakt, Code steht in der Datei)
- Totals JA (für den 5-Sekunden-Zahlenabgleich)
- Store-Action-Calls JA (zeigt die ausgehenden Verbindungen — relevant für Circuit-Check)

---

## 4. Sonderfälle die ts-morph korrekt handhabt (grep nicht)

| Fall | grep-Problem | ts-morph-Lösung |
|---|---|---|
| `return` in Kommentar | Wird mitgezählt | AST ignoriert Kommentare |
| `return` in Inline-Callback (`.map(x => { return x })`) | Wird mitgezählt | AST kennt Funktionsgrenzen |
| `return` in verschachtelter Hilfsfunktion | Wird mitgezählt | AST traversiert nur die Zielfunktion |
| Arrow-Function ohne expliziten Return | Wird nicht gezählt | AST erkennt impliziten Return |
| `throw new Error()` | Wird von `grep "return"` nicht gefunden | ThrowStatement ist eigener Node-Typ |
| `set()` als lokale Variable statt Store-Zugriff | Wird mitgezählt | AST kann Scope prüfen |

---

## 5. Integration in den Governance-Workflow

### In CLAUDE.md (neue Zeile unter Phase V):
```
Vor Phase V: Führe `npm run scope-check -- --file [SCOPE-DATEI] --fn [FUNKTIONEN]` aus.
Die JSON-Ausgabe ist die verbindliche Referenz für die Phase-V-Tabellen.
Die Totals müssen mit der Anzahl der Tabellenzeilen übereinstimmen.
```

### In PLANUNGS-KATALYSATOR Phase V (neuer Abschnitt 9.0 vor 9.1):
```
### 9.0 Scope-Validator ausführen (PFLICHT vor allen Tabellen)

Führe für JEDE Funktion im Scope aus:
`npm run scope-check -- --file [DATEI] --fn [FUNKTION1],[FUNKTION2],...`

Kopiere die JSON-Ausgabe hierher:
[JSON einfügen]

Die Totals aus dem JSON sind die SOLL-Werte für die nachfolgenden Tabellen:
- exitPaths.total = Anzahl Zeilen in der Exit-Pfad-Inventur (9.2)
- stateWrites.total = Anzahl Write-Einträge in der Validierungstabelle (9.1)
- stateReads.total = Anzahl Read-Einträge in der Validierungstabelle (9.1)

Bei Mismatch zwischen JSON-Totals und Tabellenzeilen → Tabelle ist unvollständig.
```

### Für Dom (privat, in GOVERNANCE-WORKFLOW-DOKU):
```
Prüfsummen-Abgleich (Opus darf das nicht wissen):
1. JSON sagt: exitPaths.total = 14
2. Phase-V-Tabelle 9.2 hat X Zeilen
3. 14 = X → Match → vermutlich vollständig
4. 14 ≠ X → Mismatch → zurückweisen
Dauer: 10 Sekunden visueller Abgleich
```

---

## 6. Was das Script NICHT tut

- Keine Bewertung ob ein Exit-Pfad einen Advance braucht (das ist Opus' Job)
- Keine Aussage ob der Code korrekt ist (das ist Sonnets Job)
- Keine Änderung am Code (read-only, null Seiteneffekte)
- Kein Netzwerkzugriff, keine externen Calls
- Keine Interpretation — nur rohe Fakten aus dem AST

---

## 7. Aufwand & Dependencies

| Aspekt | Details |
|---|---|
| Neue Dependency | `ts-morph` (~2MB, dev-only) |
| Script-Größe | ~80-120 Zeilen TypeScript |
| Einmaliger Setup | Script schreiben + `npm install ts-morph -D` |
| Laufzeit pro Aufruf | < 3 Sekunden (AST-Parse ist schnell) |
| Wartung | Keine — solange TypeScript die Sprache bleibt |

---

## 8. Implementierungs-Skelett

```typescript
import { Project, SyntaxKind, Node } from 'ts-morph';
import { resolve } from 'path';

// ── Args parsen ──
const args = parseArgs(process.argv.slice(2));  // --file, --fn

// ── Schritt A: Projekt laden mit tsconfig ──
const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
});
const sourceFile = project.getSourceFileOrThrow(args.file);

// ── Für jede Funktion ──
const results = args.functions.map(fnName => {
  // Funktion finden (auch in Objekt-Literalen wie Zustand-Stores)
  const func = findFunction(sourceFile, fnName);
  if (!func) return { name: fnName, error: 'not found' };

  // ── Schritt B: AST scannen ──
  const exitPaths = [
    ...func.getDescendantsOfKind(SyntaxKind.ReturnStatement),
    ...func.getDescendantsOfKind(SyntaxKind.ThrowStatement),
  ].map(node => node.getStartLineNumber());

  const allCalls = func.getDescendantsOfKind(SyntaxKind.CallExpression);

  const stateWrites = allCalls
    .filter(c => {
      const text = c.getExpression().getText();
      return text === 'set' || text.endsWith('.set')
        || text.includes('updateStepStatus');
    })
    .map(c => c.getStartLineNumber());

  const stateReads = allCalls
    .filter(c => c.getExpression().getText().startsWith('get()'))
    .map(c => c.getStartLineNumber());

  const storeActions = allCalls
    .filter(c => c.getExpression().getText().startsWith('get().'))
    .map(c => ({
      line: c.getStartLineNumber(),
      name: c.getExpression().getText().replace('get().', ''),
    }));

  // ── Schritt C: Ergebnis ──
  return {
    name: fnName,
    range: [func.getStartLineNumber(), func.getEndLineNumber()],
    exitPaths:  { lines: exitPaths, total: exitPaths.length },
    stateWrites: { lines: stateWrites, total: stateWrites.length },
    stateReads: { lines: stateReads, total: stateReads.length },
    storeActionCalls: { calls: storeActions, total: storeActions.length },
  };
});

// ── Output ──
console.log(JSON.stringify({ file: args.file, functions: results }, null, 2));
```

**Hinweis:** Das Skelett zeigt die Struktur. Die `findFunction`-Hilfsfunktion muss
Zustand-Store-Pattern berücksichtigen (Funktionen in Objekt-Literalen, nicht als
Top-Level-Deklarationen). Das ist der einzige nicht-triviale Teil.

---

*Erstellt: 2026-04-02 | Status: Spezifikation — bereit zur Implementierung*

#!/usr/bin/env node
/**
 * SCOPE-VALIDATOR — Deterministisches AST-Prüfwerkzeug für Phase V
 *
 * Liefert harte Zahlen über Exit-Pfade, State-Writes, State-Reads
 * und Store-Action-Calls pro Funktion. Kein Raten, kein Pattern-Matching.
 *
 * Aufruf:
 *   npx ts-node scripts/scope-validator.ts --file src/store/runStore.ts --fn advanceToNextStep
 *   npx ts-node scripts/scope-validator.ts --file src/store/runStore.ts --fn advanceToNextStep,retryStep,resumeRun
 */

import { Project, SyntaxKind, Node, SourceFile } from 'ts-morph';
import { resolve, relative } from 'path';

// ════════════════════════════════════════════════════════════
// Args
// ════════════════════════════════════════════════════════════

interface Args {
  file: string;
  functions: string[];
  tsconfig?: string;
}

function parseArgs(argv: string[]): Args {
  let file = '';
  let fns: string[] = [];
  let tsconfig: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) {
      file = argv[++i];
    } else if (argv[i] === '--fn' && argv[i + 1]) {
      fns = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (argv[i] === '--tsconfig' && argv[i + 1]) {
      tsconfig = argv[++i];
    }
  }

  if (!file || fns.length === 0) {
    console.error('Usage: scope-validator --file <path> --fn <name1,name2,...> [--tsconfig <path>]');
    process.exit(1);
  }

  return { file, functions: fns, tsconfig };
}

// ════════════════════════════════════════════════════════════
// Funktion finden (inkl. Zustand-Store-Pattern)
// ════════════════════════════════════════════════════════════

/**
 * Findet eine Funktion im AST — auch wenn sie als Property in einem
 * Objekt-Literal lebt (typisch für Zustand-Stores).
 *
 * Sucht in dieser Reihenfolge:
 * 1. Top-Level FunctionDeclaration / VariableDeclaration mit Arrow/Function
 * 2. PropertyAssignment in Objekt-Literalen (Zustand create() Pattern)
 * 3. MethodDeclaration in Klassen
 */
function findFunction(sourceFile: SourceFile, name: string): Node | null {
  // 1. Top-Level Funktionen
  const funcDecl = sourceFile.getFunction(name);
  if (funcDecl) return funcDecl;

  // 2. Variable mit Arrow/Function Expression
  const varDecl = sourceFile.getVariableDeclaration(name);
  if (varDecl) {
    const init = varDecl.getInitializer();
    if (init) return init;
  }

  // 3. PropertyAssignment in Objekt-Literalen (Zustand-Store-Pattern)
  //    z.B.: create((set, get) => ({ advanceToNextStep: (runId) => { ... } }))
  const allProps = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment);
  for (const prop of allProps) {
    if (prop.getName() === name) {
      const init = prop.getInitializer();
      if (init) return init;
    }
  }

  // 4. MethodDeclaration in Objekt-Literalen oder Klassen
  const allMethods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
  for (const method of allMethods) {
    if (method.getName() === name) return method;
  }

  return null;
}

/**
 * Listet alle verfügbaren Funktionsnamen in der Datei auf (für Fehlermeldungen).
 */
function listAvailableFunctions(sourceFile: SourceFile): string[] {
  const names = new Set<string>();

  // Top-Level
  sourceFile.getFunctions().forEach(f => {
    const n = f.getName();
    if (n) names.add(n);
  });

  // Variables (Arrow Functions)
  sourceFile.getVariableDeclarations().forEach(v => {
    const init = v.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      names.add(v.getName());
    }
  });

  // PropertyAssignments mit Function/Arrow-Body
  sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment).forEach(prop => {
    const init = prop.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      names.add(prop.getName());
    }
  });

  return Array.from(names).sort();
}

// ════════════════════════════════════════════════════════════
// AST-Scanning
// ════════════════════════════════════════════════════════════

interface FunctionAnalysis {
  name: string;
  range: [number, number];
  exitPaths: { lines: number[]; total: number };
  stateWrites: { lines: number[]; total: number };
  stateReads: { lines: number[]; total: number };
  storeActionCalls: { calls: { line: number; name: string }[]; total: number };
}

interface FunctionError {
  name: string;
  error: string;
  available?: string[];
}

/**
 * Prüft ob ein Node zur Logik der Zielfunktion gehört.
 *
 * ERLAUBT (wird mitgezählt):
 * - Direkte Statements in der Funktion
 * - Innere benannte Funktionen (const runAsyncStep2 = async () => { ... })
 * - IIFEs (void (async () => { ... })())
 * - Async-Wrapper-Blöcke
 *
 * BLOCKIERT (wird NICHT mitgezählt):
 * - Arrow/Function-Ausdrücke die als Argument an Array-Methoden übergeben werden
 *   (.map, .filter, .forEach, .some, .find, .reduce, .flatMap, .sort)
 *   weil deren Returns nicht Exit-Pfade der Elternfunktion sind.
 */
const ARRAY_METHODS = new Set(['map', 'filter', 'forEach', 'some', 'find', 'reduce', 'flatMap', 'sort', 'every']);

function isRelevantDescendant(node: Node, functionNode: Node): boolean {
  let current = node.getParent();
  while (current && current !== functionNode) {
    // Ist current eine Arrow/Function die als Callback an eine Array-Methode geht?
    if (Node.isArrowFunction(current) || Node.isFunctionExpression(current)) {
      const parent = current.getParent();
      if (parent && Node.isCallExpression(parent)) {
        const expr = parent.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          const methodName = expr.getName();
          if (ARRAY_METHODS.has(methodName)) {
            return false; // Callback in Array-Methode → nicht mitzählen
          }
        }
      }
    }
    current = current.getParent();
  }
  return current === functionNode;
}

function analyzeFunction(sourceFile: SourceFile, fnName: string): FunctionAnalysis | FunctionError {
  const funcNode = findFunction(sourceFile, fnName);

  if (!funcNode) {
    return {
      name: fnName,
      error: `Function "${fnName}" not found`,
      available: listAvailableFunctions(sourceFile),
    };
  }

  const startLine = funcNode.getStartLineNumber();
  const endLine = funcNode.getEndLineNumber();

  // ── Exit-Pfade ──
  const returns = funcNode
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter(n => isRelevantDescendant(n, funcNode))
    .map(n => n.getStartLineNumber());

  const throws = funcNode
    .getDescendantsOfKind(SyntaxKind.ThrowStatement)
    .filter(n => isRelevantDescendant(n, funcNode))
    .map(n => n.getStartLineNumber());

  const exitLines = [...new Set([...returns, ...throws])].sort((a, b) => a - b);

  // ── Alle Call Expressions in der Funktion (direkt, nicht verschachtelt) ──
  const allCalls = funcNode
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(n => isRelevantDescendant(n, funcNode));

  // ── State-Writes: set() und updateStepStatus() ──
  const stateWriteLines = allCalls
    .filter(c => {
      const expr = c.getExpression().getText();
      return (
        expr === 'set' ||
        expr.endsWith('.set') ||
        expr.includes('updateStepStatus') ||
        expr.includes('updateRunStatus')
      );
    })
    .map(c => c.getStartLineNumber());

  const uniqueWrites = [...new Set(stateWriteLines)].sort((a, b) => a - b);

  // ── State-Reads: get() ──
  const stateReadLines = allCalls
    .filter(c => {
      const expr = c.getExpression().getText();
      return expr === 'get' || expr === 'get()';
    })
    .map(c => c.getStartLineNumber());

  // get() als Teil von get().xxx() — auch die äußere CallExpression zählt als Read
  const getChainReads = allCalls
    .filter(c => {
      const expr = c.getExpression().getText();
      return expr.startsWith('get().');
    })
    .map(c => c.getStartLineNumber());

  const uniqueReads = [...new Set([...stateReadLines, ...getChainReads])].sort((a, b) => a - b);

  // ── Store-Action-Calls: get().xxx() ──
  const storeActions = allCalls
    .filter(c => {
      const expr = c.getExpression().getText();
      return expr.startsWith('get().');
    })
    .map(c => {
      const expr = c.getExpression().getText();
      const actionName = expr.replace(/^get\(\)\./, '').replace(/\(.*$/, '');
      return {
        line: c.getStartLineNumber(),
        name: actionName,
      };
    });

  // Deduplizieren nach Zeile
  const uniqueActions: { line: number; name: string }[] = [];
  const seenActionLines = new Set<number>();
  for (const action of storeActions) {
    if (!seenActionLines.has(action.line)) {
      seenActionLines.add(action.line);
      uniqueActions.push(action);
    }
  }
  uniqueActions.sort((a, b) => a.line - b.line);

  return {
    name: fnName,
    range: [startLine, endLine],
    exitPaths: { lines: exitLines, total: exitLines.length },
    stateWrites: { lines: uniqueWrites, total: uniqueWrites.length },
    stateReads: { lines: uniqueReads, total: uniqueReads.length },
    storeActionCalls: { calls: uniqueActions, total: uniqueActions.length },
  };
}

// ════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════

function main() {
  const args = parseArgs(process.argv.slice(2));

  const tsconfigPath = resolve(process.cwd(), args.tsconfig || 'tsconfig.json');

  let project: Project;
  try {
    project = new Project({ tsConfigFilePath: tsconfigPath });
  } catch {
    // Fallback: Ohne tsconfig laden (funktioniert für einfache Dateien)
    project = new Project();
    project.addSourceFileAtPath(resolve(process.cwd(), args.file));
  }

  const filePath = resolve(process.cwd(), args.file);
  let sourceFile = project.getSourceFile(filePath);

  if (!sourceFile) {
    try {
      sourceFile = project.addSourceFileAtPath(filePath);
    } catch (err) {
      console.error(JSON.stringify({
        error: `File not found: ${args.file}`,
        resolved: filePath,
      }, null, 2));
      process.exit(1);
    }
  }

  const results = args.functions.map(fn => analyzeFunction(sourceFile!, fn));
  console.log(JSON.stringify({ file: args.file, functions: results }, null, 2));
}

main();

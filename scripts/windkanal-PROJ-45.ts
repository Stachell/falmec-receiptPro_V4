/**
 * Windkanal PROJ-45-RE-REGEX
 *
 * Testet die 2-Säulen-Architektur:
 * A) Geht der rohe Input durch die neue Regex?
 * B) Matchen zwei unterschiedliche Schreibweisen durch A12-Kanonisierung?
 */

// ── Neue Regex (SOLL) ──────────────────────────────────────────────
const NEW_REGEX = /^[12]\d\.?\d{3}$/;

// ── A12-Kanonisierung (CIRCUIT.md A12) ─────────────────────────────
function canonicalize(input: string): string {
  return input.replace(/\D/g, '').slice(-5);
}

// ── Teil A: Regex-Validierung ──────────────────────────────────────
interface RegexTestCase {
  input: string | null | undefined;
  expected: 'PASS' | 'FAIL';
}

const regexTests: RegexTestCase[] = [
  { input: '20.007',  expected: 'PASS' },
  { input: '20007',   expected: 'PASS' },
  { input: '10050',   expected: 'PASS' },
  { input: '10.050',  expected: 'PASS' },
  { input: '20.0074', expected: 'FAIL' },
  { input: 'A1000',   expected: 'FAIL' },
  { input: ' ',       expected: 'FAIL' },
  { input: '',        expected: 'FAIL' },
  { input: null,      expected: 'FAIL' },
];

console.log('## Teil A — Regex-Validierung (`^[12]\\d\\.?\\d{3}$`)\n');
console.log('| # | Input | Erwartet | Ergebnis | Status |');
console.log('|---|-------|----------|----------|--------|');

let allPass = true;
regexTests.forEach((tc, i) => {
  const display = tc.input === null ? 'null'
    : tc.input === undefined ? 'undefined'
    : tc.input === '' ? '(leer)'
    : tc.input === ' ' ? '(space)'
    : `"${tc.input}"`;

  const result = typeof tc.input === 'string' ? NEW_REGEX.test(tc.input) : false;
  const actual: 'PASS' | 'FAIL' = result ? 'PASS' : 'FAIL';
  const ok = actual === tc.expected;
  if (!ok) allPass = false;

  console.log(`| ${i + 1} | ${display} | ${tc.expected} | ${actual} | ${ok ? 'OK' : 'MISMATCH'} |`);
});

console.log(`\n**Teil A Ergebnis: ${allPass ? 'ALLE OK' : 'FEHLER'}**\n`);

// ── Teil B: A12-Kanonisierung-Match ────────────────────────────────
interface CanonTestCase {
  a: string;
  b: string;
  expectedMatch: boolean;
}

const canonTests: CanonTestCase[] = [
  { a: '20.007', b: '20007',  expectedMatch: true },
  { a: '10.050', b: '10050',  expectedMatch: true },
  { a: '20.007', b: '10050',  expectedMatch: false },
  { a: '10050',  b: '10050',  expectedMatch: true },
];

console.log('## Teil B — A12-Kanonisierung-Match (`replace(/\\D/g, \'\').slice(-5)`)\n');
console.log('| # | Input A | Input B | Canon A | Canon B | Match? | Erwartet | Status |');
console.log('|---|---------|---------|---------|---------|--------|----------|--------|');

let allCanonPass = true;
canonTests.forEach((tc, i) => {
  const cA = canonicalize(tc.a);
  const cB = canonicalize(tc.b);
  const matches = cA === cB;
  const ok = matches === tc.expectedMatch;
  if (!ok) allCanonPass = false;

  console.log(`| ${i + 1} | "${tc.a}" | "${tc.b}" | ${cA} | ${cB} | ${matches ? 'JA' : 'NEIN'} | ${tc.expectedMatch ? 'JA' : 'NEIN'} | ${ok ? 'OK' : 'MISMATCH'} |`);
});

console.log(`\n**Teil B Ergebnis: ${allCanonPass ? 'ALLE OK' : 'FEHLER'}**`);

// ── Gesamtergebnis ─────────────────────────────────────────────────
const overall = allPass && allCanonPass;
console.log(`\n---\n**Gesamtergebnis: ${overall ? 'BESTANDEN' : 'NICHT BESTANDEN'}**`);
process.exit(overall ? 0 : 1);

// store/internal/stepRunner.ts (< 60 LOC)
// PROJ-46 AP2: Kapselt AUSSCHLIESSLICH: "führe Guard aus, prüfe Block/Skip, rufe Execute".
// KEIN Pause-Handling, KEIN Status-Reset, KEIN Skip-Postlude-Advance.
// Trigger-Prelude/Postlude (pauseCheck-Regime, Failed→Running, Skip-Legacy vs. Skip-Targeted)
// bleiben explizit am Call-Site — nicht versteckt.
import { runStepGuard } from '@/store/runStore';
import type { RunState } from '@/store/runStore';

type Getter = () => RunState;
type Setter = (partial: Partial<RunState> | ((state: RunState) => Partial<RunState>)) => void;

export type StepRunOutcome =
  | { kind: 'blocked';  reason: string }
  | { kind: 'skipped';  reason: string }          // Caller entscheidet Legacy vs. Targeted Advance
  | { kind: 'executed' };                          // execute wurde aufgerufen

export async function runStepCore(
  stepNo: 2 | 3 | 4,
  runId: string,
  get: Getter,
  set: Setter,
  pauseCheck: () => boolean,                      // Trigger-spezifisch injiziert
  execute: () => void | Promise<void>,            // Trigger liefert die konkrete Execute-Funktion
): Promise<StepRunOutcome> {
  if (pauseCheck()) return { kind: 'blocked', reason: '__paused__' };
  const guard = await runStepGuard(stepNo, runId, get, set);
  if (pauseCheck()) return { kind: 'blocked', reason: '__paused__' };
  if (guard.blockReason) return { kind: 'blocked', reason: guard.blockReason };
  if (guard.skipReason)  return { kind: 'skipped', reason: guard.skipReason };
  await execute();
  return { kind: 'executed' };
}

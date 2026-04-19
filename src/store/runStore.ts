// store/runStore.ts — PROJ-46 AP4c Aggregator (Slice-Split)
//
// Dünne Assembly-Datei: kombiniert die fünf Slices aus `./slices/` über das
// Zustand-Slice-Pattern (`create(...)` + Spread) zu einem einheitlichen Store.
// Alle Logik, sämtliche Actions und jegliches State wohnen in den Slice-
// Dateien bzw. in den Hilfsfunktionen unter `./internal/helpers`.
//
// Public API (externe Consumer) — Re-Exports am Dateiende:
//   - `useRunStore` (Hook, überall in der App genutzt)
//   - Typ-Re-Exports: `RunState`, `FileSnapshot`, `IngestResult`
//   - Funktions-Re-Exports: `resolveIssueLines` (IssueDialog, IssuesCenter,
//     lib/issueLineFormatter), `runStepGuard` (stepRunner.ts)
//
// Ownership-Matrix: `./internal/ownership.md`.

import { create } from 'zustand';

import type { RunState } from './types';
import { createRunCrudSlice } from './slices/runCrudSlice';
import { createIngestSlice } from './slices/ingestSlice';
import { createWorkflowSlice } from './slices/workflowSlice';
import { createMutationSlice } from './slices/mutationSlice';
import { createPersistenceSlice } from './slices/persistenceSlice';

export const useRunStore = create<RunState>()((...a) => ({
  ...createRunCrudSlice(...a),
  ...createIngestSlice(...a),
  ...createWorkflowSlice(...a),
  ...createMutationSlice(...a),
  ...createPersistenceSlice(...a),
}));

// ── Public API: Re-Exports (Abwärtskompatibilität) ─────────────────────────
// Externe Consumer (IssueDialog, IssuesCenter, stepRunner, lib/issueLineFormatter)
// importieren diese Symbole weiterhin aus '@/store/runStore'.

export type { RunState, FileSnapshot, IngestResult } from './types';
export { resolveIssueLines, runStepGuard } from './internal/helpers';

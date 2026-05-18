# Engine AI Phase 3 Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 2 material-only evaluator with a stronger, testable Russian-draughts evaluation model.

**Architecture:** Keep the search API stable and improve only `eval/*`. Evaluation returns side-to-move centipawns by combining material, piece-square tables, mobility, back-rank guard, promotion race, trapped kings, long diagonal control, and tempo through centralized weights.

**Tech Stack:** TypeScript, Vitest, existing `FastState`, `generateFastMoves`, and `searchBestMove`.

---

## File Structure

- Create `src/lib/engine-ai/eval/weights.ts`: central feature weights.
- Create `src/lib/engine-ai/eval/pst.ts`: generated 32-square PSTs for men/kings by phase.
- Create `src/lib/engine-ai/eval/features.ts`: feature extraction and absolute scoring.
- Modify `src/lib/engine-ai/eval/evaluate.ts`: combine feature scores and expose optional breakdown.
- Create `src/lib/engine-ai/__tests__/phase3-eval.test.ts`: feature and tactical tests.
- Modify `src/lib/engine-ai/index.ts`: export `evaluateBreakdown`.

---

### Task 1: Feature Tests

**Files:**
- Create: `src/lib/engine-ai/__tests__/phase3-eval.test.ts`
- Create: `src/lib/engine-ai/eval/weights.ts`
- Create: `src/lib/engine-ai/eval/pst.ts`
- Create: `src/lib/engine-ai/eval/features.ts`
- Modify: `src/lib/engine-ai/eval/evaluate.ts`
- Modify: `src/lib/engine-ai/index.ts`

- [ ] **Step 1: Write failing tests**

Assert evaluation rewards material, advanced men, back-rank guards in middlegame, king centralization/long diagonal, and penalizes trapped kings.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/lib/engine-ai/__tests__/phase3-eval.test.ts`

Expected: FAIL because Phase 3 APIs do not exist.

- [ ] **Step 3: Implement weights, PST and features**

Use feature weights from `ENGINE.md` as starting values. Keep functions deterministic and synchronous.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/lib/engine-ai/__tests__/phase3-eval.test.ts`

Expected: PASS.

---

### Task 2: Tactical Search Tests

**Files:**
- Modify: `src/lib/engine-ai/__tests__/phase3-eval.test.ts`
- Modify: `src/lib/engine-ai/eval/features.ts`
- Modify: `src/lib/engine-ai/eval/evaluate.ts`

- [ ] **Step 1: Write failing tactical tests**

Assert `searchBestMove()` prefers winning material, promotion, and king activity in small legal positions.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/lib/engine-ai/__tests__/phase3-eval.test.ts`

Expected: FAIL until evaluation features guide the search.

- [ ] **Step 3: Tune feature implementation minimally**

Adjust only Phase 3 weights/features, not search logic, unless a search bug is proven.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Expected: all pass with no warnings.

---

## Self-Review

- Spec coverage: Covers Phase 3 evaluation files, feature set, and tactical smoke tests.
- Placeholder scan: No TBD/TODO instructions.
- Type consistency: `evaluate()` remains the public centipawn score; `evaluateBreakdown()` is for diagnostics/tests.

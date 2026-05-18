# Engine AI Phase 2 Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working classical search layer to `src/lib/engine-ai/`: Zobrist hashing, transposition table, negamax alpha-beta, iterative deepening, move ordering, quiescence, and benchmark smoke coverage.

**Architecture:** Build search on top of the Phase 1 `FastState`, `generateFastMoves`, and `makeFastMove`/`unmakeFastMove` APIs. Keep evaluation intentionally small in Phase 2 (material plus simple advancement) so the search contract is stable before Phase 3 expands feature weights.

**Tech Stack:** TypeScript, Vitest, typed arrays, deterministic pseudo-random Zobrist keys, synchronous Node/browser-safe search.

---

## File Structure

- Create `src/lib/engine-ai/search/zobrist.ts`: deterministic 32-bit Zobrist hash for position keys.
- Create `src/lib/engine-ai/search/tt.ts`: fixed-size transposition table with depth-preferred replacement.
- Create `src/lib/engine-ai/eval/evaluate.ts`: minimal side-to-move evaluation for Phase 2.
- Create `src/lib/engine-ai/search/ordering.ts`: TT move, captures, promotion, history ordering.
- Create `src/lib/engine-ai/search/quiescence.ts`: capture-only leaf extension.
- Create `src/lib/engine-ai/search/negamax.ts`: alpha-beta search with nodes, TT and principal move.
- Create `src/lib/engine-ai/search/iterative.ts`: public `searchBestMove()` iterative deepening API.
- Create `src/lib/engine-ai/__tests__/phase2-search.test.ts`: hashing, TT, tactical search, iterative timing.
- Create `src/lib/engine-ai/__tests__/bench.ts`: manual benchmark helper.
- Modify `src/lib/engine-ai/index.ts`: export Phase 2 public APIs.

---

### Task 1: Hashing And Transposition Table

**Files:**
- Create: `src/lib/engine-ai/__tests__/phase2-search.test.ts`
- Create: `src/lib/engine-ai/search/zobrist.ts`
- Create: `src/lib/engine-ai/search/tt.ts`
- Modify: `src/lib/engine-ai/index.ts`

- [ ] **Step 1: Write failing tests**

Assert `computeZobrist(initialFastState())` is stable for equivalent states, changes after a legal move, restores after unmake, and that `TranspositionTable` stores/probes entries by key and prefers deeper entries.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/lib/engine-ai/__tests__/phase2-search.test.ts`

Expected: FAIL because Phase 2 APIs do not exist.

- [ ] **Step 3: Implement hashing and TT**

Use deterministic integer keys. Store entries with `key`, `depth`, `flag`, `score`, `bestMove`, and `age`. Replacement keeps deeper entries over shallower entries for the same slot.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/lib/engine-ai/__tests__/phase2-search.test.ts`

Expected: PASS for hashing and TT tests.

---

### Task 2: Evaluation And Search Core

**Files:**
- Modify: `src/lib/engine-ai/__tests__/phase2-search.test.ts`
- Create: `src/lib/engine-ai/eval/evaluate.ts`
- Create: `src/lib/engine-ai/search/ordering.ts`
- Create: `src/lib/engine-ai/search/quiescence.ts`
- Create: `src/lib/engine-ai/search/negamax.ts`
- Modify: `src/lib/engine-ai/index.ts`

- [ ] **Step 1: Write failing tests**

Assert evaluation is positive for side-to-move material advantage and negative for disadvantage. Assert `searchRoot()` finds an immediate forced capture and returns nodes/depth.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/lib/engine-ai/__tests__/phase2-search.test.ts`

Expected: FAIL because eval/search functions are missing.

- [ ] **Step 3: Implement minimal eval and negamax**

Use material values man=100, king=300, simple advancement bonus for men, terminal no-move loss, alpha-beta, TT probe/store, capture-aware quiescence, and basic move ordering.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/lib/engine-ai/__tests__/phase2-search.test.ts`

Expected: PASS.

---

### Task 3: Iterative Deepening And Bench

**Files:**
- Modify: `src/lib/engine-ai/__tests__/phase2-search.test.ts`
- Create: `src/lib/engine-ai/search/iterative.ts`
- Create: `src/lib/engine-ai/__tests__/bench.ts`
- Modify: `src/lib/engine-ai/index.ts`

- [ ] **Step 1: Write failing tests**

Assert `searchBestMove()` returns a legal move, completed depth, score, nodes, nps, elapsedMs, and a principal variation within a time budget.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/lib/engine-ai/__tests__/phase2-search.test.ts`

Expected: FAIL because iterative API is missing.

- [ ] **Step 3: Implement iterative deepening**

Complete depths 1..maxDepth until time budget expires. Return the last completed result. Poll time by node count. Keep the API synchronous and deterministic.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Expected: all pass with no warnings.

---

## Self-Review

- Spec coverage: Covers Phase 2 search, TT, Zobrist, ordering, quiescence, iterative deepening, and benchmark smoke. Phase 3 feature-rich evaluation is intentionally not included.
- Placeholder scan: No TBD/TODO instructions.
- Type consistency: `searchRoot()` is the fixed-depth internal/root API; `searchBestMove()` is the public iterative API.

# Engine AI Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the rules-correct fast TypeScript foundation for `src/lib/engine-ai/`.

**Architecture:** Keep the existing `src/lib/engine/` as the trusted UI/rules engine. Add a separate extractable `engine-ai` package area with `Uint8Array(32)` board storage, conversion at the boundary, encoded moves plus side capture metadata, make/unmake, and perft cross-checks against the existing engine.

**Tech Stack:** TypeScript, Vitest, existing Russian draughts rule engine, no Next.js APIs in this phase.

---

## File Structure

- Create `src/lib/engine-ai/types.ts`: shared fast-state, fast-move, undo, and piece constants.
- Create `src/lib/engine-ai/board/encoding.ts`: 1..32 square numbering and row/col conversion.
- Create `src/lib/engine-ai/board/fast-state.ts`: initial fast state, cloning, accessors, position key.
- Create `src/lib/engine-ai/board/convert.ts`: `GameState` to `FastState` and back.
- Create `src/lib/engine-ai/moves/generate.ts`: legal move generation on `FastState`.
- Create `src/lib/engine-ai/board/make-unmake.ts`: apply and revert `FastMove`.
- Create `src/lib/engine-ai/search/perft.ts`: leaf-node counter.
- Create `src/lib/engine-ai/index.ts`: public Phase 1 exports.
- Create `src/lib/engine-ai/__tests__/phase1.test.ts`: API, conversion, generation, make/unmake, and perft tests.
- Modify `.gitignore`: ignore raw downloaded PDN data while allowing committed derived engine data later.

---

### Task 1: Git Hygiene For Raw Data

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add raw PDN ignores**

Append:

```gitignore
# raw downloaded game data
/data/pdn/
```

- [ ] **Step 2: Verify ignored data**

Run: `git status --short --ignored data`

Expected: raw `data/pdn/` files show as ignored, not normal untracked files.

---

### Task 2: Encoding And Fast State Tests

**Files:**
- Create: `src/lib/engine-ai/__tests__/phase1.test.ts`
- Create: `src/lib/engine-ai/types.ts`
- Create: `src/lib/engine-ai/board/encoding.ts`
- Create: `src/lib/engine-ai/board/fast-state.ts`
- Create: `src/lib/engine-ai/index.ts`

- [ ] **Step 1: Write failing tests**

Test square round-trips, initial piece counts, and initial legal move count through the new API.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/engine-ai/__tests__/phase1.test.ts`

Expected: FAIL because `engine-ai` modules do not exist yet.

- [ ] **Step 3: Implement minimal encoding and fast state**

Use `Uint8Array(32)`, cell constants for white/black men/kings, `squareNumber`, `squareFromNumber`, `initialFastState`, `cloneFastState`, and count helpers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/engine-ai/__tests__/phase1.test.ts`

Expected: PASS for encoding and initial state tests.

---

### Task 3: Conversion Tests

**Files:**
- Modify: `src/lib/engine-ai/__tests__/phase1.test.ts`
- Create: `src/lib/engine-ai/board/convert.ts`
- Modify: `src/lib/engine-ai/index.ts`

- [ ] **Step 1: Write failing conversion tests**

Assert `fromGameState(initialState())` and `toGameState(fast)` preserve turn, clocks, ply, and all 24 initial pieces.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/engine-ai/__tests__/phase1.test.ts`

Expected: FAIL because conversion functions are missing.

- [ ] **Step 3: Implement conversion**

Convert only dark squares. Preserve `turn`, `halfmoveClock`, and `ply`. Initialize `history` empty and `repetitions` with the converted board key because AI internals do not carry UI history.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/engine-ai/__tests__/phase1.test.ts`

Expected: PASS.

---

### Task 4: Move Generation Tests

**Files:**
- Modify: `src/lib/engine-ai/__tests__/phase1.test.ts`
- Create: `src/lib/engine-ai/moves/generate.ts`
- Modify: `src/lib/engine-ai/index.ts`

- [ ] **Step 1: Write failing move-generation tests**

Compare generated move notations for:
- initial position,
- mandatory capture,
- backward man capture,
- flying king capture,
- mid-chain promotion.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/engine-ai/__tests__/phase1.test.ts`

Expected: FAIL because move generation is missing.

- [ ] **Step 3: Implement minimal correct generation**

Generate moves on `FastState`, using DFS for captures. For Phase 1 correctness, allocations inside generation are acceptable; search optimization comes after perft is green.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/engine-ai/__tests__/phase1.test.ts`

Expected: PASS.

---

### Task 5: Make/Unmake And Perft Tests

**Files:**
- Modify: `src/lib/engine-ai/__tests__/phase1.test.ts`
- Create: `src/lib/engine-ai/board/make-unmake.ts`
- Create: `src/lib/engine-ai/search/perft.ts`
- Modify: `src/lib/engine-ai/index.ts`

- [ ] **Step 1: Write failing tests**

Assert a simple move and capture can be made and unmade back to the original fast position key. Compare fast `perft` against trusted existing-engine `perft` for depth 1..4 from initial position and selected tactical positions.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/engine-ai/__tests__/phase1.test.ts`

Expected: FAIL because make/unmake and perft are missing.

- [ ] **Step 3: Implement make/unmake and perft**

Use full move metadata for captured squares and path. Store undo with prior cell values, clocks, ply, turn, and captured cells.

- [ ] **Step 4: Run focused and full tests**

Run: `npm test -- src/lib/engine-ai/__tests__/phase1.test.ts`

Run: `npm test`

Expected: all tests PASS.

---

## Self-Review

- Spec coverage: Covers Phase 1 fast board, conversion, generation, make/unmake, and perft gate. Search/eval/review/cloud batch are intentionally out of this plan.
- Placeholder scan: No TBD/TODO steps.
- Type consistency: Public Phase 1 names are defined before use through `src/lib/engine-ai/index.ts`.

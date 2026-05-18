# Board Feel + Play Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/play` feel like a real DamaDojo arena with product-first mode hierarchy and better board feedback.

**Architecture:** Add tested pure metadata/helpers, then wire them into client UI components. Keep current rule engine untouched except for read-only helper use.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Zustand, Vitest.

---

### Task 1: Mode Metadata And Capture Helpers

**Files:**
- Create: `src/lib/play-modes.ts`
- Test: `src/lib/__tests__/play-modes.test.ts`
- Modify: `src/stores/game-store.ts`

- [ ] Write tests for mode order and local mode position.
- [ ] Add `PLAY_MODES` with `online`, `bot`, `coach`, `friend`, `local`.
- [ ] Add `forcedCaptureSquares()` helper that returns only pieces with legal captures.
- [ ] Run `npm test`.

### Task 2: Play Hub Panel

**Files:**
- Create: `src/components/game/play-hub-panel.tsx`
- Modify: `src/app/play/page.tsx`

- [ ] Render mode cards in the approved order.
- [ ] Make online the primary visual card.
- [ ] Put local under the friend utility group.
- [ ] On mode click, set active mode, reset board, and play `game-start`.

### Task 3: Board Feel Polish

**Files:**
- Modify: `src/components/board/board-cell.tsx`
- Modify: `src/components/board/game-board.tsx`
- Modify: `src/lib/sounds.ts`
- Modify: `src/app/play/page.tsx`

- [ ] Add `forced-capture` cell state.
- [ ] Highlight mandatory capture pieces immediately before selection.
- [ ] Increase move, capture, and game-start sound presence.
- [ ] Change player clocks from `-` to `3:00`.

### Task 4: Verification

**Files:**
- No new production files.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Reload `/play` in the in-app browser and check hub, board, timers, and capture highlight.


# Ata Review Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first code-backed Ata coach layer: structured review context, safe prompt input, fallback lines, and post-game teaser data.

**Architecture:** Keep engine analysis authoritative. Add a focused `src/lib/coach/ata.ts` module that converts `ReviewedMove` / `GameReview` into safe Ata-facing context and UI teaser data. Update the Featherless prompt builder to send structured engine facts instead of loose bracket text, and keep React UI changes small.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Vitest, existing `engine-ai/review` types, existing Featherless route handlers.

---

## File Structure

- Create `src/lib/coach/ata.ts`
  - Ata-specific types, fallback line banks, review context builder, post-game teaser builder.
- Create `src/lib/coach/__tests__/ata.test.ts`
  - Unit tests for context building, fallback behavior, and teaser stat selection.
- Modify `src/lib/coach/featherless.ts`
  - Use `AtaReviewContext` for review mode and generate strict ENGINE_FACTS prompt.
- Modify `src/hooks/use-coach-comment.ts`
  - Send `AtaReviewContext` with the existing move payload.
- Modify `src/components/game/end-game-modal.tsx`
  - Match the desired teaser hierarchy: result top, Ata speech, three counters, `Отчет о партии`, then `Новая партия` and `Реванш`.
- Modify callers in `src/app/play/page.tsx` and `src/app/r/[id]/page.tsx` only if the modal prop contract changes.

---

### Task 1: Ata Review Context Module

**Files:**
- Create: `src/lib/coach/ata.ts`
- Test: `src/lib/coach/__tests__/ata.test.ts`

- [ ] **Step 1: Write failing tests for move context**

```ts
import { describe, expect, it } from "vitest";
import { buildAtaMoveReviewContext } from "../ata";
import type { ReviewedMove } from "@/lib/engine-ai/review/index";

function reviewedMove(overrides: Partial<ReviewedMove> = {}): ReviewedMove {
  return {
    ply: 7,
    moveNumber: 4,
    side: "white",
    notation: "h5xd5",
    moveClass: "blunder",
    motif: {
      motif: "wrong_capture_route",
      description: "Played 1-capture chain when a 2-capture chain was available",
    },
    evalBefore: 120,
    evalAfter: -220,
    wpDelta: 0.31,
    wpBefore: 0.61,
    wpAfter: 0.3,
    bestMove: {
      from: { row: 5, col: 6 },
      to: { row: 4, col: 5 },
      path: [{ row: 4, col: 5 }],
      captures: [],
      promoted: false,
    },
    bestLine: [],
    playedMove: {
      from: { row: 3, col: 0 },
      to: { row: 5, col: 2 },
      path: [{ row: 5, col: 2 }],
      captures: [{ row: 4, col: 1 }],
      promoted: false,
    },
    searchDepth: 4,
    ...overrides,
  };
}

describe("buildAtaMoveReviewContext", () => {
  it("builds engine-fact context from a reviewed blunder", () => {
    const context = buildAtaMoveReviewContext(reviewedMove(), 20);

    expect(context.mode).toBe("move_review");
    expect(context.moveClass).toBe("blunder");
    expect(context.phase).toBe("middlegame");
    expect(context.playedMove).toBe("h5xd5");
    expect(context.bestMove).toBe("g3-f4");
    expect(context.lessonTag).toBe("capture");
    expect(context.confidence).toBe("high");
    expect(context.facts.join(" ")).toContain("capture route");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/coach/__tests__/ata.test.ts`

Expected: FAIL because `src/lib/coach/ata.ts` does not exist.

- [ ] **Step 3: Implement context types and builder**

```ts
import type { GameReview, ReviewedMove } from "@/lib/engine-ai/review/index";
import type { MoveClass } from "@/lib/engine-ai/review/classify";
import type { Move } from "@/lib/engine";

export type AtaReviewMode = "post_game_teaser" | "move_review" | "final_review" | "live_hint";
export type AtaTone = "calm" | "strict" | "proud" | "warning";
export type AtaLessonTag = "tempo" | "center" | "capture" | "king" | "endgame" | "trap" | "calculation" | "defense";

export interface AtaReviewContext {
  mode: AtaReviewMode;
  moveNumber?: number;
  side?: "white" | "black";
  phase?: "opening" | "middlegame" | "endgame";
  playedMove?: string;
  bestMove?: string;
  bestLine?: string[];
  moveClass?: MoveClass;
  motif?: string;
  lessonTag: AtaLessonTag;
  facts: string[];
  counts?: Partial<Record<MoveClass, number>>;
  result?: "win" | "loss" | "draw";
  confidence: "high" | "medium" | "low";
}

export function buildAtaMoveReviewContext(move: ReviewedMove, totalMoves: number): AtaReviewContext {
  const phase = phaseOf(move.moveNumber, totalMoves);
  const lessonTag = lessonTagForMove(move);
  const facts = factsForMove(move);
  return {
    mode: "move_review",
    moveNumber: move.moveNumber,
    side: move.side,
    phase,
    playedMove: move.notation,
    bestMove: move.bestMove ? moveToNotation(move.bestMove) : undefined,
    bestLine: move.bestLine.map(moveToNotation),
    moveClass: move.moveClass,
    motif: move.motif?.motif,
    lessonTag,
    facts,
    confidence: confidenceForMove(move, facts),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/coach/__tests__/ata.test.ts`

Expected: PASS.

---

### Task 2: Fallback Lines and Teaser Data

**Files:**
- Modify: `src/lib/coach/ata.ts`
- Test: `src/lib/coach/__tests__/ata.test.ts`

- [ ] **Step 1: Write failing tests for teaser stats**

```ts
import { buildAtaPostGameTeaser } from "../ata";
import type { GameReview } from "@/lib/engine-ai/review/index";

it("selects the three most interesting post-game stats", () => {
  const review = {
    stats: {
      white: { brilliant: 1, great: 0, best: 2, excellent: 0, good: 3, book: 4, inaccuracy: 0, mistake: 1, blunder: 0, miss: 0 },
      black: { brilliant: 0, great: 1, best: 1, excellent: 0, good: 1, book: 2, inaccuracy: 0, mistake: 0, blunder: 1, miss: 0 },
    },
  } as GameReview;

  const teaser = buildAtaPostGameTeaser({
    result: "loss",
    review,
    side: "white",
  });

  expect(teaser.stats.map((s) => s.kind)).toEqual(["brilliant", "best", "mistake"]);
  expect(teaser.ctaLabel).toBe("Отчет о партии");
  expect(teaser.line).toContain("не в твою пользу");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/coach/__tests__/ata.test.ts`

Expected: FAIL because `buildAtaPostGameTeaser` is missing.

- [ ] **Step 3: Implement fallback lines and teaser builder**

```ts
export interface AtaTeaserStat {
  kind: MoveClass;
  label: string;
  value: number;
  tone: "good" | "warn" | "bad";
}

export interface AtaPostGameTeaser {
  result: "win" | "loss" | "draw";
  line: string;
  stats: AtaTeaserStat[];
  ctaLabel: "Отчет о партии";
}

export function buildAtaPostGameTeaser(input: {
  result: "win" | "loss" | "draw";
  review?: Pick<GameReview, "stats"> | null;
  side?: "white" | "black";
}): AtaPostGameTeaser {
  const counts = input.review?.stats[input.side ?? "white"] ?? {};
  return {
    result: input.result,
    line: pickTeaserLine(input.result),
    stats: selectAtaTeaserStats(counts),
    ctaLabel: "Отчет о партии",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/coach/__tests__/ata.test.ts`

Expected: PASS.

---

### Task 3: Prompt Contract

**Files:**
- Modify: `src/lib/coach/featherless.ts`
- Modify: `src/hooks/use-coach-comment.ts`
- Test: `src/lib/coach/__tests__/ata.test.ts`

- [ ] **Step 1: Write failing tests for prompt serialization**

```ts
import { buildAtaCoachUserMessage } from "../ata";

it("serializes engine facts without raw eval jargon", () => {
  const message = buildAtaCoachUserMessage({
    mode: "move_review",
    moveNumber: 4,
    side: "white",
    phase: "middlegame",
    playedMove: "h5xd5",
    bestMove: "g3-f4",
    bestLine: ["g3-f4", "b6-a5"],
    moveClass: "blunder",
    motif: "wrong_capture_route",
    lessonTag: "capture",
    facts: ["Player chose a weaker capture route."],
    confidence: "high",
  });

  expect(message).toContain("ENGINE_FACTS:");
  expect(message).toContain("Player chose a weaker capture route.");
  expect(message).not.toContain("eval");
  expect(message).not.toContain("centipawn");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/coach/__tests__/ata.test.ts`

Expected: FAIL because `buildAtaCoachUserMessage` is missing.

- [ ] **Step 3: Implement prompt serialization and wire request body**

Use `buildAtaMoveReviewContext(move, totalMoves)` in `useCoachComment` and send it as `ataContext`.

In `featherless.ts`, prefer `req.ataContext` for review comments:

```ts
const user = req.ataContext
  ? buildAtaCoachUserMessage(req.ataContext)
  : buildUserMessage(situation, locale);
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/coach/__tests__/ata.test.ts`

Expected: PASS.

---

### Task 4: End-Game Teaser Modal Layout

**Files:**
- Modify: `src/components/game/end-game-modal.tsx`

- [ ] **Step 1: Preserve the existing props and restyle the hierarchy**

Keep:

```ts
onReview?: () => void;
onRematch?: () => void;
stats?: ReadonlyArray<{ label: string; value: number | string; tone: "good" | "warn" | "bad" }>;
```

Change visible CTA text from `Разобрать партию` to `Отчет о партии`.

Add a secondary `Новая партия` button when `onDismiss` exists, while keeping `Реванш` as the second action when `onRematch` exists.

- [ ] **Step 2: Run focused validation**

Run: `npm run lint`

Expected: no lint errors from the modal.

---

### Task 5: Final Verification

- [ ] Run unit tests:

```bash
npm test -- src/lib/coach/__tests__/ata.test.ts
```

- [ ] Run relevant review tests:

```bash
npm test -- src/lib/engine-ai/__tests__/review.test.ts
```

- [ ] Run lint:

```bash
npm run lint
```

- [ ] Commit:

```bash
git add src/lib/coach src/hooks/use-coach-comment.ts src/components/game/end-game-modal.tsx docs/superpowers/plans/2026-05-18-ata-review-phase-1.md
git commit -m "Implement Ata review context phase one"
```


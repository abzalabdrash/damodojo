import { describe, expect, it } from "vitest";

import {
  buildAtaCoachUserMessage,
  buildAtaMoveReviewContext,
  buildAtaPostGameTeaser,
} from "../ata";
import type { GameReview, ReviewedMove } from "@/lib/engine-ai/review/index";

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

function reviewWithStats(stats: GameReview["stats"]): GameReview {
  return {
    moves: [],
    accuracy: { white: 72, black: 84 },
    stats,
    keyMoves: [],
    elapsedMs: 120,
  };
}

describe("buildAtaMoveReviewContext", () => {
  it("builds engine-fact context from a reviewed blunder", () => {
    const context = buildAtaMoveReviewContext(reviewedMove({ moveNumber: 8 }), 20);

    expect(context.mode).toBe("move_review");
    expect(context.moveClass).toBe("blunder");
    expect(context.phase).toBe("middlegame");
    expect(context.playedMove).toBe("h5xd5");
    expect(context.bestMove).toBe("g3-f4");
    expect(context.lessonTag).toBe("capture");
    expect(context.confidence).toBe("high");
    expect(context.facts.join(" ")).toContain("capture route");
  });

  it("uses cautious low-confidence context when the move has little engine detail", () => {
    const context = buildAtaMoveReviewContext(
      reviewedMove({
        moveClass: "good",
        motif: null,
        bestMove: null,
        bestLine: [],
        wpDelta: 0.02,
      }),
      20
    );

    expect(context.confidence).toBe("low");
    expect(context.lessonTag).toBe("tempo");
    expect(context.facts).toContain("Engine did not provide a concrete tactical motif for this move.");
  });
});

describe("buildAtaPostGameTeaser", () => {
  it("selects the three most interesting post-game stats", () => {
    const review = reviewWithStats({
      white: {
        brilliant: 1,
        great: 0,
        best: 2,
        excellent: 0,
        good: 3,
        book: 4,
        inaccuracy: 0,
        mistake: 1,
        blunder: 0,
        miss: 0,
      },
      black: {
        brilliant: 0,
        great: 1,
        best: 1,
        excellent: 0,
        good: 1,
        book: 2,
        inaccuracy: 0,
        mistake: 0,
        blunder: 1,
        miss: 0,
      },
    });

    const teaser = buildAtaPostGameTeaser({
      result: "loss",
      review,
      side: "white",
    });

    expect(teaser.stats.map((s) => s.kind)).toEqual(["brilliant", "best", "mistake"]);
    expect(teaser.ctaLabel).toBe("Отчет о партии");
    expect(teaser.line).toContain("не в твою пользу");
  });

  it("falls back to useful default stats before full review is ready", () => {
    const teaser = buildAtaPostGameTeaser({ result: "draw" });

    expect(teaser.stats).toHaveLength(3);
    expect(teaser.stats[0]?.label).toBe("Лучший");
    expect(teaser.line).toContain("Ничья");
  });
});

describe("buildAtaCoachUserMessage", () => {
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
    expect(message).toContain("MOVE_CLASS: blunder");
    expect(message).not.toContain("eval");
    expect(message).not.toContain("centipawn");
  });
});

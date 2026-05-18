import { describe, it, expect } from "vitest";
import { winProbability, winProbDelta, computeAccuracy } from "../review/winprob";
import { classifyMove } from "../review/classify";
import { computeGameAccuracy } from "../review/accuracy";
import { initialFastState } from "../board/fast-state";
import { generateFastMoves } from "../moves/generate";
import { makeFastMove } from "../board/make-unmake";
import { reviewGame } from "../review/index";

// ---------------------------------------------------------------------------
// winprob
// ---------------------------------------------------------------------------

describe("winProbability", () => {
  it("returns 0.5 for eval 0", () => {
    expect(winProbability(0)).toBeCloseTo(0.5, 3);
  });

  it("returns > 0.5 for positive eval", () => {
    expect(winProbability(300)).toBeGreaterThan(0.5);
    expect(winProbability(600)).toBeGreaterThan(winProbability(300));
  });

  it("returns < 0.5 for negative eval", () => {
    expect(winProbability(-300)).toBeLessThan(0.5);
  });

  it("is symmetric around 0", () => {
    expect(winProbability(300)).toBeCloseTo(1 - winProbability(-300), 6);
  });
});

describe("winProbDelta", () => {
  it("returns positive delta for a bad move (eval drops)", () => {
    // evalBefore=100 (winning), evalAfter=-100 (losing)
    expect(winProbDelta(100, -100)).toBeGreaterThan(0);
  });

  it("returns 0 for unchanged eval", () => {
    expect(winProbDelta(50, 50)).toBeCloseTo(0, 6);
  });
});

describe("computeAccuracy", () => {
  it("returns 100 for empty move list", () => {
    expect(computeAccuracy([])).toBe(100);
  });

  it("returns lower value for large deltas", () => {
    const perfect = computeAccuracy([0, 0, 0, 0]);
    const bad = computeAccuracy([0.3, 0.3, 0.3, 0.3]);
    expect(perfect).toBeGreaterThan(bad);
  });

  it("clamps to [0, 100]", () => {
    expect(computeAccuracy([1, 1, 1, 1, 1])).toBeGreaterThanOrEqual(0);
    expect(computeAccuracy([0, 0, 0, 0, 0])).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// classify
// ---------------------------------------------------------------------------

describe("classifyMove", () => {
  const baseInput = {
    evalBefore: 50,
    evalBest: 50,
    evalSecondBest: null,
    isSacrifice: false,
    opponentBlundered: false,
    isBook: false,
  };

  function makeMove(fromIndex: number, toIndex: number) {
    return {
      from: { row: 0, col: 0 },
      to: { row: 0, col: 0 },
      fromIndex,
      toIndex,
      path: [],
      pathIndices: [],
      captures: [],
      captureIndices: [],
      promoted: false,
    };
  }

  const bestMove = makeMove(0, 1);
  const otherMove = makeMove(2, 3);

  it("classifies played=best as 'best'", () => {
    const r = classifyMove({ ...baseInput, evalAfter: 50, bestMove, playedMove: bestMove });
    expect(r.moveClass).toBe("best");
  });

  it("classifies as 'book' when isBook=true", () => {
    const r = classifyMove({ ...baseInput, evalAfter: 50, bestMove, playedMove: bestMove, isBook: true });
    expect(r.moveClass).toBe("book");
  });

  it("classifies small delta as 'excellent'", () => {
    // delta < 0.02: need evalAfter very close to evalBefore
    const r = classifyMove({ ...baseInput, evalAfter: 49, bestMove, playedMove: otherMove });
    expect(r.moveClass).toBe("excellent");
  });

  it("classifies large delta as 'blunder'", () => {
    // evalBefore=100 (wp≈0.578), evalAfter=-500 (wp≈0.119) → delta≈0.459
    const r = classifyMove({ ...baseInput, evalBefore: 100, evalAfter: -500, bestMove, playedMove: otherMove });
    expect(r.moveClass).toBe("blunder");
  });

  it("classifies as 'miss' when opponent blundered and player didn't punish", () => {
    // opponentBlundered=true, large delta
    const r = classifyMove({
      ...baseInput,
      evalBefore: 100, evalAfter: -200,
      bestMove, playedMove: otherMove,
      opponentBlundered: true,
    });
    expect(r.moveClass).toBe("miss");
  });
});

// ---------------------------------------------------------------------------
// computeGameAccuracy
// ---------------------------------------------------------------------------

describe("computeGameAccuracy", () => {
  it("returns accuracy for both sides", () => {
    const moves = [
      { side: "white" as const, moveClass: "best" as const, wpDelta: 0 },
      { side: "black" as const, moveClass: "blunder" as const, wpDelta: 0.4 },
      { side: "white" as const, moveClass: "good" as const, wpDelta: 0.03 },
      { side: "black" as const, moveClass: "best" as const, wpDelta: 0 },
    ];
    const acc = computeGameAccuracy(moves);
    expect(acc.white.accuracy).toBeGreaterThan(acc.black.accuracy);
    expect(acc.white.best).toBe(1);
    expect(acc.black.blunder).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// reviewGame (integration smoke test, shallow depth)
// ---------------------------------------------------------------------------

describe("reviewGame (integration)", () => {
  it("reviews a 4-ply game without throwing", () => {
    const states = [initialFastState()];
    const moves = [];

    // Play 4 half-moves from initial position
    const current = initialFastState();
    for (let i = 0; i < 4; i++) {
      const legal = generateFastMoves(current);
      if (legal.length === 0) break;
      const move = legal[0];
      moves.push(move);
      makeFastMove(current, move);
      states.push({
        cells: new Uint8Array(current.cells),
        turn: current.turn,
        halfmoveClock: current.halfmoveClock,
        ply: current.ply,
        repetitionStack: [...current.repetitionStack],
        endgame: current.endgame ? { ...current.endgame } : null,
      });
    }

    const review = reviewGame(states, moves, { depth: 3, timeMs: 200 });

    expect(review.moves.length).toBe(moves.length);
    expect(review.accuracy.white).toBeGreaterThanOrEqual(0);
    expect(review.accuracy.white).toBeLessThanOrEqual(100);
    expect(review.accuracy.black).toBeGreaterThanOrEqual(0);
    for (const rm of review.moves) {
      expect(rm.moveClass).toBeDefined();
      expect(rm.wpDelta).toBeGreaterThanOrEqual(-0.5); // reasonable range
      expect(rm.notation).toMatch(/^[a-h][1-8][x\-][a-h][1-8]/);
    }
  });
});

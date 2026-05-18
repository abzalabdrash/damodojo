import { describe, expect, it } from "vitest";

import {
  TTFlag,
  TranspositionTable,
  computeZobrist,
  evaluate,
  fastPositionKey,
  fromGameState,
  generateFastMoves,
  initialFastState,
  makeFastMove,
  searchBestMove,
  searchRoot,
  unmakeFastMove,
} from "../index";
import type { GameState, Piece } from "@/lib/engine";

describe("engine-ai zobrist hashing", () => {
  it("computes stable hashes for equivalent positions", () => {
    const a = initialFastState();
    const b = initialFastState();

    expect(computeZobrist(a)).toBe(computeZobrist(b));
  });

  it("changes after a move and restores after unmake", () => {
    const state = initialFastState();
    const beforeHash = computeZobrist(state);
    const beforeKey = fastPositionKey(state);
    const move = generateFastMoves(state)[0];
    const undo = makeFastMove(state, move);

    expect(computeZobrist(state)).not.toBe(beforeHash);

    unmakeFastMove(state, undo);

    expect(fastPositionKey(state)).toBe(beforeKey);
    expect(computeZobrist(state)).toBe(beforeHash);
  });
});

describe("engine-ai transposition table", () => {
  it("stores and probes entries by key", () => {
    const tt = new TranspositionTable(16);
    const state = initialFastState();
    const key = computeZobrist(state);
    const move = generateFastMoves(state)[0];

    tt.store(key, {
      depth: 3,
      flag: TTFlag.Exact,
      score: 42,
      bestMove: move,
    });

    expect(tt.probe(key)).toMatchObject({
      depth: 3,
      flag: TTFlag.Exact,
      score: 42,
      bestMove: move,
    });
  });

  it("keeps deeper entries over shallow replacements in the same slot", () => {
    const tt = new TranspositionTable(1);
    const state = initialFastState();
    const key = computeZobrist(state);
    const move = generateFastMoves(state)[0];

    tt.store(key, {
      depth: 5,
      flag: TTFlag.Lower,
      score: 100,
      bestMove: move,
    });
    tt.store(key, {
      depth: 2,
      flag: TTFlag.Upper,
      score: -100,
      bestMove: null,
    });

    expect(tt.probe(key)).toMatchObject({
      depth: 5,
      flag: TTFlag.Lower,
      score: 100,
    });
  });
});

function stateFrom(
  pieces: Array<{ row: number; col: number; piece: Piece }>,
  turn: "w" | "b" = "w"
): GameState {
  const board = Array.from({ length: 8 }, () =>
    Array.from<Piece | null>({ length: 8 }).fill(null)
  );
  for (const { row, col, piece } of pieces) board[row][col] = piece;
  return {
    board,
    turn,
    halfmoveClock: 0,
    ply: 0,
    history: [],
    repetitions: new Map(),
    endgame: null,
  };
}

function man(color: "w" | "b"): Piece {
  return { color, king: false };
}

describe("engine-ai evaluation and fixed-depth search", () => {
  it("evaluates material from the side-to-move perspective", () => {
    const whiteAhead = fromGameState(
      stateFrom(
        [
          { row: 5, col: 0, piece: man("w") },
          { row: 5, col: 2, piece: man("w") },
          { row: 2, col: 1, piece: man("b") },
        ],
        "w"
      )
    );
    const blackToMoveSameBoard = { ...whiteAhead, turn: 1 as const };

    expect(evaluate(whiteAhead)).toBeGreaterThan(0);
    expect(evaluate(blackToMoveSameBoard)).toBeLessThan(0);
  });

  it("searchRoot finds an immediate forced capture", () => {
    const state = fromGameState(
      stateFrom(
        [
          { row: 5, col: 2, piece: man("w") },
          { row: 4, col: 3, piece: man("b") },
          { row: 2, col: 7, piece: man("b") },
        ],
        "w"
      )
    );

    const result = searchRoot(state, { depth: 3 });

    expect(result.bestMove).not.toBeNull();
    expect(result.bestMove?.captures).toHaveLength(1);
    expect(result.bestMove?.to).toEqual({ row: 3, col: 4 });
    expect(result.depth).toBe(3);
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("engine-ai iterative deepening", () => {
  it("returns the last completed search result with timing stats", () => {
    const state = initialFastState();
    const result = searchBestMove(state, { maxDepth: 4, timeMs: 500, useBook: false });

    expect(result.bestMove).not.toBeNull();
    expect(generateFastMoves(state)).toContainEqual(result.bestMove);
    expect(result.depth).toBeGreaterThanOrEqual(1);
    expect(result.depth).toBeLessThanOrEqual(4);
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.nps).toBeGreaterThan(0);
    expect(result.pv.length).toBeGreaterThan(0);
  });
});

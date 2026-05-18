import { describe, expect, it } from "vitest";

import { positionKey as publicPositionKey, type GameState, type Piece } from "@/lib/engine";

import {
  evaluate,
  evaluateBreakdown,
  fromGameState,
  searchBestMove,
} from "../index";

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
    repetitions: new Map([[publicPositionKey(board, turn), 1]]),
    endgame: null,
  };
}

function man(color: "w" | "b"): Piece {
  return { color, king: false };
}

function king(color: "w" | "b"): Piece {
  return { color, king: true };
}

describe("engine-ai phase 3 evaluation features", () => {
  it("exposes a breakdown and rewards material", () => {
    const state = fromGameState(
      stateFrom(
        [
          { row: 5, col: 0, piece: man("w") },
          { row: 5, col: 2, piece: man("w") },
          { row: 2, col: 1, piece: man("b") },
        ],
        "w"
      )
    );
    const breakdown = evaluateBreakdown(state);

    expect(breakdown.material).toBeGreaterThan(0);
    expect(evaluate(state)).toBeGreaterThan(90);
  });

  it("rewards advanced men more than home-row men", () => {
    const advanced = fromGameState(
      stateFrom(
        [
          { row: 2, col: 1, piece: man("w") },
          { row: 2, col: 3, piece: man("b") },
        ],
        "w"
      )
    );
    const home = fromGameState(
      stateFrom(
        [
          { row: 6, col: 1, piece: man("w") },
          { row: 2, col: 3, piece: man("b") },
        ],
        "w"
      )
    );

    expect(evaluate(advanced)).toBeGreaterThan(evaluate(home));
  });

  it("rewards back-rank guards in middlegame", () => {
    const guarded = fromGameState(
      stateFrom(
        [
          { row: 7, col: 0, piece: man("w") },
          { row: 5, col: 2, piece: man("w") },
          { row: 0, col: 1, piece: man("b") },
          { row: 2, col: 3, piece: man("b") },
        ],
        "w"
      )
    );
    const broken = fromGameState(
      stateFrom(
        [
          { row: 6, col: 1, piece: man("w") },
          { row: 5, col: 2, piece: man("w") },
          { row: 0, col: 1, piece: man("b") },
          { row: 2, col: 3, piece: man("b") },
        ],
        "w"
      )
    );

    expect(evaluate(guarded)).toBeGreaterThan(evaluate(broken));
  });

  it("rewards active kings on the long diagonal and penalizes trapped kings", () => {
    const active = fromGameState(
      stateFrom(
        [
          { row: 3, col: 4, piece: king("w") },
          { row: 0, col: 1, piece: king("b") },
        ],
        "w"
      )
    );
    const trapped = fromGameState(
      stateFrom(
        [
          { row: 7, col: 0, piece: king("w") },
          { row: 6, col: 1, piece: man("b") },
          { row: 0, col: 1, piece: king("b") },
        ],
        "w"
      )
    );

    expect(evaluate(active)).toBeGreaterThan(evaluate(trapped));
  });
});

describe("engine-ai phase 3 tactical smoke", () => {
  it("search prefers a promotion move in a quiet race", () => {
    const state = fromGameState(
      stateFrom(
        [
          { row: 1, col: 2, piece: man("w") },
          { row: 5, col: 2, piece: man("b") },
        ],
        "w"
      )
    );

    const result = searchBestMove(state, { maxDepth: 3, timeMs: 500 });

    expect(result.bestMove?.to).toEqual({ row: 0, col: 1 });
    expect(result.bestMove?.promoted).toBe(true);
  });

  it("search prefers winning material with a forced capture", () => {
    const state = fromGameState(
      stateFrom(
        [
          { row: 5, col: 2, piece: man("w") },
          { row: 4, col: 3, piece: man("b") },
          { row: 1, col: 6, piece: man("b") },
        ],
        "w"
      )
    );

    const result = searchBestMove(state, { maxDepth: 4, timeMs: 500 });

    expect(result.bestMove?.captures).toHaveLength(1);
    expect(result.score).toBeGreaterThan(0);
  });
});

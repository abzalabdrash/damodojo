import { describe, expect, it } from "vitest";

import {
  applyMove,
  emptyBoard,
  getLegalMoves,
  getResult,
  positionKey,
} from "../index";
import {
  detectEndgameRule,
  isOnLongDiagonal,
} from "../endgame-rules";
import type { GameState, Piece } from "../index";

function king(color: "w" | "b"): Piece {
  return { color, king: true };
}

function stateFrom(
  pieces: Array<{ row: number; col: number; piece: Piece }>,
  turn: "w" | "b" = "w"
): GameState {
  const b = emptyBoard();
  for (const { row, col, piece } of pieces) b[row][col] = piece;
  return {
    board: b,
    turn,
    halfmoveClock: 0,
    ply: 0,
    history: [],
    repetitions: new Map([[positionKey(b, turn), 1]]),
    endgame: null,
  };
}

describe("FMJD endgame draw rules", () => {
  it("a1-h8 long diagonal squares are the dark diagonal", () => {
    expect(isOnLongDiagonal(7, 0)).toBe(true); // a1
    expect(isOnLongDiagonal(6, 1)).toBe(true);
    expect(isOnLongDiagonal(0, 7)).toBe(true); // h8
    expect(isOnLongDiagonal(7, 7)).toBe(false); // not the dark long diagonal
    expect(isOnLongDiagonal(0, 0)).toBe(false);
  });

  it("detects 3 kings vs 1 king as kings_3v1", () => {
    // 3 white kings vs 1 black king (not on the long diagonal)
    const state = stateFrom([
      { row: 5, col: 0, piece: king("w") },
      { row: 5, col: 2, piece: king("w") },
      { row: 5, col: 4, piece: king("w") },
      { row: 1, col: 0, piece: king("b") }, // (1,0): row+col=1 ≠ 7 → not on long diag
    ]);
    const rule = detectEndgameRule(state.board);
    expect(rule).toEqual({ kind: "kings_3v1", weak: "b" });
  });

  it("detects long_diag when the lone king is on the long diagonal", () => {
    // 3 white kings vs 1 black king on long diagonal (3,4)
    const state = stateFrom([
      { row: 5, col: 0, piece: king("w") },
      { row: 5, col: 2, piece: king("w") },
      { row: 5, col: 4, piece: king("w") },
      { row: 3, col: 4, piece: king("b") }, // long diagonal
    ]);
    const rule = detectEndgameRule(state.board);
    expect(rule).toEqual({ kind: "long_diag", weak: "b" });
  });

  it("returns null when material does not match either rule", () => {
    // 2 kings vs 1 king — not enough strong side
    const state = stateFrom([
      { row: 5, col: 0, piece: king("w") },
      { row: 5, col: 2, piece: king("w") },
      { row: 3, col: 4, piece: king("b") },
    ]);
    expect(detectEndgameRule(state.board)).toBeNull();
  });

  it("increments endgame counter while the same rule stays active", () => {
    // 3W kings vs 1B king. Drift the white kings without capturing — counter ticks up.
    let state = stateFrom(
      [
        { row: 5, col: 0, piece: king("w") },
        { row: 5, col: 2, piece: king("w") },
        { row: 5, col: 4, piece: king("w") },
        { row: 1, col: 0, piece: king("b") },
      ],
      "w"
    );
    // Apply the first available move; the counter should become 1.
    const m1 = getLegalMoves(state)[0];
    expect(m1).toBeDefined();
    state = applyMove(state, m1);
    expect(state.endgame).not.toBeNull();
    expect(state.endgame?.rule.kind).toBe("kings_3v1");
    expect(state.endgame?.plies).toBe(1);
  });

  it("declares draw once kings_3v1 counter hits 30 ply", () => {
    let state = stateFrom(
      [
        { row: 5, col: 0, piece: king("w") },
        { row: 5, col: 2, piece: king("w") },
        { row: 5, col: 4, piece: king("w") },
        { row: 1, col: 0, piece: king("b") },
      ],
      "w"
    );
    // Force-feed the counter to its limit and verify getResult reports the draw.
    state = { ...state, endgame: { rule: { kind: "kings_3v1", weak: "b" }, plies: 30 } };
    const result = getResult(state);
    expect(result).toEqual({ kind: "draw", reason: "endgame_3v1_kings" });
  });

  it("declares draw once long_diag counter hits 10 ply", () => {
    let state = stateFrom(
      [
        { row: 5, col: 0, piece: king("w") },
        { row: 5, col: 2, piece: king("w") },
        { row: 5, col: 4, piece: king("w") },
        { row: 3, col: 4, piece: king("b") },
      ],
      "w"
    );
    state = { ...state, endgame: { rule: { kind: "long_diag", weak: "b" }, plies: 10 } };
    const result = getResult(state);
    expect(result).toEqual({ kind: "draw", reason: "endgame_long_diagonal" });
  });
});

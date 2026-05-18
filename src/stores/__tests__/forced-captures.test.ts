import { describe, expect, it } from "vitest";

import { emptyBoard, positionKey } from "@/lib/engine";
import type { GameState, Piece } from "@/lib/engine";

import { forcedCaptureSquares } from "../game-store";

function stateFrom(
  pieces: Array<{ row: number; col: number; piece: Piece }>,
  turn: "w" | "b" = "w"
): GameState {
  const board = emptyBoard();
  for (const { row, col, piece } of pieces) board[row][col] = piece;
  return {
    board,
    turn,
    halfmoveClock: 0,
    ply: 0,
    history: [],
    repetitions: new Map([[positionKey(board, turn), 1]]),
    endgame: null,
  };
}

describe("forcedCaptureSquares", () => {
  it("returns only the current player's pieces that have captures", () => {
    const state = stateFrom([
      { row: 5, col: 3, piece: { color: "w", king: false } },
      { row: 4, col: 4, piece: { color: "b", king: false } },
      { row: 5, col: 7, piece: { color: "w", king: false } },
      { row: 2, col: 1, piece: { color: "b", king: false } },
    ]);

    expect(forcedCaptureSquares(state)).toEqual([{ row: 5, col: 3 }]);
  });

  it("returns an empty list when there is no mandatory capture", () => {
    const state = stateFrom([
      { row: 5, col: 3, piece: { color: "w", king: false } },
      { row: 2, col: 1, piece: { color: "b", king: false } },
    ]);

    expect(forcedCaptureSquares(state)).toEqual([]);
  });
});

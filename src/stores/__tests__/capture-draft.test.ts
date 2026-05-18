import { describe, expect, it } from "vitest";

import { emptyBoard, getLegalMoves, positionKey } from "@/lib/engine";
import type { GameState, Piece, Square } from "@/lib/engine";

import {
  advanceCaptureDraft,
  beginCaptureDraft,
  captureDraftPieces,
} from "../capture-draft";
import type { UIPiece } from "../game-store";

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

function uiPieces(
  pieces: Array<{ id: string; row: number; col: number; color: "w" | "b" }>
): UIPiece[] {
  return pieces.map((piece) => ({ ...piece, king: false }));
}

describe("capture draft", () => {
  const from: Square = { row: 6, col: 0 };
  const firstLanding: Square = { row: 4, col: 2 };
  const secondLanding: Square = { row: 2, col: 4 };

  it("starts a multi-capture after the first landing instead of requiring the final square", () => {
    const state = stateFrom([
      { row: 6, col: 0, piece: { color: "w", king: false } },
      { row: 5, col: 1, piece: { color: "b", king: false } },
      { row: 3, col: 3, piece: { color: "b", king: false } },
    ]);
    const moves = getLegalMoves(state);

    const result = beginCaptureDraft(moves, from, firstLanding);

    expect(result.kind).toBe("pending");
    if (result.kind !== "pending") return;
    expect(result.draft.path).toEqual([firstLanding]);
    expect(result.draft.captures).toEqual([{ row: 5, col: 1 }]);
    expect(result.draft.nextLandings).toEqual([secondLanding]);
  });

  it("commits the full engine move only after the last capture step", () => {
    const state = stateFrom([
      { row: 6, col: 0, piece: { color: "w", king: false } },
      { row: 5, col: 1, piece: { color: "b", king: false } },
      { row: 3, col: 3, piece: { color: "b", king: false } },
    ]);
    const first = beginCaptureDraft(getLegalMoves(state), from, firstLanding);
    expect(first.kind).toBe("pending");
    if (first.kind !== "pending") return;

    const second = advanceCaptureDraft(first.draft, secondLanding);

    expect(second.kind).toBe("commit");
    if (second.kind !== "commit") return;
    expect(second.move.from).toEqual(from);
    expect(second.move.to).toEqual(secondLanding);
    expect(second.move.path).toEqual([firstLanding, secondLanding]);
    expect(second.move.captures).toEqual([
      { row: 5, col: 1 },
      { row: 3, col: 3 },
    ]);
  });

  it("renders the moving piece at the partial landing and removes captured pieces during the draft", () => {
    const pieces = uiPieces([
      { id: "white", row: 6, col: 0, color: "w" },
      { id: "first-capture", row: 5, col: 1, color: "b" },
      { id: "second-capture", row: 3, col: 3, color: "b" },
    ]);
    const state = stateFrom([
      { row: 6, col: 0, piece: { color: "w", king: false } },
      { row: 5, col: 1, piece: { color: "b", king: false } },
      { row: 3, col: 3, piece: { color: "b", king: false } },
    ]);
    const first = beginCaptureDraft(getLegalMoves(state), from, firstLanding);
    expect(first.kind).toBe("pending");
    if (first.kind !== "pending") return;

    expect(captureDraftPieces(pieces, first.draft)).toEqual([
      { id: "white", row: 4, col: 2, color: "w", king: false },
      { id: "second-capture", row: 3, col: 3, color: "b", king: false },
    ]);
  });
});

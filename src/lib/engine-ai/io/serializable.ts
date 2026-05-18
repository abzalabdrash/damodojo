import {
  emptyBoard,
  positionKey,
  type Color,
  type GameState,
  type Move,
  type Piece,
} from "@/lib/engine";

import type { FastMove } from "../types";

export type SerializablePiece = Piece | null;

export interface SerializableGameState {
  readonly board: readonly (readonly SerializablePiece[])[];
  readonly turn: Color;
  readonly halfmoveClock: number;
  readonly ply: number;
}

export function serializeGameState(state: GameState): SerializableGameState {
  return {
    board: state.board.map((row) =>
      row.map((piece) => (piece ? { ...piece } : null))
    ),
    turn: state.turn,
    halfmoveClock: state.halfmoveClock,
    ply: state.ply,
  };
}

export function deserializeGameState(input: SerializableGameState): GameState {
  const board = emptyBoard();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = input.board[row]?.[col] ?? null;
      board[row][col] = piece ? { ...piece } : null;
    }
  }
  return {
    board,
    turn: input.turn,
    halfmoveClock: input.halfmoveClock,
    ply: input.ply,
    history: [],
    repetitions: new Map([[positionKey(board, input.turn), 1]]),
    endgame: null,
  };
}

export function fastMoveToPublicMove(move: FastMove): Move {
  return {
    from: move.from,
    to: move.to,
    path: move.path.map((square) => ({ ...square })),
    captures: move.captures.map((square) => ({ ...square })),
    promoted: move.promoted,
  };
}

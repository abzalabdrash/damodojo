import {
  emptyBoard,
  positionKey,
  type GameState,
  type Piece,
} from "@/lib/engine";

import {
  BLACK,
  WHITE,
  colorOf,
  isKing,
  isOccupied,
  makePiece,
  type FastState,
} from "../types";
import { squareFromNumber, squareNumber } from "./encoding";

export function fromGameState(state: GameState): FastState {
  const cells = new Uint8Array(32);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row]?.[col];
      if (!piece) continue;
      const index = squareNumber({ row, col }) - 1;
      cells[index] = makePiece(piece.color === "w" ? WHITE : BLACK, piece.king);
    }
  }

  return {
    cells,
    turn: state.turn === "w" ? WHITE : BLACK,
    halfmoveClock: state.halfmoveClock,
    ply: state.ply,
    repetitionStack: [],
    endgame: state.endgame
      ? {
          kind: state.endgame.rule.kind,
          weak: state.endgame.rule.weak === "w" ? WHITE : BLACK,
          plies: state.endgame.plies,
        }
      : null,
  };
}

export function toGameState(state: FastState): GameState {
  const board = emptyBoard();

  for (let index = 0; index < state.cells.length; index++) {
    const cell = state.cells[index];
    if (!isOccupied(cell)) continue;
    const square = squareFromNumber(index + 1);
    const piece: Piece = {
      color: colorOf(cell) === WHITE ? "w" : "b",
      king: isKing(cell),
    };
    board[square.row][square.col] = piece;
  }

  const turn = state.turn === WHITE ? "w" : "b";
  return {
    board,
    turn,
    halfmoveClock: state.halfmoveClock,
    ply: state.ply,
    history: [],
    repetitions: new Map([[positionKey(board, turn), 1]]),
    endgame: state.endgame
      ? {
          rule: {
            kind: state.endgame.kind,
            weak: state.endgame.weak === WHITE ? "w" : "b",
          },
          plies: state.endgame.plies,
        }
      : null,
  };
}

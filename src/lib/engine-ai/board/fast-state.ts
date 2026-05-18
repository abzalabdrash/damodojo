import {
  BLACK,
  BLACK_MAN,
  EMPTY,
  WHITE,
  WHITE_MAN,
  colorOf,
  isOccupied,
  type FastColor,
  type FastState,
} from "../types";
import { squareFromNumber } from "./encoding";

export function initialFastState(): FastState {
  const cells = new Uint8Array(32);

  for (let n = 1; n <= 32; n++) {
    const { row } = squareFromNumber(n);
    if (row < 3) cells[n - 1] = BLACK_MAN;
    else if (row > 4) cells[n - 1] = WHITE_MAN;
  }

  const state: FastState = {
    cells,
    turn: WHITE,
    halfmoveClock: 0,
    ply: 0,
    repetitionStack: [],
    endgame: null,
  };
  state.repetitionStack.push(fastPositionKey(state));
  return state;
}

export function cloneFastState(state: FastState): FastState {
  return {
    cells: new Uint8Array(state.cells),
    turn: state.turn,
    halfmoveClock: state.halfmoveClock,
    ply: state.ply,
    repetitionStack: [...state.repetitionStack],
    endgame: state.endgame ? { ...state.endgame } : null,
  };
}

export function countFastPieces(state: FastState, color: FastColor): number {
  let count = 0;
  for (const cell of state.cells) {
    if (cell !== EMPTY && isOccupied(cell) && colorOf(cell) === color) {
      count++;
    }
  }
  return count;
}

export function fastPositionKey(state: FastState): string {
  return `${Array.from(state.cells).join(",")}|${state.turn}`;
}

export function opponent(color: FastColor): FastColor {
  return color === WHITE ? BLACK : WHITE;
}

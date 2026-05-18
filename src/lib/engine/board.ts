import type { Board, Color, GameState, Piece, Square } from "./types";

export const BOARD_SIZE = 8;
export const ROWS_PER_SIDE = 3;

export function isDarkSquare(row: number, col: number): boolean {
  return ((row + col) & 1) === 1;
}

export function onBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function sq(row: number, col: number): Square {
  return { row, col };
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.row === b.row && a.col === b.col;
}

export function pieceAt(board: Board, s: Square): Piece | null {
  return board[s.row]?.[s.col] ?? null;
}

export function setPiece(
  board: (Piece | null)[][],
  s: Square,
  piece: Piece | null
): void {
  board[s.row][s.col] = piece;
}

export function cloneBoard(board: Board): (Piece | null)[][] {
  return board.map((row) => [...row]);
}

export function initialBoard(): Board {
  const b: (Piece | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!isDarkSquare(row, col)) continue;
      if (row < ROWS_PER_SIDE) b[row][col] = { color: "b", king: false };
      else if (row >= BOARD_SIZE - ROWS_PER_SIDE)
        b[row][col] = { color: "w", king: false };
    }
  }
  return b;
}

export function emptyBoard(): (Piece | null)[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
}

export function initialState(): GameState {
  const board = initialBoard();
  return {
    board,
    turn: "w",
    halfmoveClock: 0,
    ply: 0,
    history: [],
    repetitions: new Map([[positionKey(board, "w"), 1]]),
    endgame: null,
  };
}

export function isPromotionRow(row: number, color: Color): boolean {
  return color === "w" ? row === 0 : row === BOARD_SIZE - 1;
}

export function forwardDirection(color: Color): -1 | 1 {
  // White moves "up" (toward row 0); Black moves "down" (toward row 7).
  return color === "w" ? -1 : 1;
}

export function opponent(color: Color): Color {
  return color === "w" ? "b" : "w";
}

/**
 * Russian-checkers square numbering 1..32 (dark squares only).
 * Square 1 = (row 0, col 1), square 4 = (row 0, col 7), square 5 = (row 1, col 0), ..., square 32 = (row 7, col 6).
 */
export function squareNumber(s: Square): number {
  return s.row * 4 + Math.floor(s.col / 2) + 1;
}

export function squareFromNumber(n: number): Square {
  if (n < 1 || n > 32) throw new Error(`Invalid square number: ${n}`);
  const row = Math.floor((n - 1) / 4);
  const indexInRow = (n - 1) % 4;
  // On even rows (0, 2, 4, 6) dark squares are at odd cols 1,3,5,7.
  // On odd rows (1, 3, 5, 7) dark squares are at even cols 0,2,4,6.
  const col = (row & 1) === 0 ? indexInRow * 2 + 1 : indexInRow * 2;
  return { row, col };
}

/**
 * Compact serialization of board + turn for repetition detection and tests.
 * Format: 64-char string of pieces in row-major order + turn flag.
 * 'w'/'W'=white man/king, 'b'/'B'=black man/king, '.'=empty/light.
 */
export function positionKey(board: Board, turn: Color): string {
  let key = "";
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const p = board[row][col];
      if (!p) key += ".";
      else key += p.color === "w" ? (p.king ? "W" : "w") : p.king ? "B" : "b";
    }
  }
  return `${key}|${turn}`;
}

/**
 * Count pieces of a color on the board.
 */
export function pieceCount(board: Board, color: Color): number {
  let n = 0;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const p = board[row][col];
      if (p && p.color === color) n++;
    }
  }
  return n;
}

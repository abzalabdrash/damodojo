export type FastColor = 0 | 1;

export interface FastSquare {
  readonly row: number;
  readonly col: number;
}

export interface FastEndgameCounter {
  readonly kind: "kings_3v1" | "long_diag";
  readonly weak: FastColor;
  plies: number;
}

export interface FastState {
  cells: Uint8Array;
  turn: FastColor;
  halfmoveClock: number;
  ply: number;
  repetitionStack: string[];
  endgame: FastEndgameCounter | null;
}

export interface FastMove {
  readonly from: FastSquare;
  readonly to: FastSquare;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly path: readonly FastSquare[];
  readonly pathIndices: readonly number[];
  readonly captures: readonly FastSquare[];
  readonly captureIndices: readonly number[];
  readonly promoted: boolean;
}

export interface FastUndo {
  readonly move: FastMove;
  readonly movingPiece: number;
  readonly previousToPiece: number;
  readonly capturedPieces: readonly number[];
  readonly prevTurn: FastColor;
  readonly prevHalfmoveClock: number;
  readonly prevPly: number;
  readonly prevRepetitionStackLength: number;
  readonly prevEndgame: FastEndgameCounter | null;
}

export const WHITE: FastColor = 0;
export const BLACK: FastColor = 1;

export const EMPTY = 0;
export const OCCUPIED = 1;
export const KING = 1 << 1;
export const BLACK_FLAG = 1 << 2;

export const WHITE_MAN = OCCUPIED;
export const WHITE_KING = OCCUPIED | KING;
export const BLACK_MAN = OCCUPIED | BLACK_FLAG;
export const BLACK_KING = OCCUPIED | KING | BLACK_FLAG;

export type FastPiece =
  | typeof EMPTY
  | typeof WHITE_MAN
  | typeof WHITE_KING
  | typeof BLACK_MAN
  | typeof BLACK_KING;

export function isOccupied(cell: number): boolean {
  return (cell & OCCUPIED) !== 0;
}

export function isKing(cell: number): boolean {
  return isOccupied(cell) && (cell & KING) !== 0;
}

export function colorOf(cell: number): FastColor {
  return (cell & BLACK_FLAG) !== 0 ? BLACK : WHITE;
}

export function isWhitePiece(cell: number): boolean {
  return isOccupied(cell) && colorOf(cell) === WHITE;
}

export function isBlackPiece(cell: number): boolean {
  return isOccupied(cell) && colorOf(cell) === BLACK;
}

export function makePiece(color: FastColor, king: boolean): number {
  return OCCUPIED | (king ? KING : 0) | (color === BLACK ? BLACK_FLAG : 0);
}

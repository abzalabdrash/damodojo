import { BOARD_SIZE } from "./board";
import type { Move, Square } from "./types";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/**
 * Algebraic coordinate of a square: file letter + rank number from White's
 * perspective, e.g. (row 5, col 2) → "c3".
 *
 * Files (col) are a..h left-to-right. Ranks (row) are 8..1 top-to-bottom,
 * so White's home row is rank 1, Black's home row is rank 8.
 */
export function squareToAlgebraic(s: Square): string {
  return `${FILES[s.col]}${BOARD_SIZE - s.row}`;
}

export function algebraicToSquare(coord: string): Square | null {
  if (coord.length !== 2) return null;
  const file = coord.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(coord[1]);
  if (file < 0 || file >= BOARD_SIZE) return null;
  if (!Number.isInteger(rank) || rank < 1 || rank > BOARD_SIZE) return null;
  return { row: BOARD_SIZE - rank, col: file };
}

/**
 * Algebraic move notation in the Russian-shashki convention:
 *   Simple move:    "c3-d4"
 *   Single capture: "c3:e5"
 *   Chain capture:  "c3:e5:g7"
 *
 * The colon is the standard capture separator in Russian draughts literature
 * (an "×" alternative is accepted on parse).
 */
export function moveToNotation(move: Move): string {
  const isCapture = move.captures.length > 0;
  const sep = isCapture ? ":" : "-";
  const squares = [move.from, ...move.path].map(squareToAlgebraic);
  return squares.join(sep);
}

/**
 * Parse "c3-d4" / "c3:e5(:g7...)" / "c3xe5". Returns the from/to squares
 * for lookup against the legal-move list; does NOT validate.
 */
export function parseNotation(text: string): {
  from: Square;
  to: Square;
  isCapture: boolean;
} | null {
  const cleaned = text.toLowerCase().replace(/\s+/g, "").replace(/×|x/g, ":");
  const isCapture = cleaned.includes(":");
  const parts = cleaned.split(/[-:]/);
  if (parts.length < 2) return null;
  const from = algebraicToSquare(parts[0]);
  const to = algebraicToSquare(parts[parts.length - 1]);
  if (!from || !to) return null;
  return { from, to, isCapture };
}

/**
 * Position encoding for the kings-only endgame tablebase.
 *
 * We encode a position with ≤ MAX_TB_PIECES kings (no men) as a single
 * integer. The cell layout uses 3 bits per cell:
 *   0 = empty
 *   1 = white king
 *   2 = black king
 * Side-to-move adds 1 bit. With 32 cells we'd need 32*2+1 = 65 bits, which
 * overflows JS's safe integer range. Instead we list cell indices of white
 * and black kings as a sorted small-int array and hash via factorial-coded
 * pair (whiteKingsSorted, blackKingsSorted, side).
 *
 * Encoding strategy (fast & unique for ≤ 4 pieces):
 *   - Sort white-king indices ascending; same for black.
 *   - Concatenate as a base-33 polynomial (cells 0..31, plus 32 as sentinel).
 *   - Pack as: (whiteCode * 33^maxN + blackCode) * 2 + side
 *
 * For maxN = 3 kings each side: 33^3 = 35937 per side polynomial,
 * total fits comfortably in a 32-bit JS number.
 */

import {
  BLACK,
  EMPTY,
  WHITE,
  colorOf,
  isKing,
  isOccupied,
  type FastState,
} from "../types";

export const MAX_TB_PIECES_PER_SIDE = 3;
export const TOTAL_MAX_TB_PIECES = 3;
const SENTINEL = 32; // marks "no piece" in fixed-width position vector
const BASE = 33; // 0..31 cell ids + sentinel

export function isTablebaseEligible(state: FastState): boolean {
  let totalCount = 0;
  for (const cell of state.cells) {
    if (cell === EMPTY || !isOccupied(cell)) continue;
    if (!isKing(cell)) return false; // tablebase covers kings-only positions
    totalCount++;
    if (totalCount > TOTAL_MAX_TB_PIECES) return false;
  }
  return totalCount >= 2;
}

export function encodePosition(state: FastState): number | null {
  const whites: number[] = [];
  const blacks: number[] = [];
  for (let i = 0; i < state.cells.length; i++) {
    const cell = state.cells[i];
    if (cell === EMPTY || !isOccupied(cell)) continue;
    if (!isKing(cell)) return null; // men disqualify the position
    if (colorOf(cell) === WHITE) whites.push(i);
    else blacks.push(i);
  }
  if (whites.length > MAX_TB_PIECES_PER_SIDE) return null;
  if (blacks.length > MAX_TB_PIECES_PER_SIDE) return null;
  if (whites.length + blacks.length > TOTAL_MAX_TB_PIECES) return null;
  if (whites.length === 0 || blacks.length === 0) return null;

  whites.sort((a, b) => a - b);
  blacks.sort((a, b) => a - b);

  let wCode = 0;
  for (let i = 0; i < MAX_TB_PIECES_PER_SIDE; i++) {
    wCode = wCode * BASE + (whites[i] ?? SENTINEL);
  }
  let bCode = 0;
  for (let i = 0; i < MAX_TB_PIECES_PER_SIDE; i++) {
    bCode = bCode * BASE + (blacks[i] ?? SENTINEL);
  }
  const SIDE_FACTOR = 2;
  const COLOR_FACTOR = BASE ** MAX_TB_PIECES_PER_SIDE;
  return (wCode * COLOR_FACTOR + bCode) * SIDE_FACTOR + state.turn;
}

/**
 * Iterate every legal kings-only position with at most TOTAL_MAX_TB_PIECES kings
 * (1 white + 1 black up to 3 white + 1 black or 1 white + 3 black, etc).
 * Yields cell-index arrays per color, not full FastState instances — the
 * caller materializes the state.
 */
export function* enumerateAllKingPositions(): IterableIterator<{
  white: readonly number[];
  black: readonly number[];
  turn: 0 | 1;
}> {
  for (let wCount = 1; wCount <= MAX_TB_PIECES_PER_SIDE; wCount++) {
    for (let bCount = 1; bCount <= MAX_TB_PIECES_PER_SIDE; bCount++) {
      if (wCount + bCount > TOTAL_MAX_TB_PIECES) continue;
      for (const whites of combinations(32, wCount)) {
        for (const blacks of combinations(32, bCount)) {
          if (whites.some((i) => blacks.includes(i))) continue;
          for (const turn of [WHITE, BLACK] as const) {
            yield { white: whites, black: blacks, turn };
          }
        }
      }
    }
  }
}

function* combinations(n: number, k: number, start = 0): IterableIterator<number[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= n - k; i++) {
    for (const rest of combinations(n, k - 1, i + 1)) {
      yield [i, ...rest];
    }
  }
}

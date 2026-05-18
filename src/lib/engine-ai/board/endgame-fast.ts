/**
 * Fast-path detection of FMJD endgame draw rules over a FastState.
 * Mirrors the logic in `src/lib/engine/endgame-rules.ts` but operates
 * directly on the Uint8Array cells for use inside the search loop.
 */

import {
  BLACK,
  EMPTY,
  WHITE,
  colorOf,
  isKing,
  isOccupied,
  type FastColor,
  type FastState,
} from "../types";
import { squareFromNumber } from "./encoding";

export type FastEndgameRule =
  | { readonly kind: "kings_3v1"; readonly weak: FastColor }
  | { readonly kind: "long_diag"; readonly weak: FastColor };

export const KINGS_3V1_PLY_LIMIT = 30;
export const LONG_DIAG_PLY_LIMIT = 10;

/** Pre-computed cell indices (0..31) lying on the a1-h8 long diagonal. */
const LONG_DIAG_INDICES: ReadonlySet<number> = (() => {
  const set = new Set<number>();
  for (let n = 1; n <= 32; n++) {
    const { row, col } = squareFromNumber(n);
    if (row + col === 7) set.add(n - 1); // a1-h8: row + col = 7
  }
  return set;
})();

export function detectFastEndgameRule(state: FastState): FastEndgameRule | null {
  let wKings = 0, wMen = 0, bKings = 0, bMen = 0;
  let wKingOnDiag = false, bKingOnDiag = false;
  let total = 0;

  for (let i = 0; i < state.cells.length; i++) {
    const cell = state.cells[i];
    if (cell === EMPTY || !isOccupied(cell)) continue;
    total++;
    if (total > 6) return null; // early exit: FMJD endgame rules cap at ≤ 6 pieces
    const king = isKing(cell);
    const onDiag = LONG_DIAG_INDICES.has(i);
    if (colorOf(cell) === WHITE) {
      if (king) { wKings++; if (onDiag) wKingOnDiag = true; }
      else wMen++;
    } else {
      if (king) { bKings++; if (onDiag) bKingOnDiag = true; }
      else bMen++;
    }
  }

  for (const weak of [WHITE, BLACK] as const) {
    const weakKings = weak === WHITE ? wKings : bKings;
    const weakMen = weak === WHITE ? wMen : bMen;
    const weakOnDiag = weak === WHITE ? wKingOnDiag : bKingOnDiag;
    if (weakKings !== 1 || weakMen !== 0) continue;

    const strongKings = weak === WHITE ? bKings : wKings;
    const strongMen = weak === WHITE ? bMen : wMen;
    const strongTotal = strongKings + strongMen;

    if (weakOnDiag && strongTotal === 3 && strongKings >= 1) {
      return { kind: "long_diag", weak };
    }
    if (strongKings >= 3 && strongMen === 0) {
      return { kind: "kings_3v1", weak };
    }
  }
  return null;
}

export function fastEndgameLimit(rule: FastEndgameRule): number {
  return rule.kind === "kings_3v1" ? KINGS_3V1_PLY_LIMIT : LONG_DIAG_PLY_LIMIT;
}

export function sameFastEndgameRule(
  a: FastEndgameRule | null,
  b: FastEndgameRule | null
): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.weak === b.weak;
}

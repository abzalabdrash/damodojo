/**
 * FMJD/IDF Section 7 endgame draw rules for Russian draughts (8x8).
 *
 * Rule A — "3+ kings vs 1 king" (15 moves of both players = 30 ply):
 *   If a player has 3 or more kings (and 0 men) against the opponent's
 *   single king (0 men), the game is drawn unless the stronger side
 *   captures the lone king within 30 ply of the balance being established.
 *
 * Rule B — "long diagonal" (5 moves of both players = 10 ply):
 *   If the stronger side has one of {3 kings; 2 kings + 1 man; 1 king + 2 men}
 *   and the opponent has a single king standing on the long diagonal
 *   (a1-h8, the only dark long diagonal on an 8x8 board), the game is drawn
 *   unless the stronger side achieves a winning position within 10 ply.
 *
 * Counter behaviour: the counter is incremented every ply while the same
 * rule remains active. If the material balance changes (e.g. a piece is
 * captured) or the lone king leaves/enters the long diagonal, the counter
 * resets and a new rule (or no rule) takes over.
 */

import { BOARD_SIZE, isDarkSquare } from "./board";
import type { Board, Color } from "./types";

export type EndgameRule =
  | { readonly kind: "kings_3v1"; readonly weak: Color }
  | { readonly kind: "long_diag"; readonly weak: Color };

export const KINGS_3V1_PLY_LIMIT = 30;
export const LONG_DIAG_PLY_LIMIT = 10;

/** Cells of the a1-h8 dark long diagonal. */
const LONG_DIAGONAL_CELLS = new Set<number>();
for (let i = 0; i < BOARD_SIZE; i++) {
  const row = BOARD_SIZE - 1 - i;
  const col = i;
  if (isDarkSquare(row, col)) LONG_DIAGONAL_CELLS.add(row * BOARD_SIZE + col);
}

export function isOnLongDiagonal(row: number, col: number): boolean {
  return LONG_DIAGONAL_CELLS.has(row * BOARD_SIZE + col);
}

interface MaterialSummary {
  wKings: number;
  wMen: number;
  bKings: number;
  bMen: number;
  wKingOnLongDiag: boolean;
  bKingOnLongDiag: boolean;
}

function summarizeMaterial(board: Board): MaterialSummary {
  const s: MaterialSummary = {
    wKings: 0, wMen: 0, bKings: 0, bMen: 0,
    wKingOnLongDiag: false, bKingOnLongDiag: false,
  };
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      const onDiag = isOnLongDiagonal(r, c);
      if (p.color === "w") {
        if (p.king) { s.wKings++; if (onDiag) s.wKingOnLongDiag = true; }
        else s.wMen++;
      } else {
        if (p.king) { s.bKings++; if (onDiag) s.bKingOnLongDiag = true; }
        else s.bMen++;
      }
    }
  }
  return s;
}

/**
 * Detect which FMJD endgame draw rule (if any) applies to the current
 * material configuration. Returns null when neither Rule A nor Rule B fires.
 */
export function detectEndgameRule(board: Board): EndgameRule | null {
  const m = summarizeMaterial(board);

  for (const weak of ["w", "b"] as const) {
    const weakKings = weak === "w" ? m.wKings : m.bKings;
    const weakMen = weak === "w" ? m.wMen : m.bMen;
    const weakOnDiag = weak === "w" ? m.wKingOnLongDiag : m.bKingOnLongDiag;

    // Weak side must be exactly one lone king.
    if (weakKings !== 1 || weakMen !== 0) continue;

    const strongKings = weak === "w" ? m.bKings : m.wKings;
    const strongMen = weak === "w" ? m.bMen : m.wMen;
    const strongTotal = strongKings + strongMen;

    // Rule B: long diagonal — exactly 3 strong pieces with at least 1 king
    // (covers {3K}, {2K+1M}, {1K+2M}) versus a king on the long diagonal.
    if (weakOnDiag && strongTotal === 3 && strongKings >= 1) {
      return { kind: "long_diag", weak };
    }

    // Rule A: 3+ kings (and 0 men) versus the lone king.
    if (strongKings >= 3 && strongMen === 0) {
      return { kind: "kings_3v1", weak };
    }
  }

  return null;
}

export function endgameRulePlyLimit(rule: EndgameRule): number {
  return rule.kind === "kings_3v1" ? KINGS_3V1_PLY_LIMIT : LONG_DIAG_PLY_LIMIT;
}

export function sameEndgameRule(a: EndgameRule | null, b: EndgameRule | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.weak === b.weak;
}

export interface EndgameCounter {
  readonly rule: EndgameRule;
  readonly plies: number;
}

/**
 * Step the endgame counter after a move was applied.
 * - If no rule fires on the new board → null.
 * - If the same rule is still active → counter + 1.
 * - If a different rule just became active → counter = 1.
 */
export function advanceEndgameCounter(
  prev: EndgameCounter | null,
  newBoard: Board
): EndgameCounter | null {
  const rule = detectEndgameRule(newBoard);
  if (rule === null) return null;
  if (prev && sameEndgameRule(prev.rule, rule)) {
    return { rule, plies: prev.plies + 1 };
  }
  return { rule, plies: 1 };
}

export function isEndgameDrawReached(counter: EndgameCounter | null): boolean {
  if (!counter) return false;
  return counter.plies >= endgameRulePlyLimit(counter.rule);
}

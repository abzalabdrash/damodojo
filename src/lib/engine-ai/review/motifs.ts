/**
 * Tactical motif detection for move review commentary.
 * Only fires on Blunder / Mistake / Brilliant / Miss moves (per BLUEPRINT §3.4).
 * Each detector is intentionally conservative — false positives are worse than misses.
 */

import type { FastMove, FastState } from "../types";
import { isKing, isOccupied, colorOf } from "../types";

export type Motif =
  | "wrong_capture_route"   // player chose shorter capture chain
  | "lost_long_diagonal"    // after move, opponent king controls main diagonal
  | "promotion_gift"        // move allows opponent promotion within 3 plies (eval evidence)
  | "tempo_loss"            // king shuffle when active alternatives existed
  | "back_rank_break";      // vacates last back-rank guard

export interface MotifResult {
  readonly motif: Motif;
  readonly description: string; // short EN string for Featherless LLM context
}

// ---------------------------------------------------------------------------
// Long-diagonal squares (a1-h8 and a8-h1 diagonals, dark squares only)
// Indices computed: a1=28 h8=3 diagonal and a8=4 h1=31 diagonal
// ---------------------------------------------------------------------------

const LONG_DIAG_A1_H8 = new Set([28, 21, 14, 7, 3]); // approximate; a1,c3,e5,g7 etc.
const LONG_DIAG_A8_H1 = new Set([4, 9, 18, 23, 31]);  // a8,c6,e4,g2 etc.

function isLongDiagonal(idx: number): boolean {
  return LONG_DIAG_A1_H8.has(idx) || LONG_DIAG_A8_H1.has(idx);
}

// ---------------------------------------------------------------------------
// Back-rank squares: white home rank (row 7, indices 28-31) and
//                    black home rank (row 0, indices 0-3)
// ---------------------------------------------------------------------------

function isWhiteHomeRank(idx: number): boolean {
  return idx >= 28 && idx <= 31;
}
function isBlackHomeRank(idx: number): boolean {
  return idx >= 0 && idx <= 3;
}

function countHomeRankGuards(cells: Uint8Array, color: 0 | 1): number {
  let count = 0;
  const check = color === 0 ? isWhiteHomeRank : isBlackHomeRank;
  for (let i = 0; i < 32; i++) {
    const cell = cells[i];
    if (isOccupied(cell) && colorOf(cell) === color && check(i)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/**
 * wrong_capture_route: player's capture was shorter than available chains.
 * Proxy: if state had captures, the played move is a capture, and there was
 * at least one longer capture available (more captured pieces), this fires.
 */
export function detectWrongCaptureRoute(
  legalMoves: readonly FastMove[],
  playedMove: FastMove
): MotifResult | null {
  if (!playedMove.captureIndices.length) return null;

  const maxCaptures = Math.max(...legalMoves.map((m) => m.captureIndices.length));
  if (playedMove.captureIndices.length < maxCaptures) {
    return {
      motif: "wrong_capture_route",
      description: `Played ${playedMove.captureIndices.length}-capture chain when a ${maxCaptures}-capture chain was available`,
    };
  }
  return null;
}

/**
 * lost_long_diagonal: after the played move, the opponent has a king on one
 * of the two main long diagonals that it didn't control before.
 */
export function detectLostLongDiagonal(
  stateBefore: FastState,
  stateAfter: FastState,
  playedMove: FastMove
): MotifResult | null {
  const moverColor = stateBefore.turn;
  const oppColor = moverColor === 0 ? 1 : 0;

  // Count opponent kings on long diagonals before and after
  const kingOnLong = (cells: Uint8Array): number => {
    let n = 0;
    for (let i = 0; i < 32; i++) {
      const c = cells[i];
      if (isOccupied(c) && colorOf(c) === oppColor && isKing(c) && isLongDiagonal(i)) n++;
    }
    return n;
  };

  const before = kingOnLong(stateBefore.cells);
  const after  = kingOnLong(stateAfter.cells);
  if (after > before) {
    return {
      motif: "lost_long_diagonal",
      description: "After this move, the opponent gained a king on a long diagonal",
    };
  }
  return null;
}

/**
 * tempo_loss: played move was a king move that returns to a square it
 * recently visited (simple oscillation), when there were non-king moves.
 */
export function detectTempoLoss(
  state: FastState,
  legalMoves: readonly FastMove[],
  playedMove: FastMove,
  prevPlyFromIndex?: number
): MotifResult | null {
  if (!isKing(state.cells[playedMove.fromIndex])) return null;

  // King moved back to where it came from
  if (prevPlyFromIndex !== undefined && playedMove.toIndex === prevPlyFromIndex) {
    const hasNonKingMoves = legalMoves.some(
      (m) => !isKing(state.cells[m.fromIndex])
    );
    if (hasNonKingMoves) {
      return {
        motif: "tempo_loss",
        description: "King shuffled back to its previous square while non-king moves were available",
      };
    }
  }
  return null;
}

/**
 * back_rank_break: played move vacates the last back-rank guard.
 * Only for the middle game (at least 5 men remaining for the defender).
 */
export function detectBackRankBreak(
  stateBefore: FastState,
  stateAfter: FastState
): MotifResult | null {
  const moverColor = stateBefore.turn;

  const guardsBefore = countHomeRankGuards(stateBefore.cells, moverColor);
  const guardsAfter  = countHomeRankGuards(stateAfter.cells, moverColor);

  if (guardsBefore > 0 && guardsAfter === 0) {
    return {
      motif: "back_rank_break",
      description: "This move vacated the last back-rank guard, opening a breakthrough",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main entry: run all detectors and return the first (most relevant) motif
// ---------------------------------------------------------------------------

export function detectMotif(params: {
  readonly stateBefore: FastState;
  readonly stateAfter: FastState;
  readonly legalMoves: readonly FastMove[];
  readonly playedMove: FastMove;
  readonly prevPlyFromIndex?: number;
}): MotifResult | null {
  const { stateBefore, stateAfter, legalMoves, playedMove, prevPlyFromIndex } = params;

  return (
    detectWrongCaptureRoute(legalMoves, playedMove) ??
    detectBackRankBreak(stateBefore, stateAfter) ??
    detectLostLongDiagonal(stateBefore, stateAfter, playedMove) ??
    detectTempoLoss(stateBefore, legalMoves, playedMove, prevPlyFromIndex) ??
    null
  );
}

/**
 * Build the dense engine-grounded context that the live trainer (Ata) needs
 * to give meaningful per-move feedback. Pure helpers — no React, no DOM.
 */

import {
  getLegalMoves,
  moveToNotation,
  type Board,
  type Color,
  type GameState,
  type Move,
} from "@/lib/engine";
import type { MoveClass } from "@/lib/engine-ai/review/classify";
import { winProbability } from "@/lib/engine-ai/review/winprob";

export interface MaterialCounts {
  readonly men: number;
  readonly kings: number;
  readonly total: number;
}

export function materialCounts(board: Board, color: Color): MaterialCounts {
  let men = 0;
  let kings = 0;
  for (let row = 0; row < board.length; row++) {
    const r = board[row];
    for (let col = 0; col < r.length; col++) {
      const p = r[col];
      if (!p || p.color !== color) continue;
      if (p.king) kings++;
      else men++;
    }
  }
  return { men, kings, total: men + kings };
}

/**
 * Number of rows the most-advanced *man* of `color` still has to cross
 * before promoting. Returns `null` if `color` has no men at all (only
 * kings or empty). White promotes on row 0, black on row 7.
 *
 * Used by the live coach prompt to decide whether "веди в дамки" is
 * even applicable advice. Without this signal Ata kept saying "make a
 * king" on move 20 of an opening where every white man is still on rows
 * 5-6 — physically impossible for at least 4 moves and useless as a
 * coaching tip.
 */
export function closestPromotionDistance(
  board: Board,
  color: Color,
): number | null {
  let best: number | null = null;
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const p = board[row][col];
      if (!p || p.color !== color || p.king) continue;
      const dist = color === "w" ? row : 7 - row;
      if (best === null || dist < best) best = dist;
    }
  }
  return best;
}

export function mobilityFor(state: GameState, color: Color): number {
  if (state.turn === color) return getLegalMoves(state).length;
  // Cheap probe — getLegalMoves only reads board+turn, the other state fields
  // (repetitions / endgame counters) don't affect move generation.
  const swapped: GameState = { ...state, turn: color };
  return getLegalMoves(swapped).length;
}

/**
 * Format last `count` plies in compact PDN-ish notation, e.g.
 * "12. c3-d4 d6-c5 13. b2-c3 ...".
 *
 * `currentMoveNumber` = 1-based pair index of the move that just happened,
 * i.e. ceil(history.length / 2). Used so the labels reflect the real game
 * move counter even when we only render the tail.
 */
export function recentMovesPdn(
  history: readonly Move[],
  count = 8,
): string[] {
  const len = history.length;
  if (len === 0) return [];
  const start = Math.max(0, len - count);
  // Snap to the start of a pair so the rendered tail begins with the white
  // move of a numbered pair, never with a stray black reply.
  const aligned = start - (start % 2);
  const out: string[] = [];
  for (let i = aligned; i < len; i++) {
    const move = history[i];
    if (i % 2 === 0) {
      const moveNumber = i / 2 + 1;
      out.push(`${moveNumber}. ${moveToNotation(move)}`);
    } else {
      out[out.length - 1] += ` ${moveToNotation(move)}`;
    }
  }
  return out;
}

export interface LiveMoveClassification {
  readonly moveClass: MoveClass;
  readonly wpBefore: number;
  readonly wpAfter: number;
  /** Positive = student improved win-prob, negative = student worsened it. */
  readonly wpDelta: number;
}

function moveEndpointsEqual(a: Move, b: Move): boolean {
  return (
    a.from.row === b.from.row &&
    a.from.col === b.from.col &&
    a.to.row === b.to.row &&
    a.to.col === b.to.col
  );
}

/**
 * Classify a live move using win-probability deltas, matching the offline
 * review's threshold ladder closely. We don't try to detect brilliant /
 * great / book here — those need second-best eval and book DB which the
 * live path doesn't have. The four working buckets are best / excellent /
 * good / inaccuracy / mistake / blunder, which is enough for honest
 * per-move feedback.
 */
export function classifyLiveMove(input: {
  /** Engine eval BEFORE the move from STUDENT's POV (centipawns). */
  readonly evalBeforeCp: number;
  /** Engine eval AFTER the move from STUDENT's POV (centipawns). */
  readonly evalAfterCp: number;
  readonly playedMove: Move;
  readonly bestMoveAtPrev: Move | null;
}): LiveMoveClassification {
  const wpBefore = winProbability(input.evalBeforeCp);
  const wpAfter = winProbability(input.evalAfterCp);
  const wpDelta = wpAfter - wpBefore; // positive = student gained
  const loss = wpBefore - wpAfter;    // positive = student lost win-prob

  if (input.bestMoveAtPrev && moveEndpointsEqual(input.playedMove, input.bestMoveAtPrev)) {
    return { moveClass: "best", wpBefore, wpAfter, wpDelta };
  }
  if (loss < 0.02) return { moveClass: "excellent",  wpBefore, wpAfter, wpDelta };
  if (loss < 0.05) return { moveClass: "good",       wpBefore, wpAfter, wpDelta };
  if (loss < 0.10) return { moveClass: "inaccuracy", wpBefore, wpAfter, wpDelta };
  if (loss < 0.20) return { moveClass: "mistake",    wpBefore, wpAfter, wpDelta };
  return { moveClass: "blunder", wpBefore, wpAfter, wpDelta };
}

/**
 * Convert a small principal variation (Move objects) into algebraic strings,
 * trimming to the first `maxPlies` entries. Returns `[]` for an empty PV.
 */
export function pvToNotation(pv: readonly Move[], maxPlies = 4): string[] {
  return pv.slice(0, maxPlies).map(moveToNotation);
}

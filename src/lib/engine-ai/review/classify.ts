/**
 * Move classification — 10 categories matching chess.com Game Review.
 * Implementation follows ENGINE.md §11.2 and BLUEPRINT.md §3.4 exactly.
 *
 * Thresholds (win-probability delta, positive = loss for side-to-move):
 *   Excellent  : delta < 0.02
 *   Good       : delta < 0.05
 *   Inaccuracy : delta < 0.10
 *   Mistake    : delta < 0.20
 *   Blunder    : delta >= 0.20
 */

import { winProbability } from "./winprob";
import type { FastMove } from "../types";

export type MoveClass =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "miss";

export const MOVE_CLASS_ORDER: MoveClass[] = [
  "brilliant", "great", "best", "excellent", "good",
  "book", "inaccuracy", "mistake", "blunder", "miss",
];

/** Is this class considered a "key move" worth highlighting in review? */
export function isKeyMove(c: MoveClass): boolean {
  return c === "brilliant" || c === "great" || c === "mistake" || c === "blunder" || c === "miss";
}

/** Is this class considered a negative outcome? */
export function isNegativeClass(c: MoveClass): boolean {
  return c === "inaccuracy" || c === "mistake" || c === "blunder" || c === "miss";
}

export interface ClassifyInput {
  /** Centipawn eval BEFORE the move, from the side-to-move's perspective */
  readonly evalBefore: number;
  /** Centipawn eval AFTER the move, from the side-to-move's perspective (sign-flipped) */
  readonly evalAfter: number;
  /** Eval of the best move — what would happen if the best move were played */
  readonly evalBest: number;
  /** Second-best eval (for "only good move" detection) */
  readonly evalSecondBest: number | null;
  /** The best engine move at this position */
  readonly bestMove: FastMove;
  /** The move the player actually played */
  readonly playedMove: FastMove;
  /** True if the played move immediately loses material but engine still approves */
  readonly isSacrifice: boolean;
  /** True if the previous opponent move was Blunder or Mistake */
  readonly opponentBlundered: boolean;
  /** True if this position was already classified as "book" */
  readonly isBook: boolean;
  readonly scale?: number;
}

export interface ClassifyResult {
  readonly moveClass: MoveClass;
  readonly wpDelta: number;
  readonly wpBefore: number;
  readonly wpAfter: number;
}

function movesEqual(a: FastMove, b: FastMove): boolean {
  return a.fromIndex === b.fromIndex && a.toIndex === b.toIndex;
}

export function classifyMove(input: ClassifyInput): ClassifyResult {
  const scale = input.scale ?? 300;
  const wpBefore = winProbability(input.evalBefore, scale);
  const wpAfter  = winProbability(input.evalAfter,  scale);
  const wpBest   = winProbability(input.evalBest,   scale);
  const delta    = wpBefore - wpAfter; // positive = player lost win-prob

  // "Only good move" = the best move is significantly better than second-best
  const wpSecondBest = input.evalSecondBest !== null
    ? winProbability(input.evalSecondBest, scale)
    : null;
  const isOnlyGoodMove = wpSecondBest !== null
    ? wpBest - wpSecondBest > 0.15
    : false;

  // Book position
  if (input.isBook) {
    return { moveClass: "book", wpDelta: delta, wpBefore, wpAfter };
  }

  // Played = best move
  if (movesEqual(input.playedMove, input.bestMove)) {
    if (input.isSacrifice && isOnlyGoodMove) {
      return { moveClass: "brilliant", wpDelta: delta, wpBefore, wpAfter };
    }
    if (isOnlyGoodMove) {
      return { moveClass: "great", wpDelta: delta, wpBefore, wpAfter };
    }
    return { moveClass: "best", wpDelta: delta, wpBefore, wpAfter };
  }

  // Miss = opponent blundered but player didn't capitalise
  if (input.opponentBlundered && delta > 0.10) {
    return { moveClass: "miss", wpDelta: delta, wpBefore, wpAfter };
  }

  // Threshold ladder
  if (delta < 0.02) return { moveClass: "excellent",  wpDelta: delta, wpBefore, wpAfter };
  if (delta < 0.05) return { moveClass: "good",        wpDelta: delta, wpBefore, wpAfter };
  if (delta < 0.10) return { moveClass: "inaccuracy",  wpDelta: delta, wpBefore, wpAfter };
  if (delta < 0.20) return { moveClass: "mistake",     wpDelta: delta, wpBefore, wpAfter };
  return { moveClass: "blunder", wpDelta: delta, wpBefore, wpAfter };
}

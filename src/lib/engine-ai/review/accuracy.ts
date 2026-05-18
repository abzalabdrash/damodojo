/**
 * Per-side accuracy computation for a reviewed game.
 * Mirrors chess.com's accuracy percentage: 100 = perfect, 0 = catastrophic.
 */

import { computeAccuracy } from "./winprob";
import type { MoveClass } from "./classify";

export interface SideStats {
  /** 0–100 accuracy score */
  readonly accuracy: number;
  readonly brilliant: number;
  readonly great: number;
  readonly best: number;
  readonly excellent: number;
  readonly good: number;
  readonly book: number;
  readonly inaccuracy: number;
  readonly mistake: number;
  readonly blunder: number;
  readonly miss: number;
  /** Total classified moves (excluding book) */
  readonly totalMoves: number;
}

export interface GameAccuracy {
  readonly white: SideStats;
  readonly black: SideStats;
}

export interface AccuracyMove {
  readonly side: "white" | "black";
  readonly moveClass: MoveClass;
  readonly wpDelta: number;
}

export function computeGameAccuracy(moves: readonly AccuracyMove[]): GameAccuracy {
  const whiteMoves = moves.filter((m) => m.side === "white");
  const blackMoves = moves.filter((m) => m.side === "black");
  return {
    white: computeSideStats(whiteMoves),
    black: computeSideStats(blackMoves),
  };
}

function computeSideStats(moves: readonly AccuracyMove[]): SideStats {
  const nonBook = moves.filter((m) => m.moveClass !== "book");
  const accuracy = computeAccuracy(nonBook.map((m) => m.wpDelta));

  const counts: Record<MoveClass, number> = {
    brilliant: 0, great: 0, best: 0, excellent: 0, good: 0,
    book: 0, inaccuracy: 0, mistake: 0, blunder: 0, miss: 0,
  };
  for (const m of moves) counts[m.moveClass]++;

  return {
    accuracy,
    ...counts,
    totalMoves: nonBook.length,
  };
}

import { evaluateHybrid as evaluate } from "../nn/evaluator";
import { makeFastMove, unmakeFastMove } from "../board/make-unmake";
import { generateFastMoves } from "../moves/generate";
import type { FastState } from "../types";

export interface QuiescenceContext {
  nodes: number;
}

export function quiescence(
  state: FastState,
  alpha: number,
  beta: number,
  ctx: QuiescenceContext
): number {
  ctx.nodes++;
  const standPat = evaluate(state);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const captures = generateFastMoves(state).filter((move) => move.captures.length > 0);
  for (const move of captures) {
    const undo = makeFastMove(state, move);
    const score = -quiescence(state, -beta, -alpha, ctx);
    unmakeFastMove(state, undo);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

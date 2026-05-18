import { makeFastMove, unmakeFastMove } from "../board/make-unmake";
import { generateFastMoves } from "../moves/generate";
import type { FastState } from "../types";

export function perft(state: FastState, depth: number): number {
  if (depth === 0) return 1;

  let nodes = 0;
  for (const move of generateFastMoves(state)) {
    const undo = makeFastMove(state, move);
    nodes += perft(state, depth - 1);
    unmakeFastMove(state, undo);
  }
  return nodes;
}

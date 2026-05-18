import type { FastColor, FastState } from "../types";
import { evaluateBreakdown } from "./features";

export function evaluate(state: FastState): number {
  return evaluateBreakdown(state).total;
}

export function terminalScore(winner: FastColor | null, sideToMove: FastColor, ply: number): number {
  if (winner === null) return 0;
  const mate = 100_000 - ply;
  return winner === sideToMove ? mate : -mate;
}

/**
 * Win-probability model: converts engine centipawn eval to a [0..1] winning
 * chance for the side that just moved, using a logistic (sigmoid) curve.
 *
 * SCALE ≈ 300 cp — the eval swing that shifts win-prob by ~50%.
 * Calibrate later from self-play game outcomes (fit logistic to actual results).
 */

/** Centipawn eval → win probability for the side with the given eval. */
export const WIN_PROB_SCALE = 300;

export function winProbability(evalCp: number, scale = WIN_PROB_SCALE): number {
  return 1 / (1 + Math.exp(-evalCp / scale));
}

/**
 * Delta in win probability between the best move and the played move.
 * `evalBefore` = engine eval BEFORE the move, from the moving side's POV.
 * `evalAfter`  = engine eval AFTER the move,  from the moving side's POV
 *                (i.e., already negated relative to opponent-to-move sign).
 */
export function winProbDelta(evalBefore: number, evalAfter: number, scale = WIN_PROB_SCALE): number {
  const wpBefore = winProbability(evalBefore, scale);
  const wpAfter  = winProbability(evalAfter,  scale);
  // Positive delta = win-prob dropped (bad move). Negative = improved.
  return wpBefore - wpAfter;
}

/**
 * Accuracy percentage for a sequence of moves.
 * Formula (chess.com-style):
 *   accuracy = 100 × (1 − mean(positive_delta) × SCALE_ACC)
 * where SCALE_ACC is calibrated so a clean engine self-play game ≈ 97-99%.
 */
export const ACCURACY_SCALE = 2.0;

export function computeAccuracy(wpDeltas: readonly number[]): number {
  if (wpDeltas.length === 0) return 100;
  const nonNegative = wpDeltas.map((d) => Math.max(0, d));
  const mean = nonNegative.reduce((s, d) => s + d, 0) / nonNegative.length;
  return Math.max(0, Math.min(100, Math.round((1 - mean * ACCURACY_SCALE) * 100)));
}

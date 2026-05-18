/**
 * Hybrid NN + classical evaluator.
 *
 * Strategy: the classical eval (`features.ts`) already gives a strong
 * centipawn baseline. We blend in the NN's win-probability prediction
 * as a soft correction term, weighted by NN_BLEND. When weights are
 * not loaded the evaluator falls back to the classical eval exactly.
 *
 * Score sign convention matches the rest of the engine: positive =
 * good for the side-to-move.
 */

import { evaluate as classicalEvaluate } from "../eval/evaluate";
import { encodeFastState, NN_INPUT_DIM } from "./encoding";
import type { DamaNet, DamaNetManifest, DamaNetWeights } from "./forward";
import { buildWeights, createDamaNet } from "./forward";
import type { FastState } from "../types";

let activeNet: DamaNet | null = null;
const inputBuffer = new Float32Array(NN_INPUT_DIM);

/**
 * Default centipawn weight applied to the NN's [-1,+1] confidence delta.
 * Calibrated for NN_v3 (mixed λ=0.6, sigmoid scale 400): cpScale ≈ 2 * scale * λ ≈ 600.
 * Empirically verified: +70 Elo vs NN_v1 in 40-game match (CI -36..+193).
 */
const DEFAULT_NN_CONFIDENCE_TO_CP = 600;
/** Default blend weight (NN signal vs classical). */
const DEFAULT_NN_BLEND = 0.55;

let nnConfidenceCp = DEFAULT_NN_CONFIDENCE_TO_CP;
let nnBlend = DEFAULT_NN_BLEND;

export function isNNActive(): boolean {
  return activeNet !== null;
}

export interface NNRuntimeConfig {
  /** cp scale applied to (stmWinProb - 0.5) * 2. */
  readonly cpScale?: number;
  /** Mix weight between NN signal and classical eval (0..1). */
  readonly blend?: number;
}

/**
 * Install NN weights for use by the evaluator. Pass `null` to deactivate.
 * The optional `config` lets callers calibrate the NN-to-centipawn mapping
 * to match how labels were generated (e.g. distilled labels need cpScale=800
 * to invert sigmoid(score/400)).
 */
export function setNNWeights(
  blob: Float32Array | null,
  manifest: DamaNetManifest | null,
  config?: NNRuntimeConfig
): void {
  if (blob === null || manifest === null) {
    activeNet = null;
    nnConfidenceCp = DEFAULT_NN_CONFIDENCE_TO_CP;
    nnBlend = DEFAULT_NN_BLEND;
    return;
  }
  const weights: DamaNetWeights = buildWeights(blob, manifest);
  activeNet = createDamaNet(weights);
  nnConfidenceCp = config?.cpScale ?? DEFAULT_NN_CONFIDENCE_TO_CP;
  nnBlend = config?.blend ?? DEFAULT_NN_BLEND;
}

/**
 * Score a position from the side-to-move's POV (centipawns).
 *
 * When the NN is loaded we blend the classical and NN signals; otherwise
 * we return the classical score unchanged.
 */
export function evaluateHybrid(state: FastState): number {
  const cp = classicalEvaluate(state);
  if (!activeNet) return cp;

  encodeFastState(state, inputBuffer, 0);
  const stmWinProb = activeNet.forward(inputBuffer, 0); // 0..1, STM's POV
  // Map [0, 1] win-prob to a centered confidence in [-1, +1]:
  const nnCp = (stmWinProb - 0.5) * 2 * nnConfidenceCp;
  // Linear blend: heavy classical baseline + NN nudge.
  return Math.round((1 - nnBlend) * cp + nnBlend * nnCp);
}

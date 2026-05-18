/**
 * Position encoding for the NN evaluator. Must match the layout produced by
 * `scripts/build-nn-dataset.mjs` so that weights trained against that
 * dataset score positions correctly at runtime.
 *
 * Layout (129 floats):
 *   For each of 32 dark squares (Russian-numbering 1..32, zero-indexed):
 *     [w_man, w_king, b_man, b_king]   ← exactly one entry is 1.0 (or all zero if empty)
 *   Followed by one side-to-move flag (0 = white, 1 = black).
 */

import {
  BLACK,
  EMPTY,
  KING,
  OCCUPIED,
  WHITE,
  BLACK_FLAG,
  type FastState,
} from "../types";

export const NN_INPUT_DIM = 129;

/**
 * Encode a FastState into a 129-float vector. Writes into the provided
 * `target` Float32Array starting at `offset`. Callers reuse a single buffer
 * to avoid per-call allocations during search.
 */
export function encodeFastState(
  state: FastState,
  target: Float32Array,
  offset = 0
): void {
  for (let i = 0; i < 32; i++) {
    const base = offset + i * 4;
    const cell = state.cells[i];
    if (cell === EMPTY || (cell & OCCUPIED) === 0) {
      target[base + 0] = 0;
      target[base + 1] = 0;
      target[base + 2] = 0;
      target[base + 3] = 0;
      continue;
    }
    const isKing = (cell & KING) !== 0;
    const isBlack = (cell & BLACK_FLAG) !== 0;
    target[base + 0] = !isBlack && !isKing ? 1 : 0; // w_man
    target[base + 1] = !isBlack && isKing ? 1 : 0;  // w_king
    target[base + 2] = isBlack && !isKing ? 1 : 0;  // b_man
    target[base + 3] = isBlack && isKing ? 1 : 0;   // b_king
    void WHITE; void BLACK; // referenced for type-export only
  }
  target[offset + 128] = state.turn === BLACK ? 1 : 0;
}

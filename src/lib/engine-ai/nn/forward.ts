/**
 * Pure-TS forward pass for the DamaNet evaluator.
 *
 * Architecture (matches `scripts/nn-training/train.py`):
 *   input(129) → fc1(256, ReLU) → fc2(256, ReLU) → fc3(1, Sigmoid)
 *
 * Weights are loaded from the binary blob produced by `train.py`:
 *   - damanet.weights.bin  — concatenated float32 parameter chunks
 *   - damanet.manifest.json — describes layer names, shapes, offsets
 *
 * At runtime we keep two scratch buffers (`hidden1`, `hidden2`) so that
 * forward passes do not allocate during search.
 */

import { NN_INPUT_DIM } from "./encoding";

const HIDDEN_DIM = 256;

export interface DamaNetWeights {
  readonly fc1Weight: Float32Array; // shape (256, 129) row-major
  readonly fc1Bias: Float32Array;   // shape (256)
  readonly fc2Weight: Float32Array; // shape (256, 256)
  readonly fc2Bias: Float32Array;   // shape (256)
  readonly fc3Weight: Float32Array; // shape (1, 256)
  readonly fc3Bias: Float32Array;   // shape (1)
}

interface ManifestLayer {
  readonly name: string;
  readonly shape: readonly number[];
  readonly offset: number;
  readonly size: number;
}

export interface DamaNetManifest {
  readonly architecture: {
    readonly inputDim: number;
    readonly hiddenDim: number;
    readonly layout: string;
  };
  readonly totalFloats: number;
  readonly totalBytes: number;
  readonly layers: readonly ManifestLayer[];
}

export function buildWeights(blob: Float32Array, manifest: DamaNetManifest): DamaNetWeights {
  if (manifest.architecture.inputDim !== NN_INPUT_DIM) {
    throw new Error(
      `Manifest inputDim ${manifest.architecture.inputDim} != code constant ${NN_INPUT_DIM}`
    );
  }
  if (manifest.architecture.hiddenDim !== HIDDEN_DIM) {
    throw new Error(
      `Manifest hiddenDim ${manifest.architecture.hiddenDim} != code constant ${HIDDEN_DIM}`
    );
  }
  if (blob.length !== manifest.totalFloats) {
    throw new Error(
      `Weights blob length ${blob.length} != manifest totalFloats ${manifest.totalFloats}`
    );
  }
  function pick(name: string): Float32Array {
    const layer = manifest.layers.find((l) => l.name === name);
    if (!layer) throw new Error(`Missing layer in manifest: ${name}`);
    return blob.subarray(layer.offset, layer.offset + layer.size);
  }
  return {
    fc1Weight: pick("fc1.weight"),
    fc1Bias: pick("fc1.bias"),
    fc2Weight: pick("fc2.weight"),
    fc2Bias: pick("fc2.bias"),
    fc3Weight: pick("fc3.weight"),
    fc3Bias: pick("fc3.bias"),
  };
}

export interface DamaNet {
  forward(input: Float32Array, offset?: number): number;
}

export function createDamaNet(weights: DamaNetWeights): DamaNet {
  const hidden1 = new Float32Array(HIDDEN_DIM);
  const hidden2 = new Float32Array(HIDDEN_DIM);

  return {
    forward(input: Float32Array, offset = 0): number {
      // ── fc1: hidden1 = relu(W1·x + b1) ──
      const W1 = weights.fc1Weight;
      const b1 = weights.fc1Bias;
      for (let j = 0; j < HIDDEN_DIM; j++) {
        const rowOff = j * NN_INPUT_DIM;
        let acc = b1[j];
        for (let i = 0; i < NN_INPUT_DIM; i++) {
          acc += W1[rowOff + i] * input[offset + i];
        }
        hidden1[j] = acc > 0 ? acc : 0;
      }
      // ── fc2: hidden2 = relu(W2·hidden1 + b2) ──
      const W2 = weights.fc2Weight;
      const b2 = weights.fc2Bias;
      for (let j = 0; j < HIDDEN_DIM; j++) {
        const rowOff = j * HIDDEN_DIM;
        let acc = b2[j];
        for (let i = 0; i < HIDDEN_DIM; i++) {
          acc += W2[rowOff + i] * hidden1[i];
        }
        hidden2[j] = acc > 0 ? acc : 0;
      }
      // ── fc3: scalar = sigmoid(W3·hidden2 + b3) ──
      const W3 = weights.fc3Weight;
      const b3 = weights.fc3Bias;
      let logit = b3[0];
      for (let i = 0; i < HIDDEN_DIM; i++) {
        logit += W3[i] * hidden2[i];
      }
      return 1 / (1 + Math.exp(-logit));
    },
  };
}

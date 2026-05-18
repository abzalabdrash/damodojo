/**
 * Load trained DamaNet weights at runtime.
 *
 * Weights live as static assets under public/nn/:
 *   - public/nn/damanet.weights.bin  (float32 binary)
 *   - public/nn/damanet.manifest.json
 *
 * Call `loadDamaNetWeights()` once at engine startup (e.g. inside the
 * Web Worker bootstrap). If the assets are missing or fail to load, the
 * evaluator falls back to the classical heuristic cleanly.
 */

import { setNNWeights } from "./evaluator";
import type { DamaNetManifest } from "./forward";

let loadAttempted = false;

export interface LoadResult {
  readonly loaded: boolean;
  readonly source?: string;
  readonly bytes?: number;
  readonly error?: string;
}

/**
 * Try to load the weights. Safe to call multiple times — subsequent calls
 * after a successful load are no-ops.
 *
 * @param baseUrl  Defaults to "/nn". Override for Node-side scripts that
 *                 load from a local file path via a custom fetch.
 */
export async function loadDamaNetWeights(baseUrl = "/nn"): Promise<LoadResult> {
  if (loadAttempted) return { loaded: false, error: "already attempted" };
  loadAttempted = true;
  try {
    const manifestRes = await fetch(`${baseUrl}/damanet.manifest.json`);
    if (!manifestRes.ok) {
      return { loaded: false, error: `manifest ${manifestRes.status}` };
    }
    const manifest = (await manifestRes.json()) as DamaNetManifest;

    const weightsRes = await fetch(`${baseUrl}/damanet.weights.bin`);
    if (!weightsRes.ok) {
      return { loaded: false, error: `weights ${weightsRes.status}` };
    }
    const buf = await weightsRes.arrayBuffer();
    const blob = new Float32Array(buf);

    setNNWeights(blob, manifest);
    return { loaded: true, source: baseUrl, bytes: buf.byteLength };
  } catch (e) {
    return { loaded: false, error: (e as Error).message };
  }
}

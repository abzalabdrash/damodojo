/**
 * Stockfish-NNUE-style label mixing.
 *
 *   target[i] = lambda * distilled[i] + (1 - lambda) * game_result[i]
 *
 * Both inputs are in WDL-space [0, 1] (distilled = sigmoid(depth-12 score / 400),
 * game_result = 0 / 0.5 / 1 from STM POV).
 *
 * Usage:
 *   node scripts/nn-training/mix_labels.mjs \
 *     --distilled data/datasets/nn/distilled.bin \
 *     --game-result data/datasets/nn/labels.bin \
 *     --output data/datasets/nn/mixed_l60.bin \
 *     --lambda 0.6
 */

import fs from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    distilled: { type: "string", default: "data/datasets/nn/distilled.bin" },
    "game-result": { type: "string", default: "data/datasets/nn/labels.bin" },
    output: { type: "string", required: true },
    lambda: { type: "string", default: "0.6" },
  },
  strict: false,
});

const LAMBDA = parseFloat(args.lambda);
if (!(LAMBDA >= 0 && LAMBDA <= 1)) throw new Error(`lambda must be in [0,1], got ${LAMBDA}`);

const distBuf = fs.readFileSync(args.distilled);
const gameBuf = fs.readFileSync(args["game-result"]);
const dist = new Float32Array(distBuf.buffer, distBuf.byteOffset, distBuf.byteLength / 4);
const game = new Float32Array(gameBuf.buffer, gameBuf.byteOffset, gameBuf.byteLength / 4);

if (dist.length !== game.length) {
  throw new Error(`Length mismatch: distilled ${dist.length} vs game-result ${game.length}`);
}

const out = new Float32Array(dist.length);
let mean = 0;
let sqsum = 0;
let min = Infinity;
let max = -Infinity;
for (let i = 0; i < dist.length; i++) {
  const v = LAMBDA * dist[i] + (1 - LAMBDA) * game[i];
  out[i] = v;
  mean += v;
  sqsum += v * v;
  if (v < min) min = v;
  if (v > max) max = v;
}
mean /= out.length;
const std = Math.sqrt(sqsum / out.length - mean * mean);

fs.writeFileSync(args.output, Buffer.from(out.buffer, out.byteOffset, out.byteLength));

console.log(`Wrote ${args.output} (${out.byteLength} bytes, ${out.length} labels)`);
console.log(`lambda=${LAMBDA} | mean=${mean.toFixed(4)} std=${std.toFixed(4)} range=[${min.toFixed(4)}, ${max.toFixed(4)}]`);

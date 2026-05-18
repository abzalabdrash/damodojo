/**
 * Concatenate the original dataset with new self-play positions.
 *
 * Reads two positions.bin / labels.bin pairs, optionally a distilled.bin
 * for the original (new positions still need to be distilled separately),
 * concatenates them in order, optionally shuffles, and writes a combined
 * positions.bin + labels.bin + meta.json.
 *
 * Usage:
 *   node scripts/nn-training/combine_datasets.mjs \
 *     --orig-positions data/datasets/nn/positions.bin \
 *     --orig-labels    data/datasets/nn/labels.bin \
 *     --new-positions  data/datasets/nn/selfplay/merged_positions.bin \
 *     --new-labels     data/datasets/nn/selfplay/merged_labels.bin \
 *     --out-dir        data/datasets/nn/combined \
 *     --shuffle-seed   42
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    "orig-positions": { type: "string", default: "data/datasets/nn/positions.bin" },
    "orig-labels": { type: "string", default: "data/datasets/nn/labels.bin" },
    "new-positions": { type: "string", required: true },
    "new-labels": { type: "string", required: true },
    "out-dir": { type: "string", required: true },
    "shuffle-seed": { type: "string", default: "42" },
  },
  strict: false,
});

const INPUT_DIM = 129;
const OUT_DIR = args["out-dir"];
fs.mkdirSync(OUT_DIR, { recursive: true });

function loadF32(p) {
  const buf = fs.readFileSync(p);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

const origPos = loadF32(args["orig-positions"]);
const origLab = loadF32(args["orig-labels"]);
const newPos = loadF32(args["new-positions"]);
const newLab = loadF32(args["new-labels"]);

const origN = origPos.length / INPUT_DIM;
const newN = newPos.length / INPUT_DIM;
if (origLab.length !== origN) throw new Error(`orig labels ${origLab.length} != positions ${origN}`);
if (newLab.length !== newN) throw new Error(`new labels ${newLab.length} != positions ${newN}`);

const totalN = origN + newN;
console.log(`Combining: ${origN} orig + ${newN} new = ${totalN} positions`);

// Allocate combined buffers
const positions = new Float32Array(totalN * INPUT_DIM);
const labels = new Float32Array(totalN);
positions.set(origPos, 0);
positions.set(newPos, origN * INPUT_DIM);
labels.set(origLab, 0);
labels.set(newLab, origN);

// Shuffle (Fisher-Yates) so val split is mixed
const seed = parseInt(args["shuffle-seed"], 10);
function mulberry32(s) {
  let t = s >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);
const tmpVec = new Float32Array(INPUT_DIM);
console.log("Shuffling…");
for (let i = totalN - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  tmpVec.set(positions.subarray(i * INPUT_DIM, (i + 1) * INPUT_DIM));
  positions.copyWithin(i * INPUT_DIM, j * INPUT_DIM, (j + 1) * INPUT_DIM);
  positions.set(tmpVec, j * INPUT_DIM);
  const t = labels[i]; labels[i] = labels[j]; labels[j] = t;
  if (i % 500000 === 0) console.log(`  ${(totalN - i)}/${totalN}`);
}

const outPos = path.join(OUT_DIR, "positions.bin");
const outLab = path.join(OUT_DIR, "labels.bin");
const outMeta = path.join(OUT_DIR, "meta.json");
fs.writeFileSync(outPos, Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
fs.writeFileSync(outLab, Buffer.from(labels.buffer, labels.byteOffset, labels.byteLength));
fs.writeFileSync(outMeta, JSON.stringify({
  count: totalN,
  inputDim: INPUT_DIM,
  shuffleSeed: seed,
  source: {
    orig: { positions: args["orig-positions"], labels: args["orig-labels"], count: origN },
    new: { positions: args["new-positions"], labels: args["new-labels"], count: newN },
  },
  generatedAt: new Date().toISOString(),
}, null, 2));

console.log(`Wrote:`);
console.log(`  ${outPos} (${(positions.byteLength / 1024 / 1024).toFixed(1)} MB)`);
console.log(`  ${outLab} (${labels.byteLength} bytes)`);
console.log(`  ${outMeta}`);
console.log(`Combined dataset ready: ${totalN} positions`);

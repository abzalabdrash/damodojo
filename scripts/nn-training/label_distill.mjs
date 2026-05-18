/**
 * Knowledge-distillation labelling.
 *
 * Reads N positions from positions.bin, runs depth-12 search on each through
 * the production engine, writes per-position sigmoid(score/400) labels.
 *
 * Designed for parallel chunking — each worker processes a [start, end] range.
 *
 * Usage:
 *   node --import tsx scripts/nn-training/label_distill.mjs \
 *     --positions data/datasets/nn/positions.bin \
 *     --output data/datasets/nn/distilled.bin \
 *     --start 0 --end 100000 \
 *     --depth 12 --time-ms 500
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values: args } = parseArgs({
  options: {
    positions: { type: "string", default: "data/datasets/nn/positions.bin" },
    output: { type: "string", required: true },
    start: { type: "string", default: "0" },
    end: { type: "string", required: true },
    depth: { type: "string", default: "12" },
    "time-ms": { type: "string", default: "500" },
    "log-every": { type: "string", default: "1000" },
  },
  strict: false,
});

const POSITIONS_PATH = args.positions;
const OUTPUT_PATH = args.output;
const START = parseInt(args.start, 10);
const END = parseInt(args.end, 10);
const DEPTH = parseInt(args.depth, 10);
const TIME_MS = parseInt(args["time-ms"], 10);
const LOG_EVERY = parseInt(args["log-every"], 10);

const INPUT_DIM = 129;
const SCALE = 400;

async function loadTs(modulePath) {
  const url = pathToFileURL(path.resolve(modulePath)).href;
  return await import(url);
}

const fastStateMod = await loadTs("src/lib/engine-ai/board/fast-state.ts");
const iterativeMod = await loadTs("src/lib/engine-ai/search/iterative.ts");

const { initialFastState } = fastStateMod;
const { searchBestMove } = iterativeMod;

const OCCUPIED = 1;
const KING = 1 << 1;
const BLACK_FLAG = 1 << 2;

const WHITE_MAN = OCCUPIED;
const WHITE_KING = OCCUPIED | KING;
const BLACK_MAN = OCCUPIED | BLACK_FLAG;
const BLACK_KING = OCCUPIED | KING | BLACK_FLAG;

function decodePosition(buf, vecOffset) {
  const state = initialFastState();
  state.repetitionStack = [];
  state.endgame = null;
  for (let i = 0; i < 32; i++) {
    const base = vecOffset + i * 4;
    const wMan = buf[base + 0];
    const wKing = buf[base + 1];
    const bMan = buf[base + 2];
    const bKing = buf[base + 3];
    let cell = 0;
    if (wMan > 0.5) cell = WHITE_MAN;
    else if (wKing > 0.5) cell = WHITE_KING;
    else if (bMan > 0.5) cell = BLACK_MAN;
    else if (bKing > 0.5) cell = BLACK_KING;
    state.cells[i] = cell;
  }
  state.turn = buf[vecOffset + 128] > 0.5 ? 1 : 0;
  state.ply = 0;
  state.halfmoveClock = 0;
  return state;
}

function sigmoid(x) {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

const fd = fs.openSync(POSITIONS_PATH, "r");
const stat = fs.fstatSync(fd);
const totalPositions = stat.size / (INPUT_DIM * 4);
if (END > totalPositions) {
  console.error(`end=${END} > total=${totalPositions}`);
  process.exit(1);
}

const chunkCount = END - START;
const chunkBytes = chunkCount * INPUT_DIM * 4;
const chunkBuffer = Buffer.alloc(chunkBytes);
fs.readSync(fd, chunkBuffer, 0, chunkBytes, START * INPUT_DIM * 4);
fs.closeSync(fd);

const chunkFloats = new Float32Array(
  chunkBuffer.buffer,
  chunkBuffer.byteOffset,
  chunkCount * INPUT_DIM
);

const outScores = new Float32Array(chunkCount);

console.log(
  `Labelling positions [${START}, ${END}) (${chunkCount} positions), depth=${DEPTH} time=${TIME_MS}ms`
);
const t0 = Date.now();
let illegal = 0;

for (let i = 0; i < chunkCount; i++) {
  const state = decodePosition(chunkFloats, i * INPUT_DIM);
  let score;
  try {
    const r = searchBestMove(state, {
      maxDepth: DEPTH,
      timeMs: TIME_MS,
      hashSize: 1 << 15,
      useBook: false,
    });
    if (r.bestMove === null) {
      score = 0;
      illegal++;
    } else {
      score = sigmoid(r.score / SCALE);
    }
  } catch {
    score = 0.5;
    illegal++;
  }
  outScores[i] = score;

  if ((i + 1) % LOG_EVERY === 0) {
    const elapsed = (Date.now() - t0) / 1000;
    const rate = (i + 1) / elapsed;
    const eta = (chunkCount - i - 1) / rate;
    console.log(
      `  ${i + 1}/${chunkCount} | ${rate.toFixed(1)} pos/s | ETA ${(eta / 60).toFixed(1)}m | illegal=${illegal}`
    );
  }
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(
  OUTPUT_PATH,
  Buffer.from(outScores.buffer, outScores.byteOffset, outScores.byteLength)
);

const wallSec = (Date.now() - t0) / 1000;
console.log(
  `Wrote ${OUTPUT_PATH} (${outScores.byteLength} bytes, ${chunkCount} scores). ` +
    `${wallSec.toFixed(1)}s, ${(chunkCount / wallSec).toFixed(1)} pos/s, illegal=${illegal}`
);

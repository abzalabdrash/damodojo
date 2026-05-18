/**
 * Self-play game generator for AlphaZero-style iteration.
 *
 * Plays N games where both sides use the same engine + NN-weights configuration,
 * with light opening randomization (random plies + small temperature for the
 * first few non-random moves). Emits:
 *   - positions.bin (float32 LE, N_pos × 129)
 *   - labels.bin    (float32 LE, N_pos) — game-result from STM POV
 *   - meta.json     (counts, source = "self-play", seed, version)
 *
 * Designed for chunking: each worker writes one chunk; merge step concatenates.
 *
 * Usage:
 *   node --import tsx scripts/nn-training/self_play_generate.mjs \
 *     --weights public/nn/damanet.weights.bin \
 *     --manifest public/nn/damanet.manifest.json \
 *     --games 1000 --time-ms 100 --depth 6 \
 *     --seed 42 \
 *     --out-positions /data/selfplay/chunk_0001_positions.bin \
 *     --out-labels    /data/selfplay/chunk_0001_labels.bin
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values: args } = parseArgs({
  options: {
    weights: { type: "string", default: "" },
    manifest: { type: "string", default: "" },
    games: { type: "string", default: "100" },
    "time-ms": { type: "string", default: "100" },
    depth: { type: "string", default: "6" },
    "max-ply": { type: "string", default: "200" },
    "skip-first": { type: "string", default: "4" },
    "opening-randomization": { type: "string", default: "4" },
    seed: { type: "string", default: "1" },
    "out-positions": { type: "string", required: true },
    "out-labels": { type: "string", required: true },
    "log-every": { type: "string", default: "100" },
  },
  strict: false,
});

const WEIGHTS_PATH = args.weights;
const MANIFEST_PATH = args.manifest;
const GAMES = parseInt(args.games, 10);
const TIME_MS = parseInt(args["time-ms"], 10);
const DEPTH = parseInt(args.depth, 10);
const MAX_PLY = parseInt(args["max-ply"], 10);
const SKIP_FIRST = parseInt(args["skip-first"], 10);
const RAND_OPENING = parseInt(args["opening-randomization"], 10);
const SEED = parseInt(args.seed, 10);
const OUT_POSITIONS = args["out-positions"];
const OUT_LABELS = args["out-labels"];
const LOG_EVERY = parseInt(args["log-every"], 10);

const INPUT_DIM = 129;

async function loadTs(modulePath) {
  const url = pathToFileURL(path.resolve(modulePath)).href;
  return await import(url);
}

const fastStateMod = await loadTs("src/lib/engine-ai/board/fast-state.ts");
const makeMod = await loadTs("src/lib/engine-ai/board/make-unmake.ts");
const moveMod = await loadTs("src/lib/engine-ai/moves/generate.ts");
const iterativeMod = await loadTs("src/lib/engine-ai/search/iterative.ts");
const evaluatorMod = await loadTs("src/lib/engine-ai/nn/evaluator.ts");
const encodingMod = await loadTs("src/lib/engine-ai/nn/encoding.ts");

const { initialFastState, countFastPieces } = fastStateMod;
const { makeFastMove } = makeMod;
const { generateFastMoves } = moveMod;
const { searchBestMove } = iterativeMod;
const { setNNWeights } = evaluatorMod;
const { encodeFastState } = encodingMod;

if (WEIGHTS_PATH && MANIFEST_PATH) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const buf = fs.readFileSync(WEIGHTS_PATH);
  const blob = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  setNNWeights(blob, manifest);
  console.log(`Loaded NN weights: ${WEIGHTS_PATH}`);
} else {
  setNNWeights(null, null);
  console.log("No NN weights — classical-only self-play");
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Pre-allocate growable buffers (per-game positions). We collect everything
// into JS arrays first because we don't know total positions up front.
const allPositions = [];
const allLabels = [];

const encVec = new Float32Array(INPUT_DIM);

function playGame(gameSeed) {
  const rng = mulberry32(gameSeed);
  const state = initialFastState();
  const gamePositions = [];
  const gameStms = [];

  let ply = 0;
  let drawByRepetition = false;
  let drawByFiftyMove = false;
  let drawByEndgameRule = false;
  let noLegal = false;

  while (ply < MAX_PLY) {
    if (state.repetitionStack && state.repetitionStack.length > 0) {
      const key = state.repetitionStack[state.repetitionStack.length - 1];
      let n = 0;
      for (const k of state.repetitionStack) if (k === key) n++;
      if (n >= 3) { drawByRepetition = true; break; }
    }
    if (state.halfmoveClock >= 50) { drawByFiftyMove = true; break; }
    if (state.endgame) {
      const limit = state.endgame.kind === "kings_3v1" ? 30 : 10;
      if (state.endgame.plies >= limit) { drawByEndgameRule = true; break; }
    }

    const legal = generateFastMoves(state);
    if (legal.length === 0) { noLegal = true; break; }

    if (ply >= SKIP_FIRST) {
      const encoded = new Float32Array(INPUT_DIM);
      encodeFastState(state, encoded, 0);
      gamePositions.push(encoded);
      gameStms.push(state.turn);
    }

    let chosen;
    if (ply < RAND_OPENING) {
      chosen = legal[Math.floor(rng() * legal.length)];
    } else {
      const r = searchBestMove(state, {
        maxDepth: DEPTH,
        timeMs: TIME_MS,
        hashSize: 1 << 14,
        useBook: false,
      });
      chosen = r.bestMove ?? legal[0];
    }
    makeFastMove(state, chosen);
    ply++;
  }

  let whiteResult;
  if (noLegal) {
    whiteResult = state.turn === 0 ? 0.0 : 1.0;
  } else if (drawByRepetition || drawByFiftyMove || drawByEndgameRule) {
    whiteResult = 0.5;
  } else {
    const counts = countFastPieces(state);
    if (counts.white === 0) whiteResult = 0.0;
    else if (counts.black === 0) whiteResult = 1.0;
    else whiteResult = 0.5;
  }

  return { gamePositions, gameStms, whiteResult, ply };
}

console.log(
  `Self-play: games=${GAMES}, depth=${DEPTH}, time-budget=${TIME_MS}ms, seed=${SEED}`
);
const t0 = Date.now();

let whiteWins = 0;
let blackWins = 0;
let drawCount = 0;
let totalPly = 0;

for (let g = 0; g < GAMES; g++) {
  const { gamePositions, gameStms, whiteResult, ply } = playGame(SEED * 100000 + g);
  totalPly += ply;
  if (whiteResult === 1.0) whiteWins++;
  else if (whiteResult === 0.0) blackWins++;
  else drawCount++;

  for (let i = 0; i < gamePositions.length; i++) {
    allPositions.push(gamePositions[i]);
    const stm = gameStms[i];
    const stmLabel = stm === 1 ? 1.0 - whiteResult : whiteResult;
    allLabels.push(stmLabel);
  }

  if ((g + 1) % LOG_EVERY === 0) {
    const elapsed = (Date.now() - t0) / 1000;
    const rate = (g + 1) / elapsed;
    const eta = (GAMES - g - 1) / rate;
    console.log(
      `  ${g + 1}/${GAMES} games | ${rate.toFixed(2)} games/s | ETA ${(eta / 60).toFixed(1)}m | ` +
        `pos=${allPositions.length} | W=${whiteWins}/D=${drawCount}/B=${blackWins} | avgply=${(totalPly / (g + 1)).toFixed(0)}`
    );
  }
}

// Flatten positions into one Float32Array
const N = allPositions.length;
const posOut = new Float32Array(N * INPUT_DIM);
for (let i = 0; i < N; i++) {
  posOut.set(allPositions[i], i * INPUT_DIM);
}
const labOut = new Float32Array(allLabels);

fs.mkdirSync(path.dirname(OUT_POSITIONS), { recursive: true });
fs.mkdirSync(path.dirname(OUT_LABELS), { recursive: true });
fs.writeFileSync(
  OUT_POSITIONS,
  Buffer.from(posOut.buffer, posOut.byteOffset, posOut.byteLength)
);
fs.writeFileSync(
  OUT_LABELS,
  Buffer.from(labOut.buffer, labOut.byteOffset, labOut.byteLength)
);

const wallMin = (Date.now() - t0) / 1000 / 60;
console.log(
  `Done in ${wallMin.toFixed(1)} min: ${N} positions from ${GAMES} games. ` +
    `W=${whiteWins} D=${drawCount} B=${blackWins} (white winrate=${(whiteWins / GAMES * 100).toFixed(1)}%)`
);
console.log(`Wrote: ${OUT_POSITIONS} (${(posOut.byteLength / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Wrote: ${OUT_LABELS} (${labOut.byteLength} bytes)`);

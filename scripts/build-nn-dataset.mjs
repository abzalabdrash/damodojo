/**
 * Build a neural-network training dataset from downloaded PDN games.
 *
 * Pipeline:
 *   1. Recursively gather every *.pdn file under data/pdn/ (skipping empty/combined).
 *   2. Parse all games (PDN GameType 25 / Russian draughts).
 *   3. Play through each game, recording (position, result-from-stm-POV) pairs.
 *   4. Encode positions as 129-float vectors:
 *        32 dark squares × {w-man, w-king, b-man, b-king} = 128 one-hot floats
 *        + 1 side-to-move (0 = white, 1 = black)
 *   5. Write three artefacts under data/datasets/nn/:
 *        - positions.bin (float32 LE, [N × 129])
 *        - labels.bin    (float32 LE, [N])
 *        - meta.json     (count, dim, shuffle seed, source provenance)
 *
 * Usage:
 *   node scripts/build-nn-dataset.mjs
 *   node scripts/build-nn-dataset.mjs --max-games 5000 --min-elo 1800
 *
 * Expected runtime: 5-15 minutes for the full ~35k-game corpus.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values: args } = parseArgs({
  options: {
    "input-dir":  { type: "string",  default: "data/pdn" },
    "output-dir": { type: "string",  default: "data/datasets/nn" },
    "max-games":  { type: "string",  default: "0" },     // 0 = no cap
    "min-elo":    { type: "string",  default: "0" },
    "max-ply":    { type: "string",  default: "120" },
    "skip-first": { type: "string",  default: "4" },     // skip the opening few ply
    verbose:      { type: "boolean", default: false },
  },
  strict: false,
});

const INPUT_DIR = args["input-dir"];
const OUTPUT_DIR = args["output-dir"];
const MAX_GAMES = parseInt(args["max-games"], 10) || Infinity;
const MIN_ELO = parseInt(args["min-elo"], 10) || 0;
const MAX_PLY = parseInt(args["max-ply"], 10) || 120;
const SKIP_FIRST = parseInt(args["skip-first"], 10) || 0;
const VERBOSE = args.verbose;

const INPUT_DIM = 129;

// ---------------------------------------------------------------------------
// Dynamic import of engine modules (the project uses TS; rely on transpiled
// shims via tsx is heavy — instead we re-implement the small bits we need:
// PDN parsing, move application). For runtime speed we use the engine via
// tsx-loader if available; otherwise we fall back to a minimal in-script
// re-implementation. To keep this script self-contained, we load TS through
// the Node "tsx" hook.
// ---------------------------------------------------------------------------

const REQUIRED_TS_PATHS = [
  "src/lib/engine-ai/io/pdn.ts",
  "src/lib/engine-ai/board/fast-state.ts",
  "src/lib/engine-ai/board/make-unmake.ts",
  "src/lib/engine-ai/moves/generate.ts",
];
for (const p of REQUIRED_TS_PATHS) {
  if (!fs.existsSync(p)) {
    console.error(`Missing required source: ${p}`);
    process.exit(1);
  }
}

// Lazy-load tsx hook so we can import TS modules from this .mjs file.
async function loadTs(modulePath) {
  // Prefer the installed "tsx" loader if present.
  try {
    const url = pathToFileURL(path.resolve(modulePath)).href;
    // Register tsx ESM hook on first use.
    if (!globalThis.__tsxRegistered) {
      const { register } = await import("node:module");
      try {
        register("tsx/esm", pathToFileURL("./"));
        globalThis.__tsxRegistered = true;
      } catch (e) {
        // tsx not installed — caller will get a clearer error on import below.
        void e;
      }
    }
    return await import(url);
  } catch (e) {
    console.error(`Failed to import ${modulePath}: ${e.message}`);
    console.error("Install tsx: npm install --save-dev tsx");
    process.exit(1);
  }
}

const pdnMod = await loadTs("src/lib/engine-ai/io/pdn.ts");
const fastStateMod = await loadTs("src/lib/engine-ai/board/fast-state.ts");
const moveMod = await loadTs("src/lib/engine-ai/board/make-unmake.ts");
const generateMod = await loadTs("src/lib/engine-ai/moves/generate.ts");

const { parsePdnFile } = pdnMod;
const { initialFastState } = fastStateMod;
const { makeFastMove, unmakeFastMove } = moveMod;
const { generateFastMoves } = generateMod;

// Constants matching src/lib/engine-ai/types.ts
const EMPTY = 0;
const OCCUPIED = 1;
const KING = 1 << 1;
const BLACK_FLAG = 1 << 2;

function isOccupied(cell) { return (cell & OCCUPIED) !== 0; }
function isKing(cell) { return isOccupied(cell) && (cell & KING) !== 0; }
function isWhite(cell) { return isOccupied(cell) && (cell & BLACK_FLAG) === 0; }

// ---------------------------------------------------------------------------
// 1. Gather PDN files
// ---------------------------------------------------------------------------

function* walkPdnFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkPdnFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".pdn")) {
      if (entry.name.includes("combined")) continue;
      const stat = fs.statSync(fullPath);
      if (stat.size === 0) continue;
      yield fullPath;
    }
  }
}

console.log(`Scanning ${INPUT_DIR} for PDN files…`);
const pdnFiles = Array.from(walkPdnFiles(INPUT_DIR));
console.log(`Found ${pdnFiles.length} non-empty PDN files.`);

// ---------------------------------------------------------------------------
// 2. Parse all games
// ---------------------------------------------------------------------------

const games = [];
let parsedFiles = 0;
let skippedElo = 0;
for (const file of pdnFiles) {
  const text = fs.readFileSync(file, "utf-8");
  let parsed;
  try {
    parsed = parsePdnFile(text);
  } catch (e) {
    if (VERBOSE) console.warn(`  parse error in ${file}: ${e.message}`);
    continue;
  }
  parsedFiles++;
  for (const game of parsed) {
    if (game.result === "*") continue; // unfinished
    if (MIN_ELO > 0) {
      const wElo = game.whiteElo || 0;
      const bElo = game.blackElo || 0;
      const minPair = Math.min(wElo, bElo);
      if (minPair > 0 && minPair < MIN_ELO) { skippedElo++; continue; }
    }
    games.push(game);
    if (games.length >= MAX_GAMES) break;
  }
  if (games.length >= MAX_GAMES) break;
}
console.log(`Parsed ${games.length} valid games (from ${parsedFiles} files; ${skippedElo} skipped by Elo).`);

// ---------------------------------------------------------------------------
// 3. Play games and emit (position, label) pairs
// ---------------------------------------------------------------------------

/**
 * Map a PDN PdnMove to a FastMove by matching from/to indices among legal moves.
 */
function findFastMove(state, pdnMove) {
  const legal = generateFastMoves(state);
  for (const m of legal) {
    if (
      m.from.row === pdnMove.from.row &&
      m.from.col === pdnMove.from.col &&
      m.to.row === pdnMove.to.row &&
      m.to.col === pdnMove.to.col
    ) {
      return m;
    }
  }
  return null;
}

/**
 * Encode FastState cells into a 129-dim float vector and write into target.
 */
function encodePosition(state, target, offset) {
  for (let i = 0; i < 32; i++) {
    const base = offset + i * 4;
    const cell = state.cells[i];
    if (!isOccupied(cell)) {
      target[base] = 0; target[base + 1] = 0; target[base + 2] = 0; target[base + 3] = 0;
      continue;
    }
    const white = isWhite(cell);
    const king = isKing(cell);
    target[base + 0] = white && !king ? 1 : 0; // w-man
    target[base + 1] = white && king ? 1 : 0;  // w-king
    target[base + 2] = !white && !king ? 1 : 0; // b-man
    target[base + 3] = !white && king ? 1 : 0;  // b-king
  }
  target[offset + 128] = state.turn === 1 ? 1 : 0; // 1 = black to move
}

function gameResultValue(result) {
  // From WHITE's POV. 1 = white wins, 0 = black wins, 0.5 = draw.
  switch (result) {
    case "2-0":
    case "1-0":
      return 1.0;
    case "0-2":
    case "0-1":
      return 0.0;
    case "1-1":
    case "1/2-1/2":
      return 0.5;
    default:
      return null;
  }
}

console.log("Replaying games and emitting training pairs…");

// First pass: count valid examples so we can size the output exactly.
let totalExamples = 0;
const gameLabels = [];
let gameIdx = 0;
let failedGames = 0;
for (const game of games) {
  const whiteResult = gameResultValue(game.result);
  if (whiteResult === null) { failedGames++; continue; }
  // Walk through the game; count playable moves up to MAX_PLY.
  const state = initialFastState();
  let ply = 0;
  let valid = true;
  for (const pdnMove of game.moves) {
    if (ply >= MAX_PLY) break;
    const fm = findFastMove(state, pdnMove);
    if (!fm) { valid = false; break; }
    makeFastMove(state, fm);
    ply++;
  }
  if (!valid) { failedGames++; continue; }
  // Count positions we'll emit (one per played ply, after SKIP_FIRST).
  const emit = Math.max(0, Math.min(ply, MAX_PLY) - SKIP_FIRST);
  totalExamples += emit;
  gameLabels.push({ game, whiteResult, ply, emit });
  gameIdx++;
  if (VERBOSE && gameIdx % 1000 === 0) console.log(`  inspected ${gameIdx} games, ${totalExamples} examples so far`);
}
console.log(`Valid games: ${gameLabels.length}, ${failedGames} failed; total training positions: ${totalExamples}`);

// Allocate buffers.
const positions = new Float32Array(totalExamples * INPUT_DIM);
const labels = new Float32Array(totalExamples);

// Second pass: actually fill the buffers.
let cursor = 0;
let processed = 0;
for (const { game, whiteResult } of gameLabels) {
  const state = initialFastState();
  let ply = 0;
  for (const pdnMove of game.moves) {
    if (ply >= MAX_PLY) break;
    const fm = findFastMove(state, pdnMove);
    if (!fm) break;
    if (ply >= SKIP_FIRST) {
      const stmIsBlack = state.turn === 1;
      const stmLabel = stmIsBlack ? 1 - whiteResult : whiteResult;
      encodePosition(state, positions, cursor * INPUT_DIM);
      labels[cursor] = stmLabel;
      cursor++;
    }
    makeFastMove(state, fm);
    ply++;
  }
  processed++;
  if (processed % 1000 === 0) console.log(`  encoded ${processed} games (${cursor} positions)`);
}
console.log(`Encoded ${cursor} positions.`);

// ---------------------------------------------------------------------------
// 4. Shuffle (Fisher-Yates) using a fixed seed
// ---------------------------------------------------------------------------

const SHUFFLE_SEED = 0xc0ffee;
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
const rng = mulberry32(SHUFFLE_SEED);
const tmpVec = new Float32Array(INPUT_DIM);
for (let i = cursor - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  // Swap rows i and j in `positions`
  tmpVec.set(positions.subarray(i * INPUT_DIM, (i + 1) * INPUT_DIM));
  positions.copyWithin(i * INPUT_DIM, j * INPUT_DIM, (j + 1) * INPUT_DIM);
  positions.set(tmpVec, j * INPUT_DIM);
  const tmpL = labels[i]; labels[i] = labels[j]; labels[j] = tmpL;
}

// ---------------------------------------------------------------------------
// 5. Write artefacts
// ---------------------------------------------------------------------------

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const positionsPath = path.join(OUTPUT_DIR, "positions.bin");
const labelsPath = path.join(OUTPUT_DIR, "labels.bin");
const metaPath = path.join(OUTPUT_DIR, "meta.json");

fs.writeFileSync(positionsPath, Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
fs.writeFileSync(labelsPath, Buffer.from(labels.buffer, labels.byteOffset, labels.byteLength));
fs.writeFileSync(metaPath, JSON.stringify({
  count: cursor,
  inputDim: INPUT_DIM,
  shuffleSeed: SHUFFLE_SEED,
  encoding: {
    description: "32 dark squares × {w-man, w-king, b-man, b-king} one-hot + 1 side-to-move (0=w, 1=b).",
    perSquareChannels: ["w_man", "w_king", "b_man", "b_king"],
    layout: "row-major: square0_wman, square0_wking, square0_bman, square0_bking, square1_..., ..., square31_..., stm",
  },
  source: {
    pdnDir: INPUT_DIR,
    fileCount: pdnFiles.length,
    parsedFileCount: parsedFiles,
    gameCount: gameLabels.length,
    failedGameCount: failedGames,
    skippedByElo: skippedElo,
    minElo: MIN_ELO,
    maxPly: MAX_PLY,
    skipFirst: SKIP_FIRST,
  },
  generatedAt: new Date().toISOString(),
}, null, 2));

const positionsMB = (positions.byteLength / 1024 / 1024).toFixed(1);
const labelsMB = (labels.byteLength / 1024 / 1024).toFixed(2);
console.log(`Wrote:`);
console.log(`  ${positionsPath}  (${positionsMB} MB)`);
console.log(`  ${labelsPath}     (${labelsMB} MB)`);
console.log(`  ${metaPath}`);
console.log(`Dataset ready: ${cursor} training positions × ${INPUT_DIM} dims.`);

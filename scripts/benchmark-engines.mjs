/**
 * Engine-vs-engine benchmark for strength comparison.
 *
 * Plays N games between two engine configurations, alternating colors,
 * and reports Wins / Losses / Draws and an estimated Elo difference.
 *
 * Each player is a configuration consisting of:
 *   - name        — display label
 *   - useNN       — whether to load NN weights into the hybrid evaluator
 *   - weightsPath — path to damanet.weights.bin (only if useNN=true)
 *   - manifestPath — path to damanet.manifest.json (only if useNN=true)
 *
 * Because TS modules are shared across imports, we cannot have both
 * "classical" and "NN" eval active simultaneously — we re-install weights
 * before each move. To keep the bench honest, we run each game serially.
 *
 * Usage examples:
 *   # NN-trained vs classical-only (current default match-up)
 *   node --import tsx scripts/benchmark-engines.mjs \
 *     --player-a "NN_v1:public/nn/damanet.weights.bin:public/nn/damanet.manifest.json" \
 *     --player-b "Classical" \
 *     --games 40 --time-ms 300 --depth 8
 *
 *   # Two NN variants
 *   node --import tsx scripts/benchmark-engines.mjs \
 *     --player-a "NN_v2:.../v2.weights.bin:.../v2.manifest.json" \
 *     --player-b "NN_v1:public/nn/damanet.weights.bin:public/nn/damanet.manifest.json" \
 *     --games 40
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values: args } = parseArgs({
  options: {
    "player-a": { type: "string", required: true },
    "player-b": { type: "string", required: true },
    games: { type: "string", default: "40" },
    "time-ms": { type: "string", default: "300" },
    depth: { type: "string", default: "8" },
    "max-ply": { type: "string", default: "200" },
    seed: { type: "string", default: "1" },
    "opening-randomization": { type: "string", default: "4" },
    out: { type: "string", default: "" },
  },
  strict: false,
});

const GAMES = parseInt(args.games, 10);
const TIME_MS = parseInt(args["time-ms"], 10);
const DEPTH = parseInt(args.depth, 10);
const MAX_PLY = parseInt(args["max-ply"], 10);
const SEED = parseInt(args.seed, 10);
const RAND_OPENING = parseInt(args["opening-randomization"], 10);
const OUT_PATH = args.out || "";

async function loadTs(modulePath) {
  const url = pathToFileURL(path.resolve(modulePath)).href;
  return await import(url);
}

const fastStateMod = await loadTs("src/lib/engine-ai/board/fast-state.ts");
const makeMod = await loadTs("src/lib/engine-ai/board/make-unmake.ts");
const moveMod = await loadTs("src/lib/engine-ai/moves/generate.ts");
const iterativeMod = await loadTs("src/lib/engine-ai/search/iterative.ts");
const evaluatorMod = await loadTs("src/lib/engine-ai/nn/evaluator.ts");

const { initialFastState, countFastPieces } = fastStateMod;
const { makeFastMove } = makeMod;
const { generateFastMoves } = moveMod;
const { searchBestMove } = iterativeMod;
const { setNNWeights } = evaluatorMod;

function parsePlayer(spec) {
  // Format: "name" (classical only) or
  //         "name:weights:manifest" or
  //         "name:weights:manifest:cpScale:blend"
  const parts = spec.split(":");
  const name = parts[0];
  if (parts.length === 1) {
    return { name, useNN: false };
  }
  if (parts.length < 3) {
    throw new Error(`Bad player spec: ${spec}`);
  }
  const cpScale = parts.length >= 4 ? parseFloat(parts[3]) : undefined;
  const blend = parts.length >= 5 ? parseFloat(parts[4]) : undefined;
  return {
    name,
    useNN: true,
    weightsPath: parts[1],
    manifestPath: parts[2],
    cpScale,
    blend,
  };
}

function loadNNFromDisk(weightsPath, manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const buf = fs.readFileSync(weightsPath);
  const blob = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return { blob, manifest };
}

const playerA = parsePlayer(args["player-a"]);
const playerB = parsePlayer(args["player-b"]);

const nnA = playerA.useNN ? loadNNFromDisk(playerA.weightsPath, playerA.manifestPath) : null;
const nnB = playerB.useNN ? loadNNFromDisk(playerB.weightsPath, playerB.manifestPath) : null;

function activate(player) {
  if (!player.useNN) {
    setNNWeights(null, null);
    return;
  }
  const nn = player === playerA ? nnA : nnB;
  const cfg = {};
  if (player.cpScale !== undefined && !Number.isNaN(player.cpScale)) {
    cfg.cpScale = player.cpScale;
  }
  if (player.blend !== undefined && !Number.isNaN(player.blend)) {
    cfg.blend = player.blend;
  }
  setNNWeights(nn.blob, nn.manifest, cfg);
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

function playGame(white, black, gameSeed) {
  const rng = mulberry32(gameSeed);
  const state = initialFastState();
  const moves = [];
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

    const stm = state.turn;
    const player = stm === 0 ? white : black;
    activate(player);

    let chosen;
    if (ply < RAND_OPENING) {
      chosen = legal[Math.floor(rng() * legal.length)];
    } else {
      const r = searchBestMove(state, {
        maxDepth: DEPTH,
        timeMs: TIME_MS,
        hashSize: 1 << 15,
        useBook: false,
      });
      chosen = r.bestMove ?? legal[0];
    }
    moves.push(chosen);
    makeFastMove(state, chosen);
    ply++;
  }

  let result;
  if (noLegal) {
    result = state.turn === 0 ? "B" : "W";
  } else if (drawByRepetition || drawByFiftyMove || drawByEndgameRule) {
    result = "D";
  } else {
    const counts = countFastPieces(state);
    if (counts.white === 0) result = "B";
    else if (counts.black === 0) result = "W";
    else result = "D";
  }
  return { result, ply, moves: moves.length };
}

console.log(`Benchmark: ${playerA.name} vs ${playerB.name}`);
console.log(`Games: ${GAMES}, time-budget=${TIME_MS}ms, depth=${DEPTH}, opening-rand=${RAND_OPENING} ply`);
console.log("---");

let aWins = 0;
let bWins = 0;
let draws = 0;
const games = [];
const t0 = Date.now();

for (let g = 0; g < GAMES; g++) {
  const aIsWhite = g % 2 === 0;
  const white = aIsWhite ? playerA : playerB;
  const black = aIsWhite ? playerB : playerA;
  const seed = SEED * 1000 + g;
  const { result, ply } = playGame(white, black, seed);

  let aScore;
  if (result === "W") aScore = aIsWhite ? 1 : 0;
  else if (result === "B") aScore = aIsWhite ? 0 : 1;
  else aScore = 0.5;

  if (aScore === 1) aWins++;
  else if (aScore === 0) bWins++;
  else draws++;

  games.push({ index: g, aIsWhite, ply, result, aScore });

  const elapsed = (Date.now() - t0) / 1000;
  const aRate = (aWins + 0.5 * draws) / (g + 1);
  console.log(
    `  game ${(g + 1).toString().padStart(3)}/${GAMES}: ` +
      `${aIsWhite ? "W" : "B"}=${playerA.name.padEnd(10)} ` +
      `result=${result} ply=${ply.toString().padStart(3)} | ` +
      `A: ${aWins}-${bWins}-${draws} (${(aRate * 100).toFixed(1)}%) ` +
      `${elapsed.toFixed(0)}s`
  );
}

const aScore = (aWins + 0.5 * draws) / GAMES;
function eloFromScore(score) {
  if (score >= 1) return 999;
  if (score <= 0) return -999;
  return -400 * Math.log10(1 / score - 1);
}
const eloDiff = eloFromScore(aScore);

const std = Math.sqrt(aScore * (1 - aScore) / GAMES);
const score95Lo = Math.max(0, aScore - 1.96 * std);
const score95Hi = Math.min(1, aScore + 1.96 * std);
const eloLo = eloFromScore(score95Lo);
const eloHi = eloFromScore(score95Hi);

console.log("---");
console.log(`Final: ${playerA.name}  ${aWins}W - ${bWins}L - ${draws}D  vs  ${playerB.name}`);
console.log(`Score: ${(aScore * 100).toFixed(1)}% for ${playerA.name}`);
console.log(`Elo diff (A-B): ${eloDiff.toFixed(0)}  (95% CI: ${eloLo.toFixed(0)} .. ${eloHi.toFixed(0)})`);
console.log(`Wall time: ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);

if (OUT_PATH) {
  const summary = {
    playerA: playerA.name,
    playerB: playerB.name,
    games: GAMES,
    timeMs: TIME_MS,
    depth: DEPTH,
    aWins, bWins, draws,
    scoreA: aScore,
    eloDiff,
    elo95: [eloLo, eloHi],
    seed: SEED,
    wallSec: (Date.now() - t0) / 1000,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
  console.log(`\nWrote summary to ${OUT_PATH}`);
}

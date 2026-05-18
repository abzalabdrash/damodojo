/**
 * Build the opening book from downloaded PDN games.
 *
 * Usage:
 *   node scripts/build-openings.mjs
 *   node scripts/build-openings.mjs --input data/pdn/lidraughts-russian/combined.pdn --max-ply 12 --min-seen 3
 *
 * Output: src/lib/engine-ai/data/openings.json
 *
 * Algorithm:
 *   For each game, walk up to MAX_PLY half-moves.
 *   At each position, record the Zobrist hash → move token (encoded as fromIndex|toIndex).
 *   Keep a frequency count. Output entries with frequency >= MIN_SEEN.
 *
 * Uses the SAME Zobrist algorithm as src/lib/engine-ai/search/zobrist.ts so
 * the hashes produced here match what the engine looks up at runtime.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    input:      { type: "string",  default: "data/pdn/lidraughts-russian/combined.pdn" },
    output:     { type: "string",  default: "src/lib/engine-ai/data/openings.json" },
    "max-ply":  { type: "string",  default: "14" },
    "min-seen": { type: "string",  default: "3" },
    "min-elo":  { type: "string",  default: "0" },
    verbose:    { type: "boolean", default: false },
  },
  strict: false,
});

const INPUT_FILE = args.input;
const OUTPUT_FILE = args.output;
const MAX_PLY = parseInt(args["max-ply"], 10);
const MIN_SEEN = parseInt(args["min-seen"], 10);
const MIN_ELO = parseInt(args["min-elo"], 10);
const VERBOSE = args.verbose;

// ---------------------------------------------------------------------------
// Cell encoding (mirrors src/lib/engine-ai/types.ts)
// ---------------------------------------------------------------------------

const EMPTY      = 0;
const OCCUPIED   = 1;
const KING_FLAG  = 1 << 1;
const BLACK_FLAG = 1 << 2;

const WHITE_MAN  = OCCUPIED;
const WHITE_KING = OCCUPIED | KING_FLAG;
const BLACK_MAN  = OCCUPIED | BLACK_FLAG;
const BLACK_KING = OCCUPIED | KING_FLAG | BLACK_FLAG;

function isOccupied(cell) { return (cell & OCCUPIED) !== 0; }
function isKing(cell)     { return isOccupied(cell) && (cell & KING_FLAG) !== 0; }
function colorOf(cell)    { return (cell & BLACK_FLAG) !== 0 ? 1 : 0; } // 0=white, 1=black

// ---------------------------------------------------------------------------
// Square mapping (mirrors src/lib/engine-ai/board/encoding.ts)
// ---------------------------------------------------------------------------

/** Algebraic "c3" → 0-based cell index 0..31 */
function algToIndex(alg) {
  const col = alg.charCodeAt(0) - 97;   // a=0 … h=7
  const rank = parseInt(alg[1], 10);     // 1-8
  const row = 8 - rank;                  // rank 1 → row 7 (bottom)
  // Even rows: pieces on odd cols; odd rows: pieces on even cols
  const offset = (row & 1) === 0 ? (col - 1) / 2 : col / 2;
  return row * 4 + offset;
}

/** 0-based index → algebraic string (for debug output) */
function indexToAlg(idx) {
  const row = Math.floor(idx / 4);
  const offset = idx % 4;
  const col = (row & 1) === 0 ? offset * 2 + 1 : offset * 2;
  const rank = 8 - row;
  return String.fromCharCode(97 + col) + rank;
}

// ---------------------------------------------------------------------------
// Zobrist hash (MUST match src/lib/engine-ai/search/zobrist.ts exactly)
// ---------------------------------------------------------------------------

const PIECES = [WHITE_MAN, WHITE_KING, BLACK_MAN, BLACK_KING];

function xorshift32(seed) {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

const _PIECE_KEYS = new Uint32Array(32 * 4);
let _seed = 0x12345678;
for (let i = 0; i < _PIECE_KEYS.length; i++) {
  _seed = xorshift32(_seed);
  _PIECE_KEYS[i] = _seed;
}
const _SIDE_KEY = xorshift32(0x9e3779b9);

/** Build the piece-type → slot map (same as the engine's PIECE_TO_SLOT) */
const PIECE_TO_SLOT = new Map(PIECES.map((p, i) => [p, i]));

function computeZobrist(cells, turn) {
  let hash = 0;
  for (let i = 0; i < 32; i++) {
    const slot = PIECE_TO_SLOT.get(cells[i]);
    if (slot === undefined) continue;
    hash ^= _PIECE_KEYS[i * 4 + slot];
  }
  if (turn === 1) hash ^= _SIDE_KEY;
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Initial board (mirrors src/lib/engine-ai/board/fast-state.ts initialFastState)
// ---------------------------------------------------------------------------

function makeInitialBoard() {
  const cells = new Uint8Array(32);
  for (let n = 1; n <= 32; n++) {
    const row = Math.floor((n - 1) / 4);
    if (row < 3) cells[n - 1] = BLACK_MAN;
    else if (row > 4) cells[n - 1] = WHITE_MAN;
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Square row/col helpers
// ---------------------------------------------------------------------------

function idxToRowCol(idx) {
  const row = Math.floor(idx / 4);
  const offset = idx % 4;
  const col = (row & 1) === 0 ? offset * 2 + 1 : offset * 2;
  return { row, col };
}

function rowColToIdx(row, col) {
  if (row < 0 || row > 7 || col < 0 || col > 7) return -1;
  if (((row + col) & 1) === 0) return -1; // light square
  const offset = (row & 1) === 0 ? (col - 1) / 2 : col / 2;
  if (offset < 0 || offset > 3) return -1;
  return row * 4 + offset;
}

// ---------------------------------------------------------------------------
// Apply a PDN half-move to cells.
// `hopSquares` = all squares in the move chain (including from and to).
// For a simple move ["c3","b4"]: 2 squares, 0 captures.
// For a capture "b4xd6": 2 squares, midpoint is the captured square.
// For a multi-hop "h4xf2xd4": 3 squares, two midpoints are captured squares.
// For a king long-range capture "a1xh8": must scan diagonal for opponent.
// ---------------------------------------------------------------------------

function applyMove(cells, turn, hopSquares, isCapture) {
  const fromIdx = hopSquares[0];
  const toIdx   = hopSquares[hopSquares.length - 1];
  const piece   = cells[fromIdx];
  if (!isOccupied(piece)) return; // bad PDN — skip silently

  cells[fromIdx] = EMPTY;

  if (isCapture) {
    // Remove opponent pieces between each consecutive pair of hop squares
    for (let h = 0; h < hopSquares.length - 1; h++) {
      const a = idxToRowCol(hopSquares[h]);
      const b = idxToRowCol(hopSquares[h + 1]);
      const dRow = b.row > a.row ? 1 : -1;
      const dCol = b.col > a.col ? 1 : -1;
      let r = a.row + dRow;
      let c = a.col + dCol;
      // Walk from sq[h] to sq[h+1] along the diagonal; this loop is safe
      // because a and b are guaranteed on the same diagonal.
      let steps = 0;
      while ((r !== b.row || c !== b.col) && steps < 8) {
        const idx = rowColToIdx(r, c);
        if (idx >= 0 && isOccupied(cells[idx]) && colorOf(cells[idx]) !== turn) {
          cells[idx] = EMPTY;
        }
        r += dRow;
        c += dCol;
        steps++;
      }
    }
  }

  // Promotion: man reaching the back rank
  const destRow = idxToRowCol(toIdx).row;
  const isPromotion =
    !isKing(piece) &&
    ((turn === 0 && destRow === 0) || (turn === 1 && destRow === 7));

  cells[toIdx] = isPromotion
    ? (turn === 0 ? WHITE_KING : BLACK_KING)
    : piece;
}

// ---------------------------------------------------------------------------
// PDN parser (minimal — mirrors src/lib/engine-ai/io/pdn.ts)
// ---------------------------------------------------------------------------

const TAG_RE = /\[(\w+)\s+"([^"]*)"\]/g;
const MOVE_RE = /[a-h][1-8](?:[x\-][a-h][1-8])+/g;
const RESULT_TOKENS = new Set(["2-0","0-2","1-1","1-0","0-1","1/2-1/2","*"]);

function parseTags(block) {
  TAG_RE.lastIndex = 0;
  const tags = {};
  let m;
  while ((m = TAG_RE.exec(block)) !== null) tags[m[1]] = m[2];
  return tags;
}

function parseMovesRaw(movesText) {
  // Strip block comments
  const clean = movesText.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  const moves = [];
  MOVE_RE.lastIndex = 0;
  let m;
  while ((m = MOVE_RE.exec(clean)) !== null) {
    const raw = m[0];
    const squares = raw.split(/[x\-]/);
    const hopIndices = squares.map(algToIndex);
    const fromIdx = hopIndices[0];
    const toIdx   = hopIndices[hopIndices.length - 1];
    moves.push({ raw, fromIdx, toIdx, hopIndices, isCapture: raw.includes("x") });
  }
  return moves;
}

function parseGames(text) {
  const segments = text.split(/(?=\[Event\s+")/).filter(s => s.trim().length > 0);
  const games = [];
  for (const seg of segments) {
    const lines = seg.split("\n");
    let tagBlock = "", moveBlock = "", inMoves = false;
    for (const line of lines) {
      const t = line.trim();
      if (!inMoves && t.startsWith("[")) { tagBlock += line + "\n"; }
      else if (t.length > 0) { inMoves = true; moveBlock += line + " "; }
    }
    const tags = parseTags(tagBlock);
    if (!tags.Event) continue;
    const moves = parseMovesRaw(moveBlock);
    if (moves.length === 0) continue;

    const resultToken = moveBlock.trim().split(/\s+/).reverse().find(t => RESULT_TOKENS.has(t)) || "*";
    games.push({ tags, moves, result: resultToken });
  }
  return games;
}

// ---------------------------------------------------------------------------
// Opening book builder
// ---------------------------------------------------------------------------

/**
 * book: Map<hashString, Map<moveToken, count>>
 * moveToken: `${fromIdx}|${toIdx}`
 */
function buildBook(games) {
  const book = new Map();
  let gamesProcessed = 0;
  let movesRecorded = 0;
  let gamesSkipped = 0;

  for (const game of games) {
    // Optionally filter by ELO
    if (MIN_ELO > 0) {
      const wElo = parseInt(game.tags.WhiteElo || "0", 10);
      const bElo = parseInt(game.tags.BlackElo || "0", 10);
      if (wElo < MIN_ELO && bElo < MIN_ELO) { gamesSkipped++; continue; }
    }

    const cells = makeInitialBoard();
    let turn = 0; // 0=white, 1=black

    for (let ply = 0; ply < Math.min(game.moves.length, MAX_PLY); ply++) {
      const { fromIdx, toIdx, hopIndices, isCapture } = game.moves[ply];

      // Validate indices
      if (fromIdx < 0 || fromIdx >= 32 || toIdx < 0 || toIdx >= 32) break;
      if (!isOccupied(cells[fromIdx])) break; // corrupt game

      const hash = computeZobrist(cells, turn);
      const hashKey = hash.toString(36);
      const moveToken = fromIdx * 32 + toIdx; // compact 10-bit token

      if (!book.has(hashKey)) book.set(hashKey, new Map());
      const moveCounts = book.get(hashKey);
      moveCounts.set(moveToken, (moveCounts.get(moveToken) || 0) + 1);
      movesRecorded++;

      applyMove(cells, turn, hopIndices, isCapture);
      turn ^= 1;
    }

    gamesProcessed++;
  }

  return { book, gamesProcessed, gamesSkipped, movesRecorded };
}

function serializeBook(book) {
  const out = {};
  let totalPositions = 0;
  let totalMoves = 0;

  for (const [hashKey, moveCounts] of book) {
    const filtered = [...moveCounts.entries()]
      .filter(([, count]) => count >= MIN_SEEN)
      .sort((a, b) => b[1] - a[1]);  // sort by frequency desc

    if (filtered.length === 0) continue;
    const total = filtered.reduce((s, [, c]) => s + c, 0);

    out[hashKey] = filtered.map(([token, count]) => ({
      move: token,         // fromIdx*32+toIdx — decoded at runtime
      weight: Math.round((count / total) * 100), // 0-100 probability weight
      seen: count,
    }));

    totalPositions++;
    totalMoves += filtered.length;
  }

  return { out, totalPositions, totalMoves };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("DamaDojo opening book builder");
console.log(`Input:     ${INPUT_FILE}`);
console.log(`Output:    ${OUTPUT_FILE}`);
console.log(`Max ply:   ${MAX_PLY}`);
console.log(`Min seen:  ${MIN_SEEN}`);
console.log(`Min ELO:   ${MIN_ELO || "any"}`);
console.log("");

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`ERROR: Input file not found: ${INPUT_FILE}`);
  console.error("Run: npm run data:lidraughts  to download games first.");
  process.exit(1);
}

console.log("Reading PDN...");
const raw = fs.readFileSync(INPUT_FILE, "utf8");
const fileSizeMB = (Buffer.byteLength(raw, "utf8") / 1_000_000).toFixed(1);

console.log("Parsing games...");
const games = parseGames(raw);
console.log(`  Games found:   ${games.length} (file: ${fileSizeMB} MB)`);

console.log("Building opening tree...");
const { book, gamesProcessed, gamesSkipped, movesRecorded } = buildBook(games);
console.log(`  Games processed: ${gamesProcessed}`);
if (gamesSkipped > 0) console.log(`  Games skipped (below ELO):  ${gamesSkipped}`);
console.log(`  Moves recorded:  ${movesRecorded}`);
console.log(`  Unique positions: ${book.size}`);

console.log(`Serializing (min_seen=${MIN_SEEN})...`);
const { out, totalPositions, totalMoves } = serializeBook(book);
console.log(`  Positions in book: ${totalPositions}`);
console.log(`  Total moves in book: ${totalMoves}`);

const outputDir = path.dirname(OUTPUT_FILE);
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out), "utf8"); // minified

const outputSizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
console.log(`  Output size: ${outputSizeKB} KB`);
console.log(`\nWrote: ${OUTPUT_FILE}`);

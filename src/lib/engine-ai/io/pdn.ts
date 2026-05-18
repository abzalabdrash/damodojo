/**
 * PDN (Portable Draughts Notation) parser for Russian variant (GameType 25).
 *
 * Parses PDN text exported from lidraughts.org into structured game objects.
 * Square notation uses algebraic coordinates (a1–h8) as used by lidraughts.
 * Converts squares to engine FastSquare {row, col} where row 0 = top, row 7 = bottom.
 *
 * Supported PDN features:
 *   - Tag pairs: [Key "Value"]
 *   - Simple moves: c3-b4
 *   - Captures: b4xd6
 *   - FEN tag (starting position)
 *   - Results: 2-0, 0-2, 1-1, 1-0, 0-1, 1/2-1/2, *
 *   - Inline comments: { ... } stripped
 *   - Line comments: ; stripped
 *   - Move number indicators and NAGs (%/$/!/?/+) stripped
 *   - Multiple games per file
 */

import type { FastSquare } from "../types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PdnResult = "2-0" | "0-2" | "1-1" | "1-0" | "0-1" | "1/2-1/2" | "*";

export interface PdnMove {
  /** Original text, e.g. "c3-b4" or "b4xd6" */
  readonly raw: string;
  /** Engine square of the moving piece (row 0 = top) */
  readonly from: FastSquare;
  /** Engine square of the destination */
  readonly to: FastSquare;
  /** Whether this half-move is a capture */
  readonly isCapture: boolean;
  /** 0-based index into cells array (from.row * 4 + ...) */
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface PdnGame {
  /** All tag pairs as a plain object, e.g. tags["White"] = "JustNobody19" */
  readonly tags: Readonly<Record<string, string>>;
  /** Ordered half-moves (plies). Length = number of half-moves played. */
  readonly moves: readonly PdnMove[];
  readonly result: PdnResult;
  // Convenience shortcuts (may be empty string / NaN if tag absent)
  readonly white: string;
  readonly black: string;
  readonly whiteElo: number;
  readonly blackElo: number;
  /** GameType tag: "25" = Russian 8×8 */
  readonly gameType: string;
}

// ---------------------------------------------------------------------------
// Square conversion: algebraic ↔ FastSquare
// ---------------------------------------------------------------------------

/**
 * Convert algebraic square (e.g. "c3") to engine FastSquare.
 * File a-h → col 0-7; Rank 1-8 → row 7-0 (rank 1 = bottom = row 7).
 */
export function algToFastSquare(alg: string): FastSquare {
  const file = alg.charCodeAt(0) - 97; // 'a'=0 … 'h'=7
  const rank = parseInt(alg[1], 10);    // 1-8
  return { row: 8 - rank, col: file };
}

/** Convert FastSquare to algebraic string. */
export function fastSquareToAlg(sq: FastSquare): string {
  return String.fromCharCode(97 + sq.col) + String(8 - sq.row);
}

/**
 * Map FastSquare to 0-based cells index (0..31).
 * Cells array uses Russian square numbering: index = (row*4 + offsetInRow).
 * Even rows have pieces on odd columns; odd rows on even columns.
 */
export function fastSquareToIndex(sq: FastSquare): number {
  const { row, col } = sq;
  // Offset within the row: even rows start at col 1, odd rows at col 0
  const offset = (row & 1) === 0 ? (col - 1) / 2 : col / 2;
  return row * 4 + offset;
}

// ---------------------------------------------------------------------------
// PDN tokeniser / parser internals
// ---------------------------------------------------------------------------

const TAG_RE = /\[(\w+)\s+"([^"]*)"\]/g;
// Matches a full PDN move token, including multi-hop captures: e.g. "c3-b4", "h4xf2xd4"
const MOVE_TOKEN_RE = /[a-h][1-8](?:[x\-][a-h][1-8])+/g;
// Result tokens
const RESULT_TOKENS = new Set(["2-0", "0-2", "1-1", "1-0", "0-1", "1/2-1/2", "*"]);

function stripNoise(text: string): string {
  // Remove block comments { … }
  let out = text.replace(/\{[^}]*\}/g, " ");
  // Remove line comments ; … \n
  out = out.replace(/;[^\n]*/g, " ");
  return out;
}

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {};
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(block)) !== null) {
    tags[m[1]] = m[2];
  }
  return tags;
}

function parseMoves(movesText: string): PdnMove[] {
  const clean = stripNoise(movesText);
  const moves: PdnMove[] = [];

  MOVE_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MOVE_TOKEN_RE.exec(clean)) !== null) {
    const raw = m[0];
    // Split on separator chars to get all squares in the chain
    const squares = raw.split(/[x\-]/);
    const fromAlg = squares[0];
    const toAlg = squares[squares.length - 1];
    const isCapture = raw.includes("x");
    const from = algToFastSquare(fromAlg);
    const to = algToFastSquare(toAlg);
    moves.push({
      raw,
      from,
      to,
      isCapture,
      fromIndex: fastSquareToIndex(from),
      toIndex: fastSquareToIndex(to),
    });
  }

  return moves;
}

function detectResult(movesText: string): PdnResult {
  // Result usually appears at the end; scan tokens right-to-left
  const tokens = movesText.trim().split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (RESULT_TOKENS.has(tokens[i])) return tokens[i] as PdnResult;
  }
  return "*";
}

function buildGame(tags: Record<string, string>, movesText: string): PdnGame {
  return {
    tags,
    moves: parseMoves(movesText),
    result: detectResult(movesText),
    white: tags["White"] ?? "",
    black: tags["Black"] ?? "",
    whiteElo: parseInt(tags["WhiteElo"] ?? "", 10),
    blackElo: parseInt(tags["BlackElo"] ?? "", 10),
    gameType: tags["GameType"] ?? "",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a PDN string containing one or more games.
 * Returns only games that have at least one move.
 */
export function parsePdn(text: string): PdnGame[] {
  const games: PdnGame[] = [];

  // Split on double-newline or tag-block boundaries
  // Strategy: collect characters; when we see a tag block followed by a non-tag block, that's a game.
  // Simpler: split the file into segments by finding tag blocks.

  // We split on "[Event " as the game separator (every game starts with [Event])
  const segments = text.split(/(?=\[Event\s+")/).filter((s) => s.trim().length > 0);

  for (const seg of segments) {
    // Split segment into tag block vs moves text
    // Tags are lines starting with '['; moves come after
    const lines = seg.split("\n");
    let tagLines = "";
    let moveLines = "";
    let inMoves = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!inMoves && trimmed.startsWith("[")) {
        tagLines += line + "\n";
      } else if (trimmed.length > 0) {
        inMoves = true;
        moveLines += line + " ";
      }
    }

    const tags = parseTags(tagLines);
    if (!tags["Event"]) continue; // not a game

    const game = buildGame(tags, moveLines);
    if (game.moves.length > 0) {
      games.push(game);
    }
  }

  return games;
}

/**
 * Parse a PDN file exported by lidraughts.  Only includes Russian-variant
 * games (GameType "25") when `russianOnly` is true (default).
 */
export function parsePdnFile(text: string, russianOnly = true): PdnGame[] {
  const games = parsePdn(text);
  if (!russianOnly) return games;
  return games.filter((g) => g.gameType === "25" || g.gameType === "");
}

/** Render a single game back to PDN text (tags + moves). */
export function gameToPdn(game: PdnGame): string {
  const tagLines = Object.entries(game.tags)
    .map(([k, v]) => `[${k} "${v}"]`)
    .join("\n");

  const movePairs: string[] = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const w = game.moves[i].raw;
    const b = game.moves[i + 1]?.raw ?? "";
    movePairs.push(`${num}. ${w}${b ? " " + b : ""}`);
  }

  return `${tagLines}\n\n${movePairs.join(" ")} ${game.result}\n`;
}

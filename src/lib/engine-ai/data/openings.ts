/**
 * Opening book runtime module.
 *
 * The book is built by scripts/build-openings.mjs from downloaded PDN games.
 * Each entry maps a Zobrist hash (as base-36 string) to a list of weighted moves.
 *
 * Move token encoding: fromIndex * 32 + toIndex (both 0-based, 0..31).
 */

import type { FastState } from "../types";
import { computeZobrist } from "../search/zobrist";
import bookData from "./openings.json";

export interface BookEntry {
  /** fromIndex * 32 + toIndex */
  readonly move: number;
  /** 0-100 probability weight among book moves from this position */
  readonly weight: number;
  /** How many games had this move at this position */
  readonly seen: number;
}

const BOOK = bookData as Record<string, BookEntry[]>;

/** Decode a move token into {fromIndex, toIndex}. */
export function decodeBookMove(token: number): { fromIndex: number; toIndex: number } {
  return { fromIndex: Math.floor(token / 32), toIndex: token % 32 };
}

/**
 * Look up a position in the opening book.
 * Returns the list of weighted moves, or null if the position is unknown.
 */
export function lookupBook(state: FastState): BookEntry[] | null {
  const hash = computeZobrist(state);
  const key = hash.toString(36);
  return BOOK[key] ?? null;
}

/**
 * Pick a book move for a position using weighted random sampling.
 * Returns null if position not in book or no book moves available.
 * Pass `randomFn` to inject a deterministic RNG (defaults to Math.random).
 */
export function pickBookMove(
  state: FastState,
  randomFn: () => number = Math.random
): { fromIndex: number; toIndex: number } | null {
  const entries = lookupBook(state);
  if (!entries || entries.length === 0) return null;

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) return null;

  let rand = randomFn() * totalWeight;
  for (const entry of entries) {
    rand -= entry.weight;
    if (rand <= 0) return decodeBookMove(entry.move);
  }
  // Fallback: return top-weighted move
  return decodeBookMove(entries[0].move);
}

/**
 * Check if a position is in the book (without picking a move).
 * Useful to decide whether to probe before searching.
 */
export function isInBook(state: FastState): boolean {
  return lookupBook(state) !== null;
}

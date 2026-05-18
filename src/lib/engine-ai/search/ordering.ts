import type { FastMove } from "../types";

const MAX_KILLER_PLY = 64;

export interface SearchHeuristics {
  readonly history: Int32Array;
  /** Two killer slots per ply: quiet moves that caused a beta cutoff. */
  readonly killers: Array<[FastMove | null, FastMove | null]>;
}

export function createSearchHeuristics(): SearchHeuristics {
  const killers: Array<[FastMove | null, FastMove | null]> = [];
  for (let i = 0; i < MAX_KILLER_PLY; i++) killers.push([null, null]);
  return {
    history: new Int32Array(32 * 32),
    killers,
  };
}

export function orderMoves(
  moves: readonly FastMove[],
  ttMove: FastMove | null | undefined,
  heuristics: SearchHeuristics,
  ply = 0
): FastMove[] {
  return [...moves].sort(
    (a, b) => scoreMove(b, ttMove, heuristics, ply) - scoreMove(a, ttMove, heuristics, ply)
  );
}

export function recordHistory(move: FastMove, depth: number, heuristics: SearchHeuristics): void {
  heuristics.history[historyIndex(move)] += depth * depth;
}

export function recordKiller(move: FastMove, ply: number, heuristics: SearchHeuristics): void {
  if (ply < 0 || ply >= MAX_KILLER_PLY) return;
  if (move.captures.length > 0) return; // killers only track quiet moves
  const slot = heuristics.killers[ply];
  if (slot[0] && sameMove(slot[0], move)) return;
  slot[1] = slot[0];
  slot[0] = move;
}

function scoreMove(
  move: FastMove,
  ttMove: FastMove | null | undefined,
  heuristics: SearchHeuristics,
  ply: number
): number {
  let score = 0;
  if (ttMove && sameMove(move, ttMove)) score += 1_000_000;
  if (move.captures.length > 0) score += 100_000 + move.captures.length * 10_000;
  if (move.promoted) score += 5_000;
  if (ply >= 0 && ply < MAX_KILLER_PLY) {
    const [k1, k2] = heuristics.killers[ply];
    if (k1 && sameMove(k1, move)) score += 9_000;
    else if (k2 && sameMove(k2, move)) score += 8_000;
  }
  score += heuristics.history[historyIndex(move)];
  return score;
}

function historyIndex(move: FastMove): number {
  return move.fromIndex * 32 + move.toIndex;
}

function sameMove(a: FastMove, b: FastMove): boolean {
  if (a.fromIndex !== b.fromIndex || a.toIndex !== b.toIndex) return false;
  if (a.pathIndices.length !== b.pathIndices.length) return false;
  for (let i = 0; i < a.pathIndices.length; i++) {
    if (a.pathIndices[i] !== b.pathIndices[i]) return false;
  }
  return true;
}

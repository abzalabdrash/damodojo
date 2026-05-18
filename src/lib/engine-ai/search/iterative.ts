import type { FastMove, FastState } from "../types";
import { pickBookMove, decodeBookMove } from "../data/openings";
import { generateFastMoves } from "../moves/generate";
import { createSearchHeuristics } from "./ordering";
import { searchRoot } from "./negamax";
import { TranspositionTable } from "./tt";

export interface SearchBestMoveOptions {
  readonly maxDepth?: number;
  readonly timeMs?: number;
  readonly hashSize?: number;
  readonly useBook?: boolean;
}

export interface BestMoveResult {
  readonly bestMove: FastMove | null;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly nps: number;
  readonly elapsedMs: number;
  readonly pv: readonly FastMove[];
  readonly fromBook?: boolean;
}

export function searchBestMove(
  state: FastState,
  options: SearchBestMoveOptions = {}
): BestMoveResult {
  const maxDepth = Math.max(1, options.maxDepth ?? 8);
  const timeMs = Math.max(1, options.timeMs ?? 1000);
  const useBook = options.useBook !== false; // default: true
  const started = now();

  // Probe opening book first (only in the opening — ply < 28)
  if (useBook && state.ply < 28) {
    const bookToken = pickBookMove(state);
    if (bookToken !== null) {
      const { fromIndex, toIndex } = bookToken;
      // Find the matching FastMove from legal moves
      const legalMoves = generateFastMoves(state);
      const bookMove = legalMoves.find(
        (m) => m.fromIndex === fromIndex && m.toIndex === toIndex
      );
      if (bookMove) {
        const elapsed = Math.max(0, now() - started);
        return {
          bestMove: bookMove,
          score: 0,
          depth: 0,
          nodes: 0,
          nps: 0,
          elapsedMs: elapsed,
          pv: [bookMove],
          fromBook: true,
        };
      }
    }
  }

  const tt = new TranspositionTable(options.hashSize ?? 1 << 16);
  const heuristics = createSearchHeuristics();

  let best: BestMoveResult = {
    bestMove: null,
    score: 0,
    depth: 0,
    nodes: 0,
    nps: 0,
    elapsedMs: 0,
    pv: [],
  };
  let totalNodes = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (now() - started >= timeMs && best.depth > 0) break;
    const result = searchRoot(state, { depth, tt, heuristics });
    totalNodes += result.nodes;
    const elapsedMs = Math.max(0, now() - started);
    best = {
      bestMove: result.bestMove,
      score: result.score,
      depth: result.depth,
      nodes: totalNodes,
      nps: nodesPerSecond(totalNodes, elapsedMs),
      elapsedMs,
      pv: result.pv,
    };
    if (elapsedMs >= timeMs) break;
  }

  return best;
}

function nodesPerSecond(nodes: number, elapsedMs: number): number {
  return elapsedMs <= 0 ? nodes * 1000 : Math.round((nodes * 1000) / elapsedMs);
}

function now(): number {
  return Date.now();
}

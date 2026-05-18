import { terminalScore } from "../eval/evaluate";
import { evaluateHybrid as evaluate } from "../nn/evaluator";
import { makeFastMove, unmakeFastMove } from "../board/make-unmake";
import { countFastPieces, opponent } from "../board/fast-state";
import { generateFastMoves } from "../moves/generate";
import { probeTablebase, tablebaseScore } from "../tablebase/probe";
import { computeZobrist } from "./zobrist";
import { TTFlag, TranspositionTable } from "./tt";
import { createSearchHeuristics, orderMoves, recordHistory, recordKiller, type SearchHeuristics } from "./ordering";
import { quiescence } from "./quiescence";
import type { FastMove, FastState } from "../types";

const INF = 1_000_000;
const NMP_REDUCTION = 2; // Reduction factor R for null-move pruning.
const NMP_MIN_DEPTH = 3; // Don't try NMP shallower than this.
const NMP_MIN_MATERIAL = 400; // Avoid NMP in pure endgames (zugzwang risk).
const LMR_MIN_DEPTH = 3;
const LMR_FIRST_REDUCED = 4; // After this many fully searched moves, start reducing.

export interface SearchRootOptions {
  readonly depth: number;
  readonly tt?: TranspositionTable;
  readonly heuristics?: SearchHeuristics;
}

export interface SearchResult {
  readonly bestMove: FastMove | null;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly pv: readonly FastMove[];
}

interface SearchContext {
  nodes: number;
  tt: TranspositionTable;
  heuristics: SearchHeuristics;
}

export function searchRoot(state: FastState, options: SearchRootOptions): SearchResult {
  const depth = Math.max(1, options.depth);
  const ctx: SearchContext = {
    nodes: 0,
    tt: options.tt ?? new TranspositionTable(1 << 16),
    heuristics: options.heuristics ?? createSearchHeuristics(),
  };
  ctx.tt.nextSearch();

  const moves = generateFastMoves(state);
  if (moves.length === 0) {
    return { bestMove: null, score: -INF, depth, nodes: 0, pv: [] };
  }

  const key = computeZobrist(state);
  const ttMove = ctx.tt.probe(key)?.bestMove ?? null;
  let bestMove: FastMove | null = null;
  let bestScore = -INF;
  let alpha = -INF;
  const beta = INF;

  for (const move of orderMoves(moves, ttMove, ctx.heuristics, 0)) {
    const undo = makeFastMove(state, move);
    const score = -negamax(state, depth - 1, -beta, -alpha, 1, ctx);
    unmakeFastMove(state, undo);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
  }

  ctx.tt.store(key, {
    depth,
    flag: TTFlag.Exact,
    score: bestScore,
    bestMove,
  });

  return {
    bestMove,
    score: bestScore,
    depth,
    nodes: ctx.nodes,
    pv: bestMove ? [bestMove] : [],
  };
}

function negamax(
  state: FastState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchContext
): number {
  ctx.nodes++;
  const terminal = detectTerminal(state, ply);
  if (terminal !== null) return terminal;

  const isPv = beta - alpha > 1;
  const alphaOrig = alpha;
  const key = computeZobrist(state);
  const ttEntry = ctx.tt.probe(key);
  if (!isPv && ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TTFlag.Exact) return ttEntry.score;
    if (ttEntry.flag === TTFlag.Lower) alpha = Math.max(alpha, ttEntry.score);
    else if (ttEntry.flag === TTFlag.Upper) beta = Math.min(beta, ttEntry.score);
    if (alpha >= beta) return ttEntry.score;
  }

  if (depth <= 0) {
    return quiescence(state, alpha, beta, ctx);
  }

  const moves = generateFastMoves(state);
  if (moves.length === 0) return -100_000 + ply;

  const hasMandatoryCapture = moves[0].captures.length > 0;

  // ── Null Move Pruning ─────────────────────────────────────────────
  // Skip our turn and verify the opponent can't beat beta even with the
  // free tempo. Safe to do only outside zugzwang-prone endgames and only
  // when there is no mandatory capture (Russian rules require captures).
  if (
    !isPv &&
    depth >= NMP_MIN_DEPTH &&
    !hasMandatoryCapture &&
    Math.abs(beta) < 50_000 &&
    enoughMaterialForNullMove(state)
  ) {
    const staticEval = ttEntry?.flag === TTFlag.Exact ? ttEntry.score : evaluate(state);
    if (staticEval >= beta) {
      const prevTurn = state.turn;
      state.turn = opponent(state.turn);
      state.repetitionStack.length = 0; // null move resets — avoid false repetition
      const nullScore = -negamax(
        state,
        depth - NMP_REDUCTION - 1,
        -beta,
        -beta + 1,
        ply + 1,
        ctx
      );
      state.turn = prevTurn;
      // Caller's path has the correct repetition stack via unmake on the parent move.
      if (nullScore >= beta) return beta;
    }
  }

  let bestScore = -INF;
  let bestMove: FastMove | null = null;
  let moveIndex = 0;

  for (const move of orderMoves(moves, ttEntry?.bestMove, ctx.heuristics, ply)) {
    const undo = makeFastMove(state, move);

    let score: number;
    const isTactical = move.captures.length > 0 || move.promoted;
    const lmrReduction =
      !isPv && depth >= LMR_MIN_DEPTH && moveIndex >= LMR_FIRST_REDUCED && !isTactical
        ? moveIndex >= 8
          ? 2
          : 1
        : 0;

    if (moveIndex === 0) {
      // First (PV) move — full window.
      score = -negamax(state, depth - 1, -beta, -alpha, ply + 1, ctx);
    } else {
      // Late moves: null-window probe, optionally reduced.
      score = -negamax(
        state,
        depth - 1 - lmrReduction,
        -alpha - 1,
        -alpha,
        ply + 1,
        ctx
      );
      if (score > alpha && (lmrReduction > 0 || (score < beta && isPv))) {
        // Re-search at full depth/window.
        score = -negamax(state, depth - 1, -beta, -alpha, ply + 1, ctx);
      }
    }

    unmakeFastMove(state, undo);
    moveIndex++;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (move.captures.length === 0) {
        recordHistory(move, depth, ctx.heuristics);
        recordKiller(move, ply, ctx.heuristics);
      }
      break;
    }
  }

  const flag =
    bestScore <= alphaOrig
      ? TTFlag.Upper
      : bestScore >= beta
        ? TTFlag.Lower
        : TTFlag.Exact;
  ctx.tt.store(key, { depth, flag, score: bestScore, bestMove });
  return bestScore;
}

/**
 * Conservative material check for NMP: we need both sides to have at least
 * one non-king piece OR multiple kings, otherwise zugzwang becomes too likely.
 */
function enoughMaterialForNullMove(state: FastState): boolean {
  let totalMaterial = 0;
  for (const cell of state.cells) {
    if (cell === 0) continue;
    totalMaterial += (cell & 0b10) !== 0 ? 300 : 100; // king ~3 men
    if (totalMaterial >= NMP_MIN_MATERIAL) return true;
  }
  return false;
}

function detectTerminal(state: FastState, ply: number): number | null {
  const whiteCount = countFastPieces(state, 0);
  const blackCount = countFastPieces(state, 1);
  if (whiteCount === 0) return terminalScore(1, state.turn, ply);
  if (blackCount === 0) return terminalScore(0, state.turn, ply);
  if (state.halfmoveClock >= 50) return 0;

  const currentRepetitionKey = state.repetitionStack[state.repetitionStack.length - 1];
  if (
    currentRepetitionKey &&
    state.repetitionStack.filter((key) => key === currentRepetitionKey).length >= 3
  ) {
    return 0;
  }

  // FMJD endgame draw rules: 30-ply (3+ kings vs 1) and 10-ply (long-diagonal 3 vs 1).
  if (state.endgame) {
    const limit = state.endgame.kind === "kings_3v1" ? 30 : 10;
    if (state.endgame.plies >= limit) return 0;
  }

  // Endgame tablebase: kings-only positions with ≤ 3 pieces have an exact score.
  if (whiteCount + blackCount <= 3) {
    const tb = probeTablebase(state);
    if (tb) return tablebaseScore(tb);
  }

  return null;
}

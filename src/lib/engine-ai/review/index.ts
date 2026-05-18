/**
 * Full game review pipeline.
 *
 * Takes a sequence of GameState snapshots (or a PDN game) and produces a
 * per-move classification + overall accuracy scores for both sides.
 *
 * Algorithm (per move):
 *   1. Evaluate position BEFORE the move at depth=reviewDepth.
 *   2. Evaluate position AFTER the move (opponent's eval, negated).
 *   3. Get best move + second-best eval from step 1.
 *   4. Classify the move.
 *   5. Detect motif if the class is key (Blunder/Mistake/Brilliant/Miss).
 */

import type { FastMove, FastState } from "../types";
import { cloneFastState } from "../board/fast-state";
import { generateFastMoves } from "../moves/generate";
import { makeFastMove } from "../board/make-unmake";
import { searchBestMove } from "../search/iterative";
import { isInBook } from "../data/openings";
import { classifyMove, type MoveClass, type ClassifyInput } from "./classify";
import { computeGameAccuracy, type AccuracyMove } from "./accuracy";
import { detectMotif, type MotifResult } from "./motifs";
import { fastMoveToPublicMove } from "../io/serializable";
import type { Move } from "@/lib/engine";

export interface ReviewedMove {
  readonly ply: number;
  /** 1-based move number */
  readonly moveNumber: number;
  readonly side: "white" | "black";
  /** Algebraic "c3-b4" or "b4xd6" — derived from FastMove indices */
  readonly notation: string;
  readonly moveClass: MoveClass;
  readonly motif: MotifResult | null;
  /** Centipawn eval before the move (side-to-move POV) */
  readonly evalBefore: number;
  /** Centipawn eval after the move (side-to-move POV, sign-flipped) */
  readonly evalAfter: number;
  /** Win-probability loss (positive = bad) */
  readonly wpDelta: number;
  /** Win probability before the move (0..1) */
  readonly wpBefore: number;
  /** Win probability after the move (0..1) */
  readonly wpAfter: number;
  /** Best move available (public format) */
  readonly bestMove: Move | null;
  /** Principal variation from the best move (up to 4 plies, public format) */
  readonly bestLine: readonly Move[];
  /** The actual move played (public format) */
  readonly playedMove: Move;
  readonly searchDepth: number;
}

export interface GameReview {
  readonly moves: readonly ReviewedMove[];
  readonly accuracy: {
    readonly white: number;
    readonly black: number;
  };
  readonly stats: {
    readonly white: Record<MoveClass, number>;
    readonly black: Record<MoveClass, number>;
  };
  readonly keyMoves: readonly ReviewedMove[];
  readonly elapsedMs: number;
}

export interface ReviewOptions {
  /** Engine search depth per move. Default 8. Lower for faster review. */
  readonly depth?: number;
  /** Max ms per move. Caps the depth loop. Default 500. */
  readonly timeMs?: number;
  /** Only review this many plies (for debugging). */
  readonly maxPly?: number;
}

function indexToAlg(idx: number): string {
  const row = Math.floor(idx / 4);
  const offset = idx % 4;
  const col = (row & 1) === 0 ? offset * 2 + 1 : offset * 2;
  const rank = 8 - row;
  return String.fromCharCode(97 + col) + rank;
}

function moveNotation(move: FastMove): string {
  const from = indexToAlg(move.fromIndex);
  const to   = indexToAlg(move.toIndex);
  return move.captureIndices.length > 0 ? `${from}x${to}` : `${from}-${to}`;
}

function emptyStats(): Record<MoveClass, number> {
  return {
    brilliant: 0, great: 0, best: 0, excellent: 0, good: 0,
    book: 0, inaccuracy: 0, mistake: 0, blunder: 0, miss: 0,
  };
}

/**
 * Review a sequence of (state, move) pairs.
 * `states[i]` is the position BEFORE `moves[i]`.
 * `states[states.length-1]` is the final position (no move played from it).
 * `onProgress` is called after each ply is analyzed.
 */
export function reviewGame(
  states: readonly FastState[],
  moves: readonly FastMove[],
  options: ReviewOptions = {},
  onProgress?: (ply: number, total: number, move: ReviewedMove) => void
): GameReview {
  const depth = options.depth ?? 8;
  const timeMs = options.timeMs ?? 500;
  const maxPly = options.maxPly ?? moves.length;
  const started = Date.now();

  const reviewedMoves: ReviewedMove[] = [];
  const accuracyMoves: AccuracyMove[] = [];
  const whiteStats = emptyStats();
  const blackStats = emptyStats();

  let prevOpponentBlundered = false;
  let prevPlyFromIndex: number | undefined;

  for (let ply = 0; ply < Math.min(moves.length, maxPly); ply++) {
    const stateBefore = states[ply];
    const playedMove  = moves[ply];
    const side: "white" | "black" = stateBefore.turn === 0 ? "white" : "black";

    // 1. Evaluate the position before the move (get best + second-best)
    const beforeResult = searchBestMove(stateBefore, {
      maxDepth: depth,
      timeMs,
      useBook: false, // always use search for accurate eval
    });

    const evalBefore = beforeResult.score;
    const bestMove = beforeResult.bestMove;

    // Find second-best: search again excluding the best move is expensive;
    // approximate by taking the second entry from the top-level move list.
    // For now, pass null — triggers the "only good move" approximation.
    // TODO: collect top-N from searchRoot for second-best eval.
    const evalSecondBest: number | null = null;

    // 2. Evaluate the position after the move
    const stateAfter = states[ply + 1];
    const afterResult = stateAfter
      ? searchBestMove(stateAfter, { maxDepth: depth, timeMs, useBook: false })
      : null;

    // evalAfter from the side-to-move's POV = negative of opponent's eval
    const evalAfter = afterResult ? -afterResult.score : 0;

    // 3. Is this a sacrifice? Played move loses material but engine still approves it
    const isSacrifice =
      !!bestMove &&
      playedMove.captureIndices.length === 0 &&
      bestMove.captureIndices.length > 0 &&
      evalBefore > -50; // not already losing

    // 4. Classify
    const classInput: ClassifyInput = {
      evalBefore,
      evalAfter,
      evalBest: beforeResult.score,
      evalSecondBest,
      bestMove: bestMove ?? playedMove,
      playedMove,
      isSacrifice,
      opponentBlundered: prevOpponentBlundered,
      isBook: isInBook(stateBefore) && stateBefore.ply < 28,
    };
    const { moveClass, wpDelta, wpBefore, wpAfter } = classifyMove(classInput);

    // 5. Detect motif on key moves
    const legalMoves = generateFastMoves(stateBefore);
    let motif: MotifResult | null = null;
    if (moveClass === "blunder" || moveClass === "mistake" || moveClass === "brilliant" || moveClass === "miss") {
      motif = stateAfter
        ? detectMotif({ stateBefore, stateAfter, legalMoves, playedMove, prevPlyFromIndex })
        : null;
    }

    // 6. Build reviewed move
    const rm: ReviewedMove = {
      ply,
      moveNumber: Math.floor(ply / 2) + 1,
      side,
      notation: moveNotation(playedMove),
      moveClass,
      motif,
      evalBefore,
      evalAfter,
      wpDelta,
      wpBefore,
      wpAfter,
      bestMove: bestMove ? fastMoveToPublicMove(bestMove) : null,
      bestLine: beforeResult.pv.slice(0, 4).map(fastMoveToPublicMove),
      playedMove: fastMoveToPublicMove(playedMove),
      searchDepth: beforeResult.depth,
    };

    reviewedMoves.push(rm);
    accuracyMoves.push({ side, moveClass, wpDelta });
    (side === "white" ? whiteStats : blackStats)[moveClass]++;

    onProgress?.(ply, Math.min(moves.length, maxPly), rm);

    prevOpponentBlundered = moveClass === "blunder" || moveClass === "mistake";
    prevPlyFromIndex = playedMove.fromIndex;
  }

  const acc = computeGameAccuracy(accuracyMoves);
  const keyMoves = reviewedMoves.filter(
    (m) => m.moveClass === "brilliant" || m.moveClass === "great" ||
           m.moveClass === "mistake" || m.moveClass === "blunder" || m.moveClass === "miss"
  );

  return {
    moves: reviewedMoves,
    accuracy: { white: acc.white.accuracy, black: acc.black.accuracy },
    stats: { white: whiteStats, black: blackStats },
    keyMoves,
    elapsedMs: Date.now() - started,
  };
}

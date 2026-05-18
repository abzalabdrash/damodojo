import {
  cloneBoard,
  opponent,
  pieceCount,
  pieceAt,
  positionKey,
} from "./board";
import {
  advanceEndgameCounter,
  endgameRulePlyLimit,
} from "./endgame-rules";
import { getLegalMoves } from "./moves";
import type { GameResult, GameState, Move, Piece } from "./types";

/**
 * Apply a legal move and return the next GameState.
 *
 * Performs no legality validation — caller is responsible for picking a Move
 * out of getLegalMoves(state). All captured pieces are removed at the end
 * (per Russian Turkish-strike rules they were "frozen" during the chain).
 */
export function applyMove(state: GameState, move: Move): GameState {
  const piece = pieceAt(state.board, move.from);
  if (!piece) {
    throw new Error(
      `applyMove: no piece at ${move.from.row},${move.from.col}`
    );
  }

  const next = cloneBoard(state.board);
  next[move.from.row][move.from.col] = null;
  for (const cap of move.captures) {
    next[cap.row][cap.col] = null;
  }

  const placed: Piece = {
    color: piece.color,
    king: piece.king || move.promoted,
  };
  next[move.to.row][move.to.col] = placed;

  const isCapture = move.captures.length > 0;
  const wasKingMove = piece.king;
  // Reversibility (for repetition + 50-move): only a king move without capture
  // can produce repetition; man moves and captures reset both counters.
  const irreversible = isCapture || !wasKingMove;

  const nextTurn = opponent(state.turn);
  const newHalfmove = irreversible ? 0 : state.halfmoveClock + 1;

  const newReps = irreversible
    ? new Map<string, number>()
    : new Map(state.repetitions);
  const key = positionKey(next, nextTurn);
  newReps.set(key, (newReps.get(key) ?? 0) + 1);

  const nextEndgame = advanceEndgameCounter(state.endgame, next);

  return {
    board: next,
    turn: nextTurn,
    halfmoveClock: newHalfmove,
    ply: state.ply + 1,
    history: [...state.history, move],
    repetitions: newReps,
    endgame: nextEndgame,
  };
}

/**
 * Evaluate the current game state for terminal conditions.
 * Order of checks: pieces, repetition, fifty-move, no-moves, ongoing.
 */
export function getResult(state: GameState): GameResult {
  const wCount = pieceCount(state.board, "w");
  const bCount = pieceCount(state.board, "b");
  if (wCount === 0) return { kind: "win", winner: "b", reason: "no_pieces" };
  if (bCount === 0) return { kind: "win", winner: "w", reason: "no_pieces" };

  for (const count of state.repetitions.values()) {
    if (count >= 3) return { kind: "draw", reason: "repetition" };
  }
  if (state.halfmoveClock >= 50) {
    return { kind: "draw", reason: "fifty_move" };
  }

  if (state.endgame && state.endgame.plies >= endgameRulePlyLimit(state.endgame.rule)) {
    return {
      kind: "draw",
      reason:
        state.endgame.rule.kind === "kings_3v1"
          ? "endgame_3v1_kings"
          : "endgame_long_diagonal",
    };
  }

  const moves = getLegalMoves(state);
  if (moves.length === 0) {
    return { kind: "win", winner: opponent(state.turn), reason: "no_moves" };
  }
  return { kind: "ongoing" };
}

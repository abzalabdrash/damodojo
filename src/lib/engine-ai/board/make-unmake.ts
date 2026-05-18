import {
  EMPTY,
  colorOf,
  isKing,
  makePiece,
  type FastMove,
  type FastState,
  type FastUndo,
} from "../types";
import { detectFastEndgameRule, sameFastEndgameRule } from "./endgame-fast";
import { fastPositionKey, opponent } from "./fast-state";

export function makeFastMove(state: FastState, move: FastMove): FastUndo {
  const movingPiece = state.cells[move.fromIndex];
  const previousToPiece = state.cells[move.toIndex];
  const capturedPieces = move.captureIndices.map((index) => state.cells[index]);
  const undo: FastUndo = {
    move,
    movingPiece,
    previousToPiece,
    capturedPieces,
    prevTurn: state.turn,
    prevHalfmoveClock: state.halfmoveClock,
    prevPly: state.ply,
    prevRepetitionStackLength: state.repetitionStack.length,
    prevEndgame: state.endgame ? { ...state.endgame } : null,
  };

  state.cells[move.fromIndex] = EMPTY;
  for (const index of move.captureIndices) {
    state.cells[index] = EMPTY;
  }
  state.cells[move.toIndex] = move.promoted
    ? makePiece(colorOf(movingPiece), true)
    : movingPiece;

  const irreversible = move.captureIndices.length > 0 || !isKing(movingPiece);
  state.turn = opponent(state.turn);
  state.halfmoveClock = irreversible ? 0 : state.halfmoveClock + 1;
  state.ply += 1;
  if (irreversible) state.repetitionStack.length = 0;
  state.repetitionStack.push(fastPositionKey(state));

  const newRule = detectFastEndgameRule(state);
  if (newRule === null) {
    state.endgame = null;
  } else if (state.endgame && sameFastEndgameRule(state.endgame, newRule)) {
    state.endgame = { ...state.endgame, plies: state.endgame.plies + 1 };
  } else {
    state.endgame = { kind: newRule.kind, weak: newRule.weak, plies: 1 };
  }

  return undo;
}

export function unmakeFastMove(state: FastState, undo: FastUndo): void {
  const { move } = undo;

  state.cells[move.fromIndex] = undo.movingPiece;
  state.cells[move.toIndex] = undo.previousToPiece;
  for (let i = 0; i < move.captureIndices.length; i++) {
    state.cells[move.captureIndices[i]] = undo.capturedPieces[i];
  }

  state.turn = undo.prevTurn;
  state.halfmoveClock = undo.prevHalfmoveClock;
  state.ply = undo.prevPly;
  state.repetitionStack.length = undo.prevRepetitionStackLength;
  state.endgame = undo.prevEndgame ? { ...undo.prevEndgame } : null;
}

import { type Color, type Move } from "@/lib/engine";

import {
  applyMoveToPieces,
  initialPieces,
  type UIPiece,
} from "./game-store";

export interface ReplayFrame {
  pieces: UIPiece[];
  lastMove: Move | null;
  turn: Color;
}

/**
 * Reconstruct the board state AFTER the first `ply` half-moves of the game.
 *
 *   ply = 0                 → initial position
 *   ply = history.length    → live (i.e. the current game state)
 *   ply ∈ (0, history.length] → mid-game replay
 *
 * Piece IDs are stable across plies (because `initialPieces` returns the same
 * ordered list every time and `applyMoveToPieces` preserves identity), which
 * lets Framer Motion animate transitions smoothly while scrubbing.
 */
export function gameStateAtPly(
  history: readonly Move[],
  ply: number
): ReplayFrame {
  let pieces = initialPieces();
  const clamped = Math.max(0, Math.min(ply, history.length));
  for (let i = 0; i < clamped; i++) {
    pieces = applyMoveToPieces(pieces, history[i]);
  }
  const lastMove = clamped > 0 ? history[clamped - 1] : null;
  // White moves first; turn alternates after each ply.
  const turn: Color = clamped % 2 === 0 ? "w" : "b";
  return { pieces, lastMove, turn };
}

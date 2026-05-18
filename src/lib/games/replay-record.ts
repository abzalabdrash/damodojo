import {
  applyMove,
  findMoveByEndpoints,
  initialState,
  parseNotation,
} from "@/lib/engine";
import type { Move } from "@/lib/engine";

export function movesFromNotation(notation: readonly string[]): Move[] {
  let state = initialState();
  const moves: Move[] = [];

  for (const text of notation) {
    const parsed = parseNotation(text);
    if (!parsed) {
      throw new Error(`Cannot parse move notation: ${text}`);
    }

    const move = findMoveByEndpoints(state, parsed.from, parsed.to);
    if (!move) {
      throw new Error(`Illegal move in archive record: ${text}`);
    }

    moves.push(move);
    state = applyMove(state, move);
  }

  return moves;
}

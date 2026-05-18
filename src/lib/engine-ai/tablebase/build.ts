/**
 * Retrograde analysis builder for the kings-only endgame tablebase.
 *
 * For every kings-only position with ≤ TOTAL_MAX_TB_PIECES kings, derives
 * exact game-theoretic value (win / loss / draw) and distance-to-mate (DTM)
 * for the side-to-move. Uses iterative backward induction.
 *
 * Building takes ~1-3 seconds for 3-piece (kings-only) positions in JS.
 */

import { generateFastMoves } from "../moves/generate";
import { makeFastMove, unmakeFastMove } from "../board/make-unmake";
import {
  BLACK,
  KING,
  OCCUPIED,
  WHITE,
  type FastState,
} from "../types";
import { fastPositionKey } from "../board/fast-state";
import {
  TOTAL_MAX_TB_PIECES,
  encodePosition,
  enumerateAllKingPositions,
} from "./positions";

export type TbValue = "win" | "loss" | "draw";

export interface TbEntry {
  readonly value: TbValue;
  readonly dtm: number;
}

function whiteKing(): number {
  return OCCUPIED | KING;
}
function blackKing(): number {
  return OCCUPIED | KING | 0b100; // BLACK_FLAG
}

function makeFastStateFromKings(
  whites: readonly number[],
  blacks: readonly number[],
  turn: 0 | 1
): FastState {
  const cells = new Uint8Array(32);
  for (const i of whites) cells[i] = whiteKing();
  for (const i of blacks) cells[i] = blackKing();
  const s: FastState = {
    cells,
    turn,
    halfmoveClock: 0,
    ply: 0,
    repetitionStack: [],
    endgame: null,
  };
  s.repetitionStack.push(fastPositionKey(s));
  return s;
}

export function buildTablebase(): Map<number, TbEntry> {
  const tb = new Map<number, TbEntry>();

  // ── Pass 1: classify terminal positions ──
  const allPositions: Array<{
    id: number;
    whites: readonly number[];
    blacks: readonly number[];
    turn: 0 | 1;
  }> = [];

  for (const pos of enumerateAllKingPositions()) {
    if (pos.white.length + pos.black.length > TOTAL_MAX_TB_PIECES) continue;
    const state = makeFastStateFromKings(pos.white, pos.black, pos.turn);
    const id = encodePosition(state);
    if (id === null) continue;
    allPositions.push({ id, whites: pos.white, blacks: pos.black, turn: pos.turn });

    const myCount = pos.turn === WHITE ? pos.white.length : pos.black.length;
    if (myCount === 0) {
      tb.set(id, { value: "loss", dtm: 0 });
      continue;
    }
    const moves = generateFastMoves(state);
    if (moves.length === 0) {
      tb.set(id, { value: "loss", dtm: 0 });
    }
  }

  // ── Pass 2: iterative backward induction ──
  let changed = true;
  while (changed) {
    changed = false;
    for (const pos of allPositions) {
      if (tb.has(pos.id)) continue;
      const state = makeFastStateFromKings(pos.whites, pos.blacks, pos.turn);
      const moves = generateFastMoves(state);
      if (moves.length === 0) continue; // already handled above

      let bestWinDtm = Infinity;
      let worstLossDtm = -1;
      let allClassified = true;
      let anyDraw = false;
      let foundWin = false;

      for (const move of moves) {
        const undo = makeFastMove(state, move);
        const childId = encodePosition(state);
        unmakeFastMove(state, undo);

        if (childId === null) {
          // Off-tablebase position (e.g. man on board after promotion). Treat as
          // unknown — but our tablebase is kings-only so this shouldn't happen.
          allClassified = false;
          continue;
        }
        const childEntry = tb.get(childId);
        if (!childEntry) {
          allClassified = false;
          continue;
        }
        // Child entry is from the child's STM perspective (the opponent's).
        // Opponent's "loss" → our win.
        if (childEntry.value === "loss") {
          foundWin = true;
          if (childEntry.dtm + 1 < bestWinDtm) bestWinDtm = childEntry.dtm + 1;
        } else if (childEntry.value === "win") {
          if (childEntry.dtm + 1 > worstLossDtm) worstLossDtm = childEntry.dtm + 1;
        } else {
          anyDraw = true;
        }
      }

      if (foundWin) {
        tb.set(pos.id, { value: "win", dtm: bestWinDtm });
        changed = true;
        continue;
      }
      if (allClassified && !anyDraw) {
        tb.set(pos.id, { value: "loss", dtm: worstLossDtm });
        changed = true;
      }
    }
  }

  // ── Pass 3: residual positions are draws ──
  for (const pos of allPositions) {
    if (!tb.has(pos.id)) tb.set(pos.id, { value: "draw", dtm: 0 });
  }

  return tb;
}

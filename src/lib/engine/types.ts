/**
 * Russian checkers (русские шашки) types.
 *
 * Board is 8×8. Pieces live only on dark squares (row+col is odd).
 * Coordinates: row 0 is top of the board (Black's home rank); col 0 is left.
 * White pieces start on rows 5-7; Black on rows 0-2. White moves first.
 *
 * Russian rules summary (the ones this engine enforces):
 *   - Men move 1 step diagonally forward (toward opponent's home row).
 *   - Men CAPTURE forward AND backward (jump over an adjacent enemy to an
 *     empty square immediately beyond).
 *   - Kings ("damka") fly any distance along a diagonal.
 *   - Kings capture by flying past an enemy and landing on any empty square
 *     beyond, on the same diagonal.
 *   - Captures are MANDATORY whenever any capture exists for the player to move.
 *   - When multiple capture sequences are available, the player may pick ANY
 *     of them (unlike English checkers' "longest capture" rule).
 *   - Multi-capture chains continue as long as the moving piece can capture
 *     from its new position.
 *   - Turkish-strike rule: captured pieces stay on the board until the
 *     chain ends, so they block paths and cannot be jumped twice.
 *   - Promotion happens when a man lands on the opponent's home row.
 *     A man that PASSES THROUGH the home row mid-chain becomes a king and
 *     continues capturing as a king.
 *   - Draw conditions: 50 plies without a capture or pawn move; threefold
 *     repetition.
 */

import type { EndgameCounter } from "./endgame-rules";

export type Color = "w" | "b";

export interface Square {
  readonly row: number;
  readonly col: number;
}

export interface Piece {
  readonly color: Color;
  readonly king: boolean;
}

export type Board = readonly (Piece | null)[][];

export interface Move {
  /** Square the moving piece starts from. */
  readonly from: Square;
  /** Final destination square (same as path[path.length - 1]). */
  readonly to: Square;
  /**
   * Landing squares in order. The starting square (from) is NOT included.
   * For a simple move this has length 1. For multi-capture, it's the full chain.
   */
  readonly path: readonly Square[];
  /** Squares of pieces captured in this move, in capture order. */
  readonly captures: readonly Square[];
  /** True if this move resulted in promotion to king. */
  readonly promoted: boolean;
}

export interface GameState {
  readonly board: Board;
  readonly turn: Color;
  /** Half-moves since the last capture or simple-pawn move (for 50-move draw). */
  readonly halfmoveClock: number;
  /** Total plies elapsed from initial position. */
  readonly ply: number;
  /** Move history in order applied. */
  readonly history: readonly Move[];
  /**
   * Repetition counter: count of how many times each board+turn hash has
   * been seen since the last irreversible move. Threefold ⇒ draw.
   */
  readonly repetitions: ReadonlyMap<string, number>;
  /**
   * FMJD endgame draw rule counter. See `endgame-rules.ts` for details.
   * `null` when no rule is currently active.
   */
  readonly endgame: EndgameCounter | null;
}

export type GameResult =
  | { readonly kind: "ongoing" }
  | {
      readonly kind: "win";
      readonly winner: Color;
      readonly reason: "no_pieces" | "no_moves" | "resign";
    }
  | {
      readonly kind: "draw";
      readonly reason:
        | "fifty_move"
        | "repetition"
        | "agreement"
        | "endgame_3v1_kings"
        | "endgame_long_diagonal";
    };

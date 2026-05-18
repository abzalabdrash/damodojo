import {
  BLACK,
  WHITE,
  colorOf,
  isKing,
  isOccupied,
  type FastColor,
  type FastState,
} from "../types";
import { onBoard, squareFromIndex, squareIndex } from "../board/encoding";
import { generateFastMoves } from "../moves/generate";
import { WEIGHTS } from "./weights";
import { gamePhase, kingPst, manPst } from "./pst";

export interface EvalBreakdown {
  readonly material: number;
  readonly pst: number;
  readonly mobility: number;
  readonly backRank: number;
  readonly promotionRace: number;
  readonly trappedKing: number;
  readonly longDiagonal: number;
  readonly tempo: number;
  readonly kingMobility: number;
  readonly protection: number;
  readonly totalAbsolute: number;
  readonly total: number;
}

interface SideStats {
  material: number;
  pst: number;
  backRank: number;
  closestPromotion: number | null;
  trappedKing: number;
  longDiagonal: number;
  kingMobility: number;
  protection: number;
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export function evaluateBreakdown(state: FastState): EvalBreakdown {
  const totalMaterial = materialOnly(state);
  const phase = gamePhase(totalMaterial);
  const white = sideStats(state, WHITE, phase);
  const black = sideStats(state, BLACK, phase);

  const material = white.material - black.material;
  const pst = white.pst - black.pst;
  const mobility = mobilityScore(state, WHITE) - mobilityScore(state, BLACK);
  const backRank = white.backRank - black.backRank;
  const promotionRace = promotionRaceScore(white.closestPromotion, black.closestPromotion);
  const trappedKing = white.trappedKing - black.trappedKing;
  const longDiagonal = white.longDiagonal - black.longDiagonal;
  const kingMobility = white.kingMobility - black.kingMobility;
  const protection = white.protection - black.protection;
  const tempo = state.turn === WHITE ? WEIGHTS.tempo : -WEIGHTS.tempo;
  const totalAbsolute =
    material +
    pst +
    mobility +
    backRank +
    promotionRace +
    trappedKing +
    longDiagonal +
    kingMobility +
    protection;

  return {
    material,
    pst,
    mobility,
    backRank,
    promotionRace,
    trappedKing,
    longDiagonal,
    kingMobility,
    protection,
    tempo,
    totalAbsolute,
    total: (state.turn === WHITE ? totalAbsolute : -totalAbsolute) + WEIGHTS.tempo,
  };
}

function sideStats(state: FastState, color: FastColor, phase: number): SideStats {
  const stats: SideStats = {
    material: 0,
    pst: 0,
    backRank: 0,
    closestPromotion: null,
    trappedKing: 0,
    longDiagonal: 0,
    kingMobility: 0,
    protection: 0,
  };

  for (let index = 0; index < state.cells.length; index++) {
    const cell = state.cells[index];
    if (!isOccupied(cell) || colorOf(cell) !== color) continue;
    const { row, col } = squareFromIndex(index);

    if (isKing(cell)) {
      stats.material += WEIGHTS.king;
      stats.pst += kingPst(index, color, phase) * WEIGHTS.pst;
      if (isTrappedKing(state, index)) stats.trappedKing += WEIGHTS.trappedKing;
      if (row + col === 7) stats.longDiagonal += WEIGHTS.longDiagonal;
      stats.kingMobility +=
        Math.min(WEIGHTS.kingMobilityCap, kingFreeNeighbours(state, row, col)) *
        WEIGHTS.kingMobility;
      continue;
    }

    stats.material += WEIGHTS.man;
    stats.pst += manPst(index, color, phase) * WEIGHTS.pst;
    if ((color === WHITE && row === 7) || (color === BLACK && row === 0)) {
      stats.backRank += Math.round(WEIGHTS.backRankGuard * (0.5 + phase * 0.5));
    }
    if (hasFriendlyBacking(state, row, col, color)) {
      stats.protection += WEIGHTS.protectedPiece;
    }

    const distance = color === WHITE ? row : 7 - row;
    stats.closestPromotion =
      stats.closestPromotion === null ? distance : Math.min(stats.closestPromotion, distance);
  }

  return stats;
}

function kingFreeNeighbours(state: FastState, row: number, col: number): number {
  let count = 0;
  for (const [dr, dc] of DIRECTIONS) {
    const r = row + dr;
    const c = col + dc;
    if (!onBoard(r, c)) continue;
    if (!isOccupied(state.cells[squareIndex({ row: r, col: c })])) count++;
  }
  return count;
}

/**
 * A man is "protected" when a friendly piece sits on the diagonal one step
 * behind it (relative to the man's own direction of travel). This roughly
 * captures the bridge/pair structure that prevents simple captures.
 */
function hasFriendlyBacking(
  state: FastState,
  row: number,
  col: number,
  color: FastColor
): boolean {
  const dr = color === WHITE ? 1 : -1; // one step behind from the piece's perspective
  for (const dc of [-1, 1]) {
    const r = row + dr;
    const c = col + dc;
    if (!onBoard(r, c)) continue;
    const cell = state.cells[squareIndex({ row: r, col: c })];
    if (isOccupied(cell) && colorOf(cell) === color) return true;
  }
  return false;
}

function materialOnly(state: FastState): number {
  let total = 0;
  for (const cell of state.cells) {
    if (!isOccupied(cell)) continue;
    total += isKing(cell) ? WEIGHTS.king : WEIGHTS.man;
  }
  return total;
}

function mobilityScore(state: FastState, color: FastColor): number {
  const probe: FastState = { ...state, turn: color };
  const moves = generateFastMoves(probe);
  if (moves.length > 0 && moves.every((move) => move.captures.length > 0)) return 0;
  return Math.min(moves.length, WEIGHTS.mobilityCap) * WEIGHTS.mobility;
}

function promotionRaceScore(
  whiteClosest: number | null,
  blackClosest: number | null
): number {
  if (whiteClosest === null && blackClosest === null) return 0;
  if (whiteClosest === null) return -WEIGHTS.promotionRace;
  if (blackClosest === null) return WEIGHTS.promotionRace;
  if (whiteClosest === blackClosest) return 0;
  return whiteClosest < blackClosest ? WEIGHTS.promotionRace : -WEIGHTS.promotionRace;
}

function isTrappedKing(state: FastState, index: number): boolean {
  const { row, col } = squareFromIndex(index);
  for (const [dr, dc] of DIRECTIONS) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (!onBoard(nextRow, nextCol)) continue;
    if (!isOccupied(state.cells[squareIndex({ row: nextRow, col: nextCol })])) {
      return false;
    }
  }
  return true;
}

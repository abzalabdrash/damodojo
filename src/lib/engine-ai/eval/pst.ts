import { WHITE, type FastColor } from "../types";
import { squareFromIndex } from "../board/encoding";

export const MAN_MG_PST = buildManPst("mg");
export const MAN_EG_PST = buildManPst("eg");
export const KING_MG_PST = buildKingPst("mg");
export const KING_EG_PST = buildKingPst("eg");

export function manPst(index: number, color: FastColor, phase: number): number {
  const whiteIndex = color === WHITE ? index : mirrorIndex(index);
  return blend(MAN_MG_PST[whiteIndex], MAN_EG_PST[whiteIndex], phase);
}

export function kingPst(index: number, color: FastColor, phase: number): number {
  const whiteIndex = color === WHITE ? index : mirrorIndex(index);
  return blend(KING_MG_PST[whiteIndex], KING_EG_PST[whiteIndex], phase);
}

export function gamePhase(totalMaterial: number): number {
  return Math.max(0, Math.min(1, totalMaterial / 2400));
}

function buildManPst(stage: "mg" | "eg"): Int16Array {
  const out = new Int16Array(32);
  for (let index = 0; index < 32; index++) {
    const { row, col } = squareFromIndex(index);
    const advancement = 7 - row;
    const center = centerBonus(row, col);
    const backRank = row === 7 ? (stage === "mg" ? 10 : 0) : 0;
    out[index] = advancement * (stage === "mg" ? 5 : 8) + center + backRank;
  }
  return out;
}

function buildKingPst(stage: "mg" | "eg"): Int16Array {
  const out = new Int16Array(32);
  for (let index = 0; index < 32; index++) {
    const { row, col } = squareFromIndex(index);
    const center = centerBonus(row, col) * (stage === "mg" ? 2 : 3);
    const longDiagonal = row + col === 7 ? 6 : 0;
    const edgePenalty = row === 0 || row === 7 || col === 0 || col === 7 ? -8 : 0;
    out[index] = center + longDiagonal + edgePenalty;
  }
  return out;
}

function centerBonus(row: number, col: number): number {
  const rowDist = Math.abs(3.5 - row);
  const colDist = Math.abs(3.5 - col);
  return Math.round(14 - (rowDist + colDist) * 3);
}

function mirrorIndex(index: number): number {
  const { row, col } = squareFromIndex(index);
  const mirroredRow = 7 - row;
  const mirroredCol = 7 - col;
  return mirroredRow * 4 + Math.floor(mirroredCol / 2);
}

function blend(mg: number, eg: number, phase: number): number {
  return Math.round(mg * phase + eg * (1 - phase));
}

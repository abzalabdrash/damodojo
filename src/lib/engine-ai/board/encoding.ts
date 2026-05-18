import type { FastSquare } from "../types";

export function squareNumber(square: FastSquare): number {
  return square.row * 4 + Math.floor(square.col / 2) + 1;
}

export function squareIndex(square: FastSquare): number {
  return squareNumber(square) - 1;
}

export function squareFromNumber(n: number): FastSquare {
  if (n < 1 || n > 32) throw new Error(`Invalid square number: ${n}`);
  const row = Math.floor((n - 1) / 4);
  const indexInRow = (n - 1) % 4;
  const col = (row & 1) === 0 ? indexInRow * 2 + 1 : indexInRow * 2;
  return { row, col };
}

export function squareFromIndex(index: number): FastSquare {
  return squareFromNumber(index + 1);
}

export function isDarkSquare(row: number, col: number): boolean {
  return ((row + col) & 1) === 1;
}

export function onBoard(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

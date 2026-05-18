import { BOARD_SIZE } from "@/lib/engine";
import type { Square } from "@/lib/engine";

export interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ClientPoint {
  x: number;
  y: number;
}

export interface DragTranslateInput {
  clientX: number;
  clientY: number;
  grabOffsetX: number;
  grabOffsetY: number;
}

export function pointToBoardSquare(
  rect: BoardRect,
  point: ClientPoint,
  flipped = false
): Square | null {
  const relX = point.x - rect.left;
  const relY = point.y - rect.top;
  if (relX < 0 || relY < 0 || relX >= rect.width || relY >= rect.height) {
    return null;
  }

  const cellW = rect.width / BOARD_SIZE;
  const cellH = rect.height / BOARD_SIZE;
  let col = Math.floor(relX / cellW);
  let row = Math.floor(relY / cellH);

  if (flipped) {
    col = BOARD_SIZE - 1 - col;
    row = BOARD_SIZE - 1 - row;
  }

  return { row, col };
}

export function dragTranslate(
  rect: BoardRect,
  input: DragTranslateInput
): { x: number; y: number } {
  const cellW = rect.width / BOARD_SIZE;
  const cellH = rect.height / BOARD_SIZE;
  const centerX = input.clientX - input.grabOffsetX;
  const centerY = input.clientY - input.grabOffsetY;

  return {
    x: centerX - rect.left - cellW / 2,
    y: centerY - rect.top - cellH / 2,
  };
}

import {
  BLACK,
  EMPTY,
  WHITE,
  colorOf,
  isKing,
  isOccupied,
  makePiece,
  type FastMove,
  type FastState,
} from "../types";
import { onBoard, squareFromIndex, squareIndex } from "../board/encoding";

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

interface Continuation {
  readonly jumpedIndex: number;
  readonly landingIndex: number;
}

export function generateFastMoves(state: FastState): FastMove[] {
  const captures = generateAllCaptures(state);
  if (captures.length > 0) return captures;
  return generateSimpleMoves(state);
}

function generateAllCaptures(state: FastState): FastMove[] {
  const out: FastMove[] = [];
  for (let index = 0; index < 32; index++) {
    const cell = state.cells[index];
    if (!isOccupied(cell) || colorOf(cell) !== state.turn) continue;
    generateCapturesForPiece(state, index, out);
  }
  return out;
}

function generateCapturesForPiece(
  state: FastState,
  startIndex: number,
  out: FastMove[]
): void {
  const originalPiece = state.cells[startIndex];
  const cells = new Uint8Array(state.cells);
  cells[startIndex] = EMPTY;

  const visit = (
    currentIndex: number,
    currentPiece: number,
    workingCells: Uint8Array,
    pathIndices: number[],
    captureIndices: number[],
    frozen: ReadonlySet<number>
  ) => {
    const conts = findImmediateCaptures(
      workingCells,
      currentIndex,
      currentPiece,
      frozen
    );

    if (conts.length === 0) {
      if (captureIndices.length > 0) {
        out.push(
          buildMove(
            startIndex,
            pathIndices,
            captureIndices,
            !isKing(originalPiece) && isKing(currentPiece)
          )
        );
      }
      return;
    }

    for (const cont of conts) {
      const nextCells = new Uint8Array(workingCells);
      nextCells[currentIndex] = EMPTY;

      const landing = squareFromIndex(cont.landingIndex);
      const promoted =
        !isKing(currentPiece) && isPromotionRow(landing.row, colorOf(currentPiece));
      const nextPiece = promoted
        ? makePiece(colorOf(currentPiece), true)
        : currentPiece;
      nextCells[cont.landingIndex] = nextPiece;

      const nextFrozen = new Set(frozen);
      nextFrozen.add(cont.jumpedIndex);

      visit(
        cont.landingIndex,
        nextPiece,
        nextCells,
        [...pathIndices, cont.landingIndex],
        [...captureIndices, cont.jumpedIndex],
        nextFrozen
      );
    }
  };

  visit(startIndex, originalPiece, cells, [], [], new Set());
}

function findImmediateCaptures(
  cells: Uint8Array,
  fromIndex: number,
  piece: number,
  frozen: ReadonlySet<number>
): Continuation[] {
  const from = squareFromIndex(fromIndex);
  const out: Continuation[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    if (isKing(piece)) {
      let row = from.row + dr;
      let col = from.col + dc;
      let enemyIndex: number | null = null;

      while (onBoard(row, col)) {
        const index = squareIndex({ row, col });
        const cell = cells[index];

        if (!isOccupied(cell)) {
          if (enemyIndex !== null) {
            out.push({ jumpedIndex: enemyIndex, landingIndex: index });
          }
        } else if (frozen.has(index)) {
          break;
        } else if (colorOf(cell) === colorOf(piece)) {
          break;
        } else {
          if (enemyIndex !== null) break;
          enemyIndex = index;
        }

        row += dr;
        col += dc;
      }
    } else {
      const enemyRow = from.row + dr;
      const enemyCol = from.col + dc;
      const landingRow = from.row + 2 * dr;
      const landingCol = from.col + 2 * dc;
      if (!onBoard(landingRow, landingCol)) continue;

      const enemyIndex = squareIndex({ row: enemyRow, col: enemyCol });
      const landingIndex = squareIndex({ row: landingRow, col: landingCol });
      const enemy = cells[enemyIndex];
      if (!isOccupied(enemy) || colorOf(enemy) === colorOf(piece)) continue;
      if (frozen.has(enemyIndex)) continue;
      if (isOccupied(cells[landingIndex])) continue;

      out.push({ jumpedIndex: enemyIndex, landingIndex });
    }
  }

  return out;
}

function generateSimpleMoves(state: FastState): FastMove[] {
  const out: FastMove[] = [];

  for (let index = 0; index < 32; index++) {
    const piece = state.cells[index];
    if (!isOccupied(piece) || colorOf(piece) !== state.turn) continue;
    const from = squareFromIndex(index);

    if (isKing(piece)) {
      for (const [dr, dc] of DIRECTIONS) {
        let row = from.row + dr;
        let col = from.col + dc;
        while (onBoard(row, col)) {
          const toIndex = squareIndex({ row, col });
          if (isOccupied(state.cells[toIndex])) break;
          out.push(buildMove(index, [toIndex], [], false));
          row += dr;
          col += dc;
        }
      }
      continue;
    }

    const row = from.row + forwardDirection(colorOf(piece));
    for (const dc of [-1, 1] as const) {
      const col = from.col + dc;
      if (!onBoard(row, col)) continue;
      const toIndex = squareIndex({ row, col });
      if (isOccupied(state.cells[toIndex])) continue;
      out.push(
        buildMove(index, [toIndex], [], isPromotionRow(row, colorOf(piece)))
      );
    }
  }

  return out;
}

function buildMove(
  fromIndex: number,
  pathIndices: readonly number[],
  captureIndices: readonly number[],
  promoted: boolean
): FastMove {
  const from = squareFromIndex(fromIndex);
  const toIndex = pathIndices[pathIndices.length - 1];
  const path = pathIndices.map(squareFromIndex);
  const captures = captureIndices.map(squareFromIndex);

  return {
    from,
    to: squareFromIndex(toIndex),
    fromIndex,
    toIndex,
    path,
    pathIndices: [...pathIndices],
    captures,
    captureIndices: [...captureIndices],
    promoted,
  };
}

function forwardDirection(color: number): -1 | 1 {
  return color === WHITE ? -1 : 1;
}

function isPromotionRow(row: number, color: number): boolean {
  return color === WHITE ? row === 0 : color === BLACK && row === 7;
}

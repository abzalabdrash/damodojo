import {
  BLACK_KING,
  BLACK_MAN,
  WHITE_KING,
  WHITE_MAN,
  type FastState,
} from "../types";

const PIECES = [WHITE_MAN, WHITE_KING, BLACK_MAN, BLACK_KING] as const;
const PIECE_TO_SLOT = new Map<number, number>(
  PIECES.map((piece, index) => [piece, index])
);

const PIECE_KEYS = buildPieceKeys();
const SIDE_KEY = nextRandom(0x9e3779b9);

export function computeZobrist(state: FastState): number {
  let hash = 0;
  for (let index = 0; index < state.cells.length; index++) {
    const slot = PIECE_TO_SLOT.get(state.cells[index]);
    if (slot === undefined) continue;
    hash ^= PIECE_KEYS[index * 4 + slot];
  }
  if (state.turn === 1) hash ^= SIDE_KEY;
  return hash >>> 0;
}

function buildPieceKeys(): Uint32Array {
  const keys = new Uint32Array(32 * 4);
  let seed = 0x12345678;
  for (let i = 0; i < keys.length; i++) {
    seed = nextRandom(seed);
    keys[i] = seed;
  }
  return keys;
}

function nextRandom(seed: number): number {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

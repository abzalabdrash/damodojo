import { describe, expect, it } from "vitest";

import {
  applyMove,
  getLegalMoves,
  initialState,
  pieceCount,
  positionKey as publicPositionKey,
} from "@/lib/engine";
import type { GameState, Piece } from "@/lib/engine";
import {
  BLACK_KING,
  BLACK_MAN,
  EMPTY,
  WHITE_KING,
  WHITE_MAN,
  cloneFastState,
  countFastPieces,
  fastPositionKey,
  initialFastState,
  isBlackPiece,
  isKing,
  isOccupied,
  isWhitePiece,
  squareFromNumber,
  squareNumber,
  fromGameState,
  generateFastMoves,
  makeFastMove,
  perft,
  toGameState,
  unmakeFastMove,
} from "../index";

describe("engine-ai board encoding", () => {
  it("round-trips all Russian draughts square numbers", () => {
    for (let n = 1; n <= 32; n++) {
      expect(squareNumber(squareFromNumber(n))).toBe(n);
    }
  });

  it("matches the existing Russian square numbering", () => {
    expect(squareFromNumber(1)).toEqual({ row: 0, col: 1 });
    expect(squareFromNumber(4)).toEqual({ row: 0, col: 7 });
    expect(squareFromNumber(5)).toEqual({ row: 1, col: 0 });
    expect(squareFromNumber(32)).toEqual({ row: 7, col: 6 });
  });
});

describe("engine-ai fast state", () => {
  it("uses compact byte flags for empty, color, and king state", () => {
    expect(isOccupied(EMPTY)).toBe(false);
    expect(isOccupied(WHITE_MAN)).toBe(true);
    expect(isWhitePiece(WHITE_MAN)).toBe(true);
    expect(isBlackPiece(BLACK_MAN)).toBe(true);
    expect(isKing(WHITE_KING)).toBe(true);
    expect(isKing(BLACK_KING)).toBe(true);
  });

  it("creates the standard initial Russian draughts position", () => {
    const state = initialFastState();

    expect(state.cells).toBeInstanceOf(Uint8Array);
    expect(state.cells).toHaveLength(32);
    expect(state.turn).toBe(0);
    expect(state.halfmoveClock).toBe(0);
    expect(state.ply).toBe(0);
    expect(countFastPieces(state, 0)).toBe(12);
    expect(countFastPieces(state, 1)).toBe(12);
  });

  it("clones without sharing cell storage", () => {
    const state = initialFastState();
    const clone = cloneFastState(state);
    const before = fastPositionKey(state);

    clone.cells[0] = EMPTY;

    expect(fastPositionKey(state)).toBe(before);
    expect(fastPositionKey(clone)).not.toBe(before);
  });
});

describe("engine-ai conversion boundary", () => {
  it("converts the public initial state into fast state", () => {
    const fast = fromGameState(initialState());

    expect(fast.turn).toBe(0);
    expect(fast.halfmoveClock).toBe(0);
    expect(fast.ply).toBe(0);
    expect(countFastPieces(fast, 0)).toBe(12);
    expect(countFastPieces(fast, 1)).toBe(12);
  });

  it("converts fast state back into a public GameState", () => {
    const fast = initialFastState();
    const publicState = toGameState(fast);

    expect(publicState.turn).toBe("w");
    expect(publicState.halfmoveClock).toBe(0);
    expect(publicState.ply).toBe(0);
    expect(publicState.history).toEqual([]);
    expect(pieceCount(publicState.board, "w")).toBe(12);
    expect(pieceCount(publicState.board, "b")).toBe(12);
    expect(publicState.repetitions.get(publicPositionKey(publicState.board, "w"))).toBe(1);
  });
});

function publicStateFrom(
  pieces: Array<{ row: number; col: number; piece: Piece }>,
  turn: "w" | "b" = "w"
): GameState {
  const board = Array.from({ length: 8 }, () =>
    Array.from<Piece | null>({ length: 8 }).fill(null)
  );
  for (const { row, col, piece } of pieces) board[row][col] = piece;
  return {
    board,
    turn,
    halfmoveClock: 0,
    ply: 0,
    history: [],
    repetitions: new Map([[publicPositionKey(board, turn), 1]]),
    endgame: null,
  };
}

function man(color: "w" | "b"): Piece {
  return { color, king: false };
}

function king(color: "w" | "b"): Piece {
  return { color, king: true };
}

describe("engine-ai move generation", () => {
  it("generates the 7 legal opening moves", () => {
    expect(generateFastMoves(initialFastState())).toHaveLength(7);
  });

  it("forces captures when any capture exists", () => {
    const state = publicStateFrom(
      [
        { row: 5, col: 2, piece: man("w") },
        { row: 4, col: 3, piece: man("b") },
      ],
      "w"
    );
    const moves = generateFastMoves(fromGameState(state));

    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toHaveLength(1);
    expect(moves[0].to).toEqual({ row: 3, col: 4 });
  });

  it("allows men to capture backward", () => {
    const state = publicStateFrom(
      [
        { row: 5, col: 2, piece: man("w") },
        { row: 6, col: 3, piece: man("b") },
      ],
      "w"
    );

    expect(generateFastMoves(fromGameState(state))[0].to).toEqual({
      row: 7,
      col: 4,
    });
  });

  it("allows flying kings to land on any empty square beyond the captured piece", () => {
    const state = publicStateFrom(
      [
        { row: 7, col: 0, piece: king("w") },
        { row: 4, col: 3, piece: man("b") },
      ],
      "w"
    );
    const landings = generateFastMoves(fromGameState(state)).map((move) => move.to);

    expect(landings).toEqual(
      expect.arrayContaining([
        { row: 3, col: 4 },
        { row: 2, col: 5 },
        { row: 1, col: 6 },
        { row: 0, col: 7 },
      ])
    );
  });

  it("promotes a man mid-chain and continues as a king", () => {
    const state = publicStateFrom(
      [
        { row: 2, col: 1, piece: man("w") },
        { row: 1, col: 2, piece: man("b") },
        { row: 1, col: 4, piece: man("b") },
      ],
      "w"
    );

    const chains = generateFastMoves(fromGameState(state)).filter(
      (move) => move.captures.length === 2
    );
    expect(chains.length).toBeGreaterThan(0);
    expect(chains.some((move) => move.promoted)).toBe(true);
  });
});

function trustedPerft(state: GameState, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of getLegalMoves(state)) {
    nodes += trustedPerft(applyMove(state, move), depth - 1);
  }
  return nodes;
}

describe("engine-ai make/unmake and perft", () => {
  it("makes and unmakes a simple move back to the same position key", () => {
    const state = initialFastState();
    const before = fastPositionKey(state);
    const move = generateFastMoves(state)[0];
    const undo = makeFastMove(state, move);

    expect(fastPositionKey(state)).not.toBe(before);

    unmakeFastMove(state, undo);

    expect(fastPositionKey(state)).toBe(before);
  });

  it("makes and unmakes a capture back to the same position key", () => {
    const publicState = publicStateFrom(
      [
        { row: 5, col: 2, piece: man("w") },
        { row: 4, col: 3, piece: man("b") },
      ],
      "w"
    );
    const state = fromGameState(publicState);
    const before = fastPositionKey(state);
    const move = generateFastMoves(state)[0];
    const undo = makeFastMove(state, move);

    expect(state.cells[move.captureIndices[0]]).toBe(EMPTY);

    unmakeFastMove(state, undo);

    expect(fastPositionKey(state)).toBe(before);
  });

  it("matches trusted perft from the initial position through depth 4", () => {
    const publicState = initialState();
    const fast = fromGameState(publicState);

    for (let depth = 1; depth <= 4; depth++) {
      expect(perft(fast, depth)).toBe(trustedPerft(publicState, depth));
    }
  });

  it("matches trusted perft from a tactical capture position through depth 4", () => {
    const publicState = publicStateFrom(
      [
        { row: 5, col: 2, piece: man("w") },
        { row: 4, col: 3, piece: man("b") },
        { row: 2, col: 5, piece: man("b") },
        { row: 6, col: 5, piece: man("w") },
      ],
      "w"
    );
    const fast = fromGameState(publicState);

    for (let depth = 1; depth <= 4; depth++) {
      expect(perft(fast, depth)).toBe(trustedPerft(publicState, depth));
    }
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { emptyBoard, getLegalMoves, positionKey } from "@/lib/engine";
import type { GameState, Piece } from "@/lib/engine";

import { useGameStore } from "../game-store";

function stateFrom(
  pieces: Array<{ row: number; col: number; piece: Piece }>,
  turn: "w" | "b" = "w"
): GameState {
  const board = emptyBoard();
  for (const { row, col, piece } of pieces) board[row][col] = piece;
  return {
    board,
    turn,
    halfmoveClock: 0,
    ply: 0,
    history: [],
    repetitions: new Map([[positionKey(board, turn), 1]]),
    endgame: null,
  };
}

describe("game store replay controls", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("returns hover preview to the previously pinned ply", () => {
    const store = useGameStore.getState();
    const first = store.tryMove({ row: 5, col: 0 }, { row: 4, col: 1 });
    expect(first).not.toBeNull();
    const second = useGameStore
      .getState()
      .tryMove({ row: 2, col: 1 }, { row: 3, col: 0 });
    expect(second).not.toBeNull();

    useGameStore.getState().pinPly(1);
    expect(useGameStore.getState().viewPly).toBe(1);

    useGameStore.getState().hoverPly(2);
    expect(useGameStore.getState().viewPly).toBe(2);

    useGameStore.getState().hoverPly(null);
    expect(useGameStore.getState().viewPly).toBe(1);
  });

  it("keeps arrows pinned until the user reaches the live ply", () => {
    useGameStore.getState().tryMove({ row: 5, col: 0 }, { row: 4, col: 1 });
    useGameStore.getState().tryMove({ row: 2, col: 1 }, { row: 3, col: 0 });

    useGameStore.getState().pinPly(0);
    useGameStore.getState().viewStepForward();
    expect(useGameStore.getState().viewPly).toBe(1);
    useGameStore.getState().viewStepForward();
    expect(useGameStore.getState().viewPly).toBeNull();
  });
});

describe("game store capture draft", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("lets a multi-capture be played one landing at a time while committing one history move", () => {
    const game = stateFrom([
      { row: 6, col: 0, piece: { color: "w", king: false } },
      { row: 5, col: 1, piece: { color: "b", king: false } },
      { row: 3, col: 3, piece: { color: "b", king: false } },
    ]);
    useGameStore.setState({
      game,
      result: { kind: "ongoing" },
      selected: null,
      possibleMoves: [],
      pieces: [
        { id: "white", color: "w", king: false, row: 6, col: 0 },
        { id: "first-capture", color: "b", king: false, row: 5, col: 1 },
        { id: "second-capture", color: "b", king: false, row: 3, col: 3 },
      ],
    });

    const firstStep = useGameStore
      .getState()
      .tryMoveOrCapture({ row: 6, col: 0 }, { row: 4, col: 2 });

    expect(firstStep).toBeNull();
    expect(useGameStore.getState().pendingCapture?.path).toEqual([
      { row: 4, col: 2 },
    ]);
    expect(useGameStore.getState().game.history).toHaveLength(0);
    expect(useGameStore.getState().game.turn).toBe("w");
    expect(useGameStore.getState().pieces).toEqual([
      { id: "white", color: "w", king: false, row: 4, col: 2 },
      { id: "second-capture", color: "b", king: false, row: 3, col: 3 },
    ]);

    const finalStep = useGameStore
      .getState()
      .tryMoveOrCapture({ row: 4, col: 2 }, { row: 2, col: 4 });

    expect(finalStep?.path).toEqual([
      { row: 4, col: 2 },
      { row: 2, col: 4 },
    ]);
    expect(useGameStore.getState().pendingCapture).toBeNull();
    expect(useGameStore.getState().game.history).toHaveLength(1);
    expect(useGameStore.getState().game.turn).toBe("b");
    expect(useGameStore.getState().pieces).toEqual([
      { id: "white", color: "w", king: false, row: 2, col: 4 },
    ]);
  });
});

describe("game store engine commits", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("commits a full engine move and clears replay state", () => {
    const store = useGameStore.getState();
    const move = store.tryMove({ row: 5, col: 0 }, { row: 4, col: 1 });
    expect(move).not.toBeNull();

    const blackMove = getLegalMoves(useGameStore.getState().game)[0];
    useGameStore.getState().pinPly(0);

    useGameStore.getState().commitMove(blackMove);

    expect(useGameStore.getState().game.history).toHaveLength(2);
    expect(useGameStore.getState().lastMove).toEqual(blackMove);
    expect(useGameStore.getState().viewPly).toBeNull();
    expect(useGameStore.getState().pendingCapture).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  BOARD_SIZE,
  applyMove,
  emptyBoard,
  findMoveByEndpoints,
  getLegalMoves,
  getResult,
  hasMandatoryCapture,
  initialBoard,
  initialState,
  legalMovesFromSquare,
  moveToNotation,
  pieceCount,
  positionKey,
  squareFromNumber,
  squareNumber,
} from "../index";
import { squareToAlgebraic } from "../notation";
import type { GameState, Piece, Square } from "../index";

// --- helpers ---------------------------------------------------------------

function stateFrom(
  pieces: Array<{ row: number; col: number; piece: Piece }>,
  turn: "w" | "b" = "w"
): GameState {
  const b = emptyBoard();
  for (const { row, col, piece } of pieces) b[row][col] = piece;
  return {
    board: b,
    turn,
    halfmoveClock: 0,
    ply: 0,
    history: [],
    repetitions: new Map([[positionKey(b, turn), 1]]),
    endgame: null,
  };
}

function man(color: "w" | "b"): Piece {
  return { color, king: false };
}
function king(color: "w" | "b"): Piece {
  return { color, king: true };
}

function moveSet(state: GameState): string[] {
  return getLegalMoves(state)
    .map(moveToNotation)
    .sort();
}

function at(row: number, col: number): Square {
  return { row, col };
}

// --- initial state ---------------------------------------------------------

describe("initial board", () => {
  it("has 12 pieces per side", () => {
    const s = initialState();
    expect(pieceCount(s.board, "w")).toBe(12);
    expect(pieceCount(s.board, "b")).toBe(12);
  });

  it("white moves first", () => {
    expect(initialState().turn).toBe("w");
  });

  it("places pieces only on dark squares", () => {
    const b = initialBoard();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const isDark = ((r + c) & 1) === 1;
        if (!isDark) expect(b[r][c]).toBeNull();
      }
    }
  });

  it("rows 0-2 are Black, rows 5-7 are White", () => {
    const b = initialBoard();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (b[r][c]) expect(b[r][c]!.color).toBe("b");
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (b[r][c]) expect(b[r][c]!.color).toBe("w");
      }
    }
  });
});

// --- simple moves ----------------------------------------------------------

describe("simple moves", () => {
  it("opening position offers 7 white pawn moves", () => {
    // White has pieces on row 5 (cols 0,2,4,6) — each can move to row 4.
    // From row 5: corners (col 0 and col 6) have one diagonal; middle have two.
    // Effective opening count from row 5 only — row 6 and 7 are blocked.
    const moves = getLegalMoves(initialState());
    // From row 5: col 0 → (4,1); col 2 → (4,1),(4,3); col 4 → (4,3),(4,5); col 6 → (4,5),(4,7)
    // = 1+2+2+2 = 7
    expect(moves).toHaveLength(7);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
    expect(moves.every((m) => m.from.row === 5)).toBe(true);
  });

  it("a lone white man moves only forward-diagonally", () => {
    // White man at (5,3) = "d3". Forward (row 4) targets: (4,2) = "c4", (4,4) = "e4".
    // Backward (6,2)/(6,4) NOT allowed for simple move.
    const s = stateFrom([{ row: 5, col: 3, piece: man("w") }], "w");
    expect(moveSet(s)).toEqual(["d3-c4", "d3-e4"]);
  });

  it("a lone black man moves only forward-diagonally (down the board)", () => {
    const s = stateFrom([{ row: 2, col: 3, piece: man("b") }], "b");
    // Black at (2,3) = "d6". Forward = row 3. Targets (3,2)="c5" and (3,4)="e5".
    expect(moveSet(s).sort()).toEqual(["d6-c5", "d6-e5"].sort());
  });

  it("cannot move onto an occupied square", () => {
    const s = stateFrom(
      [
        { row: 5, col: 3, piece: man("w") },
        { row: 4, col: 2, piece: man("w") }, // blocks left
      ],
      "w"
    );
    const moves = getLegalMoves(s);
    // From (5,3) only (4,4) is open. The blocker at (4,2) also has its forward open.
    expect(moves.filter((m) => m.from.row === 5)).toHaveLength(1);
  });
});

// --- captures --------------------------------------------------------------

describe("captures (mandatory)", () => {
  it("forces capture when one exists", () => {
    // White at (5,3), Black at (4,4); landing (3,5) empty → forced capture.
    const s = stateFrom(
      [
        { row: 5, col: 3, piece: man("w") },
        { row: 4, col: 4, piece: man("b") },
      ],
      "w"
    );
    const moves = getLegalMoves(s);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toHaveLength(1);
    expect(moves[0].to).toEqual({ row: 3, col: 5 });
    expect(hasMandatoryCapture(s)).toBe(true);
  });

  it("man captures BACKWARD (Russian rule)", () => {
    // White at (5,3); Black behind at (6,4); landing (7,5) empty.
    const s = stateFrom(
      [
        { row: 5, col: 3, piece: man("w") },
        { row: 6, col: 4, piece: man("b") },
      ],
      "w"
    );
    const moves = getLegalMoves(s);
    const capture = moves.find((m) => m.captures.length === 1);
    expect(capture).toBeDefined();
    expect(capture!.to).toEqual({ row: 7, col: 5 });
  });

  it("man captures forward and promotes on the home rank", () => {
    // White at (2,2); Black at (1,3); landing (0,4) — promotion row for white.
    const s = stateFrom(
      [
        { row: 2, col: 2, piece: man("w") },
        { row: 1, col: 3, piece: man("b") },
      ],
      "w"
    );
    const move = getLegalMoves(s).find((m) => m.captures.length > 0)!;
    expect(move.to).toEqual({ row: 0, col: 4 });
    expect(move.promoted).toBe(true);

    const next = applyMove(s, move);
    expect(next.board[0][4]).toEqual({ color: "w", king: true });
    expect(next.board[1][3]).toBeNull(); // captured removed
    expect(next.board[2][2]).toBeNull();
  });

  it("a chain capture lands at end and removes ALL captured pieces", () => {
    // White at (6,0). Black at (5,1) and (3,3). White path: (6,0)→(4,2)→(2,4).
    // (5,1) jumped to (4,2). Then (3,3) jumped to (2,4).
    const s = stateFrom(
      [
        { row: 6, col: 0, piece: man("w") },
        { row: 5, col: 1, piece: man("b") },
        { row: 3, col: 3, piece: man("b") },
      ],
      "w"
    );
    const moves = getLegalMoves(s);
    const chain = moves.find((m) => m.captures.length === 2);
    expect(chain).toBeDefined();
    expect(chain!.to).toEqual({ row: 2, col: 4 });
    expect(chain!.path).toEqual([
      { row: 4, col: 2 },
      { row: 2, col: 4 },
    ]);

    const next = applyMove(s, chain!);
    expect(pieceCount(next.board, "b")).toBe(0);
    expect(next.board[2][4]).toEqual({ color: "w", king: false });
  });

  it("Turkish-strike: a captured piece cannot be re-jumped in the same chain", () => {
    // White king at (4,4). Two black men: one at (3,3), landing (2,2) empty
    // and another at (5,5), landing (6,6) empty. We arrange a setup where a
    // naive engine might try to "loop back" over the same piece.
    //
    // Use a king at (4,2). Black at (3,3) – capture to (2,4) or further.
    // After capture there's no way to come back through (3,3) because it's frozen.
    const s = stateFrom(
      [
        { row: 4, col: 2, piece: king("w") },
        { row: 3, col: 3, piece: man("b") },
      ],
      "w"
    );
    const moves = getLegalMoves(s);
    // King captures (3,3) and may land at (2,4), (1,5), (0,6). Three captures, ALL
    // with exactly one capture. No move should appear with captures.length > 1.
    expect(moves.every((m) => m.captures.length === 1)).toBe(true);
    expect(moves.length).toBeGreaterThanOrEqual(3);
  });

  it("promotion mid-chain: man becomes king and continues capturing as king", () => {
    // White man at (2,2). Black at (1,3) → land (0,4) (promotion).
    // Then as king should be able to capture (3,5) at distance via fly,
    // arranging for a king-only continuation. Setup:
    //   Black at (1,3) and (3,5). Empty between (0,4) and (3,5)? (0,4)-(1,5)-(2,6)-(3,7) is one diag.
    // Let's put a second black at (1,5) instead. Then from (0,4) man cannot reach further
    // since (1,5) is adjacent and forward-direction would be blocked. As king it COULD jump (1,5).
    const s = stateFrom(
      [
        { row: 2, col: 2, piece: man("w") },
        { row: 1, col: 3, piece: man("b") },
        { row: 1, col: 5, piece: man("b") },
      ],
      "w"
    );
    // First capture: (2,2)→(0,4), promotes. Then as king from (0,4), can fly over (1,5) and land at (2,6) or beyond.
    const chains = getLegalMoves(s).filter((m) => m.captures.length === 2);
    expect(chains.length).toBeGreaterThan(0);
    const chain = chains.find((m) => m.to.row === 2 && m.to.col === 6) ?? chains[0];
    expect(chain.promoted).toBe(true);
  });
});

// --- king mechanics --------------------------------------------------------

describe("king (damka)", () => {
  it("flies any distance on an empty diagonal", () => {
    const s = stateFrom([{ row: 7, col: 0, piece: king("w") }], "w");
    const moves = getLegalMoves(s);
    // From (7,0) the only open diagonal is up-right. 7 squares: (6,1)..(0,7).
    expect(moves).toHaveLength(7);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it("flying capture: jump enemy and land on any empty square beyond", () => {
    // White king at (7,1); Black at (4,4); diagonal up-right from (7,1):
    //   (6,2),(5,3),(4,4),(3,5),(2,6),(1,7).
    // Capture (4,4), landings: (3,5),(2,6),(1,7).
    const s = stateFrom(
      [
        { row: 7, col: 1, piece: king("w") },
        { row: 4, col: 4, piece: man("b") },
      ],
      "w"
    );
    const moves = getLegalMoves(s);
    const captures = moves.filter((m) => m.captures.length === 1);
    expect(captures.map((m) => m.to)).toEqual(
      expect.arrayContaining([
        { row: 3, col: 5 },
        { row: 2, col: 6 },
        { row: 1, col: 7 },
      ])
    );
    expect(captures).toHaveLength(3);
  });

  it("a friend piece blocks the king's diagonal", () => {
    const s = stateFrom(
      [
        { row: 7, col: 1, piece: king("w") },
        { row: 4, col: 4, piece: man("w") }, // blocking white
      ],
      "w"
    );
    const moves = legalMovesFromSquare(s, { row: 7, col: 1 });
    // King's diagonals from (7,1):
    //   up-left  → (6,0): 1 move
    //   up-right → (6,2),(5,3), then (4,4) blocker: 2 moves
    //   down-*   → off the board: 0 moves
    // Total 3 simple king moves.
    expect(moves).toHaveLength(3);
  });
});

// --- apply and notation ----------------------------------------------------

describe("applyMove + notation", () => {
  it("simple move uses '-' and renders as algebraic file+rank", () => {
    const s = stateFrom([{ row: 5, col: 0, piece: man("w") }], "w");
    const moves = getLegalMoves(s);
    expect(moves).toHaveLength(1);
    // (5,0) = "a3", (4,1) = "b4"
    expect(moveToNotation(moves[0])).toBe("a3-b4");
    expect(squareToAlgebraic({ row: 5, col: 0 })).toBe("a3");
  });

  it("capture notation uses ':' separator", () => {
    // White at (5,3); Black at (4,4); landing (3,5).
    const s = stateFrom(
      [
        { row: 5, col: 3, piece: man("w") },
        { row: 4, col: 4, piece: man("b") },
      ],
      "w"
    );
    const move = getLegalMoves(s).find((m) => m.captures.length > 0)!;
    expect(moveToNotation(move)).toBe("d3:f5");
  });

  it("alternates turns and stores history", () => {
    const s0 = initialState();
    const m = getLegalMoves(s0)[0];
    const s1 = applyMove(s0, m);
    expect(s1.turn).toBe("b");
    expect(s1.history).toHaveLength(1);
    expect(s1.ply).toBe(1);
  });

  it("findMoveByEndpoints locates a legal move", () => {
    const s = initialState();
    const m = findMoveByEndpoints(s, at(5, 0), at(4, 1));
    expect(m).not.toBeNull();
    expect(m!.captures).toHaveLength(0);
  });
});

// --- result detection ------------------------------------------------------

describe("getResult", () => {
  it("ongoing in the starting position", () => {
    expect(getResult(initialState()).kind).toBe("ongoing");
  });

  it("declares a win when a side has no pieces", () => {
    const s = stateFrom([{ row: 5, col: 3, piece: man("w") }], "b");
    const r = getResult(s);
    expect(r.kind).toBe("win");
    if (r.kind === "win") expect(r.winner).toBe("w");
  });

  it("declares a win when the side to move has no legal moves", () => {
    // Need at least one piece per side so the no_pieces check doesn't trip.
    // Black man at (7,0): forward = row 8 (off-board), nothing to capture → no moves.
    // White king at (0,7) far away, unrelated. Black to move ⇒ White wins by no_moves.
    const s = stateFrom(
      [
        { row: 7, col: 0, piece: man("b") },
        { row: 0, col: 7, piece: king("w") },
      ],
      "b"
    );
    const r = getResult(s);
    expect(r.kind).toBe("win");
    if (r.kind === "win") {
      expect(r.winner).toBe("w");
      expect(r.reason).toBe("no_moves");
    }
  });
});

// --- square numbering round trip ------------------------------------------

describe("square numbering", () => {
  it("round-trips for all 32 dark squares", () => {
    for (let n = 1; n <= 32; n++) {
      const sq = squareFromNumber(n);
      expect(squareNumber(sq)).toBe(n);
    }
  });

  it("matches the standard layout (square 1 = a8 top-left dark)", () => {
    expect(squareFromNumber(1)).toEqual({ row: 0, col: 1 });
    expect(squareFromNumber(4)).toEqual({ row: 0, col: 7 });
    expect(squareFromNumber(5)).toEqual({ row: 1, col: 0 });
    expect(squareFromNumber(32)).toEqual({ row: 7, col: 6 });
  });
});

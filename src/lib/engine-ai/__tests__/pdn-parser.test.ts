import { describe, it, expect } from "vitest";
import {
  algToFastSquare,
  fastSquareToIndex,
  fastSquareToAlg,
  parsePdn,
  parsePdnFile,
  gameToPdn,
} from "../io/pdn";

// ---------------------------------------------------------------------------
// Square conversion
// ---------------------------------------------------------------------------

describe("algToFastSquare", () => {
  it("maps rank 1 to row 7 (bottom)", () => {
    expect(algToFastSquare("a1")).toEqual({ row: 7, col: 0 });
    expect(algToFastSquare("c1")).toEqual({ row: 7, col: 2 });
  });

  it("maps rank 8 to row 0 (top)", () => {
    expect(algToFastSquare("b8")).toEqual({ row: 0, col: 1 });
    expect(algToFastSquare("h8")).toEqual({ row: 0, col: 7 });
  });

  it("maps mid-board squares", () => {
    expect(algToFastSquare("c3")).toEqual({ row: 5, col: 2 });
    expect(algToFastSquare("d6")).toEqual({ row: 2, col: 3 });
    expect(algToFastSquare("b4")).toEqual({ row: 4, col: 1 });
  });
});

describe("fastSquareToAlg (round-trip)", () => {
  const SAMPLES = ["a1", "c1", "e1", "g1", "b2", "d2", "f2", "h2", "b8", "d8", "f8", "h8", "c3", "d6"];
  for (const alg of SAMPLES) {
    it(`round-trips ${alg}`, () => {
      expect(fastSquareToAlg(algToFastSquare(alg))).toBe(alg);
    });
  }
});

describe("fastSquareToIndex", () => {
  it("maps initial white squares to correct 0-based indices", () => {
    // Russian shashki square 1 = row 0 col 1 = index 0
    // Russian shashki square 29 = row 7 col 0 = index 28
    // a1 → row 7 col 0 (odd row) → index = 7*4 + 0/2 = 28
    expect(fastSquareToIndex(algToFastSquare("a1"))).toBe(28);
    // c1 → row 7 col 2 (odd row) → index = 7*4 + 2/2 = 29
    expect(fastSquareToIndex(algToFastSquare("c1"))).toBe(29);
    // e1 → row 7 col 4 → 7*4+2 = 30
    expect(fastSquareToIndex(algToFastSquare("e1"))).toBe(30);
    // g1 → row 7 col 6 → 7*4+3 = 31
    expect(fastSquareToIndex(algToFastSquare("g1"))).toBe(31);
    // b2 → row 6 col 1 (even row) → 6*4+(1-1)/2 = 24
    expect(fastSquareToIndex(algToFastSquare("b2"))).toBe(24);
    // h2 → row 6 col 7 → 6*4+(7-1)/2 = 24+3 = 27
    expect(fastSquareToIndex(algToFastSquare("h2"))).toBe(27);
  });

  it("maps initial black squares to correct indices", () => {
    // b8 → row 0 col 1 (even row) → 0*4+(1-1)/2 = 0
    expect(fastSquareToIndex(algToFastSquare("b8"))).toBe(0);
    // h8 → row 0 col 7 → 0*4+(7-1)/2 = 3
    expect(fastSquareToIndex(algToFastSquare("h8"))).toBe(3);
    // a7 → row 1 col 0 (odd row) → 1*4+0/2 = 4
    expect(fastSquareToIndex(algToFastSquare("a7"))).toBe(4);
    // g7 → row 1 col 6 → 1*4+6/2 = 7
    expect(fastSquareToIndex(algToFastSquare("g7"))).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// parsePdn
// ---------------------------------------------------------------------------

const SINGLE_GAME = `[Event "Rated Russian game"]
[Site "https://lidraughts.org/tRQCNXCU"]
[Date "2026.05.14"]
[White "JustNobody19"]
[Black "Ten"]
[Result "2-0"]
[WhiteElo "2206"]
[BlackElo "1452"]
[GameType "25"]

1. c3-b4 d6-c5 2. b4xd6 c7xe5 3. b2-c3 d8-c7 4. e3-f4 c7-d6 5. c3-b4 b6-c5 6. b4-a5 b8-c7 7. d2-e3 f6-g5 8. g3-h4 e5xg3 9. h4xd4 2-0`;

const TWO_GAMES = `${SINGLE_GAME}

[Event "Rated Russian game"]
[Site "https://lidraughts.org/VuL2CgzR"]
[Date "2026.05.14"]
[White "Ten"]
[Black "JustNobody19"]
[Result "0-2"]
[WhiteElo "1460"]
[BlackElo "2205"]
[GameType "25"]

1. g3-h4 b6-a5 2. f2-g3 c7-b6 3. g1-f2 d6-c5 4. e3-f4 f6-g5 5. h4xf6 e7xg1 6. d2-e3 g1xd4 7. c3xe5 c5-b4 0-2`;

describe("parsePdn — single game", () => {
  it("parses tags", () => {
    const [game] = parsePdn(SINGLE_GAME);
    expect(game.white).toBe("JustNobody19");
    expect(game.black).toBe("Ten");
    expect(game.whiteElo).toBe(2206);
    expect(game.blackElo).toBe(1452);
    expect(game.gameType).toBe("25");
  });

  it("parses result", () => {
    const [game] = parsePdn(SINGLE_GAME);
    expect(game.result).toBe("2-0");
  });

  it("parses move count", () => {
    const [game] = parsePdn(SINGLE_GAME);
    // 9 move-pairs, last white move has no black reply → 17 half-moves
    expect(game.moves.length).toBe(17);
  });

  it("parses first move correctly", () => {
    const [game] = parsePdn(SINGLE_GAME);
    const m = game.moves[0];
    expect(m.raw).toBe("c3-b4");
    expect(m.isCapture).toBe(false);
    expect(m.from).toEqual(algToFastSquare("c3"));
    expect(m.to).toEqual(algToFastSquare("b4"));
  });

  it("parses captures", () => {
    const [game] = parsePdn(SINGLE_GAME);
    const capture = game.moves[2]; // b4xd6
    expect(capture.raw).toBe("b4xd6");
    expect(capture.isCapture).toBe(true);
  });
});

describe("parsePdn — two games", () => {
  it("parses both games", () => {
    const games = parsePdn(TWO_GAMES);
    expect(games.length).toBe(2);
  });

  it("second game has correct result", () => {
    const [, g2] = parsePdn(TWO_GAMES);
    expect(g2.result).toBe("0-2");
    expect(g2.white).toBe("Ten");
  });
});

describe("parsePdn — robustness", () => {
  it("strips block comments", () => {
    const withComment = SINGLE_GAME.replace("c3-b4", "c3-b4 { good move }");
    const [game] = parsePdn(withComment);
    expect(game.moves[0].raw).toBe("c3-b4");
  });

  it("returns empty array for empty string", () => {
    expect(parsePdn("")).toEqual([]);
  });

  it("skips games with no moves", () => {
    const noMoves = `[Event "test"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n*`;
    expect(parsePdn(noMoves)).toEqual([]);
  });
});

describe("parsePdnFile — russianOnly filter", () => {
  const MIXED = `[Event "Rated International game"]
[White "A"]
[Black "B"]
[Result "2-0"]
[GameType "20"]

1. c3-b4 d6-c5 2-0

${SINGLE_GAME}`;

  it("excludes non-Russian GameType when russianOnly=true", () => {
    const games = parsePdnFile(MIXED, true);
    // GameType "25" passes; GameType "20" is filtered out
    expect(games.length).toBe(1);
    expect(games[0].gameType).toBe("25");
  });

  it("includes all when russianOnly=false", () => {
    const games = parsePdnFile(MIXED, false);
    expect(games.length).toBe(2);
  });
});

describe("gameToPdn round-trip", () => {
  it("re-serialises moves", () => {
    const [game] = parsePdn(SINGLE_GAME);
    const out = gameToPdn(game);
    expect(out).toContain("c3-b4");
    expect(out).toContain("b4xd6");
    expect(out).toContain('2-0');
    expect(out).toContain('[White "JustNobody19"]');
  });
});

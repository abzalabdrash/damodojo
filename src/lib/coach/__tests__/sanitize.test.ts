import { describe, expect, it } from "vitest";

import {
  cleanTrainerOutput,
  isValidDarkSquare,
  stripChessTerms,
  stripInvalidSquares,
  VALID_DARK_SQUARES,
} from "../sanitize";

describe("sanitize.VALID_DARK_SQUARES", () => {
  it("contains exactly 32 dark squares of an 8x8 board", () => {
    expect(VALID_DARK_SQUARES).toHaveLength(32);
    expect(new Set(VALID_DARK_SQUARES).size).toBe(32);
  });

  it("includes corner darks and excludes corner lights", () => {
    expect(isValidDarkSquare("a1")).toBe(true);
    expect(isValidDarkSquare("h8")).toBe(true);
    expect(isValidDarkSquare("a8")).toBe(false);
    expect(isValidDarkSquare("h1")).toBe(false);
  });

  it("rejects famous chess-only squares (light) like d5, e4", () => {
    expect(isValidDarkSquare("d5")).toBe(false);
    expect(isValidDarkSquare("e4")).toBe(false);
  });
});

describe("stripChessTerms", () => {
  it("replaces ферзь / король with дамка equivalents", () => {
    expect(stripChessTerms("Защищай ферзя!")).toContain("дамку");
    expect(stripChessTerms("Король под боем")).toContain("дамку");
  });

  it("replaces пешка / слон / ладья with шашка", () => {
    expect(stripChessTerms("активизируй пешку")).toContain("шашку");
    expect(stripChessTerms("Слон закрыт")).toContain("шашку");
    expect(stripChessTerms("Ладья работает")).toContain("шашку");
  });

  it("drops chess-only events like шах / мат / рокировка", () => {
    expect(stripChessTerms("Будь внимателен — шах!")).not.toMatch(/шах/i);
    expect(stripChessTerms("грозит мат")).not.toMatch(/мат/i);
    expect(stripChessTerms("сделай рокировку")).not.toMatch(/рокировк/i);
  });
});

describe("stripInvalidSquares", () => {
  it("removes light-square coordinates like d5", () => {
    expect(stripInvalidSquares("ищи взятие на d5")).not.toMatch(/d5/);
  });

  it("keeps valid dark-square coordinates like c3, e5", () => {
    expect(stripInvalidSquares("сыграй c3-d4")).toMatch(/c3/);
    expect(stripInvalidSquares("забирай на e5")).toMatch(/e5/);
  });

  it("does not touch random lowercase letters that are not coords", () => {
    expect(stripInvalidSquares("план a — атака")).toMatch(/a — атака/);
  });
});

describe("cleanTrainerOutput", () => {
  it("kills the d5 hallucination together with the chess term", () => {
    const out = cleanTrainerOutput("Защищай короля и бери на d5!");
    expect(out).not.toMatch(/король/i);
    expect(out).not.toMatch(/d5/);
    expect(out).toMatch(/дамку/);
  });

  it("collapses dangling whitespace left by substitutions", () => {
    const out = cleanTrainerOutput("Бери на d5 .");
    expect(out).not.toMatch(/  /);
    expect(out).not.toMatch(/\s\./);
  });

  it("preserves a clean draughts-correct line untouched", () => {
    expect(cleanTrainerOutput("Хорошее взятие c3:e5, держи диагональ.")).toBe(
      "Хорошее взятие c3:e5, держи диагональ.",
    );
  });

  it("strips name prefixes and bracket tags from the start", () => {
    expect(cleanTrainerOutput("АТА: Думай дважды.")).toBe("Думай дважды.");
    expect(cleanTrainerOutput("[live]: Темп!")).toBe("Темп!");
  });
});

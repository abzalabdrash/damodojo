import { describe, expect, it } from "vitest";

import { moveToNotation } from "@/lib/engine";
import { movesFromNotation } from "../replay-record";

describe("archive replay records", () => {
  it("reconstructs legal moves from saved notation", () => {
    const moves = movesFromNotation(["a3-b4", "b6-a5"]);

    expect(moves.map(moveToNotation)).toEqual(["a3-b4", "b6-a5"]);
  });
});

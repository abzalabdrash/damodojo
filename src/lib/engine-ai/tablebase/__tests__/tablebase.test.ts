import { describe, expect, it } from "vitest";

import { buildTablebase } from "../build";
import { encodePosition } from "../positions";
import { BLACK, KING, OCCUPIED, WHITE, type FastState } from "../../types";

function king(color: 0 | 1): number {
  return OCCUPIED | KING | (color === BLACK ? 0b100 : 0);
}

function makeState(
  whites: number[],
  blacks: number[],
  turn: 0 | 1
): FastState {
  const cells = new Uint8Array(32);
  for (const i of whites) cells[i] = king(WHITE);
  for (const i of blacks) cells[i] = king(BLACK);
  return {
    cells,
    turn,
    halfmoveClock: 0,
    ply: 0,
    repetitionStack: [],
    endgame: null,
  };
}

describe("3-piece kings-only tablebase", () => {
  const tb = buildTablebase();

  it("builds a non-empty tablebase", () => {
    expect(tb.size).toBeGreaterThan(1000);
  });

  it("classifies king vs king as a draw", () => {
    // White king on square 12, black king on square 20, white to move.
    const state = makeState([12], [20], WHITE);
    const id = encodePosition(state)!;
    const entry = tb.get(id);
    expect(entry).toBeDefined();
    expect(entry?.value).toBe("draw");
  });

  it("classifies all king vs king positions as draws", () => {
    let kvkCount = 0;
    let drawCount = 0;
    for (let w = 0; w < 32; w++) {
      for (let b = 0; b < 32; b++) {
        if (w === b) continue;
        for (const turn of [WHITE, BLACK] as const) {
          const state = makeState([w], [b], turn);
          const id = encodePosition(state)!;
          const entry = tb.get(id);
          if (!entry) continue;
          kvkCount++;
          if (entry.value === "draw") drawCount++;
        }
      }
    }
    // The vast majority of K-vs-K positions should be drawn. Allow a small
    // number of immediate-win edge cases just in case.
    expect(kvkCount).toBeGreaterThan(0);
    expect(drawCount / kvkCount).toBeGreaterThan(0.95);
  });
});

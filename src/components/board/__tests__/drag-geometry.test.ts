import { describe, expect, it } from "vitest";

import {
  dragTranslate,
  pointToBoardSquare,
  type BoardRect,
} from "../drag-geometry";

const rect: BoardRect = {
  left: 100,
  top: 50,
  width: 400,
  height: 400,
};

describe("drag geometry", () => {
  it("maps client coordinates to exact board cell boundaries", () => {
    expect(pointToBoardSquare(rect, { x: 100, y: 50 })).toEqual({ row: 0, col: 0 });
    expect(pointToBoardSquare(rect, { x: 149.9, y: 99.9 })).toEqual({ row: 0, col: 0 });
    expect(pointToBoardSquare(rect, { x: 150, y: 100 })).toEqual({ row: 1, col: 1 });
    expect(pointToBoardSquare(rect, { x: 499.9, y: 449.9 })).toEqual({ row: 7, col: 7 });
  });

  it("rejects drops outside the board instead of clamping them to an edge", () => {
    expect(pointToBoardSquare(rect, { x: 99.9, y: 200 })).toBeNull();
    expect(pointToBoardSquare(rect, { x: 500, y: 200 })).toBeNull();
    expect(pointToBoardSquare(rect, { x: 200, y: 49.9 })).toBeNull();
    expect(pointToBoardSquare(rect, { x: 200, y: 450 })).toBeNull();
  });

  it("maps flipped boards back to logical squares", () => {
    expect(pointToBoardSquare(rect, { x: 125, y: 75 }, true)).toEqual({ row: 7, col: 7 });
    expect(pointToBoardSquare(rect, { x: 475, y: 425 }, true)).toEqual({ row: 0, col: 0 });
  });

  it("computes pixel translation so the grabbed point stays under the cursor", () => {
    expect(
      dragTranslate(rect, {
        clientX: 225,
        clientY: 175,
        grabOffsetX: 10,
        grabOffsetY: -5,
      })
    ).toEqual({ x: 90, y: 105 });
  });
});

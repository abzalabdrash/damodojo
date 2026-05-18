import { describe, it, expect } from "vitest";
import { clockApplyMove, createClock, isFlaged, clockMs, MAX_LAG_COMPENSATION_MS } from "../clock";

describe("createClock", () => {
  it("initializes 3+0 correctly", () => {
    const c = createClock("3+0");
    expect(c.wMs).toBe(3 * 60 * 1000);
    expect(c.bMs).toBe(3 * 60 * 1000);
    expect(c.increment).toBe(0);
    expect(c.lastTickServerMs).toBe(0);
    expect(c.turn).toBe("w");
  });

  it("initializes 5+3 correctly", () => {
    const c = createClock("5+3");
    expect(c.wMs).toBe(5 * 60 * 1000);
    expect(c.increment).toBe(3000);
  });

  it("falls back to 3+0 for unknown control", () => {
    const c = createClock("99+99");
    expect(c.wMs).toBe(3 * 60 * 1000);
  });
});

describe("clockApplyMove", () => {
  it("first move doesn't deduct time", () => {
    const c = createClock("3+0");
    const now = Date.now();
    const next = clockApplyMove(c, "w", now, 0);
    expect(next.wMs).toBe(c.wMs); // no deduction on first move
    expect(next.turn).toBe("b");
    expect(next.lastTickServerMs).toBe(now);
  });

  it("deducts elapsed time after first move", () => {
    const c = createClock("3+0");
    const t0 = 1_000_000;
    const c1 = clockApplyMove(c, "w", t0, 0);
    const t1 = t0 + 5000; // 5 seconds later
    const c2 = clockApplyMove(c1, "b", t1, 0);
    expect(c2.bMs).toBe(c.bMs - 5000);
    expect(c2.turn).toBe("w");
  });

  it("adds increment after move", () => {
    const c = createClock("5+3");
    const t0 = 1_000_000;
    const c1 = clockApplyMove(c, "w", t0, 0);
    const t1 = t0 + 2000;
    const c2 = clockApplyMove(c1, "b", t1, 0);
    // b deducts 2s but gets +3s increment
    expect(c2.bMs).toBe(c.bMs - 2000 + 3000);
  });

  it("clamps lag compensation to MAX_LAG_COMPENSATION_MS", () => {
    const c = createClock("3+0");
    const t0 = 1_000_000;
    const c1 = clockApplyMove(c, "w", t0, 0);
    const t1 = t0 + 10000;
    const highLag = 9999;
    const c2 = clockApplyMove(c1, "b", t1, highLag);
    // Should compensate at most MAX_LAG_COMPENSATION_MS
    const expectedDeduct = Math.max(0, 10000 - MAX_LAG_COMPENSATION_MS);
    expect(c2.bMs).toBe(c.bMs - expectedDeduct);
  });

  it("never goes below 0ms", () => {
    const c = createClock("3+0");
    const t0 = 1_000_000;
    const c1 = clockApplyMove(c, "w", t0, 0);
    // Move 1 hour later
    const t1 = t0 + 3_600_000;
    const c2 = clockApplyMove(c1, "b", t1, 0);
    expect(c2.bMs).toBe(0);
  });
});

describe("isFlaged", () => {
  it("returns null when both have time", () => {
    const c = createClock("3+0");
    expect(isFlaged(c)).toBeNull();
  });

  it("returns 'w' when white runs out", () => {
    const c = createClock("3+0");
    expect(isFlaged({ ...c, wMs: 0 })).toBe("w");
  });

  it("returns 'b' when black runs out", () => {
    const c = createClock("3+0");
    expect(isFlaged({ ...c, bMs: 0 })).toBe("b");
  });
});

describe("clockMs", () => {
  it("returns correct time for each color", () => {
    const c = createClock("3+0");
    expect(clockMs(c, "w")).toBe(c.wMs);
    expect(clockMs(c, "b")).toBe(c.bMs);
  });
});

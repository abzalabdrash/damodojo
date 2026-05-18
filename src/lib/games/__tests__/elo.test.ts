import { describe, expect, it } from "vitest";

import { buildLeaderboardRows, calculateEloDelta, DEFAULT_ELO } from "../elo";

describe("online ELO leaderboard", () => {
  it("starts humans at 1500 and ignores bot/coach games", () => {
    const rows = buildLeaderboardRows([
      {
        white_id: "player:a",
        white_nick: "Abzal",
        black_id: "coach:ata",
        black_nick: "Ата",
        winner: "b",
        time_control: "coach",
        finished_at: "2026-05-18T10:00:00.000Z",
      },
      {
        white_id: "player:a",
        white_nick: "Abzal",
        black_id: "player:b",
        black_nick: "Madi",
        winner: "w",
        time_control: "3+2",
        finished_at: "2026-05-18T11:00:00.000Z",
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.nick === "Ата")).toBe(false);
    expect(rows[0]).toMatchObject({ nick: "Abzal", wins: 1, elo: DEFAULT_ELO + 12 });
  });

  it("rewards a big upset with a large gain", () => {
    const delta = calculateEloDelta(500, 2000, 1);
    expect(delta).toBeGreaterThanOrEqual(45);
    expect(delta).toBeLessThanOrEqual(50);
  });
});

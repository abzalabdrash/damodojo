import { describe, expect, it } from "vitest";

import { buildGameRecordInsert, movesToRecordNotation } from "../record";
import type { Move } from "@/lib/engine";

const simpleMove: Move = {
  from: { row: 5, col: 0 },
  to: { row: 4, col: 1 },
  path: [{ row: 4, col: 1 }],
  captures: [],
  promoted: false,
};

const captureMove: Move = {
  from: { row: 2, col: 3 },
  to: { row: 4, col: 5 },
  path: [{ row: 4, col: 5 }],
  captures: [{ row: 3, col: 4 }],
  promoted: false,
};

describe("game record helpers", () => {
  it("serializes move history using review-readable notation", () => {
    expect(movesToRecordNotation([simpleMove, captureMove])).toEqual([
      "a3-b4",
      "d6:f4",
    ]);
  });

  it("maps a bot game payload to the Supabase games row shape", () => {
    const row = buildGameRecordInsert({
      roomId: "bot-local-1",
      winner: "w",
      reason: "resign",
      moves: ["a3-b4"],
      plyCount: 1,
      timeControl: "bot",
      finishedAt: 1_700_000_000_000,
      players: [
        { playerId: "google-user-1", nick: "abzal", color: "w" },
        { playerId: "bot:aigerim", nick: "Айгерим", color: "b" },
      ],
    });

    expect(row).toMatchObject({
      room_id: "bot-local-1",
      white_id: "google-user-1",
      white_nick: "abzal",
      black_id: "bot:aigerim",
      black_nick: "Айгерим",
      winner: "w",
      reason: "resign",
      moves: ["a3-b4"],
      ply_count: 1,
      time_control: "bot",
      finished_at: "2023-11-14T22:13:20.000Z",
    });
  });
});

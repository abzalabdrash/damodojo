import type { Color } from "../src/lib/engine";
import type { ClockState, SerializedGameState } from "./protocol";

export interface GameRecord {
  roomId: string;
  gameState: SerializedGameState;
  finalClock: ClockState;
  winner: Color | null;
  reason: string;
  players: { playerId: string; nick: string; color: Color }[];
  finishedAt: number;
}

// Next.js app URL — set NEXT_PUBLIC_APP_URL in both .env.local and partykit secrets.
// Falls back to localhost:3000 for local dev.
function appUrl(): string {
  return (
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_APP_URL) ||
    "http://localhost:3000"
  );
}

export async function flushToSupabase(record: GameRecord): Promise<void> {
  const history = record.gameState.history ?? [];
  // Convert SerializedMove objects to UCI strings for compact storage
  const moves = history.map((m) => {
    const col = (sq: { row: number; col: number }) =>
      String.fromCharCode(97 + sq.col) + (8 - sq.row);
    if (m.captures.length === 0) return `${col(m.from)}-${col(m.to)}`;
    return [m.from, ...m.path].map(col).join(":");
  });
  const payload = {
    roomId: record.roomId,
    winner: record.winner,
    reason: record.reason,
    moves,
    plyCount: moves.length,
    timeControl: "3+0",
    finishedAt: record.finishedAt,
    players: record.players,
  };

  try {
    const res = await fetch(`${appUrl()}/api/games/record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-damadojo-secret": process.env.GAME_RECORD_SECRET ?? "",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[persistence] game_record failed:", res.status, text);
    }
  } catch (err) {
    console.error("[persistence] game_record error:", err);
  }
}

import type { Move } from "@/lib/engine";
import { moveToNotation } from "@/lib/engine/notation";

export interface GameRecordPlayer {
  playerId: string;
  nick: string;
  color: "w" | "b";
}

export interface GameRecordPayload {
  roomId: string;
  winner: "w" | "b" | null;
  reason: string;
  moves: string[];
  plyCount: number;
  timeControl: string;
  finishedAt: number;
  players: GameRecordPlayer[];
}

export interface GameRecordInsert {
  room_id: string;
  white_id: string | null;
  white_nick: string | null;
  black_id: string | null;
  black_nick: string | null;
  winner: "w" | "b" | null;
  reason: string;
  moves: string[];
  ply_count: number;
  time_control: string;
  finished_at: string;
}

export function movesToRecordNotation(moves: readonly Move[]): string[] {
  return moves.map(moveToNotation);
}

export function buildGameRecordInsert(body: GameRecordPayload): GameRecordInsert {
  const white = body.players.find((p) => p.color === "w");
  const black = body.players.find((p) => p.color === "b");

  return {
    room_id: body.roomId,
    white_id: white?.playerId ?? null,
    white_nick: white?.nick ?? null,
    black_id: black?.playerId ?? null,
    black_nick: black?.nick ?? null,
    winner: body.winner,
    reason: body.reason,
    moves: body.moves,
    ply_count: body.plyCount,
    time_control: body.timeControl,
    finished_at: new Date(body.finishedAt).toISOString(),
  };
}

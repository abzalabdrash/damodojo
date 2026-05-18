import type { Color, GameState, Move } from "../src/lib/engine";

// ── Client → Server ──────────────────────────────────────────────────────────

export type ClientMsg =
  | { t: "hello"; playerId: string; nick: string; lastV?: number; timeControl?: string }
  | { t: "move"; cid: number; uci: string; clientV: number }
  | { t: "premove"; uci: string | null }
  | { t: "resign" }
  | { t: "draw_offer" }
  | { t: "draw_accept" }
  | { t: "draw_decline" }
  | { t: "rematch_offer" }
  | { t: "chat"; text: string }
  | { t: "ping"; clientTs: number };

// ── Server → Client ──────────────────────────────────────────────────────────

export interface ClockState {
  wMs: number;
  bMs: number;
  increment: number;
  lastTickServerMs: number;
  turn: Color;
}

export interface PlayerInfo {
  playerId: string;
  nick: string;
  color: Color;
  online: boolean;
  lagMs: number;
}

export interface ChatMsg {
  id: string;
  playerId: string;
  nick: string;
  text: string;
  ts: number;
}

export type GameStatus =
  | "waiting"
  | "playing"
  | "finished_win"
  | "finished_draw"
  | "finished_aborted";

export type ServerMsg =
  | {
      t: "snapshot";
      v: number;
      gameState: SerializedGameState;
      clock: ClockState;
      players: PlayerInfo[];
      status: GameStatus;
      drawOffer: Color | null;
      chat: ChatMsg[];
      timeControl?: string;
    }
  | {
      t: "move";
      v: number;
      ply: number;
      uci: string;
      by: Color;
      clock: ClockState;
      premoveAuto?: boolean;
    }
  | { t: "rejected"; cid: number; reason: "illegal" | "not_your_turn" | "stale" | "game_over" }
  | { t: "chat"; msg: ChatMsg; v: number }
  | { t: "presence"; players: PlayerInfo[] }
  | { t: "game_end"; reason: string; winner: Color | null; finalClock: ClockState; v: number }
  | { t: "pong"; clientTs: number; serverTs: number }
  | { t: "draw_offer_received" }
  | { t: "error"; message: string };

// Serialized GameState for wire transport (Map → array pairs)
export interface SerializedGameState {
  board: (SerializedPiece | null)[][];
  turn: Color;
  halfmoveClock: number;
  ply: number;
  history: SerializedMove[];
  repetitions: [string, number][];
  endgame: unknown;
}

export interface SerializedPiece {
  color: Color;
  king: boolean;
}

export interface SerializedMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  path: { row: number; col: number }[];
  captures: { row: number; col: number }[];
  promoted: boolean;
}

export function serializeGameState(gs: GameState): SerializedGameState {
  return {
    board: (gs.board as (import("../src/lib/engine").Piece | null)[][]).map((row) =>
      row.map((p) => (p ? { color: p.color, king: p.king } : null))
    ),
    turn: gs.turn,
    halfmoveClock: gs.halfmoveClock,
    ply: gs.ply,
    history: gs.history.map(serializeMove),
    repetitions: Array.from(gs.repetitions.entries()),
    endgame: gs.endgame,
  };
}

export function serializeMove(m: Move): SerializedMove {
  return {
    from: { row: m.from.row, col: m.from.col },
    to: { row: m.to.row, col: m.to.col },
    path: m.path.map((s) => ({ row: s.row, col: s.col })),
    captures: m.captures.map((s) => ({ row: s.row, col: s.col })),
    promoted: m.promoted,
  };
}

// UCI notation for Russian checkers: "a1-b2" for simple, "a1:c3:e5" for captures
export function moveToUci(m: Move): string {
  if (m.captures.length === 0) {
    return `${squareToAlg(m.from)}-${squareToAlg(m.to)}`;
  }
  return [m.from, ...m.path].map(squareToAlg).join(":");
}

function squareToAlg(sq: { row: number; col: number }): string {
  const col = String.fromCharCode(97 + sq.col); // a-h
  const row = 8 - sq.row; // 8 (top) to 1 (bottom)
  return `${col}${row}`;
}

export function uciToEndpoints(uci: string): {
  from: { row: number; col: number };
  to: { row: number; col: number };
} | null {
  const sep = uci.includes(":") ? ":" : "-";
  const parts = uci.split(sep);
  if (parts.length < 2) return null;
  const from = algToSquare(parts[0]);
  const to = algToSquare(parts[parts.length - 1]);
  if (!from || !to) return null;
  return { from, to };
}

function algToSquare(alg: string): { row: number; col: number } | null {
  if (alg.length < 2) return null;
  const col = alg.charCodeAt(0) - 97;
  const row = 8 - parseInt(alg[1], 10);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return { row, col };
}

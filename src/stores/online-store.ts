"use client";

import { create } from "zustand";
import type { ChatMsg, ClockState, GameStatus, PlayerInfo } from "@/lib/realtime/protocol";
import type { Color } from "@/lib/engine";

export type ConnectionStatus = "idle" | "connecting" | "live" | "reconnecting" | "closed";

export interface TimeControl {
  id: string;
  label: string;
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: "3+0", label: "3+0 Блиц" },
  { id: "5+3", label: "5+3 Блиц" },
  { id: "10+0", label: "10+0 Рапид" },
];

interface OnlineStore {
  // Session
  roomId: string | null;
  playerId: string | null;
  nick: string | null;
  myColor: Color | null;

  // Opponent
  opponentNick: string | null;
  opponentLag: number;
  players: PlayerInfo[];

  // Network
  connectionStatus: ConnectionStatus;

  // Game clock (authoritative from server, interpolated on client)
  clock: ClockState | null;
  timeControl: string;

  // Chat
  chat: ChatMsg[];

  // Status
  gameStatus: GameStatus;

  // Pending move (optimistic)
  pendingCid: number | null;
  nextCid: number;

  // Premove
  premoveUci: string | null;

  // Actions
  setSession: (roomId: string, playerId: string, nick: string, color: Color) => void;
  setConnectionStatus: (s: ConnectionStatus) => void;
  setPlayers: (players: PlayerInfo[]) => void;
  setClock: (clock: ClockState) => void;
  setTimeControl: (tc: string) => void;
  addChat: (msg: ChatMsg) => void;
  setChats: (msgs: ChatMsg[]) => void;
  setGameStatus: (s: GameStatus) => void;
  setPendingCid: (cid: number | null) => void;
  consumeCid: () => number;
  setPremove: (uci: string | null) => void;
  reset: () => void;
}

export const useOnlineStore = create<OnlineStore>((set, get) => ({
  roomId: null,
  playerId: null,
  nick: null,
  myColor: null,
  opponentNick: null,
  opponentLag: 0,
  players: [],
  connectionStatus: "idle",
  clock: null,
  timeControl: "3+0",
  chat: [],
  gameStatus: "waiting",
  pendingCid: null,
  nextCid: 1,
  premoveUci: null,

  setSession: (roomId, playerId, nick, color) =>
    set({ roomId, playerId, nick, myColor: color }),

  setConnectionStatus: (s) => set({ connectionStatus: s }),

  setPlayers: (players) => {
    const { myColor } = get();
    const opp = players.find((p) => p.color !== myColor);
    set({
      players,
      opponentNick: opp?.nick ?? null,
      opponentLag: opp?.lagMs ?? 0,
    });
  },

  setClock: (clock) => set({ clock }),

  setTimeControl: (tc) => set({ timeControl: tc }),

  addChat: (msg) =>
    set((s) => ({ chat: [...s.chat.slice(-49), msg] })),

  setChats: (msgs) => set({ chat: msgs }),

  setGameStatus: (s) => set({ gameStatus: s }),

  setPendingCid: (cid) => set({ pendingCid: cid }),

  consumeCid: () => {
    const cid = get().nextCid;
    set({ nextCid: cid + 1 });
    return cid;
  },

  setPremove: (uci) => set({ premoveUci: uci }),

  reset: () =>
    set({
      roomId: null,
      playerId: null,
      nick: null,
      myColor: null,
      opponentNick: null,
      opponentLag: 0,
      players: [],
      connectionStatus: "idle",
      clock: null,
      chat: [],
      gameStatus: "waiting",
      pendingCid: null,
      nextCid: 1,
      premoveUci: null,
    }),
}));

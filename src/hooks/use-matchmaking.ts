"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";

import { getPartyKitHost } from "@/lib/realtime/client";
import { getOrCreateGuestIdentity } from "@/lib/realtime/identity";
import { useAuthStore } from "@/stores/auth-store";

type Status = "idle" | "searching" | "matched" | "error";

interface State {
  status: Status;
  position: number;
  matchedRoomId: string | null;
  matchedTimeControl: string | null;
  opponentNick: string | null;
  error: string | null;
}

export function useMatchmaking() {
  const socketRef = useRef<PartySocket | null>(null);
  const [state, setState] = useState<State>({
    status: "idle",
    position: 0,
    matchedRoomId: null,
    matchedTimeControl: null,
    opponentNick: null,
    error: null,
  });

  const authUsername = useAuthStore((s) => s.username);

  const find = useCallback((timeControl?: string) => {
    if (socketRef.current) return;

    const identity = getOrCreateGuestIdentity();
    const nick = authUsername ?? identity.nick;

    setState({
      status: "searching",
      position: 0,
      matchedRoomId: null,
      matchedTimeControl: null,
      opponentNick: null,
      error: null,
    });

    const socket = new PartySocket({
      host: getPartyKitHost(),
      party: "lobby",
      room: "global",
      id: identity.playerId,
    });

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          t: "find_match",
          playerId: identity.playerId,
          nick,
          timeControl,
        })
      );
    });

    socket.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.t === "queued") {
          setState((s) => ({ ...s, position: msg.position }));
        } else if (msg.t === "matched") {
          setState((s) => ({
            ...s,
            status: "matched",
            matchedRoomId: msg.roomId,
            matchedTimeControl: msg.timeControl ?? null,
            opponentNick: msg.opponent ?? null,
          }));
          socket.close();
          socketRef.current = null;
        } else if (msg.t === "error") {
          setState((s) => ({ ...s, status: "error", error: msg.message }));
          socket.close();
          socketRef.current = null;
        }
      } catch {
        // ignore
      }
    });

    socket.addEventListener("close", () => {
      socketRef.current = null;
      setState((s) =>
        s.status === "matched" ? s : { ...s, status: "idle", position: 0 }
      );
    });

    socketRef.current = socket;
  }, [authUsername]);

  const cancel = useCallback(() => {
    const sock = socketRef.current;
    if (sock) {
      try {
        sock.send(JSON.stringify({ t: "cancel" }));
        sock.close();
      } catch {
        // ignore
      }
    }
    socketRef.current = null;
    setState({
      status: "idle",
      position: 0,
      matchedRoomId: null,
      matchedTimeControl: null,
      opponentNick: null,
      error: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const sock = socketRef.current;
      if (sock) {
        try { sock.close(); } catch {}
      }
      socketRef.current = null;
    };
  }, []);

  return { ...state, find, cancel };
}

import PartySocket from "partysocket";
import type { ClientMsg, ServerMsg } from "./protocol";

export type GameClientListener = (msg: ServerMsg) => void;

export interface GameClient {
  send: (msg: ClientMsg) => void;
  close: () => void;
  getSocket: () => PartySocket;
}

export interface GameClientOptions {
  host: string;
  roomId: string;
  playerId: string;
  nick: string;
  lastV?: number;
  /**
   * Optional time control identifier (e.g. "3+0"). Forwarded in the hello
   * payload so the game-room can seed its clock on first join. Ignored by
   * the server once the room is initialized.
   */
  timeControl?: string;
  onMessage: GameClientListener;
  onOpen?: () => void;
  onClose?: () => void;
  onReconnect?: () => void;
}

const PING_INTERVAL_MS = 3000;

export function createGameClient(opts: GameClientOptions): GameClient {
  const socket = new PartySocket({
    host: opts.host,
    room: opts.roomId,
    id: opts.playerId,
    // PartySocket handles reconnect automatically with exponential backoff
  });

  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let opened = false;

  socket.addEventListener("open", () => {
    // Send hello on (re)connect
    send({
      t: "hello",
      playerId: opts.playerId,
      nick: opts.nick,
      lastV: opts.lastV,
      timeControl: opts.timeControl,
    });
    if (!opened) {
      opened = true;
      opts.onOpen?.();
    } else {
      opts.onReconnect?.();
    }

    // Start ping loop for lag measurement
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      send({ t: "ping", clientTs: Date.now() });
    }, PING_INTERVAL_MS);
  });

  socket.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMsg;
      // Update lastV tracking via snapshot/move events
      opts.onMessage(msg);
    } catch {
      // ignore malformed messages
    }
  });

  socket.addEventListener("close", () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    opts.onClose?.();
  });

  function send(msg: ClientMsg) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  return {
    send,
    close: () => {
      if (pingTimer) clearInterval(pingTimer);
      socket.close();
    },
    getSocket: () => socket,
  };
}

export function getPartyKitHost(): string {
  return (
    process.env.NEXT_PUBLIC_PARTYKIT_HOST ??
    (typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "localhost:1999"
      : "damadojo-party.partykit.dev")
  );
}

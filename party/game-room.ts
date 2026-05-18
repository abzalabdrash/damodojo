import type * as Party from "partykit/server";
import type { Color } from "../src/lib/engine";
import {
  applyMove,
  findMoveByEndpoints,
  getResult,
  initialState,
} from "../src/lib/engine";
import {
  clockApplyMove,
  clockMs,
  createClock,
  DEFAULT_TIME_CONTROL,
  isFlaged,
} from "./clock";
import { flushToSupabase } from "./persistence";
import type {
  ChatMsg,
  ClientMsg,
  ClockState,
  PlayerInfo,
  ServerMsg,
  GameStatus,
} from "./protocol";
import {
  moveToUci,
  serializeGameState,
  uciToEndpoints,
} from "./protocol";
import type { GameState } from "../src/lib/engine";

const CHAT_RATE_LIMIT_MS = 2000;
const CHAT_MAX_LEN = 200;
const CHAT_HISTORY = 50;

interface PlayerSlot {
  playerId: string;
  nick: string;
  color: Color;
  connId: string | null;
  lagMs: number;
  lastPingTs: number;
  lastChatTs: number;
  premove: string | null;
}

interface RoomState {
  version: number;
  gameState: GameState;
  clock: ClockState;
  players: Map<Color, PlayerSlot>;
  status: GameStatus;
  drawOffer: Color | null;
  chat: ChatMsg[];
  timeControl: string;
  gameId: string;
}

export default class GameRoom implements Party.Server {
  private state: RoomState | null = null;
  private nextChatId = 0;

  constructor(readonly room: Party.Room) {}

  private initState(timeControl?: string): RoomState {
    return {
      version: 0,
      gameState: initialState(),
      clock: createClock(timeControl ?? DEFAULT_TIME_CONTROL),
      players: new Map(),
      status: "waiting",
      drawOffer: null,
      chat: [],
      timeControl: timeControl ?? DEFAULT_TIME_CONTROL,
      gameId: this.room.id,
    };
  }

  private getOrInit(): RoomState {
    if (!this.state) this.state = this.initState();
    return this.state;
  }

  private assignColor(playerId: string): Color | null {
    const st = this.getOrInit();
    // Check if player is already assigned
    for (const [color, slot] of st.players) {
      if (slot.playerId === playerId) return color;
    }
    if (!st.players.has("w")) return "w";
    if (!st.players.has("b")) return "b";
    return null; // spectator — not supported in v1
  }

  private playerByConn(connId: string): PlayerSlot | null {
    const st = this.getOrInit();
    for (const slot of st.players.values()) {
      if (slot.connId === connId) return slot;
    }
    return null;
  }

  private playerByColor(color: Color): PlayerSlot | null {
    return this.getOrInit().players.get(color) ?? null;
  }

  private playerInfos(): PlayerInfo[] {
    const st = this.getOrInit();
    const infos: PlayerInfo[] = [];
    for (const [color, slot] of st.players) {
      infos.push({
        playerId: slot.playerId,
        nick: slot.nick,
        color,
        online: slot.connId !== null,
        lagMs: slot.lagMs,
      });
    }
    return infos;
  }

  private bump(): number {
    return ++this.getOrInit().version;
  }

  private send(conn: Party.Connection, msg: ServerMsg) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg, exclude?: string) {
    const payload = JSON.stringify(msg);
    for (const conn of this.room.getConnections()) {
      if (conn.id !== exclude) conn.send(payload);
    }
  }

  private broadcastAll(msg: ServerMsg) {
    this.broadcast(msg);
  }

  private sendSnapshot(conn: Party.Connection) {
    const st = this.getOrInit();
    this.send(conn, {
      t: "snapshot",
      v: st.version,
      gameState: serializeGameState(st.gameState),
      clock: st.clock,
      players: this.playerInfos(),
      status: st.status,
      drawOffer: st.drawOffer,
      chat: st.chat,
      timeControl: st.timeControl,
    });
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Connection just opened; wait for "hello" message
    // Store connId temporarily
    conn.setState({ connected: true });
  }

  async onMessage(raw: string | ArrayBuffer, sender: Party.Connection) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ClientMsg;
    } catch {
      return;
    }

    // For hello messages we may need to seed state with a custom time
    // control BEFORE getOrInit creates a default. For all other messages,
    // state must exist already (or default is fine).
    if (msg.t === "hello" && !this.state && msg.timeControl) {
      this.state = this.initState(msg.timeControl);
    }
    const st = this.getOrInit();

    switch (msg.t) {
      case "hello": {
        const color = this.assignColor(msg.playerId);
        if (color === null) {
          // Room full for now
          this.send(sender, { t: "error", message: "room_full" });
          return;
        }

        let slot = st.players.get(color);
        if (!slot) {
          slot = {
            playerId: msg.playerId,
            nick: msg.nick,
            color,
            connId: sender.id,
            lagMs: 0,
            lastPingTs: 0,
            lastChatTs: 0,
            premove: null,
          };
          st.players.set(color, slot);
        } else {
          slot.connId = sender.id;
          slot.nick = msg.nick;
        }

        // Start game when both players connected
        let justStarted = false;
        if (st.status === "waiting" && st.players.size === 2) {
          st.status = "playing";
          // Initialize clock anchor at game start so checkClockFlag doesn't
          // see "elapsed = now - 0 = trillion ms" and flag both players instantly.
          st.clock = { ...st.clock, lastTickServerMs: Date.now() };
          justStarted = true;
        }

        if (justStarted) {
          // Broadcast snapshot to BOTH players so the existing one learns
          // status="playing" and the new clock anchor.
          for (const conn of this.room.getConnections()) {
            this.sendSnapshot(conn);
          }
        } else {
          // Normal join/reconnect: snapshot only to the new client,
          // presence to the other side.
          this.sendSnapshot(sender);
          this.broadcast({ t: "presence", players: this.playerInfos() }, sender.id);
        }
        break;
      }

      case "move": {
        if (st.status !== "playing") {
          this.send(sender, { t: "rejected", cid: msg.cid, reason: "game_over" });
          return;
        }

        const player = this.playerByConn(sender.id);
        if (!player) {
          this.send(sender, { t: "rejected", cid: msg.cid, reason: "not_your_turn" });
          return;
        }
        if (player.color !== st.gameState.turn) {
          this.send(sender, { t: "rejected", cid: msg.cid, reason: "not_your_turn" });
          return;
        }

        const endpoints = uciToEndpoints(msg.uci);
        if (!endpoints) {
          this.send(sender, { t: "rejected", cid: msg.cid, reason: "illegal" });
          return;
        }

        const move = findMoveByEndpoints(st.gameState, endpoints.from, endpoints.to);
        if (!move) {
          this.send(sender, { t: "rejected", cid: msg.cid, reason: "illegal" });
          return;
        }

        // Apply move
        const mover = player.color;
        st.gameState = applyMove(st.gameState, move);
        st.clock = clockApplyMove(st.clock, mover, Date.now(), player.lagMs);
        st.drawOffer = null;
        const v = this.bump();

        const uci = moveToUci(move);
        const moveMsg: ServerMsg = {
          t: "move",
          v,
          ply: st.gameState.ply,
          uci,
          by: mover,
          clock: { ...st.clock },
        };
        this.broadcastAll(moveMsg);

        // Check game end
        await this.checkGameEnd(mover);

        // Auto-apply opponent's premove if game still going
        if (st.status === "playing") {
          await this.tryApplyPremove();
        }
        break;
      }

      case "premove": {
        const player = this.playerByConn(sender.id);
        if (!player) return;
        player.premove = msg.uci;
        break;
      }

      case "resign": {
        const player = this.playerByConn(sender.id);
        if (!player || st.status !== "playing") return;
        await this.endGame("resign", player.color === "w" ? "b" : "w");
        break;
      }

      case "draw_offer": {
        const player = this.playerByConn(sender.id);
        if (!player || st.status !== "playing") return;
        st.drawOffer = player.color;
        const opp = this.playerByColor(player.color === "w" ? "b" : "w");
        if (opp?.connId) {
          const oppConn = [...this.room.getConnections()].find((c) => c.id === opp.connId);
          if (oppConn) this.send(oppConn, { t: "draw_offer_received" });
        }
        break;
      }

      case "draw_accept": {
        const player = this.playerByConn(sender.id);
        if (!player || st.status !== "playing" || st.drawOffer === null) return;
        if (st.drawOffer !== player.color) {
          await this.endGame("agreement", null);
        }
        break;
      }

      case "draw_decline": {
        const player = this.playerByConn(sender.id);
        if (!player) return;
        st.drawOffer = null;
        break;
      }

      case "chat": {
        const player = this.playerByConn(sender.id);
        if (!player) return;
        const now = Date.now();
        if (now - player.lastChatTs < CHAT_RATE_LIMIT_MS) return;
        player.lastChatTs = now;
        const text = msg.text.trim().slice(0, CHAT_MAX_LEN);
        if (!text) return;
        const chatMsg: ChatMsg = {
          id: `${this.room.id}-${this.nextChatId++}`,
          playerId: player.playerId,
          nick: player.nick,
          text,
          ts: now,
        };
        st.chat = [...st.chat.slice(-(CHAT_HISTORY - 1)), chatMsg];
        const v = this.bump();
        this.broadcastAll({ t: "chat", msg: chatMsg, v });
        break;
      }

      case "ping": {
        this.send(sender, { t: "pong", clientTs: msg.clientTs, serverTs: Date.now() });
        // Update lag estimate for this player
        const player = this.playerByConn(sender.id);
        if (player) {
          const rtt = Date.now() - msg.clientTs;
          // Exponential moving average
          player.lagMs = Math.round(player.lagMs * 0.7 + (rtt / 2) * 0.3);
        }
        // Also check flag on ping (heartbeat fallback)
        if (st.status === "playing") {
          await this.checkClockFlag();
        }
        break;
      }
    }
  }

  async onClose(conn: Party.Connection) {
    const st = this.state;
    if (!st) return;
    const player = this.playerByConn(conn.id);
    if (player) {
      player.connId = null;
      this.broadcastAll({ t: "presence", players: this.playerInfos() });
    }
  }

  private async checkClockFlag() {
    const st = this.getOrInit();
    if (st.status !== "playing") return;
    if (st.clock.lastTickServerMs === 0) return; // game hasn't started ticking
    // Apply current tick to check live time remaining
    const now = Date.now();
    const wMs = clockMs(st.clock, "w") - (st.clock.turn === "w" ? Math.max(0, now - st.clock.lastTickServerMs) : 0);
    const bMs = clockMs(st.clock, "b") - (st.clock.turn === "b" ? Math.max(0, now - st.clock.lastTickServerMs) : 0);
    if (wMs <= 0) {
      st.clock = { ...st.clock, wMs: 0 };
      await this.endGame("flag", "b");
    } else if (bMs <= 0) {
      st.clock = { ...st.clock, bMs: 0 };
      await this.endGame("flag", "w");
    }
  }

  private async checkGameEnd(lastMover: Color) {
    const st = this.getOrInit();
    const result = getResult(st.gameState);
    if (result.kind === "win") {
      await this.endGame(result.reason, result.winner);
    } else if (result.kind === "draw") {
      await this.endGame(result.reason, null);
    } else {
      // Check flag
      const flagged = isFlaged(st.clock);
      if (flagged) {
        await this.endGame("flag", flagged === "w" ? "b" : "w");
      }
    }
  }

  private async tryApplyPremove() {
    const st = this.getOrInit();
    if (st.status !== "playing") return;
    const mover = st.gameState.turn;
    const slot = this.playerByColor(mover);
    if (!slot?.premove) return;

    const endpoints = uciToEndpoints(slot.premove);
    slot.premove = null; // clear regardless
    if (!endpoints) return;

    const move = findMoveByEndpoints(st.gameState, endpoints.from, endpoints.to);
    if (!move) return; // premove became illegal — silent cancel

    const uci = moveToUci(move);
    st.gameState = applyMove(st.gameState, move);
    st.clock = clockApplyMove(st.clock, mover, Date.now(), slot.lagMs);
    st.drawOffer = null;
    const v = this.bump();

    this.broadcastAll({
      t: "move",
      v,
      ply: st.gameState.ply,
      uci,
      by: mover,
      clock: { ...st.clock },
      premoveAuto: true,
    });

    await this.checkGameEnd(mover);
  }

  private async endGame(reason: string, winner: Color | null) {
    const st = this.getOrInit();
    if (st.status !== "playing") return;
    st.status = winner ? "finished_win" : "finished_draw";
    const v = this.bump();
    this.broadcastAll({ t: "game_end", reason, winner, finalClock: { ...st.clock }, v });
    await flushToSupabase({
      roomId: this.room.id,
      gameState: serializeGameState(st.gameState),
      finalClock: st.clock,
      winner,
      reason,
      players: [...st.players.values()].map((s) => ({
        playerId: s.playerId,
        nick: s.nick,
        color: s.color,
      })),
      finishedAt: Date.now(),
    });
  }
}

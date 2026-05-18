import type * as Party from "partykit/server";

/**
 * Lobby DO — separate FIFO queues per time control. Pairs two waiting
 * players with the same time control and creates a room for them.
 *
 * Wire:
 *   C→S { t: "find_match", playerId, nick, timeControl? }
 *   C→S { t: "cancel" }
 *   S→C { t: "queued", position }       // your spot in line for your tc
 *   S→C { t: "matched", roomId, opponent, timeControl }
 *   S→C { t: "error", message }
 *
 * Pairing strategy: FIFO within each time-control bucket. Default is
 * "3+0" when the client omits a time control (backwards compatible).
 */

const DEFAULT_TC = "3+0";
const ALLOWED_TCS = new Set(["3+0", "5+3", "10+0"]);

interface QueueEntry {
  connId: string;
  playerId: string;
  nick: string;
  timeControl: string;
  queuedAt: number;
}

function genRoomId(): string {
  return Math.random().toString(36).substring(2, 8);
}

export default class LobbyRoom implements Party.Server {
  private queue: QueueEntry[] = [];

  constructor(readonly room: Party.Room) {}

  private send(conn: Party.Connection, msg: unknown) {
    conn.send(JSON.stringify(msg));
  }

  private findConn(connId: string): Party.Connection | undefined {
    for (const c of this.room.getConnections()) {
      if (c.id === connId) return c;
    }
    return undefined;
  }

  private broadcastPositions() {
    // Each player's position is their index within their own time-control
    // queue (not the global queue), so the displayed wait time matches
    // their actual bucket.
    const perTcCount: Record<string, number> = {};
    for (const entry of this.queue) {
      const idx = (perTcCount[entry.timeControl] ?? 0) + 1;
      perTcCount[entry.timeControl] = idx;
      const conn = this.findConn(entry.connId);
      if (conn) this.send(conn, { t: "queued", position: idx });
    }
  }

  private async tryMatch() {
    // Pair the two oldest entries within each tc bucket. We loop so multiple
    // pairs in different buckets can match in a single call.
    let madeMatch = true;
    while (madeMatch) {
      madeMatch = false;
      const buckets = new Map<string, number[]>(); // tc → queue indices
      for (let i = 0; i < this.queue.length; i++) {
        const tc = this.queue[i].timeControl;
        const arr = buckets.get(tc) ?? [];
        arr.push(i);
        buckets.set(tc, arr);
      }
      for (const [tc, indices] of buckets) {
        if (indices.length < 2) continue;
        const aIdx = indices[0];
        const bIdx = indices[1];
        const a = this.queue[aIdx];
        const b = this.queue[bIdx];
        const connA = this.findConn(a.connId);
        const connB = this.findConn(b.connId);
        // Remove both entries from the queue regardless (a dropped conn
        // shouldn't keep the survivor stuck — they can re-queue).
        this.queue = this.queue.filter((_, i) => i !== aIdx && i !== bIdx);
        if (!connA || !connB) {
          // Push back any surviving entry so they keep their spot.
          if (connA) this.queue.unshift(a);
          if (connB) this.queue.unshift(b);
          continue;
        }
        const roomId = genRoomId();
        this.send(connA, { t: "matched", roomId, opponent: b.nick, timeControl: tc });
        this.send(connB, { t: "matched", roomId, opponent: a.nick, timeControl: tc });
        setTimeout(() => {
          try { connA.close(); } catch {}
          try { connB.close(); } catch {}
        }, 50);
        madeMatch = true;
        break; // Restart the outer loop after mutating the queue.
      }
    }

    if (this.queue.length > 0) {
      this.broadcastPositions();
    }
  }

  async onMessage(raw: string | ArrayBuffer, sender: Party.Connection) {
    let msg: { t: string; playerId?: string; nick?: string; timeControl?: string };
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    switch (msg.t) {
      case "find_match": {
        if (!msg.playerId || !msg.nick) {
          this.send(sender, { t: "error", message: "missing_identity" });
          return;
        }
        const requestedTc = typeof msg.timeControl === "string" ? msg.timeControl : DEFAULT_TC;
        const tc = ALLOWED_TCS.has(requestedTc) ? requestedTc : DEFAULT_TC;
        // Drop duplicate from same connection if re-queueing
        this.queue = this.queue.filter((q) => q.connId !== sender.id);
        this.queue.push({
          connId: sender.id,
          playerId: msg.playerId,
          nick: msg.nick,
          timeControl: tc,
          queuedAt: Date.now(),
        });
        await this.tryMatch();
        break;
      }
      case "cancel": {
        this.queue = this.queue.filter((q) => q.connId !== sender.id);
        this.broadcastPositions();
        break;
      }
    }
  }

  async onClose(conn: Party.Connection) {
    this.queue = this.queue.filter((q) => q.connId !== conn.id);
    this.broadcastPositions();
  }
}

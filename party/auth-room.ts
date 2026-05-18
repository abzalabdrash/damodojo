import type * as Party from "partykit/server";

/**
 * Auth DO — holds all DamaDojo users in persistent storage.
 *
 * Wire model:
 *   POST /parties/auth/global  (action=signup|login)  → { username, token } | { error }
 *
 * Storage layout:
 *   `user:<username>` → { hash: string, salt: string, createdAt: number, gamesPlayed: number }
 *
 * Token model: plain `<username>:<random>` stored alongside the user as `token:<token>`.
 * Not a real JWT — this is demo-grade auth, sized appropriately for an MVP.
 */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const PASSWORD_MIN = 6;

interface UserRecord {
  hash: string;
  salt: string;
  createdAt: number;
  gamesPlayed: number;
}

interface TokenRecord {
  username: string;
  issuedAt: number;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function bytesToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(buf);
}

function randomString(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default class AuthRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    let body: { action?: string; username?: string; password?: string; token?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    switch (body.action) {
      case "signup":
        return this.signup(body.username, body.password);
      case "login":
        return this.login(body.username, body.password);
      case "verify":
        return this.verify(body.token);
      case "logout":
        return this.logout(body.token);
      default:
        return json({ error: "unknown_action" }, 400);
    }
  }

  private async signup(username?: string, password?: string): Promise<Response> {
    if (!username || !USERNAME_RE.test(username)) {
      return json({ error: "invalid_username" }, 400);
    }
    if (!password || password.length < PASSWORD_MIN) {
      return json({ error: "weak_password" }, 400);
    }
    const lower = username.toLowerCase();
    const existing = await this.room.storage.get<UserRecord>(`user:${lower}`);
    if (existing) {
      return json({ error: "username_taken" }, 409);
    }
    const salt = randomString(8);
    const hash = await hashPassword(password, salt);
    const record: UserRecord = {
      hash,
      salt,
      createdAt: Date.now(),
      gamesPlayed: 0,
    };
    await this.room.storage.put(`user:${lower}`, record);
    const token = `${lower}.${randomString(16)}`;
    await this.room.storage.put<TokenRecord>(`token:${token}`, {
      username: lower,
      issuedAt: Date.now(),
    });
    return json({ username: lower, token });
  }

  private async login(username?: string, password?: string): Promise<Response> {
    if (!username || !password) return json({ error: "missing_credentials" }, 400);
    const lower = username.toLowerCase();
    const user = await this.room.storage.get<UserRecord>(`user:${lower}`);
    if (!user) return json({ error: "not_found" }, 404);
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) return json({ error: "wrong_password" }, 401);
    const token = `${lower}.${randomString(16)}`;
    await this.room.storage.put<TokenRecord>(`token:${token}`, {
      username: lower,
      issuedAt: Date.now(),
    });
    return json({ username: lower, token });
  }

  private async verify(token?: string): Promise<Response> {
    if (!token) return json({ error: "missing_token" }, 400);
    const record = await this.room.storage.get<TokenRecord>(`token:${token}`);
    if (!record) return json({ error: "invalid_token" }, 401);
    return json({ username: record.username });
  }

  private async logout(token?: string): Promise<Response> {
    if (!token) return json({ error: "missing_token" }, 400);
    await this.room.storage.delete(`token:${token}`);
    return json({ ok: true });
  }
}

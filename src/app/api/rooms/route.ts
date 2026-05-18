import type { NextRequest } from "next/server";

export const runtime = "nodejs";

function randomBase36(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const timeControl = typeof body.timeControl === "string" ? body.timeControl : "3+0";
  const roomId = randomBase36(6);
  const origin = request.nextUrl.origin;
  const joinUrl = `${origin}/r/${roomId}`;

  // TODO Day 2: persist room to Supabase
  // await createRoomRecord({ roomId, timeControl });

  return Response.json({ roomId, joinUrl, timeControl });
}

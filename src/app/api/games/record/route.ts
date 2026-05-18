import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildGameRecordInsert, type GameRecordPayload } from "@/lib/games/record";

export const runtime = "nodejs";

function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getSupabaseAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function canRecordGame(req: NextRequest): Promise<boolean> {
  const requiredSecret = process.env.GAME_RECORD_SECRET;
  if (!requiredSecret) return true;

  if (req.headers.get("x-damadojo-secret") === requiredSecret) return true;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;

  const supabase = getSupabaseAuth();
  if (!supabase) return false;

  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data.user;
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await canRecordGame(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: GameRecordPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return Response.json({ ok: true, skipped: "no supabase" });
  }

  const { error } = await supabase.from("games").insert(buildGameRecordInsert(body));

  if (error) {
    console.error("[games/record]", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

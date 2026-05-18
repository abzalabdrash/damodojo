import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest): Promise<Response> {
  const playerId = req.nextUrl.searchParams.get("playerId");
  if (!playerId) {
    return Response.json({ error: "playerId required" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ games: [] });
  }

  const { data, error } = await supabase
    .from("games")
    .select("id, room_id, white_id, white_nick, black_id, black_nick, winner, reason, moves, ply_count, time_control, finished_at")
    .or(`white_id.eq.${playerId},black_id.eq.${playerId}`)
    .order("finished_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ games: data ?? [] });
}

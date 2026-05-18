import { createClient } from "@supabase/supabase-js";
import { buildLeaderboardRows } from "@/lib/games/elo";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(): Promise<Response> {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ players: [] });
  }

  const { data, error } = await supabase.from("games").select(
    "white_id, white_nick, black_id, black_nick, winner, time_control, finished_at"
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ players: buildLeaderboardRows(data ?? []) });
}

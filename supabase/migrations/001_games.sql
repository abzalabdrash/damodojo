-- DamaDojo games table
-- Run this in the Supabase SQL editor.

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null,
  white_id    text,
  white_nick  text,
  black_id    text,
  black_nick  text,
  winner      text,          -- 'w', 'b', or null (draw)
  reason      text,          -- 'checkmate', 'timeout', 'resign', 'draw', etc.
  moves       text[],        -- array of UCI move strings
  ply_count   int,
  time_control text,
  finished_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- Allow anyone to insert game records (PartyKit webhook uses anon key)
alter table public.games enable row level security;

create policy "insert_game" on public.games
  for insert with check (true);

create policy "read_games" on public.games
  for select using (true);

-- Indexes for leaderboard and archive queries
create index if not exists games_white_id_idx on public.games(white_id);
create index if not exists games_black_id_idx on public.games(black_id);
create index if not exists games_finished_at_idx on public.games(finished_at desc);

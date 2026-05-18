"use client";

import { useEffect, useState } from "react";
import { Crown, Trophy } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { useAuthStore } from "@/stores/auth-store";

interface PlayerStats {
  id: string;
  nick: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  winRate: number;
}

const MEDAL_COLORS = ["text-yellow-300", "text-zinc-200", "text-amber-600"];

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = useAuthStore((s) => s.userId);
  const username = useAuthStore((s) => s.username);

  useEffect(() => {
    fetch("/api/games/leaderboard")
      .then((r) => r.json())
      .then((d) => {
        setPlayers(d.players ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-svh bg-[#302f2b] text-white">
      <AppSidebar />
      <main className="min-w-0 flex-1 px-4 py-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-7 flex items-center gap-3">
            <Trophy className="h-9 w-9 text-[#c9a227]" />
            <div>
              <h1 className="font-display text-3xl font-bold">Лидерборд</h1>
              <p className="mt-1 text-sm text-[#aaa49a]">
                Только онлайн-партии между игроками. Боты и Ата здесь не участвуют.
              </p>
            </div>
          </div>

          {loading && (
            <p className="text-[#aaa49a] animate-pulse">Загрузка...</p>
          )}

          {!loading && players.length === 0 && (
            <div className="rounded-lg border border-[#3d3a34] bg-[#24231f] py-16 text-center">
              <Crown className="mx-auto mb-4 h-12 w-12 text-[#c9a227] opacity-50" />
              <p className="text-[#aaa49a]">
                Таблица пустая. Сыграй первую онлайн-партию, стартовый ELO: 1500.
              </p>
            </div>
          )}

          {players.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-[#3a3832] bg-[#24231f]">
              <div className="grid grid-cols-[70px_minmax(0,1.6fr)_110px_110px_150px_100px] border-b border-[#34322d] bg-[#1d1c19] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#8f887f] max-md:hidden">
                <span>Место</span>
                <span>Игрок</span>
                <span>ELO</span>
                <span>Партии</span>
                <span>В / Н / П</span>
                <span>Winrate</span>
              </div>
              {players.map((p, i) => {
                const isMe = p.id === userId || p.id === username;
                return (
                  <div
                    key={p.id}
                    className={`grid grid-cols-[70px_minmax(0,1.6fr)_110px_110px_150px_100px] items-center border-b border-[#34322d] px-4 py-4 last:border-b-0 max-md:grid-cols-[44px_1fr_84px] max-md:gap-y-1 ${
                      isMe ? "bg-[#c9a227]/10" : ""
                    }`}
                  >
                    <span className={`text-xl font-bold ${MEDAL_COLORS[i] ?? "text-[#8f887f]"}`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#f4f1e8]">
                        {p.nick}
                        {isMe && <span className="ml-2 text-xs text-[#c9a227]">вы</span>}
                      </p>
                      <p className="text-xs text-[#8f887f]">онлайн рейтинг</p>
                    </div>
                    <span className="font-display text-xl font-bold text-[#f4f1e8]">{p.elo}</span>
                    <span className="text-[#d7d2c7] max-md:col-start-2">{p.games}</span>
                    <span className="text-sm max-md:col-start-2">
                      <span className="text-[#78c850]">{p.wins}</span>
                      <span className="text-[#8f887f]"> / </span>
                      <span className="text-yellow-300">{p.draws}</span>
                      <span className="text-[#8f887f]"> / </span>
                      <span className="text-red-400">{p.losses}</span>
                    </span>
                    <span className="font-semibold text-[#d7d2c7] max-md:col-start-3 max-md:row-start-2">
                      {p.winRate}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

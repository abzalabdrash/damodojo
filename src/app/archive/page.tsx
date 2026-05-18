"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Bot, Clock3, Dumbbell, Zap } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { AuthModal } from "@/components/auth/auth-modal";
import { PaywallModal } from "@/components/upgrade/paywall-modal";
import { canOpenReport, recordReportOpened } from "@/lib/quota";
import { movesFromNotation } from "@/lib/games/replay-record";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";

interface GameRow {
  id: string;
  room_id: string;
  white_id: string | null;
  white_nick: string | null;
  black_id: string | null;
  black_nick: string | null;
  winner: string | null;
  reason: string;
  moves: string[] | null;
  ply_count: number | null;
  time_control: string | null;
  finished_at: string;
}

function resultLabel(game: GameRow, myId: string): { text: string; color: string } {
  if (!game.winner) return { text: "Ничья", color: "text-yellow-300" };
  const myColor = game.white_id === myId ? "w" : "b";
  if (game.winner === myColor) return { text: "Победа", color: "text-[#78c850]" };
  return { text: "Поражение", color: "text-red-400" };
}

function opponentNick(game: GameRow, myId: string): string {
  if (game.white_id === myId) return game.black_nick ?? "Противник";
  return game.white_nick ?? "Противник";
}

function gameIcon(timeControl: string | null) {
  if (timeControl === "bot") return <Bot className="h-6 w-6 text-sky-300" />;
  if (timeControl === "coach") return <Dumbbell className="h-6 w-6 text-[#c9a227]" />;
  return <Zap className="h-6 w-6 text-[#ffd43b]" />;
}

export default function ArchivePage() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const username = useAuthStore((s) => s.username);
  const loadHistory = useGameStore((s) => s.loadHistory);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });
    fetch(`/api/games/history?playerId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setGames(d.games ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function openGame(game: GameRow) {
    if (!game.moves?.length) {
      setError("У этой партии пока нет сохраненных ходов.");
      return;
    }
    // Free tier: 1 report/day. PRO: unlimited. Same wall as on the play page
    // so the limit holds wherever a review can be triggered. userId is always
    // truthy here — guests see the login CTA above and never reach openGame.
    if (userId && !canOpenReport(userId)) {
      setPaywallOpen(true);
      return;
    }
    try {
      loadHistory(movesFromNotation(game.moves));
      if (userId) recordReportOpened(userId);
      router.push("/review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть партию.");
    }
  }

  return (
    <div className="flex min-h-svh bg-[#302f2b] text-white">
      <AppSidebar />
      <main className="min-w-0 flex-1 px-4 py-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-7 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Archive className="h-9 w-9 text-[#c9a227]" />
              <div>
                <h1 className="font-display text-3xl font-bold">Архив партий</h1>
                <p className="mt-1 text-sm text-[#aaa49a]">
                  Открывай партии, проматывай ходы и запускай разбор.
                </p>
              </div>
            </div>
            <div className="hidden rounded-md border border-[#3d3a34] bg-[#22211d] px-3 py-2 text-sm text-[#d7d2c7] sm:block">
              Всего: {games.length}
            </div>
          </div>

          {!username && (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-[#3d3a34] bg-[#24231f] p-8 text-center">
              <div>
                <p className="text-base font-semibold text-[#f4f1e8]">
                  Войдите, чтобы увидеть архив партий
                </p>
                <p className="mt-1 text-sm text-[#aaa49a]">
                  Гости играют без сохранения. Аккаунт хранит ходы и открывает разбор.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-[color:var(--accent)] px-6 text-sm font-semibold text-[#1A1408] transition hover:bg-[color:var(--accent)]/90"
              >
                Войти / Создать аккаунт
              </button>
            </div>
          )}

          {username && loading && (
            <p className="text-[#aaa49a] animate-pulse">Загрузка...</p>
          )}

          {error && (
            <div className="mb-4 rounded-md border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {username && !loading && games.length === 0 && (
            <div className="rounded-lg border border-[#3d3a34] bg-[#24231f] py-16 text-center">
              <p className="mb-4 text-[#aaa49a]">Нет сыгранных партий</p>
              <Link
                href="/play"
                className="inline-flex rounded-md bg-[#78c850] px-6 py-2 font-semibold text-[#10140d] transition hover:bg-[#86d85b]"
              >
                Сыграть партию
              </Link>
            </div>
          )}

          {games.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-[#3a3832] bg-[#24231f]">
              <div className="grid grid-cols-[76px_minmax(0,1.5fr)_120px_120px_132px] border-b border-[#34322d] bg-[#1d1c19] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#8f887f] max-md:hidden">
                <span>Тип</span>
                <span>Соперник</span>
                <span>Результат</span>
                <span>Ходы</span>
                <span>Дата</span>
              </div>
              {games.map((game) => {
                const myId = userId ?? "";
                const res = resultLabel(game, myId);
                const opp = opponentNick(game, myId);
                const date = new Date(game.finished_at).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => openGame(game)}
                    className="grid w-full grid-cols-[76px_minmax(0,1.5fr)_120px_120px_132px] items-center border-b border-[#34322d] px-4 py-4 text-left transition last:border-b-0 hover:bg-[#2d2b26] max-md:grid-cols-[44px_1fr] max-md:gap-x-3 max-md:gap-y-1"
                  >
                    <div className="row-span-2 flex items-center">{gameIcon(game.time_control)}</div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#f4f1e8]">vs {opp}</p>
                      <p className="mt-0.5 text-xs text-[#8f887f]">
                        {game.time_control ?? "online"} {game.reason ? `· ${game.reason}` : ""}
                      </p>
                    </div>
                    <span className={`font-semibold ${res.color} max-md:col-start-2`}>{res.text}</span>
                    <span className="flex items-center gap-1 text-[#d7d2c7] max-md:col-start-2">
                      <Clock3 className="h-4 w-4 text-[#8f887f]" />
                      {game.ply_count ?? game.moves?.length ?? 0}
                    </span>
                    <span className="text-sm text-[#aaa49a] max-md:col-start-2">{date}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} reason="review" />
    </div>
  );
}

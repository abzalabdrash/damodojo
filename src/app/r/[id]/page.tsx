"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { use } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthModal } from "@/components/auth/auth-modal";
import { GameBoard } from "@/components/board/game-board";
import { PlayerStrip } from "@/components/game/player-strip";
import { LiveChat } from "@/components/game/live-chat";
import { ShareRoomCard } from "@/components/game/share-room-card";
import { GuestNickModal } from "@/components/game/guest-nick-modal";
import { ConnectionBanner } from "@/components/game/connection-banner";
import { EndGameModal } from "@/components/game/end-game-modal";
import { MoveList } from "@/components/game/move-list";
import { Button } from "@/components/ui/button";
import { PaywallModal } from "@/components/upgrade/paywall-modal";
import { canOpenReport, recordReportOpened } from "@/lib/quota";
import { useRealtimeGame } from "@/hooks/use-realtime-game";
import { useLiveClock, formatClock } from "@/hooks/use-live-clock";
import { getOrCreateGuestIdentity, hasNick, saveNick } from "@/lib/realtime/identity";
import { pieceCount } from "@/lib/engine";
import { movesToRecordNotation } from "@/lib/games/record";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";
import { useOnlineStore } from "@/stores/online-store";
import { useRouter, useSearchParams } from "next/navigation";

const ALLOWED_TCS = new Set(["3+0", "5+3", "10+0"]);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LiveRoomPage({ params }: PageProps) {
  const { id: roomId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTc = searchParams.get("tc") ?? undefined;
  const requestedTc = rawTc && ALLOWED_TCS.has(rawTc) ? rawTc : undefined;
  const authUserId = useAuthStore((s) => s.userId);
  const authUsername = useAuthStore((s) => s.username);

  // Identity setup
  const [identity, setIdentity] = useState(() => getOrCreateGuestIdentity());
  const [nickReady, setNickReady] = useState(() => hasNick());
  const activeIdentity = authUserId
    ? { playerId: authUserId, nick: authUsername ?? "Игрок" }
    : identity;

  // Ensure identity is set in online-store before connecting
  useEffect(() => {
    if (authUserId || hasNick()) {
      useOnlineStore.getState().setSession(
        roomId,
        activeIdentity.playerId,
        activeIdentity.nick,
        // color assigned by server after hello — placeholder "w" overwritten by snapshot
        "w"
      );
      Promise.resolve().then(() => setNickReady(true));
    }
  }, [activeIdentity.nick, activeIdentity.playerId, authUserId, roomId]);

  function handleNickConfirm(nick: string) {
    saveNick(nick);
    const nextIdentity = { playerId: identity.playerId, nick: nick.trim().slice(0, 24) };
    setIdentity(nextIdentity);
    useOnlineStore.getState().setSession(roomId, nextIdentity.playerId, nextIdentity.nick, "w");
    setNickReady(true);
  }

  // Game store
  const game = useGameStore((s) => s.game);
  const result = useGameStore((s) => s.result);

  // Online store
  const myColor = useOnlineStore((s) => s.myColor);
  const opponentNick = useOnlineStore((s) => s.opponentNick);
  const opponentLag = useOnlineStore((s) => s.opponentLag);
  const connectionStatus = useOnlineStore((s) => s.connectionStatus);
  const clock = useOnlineStore((s) => s.clock);
  const chat = useOnlineStore((s) => s.chat);
  const gameStatus = useOnlineStore((s) => s.gameStatus);
  const myNick = useOnlineStore((s) => s.nick) ?? activeIdentity.nick;
  const myPlayerId = useOnlineStore((s) => s.playerId) ?? activeIdentity.playerId;

  // Realtime hook — connects when nickReady. We pass the time control from
  // the URL so the game-room can seed its clock if this is the first joiner.
  const { sendResign, sendDrawOffer, sendDrawAccept, sendChat } = useRealtimeGame(
    nickReady ? roomId : null,
    requestedTc
  );

  // Set active mode
  useEffect(() => {
    useGameStore.getState().setMode("online");
    return () => {
      // Reset online store when leaving
      useOnlineStore.getState().reset();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock
  const gameActive = gameStatus === "playing";
  const { msFor } = useLiveClock(clock, gameActive);

  const myMs = myColor ? msFor(myColor) : 0;
  const oppMs = myColor ? msFor(myColor === "w" ? "b" : "w") : 0;

  const counts = useMemo(
    () => ({ w: pieceCount(game.board, "w"), b: pieceCount(game.board, "b") }),
    [game.board]
  );

  const isFlipped = myColor === "b";
  const roomUrl = typeof window !== "undefined" ? window.location.href : "";
  const players = useOnlineStore((s) => s.players);
  const timeControl = useOnlineStore((s) => s.timeControl);
  const recordKeyRef = useRef<string | null>(null);

  const waiting = gameStatus === "waiting";
  const finished = gameStatus.startsWith("finished");

  // Guest UX + free-tier quota: clicking "Разбор партии" from the end-game
  // modal needs to gate on login (review is tied to the user's archive)
  // and on the daily free-tier limit (1/day). PRO users skip both walls.
  const [authOpen, setAuthOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [pendingReviewRedirect, setPendingReviewRedirect] = useState(false);

  function tryOpenReview() {
    if (!authUserId) {
      setPendingReviewRedirect(true);
      setAuthOpen(true);
      return;
    }
    if (!canOpenReport(authUserId)) {
      setPaywallOpen(true);
      return;
    }
    recordReportOpened(authUserId);
    router.push("/review");
  }

  useEffect(() => {
    if (pendingReviewRedirect && authUserId) {
      setPendingReviewRedirect(false);
      setAuthOpen(false);
      tryOpenReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReviewRedirect, authUserId]);

  function handleRematch() {
    // Carry the active time control into the rematch room so the new game
    // doesn't silently fall back to the server default.
    const rematchTc = timeControl ?? requestedTc;
    fetch("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ timeControl: rematchTc }),
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((d) => {
        const tcParam = rematchTc ? `?tc=${encodeURIComponent(rematchTc)}` : "";
        router.push(`/r/${d.roomId}${tcParam}`);
      });
  }

  useEffect(() => {
    if (!finished || game.history.length === 0) {
      if (!finished) recordKeyRef.current = null;
      return;
    }
    const white = players.find((p) => p.color === "w");
    const black = players.find((p) => p.color === "b");
    if (!white || !black) return;

    const key = `${roomId}:${game.history.length}:${result.kind}`;
    if (recordKeyRef.current === key) return;
    recordKeyRef.current = key;

    void fetch("/api/games/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        winner: result.kind === "win" ? result.winner : null,
        reason: result.kind === "win" || result.kind === "draw" ? result.reason : "finished",
        moves: movesToRecordNotation(game.history),
        plyCount: game.history.length,
        timeControl,
        finishedAt: Date.now(),
        players: [
          { playerId: white.playerId, nick: white.nick, color: "w" },
          { playerId: black.playerId, nick: black.nick, color: "b" },
        ],
      }),
    }).catch(() => {
      recordKeyRef.current = null;
    });
  }, [finished, game.history, players, result, roomId, timeControl]);

  if (!nickReady) {
    return <GuestNickModal onConfirm={handleNickConfirm} />;
  }

  // Opponent info derived from players list
  const oppColor = myColor === "w" ? "b" : "w";

  return (
    <div className="flex min-h-svh bg-[#302f2b] text-white">
      <AppSidebar />
      <main className="flex-1 px-3 py-4 sm:px-4 md:px-6 lg:py-6">
        <div className="mx-auto grid max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1fr)_400px] lg:grid-cols-[minmax(0,1fr)_360px]">

          {/* Board column */}
          <div className="mx-auto flex w-full max-w-[920px] flex-col gap-3">

            {/* Opponent strip (top) */}
            <PlayerStrip
              name={opponentNick ?? "Ожидание…"}
              side={oppColor}
              active={game.turn === oppColor && gameActive}
              capturedCount={oppColor === "w" ? 12 - counts.w : 12 - counts.b}
              clock={formatClock(oppMs)}
              lagMs={opponentLag}
              avatarInitial={(opponentNick ?? "?")[0]?.toUpperCase()}
            />

            {/* Board wrapper with connection overlay */}
            <div className="relative mx-auto w-full max-w-[min(76svh,760px,100%)]">
              <ConnectionBanner status={connectionStatus} />
              <GameBoard flipped={isFlipped} />
            </div>

            {/* My strip (bottom) */}
            <PlayerStrip
              name={myNick}
              side={myColor ?? "w"}
              active={myColor ? game.turn === myColor && gameActive : false}
              capturedCount={myColor === "w" ? 12 - counts.b : 12 - counts.w}
              clock={formatClock(myMs)}
              avatarInitial={myNick[0]?.toUpperCase()}
            />
          </div>

          {/* Sidebar */}
          <aside className="flex min-h-0 flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100svh-96px)] lg:overflow-y-auto lg:pr-1">

            {waiting && (
              <ShareRoomCard roomUrl={roomUrl} />
            )}

            {!waiting && (
              <div className="shrink-0 rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                      Статус
                    </span>
                    <span className="block truncate font-display text-base font-medium text-[color:var(--text-primary)]">
                      {waiting
                        ? "Ожидание соперника…"
                        : finished
                          ? "Партия завершена"
                          : myColor && game.turn === myColor
                            ? "Ваш ход"
                            : "Ход соперника"}
                    </span>
                  </div>
                  {!finished && (
                    <Button variant="ghost" size="sm" onClick={sendResign}>
                      Сдаться
                    </Button>
                  )}
                </div>
              </div>
            )}

            <MoveList history={game.history} className="min-h-[120px] shrink-0 lg:min-h-[140px]" />

            <LiveChat
              messages={chat}
              myPlayerId={myPlayerId}
              onSend={sendChat}
              className="flex-1 min-h-[200px]"
            />

            {waiting && (
              <p className="text-center text-[11px] text-[color:var(--text-muted)]">
                Поделитесь ссылкой с другом — игра начнётся автоматически.
              </p>
            )}
          </aside>
        </div>
      </main>

      {finished && (
        <EndGameModal
          result={result}
          onRematch={handleRematch}
          onNewGame={() => router.push("/play")}
          onReview={tryOpenReview}
          onDismiss={() => {}}
          coachName="Ата"
          coachLine={
            result.kind === "win"
              ? result.winner === myColor
                ? "Отличная партия. Разбери ключевые моменты."
                : "Соперник сыграл точно. Найди, где потерял темп."
              : "Равная игра с обеих сторон."
          }
          stats={undefined}
        />
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} reason="review" />
    </div>
  );
}

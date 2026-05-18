"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { AuthModal } from "@/components/auth/auth-modal";
import { GameBoard } from "@/components/board/game-board";
import { EndGameModal } from "@/components/game/end-game-modal";
import { GameSidePanel } from "@/components/game/game-side-panel";
import { PlayHubPanel } from "@/components/game/play-hub-panel";
import { PlayerStrip } from "@/components/game/player-strip";
import { PaywallModal } from "@/components/upgrade/paywall-modal";
import { canOpenReport, recordReportOpened } from "@/lib/quota";
import { useBotDialogue } from "@/hooks/use-bot-dialogue";
import { useEngineWorker } from "@/hooks/use-engine-worker";
import { useReviewEngine } from "@/hooks/use-review-engine";
import { getLegalMoves, moveToNotation, pieceCount } from "@/lib/engine";
import type { Move } from "@/lib/engine";
import type { EngineAnalysis } from "@/lib/engine-ai";
import { BOT_PREVIEW_LINES } from "@/lib/coach/bot-selection";
import { isBotId } from "@/lib/coach/bot-dialogue";
import { getCharacter } from "@/lib/coach/characters";
import type {
  BotBanterSituation,
  CoachSituation,
  TrainerLiveSituation,
} from "@/lib/coach/featherless";
import { shouldTriggerLiveComment } from "@/lib/coach/live-commentary";
import {
  closestPromotionDistance,
  materialCounts,
  mobilityFor,
  pvToNotation,
  recentMovesPdn,
} from "@/lib/coach/trainer-context";
import {
  getBotEngineProfile,
  pickBlunderMove,
  randomThinkDelay,
  shouldBlunder,
} from "@/lib/coach/bot-engine";
import { movesToRecordNotation } from "@/lib/games/record";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";

/**
 * Walks `[label, count]` pairs in priority order and returns the first
 * one with a positive count. Used to surface the most interesting move
 * category in the end-game stats trio (e.g. "Бриллиантов: 1" beats
 * "Лучших: 5" as a headline because brilliants are rarer and more
 * exciting). Returns `null` if every count is zero so the caller can
 * decide on a fallback label.
 */
function pickFirst(
  pairs: ReadonlyArray<readonly [string, number]>,
): readonly [string, number] | null {
  for (const pair of pairs) {
    if (pair[1] > 0) return pair;
  }
  return null;
}

export default function PlayPage() {
  const searchParams = useSearchParams();
  const hasGameTarget = searchParams.has("bot") || searchParams.get("coach") === "ata";
  return hasGameTarget ? <PlayGamePage /> : <PlayHomePage />;
}

function PlayHomePage() {
  // Layout note: the board column hugs the sidebar (no left gap), the
  // play-hub panel hugs the right edge / ad rail, and both fill the full
  // viewport height. Earlier versions centered the board inside its column,
  // which left a wide empty band between the sidebar and the board. Now
  // the board starts flush against the sidebar and the right column shows
  // a tall play-hub plus a more prominent ad rail.
  return (
    <div className="flex h-svh overflow-hidden bg-[#302f2b] text-white">
      <AppSidebar />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(420px,1fr)_minmax(360px,520px)] gap-2 px-2 py-2 xl:grid-cols-[minmax(560px,1fr)_minmax(400px,560px)_240px]">
        <main className="flex min-w-0 items-stretch justify-start py-1">
          <div className="flex h-full w-full max-w-[min(94svh,1040px)] flex-col gap-2">
            <PlayerStrip name="Соперник" side="b" active={false} capturedCount={0} avatarInitial="С" />
            <div className="flex flex-1 items-center justify-center">
              <GameBoard disabled />
            </div>
            <PlayerStrip name="Игрок" side="w" active={false} capturedCount={0} avatarInitial="И" />
          </div>
        </main>
        <aside className="flex min-w-0 flex-col py-1">
          <PlayHubPanel />
        </aside>
        <AdRail />
      </div>
    </div>
  );
}

function PlayGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const game = useGameStore((s) => s.game);
  const result = useGameStore((s) => s.result);
  const reset = useGameStore((s) => s.reset);
  const resign = useGameStore((s) => s.resign);
  const undoMove = useGameStore((s) => s.undoMove);
  const activeMode = useGameStore((s) => s.activeMode);
  const setMode = useGameStore((s) => s.setMode);
  const pendingCapture = useGameStore((s) => s.pendingCapture);
  const viewPly = useGameStore((s) => s.viewPly);
  const commitMove = useGameStore((s) => s.commitMove);
  const userId = useAuthStore((s) => s.userId);
  const username = useAuthStore((s) => s.username);
  const authToken = useAuthStore((s) => s.token);
  const engine = useEngineWorker();
  // Stable function refs — these are useCallbacks with [] deps so they
  // never change. Using the whole `engine` object would re-fire effects
  // every time `thinking` flips.
  const engineBestMove = engine.bestMove;
  const engineAnalyze = engine.analyze;

  const [suggestedMove, setSuggestedMove] = useState<{
    readonly ply: number;
    readonly move: Move;
  } | null>(null);
  const [analysisPly, setAnalysisPly] = useState<number | null>(null);
  const botPlyRef = useRef<number | null>(null);
  const recordKeyRef = useRef<string | null>(null);
  const recordRoomIdRef = useRef<string | null>(null);
  const [boardScale, setBoardScale] = useState(100);
  // Guest UX: clicking "Отчёт о партии" while not logged-in opens the auth
  // modal; on successful auth we fulfil the original intent and re-run the
  // gate (which may now hit the daily quota wall and surface the paywall).
  const [authOpen, setAuthOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [pendingReviewRedirect, setPendingReviewRedirect] = useState(false);

  function tryOpenReview() {
    // Only logged-in users can open Review (it ties to their archive).
    // Guests get the auth modal first; we re-fire tryOpenReview from the
    // userId effect below once login completes.
    if (!userId) {
      setPendingReviewRedirect(true);
      setAuthOpen(true);
      return;
    }
    // Free tier: 1 report/day. PRO: unlimited. Wall, not soft-prompt — so
    // the user feels the value of the upgrade.
    if (!canOpenReport(userId)) {
      setPaywallOpen(true);
      return;
    }
    recordReportOpened(userId);
    router.push("/review");
  }

  useEffect(() => {
    if (pendingReviewRedirect && userId) {
      setPendingReviewRedirect(false);
      setAuthOpen(false);
      tryOpenReview();
    }
    // tryOpenReview captures router/userId; safe to depend only on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReviewRedirect, userId]);

  function handleReview() {
    tryOpenReview();
  }

  /**
   * Engine analysis cached at the moment it was the STUDENT's turn (white).
   * Used to compute evalBefore + bestMoveAtPrev + PV for the live trainer
   * commentary on the student's NEXT move.
   */
  const studentPreMoveAnalysisRef = useRef<{
    readonly ply: number;
    readonly analysis: EngineAnalysis;
  } | null>(null);

  // ── Bot / coach selection from URL param ──
  const isCoachMode = searchParams.get("coach") === "ata";
  const targetMode = isCoachMode ? "coach" : "bot";
  const selectedBot = useMemo(() => {
    if (isCoachMode) return getCharacter("ata")!;
    const requested = searchParams.get("bot") ?? "kanat";
    const character = getCharacter(requested);
    return character?.kind === "bot" ? character : getCharacter("kanat")!;
  }, [isCoachMode, searchParams]);

  const botProfile = useMemo(
    () => getBotEngineProfile(isBotId(selectedBot.id) ? selectedBot.id : "aigerim"),
    [selectedBot.id],
  );

  const botPreviewLine = isCoachMode
    ? "Игра с тренером: Ата будет строгим, но по делу."
    : isBotId(selectedBot.id)
      ? BOT_PREVIEW_LINES[selectedBot.id]
      : "Сыграем спокойно. Ошибки покажут, кто видел дальше.";

  // ── Live streaming bot dialogue ──
  const { history: liveCommentHistory, comment: liveComment, triggerComment } =
    useBotDialogue(botPreviewLine);
  const lastCommentMoveNumberRef = useRef(-999);

  // ── Quick post-game review for end-game stats ──
  const reviewEngine = useReviewEngine();
  const startQuickReview = reviewEngine.startReview;
  const reviewTriggeredRef = useRef(false);

  // ── Set mode on mount based on coach/bot URL ──
  useEffect(() => {
    if (activeMode !== targetMode) {
      setMode(targetMode);
    }
  }, [activeMode, setMode, targetMode]);

  const counts = useMemo(
    () => ({
      w: pieceCount(game.board, "w"),
      b: pieceCount(game.board, "b"),
    }),
    [game.board],
  );

  // ── Background analysis (only on HUMAN turn to avoid engine race) ──
  // engineEnabled gates both analysis and the hint button.
  const engineEnabled =
    result.kind === "ongoing" &&
    !pendingCapture &&
    viewPly === null &&
    activeMode === targetMode &&
    game.turn === "w";

  useEffect(() => {
    // When it's the bot's turn, return without calling engine.stop() — that
    // would kill the worker the bot move effect needs.
    if (!engineEnabled) return;

    let cancelled = false;
    engineAnalyze({ state: game, maxDepth: 8, timeMs: 400 })
      .then((analysis) => {
        if (cancelled || !analysis) return;
        setAnalysisPly(game.ply);
        // Cache the student's pre-move analysis so the trainer can reason
        // about wpDelta / bestMove on their NEXT move. `score` is from the
        // side-to-move POV which is the student (white) here.
        studentPreMoveAnalysisRef.current = { ply: game.ply, analysis };
      });
    return () => {
      cancelled = true;
    };
  }, [engineEnabled, game, game.ply, engineAnalyze]);

  // ── Bot move effect (uses per-bot engine profiles) ──
  useEffect(() => {
    if (
      activeMode !== targetMode ||
      result.kind !== "ongoing" ||
      game.turn !== "b" ||
      pendingCapture ||
      viewPly !== null ||
      botPlyRef.current === game.ply
    ) {
      return;
    }

    let cancelled = false;
    const delay = randomThinkDelay(botProfile);

    engineBestMove({
      state: game,
      maxDepth: botProfile.maxDepth,
      timeMs: botProfile.timeMs,
    }).then((analysis) => {
      if (cancelled || !analysis?.bestMove) return;

      let chosen = analysis.bestMove;
      if (shouldBlunder(botProfile)) {
        const legal = getLegalMoves(game);
        const blunder = pickBlunderMove(legal, chosen);
        if (blunder) chosen = blunder;
      }

      const elapsed = analysis.elapsedMs ?? 0;
      const remaining = Math.max(0, delay - elapsed);

      setTimeout(() => {
        if (!cancelled) {
          botPlyRef.current = game.ply;
          commitMove(chosen);
        }
      }, remaining);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeMode,
    botProfile,
    commitMove,
    engineBestMove,
    game,
    game.ply,
    pendingCapture,
    result.kind,
    targetMode,
    viewPly,
  ]);

  // ── Trigger live trainer / bot commentary after each move ──
  //
  // For the LIVE TRAINER (Ata, /play?coach=ata) we fire on EVERY student move.
  // Before triggering, we run a fresh engine analysis of the post-move
  // position to derive evalAfter → wpDelta → moveClass, plus material and
  // mobility, plus a PDN tail. This gives the LLM enough grounding to stop
  // hallucinating coordinates and to give honest, position-specific advice.
  //
  // For BOT BANTER we keep the original sparse cadence so opponents don't
  // chatter on every ply.
  useEffect(() => {
    if (game.ply === 0) return;
    if (result.kind !== "ongoing") return;

    const lastMove = game.history[game.history.length - 1];
    if (!lastMove) return;

    const isPlayerMove = game.turn === "b"; // after player moved, it's bot's turn
    const hadCaptures = lastMove.captures.length > 0;
    const moveNumber = Math.ceil(game.ply / 2);
    if (
      !shouldTriggerLiveComment({
        moveNumber,
        isPlayerMove,
        hadCaptures,
        lastCommentMoveNumber: lastCommentMoveNumberRef.current,
        isTrainerMode: isCoachMode,
      })
    ) {
      return;
    }
    lastCommentMoveNumberRef.current = moveNumber;

    const totalEstimate = Math.max(game.ply + 20, 40);

    if (isCoachMode && isPlayerMove) {
      // CRITICAL: do NOT call engineAnalyze here — it shares the single
      // engine worker with the trainer's `engine.bestMove` (its own move).
      // If we queue an analyze in front, the trainer either waits 300ms+
      // for nothing or, if the bridge ever stalls a request, never moves
      // at all. Instead we classify synchronously from preAnalysis (the
      // background analysis of the position the student was thinking on).
      const studentMaterial = materialCounts(game.board, "w");
      const trainerMaterial = materialCounts(game.board, "b");
      const materialBalance = studentMaterial.total - trainerMaterial.total;
      const positionStatus: TrainerLiveSituation["positionStatus"] =
        studentMaterial.total === 0
          ? "lost"
          : materialBalance <= -3
            ? "worse"
            : materialBalance >= 3
              ? "winning"
              : "equal";

      const studentMobility = mobilityFor(game, "w");
      const trainerMobility = mobilityFor(game, "b");
      const tailPdn = recentMovesPdn(game.history, 8);

      const preAnalysis = studentPreMoveAnalysisRef.current;
      const preMatchesThisMove = preAnalysis?.ply === game.ply - 1;

      // Move classification without post-analyze:
      //   • student played the engine's #1   → "best"
      //   • student played a move from PV    → "excellent"
      //   • capture (any)                    → "good"
      //   • pre-eval already losing          → "inaccuracy"
      //   • else                             → "good"
      let moveClass: TrainerLiveSituation["moveClass"] = "good";
      let bestMoveNotation: string | null = null;
      let bestLineNotation: readonly string[] | undefined;
      let evalCp: number | undefined;

      if (preAnalysis && preMatchesThisMove) {
        const a = preAnalysis.analysis;
        evalCp = a.score;
        if (a.bestMove) {
          bestMoveNotation = moveToNotation(a.bestMove);
          const same =
            lastMove.from.row === a.bestMove.from.row &&
            lastMove.from.col === a.bestMove.from.col &&
            lastMove.to.row === a.bestMove.to.row &&
            lastMove.to.col === a.bestMove.to.col;
          if (same) moveClass = "best";
        }
        if (a.pv && a.pv.length > 0) {
          bestLineNotation = pvToNotation(a.pv, 4);
          if (moveClass !== "best") {
            const inPv = a.pv.some(
              (m) =>
                m.from.row === lastMove.from.row &&
                m.from.col === lastMove.from.col &&
                m.to.row === lastMove.to.row &&
                m.to.col === lastMove.to.col,
            );
            if (inPv) moveClass = "excellent";
          }
        }
        if (moveClass === "good" && a.score < -150 && !hadCaptures) {
          moveClass = "inaccuracy";
        }
      }
      if (moveClass !== "best" && moveClass !== "excellent" && hadCaptures) {
        moveClass = "good";
      }

      const situation: TrainerLiveSituation = {
        mode: "trainer-live",
        bySide: "student",
        moveClass,
        wpDelta: 0,
        evalCp,
        motif: hadCaptures ? "взятие" : null,
        lastMoveNotation: moveToNotation(lastMove),
        bestMoveNotation,
        bestLineNotation,
        studentMen: studentMaterial.men,
        studentKings: studentMaterial.kings,
        trainerMen: trainerMaterial.men,
        trainerKings: trainerMaterial.kings,
        materialBalance,
        positionStatus,
        studentMobility,
        trainerMobility,
        // Promotion-distance signal lets Ata avoid the classic
        // "веди в дамки" advice when no student man is anywhere near
        // the king-row. Without it she would loop on that suggestion
        // even on move 20 of a closed opening.
        studentPromotionDistance: closestPromotionDistance(game.board, "w"),
        recentMovesNotation: tailPdn,
        moveNumber,
        totalMoves: totalEstimate,
      };
      triggerComment("ata", situation);
      return;
    }

    // Coach mode but trainer just moved — stay quiet so we don't chat over
    // the student's planning.
    if (isCoachMode) return;

    // Ordinary bot mode — sparse banter.
    const trigger: BotBanterSituation["trigger"] = isPlayerMove
      ? "opponent_good"
      : "own_strong";
    const situation: CoachSituation = {
      mode: "bot-banter",
      trigger,
      moveNumber,
      totalMoves: totalEstimate,
    };
    triggerComment(selectedBot.id, situation);
  }, [
    game.ply,
    game.turn,
    game.history,
    game.board,
    game,
    result.kind,
    selectedBot.id,
    triggerComment,
    isCoachMode,
    counts.w,
    counts.b,
  ]);

  // ── Persist finished bot/trainer games for Archive + future Review entry points ──
  useEffect(() => {
    if (result.kind === "ongoing") {
      recordKeyRef.current = null;
      if (game.history.length === 0) {
        recordRoomIdRef.current = null;
      }
      return;
    }
    if (!userId || game.history.length === 0) return;
    recordRoomIdRef.current ??= `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const key = `${recordRoomIdRef.current}:${result.kind}:${game.history.length}`;
    if (recordKeyRef.current === key) return;
    recordKeyRef.current = key;

    const winner = result.kind === "win" ? result.winner : null;
    const reason = result.kind === "win" || result.kind === "draw" ? result.reason : "finished";

    void fetch("/api/games/record", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        roomId: recordRoomIdRef.current,
        winner,
        reason,
        moves: movesToRecordNotation(game.history),
        plyCount: game.history.length,
        timeControl: isCoachMode ? "coach" : "bot",
        finishedAt: Date.now(),
        players: [
          { playerId: userId, nick: username ?? userId, color: "w" },
          {
            playerId: `${isCoachMode ? "coach" : "bot"}:${selectedBot.id}`,
            nick: selectedBot.name,
            color: "b",
          },
        ],
      }),
    }).catch((err) => {
      console.error("[play] failed to record game", err);
      recordKeyRef.current = null;
    });
  }, [
    authToken,
    game.history,
    isCoachMode,
    result,
    selectedBot.id,
    selectedBot.name,
    userId,
    username,
  ]);

  // ── Auto-review when game ends (quick depth for instant stats) ──
  useEffect(() => {
    if (result.kind === "ongoing") {
      reviewTriggeredRef.current = false;
      return;
    }
    if (reviewTriggeredRef.current) return;
    if (game.history.length < 4) return;
    reviewTriggeredRef.current = true;
    startQuickReview(game.history, { depth: 6, timeMs: 300 });
  }, [result.kind, game.history, startQuickReview]);

  // ── Build end-game stats from the quick review ──
  //
  // Three slots in the modal: positive / neutral / negative.
  // While the quick review is in flight we send `value: null` for every
  // slot — the modal renders skeleton dots and never shows fake numbers
  // (the previous version exposed `history.length` as "Ходов" which read
  // as garbage stats in the first 700 ms).
  //
  // When the review completes we pick the *most informative* number per
  // slot: the highest-tier non-zero count for positives, the worst-tier
  // non-zero count for negatives. That way the user sees "1 Бриллиант"
  // instead of "0 Бриллиантов 0 Лучших 4 Зевка".
  const endGameStats = useMemo(() => {
    if (result.kind === "ongoing") return undefined;

    if (reviewEngine.status !== "done" || !reviewEngine.review) {
      return [
        { label: "Лучших", value: null, tone: "good" as const },
        { label: "Точных", value: null, tone: "warn" as const },
        { label: "Зевков", value: null, tone: "bad" as const },
      ];
    }

    const s = reviewEngine.review.stats.white;

    // Pick the highest-priority non-zero category for each slot. If no
    // category has anything, fall back to the aggregate label so the
    // slot is still meaningful (e.g. "Лучших: 0" rather than empty).
    const positive = pickFirst([
      ["Бриллиантов", s.brilliant],
      ["Великих", s.great],
      ["Лучших", s.best],
      ["Отличных", s.excellent],
    ]) ?? ["Лучших", s.brilliant + s.great + s.best + s.excellent];

    const neutral = pickFirst([
      ["Хороших", s.good],
      ["Неточностей", s.inaccuracy],
    ]) ?? ["Точных", s.good];

    const negative = pickFirst([
      ["Зевков", s.blunder],
      ["Ошибок", s.mistake],
      ["Пропусков", s.miss],
    ]) ?? ["Зевков", s.blunder + s.mistake + s.miss];

    return [
      { label: positive[0], value: positive[1], tone: "good" as const },
      { label: neutral[0], value: neutral[1], tone: "warn" as const },
      { label: negative[0], value: negative[1], tone: "bad" as const },
    ];
  }, [result.kind, reviewEngine.status, reviewEngine.review]);

  // ── Hint request ──
  async function requestHint() {
    if (result.kind !== "ongoing" || game.turn !== "w") return;
    const current =
      analysisPly === game.ply && engine.latest?.bestMove ? engine.latest : null;
    const analysis =
      current ??
      (await engine.bestMove({ state: game, maxDepth: 10, timeMs: 1500 }));
    if (analysis?.bestMove) {
      setSuggestedMove({ ply: game.ply, move: analysis.bestMove });
      setAnalysisPly(game.ply);
    }
  }

  // ── Takeback (undo 2 plies in bot mode = player + bot move) ──
  const canTakeback =
    game.history.length >= 2 && result.kind === "ongoing" && game.turn === "w";

  function handleTakeback() {
    undoMove(2);
  }

  // ── Resign ──
  function handleResign() {
    resign("w");
  }

  function beginBoardResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startScale = boardScale;

    function onMove(moveEvent: PointerEvent) {
      const delta = Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY);
      setBoardScale(Math.max(58, Math.min(112, startScale + Math.round(delta / 6))));
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="flex h-svh overflow-hidden bg-[#302f2b] text-white">
      <AppSidebar />

      <main className="flex min-w-0 flex-1 items-center justify-end px-3 py-4 lg:px-4">
        <div
          className="flex w-full flex-col gap-3"
          style={{
            maxWidth: `min(${boardScale}svh, ${Math.round((880 * boardScale) / 100)}px, 100%)`,
          }}
        >
          <PlayerStrip
            name={`${selectedBot.name} (${selectedBot.elo})`}
            side="b"
            active={game.turn === "b" && result.kind === "ongoing"}
            capturedCount={12 - counts.w}
            avatarInitial={selectedBot.name[0]}
          />
          <div className="relative w-full">
            <GameBoard
              suggestedMove={
                suggestedMove?.ply === game.ply ? suggestedMove.move : null
              }
            />
            <button
              type="button"
              aria-label="Изменить размер доски"
              title="Изменить размер доски"
              onPointerDown={beginBoardResize}
              className="absolute right-1 bottom-1 z-30 h-8 w-8 cursor-nwse-resize rounded-sm bg-black/25 text-white/70 transition hover:bg-black/45 hover:text-white"
            >
              <span className="absolute right-1.5 bottom-1.5 h-3 w-3 border-r-2 border-b-2 border-current" />
              <span className="absolute right-1.5 bottom-1.5 h-5 w-5 border-r-2 border-b-2 border-current opacity-55" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <PlayerStrip
              name="Игрок"
              side="w"
              active={game.turn === "w" && result.kind === "ongoing"}
              capturedCount={12 - counts.b}
              avatarInitial="И"
              className="min-w-0 flex-1"
            />
          </div>
        </div>
      </main>

      {/* Chess.com-style right panel with bot dialogue */}
      <GameSidePanel
        bot={selectedBot}
        title={isCoachMode ? "Игра с тренером" : "Боты"}
        comment={liveComment}
        comments={liveCommentHistory}
        moves={game.history}
        onSurrender={handleResign}
        onTakeback={handleTakeback}
        onHint={requestHint}
        hintDisabled={!engineEnabled || engine.thinking}
        takebackDisabled={!canTakeback}
      />

      <AdRail />

      <EndGameModal
        result={result}
        viewerWon={
          result.kind === "win"
            ? result.winner === "w"
            : result.kind === "draw"
              ? "draw"
              : undefined
        }
        onRematch={reset}
        onNewGame={reset}
        onReview={handleReview}
        onDismiss={() => {}}
        coachName="Ата"
        coachLine={
          result.kind === "win"
            ? result.winner === "w"
              ? "Отлично. Посмотри, где соперник потерял темп."
              : "Найди ключевой момент. Там спрятан урок."
            : result.kind === "draw"
              ? "Равная игра. Найди, где можно было решить."
              : ""
        }
        stats={endGameStats}
      />

      <AuthModal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingReviewRedirect(false);
        }}
      />
    </div>
  );
}

function AdRail() {
  // Two stacked slots so the column reads as a real ad surface and not
  // a single empty box. Shown only on xl+ screens where there's actually
  // room — at smaller widths the play-hub already takes the full right
  // column, and we don't want the rail competing for space.
  return (
    <aside className="hidden w-[240px] shrink-0 flex-col gap-2 border-l border-[#25231f] bg-[#24231f] px-2 py-1 xl:flex">
      <div className="flex flex-1 flex-col items-center justify-center rounded-md border border-[#3a3832] bg-[linear-gradient(180deg,#2f2d28,#1f1e1a)] text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#77716a]">
          Реклама
        </span>
        <span className="mt-2 px-3 text-xs text-[#aaa49a]">300×600 баннер</span>
      </div>
      <div className="flex h-[260px] w-full flex-col items-center justify-center rounded-md border border-[#3a3832] bg-[linear-gradient(180deg,#2f2d28,#1f1e1a)] text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#77716a]">
          Партнёрская
        </span>
        <span className="mt-2 px-3 text-xs text-[#aaa49a]">300×250 баннер</span>
      </div>
    </aside>
  );
}

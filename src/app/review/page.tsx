"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";

import { playSound } from "@/lib/sounds";

import { AccuracyPanel } from "@/components/review/accuracy-panel";
import { AppSidebar } from "@/components/app-sidebar";
import { EvalBar } from "@/components/review/eval-bar";
import { EvalGraph } from "@/components/review/eval-graph";
import { ReviewMoveList } from "@/components/review/review-move-list";
import { MoveBadge } from "@/components/board/move-badge";
import { PlayerStrip } from "@/components/game/player-strip";
import { Button } from "@/components/ui/button";
import { useCoachComment } from "@/hooks/use-coach-comment";
import { useReviewEngine } from "@/hooks/use-review-engine";
import type { SideStats } from "@/lib/engine-ai/review/accuracy";
import { gameStateAtPly } from "@/stores/replay";
import { useGameStore } from "@/stores/game-store";

// Board rendering — reuse cells + pieces from game components
import { BOARD_SIZE, isDarkSquare } from "@/lib/engine";
import { BoardCell } from "@/components/board/board-cell";
import { BoardTexture } from "@/components/board/board-texture";
import { PiecesLayerStatic } from "@/components/review/pieces-layer-static";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export default function ReviewPage() {
  const game = useGameStore((s) => s.game);
  const history = game.history;

  const [viewPly, setViewPly] = useState<number>(history.length);
  const { status, progressMoves, progressPct, review, error, startReview } = useReviewEngine();

  // Start the review once on mount (only if there's a game to review)
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || history.length === 0) return;
    startedRef.current = true;
    startReview(history, { depth: 4, timeMs: 400 });
  }, [history, startReview]);

  // Navigation helpers
  const totalPly = history.length;
  const goTo = useCallback(
    (ply: number) => setViewPly(Math.max(0, Math.min(totalPly, ply))),
    [totalPly],
  );

  // Pick the sound matching the move you are scrubbing past so a fast hold
  // produces the satisfying tick-tick-tick the user asked for.
  const playStepSoundForMove = useCallback(
    (moveIdx: number) => {
      const m = history[moveIdx];
      if (!m) {
        playSound("click");
        return;
      }
      if (m.captures.length > 0) playSound("capture");
      else if (m.promoted) playSound("promote");
      else playSound("move");
    },
    [history],
  );

  const stepBack = useCallback(() => {
    setViewPly((cur) => {
      if (cur <= 0) return cur;
      playStepSoundForMove(cur - 1);
      return cur - 1;
    });
  }, [playStepSoundForMove]);

  const stepForward = useCallback(() => {
    setViewPly((cur) => {
      if (cur >= totalPly) return cur;
      playStepSoundForMove(cur);
      return cur + 1;
    });
  }, [playStepSoundForMove, totalPly]);

  const jumpStart = useCallback(() => {
    if (viewPly === 0) return;
    playSound("click");
    goTo(0);
  }, [viewPly, goTo]);

  const jumpEnd = useCallback(() => {
    if (viewPly === totalPly) return;
    playSound("click");
    goTo(totalPly);
  }, [viewPly, goTo, totalPly]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); stepBack(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepForward(); }
      else if (e.key === "ArrowUp" && !e.repeat) { e.preventDefault(); jumpStart(); }
      else if (e.key === "ArrowDown" && !e.repeat) { e.preventDefault(); jumpEnd(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepBack, stepForward, jumpStart, jumpEnd]);

  // Pointer auto-repeat for the back / forward buttons — hold to scrub fast.
  const repeatStateRef = useRef<{
    timeout: ReturnType<typeof setTimeout> | null;
    interval: ReturnType<typeof setInterval> | null;
  }>({ timeout: null, interval: null });
  const stopRepeat = useCallback(() => {
    const s = repeatStateRef.current;
    if (s.timeout) { clearTimeout(s.timeout); s.timeout = null; }
    if (s.interval) { clearInterval(s.interval); s.interval = null; }
  }, []);
  useEffect(() => stopRepeat, [stopRepeat]);
  const startRepeat = useCallback(
    (action: () => void) => {
      stopRepeat();
      const s = repeatStateRef.current;
      s.timeout = setTimeout(() => {
        s.interval = setInterval(action, 80);
      }, 280);
    },
    [stopRepeat],
  );

  // Board state at current view ply
  const frame = useMemo(() => gameStateAtPly(history, viewPly), [history, viewPly]);

  // Eval bar value — win prob for white at current ply
  const currentMove = review?.moves[viewPly - 1];
  let wpWhite: number;
  if (viewPly === 0) {
    wpWhite = 0.5;
  } else if (currentMove) {
    // currentMove.wpAfter is from side-to-move's POV; convert to white's POV
    wpWhite = currentMove.side === "white" ? currentMove.wpAfter : 1 - currentMove.wpAfter;
  } else if (progressMoves.length >= viewPly) {
    const pm = progressMoves[viewPly - 1];
    wpWhite = pm ? (pm.side === "white" ? pm.wpAfter : 1 - pm.wpAfter) : 0.5;
  } else {
    wpWhite = 0.5;
  }

  const displayedMoves = review?.moves ?? progressMoves;
  const lastPlayedMove = viewPly > 0 ? history[viewPly - 1] : null;
  const currentReviewMove = displayedMoves[viewPly - 1];

  const { comment: llmComment, loading: commentLoading } = useCoachComment(
    currentReviewMove,
    viewPly,
    totalPly
  );

  // White/black accuracy from review
  const whiteStats: SideStats | null = review ? {
    accuracy: review.accuracy.white,
    ...review.stats.white,
    totalMoves: Object.values(review.stats.white).reduce((a, b) => a + b, 0),
  } : null;
  const blackStats: SideStats | null = review ? {
    accuracy: review.accuracy.black,
    ...review.stats.black,
    totalMoves: Object.values(review.stats.black).reduce((a, b) => a + b, 0),
  } : null;

  if (history.length === 0) {
    return (
      <div className="flex min-h-svh bg-[#302f2b] text-white">
        <AppSidebar />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="font-display text-2xl font-medium text-[color:var(--text-primary)]">
            Нет партии для разбора
          </h1>
          <p className="text-sm text-[color:var(--text-muted)]">
            Сыграй партию и вернись сюда для разбора.
          </p>
          <Link href="/play">
            <Button variant="primary" size="md">Сыграть партию</Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh bg-[#302f2b] text-white">
      <AppSidebar />
      <main className="flex-1 px-3 py-4 sm:px-4 md:px-6 lg:py-6">
        <div className="mx-auto grid max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1fr)_400px] lg:grid-cols-[minmax(0,1fr)_360px]">

          {/* ── Left column: board ── */}
          <div className="mx-auto flex w-full max-w-[920px] flex-col gap-3">
            <PlayerStrip
              name="Чёрные"
              side="b"
              active={false}
              capturedCount={12 - frame.pieces.filter((p) => p.color === "w").length}
              clock={blackStats ? `${Math.round(blackStats.accuracy)}%` : "—"}
              avatarInitial="Ч"
            />

            {/* Board + eval bar */}
            <div className="flex gap-2">
              <EvalBar
                wpWhite={wpWhite}
                className="self-stretch"
              />

              <div className="relative flex-1">
                <ReviewBoardStatic
                  frame={frame}
                  lastMove={lastPlayedMove}
                  bestMove={currentReviewMove?.bestMove ?? null}
                />
                {/* Classification badge overlay */}
                {currentReviewMove && viewPly > 0 && (
                  <div className="pointer-events-none absolute right-1 top-1 z-20">
                    <MoveBadge
                      type={currentReviewMove.moveClass}
                      size={36}
                      label={undefined}
                      showTooltip={false}
                    />
                  </div>
                )}
              </div>
            </div>

            <PlayerStrip
              name="Белые"
              side="w"
              active={false}
              capturedCount={12 - frame.pieces.filter((p) => p.color === "b").length}
              clock={whiteStats ? `${Math.round(whiteStats.accuracy)}%` : "—"}
              avatarInitial="Б"
            />

            {/* Replay controls */}
            <div className="flex items-center gap-1 rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] p-2">
              <div className="flex-1 px-2 text-sm text-[color:var(--text-secondary)]">
                {viewPly === 0
                  ? "Начало партии"
                  : viewPly === totalPly
                    ? "Конец партии"
                    : `Ход ${Math.ceil(viewPly / 2)} — ${viewPly % 2 === 1 ? "белые" : "чёрные"}`}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={jumpStart}
                  disabled={viewPly === 0}
                  className="h-9 w-9 justify-center p-0"
                >
                  <ChevronsLeft className="h-4 w-4" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={stepBack}
                  onPointerDown={() => startRepeat(stepBack)}
                  onPointerUp={stopRepeat}
                  onPointerLeave={stopRepeat}
                  onPointerCancel={stopRepeat}
                  disabled={viewPly === 0}
                  className="h-9 w-9 justify-center p-0"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={stepForward}
                  onPointerDown={() => startRepeat(stepForward)}
                  onPointerUp={stopRepeat}
                  onPointerLeave={stopRepeat}
                  onPointerCancel={stopRepeat}
                  disabled={viewPly === totalPly}
                  className="h-9 w-9 justify-center p-0"
                >
                  <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={jumpEnd}
                  disabled={viewPly === totalPly}
                  className="h-9 w-9 justify-center p-0"
                >
                  <ChevronsRight className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </div>
            </div>
          </div>

          {/* ── Right panel ── */}
          <aside className="flex min-h-0 flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100svh-96px)] lg:overflow-y-auto lg:pr-1">

            {/* Error state */}
            {status === "error" && (
              <div className="rounded-lg border border-[color:var(--danger)]/40 bg-[color:var(--bg-surface)] px-4 py-3 text-sm text-[color:var(--danger)]">
                Ошибка анализа: {error ?? "неизвестная ошибка"}
              </div>
            )}

            {/* Loading indicator */}
            {status === "loading" && (
              <div className="rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                      Анализ
                    </span>
                    <span className="block truncate text-sm text-[color:var(--text-secondary)]">
                      Ата разбирает партию… {progressMoves.length}/{totalPly} ходов
                    </span>
                  </div>
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--border-strong)] border-t-[color:var(--accent)]" />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-elevated)]">
                  <div
                    className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Coach comment for current move */}
            {currentReviewMove && (
              <div className="flex items-start gap-3 rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] px-4 py-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold"
                  style={{ background: "rgba(201,162,39,0.18)", color: "var(--accent)" }}
                >
                  А
                </div>
                <div className="min-w-0 pt-0.5">
                  <div className="flex items-center gap-2">
                    <MoveBadge type={currentReviewMove.moveClass} size={20} showTooltip={false} />
                    <span className="font-display text-sm font-medium text-[color:var(--text-primary)]">
                      {MOVE_CLASS_LABEL[currentReviewMove.moveClass]}
                    </span>
                    {currentReviewMove.motif && (
                      <span className="text-xs text-[color:var(--text-muted)]">
                        · {currentReviewMove.motif.description}
                      </span>
                    )}
                  </div>
                  {commentLoading ? (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="h-3 w-4/5 animate-pulse rounded bg-[color:var(--bg-elevated)]" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-[color:var(--bg-elevated)]" />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                      {llmComment ?? coachComment(currentReviewMove)}
                    </p>
                  )}
                </div>
              </div>
            )}

            <AccuracyPanel
              white={whiteStats}
              black={blackStats}
              loading={status === "loading"}
            />

            <EvalGraph
              moves={displayedMoves}
              viewPly={viewPly}
              onSeek={(ply) => goTo(ply)}
            />

            <ReviewMoveList
              moves={displayedMoves}
              viewPly={viewPly}
              onSeek={(ply) => goTo(ply)}
              className="min-h-[200px] flex-1"
            />

            <div className="flex shrink-0 flex-col gap-2 pb-1">
              <Link href="/play" className="w-full">
                <Button variant="primary" size="md" className="w-full">
                  Новая партия
                </Button>
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ── Helpers ──

const MOVE_CLASS_LABEL: Record<string, string> = {
  brilliant: "Блестящий ход!",
  great: "Прекрасный ход",
  best: "Лучший ход",
  excellent: "Отличный ход",
  good: "Хороший ход",
  book: "Теоретический ход",
  inaccuracy: "Неточность",
  mistake: "Ошибка",
  blunder: "Зевок",
  miss: "Упущенный шанс",
};

import type { ReviewedMove } from "@/lib/engine-ai/review/index";

function coachComment(move: ReviewedMove): string {
  const wpLoss = Math.round(move.wpDelta * 100);
  switch (move.moveClass) {
    case "brilliant": return "Нестандартный ход, который ставит соперника в трудное положение.";
    case "great": return "Точное решение, сохраняющее перевес.";
    case "best": return "Оптимальный ход в данной позиции.";
    case "excellent": return "Хорошее продолжение с минимальными потерями.";
    case "good": return "Разумный ход, без серьёзных ошибок.";
    case "book": return "Теоретически рекомендованное начало.";
    case "inaccuracy": return `Небольшая неточность. Потеря около ${wpLoss}% шансов на победу.`;
    case "mistake": return `Ошибка. Лучше было сыграть иначе — потеря ${wpLoss}% шансов.`;
    case "blunder": return `Грубая ошибка! Потеря ${wpLoss}% шансов на победу.`;
    case "miss": return "Соперник ошибся, но вы не воспользовались шансом.";
    default: return "";
  }
}

// ── Static board (read-only, no game-store interaction) ──

import type { Move } from "@/lib/engine";
import type { ReplayFrame } from "@/stores/replay";

interface ReviewBoardStaticProps {
  frame: ReplayFrame;
  lastMove: Move | null;
  bestMove: Move | null;
}

function ReviewBoardStatic({ frame, lastMove, bestMove }: ReviewBoardStaticProps) {
  const boardSurfaceRef = useRef<HTMLDivElement>(null);
  const rows = Array.from({ length: BOARD_SIZE }, (_, i) => i);
  const cols = Array.from({ length: BOARD_SIZE }, (_, i) => i);

  function getHint(row: number, col: number) {
    if (lastMove) {
      if (lastMove.from.row === row && lastMove.from.col === col) return "last-from" as const;
      if (lastMove.to.row === row && lastMove.to.col === col) return "last-to" as const;
    }
    if (bestMove) {
      if (bestMove.from.row === row && bestMove.from.col === col) return "engine-from" as const;
      if (bestMove.to.row === row && bestMove.to.col === col) return "engine-to" as const;
    }
    return "none" as const;
  }

  return (
    <div
      className="relative aspect-square w-full select-none overflow-hidden rounded-xl"
      style={{
        padding: "14px",
        background: "linear-gradient(140deg, #3A2A1A 0%, #1F1408 30%, #100A04 70%, #2A1C0F 100%)",
        boxShadow:
          "0 40px 80px -28px rgba(0,0,0,0.7), 0 18px 36px -16px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,220,170,0.12), inset 0 -1px 0 0 rgba(0,0,0,0.6)",
      }}
    >
      <div
        ref={boardSurfaceRef}
        className="relative h-full w-full overflow-hidden rounded-md"
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(220,180,120,0.15), 0 2px 0 0 rgba(0,0,0,0.4)",
        }}
      >
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
          }}
        >
          {rows.flatMap((row, dispRow) =>
            cols.map((col, dispCol) => {
              const interactive = isDarkSquare(row, col);
              return (
                <BoardCell
                  key={`${row}-${col}`}
                  row={row}
                  col={col}
                  hint={interactive ? getHint(row, col) : "none"}
                  interactive={false}
                  fileLabel={dispRow === BOARD_SIZE - 1 ? FILES[col] : undefined}
                  rankLabel={dispCol === 0 ? String(BOARD_SIZE - row) : undefined}
                />
              );
            })
          )}
        </div>
        <BoardTexture />
        <PiecesLayerStatic pieces={frame.pieces} boardRef={boardSurfaceRef} />
      </div>
    </div>
  );
}

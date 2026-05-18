"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Share2, Star, Trophy, X } from "lucide-react";

import { BotAvatar, type BotId } from "@/components/bot/bot-avatar";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { GameResult } from "@/lib/engine";

type EndGameStat = {
  label: string;
  // `null` means "we know the slot exists but the review hasn't computed
  // a number yet" — we render a skeleton dot trio in that case so the
  // modal layout is stable from the moment it opens.
  value: number | string | null;
  tone: "good" | "warn" | "bad";
};

interface EndGameModalProps {
  result: GameResult;
  /** True if "you" (the viewer) won. For hot-seat we'd pass the winner color. */
  viewerWon?: boolean | "draw";
  onRematch?: () => void;
  onNewGame?: () => void;
  onDismiss?: () => void;
  /** Called when user clicks "Отчет о партии". */
  onReview?: () => void;
  /** Optional coach name + line for the bubble. */
  coachName?: string;
  coachLine?: string;
  /** Which coach persona to render as the avatar. */
  coachBot?: BotId;
  /** Quick counters to show under Ata's line. */
  stats?: ReadonlyArray<EndGameStat>;
}

const REASON_RU: Record<string, string> = {
  no_pieces: "Соперник остался без шашек",
  no_moves: "Соперник не может ходить",
  resign: "Соперник сдался",
  fifty_move: "50 ходов без взятия",
  repetition: "Троекратное повторение",
  agreement: "По соглашению",
  endgame_3v1_kings: "Ничья по правилу FMJD: 3 дамки против одной, 15 ходов",
  endgame_long_diagonal: "Ничья по правилу FMJD: длинная диагональ, 5 ходов",
};

// Used during the brief window between game-over and review-complete.
// `null` triggers the skeleton-dots render so we never expose nonsense
// numbers like "ходов: 36" before the actual stats are ready.
const DEFAULT_STATS: ReadonlyArray<EndGameStat> = [
  { label: "Лучших", value: null, tone: "good" },
  { label: "Точных", value: null, tone: "warn" },
  { label: "Зевков", value: null, tone: "bad" },
];

export function EndGameModal({
  result,
  viewerWon,
  onRematch,
  onNewGame,
  onDismiss,
  onReview,
  coachName = "Ата",
  coachLine,
  coachBot = "ata",
  stats,
}: EndGameModalProps) {
  if (result.kind === "ongoing") return null;

  const isWin = result.kind === "win";
  const isDraw = result.kind === "draw";
  const visibleStats = stats && stats.length > 0 ? stats.slice(0, 3) : DEFAULT_STATS;

  const title = isDraw
    ? "Ничья"
    : viewerWon === true
      ? "Победа!"
      : viewerWon === false
        ? "Поражение"
        : isWin
          ? `${result.winner === "w" ? "Белые" : "Черные"} выиграли`
          : "Партия окончена";

  const subtitle = "reason" in result ? REASON_RU[result.reason] ?? "" : "";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[color:var(--border-base)] bg-[#211f1c] shadow-2xl"
        >
          <button
            type="button"
            aria-label="Поделиться"
            className="absolute left-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-white/10 hover:text-[color:var(--text-primary)]"
          >
            <Share2 className="h-4 w-4" strokeWidth={1.75} />
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Закрыть"
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-white/10 hover:text-[color:var(--text-primary)]"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          )}

          <div className="bg-[#373431] px-8 pb-9 pt-10 text-center">
            <div className="mb-3 flex justify-center">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full"
                style={{
                  background: isDraw
                    ? "rgba(111, 138, 173, 0.18)"
                    : viewerWon === false
                      ? "rgba(184, 92, 80, 0.18)"
                      : "rgba(201, 162, 39, 0.18)",
                  color: isDraw
                    ? "var(--info)"
                    : viewerWon === false
                      ? "var(--danger)"
                      : "var(--accent)",
                }}
              >
                <Trophy className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
            <h2
              className="font-display text-3xl font-semibold leading-tight text-[color:var(--text-primary)]"
              style={{ letterSpacing: "-0.02em" }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-2 text-base font-semibold text-[color:var(--text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>

          <div className="px-6 pb-6 pt-16">
            {coachLine && (
              <div className="mb-7 flex items-end">
                <div className="z-10 -mr-1 shrink-0">
                  <BotAvatar bot={coachBot} size={72} />
                </div>
                <div className="relative flex-1 rounded-2xl rounded-bl-sm bg-[#f6f1ea] px-4 py-3 text-left text-[17px] font-semibold leading-relaxed text-[#34302b] shadow-lg">
                  <span
                    aria-hidden
                    className="absolute bottom-4 -left-1.5 h-4 w-4 rotate-45 bg-[#f6f1ea]"
                  />
                  <span className="sr-only">{coachName}: </span>
                  {coachLine}
                </div>
              </div>
            )}

            <div className="mb-6 grid grid-cols-3 gap-3">
              {visibleStats.map((stat, index) => (
                <div
                  key={`${stat.label}-${index}`}
                  className="flex min-w-0 flex-col items-center gap-1.5 text-center"
                >
                  <div className="flex items-center justify-center gap-1">
                    <StatIcon tone={stat.tone} index={index} />
                    {stat.value === null ? (
                      // Skeleton dots while the quick review is still
                      // crunching. Three dots ≈ "calculating", animated so
                      // the user can tell the modal is alive.
                      <SkeletonDots tone={stat.tone} />
                    ) : typeof stat.value === "number" ? (
                      <AnimatedNumber
                        value={stat.value}
                        className="font-display text-2xl font-semibold"
                        style={{ color: statColor(stat.tone) }}
                      />
                    ) : (
                      <span
                        className="font-display text-2xl font-semibold"
                        style={{ color: statColor(stat.tone) }}
                      >
                        {stat.value}
                      </span>
                    )}
                  </div>
                  <span
                    className="max-w-full text-balance text-sm font-semibold leading-tight"
                    style={{ color: statColor(stat.tone) }}
                  >
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            <Button
              variant="primary"
              size="md"
              className="mb-3 h-16 w-full text-xl"
              onClick={onReview}
              disabled={!onReview}
            >
              Отчет о партии
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={onNewGame}
                disabled={!onNewGame}
              >
                Новая партия
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={onRematch}
                disabled={!onRematch}
              >
                Реванш
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function StatIcon({ tone, index }: { tone: EndGameStat["tone"]; index: number }) {
  const Icon = index === 0 ? Star : index === 1 ? CheckCircle2 : AlertTriangle;

  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{ background: statColor(tone), color: "#fff" }}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </span>
  );
}

function statColor(tone: EndGameStat["tone"]): string {
  if (tone === "good") return "var(--success)";
  if (tone === "warn") return "var(--warning)";
  return "var(--danger)";
}

/**
 * Three pulsing dots, color-matched to the stat tone. Drawn in the same
 * 24px line-height slot as the numeric value so the stat row never jumps
 * vertically between loading and loaded states.
 */
function SkeletonDots({ tone }: { tone: EndGameStat["tone"] }) {
  const color = statColor(tone);
  return (
    <span
      aria-label="calculating"
      className="inline-flex items-end gap-[3px] pb-[6px]"
      style={{ height: "32px" }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.05,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  );
}

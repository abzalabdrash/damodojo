"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Lightbulb, RotateCcw, Undo2 } from "lucide-react";

import { BotAvatar } from "@/components/bot/bot-avatar";
import type { BotId } from "@/components/bot/bot-avatar";
import { CoachBubble } from "@/components/coach/coach-bubble";
import { MoveList } from "@/components/game/move-list";
import { ReplayControls } from "@/components/game/replay-controls";
import type { Character } from "@/lib/coach/characters";
import { pickLine } from "@/lib/coach/characters";
import type { BotBanterSituation } from "@/lib/coach/featherless";
import type { Move } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";

interface BotGamePanelProps {
  character: Character;
  onResign: () => void;
  onTakeback: () => void;
  onHint: () => void;
  onNewGame: () => void;
  showResignConfirm: boolean;
  canTakeback: boolean;
  hintDisabled: boolean;
  evalScore: number | null;
  engineThinking: boolean;
  engineDepth: number | null;
  engineError: string | null;
}

export function BotGamePanel({
  character,
  onResign,
  onTakeback,
  onHint,
  onNewGame,
  showResignConfirm,
  canTakeback,
  hintDisabled,
  evalScore,
  engineThinking,
  engineDepth,
  engineError,
}: BotGamePanelProps) {
  const game = useGameStore((s) => s.game);
  const result = useGameStore((s) => s.result);

  const [greeting] = useState(() => pickLine(character, "onGameStart"));
  const [situation, setSituation] = useState<BotBanterSituation | null>(null);
  const prevPlyRef = useRef(game.ply);

  const isBotChar = character.kind === "bot" && isBotAvatarId(character.id);

  useEffect(() => {
    if (game.ply === prevPlyRef.current) return;
    const lastPly = prevPlyRef.current;
    prevPlyRef.current = game.ply;

    if (game.ply <= 2) return;

    const movedSide = game.ply % 2 === 0 ? "b" : "w";

    if (result.kind !== "ongoing") {
      if (result.kind === "win" && result.winner === "b") {
        setSituation({
          mode: "bot-banter",
          trigger: "own_strong",
          moveNumber: game.ply,
          totalMoves: game.history.length,
        });
      }
      return;
    }

    if (movedSide === "w" && Math.random() < 0.3) {
      setSituation({
        mode: "bot-banter",
        trigger: "opponent_good",
        moveNumber: game.ply,
        totalMoves: game.history.length,
      });
    } else if (movedSide === "b" && Math.random() < 0.35) {
      setSituation({
        mode: "bot-banter",
        trigger: "own_strong",
        moveNumber: game.ply,
        totalMoves: game.history.length,
      });
    }
  }, [game.ply, game.history.length, result]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Bot header with avatar + speech bubble */}
      <div className="shrink-0 rounded-xl border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] p-3 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.7)]">
        <div className="mb-2 flex items-center gap-3">
          <BotAvatar
            bot={isBotChar ? (character.id as BotId) : "ata"}
            size={44}
            glow={result.kind === "ongoing" && game.turn === "b"}
          />
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[color:var(--text-primary)]">
              {character.name}
            </span>
            <span className="block text-[11px] text-[color:var(--text-muted)]">
              {character.elo} ELO
            </span>
          </div>
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full transition-colors",
              result.kind !== "ongoing"
                ? "bg-zinc-500"
                : game.turn === "b"
                  ? "animate-pulse bg-green-400"
                  : "bg-zinc-600"
            )}
            title={game.turn === "b" ? "Думает…" : "Ваш ход"}
          />
        </div>

        <CoachBubble
          character={character}
          initialLine={greeting}
          situation={situation}
          side="left"
          className="mt-1"
        />
      </div>

      {/* Eval bar */}
      <div className="shrink-0 rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] px-4 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          <span>Анализ</span>
          <span>
            {engineThinking
              ? "думает…"
              : engineDepth !== null
                ? `глубина ${engineDepth}`
                : "—"}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color:var(--bg-elevated)]">
          <div
            className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-200"
            style={{ width: `${scoreToPercent(evalScore)}%` }}
          />
        </div>
        <div className="mt-1 font-mono text-xs text-[color:var(--text-secondary)]">
          {evalScore === null ? "—" : formatEval(evalScore)}
          {engineError ? ` · ${engineError}` : ""}
        </div>
      </div>

      {/* Move list */}
      <MoveList history={game.history} className="min-h-[120px] flex-1" />

      <ReplayControls className="shrink-0" />

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-1.5">
        {result.kind === "ongoing" && (
          <ActionBtn
            onClick={onResign}
            active={showResignConfirm}
            danger={showResignConfirm}
          >
            <Flag className="h-3.5 w-3.5" strokeWidth={2} />
            {showResignConfirm ? "Сдаюсь" : "Сдаться"}
          </ActionBtn>
        )}
        <ActionBtn onClick={onTakeback} disabled={!canTakeback}>
          <Undo2 className="h-3.5 w-3.5" strokeWidth={2} />
          Назад
        </ActionBtn>
        <ActionBtn onClick={onHint} disabled={hintDisabled} accent>
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} />
          Подсказка
        </ActionBtn>
        <div className="flex-1" />
        <ActionBtn onClick={onNewGame}>
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          Новая
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  active,
  danger,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all duration-150",
        danger
          ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/40"
          : accent
            ? "bg-[color:var(--accent-muted)] text-[color:var(--accent)] hover:bg-[color:var(--accent-muted)]/80"
            : "bg-[color:var(--bg-elevated)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
        disabled && "pointer-events-none opacity-30"
      )}
    >
      {children}
    </button>
  );
}

function isBotAvatarId(id: string): id is BotId {
  return ["ata", "kanat", "zhanar", "temir", "aigerim", "talgat"].includes(id);
}

function scoreToPercent(score: number | null): number {
  if (score === null) return 50;
  const clamped = Math.max(-600, Math.min(600, score));
  return Math.round(50 + (clamped / 600) * 45);
}

function formatEval(score: number): string {
  const pawns = score / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

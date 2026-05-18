"use client";

import { useEffect, useRef } from "react";

import { MoveBadge } from "@/components/board/move-badge";
import type { ReviewedMove } from "@/lib/engine-ai/review/index";
import { cn } from "@/lib/utils";

interface ReviewMoveListProps {
  moves: readonly ReviewedMove[];
  viewPly: number | null;
  onSeek: (ply: number) => void;
  className?: string;
}

const CLASS_BG: Record<string, string> = {
  brilliant: "rgba(79,195,247,0.12)",
  great: "rgba(102,187,106,0.12)",
  best: "rgba(124,179,66,0.1)",
  excellent: "rgba(156,204,101,0.08)",
  good: "transparent",
  book: "rgba(141,110,99,0.1)",
  inaccuracy: "rgba(255,179,0,0.12)",
  mistake: "rgba(251,140,0,0.15)",
  blunder: "rgba(229,57,53,0.18)",
  miss: "rgba(198,40,40,0.18)",
};

const CLASS_BORDER: Record<string, string> = {
  blunder: "rgba(229,57,53,0.4)",
  mistake: "rgba(251,140,0,0.35)",
  miss: "rgba(198,40,40,0.4)",
  brilliant: "rgba(79,195,247,0.35)",
  great: "rgba(102,187,106,0.3)",
};

export function ReviewMoveList({
  moves,
  viewPly,
  onSeek,
  className,
}: ReviewMoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [viewPly]);

  // Build rows: pairs of (white, black) moves
  const rows: Array<{
    number: number;
    white?: ReviewedMove;
    black?: ReviewedMove;
  }> = [];

  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex flex-col overflow-y-auto rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)]",
        className
      )}
    >
      <div className="sticky top-0 z-10 border-b border-[color:var(--border-base)] bg-[color:var(--bg-surface)]/95 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)] backdrop-blur">
        Разбор ходов
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-[color:var(--text-muted)]">
          Анализируем…
        </div>
      ) : (
        <ol className="flex-1 px-1 py-1">
          {rows.map((row) => (
            <li
              key={row.number}
              className="grid items-center gap-1 px-1 py-0.5"
              style={{ gridTemplateColumns: "2rem 1fr 1fr" }}
            >
              <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                {row.number}.
              </span>
              <ReviewMoveCell
                move={row.white}
                viewPly={viewPly}
                onSeek={onSeek}
                activeRef={activeRef}
              />
              <ReviewMoveCell
                move={row.black}
                viewPly={viewPly}
                onSeek={onSeek}
                activeRef={activeRef}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface ReviewMoveCellProps {
  move?: ReviewedMove;
  viewPly: number | null;
  onSeek: (ply: number) => void;
  activeRef: React.RefObject<HTMLButtonElement | null>;
}

function ReviewMoveCell({ move, viewPly, onSeek, activeRef }: ReviewMoveCellProps) {
  if (!move) {
    return <span className="text-[color:var(--text-muted)]">…</span>;
  }

  // move.ply is 0-based; viewPly is 1-based (position AFTER the move)
  const isActive = viewPly === move.ply + 1;
  const bg = CLASS_BG[move.moveClass] ?? "transparent";
  const border = CLASS_BORDER[move.moveClass];

  return (
    <button
      ref={isActive ? activeRef : undefined}
      type="button"
      onClick={() => onSeek(move.ply + 1)}
      className={cn(
        "relative flex items-center gap-1.5 rounded-md px-2 py-1 text-left font-mono text-[12px] font-medium transition-colors duration-100",
        isActive
          ? "text-[color:var(--text-primary)]"
          : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
      )}
      style={{
        background: isActive ? (bg !== "transparent" ? bg : "var(--accent-muted)") : bg,
        outline: isActive ? "1px solid var(--accent)" : border ? `1px solid ${border}` : "none",
        outlineOffset: "-1px",
      }}
    >
      <MoveBadge
        type={move.moveClass}
        size={18}
        showTooltip={false}
        className="shrink-0"
      />
      <span className="truncate">{move.notation}</span>
    </button>
  );
}

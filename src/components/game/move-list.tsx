"use client";

import { useEffect, useRef } from "react";

import { moveToNotation } from "@/lib/engine";
import type { Move } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";

interface MoveListProps {
  history: readonly Move[];
  className?: string;
}

export function MoveList({ history, className }: MoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewPly = useGameStore((s) => s.viewPly);
  const hoverPly = useGameStore((s) => s.hoverPly);
  const pinPly = useGameStore((s) => s.pinPly);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length]);

  const rows: Array<{
    number: number;
    white?: Move;
    black?: Move;
    whitePly?: number;
    blackPly?: number;
  }> = [];

  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      number: i / 2 + 1,
      white: history[i],
      whitePly: i + 1,
      black: history[i + 1],
      blackPly: history[i + 1] ? i + 2 : undefined,
    });
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex h-full flex-col overflow-y-auto rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)]",
        className
      )}
      onMouseLeave={() => hoverPly(null)}
    >
      <div className="sticky top-0 z-10 border-b border-[color:var(--border-base)] bg-[color:var(--bg-surface)]/95 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)] backdrop-blur">
        Ходы
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
          Партия еще не началась. Сделай первый ход - белые ходят первыми.
        </div>
      ) : (
        <ol className="flex-1 px-1 py-1">
          {rows.map((row) => (
            <li
              key={row.number}
              className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2 rounded px-2 py-1 text-[13px]"
            >
              <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                {row.number}.
              </span>
              <MoveCell
                move={row.white}
                ply={row.whitePly}
                active={viewPly === row.whitePly}
                onHover={hoverPly}
                onPin={pinPly}
              />
              <MoveCell
                move={row.black}
                ply={row.blackPly}
                active={viewPly === row.blackPly}
                onHover={hoverPly}
                onPin={pinPly}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface MoveCellProps {
  move?: Move;
  ply?: number;
  active: boolean;
  onHover: (ply: number | null) => void;
  onPin: (ply: number) => void;
}

function MoveCell({ move, ply, active, onHover, onPin }: MoveCellProps) {
  if (!move || ply === undefined) {
    return <span className="text-[color:var(--text-muted)]">...</span>;
  }

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(ply)}
      onClick={() => onPin(ply)}
      className={cn(
        "rounded-md px-2 py-0.5 text-left font-mono font-medium transition-colors duration-150",
        active
          ? "bg-[color:var(--accent-muted)] text-[color:var(--text-primary)] outline outline-1 outline-[color:var(--accent)]/40"
          : "text-[color:var(--text-primary)] hover:bg-[color:var(--bg-elevated)]"
      )}
    >
      {moveToNotation(move)}
    </button>
  );
}

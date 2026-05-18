"use client";

import { useMemo } from "react";

import type { ReviewedMove } from "@/lib/engine-ai/review/index";
import { cn } from "@/lib/utils";

interface EvalGraphProps {
  moves: readonly ReviewedMove[];
  /** Currently viewed ply (1-based). 0 = start, undefined = not set. */
  viewPly?: number | null;
  onSeek?: (ply: number) => void;
  className?: string;
}

const CLASS_COLOR: Record<string, string> = {
  brilliant: "#4FC3F7",
  great: "#66BB6A",
  best: "#7CB342",
  excellent: "#9CCC65",
  good: "#B0BEC5",
  book: "#8D6E63",
  inaccuracy: "#FFB300",
  mistake: "#FB8C00",
  blunder: "#E53935",
  miss: "#C62828",
};

const W = 560;
const H = 100;
const PAD_X = 6;
const PAD_Y = 8;

export function EvalGraph({ moves, viewPly, onSeek, className }: EvalGraphProps) {
  // Build an array of win-probability values at each move boundary (including start at 0.5)
  const points = useMemo(() => {
    const pts: number[] = [0.5];
    for (const m of moves) {
      pts.push(m.wpAfter);
    }
    return pts;
  }, [moves]);

  if (points.length < 2) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] text-xs text-[color:var(--text-muted)]",
          className
        )}
        style={{ height: H + PAD_Y * 2 }}
      >
        Граф оценки появится после анализа
      </div>
    );
  }

  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const n = points.length;

  function px(i: number) {
    return PAD_X + (i / (n - 1)) * innerW;
  }
  function py(wp: number) {
    return PAD_Y + (1 - wp) * innerH;
  }

  // Build smooth SVG path
  const pathD = points
    .map((wp, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)},${py(wp).toFixed(1)}`)
    .join(" ");

  // Area fill path (close at bottom)
  const areaD =
    pathD +
    ` L ${px(n - 1).toFixed(1)},${(PAD_Y + innerH).toFixed(1)} L ${PAD_X},${(PAD_Y + innerH).toFixed(1)} Z`;

  // Current ply indicator position
  const activePly = viewPly != null ? viewPly : n - 1;
  const activePct = Math.max(0, Math.min(activePly, n - 1));
  const indicatorX = px(activePct);

  // Dot at current ply
  const dotWp = points[Math.min(activePly, points.length - 1)];

  return (
    <div
      className={cn(
        "relative select-none overflow-hidden rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)]",
        className
      )}
    >
      <div className="absolute left-3 top-2 text-[10px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        Оценка
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + PAD_Y * 2}`}
        width="100%"
        preserveAspectRatio="none"
        style={{ display: "block", cursor: onSeek ? "crosshair" : "default" }}
        onClick={(e) => {
          if (!onSeek) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / rect.width;
          const ply = Math.round(relX * (n - 1));
          onSeek(Math.max(0, Math.min(ply, n - 1)));
        }}
      >
        <defs>
          <linearGradient id="evalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9A227" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#C9A227" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* 50% baseline */}
        <line
          x1={PAD_X}
          y1={PAD_Y + innerH / 2}
          x2={W - PAD_X}
          y2={PAD_Y + innerH / 2}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Area fill */}
        <path d={areaD} fill="url(#evalGradient)" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Blunder/mistake dots */}
        {moves.map((m, i) => {
          const c = CLASS_COLOR[m.moveClass];
          if (!c || (m.moveClass !== "blunder" && m.moveClass !== "mistake" && m.moveClass !== "miss")) return null;
          return (
            <circle
              key={i}
              cx={px(i + 1)}
              cy={py(points[i + 1])}
              r={3}
              fill={c}
              opacity={0.9}
            />
          );
        })}

        {/* Current ply vertical line */}
        <line
          x1={indicatorX}
          y1={PAD_Y}
          x2={indicatorX}
          y2={PAD_Y + innerH}
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1"
        />

        {/* Current ply dot */}
        <circle
          cx={indicatorX}
          cy={py(dotWp ?? 0.5)}
          r={4}
          fill="white"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

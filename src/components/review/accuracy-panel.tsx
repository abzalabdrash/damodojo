"use client";

import type { SideStats } from "@/lib/engine-ai/review/accuracy";
import { cn } from "@/lib/utils";

interface AccuracyPanelProps {
  white: SideStats | null;
  black: SideStats | null;
  loading?: boolean;
  className?: string;
}

export function AccuracyPanel({ white, black, loading, className }: AccuracyPanelProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)]",
        className
      )}
    >
      <div className="border-b border-[color:var(--border-base)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        Точность
      </div>

      <div className="grid grid-cols-2 divide-x divide-[color:var(--border-base)]">
        <SidePanel label="Белые" stats={white} loading={loading} />
        <SidePanel label="Чёрные" stats={black} loading={loading} />
      </div>
    </div>
  );
}

function SidePanel({
  label,
  stats,
  loading,
}: {
  label: string;
  stats: SideStats | null;
  loading?: boolean;
}) {
  const acc = stats?.accuracy ?? null;
  const accColor =
    acc === null
      ? "var(--text-muted)"
      : acc >= 90
        ? "var(--success)"
        : acc >= 75
          ? "var(--accent)"
          : acc >= 60
            ? "var(--warning)"
            : "var(--danger)";

  return (
    <div className="flex flex-col gap-1.5 px-3 py-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        {label}
      </span>

      {loading ? (
        <div className="h-8 w-12 animate-pulse rounded-md bg-[color:var(--bg-elevated)]" />
      ) : (
        <span
          className="font-display text-3xl font-medium leading-none"
          style={{ color: accColor }}
        >
          {acc !== null ? `${Math.round(acc)}%` : "—"}
        </span>
      )}

      {stats && (
        <div className="mt-1 flex flex-col gap-0.5">
          <StatRow label="Лучших" value={stats.best + stats.excellent + stats.brilliant + stats.great} color="var(--success)" />
          <StatRow label="Хороших" value={stats.good} color="var(--text-secondary)" />
          <StatRow label="Неточностей" value={stats.inaccuracy} color="var(--accent)" />
          <StatRow label="Ошибок" value={stats.mistake} color="var(--warning)" />
          <StatRow label="Зевков" value={stats.blunder + stats.miss} color="var(--danger)" />
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-[color:var(--text-muted)]">{label}</span>
      <span className="font-mono font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

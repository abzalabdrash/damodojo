"use client";

import { cn } from "@/lib/utils";

interface PlayerStripProps {
  name: string;
  rating?: number;
  /** "w" for the white/light side, "b" for the dark side. */
  side: "w" | "b";
  /** Is this player to move right now? */
  active: boolean;
  /** Pieces this player has captured from the opponent. */
  capturedCount: number;
  /** Time control display (e.g. "5:00" or "—"). */
  clock?: string;
  /** Optional avatar URL or initial. */
  avatarInitial?: string;
  /** Network lag in ms for the lag indicator dot (online only). */
  lagMs?: number;
  /** Extra class names for the root container. */
  className?: string;
}

export function PlayerStrip({
  name,
  rating,
  side,
  active,
  capturedCount,
  clock = "—",
  avatarInitial,
  lagMs,
  className,
}: PlayerStripProps) {
  const initial = avatarInitial ?? name[0]?.toUpperCase() ?? "?";
  const lagColor =
    lagMs === undefined
      ? null
      : lagMs < 100
        ? "bg-green-400"
        : lagMs < 250
          ? "bg-yellow-400"
          : "bg-red-400";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border bg-[color:var(--bg-surface)] px-3 py-2",
        active
          ? "border-[color:var(--accent)]/70"
          : "border-[color:var(--border-base)]",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-display font-semibold",
            active ? "ring-2 ring-[color:var(--accent)] ring-offset-2 ring-offset-[color:var(--bg-surface)]" : ""
          )}
          style={{
            background: side === "w" ? "#EDE3D0" : "#1F1A14",
            color: side === "w" ? "#1F1A14" : "#EDE3D0",
            border: side === "w" ? "1.5px solid #B89B6A" : "1.5px solid #4A3E2D",
          }}
        >
          {initial}
        </div>

        <div className="flex flex-col leading-tight">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-[color:var(--text-primary)]">
              {name}
            </span>
            {typeof rating === "number" && (
              <span className="font-mono text-xs text-[color:var(--text-muted)]">
                ({rating})
              </span>
            )}
            {lagColor && (
              <span
                className={cn("inline-block h-2 w-2 rounded-full", lagColor)}
                title={`Ping: ~${lagMs}ms`}
              />
            )}
          </div>
          <div className="mt-0.5 flex h-3 items-center gap-1">
            {Array.from({ length: capturedCount }).map((_, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: side === "w" ? "#1F1A14" : "#EDE3D0",
                  border: side === "w" ? "1px solid #4A3E2D" : "1px solid #B89B6A",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "rounded-md px-3 py-1.5 font-mono text-lg font-semibold tabular-nums",
          active
            ? "bg-[color:var(--bg-elevated)] text-[color:var(--text-primary)]"
            : "bg-transparent text-[color:var(--text-muted)]"
        )}
      >
        {clock}
      </div>
    </div>
  );
}

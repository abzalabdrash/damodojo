"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export type CellHint =
  | "none"
  | "selected"
  | "possible-move"
  | "possible-capture"
  | "last-from"
  | "last-to"
  | "capture-target"
  | "forced-capture"
  | "engine-from"
  | "engine-to"
  | "premove";

interface BoardCellProps {
  row: number;
  col: number;
  /** Visual state for highlights. */
  hint: CellHint;
  /** Show file/rank label in the corner (a-h, 1-8). */
  fileLabel?: string;
  rankLabel?: string;
  /** Is this an interactive (dark) square? Light squares are inert. */
  interactive: boolean;
  /** Click handler. Always defined for dark squares. */
  onClick?: () => void;
}

export function BoardCell({
  row,
  col,
  hint,
  fileLabel,
  rankLabel,
  interactive,
  onClick,
}: BoardCellProps) {
  const isDark = ((row + col) & 1) === 1;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      tabIndex={interactive ? 0 : -1}
      aria-label={`${fileLabel ?? ""}${rankLabel ?? ""}`}
      className={cn(
        "group relative aspect-square overflow-hidden border-0 outline-none p-0",
        interactive ? "cursor-pointer" : "cursor-default",
        "focus-visible:z-10"
      )}
      style={{
        background: isDark
          ? "linear-gradient(155deg, #6C5237 0%, #5C4530 50%, #4A3622 100%)"
          : "linear-gradient(155deg, #E5D1A6 0%, #D6BF95 50%, #BFA379 100%)",
      }}
    >
      {/* Subtle inset shadow for depth in each cell */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: isDark
            ? "inset 0 1px 0 0 rgba(255,220,170,0.06), inset 0 -1px 0 0 rgba(0,0,0,0.35)"
            : "inset 0 1px 0 0 rgba(255,250,235,0.5), inset 0 -1px 0 0 rgba(140,110,70,0.25)",
        }}
      />

      {/* Last-move highlight */}
      {(hint === "last-from" || hint === "last-to") && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22 }}
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(201,162,39,0.42), rgba(201,162,39,0.22))",
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* Selected overlay */}
      {hint === "selected" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(100% 100% at 50% 50%, rgba(201,162,39,0.55) 0%, rgba(201,162,39,0.18) 80%)",
            boxShadow: "inset 0 0 0 3px var(--accent), inset 0 0 18px 0 rgba(201,162,39,0.45)",
          }}
        />
      )}

      {/* Capture target — square holding an enemy that we will capture */}
      {hint === "capture-target" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(100% 100% at 50% 50%, rgba(184,92,80,0.5) 0%, rgba(184,92,80,0.18) 80%)",
            boxShadow: "inset 0 0 0 2.5px var(--danger)",
          }}
        />
      )}

      {/* Mandatory capture source — visible before a piece is selected. */}
      {hint === "forced-capture" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: [0.72, 1, 0.72], scale: 1 }}
          transition={{
            opacity: { duration: 1.45, repeat: Infinity, ease: "easeInOut" },
            scale: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
          }}
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 90% at 50% 50%, rgba(184,92,80,0.26) 0%, rgba(184,92,80,0.06) 72%)",
            boxShadow:
              "inset 0 0 0 3px rgba(184,92,80,0.85), inset 0 0 20px 0 rgba(184,92,80,0.38)",
          }}
        />
      )}

      {/* Premove highlight */}
      {(hint === "premove" || hint === "engine-from" || hint === "engine-to") && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              hint === "engine-to"
                ? "linear-gradient(135deg, rgba(96,165,250,0.44), rgba(96,165,250,0.18))"
                : "linear-gradient(135deg, rgba(216,155,78,0.4), rgba(216,155,78,0.2))",
            boxShadow:
              hint === "engine-to"
                ? "inset 0 0 0 2px #60A5FA"
                : "inset 0 0 0 2px #D89B4E",
          }}
        />
      )}

      {/* Coordinate labels (algebraic) */}
      {fileLabel && (
        <span
          className="pointer-events-none absolute bottom-[3%] right-[6%] font-mono text-[10px] font-medium opacity-70"
          style={{
            color: isDark ? "#E5D1A6" : "#5C4530",
            textShadow: isDark
              ? "0 1px 1px rgba(0,0,0,0.5)"
              : "0 1px 0 rgba(255,255,255,0.4)",
          }}
        >
          {fileLabel}
        </span>
      )}
      {rankLabel && (
        <span
          className="pointer-events-none absolute top-[3%] left-[6%] font-mono text-[10px] font-medium opacity-70"
          style={{
            color: isDark ? "#E5D1A6" : "#5C4530",
            textShadow: isDark
              ? "0 1px 1px rgba(0,0,0,0.5)"
              : "0 1px 0 rgba(255,255,255,0.4)",
          }}
        >
          {rankLabel}
        </span>
      )}

      {/* Possible-move dot (centered) */}
      {hint === "possible-move" && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute left-1/2 top-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(201,162,39,0.7) 0%, rgba(201,162,39,0.35) 70%)",
            boxShadow: "0 2px 6px rgba(201,162,39,0.45)",
          }}
        />
      )}

      {/* Possible-capture ring (landing square of a multi-jump) */}
      {hint === "possible-capture" && (
        <motion.span
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute inset-[10%] rounded-full"
          style={{
            boxShadow:
              "inset 0 0 0 4px rgba(184,92,80,0.65), inset 0 0 12px 0 rgba(184,92,80,0.32)",
          }}
        />
      )}

      {/* Hover lift (interactive only) */}
      {interactive && (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ background: "rgba(255,255,255,0.06)" }}
        />
      )}
    </button>
  );
}

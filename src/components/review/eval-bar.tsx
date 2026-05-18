"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

interface EvalBarProps {
  /** Win probability for white (0..1). 0.5 = equal. */
  wpWhite: number;
  className?: string;
}

/**
 * Vertical eval bar: white at bottom (matches board orientation).
 * White fills from the bottom; black from the top.
 */
export function EvalBar({ wpWhite, className }: EvalBarProps) {
  const clampedWp = Math.max(0.02, Math.min(0.98, wpWhite));
  const whitePct = clampedWp * 100;
  const blackPct = 100 - whitePct;

  const label =
    wpWhite >= 0.98
      ? "+M"
      : wpWhite <= 0.02
        ? "-M"
        : wpWhite >= 0.5
          ? `+${((wpWhite - 0.5) * 2 * 8).toFixed(1)}`
          : `-${((0.5 - wpWhite) * 2 * 8).toFixed(1)}`;

  return (
    <div
      className={cn(
        "relative flex h-full w-5 flex-col overflow-hidden rounded-lg",
        className
      )}
      style={{
        background: "var(--bg-elevated)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
      }}
      aria-label={`Оценка: ${label}`}
      role="meter"
      aria-valuenow={Math.round(wpWhite * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* Black portion — top */}
      <motion.div
        className="w-full flex-shrink-0"
        animate={{ height: `${blackPct}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: "#1F1A14" }}
      />
      {/* White portion — bottom */}
      <motion.div
        className="w-full flex-1"
        animate={{ height: `${whitePct}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: "#EDE3D0" }}
      />

      {/* Score label */}
      <div
        className="pointer-events-none absolute inset-x-0 flex justify-center"
        style={{
          top: wpWhite >= 0.5 ? undefined : "4px",
          bottom: wpWhite >= 0.5 ? "4px" : undefined,
        }}
      >
        <span
          className="rotate-90 whitespace-nowrap font-mono text-[9px] font-bold leading-none"
          style={{ color: wpWhite >= 0.5 ? "#1A1612" : "#F5F1EA" }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

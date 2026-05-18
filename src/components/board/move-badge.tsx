"use client";

import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";

export type MoveClassification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "miss";

interface BadgeStyle {
  bg: string;
  fg: string;
  glyph: string | "book";
  /** Default label in Russian — UI should pass a localized string when possible. */
  defaultLabel: string;
}

const STYLES: Record<MoveClassification, BadgeStyle> = {
  brilliant: {
    bg: "#4FC3F7",
    fg: "#0B2A3C",
    glyph: "!!",
    defaultLabel: "Блестящий!",
  },
  great: {
    bg: "#66BB6A",
    fg: "#0E2913",
    glyph: "★",
    defaultLabel: "Прекрасный",
  },
  best: {
    bg: "#7CB342",
    fg: "#1A2E0A",
    glyph: "✓",
    defaultLabel: "Лучший",
  },
  excellent: {
    bg: "#9CCC65",
    fg: "#1A2E0A",
    glyph: "!",
    defaultLabel: "Отличный",
  },
  good: {
    bg: "#B0BEC5",
    fg: "#1F2933",
    glyph: "•",
    defaultLabel: "Хороший",
  },
  book: {
    bg: "#8D6E63",
    fg: "#F5EFE8",
    glyph: "book",
    defaultLabel: "Книжный",
  },
  inaccuracy: {
    bg: "#FFB300",
    fg: "#2A1A02",
    glyph: "?!",
    defaultLabel: "Неточность",
  },
  mistake: {
    bg: "#FB8C00",
    fg: "#2A1500",
    glyph: "?",
    defaultLabel: "Ошибка",
  },
  blunder: {
    bg: "#E53935",
    fg: "#FFFFFF",
    glyph: "??",
    defaultLabel: "Зевок",
  },
  miss: {
    bg: "#C62828",
    fg: "#FFFFFF",
    glyph: "✕",
    defaultLabel: "Упущенный шанс",
  },
};

interface MoveBadgeProps {
  type: MoveClassification;
  /** Pixel size of the circle. */
  size?: number;
  /** Override label for the tooltip pill. If undefined, no tooltip is shown. */
  label?: string;
  /** Show tooltip pill above the badge. Defaults to true when label is set. */
  showTooltip?: boolean;
  className?: string;
}

/**
 * The chess.com-style move classification badge. Pops in with a small spring
 * and shows a tooltip-pill label above. Positioning is the parent's job —
 * commonly absolute-positioned on the top-right of the destination cell.
 */
export function MoveBadge({
  type,
  size = 28,
  label,
  showTooltip,
  className,
}: MoveBadgeProps) {
  const style = STYLES[type];
  const displayLabel = label ?? style.defaultLabel;
  const tooltipVisible = showTooltip ?? Boolean(label);

  const fontSize = Math.max(11, Math.round(size * 0.46));
  const glyphIsLong = typeof style.glyph === "string" && style.glyph.length >= 2;

  return (
    <div
      className={cn("relative pointer-events-none", className)}
      style={{ width: size, height: size }}
      aria-label={displayLabel}
      role="img"
    >
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.18, 1], opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 flex items-center justify-center rounded-full font-display font-bold"
        style={{
          background: style.bg,
          color: style.fg,
          fontSize: glyphIsLong ? Math.round(fontSize * 0.85) : fontSize,
          letterSpacing: glyphIsLong ? "-0.06em" : 0,
          boxShadow: `0 4px 12px -2px ${style.bg}80, 0 0 0 2px var(--bg-page)`,
        }}
      >
        {style.glyph === "book" ? (
          <BookOpen
            size={Math.round(size * 0.55)}
            strokeWidth={2.25}
            style={{ color: style.fg }}
          />
        ) : (
          style.glyph
        )}
      </motion.div>

      {tooltipVisible && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.12, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold"
          style={{
            bottom: `calc(100% + 4px)`,
            background: style.bg,
            color: style.fg,
            boxShadow: `0 6px 16px -4px rgba(0,0,0,0.35)`,
          }}
        >
          {displayLabel}
        </motion.div>
      )}
    </div>
  );
}

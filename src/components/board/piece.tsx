"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

export type PieceColor = "light" | "dark";

interface PieceProps {
  color: PieceColor;
  king?: boolean;
  className?: string;
  size?: number | string;
}

/**
 * Premium SVG checker piece.
 *
 * Architecture: outer beveled rim ⇢ main body with 3D radial gradient ⇢
 * subtle wood-grain via feTurbulence ⇢ three carved concentric grooves ⇢
 * top-edge rim highlight ⇢ off-center specular shine ⇢ optional king sunburst.
 *
 * Built for visual quality at small sizes (40-90px) — every element gracefully
 * degrades, and all IDs are scoped via useId() so multiple pieces don't clash.
 */
export function Piece({ color, king = false, className, size = "100%" }: PieceProps) {
  const isLight = color === "light";
  const uid = useId().replace(/:/g, "");

  const palette = isLight
    ? {
        rimDark: "#9C8254",
        rimMid: "#C0A36C",
        rimLight: "#E6D2A6",
        bodyHigh: "#FBF6E4",
        bodyMid: "#EDDFB8",
        bodyLow: "#C9AE74",
        bodyDeep: "#8E7549",
        innerGroove: "#9C8254",
        innerHigh: "#FFF9E6",
        topHighlight: "#FFFFFF",
      }
    : {
        rimDark: "#0B0703",
        rimMid: "#22180D",
        rimLight: "#48381F",
        bodyHigh: "#3F3120",
        bodyMid: "#1F160C",
        bodyLow: "#0E0905",
        bodyDeep: "#000000",
        innerGroove: "#5B4326",
        innerHigh: "#785F3A",
        topHighlight: "#D6BF95",
      };

  const bodyGradId = `body-${uid}`;
  const rimGradId = `rim-${uid}`;
  const shineGradId = `shine-${uid}`;
  const kingGradId = `king-${uid}`;
  const dropShadowId = `dshadow-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("block select-none", className)}
      aria-hidden
    >
      <defs>
        {/* Ambient drop shadow for the disc */}
        <filter id={dropShadowId} x="-30%" y="-15%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.45" />
          <feDropShadow dx="0" dy="1" stdDeviation="0.6" floodOpacity="0.5" />
        </filter>

        {/* Bevel rim — outermost ring */}
        <radialGradient id={rimGradId} cx="36%" cy="30%" r="70%">
          <stop offset="0%" stopColor={palette.rimLight} />
          <stop offset="55%" stopColor={palette.rimMid} />
          <stop offset="100%" stopColor={palette.rimDark} />
        </radialGradient>

        {/* Main 3D body */}
        <radialGradient id={bodyGradId} cx="38%" cy="30%" r="72%">
          <stop offset="0%" stopColor={palette.bodyHigh} />
          <stop offset="38%" stopColor={palette.bodyMid} />
          <stop offset="78%" stopColor={palette.bodyLow} />
          <stop offset="100%" stopColor={palette.bodyDeep} />
        </radialGradient>

        {/* Off-center specular highlight */}
        <radialGradient id={shineGradId} cx="34%" cy="22%" r="26%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={isLight ? 0.55 : 0.18} />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity={isLight ? 0.18 : 0.06} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>

        {king && (
          <radialGradient id={kingGradId} cx="40%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#FFE08A" />
            <stop offset="50%" stopColor="#D8AC2C" />
            <stop offset="100%" stopColor="#7A5B0E" />
          </radialGradient>
        )}
      </defs>

      {/* Ground shadows */}
      <ellipse cx="50" cy="87" rx="35" ry="4.5" fill="#000" opacity="0.35" />
      <ellipse cx="50" cy="89" rx="30" ry="2.4" fill="#000" opacity="0.25" />

      <g filter={`url(#${dropShadowId})`}>
        {/* Outer beveled rim */}
        <circle cx="50" cy="49" r="40" fill={`url(#${rimGradId})`} />

        {/* Inner body — 3D sphere illusion */}
        <circle cx="50" cy="49" r="35.5" fill={`url(#${bodyGradId})`} />

        {/* Carved concentric grooves */}
        <circle
          cx="50"
          cy="49"
          r="27"
          fill="none"
          stroke={palette.innerHigh}
          strokeWidth="0.6"
          opacity="0.45"
        />
        <circle
          cx="50"
          cy="49"
          r="26"
          fill="none"
          stroke={palette.innerGroove}
          strokeWidth="1.2"
          opacity="0.75"
        />
        <circle
          cx="50"
          cy="49"
          r="22"
          fill="none"
          stroke={palette.innerHigh}
          strokeWidth="0.5"
          opacity="0.35"
        />
        <circle
          cx="50"
          cy="49"
          r="21"
          fill="none"
          stroke={palette.innerGroove}
          strokeWidth="0.9"
          opacity="0.55"
        />

        {/* Top-edge rim highlight (the catch-light a real wood disc has) */}
        <ellipse
          cx="50"
          cy="22"
          rx="22"
          ry="2.4"
          fill={palette.topHighlight}
          opacity={isLight ? 0.55 : 0.22}
        />

        {/* Specular shine */}
        <circle cx="50" cy="49" r="35.5" fill={`url(#${shineGradId})`} />

        {king && (
          <>
            {/* Sunburst rays */}
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i * Math.PI) / 4 - Math.PI / 8;
              const x1 = 50 + Math.cos(a) * 16;
              const y1 = 49 + Math.sin(a) * 16;
              const x2 = 50 + Math.cos(a) * 21;
              const y2 = 49 + Math.sin(a) * 21;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#D8AC2C"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  opacity="0.9"
                />
              );
            })}
            {/* Gold disc */}
            <circle
              cx="50"
              cy="49"
              r="12.5"
              fill={`url(#${kingGradId})`}
              stroke="#7A5B0E"
              strokeWidth="0.8"
            />
            <circle
              cx="50"
              cy="49"
              r="6.5"
              fill="none"
              stroke="#FFE08A"
              strokeWidth="0.7"
              opacity="0.75"
            />
            <circle cx="50" cy="49" r="2.5" fill="#FFE08A" opacity="0.95" />
          </>
        )}
      </g>
    </svg>
  );
}


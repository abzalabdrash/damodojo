"use client";

import { useEffect, useRef, useState } from "react";
import type { ClockState } from "@/lib/realtime/protocol";
import type { Color } from "@/lib/engine";

export function useLiveClock(clock: ClockState | null, gameActive: boolean) {
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameActive || !clock) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    function frame() {
      setTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [gameActive, clock]);

  function msFor(color: Color): number {
    if (!clock) return 0;
    const base = color === "w" ? clock.wMs : clock.bMs;
    if (!gameActive || clock.lastTickServerMs === 0) return base;
    if (clock.turn !== color) return base;
    const elapsed = Math.max(0, Date.now() - clock.lastTickServerMs);
    return Math.max(0, base - elapsed);
  }

  return { msFor };
}

export function formatClock(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (ms < 10_000) {
    // Show tenths under 10 seconds
    const tenths = Math.floor((ms % 1000) / 100);
    return `${min}:${String(sec).padStart(2, "0")}.${tenths}`;
  }
  return `${min}:${String(sec).padStart(2, "0")}`;
}

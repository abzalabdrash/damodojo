"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";

// Auto-repeat tuning: first repeat fires after AUTO_REPEAT_DELAY, then every
// AUTO_REPEAT_INTERVAL ms. ~12 plies/sec — gives the satisfying "tick-tick-
// tick" the user asked for when scrubbing through a finished game.
const AUTO_REPEAT_DELAY = 280;
const AUTO_REPEAT_INTERVAL = 80;

interface ReplayControlsProps {
  className?: string;
}

export function ReplayControls({ className }: ReplayControlsProps) {
  const viewPly = useGameStore((s) => s.viewPly);
  const historyLen = useGameStore((s) => s.game.history.length);
  const pinPly = useGameStore((s) => s.pinPly);
  const goToLive = useGameStore((s) => s.goToLive);
  const viewStepBack = useGameStore((s) => s.viewStepBack);
  const viewStepForward = useGameStore((s) => s.viewStepForward);
  const history = useGameStore((s) => s.game.history);

  const isLive = viewPly === null;
  const displayPly = viewPly ?? historyLen;
  const atStart = displayPly === 0;
  const atEnd = isLive;

  /**
   * Pick a sound that matches the move you're scrubbing to: capture > promote
   * > regular click. When jumping to start / end we just use a soft click.
   *
   * "direction" tells us which move was just stepped over: -1 means we just
   * moved BACK over the move at index `displayPly` (the one we just left),
   * +1 means we just moved FORWARD over the move now at index `displayPly-1`.
   */
  const playStepSound = useCallback(
    (direction: -1 | 1, plyAfterStep: number) => {
      const moveIdx = direction === -1 ? plyAfterStep : plyAfterStep - 1;
      const move = history[moveIdx];
      if (!move) {
        playSound("click");
        return;
      }
      if (move.captures.length > 0) playSound("capture");
      else if (move.promoted) playSound("promote");
      else playSound("move");
    },
    [history],
  );

  // Wrap the navigation actions to play a sound on every step. We compute the
  // resulting ply BEFORE the store mutation so the click never lags behind.
  const stepBackWithSound = useCallback(() => {
    const live = historyLen;
    const current = viewPly ?? live;
    if (current === 0) return;
    playStepSound(-1, current);
    viewStepBack();
  }, [historyLen, viewPly, viewStepBack, playStepSound]);

  const stepForwardWithSound = useCallback(() => {
    const live = historyLen;
    const current = viewPly ?? live;
    if (current === live) return;
    playStepSound(1, current + 1);
    viewStepForward();
  }, [historyLen, viewPly, viewStepForward, playStepSound]);

  const jumpStartWithSound = useCallback(() => {
    if (displayPly === 0) return;
    playSound("click");
    pinPly(0);
  }, [displayPly, pinPly]);

  const jumpLiveWithSound = useCallback(() => {
    if (isLive) return;
    playSound("click");
    goToLive();
  }, [isLive, goToLive]);

  // Keyboard navigation. We rely on the browser's native key auto-repeat —
  // each repeat fires another `keydown` event, so the wrapped handler plays
  // a sound and steps once per tick.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          stepBackWithSound();
          break;
        case "ArrowRight":
          e.preventDefault();
          stepForwardWithSound();
          break;
        case "ArrowUp":
          e.preventDefault();
          if (!e.repeat) jumpStartWithSound();
          break;
        case "ArrowDown":
        case "Escape":
          e.preventDefault();
          if (!e.repeat) jumpLiveWithSound();
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    stepBackWithSound,
    stepForwardWithSound,
    jumpStartWithSound,
    jumpLiveWithSound,
  ]);

  // Pointer auto-repeat: hold a step button and the action fires every
  // AUTO_REPEAT_INTERVAL ms after a brief AUTO_REPEAT_DELAY warm-up.
  // Used only by the two single-step buttons (back / forward).
  const repeatStateRef = useRef<{
    timeout: ReturnType<typeof setTimeout> | null;
    interval: ReturnType<typeof setInterval> | null;
  }>({ timeout: null, interval: null });

  const stopRepeat = useCallback(() => {
    const s = repeatStateRef.current;
    if (s.timeout) {
      clearTimeout(s.timeout);
      s.timeout = null;
    }
    if (s.interval) {
      clearInterval(s.interval);
      s.interval = null;
    }
  }, []);

  useEffect(() => stopRepeat, [stopRepeat]);

  const startRepeat = useCallback(
    (action: () => void) => {
      stopRepeat();
      // First firing already happened on pointerdown; schedule subsequent.
      const s = repeatStateRef.current;
      s.timeout = setTimeout(() => {
        s.interval = setInterval(action, AUTO_REPEAT_INTERVAL);
      }, AUTO_REPEAT_DELAY);
    },
    [stopRepeat],
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-[color:var(--border-base)] bg-[color:var(--bg-surface)] p-2",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2 text-[12px]">
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full",
              isLive
                ? "bg-[color:var(--success)]/20 text-[color:var(--success)]"
                : "bg-[color:var(--accent-muted)] text-[color:var(--accent)]"
            )}
          >
            <Eye className="h-3 w-3" strokeWidth={2} />
          </span>
          <span className="truncate text-[color:var(--text-secondary)]">
            {isLive ? "Текущая позиция" : `Ход ${displayPly} из ${historyLen}`}
          </span>
        </div>

        {!isLive && (
          <button
            type="button"
            onClick={goToLive}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium text-[color:var(--accent)] hover:bg-[color:var(--accent-muted)]"
          >
            К текущему
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={jumpStartWithSound}
          disabled={atStart}
          title="К началу (ArrowUp)"
          className="h-9 justify-center"
        >
          <ChevronsLeft className="h-4 w-4" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={stepBackWithSound}
          onPointerDown={() => startRepeat(stepBackWithSound)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
          disabled={atStart}
          title="Назад (ArrowLeft)"
          className="h-9 justify-center"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={stepForwardWithSound}
          onPointerDown={() => startRepeat(stepForwardWithSound)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
          disabled={atEnd}
          title="Вперед (ArrowRight)"
          className="h-9 justify-center"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={jumpLiveWithSound}
          disabled={atEnd}
          title="К текущему (ArrowDown)"
          className="h-9 justify-center"
        >
          <ChevronsRight className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}

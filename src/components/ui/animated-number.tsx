"use client";

/**
 * AnimatedNumber — count-up display.
 *
 * Animates an integer from 0 (or the previous value) up to `value` over
 * `durationMs`. Used in the end-game modal to make the review stats land
 * dramatically instead of popping in. Hand-rolled with rAF rather than a
 * library so we control the easing and avoid any framer-motion mounting
 * jitter inside the modal.
 */

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  durationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedNumber({
  value,
  durationMs = 700,
  className,
  style,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const targetRef = useRef(value);

  useEffect(() => {
    // Each time the target changes, animate from the currently shown
    // number to the new target. That keeps re-renders smooth if the value
    // updates more than once.
    fromRef.current = display;
    targetRef.current = value;

    const startedAt = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out cubic — fast at the start, settles in.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(
        fromRef.current + (targetRef.current - fromRef.current) * eased,
      );
      setDisplay(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // We intentionally exclude `display` so that retargeting only happens
    // when `value` itself changes, not on every animation tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span className={className} style={style}>
      {display}
    </span>
  );
}

import type { Color } from "../src/lib/engine";
import type { ClockState } from "./protocol";

export const TIME_CONTROLS: Record<string, { initialMs: number; incrementMs: number }> = {
  "3+0": { initialMs: 3 * 60 * 1000, incrementMs: 0 },
  "5+3": { initialMs: 5 * 60 * 1000, incrementMs: 3 * 1000 },
  "10+0": { initialMs: 10 * 60 * 1000, incrementMs: 0 },
};

export const DEFAULT_TIME_CONTROL = "3+0";
export const MAX_LAG_COMPENSATION_MS = 200;
const LOW_TIME_MS = 10_000;

export function createClock(timeControl: string = DEFAULT_TIME_CONTROL): ClockState {
  const tc = TIME_CONTROLS[timeControl] ?? TIME_CONTROLS[DEFAULT_TIME_CONTROL];
  return {
    wMs: tc.initialMs,
    bMs: tc.initialMs,
    increment: tc.incrementMs,
    lastTickServerMs: 0,
    turn: "w",
  };
}

export function clockApplyMove(
  clock: ClockState,
  mover: Color,
  serverNow: number,
  lagMs: number
): ClockState {
  if (clock.lastTickServerMs === 0) {
    // First move — just start the clock, no time deducted
    return {
      ...clock,
      turn: mover === "w" ? "b" : "w",
      lastTickServerMs: serverNow,
    };
  }

  const compensation = Math.min(lagMs, MAX_LAG_COMPENSATION_MS);
  const elapsed = Math.max(0, serverNow - clock.lastTickServerMs - compensation);
  const key = mover === "w" ? "wMs" : "bMs";
  const newMs = Math.max(0, clock[key] - elapsed) + clock.increment;

  return {
    ...clock,
    [key]: newMs,
    turn: mover === "w" ? "b" : "w",
    lastTickServerMs: serverNow,
  };
}

export function clockTick(clock: ClockState, serverNow: number): ClockState {
  if (clock.lastTickServerMs === 0) return clock;
  const key = clock.turn === "w" ? "wMs" : "bMs";
  const elapsed = Math.max(0, serverNow - clock.lastTickServerMs);
  return {
    ...clock,
    [key]: Math.max(0, clock[key] - elapsed),
    lastTickServerMs: serverNow,
  };
}

export function isFlaged(clock: ClockState): Color | null {
  if (clock.wMs <= 0) return "w";
  if (clock.bMs <= 0) return "b";
  return null;
}

export function isLowTime(clock: ClockState, color: Color): boolean {
  const ms = color === "w" ? clock.wMs : clock.bMs;
  return ms <= LOW_TIME_MS && ms > 0;
}

export function clockMs(clock: ClockState, color: Color): number {
  return color === "w" ? clock.wMs : clock.bMs;
}

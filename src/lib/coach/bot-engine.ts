import type { BotId } from "./bot-dialogue";
import type { Move } from "@/lib/engine";

export interface BotEngineProfile {
  maxDepth: number;
  timeMs: number;
  blunderPct: number;
  thinkDelayRange: [number, number];
}

const BOT_ENGINE_PROFILES: Record<BotId, BotEngineProfile> = {
  kanat: {
    maxDepth: 5,
    timeMs: 500,
    blunderPct: 18,
    thinkDelayRange: [200, 500],
  },
  zhanar: {
    maxDepth: 7,
    timeMs: 1000,
    blunderPct: 7,
    thinkDelayRange: [300, 800],
  },
  temir: {
    maxDepth: 8,
    timeMs: 1500,
    blunderPct: 4,
    thinkDelayRange: [500, 1200],
  },
  aigerim: {
    maxDepth: 11,
    timeMs: 2500,
    blunderPct: 1,
    thinkDelayRange: [800, 2000],
  },
  talgat: {
    maxDepth: 13,
    timeMs: 3000,
    blunderPct: 0,
    thinkDelayRange: [1200, 3000],
  },
};

export function getBotEngineProfile(id: string): BotEngineProfile {
  const profile = BOT_ENGINE_PROFILES[id as BotId];
  return profile ?? BOT_ENGINE_PROFILES.kanat;
}

export function randomThinkDelay(profile: BotEngineProfile): number {
  const [min, max] = profile.thinkDelayRange;
  return min + Math.random() * (max - min);
}

export function shouldBlunder(profile: BotEngineProfile): boolean {
  return Math.random() * 100 < profile.blunderPct;
}

export function pickBlunderMove(
  legalMoves: readonly Move[],
  bestMove: Move,
): Move | null {
  const others = legalMoves.filter(
    (m) =>
      m.from.row !== bestMove.from.row ||
      m.from.col !== bestMove.from.col ||
      m.to.row !== bestMove.to.row ||
      m.to.col !== bestMove.to.col,
  );
  if (others.length === 0) return null;
  return others[Math.floor(Math.random() * others.length)];
}

/**
 * Tablebase probe API.
 *
 * The tablebase is built lazily on first probe and cached for the lifetime
 * of the engine worker. Build time is ~1-3 seconds for 3-piece kings-only.
 */

import type { FastState } from "../types";
import { buildTablebase, type TbEntry } from "./build";
import { encodePosition, isTablebaseEligible } from "./positions";

let TB: Map<number, TbEntry> | null = null;
let building = false;

export function ensureTablebaseReady(): void {
  if (TB !== null || building) return;
  building = true;
  TB = buildTablebase();
  building = false;
}

export function probeTablebase(state: FastState): TbEntry | null {
  if (!isTablebaseEligible(state)) return null;
  if (TB === null) ensureTablebaseReady();
  const id = encodePosition(state);
  if (id === null) return null;
  return TB!.get(id) ?? null;
}

/**
 * Convert a tablebase entry into a centipawn search score from the
 * side-to-move's POV. Mates take priority over any heuristic score.
 */
export function tablebaseScore(entry: TbEntry): number {
  if (entry.value === "draw") return 0;
  // Mirror the convention used by terminalScore: 100_000 - ply.
  const mateMagnitude = 100_000 - entry.dtm;
  return entry.value === "win" ? mateMagnitude : -mateMagnitude;
}

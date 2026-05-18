/**
 * Free-tier quota gating.
 *
 * Free accounts get one full game review per calendar day; PRO subscribers
 * have no limit. We don't have a real billing backend yet, so the PRO flag
 * lives in localStorage and the daily counter is per-user-per-day in the
 * same store. This is intentionally simple — once we wire Stripe + Supabase
 * the storage backend swaps, but the public API of this module stays.
 */

// Storage keys are versioned so we can invalidate stale demo state without
// touching user code. Bumping the suffix wipes the existing PRO flag for
// anyone who tested the paywall in an earlier build — the quota gate then
// works as advertised on their next visit.
const PRO_STORAGE_KEY = "damadojo:pro:v2";
const QUOTA_STORAGE_PREFIX = "damadojo:report-quota:v2:";

/** Free tier daily report quota. PRO is unlimited. */
export const FREE_DAILY_REPORT_QUOTA = 1;

/** Today's bucket key: YYYY-MM-DD in the user's local timezone. */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function quotaKey(userKey: string): string {
  return `${QUOTA_STORAGE_PREFIX}${userKey}:${todayKey()}`;
}

/**
 * Whether the current account has the PRO flag set. Defaults to false on
 * the server / in storage-less environments.
 */
export function isPro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PRO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** DEMO ONLY — flip the local PRO flag. Replace with Stripe webhook later. */
export function setProDemo(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(PRO_STORAGE_KEY, "1");
    else window.localStorage.removeItem(PRO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Reports already used today by this user. PRO returns 0 (no tracking) so
 * `remainingReports` always reads as Infinity.
 *
 * `userKey` should be a stable identifier (auth user id, or "guest" for
 * anonymous sessions). Anonymous users still hit the daily cap to keep
 * abuse down.
 */
export function reportsUsedToday(userKey: string): number {
  if (typeof window === "undefined") return 0;
  if (isPro()) return 0;
  try {
    const raw = window.localStorage.getItem(quotaKey(userKey));
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function remainingReportsToday(userKey: string): number {
  if (isPro()) return Number.POSITIVE_INFINITY;
  return Math.max(0, FREE_DAILY_REPORT_QUOTA - reportsUsedToday(userKey));
}

export function canOpenReport(userKey: string): boolean {
  return remainingReportsToday(userKey) > 0;
}

/**
 * Record that the user successfully opened a review today. PRO users are
 * never tracked — their counter would be meaningless and we don't want to
 * write to storage on every review action either.
 */
export function recordReportOpened(userKey: string): void {
  if (typeof window === "undefined") return;
  if (isPro()) return;
  try {
    const key = quotaKey(userKey);
    const used = reportsUsedToday(userKey);
    window.localStorage.setItem(key, String(used + 1));
  } catch {
    /* ignore */
  }
}

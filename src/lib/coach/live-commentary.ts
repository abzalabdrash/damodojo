export interface LiveCommentCadenceInput {
  moveNumber: number;
  isPlayerMove: boolean;
  hadCaptures: boolean;
  lastCommentMoveNumber: number;
  /**
   * When true, the coach is the live trainer (Ата). The trainer should react
   * to every student move so the player feels watched and gets per-move
   * feedback (the user's explicit request: "он должен ВИДЕТЬ КАЖДЫЙ ХОД").
   * When false (bot banter mode), we stay sparse to avoid chatter spam.
   */
  isTrainerMode?: boolean;
}

export function shouldTriggerLiveComment({
  moveNumber,
  isPlayerMove,
  hadCaptures,
  lastCommentMoveNumber,
  isTrainerMode = false,
}: LiveCommentCadenceInput): boolean {
  if (!isPlayerMove) return false;

  // Live trainer (Ата) — fire on EVERY student move starting from move 1.
  // Repetition is prevented downstream via RECENT_COACH memory + cleanup.
  if (isTrainerMode) {
    return moveNumber !== lastCommentMoveNumber;
  }

  // Bot banter — keep the original sparse cadence so opponents don't
  // chatter every move.
  if (moveNumber < 3) return false;
  const movesSinceLastComment = moveNumber - lastCommentMoveNumber;
  if (movesSinceLastComment < 3) return false;
  return hadCaptures || moveNumber % 3 === 0;
}

export function shouldKeepPreviousLiveComment({
  now,
  previousVisibleUntil,
  previousText,
  fallbackText,
}: {
  now: number;
  previousVisibleUntil: number;
  previousText: string;
  fallbackText: string;
}): boolean {
  return Boolean(
    previousText &&
      previousText !== fallbackText &&
      previousText.length > 1 &&
      now < previousVisibleUntil,
  );
}

export function collapseRepeatedLiveComment(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";

  for (let size = 1; size <= Math.floor(compact.length / 2); size++) {
    if (compact.length % size !== 0) continue;
    const unit = compact.slice(0, size).trim();
    if (unit && unit.repeat(compact.length / size) === compact) return unit;
  }

  const sentences = compact.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [compact];
  const deduped: string[] = [];
  for (const sentence of sentences) {
    const cleaned = sentence.trim();
    const last = deduped[deduped.length - 1];
    if (last?.toLowerCase() === cleaned.toLowerCase()) continue;
    deduped.push(cleaned);
  }
  return deduped.join(" ");
}

import type { Move } from "@/lib/engine";
import type { MoveClass } from "@/lib/engine-ai/review/classify";
import type { GameReview, ReviewedMove } from "@/lib/engine-ai/review/index";

export type AtaReviewMode =
  | "post_game_teaser"
  | "move_review"
  | "final_review"
  | "live_hint";

export type AtaTone = "calm" | "strict" | "proud" | "warning";

export type AtaLessonTag =
  | "tempo"
  | "center"
  | "capture"
  | "king"
  | "endgame"
  | "trap"
  | "calculation"
  | "defense";

export interface AtaReviewContext {
  mode: AtaReviewMode;
  moveNumber?: number;
  side?: "white" | "black";
  phase?: "opening" | "middlegame" | "endgame";
  playedMove?: string;
  bestMove?: string;
  bestLine?: string[];
  moveClass?: MoveClass;
  motif?: string;
  lessonTag: AtaLessonTag;
  facts: string[];
  counts?: Partial<Record<MoveClass, number>>;
  result?: "win" | "loss" | "draw";
  confidence: "high" | "medium" | "low";
}

export interface AtaTeaserStat {
  kind: MoveClass;
  label: string;
  value: number;
  tone: "good" | "warn" | "bad";
}

export interface AtaPostGameTeaser {
  result: "win" | "loss" | "draw";
  line: string;
  stats: AtaTeaserStat[];
  ctaLabel: "Отчет о партии";
}

export const ataPostGameTeaserLines: Record<AtaPostGameTeaser["result"], string[]> = {
  win: [
    "Победа есть. Теперь проверим, где ты выиграл расчетом, а где соперник сам помог.",
    "Хорошая работа. В отчете посмотрим, была ли партия чистой.",
  ],
  loss: [
    "Эта партия сложилась не в твою пользу, но в ней есть материал для роста.",
    "Не спеши забывать поражение. Самые полезные уроки часто стоят партии.",
  ],
  draw: [
    "Ничья тоже учит. Посмотрим, где можно было усилить позицию.",
    "Ничья. В отчете найдем момент, где можно было перехватить темп.",
  ],
};

export const ataMoveClassFallbackLines: Record<MoveClass, string[]> = {
  brilliant: [
    "Вот это расчет. Ты не просто взял шашку, ты увидел продолжение.",
    "Сильное решение. Здесь важна была не добыча, а позиция после нее.",
  ],
  great: [
    "Жарайды. Это был ход, который держал всю позицию.",
    "Хорошо. Ты нашел не очевидное, а нужное решение.",
  ],
  best: [
    "Точно. Этот ход сохраняет темп и не дает сопернику лишнего.",
    "Верно. Здесь главное было не торопиться.",
  ],
  excellent: [
    "Аккуратно сыграно. Позиция осталась под контролем.",
    "Хороший порядок ходов. Ты не дал сопернику простой цели.",
  ],
  good: [
    "Нормальное решение. Без лишнего риска.",
    "Ход рабочий. Но в отчете стоит проверить, был ли вариант сильнее.",
  ],
  book: [
    "Теория. Здесь главное понимать идею, а не помнить ход наизусть.",
    "Знакомое начало. Теперь важно не потерять смысл позиции.",
  ],
  inaccuracy: [
    "Немного неточно. Позиция держится, но темп уже стал дороже.",
    "Идея понятна, но можно было поставить соперника перед более трудным выбором.",
  ],
  mistake: [
    "Поспешил. Идея понятна, но порядок ходов подвел.",
    "Здесь ты отдал темп. В шашках это часто дороже шашки.",
  ],
  blunder: [
    "Перед таким ходом всегда спроси: что соперник берет следующим?",
    "Вот это надо видеть до хода. После уже приходится защищаться.",
  ],
  miss: [
    "Соперник дал шанс, но ты прошел мимо.",
    "Здесь был момент наказать ошибку. Такие моменты долго не ждут.",
  ],
};

const CLASS_LABEL: Record<MoveClass, string> = {
  brilliant: "Блестящий",
  great: "Сильный",
  best: "Лучший",
  excellent: "Отличный",
  good: "Хороший",
  book: "Теория",
  inaccuracy: "Неточность",
  mistake: "Ошибка",
  blunder: "Зевок",
  miss: "Упущенный шанс",
};

const CLASS_TONE: Record<MoveClass, AtaTeaserStat["tone"]> = {
  brilliant: "good",
  great: "good",
  best: "good",
  excellent: "good",
  good: "good",
  book: "good",
  inaccuracy: "warn",
  mistake: "warn",
  blunder: "bad",
  miss: "bad",
};

const TEASER_PRIORITY: MoveClass[] = [
  "brilliant",
  "great",
  "best",
  "blunder",
  "mistake",
  "miss",
  "book",
  "excellent",
  "good",
  "inaccuracy",
];

const DEFAULT_TEASER_STATS: AtaTeaserStat[] = [
  { kind: "best", label: CLASS_LABEL.best, value: 0, tone: "good" },
  { kind: "good", label: CLASS_LABEL.good, value: 0, tone: "good" },
  { kind: "book", label: CLASS_LABEL.book, value: 0, tone: "good" },
];

export function buildAtaMoveReviewContext(
  move: ReviewedMove,
  totalMoves: number
): AtaReviewContext {
  const facts = factsForMove(move);
  const bestMove = move.bestMove ? moveToNotation(move.bestMove) : undefined;

  return {
    mode: "move_review",
    moveNumber: move.moveNumber,
    side: move.side,
    phase: phaseOf(move.moveNumber, totalMoves),
    playedMove: move.notation,
    bestMove,
    bestLine: move.bestLine.map(moveToNotation),
    moveClass: move.moveClass,
    motif: move.motif?.motif,
    lessonTag: lessonTagForMove(move),
    facts,
    confidence: confidenceForMove(move, facts),
  };
}

export function buildAtaPostGameTeaser(input: {
  result: AtaPostGameTeaser["result"];
  review?: Pick<GameReview, "stats"> | null;
  side?: "white" | "black";
}): AtaPostGameTeaser {
  const counts = input.review?.stats[input.side ?? "white"] ?? null;

  return {
    result: input.result,
    line: pickFirst(ataPostGameTeaserLines[input.result]),
    stats: counts ? selectAtaTeaserStats(counts) : DEFAULT_TEASER_STATS,
    ctaLabel: "Отчет о партии",
  };
}

export function selectAtaTeaserStats(
  counts: Partial<Record<MoveClass, number>>
): AtaTeaserStat[] {
  const selected = TEASER_PRIORITY
    .map((kind) => ({
      kind,
      label: CLASS_LABEL[kind],
      value: counts[kind] ?? 0,
      tone: CLASS_TONE[kind],
    }))
    .filter((stat) => stat.value > 0)
    .slice(0, 3);

  if (selected.length >= 3) return selected;

  for (const fallback of DEFAULT_TEASER_STATS) {
    if (selected.some((stat) => stat.kind === fallback.kind)) continue;
    selected.push(fallback);
    if (selected.length === 3) break;
  }

  return selected;
}

export function buildAtaCoachUserMessage(context: AtaReviewContext): string {
  return [
    `MODE: ${context.mode}`,
    context.moveNumber !== undefined ? `MOVE_NUMBER: ${context.moveNumber}` : null,
    context.side ? `SIDE: ${context.side}` : null,
    context.phase ? `PHASE: ${context.phase}` : null,
    context.moveClass ? `MOVE_CLASS: ${context.moveClass}` : null,
    context.playedMove ? `PLAYED_MOVE: ${context.playedMove}` : null,
    context.bestMove ? `BEST_MOVE: ${context.bestMove}` : null,
    context.bestLine?.length ? `BEST_LINE: ${context.bestLine.join(", ")}` : null,
    context.motif ? `MOTIF: ${context.motif}` : null,
    `LESSON_TAG: ${context.lessonTag}`,
    `CONFIDENCE: ${context.confidence}`,
    "ENGINE_FACTS:",
    ...context.facts.map((fact) => `- ${fact}`),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function fallbackAtaMoveLine(moveClass: MoveClass): string {
  return pickFirst(ataMoveClassFallbackLines[moveClass]);
}

function phaseOf(moveNumber: number, totalMoves: number): AtaReviewContext["phase"] {
  const ratio = moveNumber / Math.max(totalMoves, 1);
  if (ratio < 0.25) return "opening";
  if (ratio < 0.7) return "middlegame";
  return "endgame";
}

function lessonTagForMove(move: ReviewedMove): AtaLessonTag {
  const motif = move.motif?.motif;
  if (motif === "wrong_capture_route") return "capture";
  if (motif === "lost_long_diagonal") return "king";
  if (motif === "promotion_gift") return "king";
  if (motif === "back_rank_break") return "defense";
  if (motif === "tempo_loss") return "tempo";
  if (move.moveClass === "miss" || move.moveClass === "brilliant" || move.moveClass === "great") {
    return "calculation";
  }
  if (move.moveClass === "blunder" || move.moveClass === "mistake") return "defense";
  return "tempo";
}

function factsForMove(move: ReviewedMove): string[] {
  const facts: string[] = [];

  if (move.motif) {
    if (move.motif.motif === "wrong_capture_route") {
      facts.push("Player chose a weaker capture route than another available option.");
    }
    facts.push(move.motif.description);
  }

  if (move.bestMove) {
    facts.push(`Engine preferred ${moveToNotation(move.bestMove)} in this position.`);
  }

  if (move.bestLine.length > 0) {
    facts.push(`Engine principal line starts: ${move.bestLine.map(moveToNotation).join(", ")}.`);
  }

  if (move.moveClass === "blunder") {
    facts.push("The played move was classified as a blunder by the review engine.");
  } else if (move.moveClass === "mistake") {
    facts.push("The played move was classified as a mistake by the review engine.");
  } else if (move.moveClass === "miss") {
    facts.push("The player missed a chance to punish the opponent's previous mistake.");
  } else if (move.moveClass === "brilliant" || move.moveClass === "great") {
    facts.push("The move was one of the strongest decisions in the position.");
  }

  if (facts.length === 0) {
    facts.push("Engine did not provide a concrete tactical motif for this move.");
  }

  return facts;
}

function confidenceForMove(
  move: ReviewedMove,
  facts: readonly string[]
): AtaReviewContext["confidence"] {
  if (move.motif && move.bestMove) return "high";
  if (move.motif || (move.bestMove && facts.length > 1)) return "medium";
  return "low";
}

function moveToNotation(move: Move): string {
  const sep = move.captures.length > 0 ? "x" : "-";
  return `${squareToNotation(move.from)}${sep}${squareToNotation(move.to)}`;
}

function squareToNotation(square: Move["from"]): string {
  const file = String.fromCharCode(97 + square.col);
  const rank = 8 - square.row;
  return `${file}${rank}`;
}

function pickFirst(lines: readonly string[]): string {
  return lines[0] ?? "";
}

import type { ReviewedMove } from "@/lib/engine-ai/review/index";
import { buildAtaCoachUserMessage, type AtaReviewContext } from "./ata";
import {
  buildBotDialogueSystemPrompt,
  buildBotDialogueUserMessage,
  getBotDialogueProfile,
  isBotId,
  type BotDialogueContext,
  type BotDialogueTrigger,
} from "./bot-dialogue";
import type { Character, Locale } from "./characters";
import {
  VALID_DARK_SQUARES,
  cleanTrainerOutput,
} from "./sanitize";

const BASE_URL = "https://api.featherless.ai/v1";

/**
 * Model tiering on Featherless ($25/mo plan):
 *   TOP   — Qwen2.5-32B — used for the TRAINER (Ата) and post-game REVIEW.
 *           Bigger context window, stronger character adherence. ~700ms TTF.
 *   FAST  — Mistral Nemo 12B — used for BOT banter. Quick & punchy. ~500ms.
 *
 * 70B+ models (Llama 3.3, Qwen 2.5 72B, Hermes-3-70B) are gated on this plan
 * and require HuggingFace OAuth on the Featherless org. If we ever connect
 * that, swap MODEL_TOP to "meta-llama/Llama-3.3-70B-Instruct".
 */
const MODEL_TOP = "Qwen/Qwen2.5-32B-Instruct";
const MODEL_FAST = "mistralai/Mistral-Nemo-Instruct-2407";

export type CoachMode = "trainer-live" | "bot-banter" | "review";

const MOVE_CLASS_TXT: Record<string, { ru: string; en: string; kz: string }> = {
  brilliant: { ru: "блестящий ход", en: "brilliant move", kz: "тамаша жүріс" },
  great: { ru: "отличный ход", en: "great move", kz: "өте жақсы жүріс" },
  best: { ru: "лучший ход", en: "best move", kz: "ең жақсы жүріс" },
  excellent: { ru: "хороший ход", en: "excellent move", kz: "жақсы жүріс" },
  good: { ru: "нормальный ход", en: "good move", kz: "қалыпты жүріс" },
  book: { ru: "теоретический ход", en: "book move", kz: "теориялық жүріс" },
  inaccuracy: { ru: "неточность", en: "inaccuracy", kz: "дәлсіздік" },
  mistake: { ru: "ошибка", en: "mistake", kz: "қателік" },
  blunder: { ru: "грубая ошибка (зевок)", en: "blunder", kz: "өрескел қателік" },
  miss: { ru: "упущенный выигрыш", en: "missed win", kz: "жіберіп алған жеңіс" },
};

const LOCALE_DIRECTIVE: Record<Locale, string> = {
  ru: "ЯЗЫК ОТВЕТА: РУССКИЙ. Допустимо одно-два казахских словечка («балам», «жарайды», «шырагым», «ой бай»). Никакого английского.",
  en: `RESPONSE LANGUAGE: ENGLISH ONLY. This OVERRIDES any prior instruction about Russian or Kazakh. Stay in character but speak English. You may keep ONE short Kazakh word per reply as flavor (e.g. "balam", "zharaidy") — never Russian sentences. Never translate the user's bracket tag — just respond as the coach in English.`,
  kz: `ЖАУАП ТІЛІ: ҚАЗАҚША ҒАНА. Бұл алдыңғы орысша/ағылшынша туралы нұсқауларды АЛМАСТЫРАДЫ. Сипатыңды сақта, бірақ қазақша сөйле. Орысша сөздерді қолданба.`,
};

const PHASE_TXT: Record<"opening" | "middlegame" | "endgame", Record<Locale, string>> = {
  opening: { ru: "дебют", en: "opening", kz: "дебют" },
  middlegame: { ru: "середина", en: "middlegame", kz: "ортаңғы кезең" },
  endgame: { ru: "эндшпиль", en: "endgame", kz: "эндшпиль" },
};

function phaseOf(moveNumber: number, totalMoves: number): keyof typeof PHASE_TXT {
  const ratio = moveNumber / Math.max(totalMoves, 1);
  if (ratio < 0.25) return "opening";
  if (ratio < 0.7) return "middlegame";
  return "endgame";
}

// ─────────────────────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────────────────────

export interface ReviewSituation {
  mode: "review";
  move: ReviewedMove;
  moveNumber: number;
  totalMoves: number;
}

export interface TrainerLiveSituation {
  mode: "trainer-live";
  /** Was the move by the student (player) or the trainer (engine)? */
  bySide: "student" | "trainer";
  /** Move classification (best/good/blunder...) — derived from engine wpDelta. */
  moveClass: ReviewedMove["moveClass"];
  /** Win-probability delta from this move, signed from STUDENT's POV (positive = student improved). */
  wpDelta: number;
  /** Win-probability before / after, both 0..1 from STUDENT's POV. */
  wpBefore?: number;
  wpAfter?: number;
  /** Centipawn eval AFTER the move from STUDENT's POV (positive = student better). */
  evalCp?: number;
  /** Optional motif description (e.g. "missed fork"). */
  motif?: string | null;
  /** Last move notation, e.g. "a3-b4" or "c3:e5". Already validated by engine. */
  lastMoveNotation?: string | null;
  /** Engine's preferred move at the position the student moved FROM. Validated. */
  bestMoveNotation?: string | null;
  /** First few plies of engine's principal variation (already validated notation). */
  bestLineNotation?: readonly string[];
  /** Material counts from engine. */
  studentMen?: number;
  studentKings?: number;
  trainerMen?: number;
  trainerKings?: number;
  /** Positive means the student is ahead in total material; negative means behind. */
  materialBalance?: number;
  positionStatus?: "winning" | "equal" | "worse" | "lost";
  /** Number of legal moves available to each side AFTER the last move. */
  studentMobility?: number;
  trainerMobility?: number;
  /**
   * Rows the most-advanced student MAN still has to cross to promote.
   * 0 = will promote next move, 6 = still on starting rank, `null` =
   * student has no men (only kings or empty). Drives the prompt rule
   * that bans "веди в дамки" advice when promotion is far away.
   */
  studentPromotionDistance?: number | null;
  /** Last 6-8 plies of the game in algebraic notation, e.g. ["1. c3-d4 d6-c5", ...]. */
  recentMovesNotation?: readonly string[];
  /** Recent live coach lines; used to avoid repeating the same advice. */
  recentCoachLines?: readonly string[];
  moveNumber: number;
  totalMoves: number;
}

export interface BotBanterSituation {
  mode: "bot-banter";
  /** What happened — drives which canned/LLM line fits. */
  trigger:
    | "opponent_blunder"
    | "opponent_good"
    | "own_strong"
    | "own_blunder"
    | "low_time"
    | "endgame_pressure";
  moveNumber: number;
  totalMoves: number;
}

export type CoachSituation = ReviewSituation | TrainerLiveSituation | BotBanterSituation;

function buildUserMessage(situation: CoachSituation, locale: Locale): string {
  const phase = PHASE_TXT[phaseOf(situation.moveNumber, situation.totalMoves)][locale];

  if (situation.mode === "review") {
    const { move } = situation;
    const cls = MOVE_CLASS_TXT[move.moveClass]?.[locale] ?? move.moveClass;
    const wpLoss = Math.round(Math.abs(move.wpDelta) * 100);
    const side = move.side === "white" ? (locale === "ru" ? "белые" : locale === "en" ? "white" : "ақтар") : (locale === "ru" ? "чёрные" : locale === "en" ? "black" : "қаралар");
    const motif = move.motif ? `, ${move.motif.description}` : "";
    return `[${phase}: ${side} ${cls}${wpLoss > 0 ? `, -${wpLoss}%` : ""}${motif}]`;
  }

  if (situation.mode === "trainer-live") {
    const cls = MOVE_CLASS_TXT[situation.moveClass]?.[locale] ?? situation.moveClass;
    const actor = situation.bySide === "student"
      ? (locale === "ru" ? "ученик" : locale === "en" ? "the student" : "шәкірт")
      : (locale === "ru" ? "ты (тренер)" : locale === "en" ? "you (the coach)" : "сен (жаттықтырушы)");
    const wpDeltaPct = Math.round(situation.wpDelta * 100);
    const wpBeforePct = situation.wpBefore !== undefined ? Math.round(situation.wpBefore * 100) : null;
    const wpAfterPct = situation.wpAfter !== undefined ? Math.round(situation.wpAfter * 100) : null;
    const evalCp = situation.evalCp;

    const lines: (string | null)[] = [
      `MODE: trainer-live`,
      `MOVE_NUMBER: ${situation.moveNumber}`,
      `PHASE: ${phase}`,
      `WHO_MOVED: ${actor}`,
      `LAST_MOVE: ${situation.lastMoveNotation ?? "unknown"}`,
      `MOVE_CLASS: ${cls}`,
      wpBeforePct !== null && wpAfterPct !== null
        ? `WIN_PROBABILITY: ${wpBeforePct}% -> ${wpAfterPct}% (delta ${wpDeltaPct >= 0 ? "+" : ""}${wpDeltaPct}%, sign of student)`
        : `WIN_PROBABILITY_DELTA: ${wpDeltaPct >= 0 ? "+" : ""}${wpDeltaPct}%`,
      typeof evalCp === "number"
        ? `ENGINE_EVAL: ${evalCp >= 0 ? "+" : ""}${evalCp} centipawns (student POV)`
        : null,
      situation.bestMoveNotation
        ? `ENGINE_BEST_MOVE_AT_PREV_POSITION: ${situation.bestMoveNotation}`
        : null,
      situation.bestLineNotation?.length
        ? `ENGINE_BEST_LINE: ${situation.bestLineNotation.join(" ")}`
        : null,
      situation.motif ? `MOTIF: ${situation.motif}` : null,
      `MATERIAL: student ${situation.studentMen ?? "?"}m+${situation.studentKings ?? "?"}k vs trainer ${situation.trainerMen ?? "?"}m+${situation.trainerKings ?? "?"}k`,
      typeof situation.materialBalance === "number"
        ? `MATERIAL_BALANCE: ${situation.materialBalance > 0 ? "+" : ""}${situation.materialBalance} (student POV)`
        : null,
      situation.positionStatus ? `POSITION_STATUS: ${situation.positionStatus}` : null,
      typeof situation.studentMobility === "number" || typeof situation.trainerMobility === "number"
        ? `MOBILITY: student=${situation.studentMobility ?? "?"} trainer=${situation.trainerMobility ?? "?"}`
        : null,
      // Tells the model whether "веди шашку в дамки" is realistic advice
      // *right now*. yes = at least one student man is ≤2 rows from
      // promotion; no = the closest one is still 3+ rows away.
      typeof situation.studentPromotionDistance === "number"
        ? `PROMOTION_READY: ${situation.studentPromotionDistance <= 2 ? "yes" : "no"} (closest student man is ${situation.studentPromotionDistance} row(s) from king-row)`
        : situation.studentPromotionDistance === null
          ? "PROMOTION_READY: n/a (student has no men, only kings)"
          : null,
      situation.recentMovesNotation?.length
        ? `GAME_PDN_TAIL: ${situation.recentMovesNotation.join(" ")}`
        : null,
      situation.recentCoachLines?.length
        ? `RECENT_COACH (do NOT repeat in any wording):\n- ${situation.recentCoachLines.join("\n- ")}`
        : null,
    ];
    return lines.filter((l): l is string => Boolean(l)).join("\n");
  }

  // bot-banter
  return `[${phase}: ${situation.trigger}]`;
}

function buildSystemPrompt(character: Character, locale: Locale): string {
  // The locale directive is appended LAST and re-stated as the "FINAL OVERRIDE"
  // so the model treats it as the strongest constraint, beating any character
  // persona snippets that mention specific languages.
  const ataLiveRules = character.id === "ata"
    ? [
        "",
        "GAME: This is RUSSIAN DRAUGHTS (русские шашки), 8x8 board, 32 dark squares only. NOT chess.",
        `VALID_DARK_SQUARES (the ONLY squares that can have pieces): ${VALID_DARK_SQUARES.join(" ")}.`,
        "FORBIDDEN TERMS (chess, not draughts): ферзь, король, пешка, слон, ладья, шах, мат, рокировка, пат, en passant, queen, king, pawn, bishop, rook, check, mate, castling.",
        "ALLOWED PIECE TERMS: 'шашка' (man), 'дамка' (king/promoted piece). 'Простая' = man.",
        "",
        "ATA TRAINER RULES:",
        "- Ты — Ата, аксакал, не алгоритм. Тебе дают цифры — ты переводишь их в язык старого мастера.",
        "- Тебе ДАЮТ движковые факты: WIN_PROBABILITY, ENGINE_EVAL, ENGINE_BEST_MOVE, MATERIAL, POSITION_STATUS, PROMOTION_READY, PHASE, GAME_PDN_TAIL. Опирайся ТОЛЬКО на них, но НИКОГДА не упоминай слово «движок», «engine», «анализ», «вариант», «оптимально», «по статистике», «алгоритм», «метрика», «процент».",
        "- НИКОГДА не начинай со штампов: «Ход нормальный, но...», «Ход стандартный, но...», «Необходимо стремиться...», «Следующим ходом продвинь...», «Как предлагает движок...».",
        "- Если в фактах есть LAST_MOVE/BEST_MOVE — можешь называть эти конкретные клетки. БОЛЬШЕ НИКАКИХ КООРДИНАТ не выдумывай. Если хочешь сказать про другую клетку — скажи общо: 'центр', 'фланг', 'бортовая шашка', 'дамочная диагональ', 'тыл'.",
        "- Если MOVE_CLASS = blunder/mistake/inaccuracy/miss — назови это ошибкой по сути и скажи ПОЧЕМУ. Если best/excellent/great/brilliant — коротко подтверди и подскажи следующий шаг. Если good — НЕ начинай с «нормальный, но», лучше с конкретики (что хорошо или что упустил).",
        "- При POSITION_STATUS = worse/lost или MATERIAL_BALANCE отрицательный: НЕ хвали. Скажи прямо: позиция тяжёлая, отстаёшь, нужен план. Без токсичности.",
        "- Стиль речи: короткие тяжёлые фразы, иногда казахское слово («балам», «жарайды», «жаным», «ой бай»). Можно образ из жизни: «как чай в пиалу», «дамка как старший в семье», «шашка в тылу — что джигит без коня».",
        "- Не выдумывай шашки, которых нет в MATERIAL. Не выдумывай взятия, которых нет в LAST_MOVE/BEST_MOVE.",
        "",
        "ЖЁСТКИЕ ЗАПРЕТЫ (нарушение = плохой ответ):",
        "1. Если PROMOTION_READY=no — ЗАПРЕЩЕНО говорить «веди в дамку», «делай дамку», «провести в дамку», «продвигай в дамку», «дамку получишь». Ни одной шашки рядом с краем нет, такой совет физически бесполезен. Говори про материал, темп, размены или план в центре.",
        "2. Если PHASE=opening или middlegame — ЗАПРЕЩЕНО говорить «играй в эндшпиле», «думай об эндшпиле», «к эндшпилю». Партия ещё в дебюте/миттельшпиле, такой совет преждевременный.",
        "3. Если PHASE=middlegame или endgame — ЗАПРЕЩЕНО банальное «занимай центр» / «иди в центр». Центр уже либо твой, либо потерян. Говори конкретнее: какую шашку активизировать, какую разменять, где создать угрозу.",
        "4. RECENT_COACH — это твои предыдущие реплики. ЗАПРЕЩЕНО повторять ту же мысль другими словами. Каждая новая реплика должна сменить тему: материал → темп → структура → конкретная шашка → план.",
        "",
        "ТЕМЫ ПО ФАЗАМ (на чём фокусироваться):",
        "- opening: дебютные принципы — развитие задних шашек, центр, не выводить бортовые рано, не делать одну шашку дважды без причины.",
        "- middlegame: размены с расчётом, активизация тыла, давление на одну сторону, мобильность, мотивы (вилка, прорыв).",
        "- endgame: оппозиция, дамочные диагонали, проводка шашки в дамки (ТОЛЬКО если PROMOTION_READY=yes), правило 3v1, длинная диагональ.",
        "",
        "ЗАВЕРШЕНИЕ КОММЕНТАРИЯ:",
        "- Заканчивай ОДНОЙ конкретной задачей на следующий ход. Выбирай задачу из списка ПО ФАЗЕ:",
        "  • opening: «активизируй заднюю шашку», «не двигай одну дважды», «убери бортовую с края», «займи центр сначала».",
        "  • middlegame: «найди взятие», «не разменивай без выгоды», «создай угрозу с фланга», «активизируй шашку из тыла».",
        "  • endgame (PROMOTION_READY=yes): «веди шашку в дамки», «прикрой проходную», «займи длинную диагональ».",
        "  • endgame (PROMOTION_READY=no/n/a): «займи оппозицию», «держи дамку в центре», «не давай разменять дамку».",
        "",
        "ПРИМЕРЫ ОТВЕТОВ АТЫ (стиль, на который ОРИЕНТИРУЙСЯ):",
        "Факты: PHASE=opening, MOVE_CLASS=good, BEST_MOVE=c3-d4 → «Сыграл нормально, но c3-d4 держал центр крепче. Запомни — центр сначала, фланг потом.»",
        "Факты: PHASE=middlegame, MOVE_CLASS=blunder, MATERIAL_BALANCE=-2, PROMOTION_READY=no → «Ой бай, отдал шашку зря. Теперь две шашки позади — играй компактно, ищи размены равные.»",
        "Факты: PHASE=middlegame, MOVE_CLASS=best, PROMOTION_READY=no → «Жарайды, балам. Так и держи — давление с фланга, не торопись.»",
        "Факты: PHASE=middlegame, MOVE_CLASS=inaccuracy, BEST_MOVE=e3-f4, PROMOTION_READY=no → «Поспешил. e3-f4 ставил соперника в угол. Активизируй шашку из тыла, фланговая партизанит.»",
        "Факты: PHASE=endgame, POSITION_STATUS=winning, MOVE_CLASS=good, PROMOTION_READY=yes → «Хорошо стоишь. Теперь не разменивай зря — веди шашку в дамки спокойно.»",
        "Факты: PHASE=endgame, POSITION_STATUS=winning, PROMOTION_READY=no (только дамки) → «Дамка у тебя есть — теперь оппозиция. Прижми соперника к борту.»",
        "Факты: PHASE=middlegame, POSITION_STATUS=lost, MOVE_CLASS=mistake → «Тяжело тебе сейчас. Не сдавайся — ищи, где сопернику неудобно бить. Иногда даже проигранная позиция учит больше победы.»",
      ]
    : [];
  return [
    character.persona,
    ...ataLiveRules,
    "",
    "─────────────────────────────",
    "FINAL OVERRIDE (highest priority):",
    LOCALE_DIRECTIVE[locale],
    "",
    "OUTPUT RULES:",
    "- Дай ОДНУ короткую реплику (1-2 предложения максимум).",
    "- Не пиши служебные маркеры: STOP, END, ###, [ситуация:], [phase:], [MODE:].",
    "- Не префиксируй ответ именем или меткой типа «ATA:».",
    "- Соблюдай язык из FINAL OVERRIDE выше — он перебивает всё.",
  ].join("\n");
}

const BOT_TRIGGER_MAP: Record<BotBanterSituation["trigger"], BotDialogueTrigger> = {
  opponent_blunder: "player_blunder",
  opponent_good: "player_strong",
  own_strong: "bot_strong",
  own_blunder: "bot_blunder",
  low_time: "low_time",
  endgame_pressure: "endgame_pressure",
};

function buildBotDialogueContext(
  character: Character,
  situation: BotBanterSituation
): BotDialogueContext | null {
  if (!isBotId(character.id)) return null;

  return {
    botId: character.id,
    phase: phaseOf(situation.moveNumber, situation.totalMoves),
    trigger: BOT_TRIGGER_MAP[situation.trigger],
    engineFacts: [
      `Фаза партии: ${PHASE_TXT[phaseOf(situation.moveNumber, situation.totalMoves)].ru}.`,
      `Событие: ${BOT_TRIGGER_MAP[situation.trigger]}.`,
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Public API — both blocking and streaming
// ─────────────────────────────────────────────────────────────

export interface CoachCommentRequest {
  move: ReviewedMove;
  moveNumber: number;
  totalMoves: number;
  ataContext?: AtaReviewContext;
}

/** Blocking call — returns full string when LLM finishes. Used by /api/coach/comment. */
export async function fetchCoachComment(
  apiKey: string,
  req: CoachCommentRequest,
  opts: { character?: Character; locale?: Locale; model?: string } = {}
): Promise<string> {
  const isAta = opts.character?.id === "ata";
  const { character, locale = "ru", model = MODEL_TOP } = opts;
  const situation: ReviewSituation = {
    mode: "review",
    move: req.move,
    moveNumber: req.moveNumber,
    totalMoves: req.totalMoves,
  };
  const system = character
    ? buildSystemPrompt(character, locale)
    : DEFAULT_REVIEW_SYSTEM(locale);
  const user = req.ataContext
    ? buildAtaCoachUserMessage(req.ataContext)
    : buildUserMessage(situation, locale);

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 80,
      temperature: 0.8,
      top_p: 0.92,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
      stop: ["[ситуация", "[phase", "\n[", "\nATA", "\nАТА", "\n\n", "STOP", "END", "###"],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Featherless ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices[0]?.message.content ?? "";
  return isAta ? cleanTrainerOutput(raw) : cleanOutput(raw);
}

/**
 * Streaming call — returns an async generator yielding text chunks as they
 * arrive. Used by /api/coach/stream which forwards via SSE to the browser
 * for typewriter-style display.
 */
export async function* streamCoachComment(
  apiKey: string,
  character: Character,
  situation: CoachSituation,
  locale: Locale = "ru",
  modelOverride?: string
): AsyncGenerator<string, void, unknown> {
  // For LIVE TRAINER (Ata) we use the BIG model (Qwen2.5-32B): the prompt is
  // dense (engine eval + PDN tail + material + memory) and Mistral-Nemo-12B
  // hallucinates terms ("ферзь", "d5") and gives generic praise even when the
  // student is losing. Latency penalty (~200-400ms more TTF) is worth it.
  // For BOT BANTER we keep Mistral-Nemo for fast / punchy banter.
  const isTrainerLive = situation.mode === "trainer-live";
  const model =
    modelOverride ?? (isTrainerLive ? MODEL_TOP : MODEL_FAST);
  const botContext = situation.mode === "bot-banter"
    ? buildBotDialogueContext(character, situation)
    : null;
  const system = botContext
    ? buildBotDialogueSystemPrompt(getBotDialogueProfile(botContext.botId))
    : buildSystemPrompt(character, locale);
  const user = botContext
    ? buildBotDialogueUserMessage(botContext)
    : buildUserMessage(situation, locale);

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 90,
      temperature: 0.85,
      top_p: 0.92,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
      stop: ["[ситуация", "[phase", "\n[", "\nATA", "\nАТА", "\n\n", "STOP", "END", "###"],
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`Featherless ${response.status}: ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = chunk.choices?.[0]?.delta?.content;
        if (piece) yield piece;
      } catch {
        // Featherless sometimes emits keepalives — ignore non-JSON.
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Strip role prefixes, leading meta tags, and excess whitespace that
 * sometimes leak from few-shot formatting.
 */
function cleanOutput(raw: string): string {
  return raw
    .replace(/^(?:АТА|Ata|Ата|АЙГЕРИМ|ТЕМИР|ЖАНАР|КАНАТ)\s*:\s*/i, "")
    .replace(/^\[.*?\]\s*/, "")
    .replace(/\n+/g, " ")
    .trim();
}

/**
 * Fallback system prompt for /api/coach/comment when no character is bound
 * (legacy path — keeps existing review flow working).
 */
function DEFAULT_REVIEW_SYSTEM(locale: Locale): string {
  return [
    "Ты — Ата, главный тренер DamaDojo и реальный казахский тренер по шашкам. Ты объясняешь только факты из ENGINE_FACTS.",
    LOCALE_DIRECTIVE[locale],
    "Одна короткая реплика, 1-2 предложения. Без списков, без меток, без engine jargon, без мистики, без токсичности.",
    "Не выдумывай клетки, варианты или мотивы, которых нет в ENGINE_FACTS. Если фактов мало, говори осторожно.",
  ].join("\n");
}

export { cleanOutput, cleanTrainerOutput };

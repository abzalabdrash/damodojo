/**
 * Output sanitization for the live trainer (Ata).
 *
 * The LLM occasionally leaks chess-specific terms ("ферзь", "король", "пешка")
 * or fabricates algebraic coordinates that point to LIGHT squares (e.g. "d5",
 * "e4") which are physically impossible in Russian draughts — pieces only
 * occupy the 32 dark squares of an 8x8 board. We post-process the model
 * output to (a) replace forbidden terms with draughts-correct equivalents and
 * (b) drop any algebraic coord that is not a valid dark square.
 *
 * This module is intentionally dependency-free so it can be imported on both
 * the Node server (api/coach/comment) and the browser (use-bot-dialogue) to
 * scrub streaming chunks before they reach the user.
 */

/**
 * The 32 dark squares of the 8x8 Russian-draughts board, in algebraic
 * notation (file + rank, white POV). These are the ONLY squares that can
 * hold pieces.
 */
export const VALID_DARK_SQUARES: readonly string[] = [
  "a1", "c1", "e1", "g1",
  "b2", "d2", "f2", "h2",
  "a3", "c3", "e3", "g3",
  "b4", "d4", "f4", "h4",
  "a5", "c5", "e5", "g5",
  "b6", "d6", "f6", "h6",
  "a7", "c7", "e7", "g7",
  "b8", "d8", "f8", "h8",
];

const VALID_DARK_SQUARES_SET = new Set(VALID_DARK_SQUARES);

export function isValidDarkSquare(square: string): boolean {
  return VALID_DARK_SQUARES_SET.has(square.toLowerCase());
}

/**
 * JavaScript's `\b` is defined only for ASCII word chars, so it never fires
 * inside / around Cyrillic letters. We emulate Unicode word boundaries with
 * lookaround on letter characters: a "word edge" sits between a letter and
 * a non-letter (or string edge). `\p{L}` matches any Unicode letter.
 */
const WB_BEFORE = "(?<![\\p{L}\\p{N}_])";
const WB_AFTER = "(?![\\p{L}\\p{N}_])";

function rxWord(body: string): RegExp {
  return new RegExp(`${WB_BEFORE}${body}${WB_AFTER}`, "giu");
}

/**
 * Forbidden chess terms with draughts-correct replacements (or empty string
 * if there is no equivalent and we should just drop the word).
 */
const CHESS_TERM_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // Russian chess vocabulary (all common cases / numbers folded into a single
  // suffix class). NB: order matters — longer / more-specific stems first so
  // we don't half-match a word.
  [rxWord("ферз(?:[ьяюеёиам]|ями|ями?)?"), "дамку"],
  [rxWord("корол(?:[ьяюеёиамы]|ями|ями?|ев[ау]?)?"), "дамку"],
  [rxWord("пешк(?:[аиуеойы]|ами|ах)?"), "шашку"],
  [rxWord("слон(?:[аеомуыахи]|ами)?"), "шашку"],
  [rxWord("лад(?:ья|ьи|ью|ьёй|ьей|ьями|ьях)"), "шашку"],
  [rxWord("кон(?:[ьяюеёиам]|ями|ях)?"), "шашку"],
  [rxWord("шах(?:[ауеомы]|ами|ах)?"), ""],
  [rxWord("мат(?:[ауеомы]|ами|ах)?"), ""],
  [rxWord("рокировк(?:[аиуеойы]|ами|ах)?"), ""],
  [rxWord("пат(?:[ауеомы]|ами|ах)?"), ""],
  // English / latin terms — ASCII boundaries are fine here.
  [/\ben passant\b/giu, ""],
  [/\bcastling\b/giu, ""],
  [/\bqueen\b/giu, "king"],
  [/\bbishop\b/giu, "man"],
  [/\brook\b/giu, "man"],
  [/\bpawn\b/giu, "man"],
  [/\bcheck\b/giu, ""],
  [/\bcheckmate\b/giu, ""],
  [/\bmate\b/giu, ""],
];

/** Strip chess-only vocabulary, replacing with draughts terms when possible. */
export function stripChessTerms(text: string): string {
  let out = text;
  for (const [pattern, replacement] of CHESS_TERM_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Engine-jargon scrub. The trainer is supposed to be Ata, an Almaty чемпион
 * аксакал, not a chess engine. When the LLM slips and uses words like
 * «движок», «оптимально», «анализ» — we either swap them for human language
 * or drop them. We also chop the most common boilerplate openings.
 *
 * The replacements are deliberately conservative: nothing semantic is added,
 * we just strip the engine vibe. If a sentence ends up empty, the caller's
 * whitespace cleanup phase swallows it.
 */
const ENGINE_JARGON_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // Direct mentions of the engine itself.
  [/\b(?:как )?(?:советует|предлагает|показывает|оценивает|считает) (?:движок|engine|анализ|алгоритм|нейросеть|компьютер)\b/giu, ""],
  [/\bпо (?:статистике|анализу|расчёту|расчету|метрик[еа]м?)\b/giu, ""],
  [/\bдвиж(?:ок|ка|ку|ком|ке|ки)\b/giu, ""],
  [/\bалгоритм(?:[ауыемов]|ами|ах)?\b/giu, ""],
  [/\bнейросет(?:ь|и|ью|ям|ями)\b/giu, ""],
  [/\bметрик(?:[аиуеойы]|ами|ах)?\b/giu, ""],
  // "оптимально" / "оптимальный ход" — too engine-y.
  [/\bоптимальн(?:ый|ого|ому|ым|ом|ая|ой|ую|ое|ые|ых|ыми)\b/giu, "точный"],
  [/\bоптимально\b/giu, "точно"],
  // Common bureaucratic templates the model leans on.
  [/^Ход (?:нормальный|стандартный|обычный|типичный),?\s*но\s*/iu, ""],
  [/^Необходимо стремиться к\s*/iu, ""],
  [/^Следует (?:сыграть|стремиться|двигать)\s*/iu, ""],
];

export function stripEngineJargon(text: string): string {
  let out = text;
  for (const [pattern, replacement] of ENGINE_JARGON_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Capitalise the first letter again if we cut off the boilerplate prefix.
  out = out.replace(/^\s*([а-яё])/u, (_, ch: string) => ch.toUpperCase());
  return out;
}

/**
 * Replace any algebraic coordinate (a1..h8) that points to a LIGHT square
 * with an empty string. Light squares cannot hold pieces in draughts, so any
 * mention is necessarily a hallucination.
 */
export function stripInvalidSquares(text: string): string {
  return text.replace(/\b([a-hA-H])([1-8])\b/g, (_match, file: string, rank: string) => {
    const square = `${file.toLowerCase()}${rank}`;
    return VALID_DARK_SQUARES_SET.has(square) ? square : "";
  });
}

/**
 * Tighter cleanup for live trainer (Ata) output: drop chess vocabulary and
 * fabricated coordinates, then collapse whitespace / dangling punctuation
 * left behind by those substitutions.
 */
export function cleanTrainerOutput(raw: string): string {
  let text = raw
    .replace(/^(?:АТА|Ata|Ата|АЙГЕРИМ|ТЕМИР|ЖАНАР|КАНАТ)\s*:\s*/i, "")
    .replace(/^\[[^\]]*\]\s*:?\s*/, "")
    .replace(/\n+/g, " ")
    // The LLM occasionally still writes "STOP." / "END" / "###" as a stop
    // marker even when we ask it not to. Strip any such trailing marker (and
    // multiple in a row) so the bubble doesn't show "...позицию. STOP."
    .replace(/(?:\s*(?:STOP|END|###)\.?\s*)+$/giu, "")
    .trim();
  text = stripChessTerms(text);
  text = stripEngineJargon(text);
  text = stripInvalidSquares(text);
  text = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])([,.;:!?]+)/g, "$1")
    .replace(/\s+([)»\]])/g, "$1")
    .replace(/([(«\[])\s+/g, "$1")
    .trim();
  return text;
}

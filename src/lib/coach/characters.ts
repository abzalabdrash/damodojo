import { BOT_DIALOGUE_PROFILES, type BotDialogueProfile } from "./bot-dialogue";

export type CharacterKind = "trainer" | "bot";
export type Locale = "ru" | "en" | "kz";

export interface Character {
  id: string;
  name: string;
  avatar: string;
  flag: string | null;
  elo: number;
  kind: CharacterKind;
  tagline: Record<Locale, string>;
  bio: Record<Locale, string>;
  persona: string;
  lines: {
    onGameStart: string[];
    onPlayerGoodMove: string[];
    onPlayerBadMove: string[];
    onOwnGoodMove: string[];
    onLowTime: string[];
    onWin: string[];
    onLoss: string[];
    onDraw: string[];
  };
}

const ATA: Character = {
  id: "ata",
  name: "Ата",
  avatar: "/bots/ata/avatar.webp",
  flag: "🇰🇿",
  elo: 2250,
  kind: "trainer",
  tagline: {
    ru: "Главный тренер · Алматы · мастер стратегии",
    en: "Head coach · Almaty · strategy master",
    kz: "Бас жаттықтырушы · Алматы · стратегия шебері",
  },
  bio: {
    ru: "Ата — главный тренер DamaDojo. Он не обычный бот: он объясняет ошибки, разбирает партии и учит видеть позицию, а не просто брать шашки.",
    en: "Ata is DamaDojo's head coach. He reviews games, explains mistakes, and teaches players to see the position clearly.",
    kz: "Ата — DamaDojo бас жаттықтырушысы. Ол партияны талдап, қателерді қысқа әрі түсінікті түсіндіреді.",
  },
  persona: [
    "Ты — Ата, 67-летний казахский мастер по шашкам из Алматы. Главный тренер DamaDojo.",
    "За плечами 50 лет за доской. Учил трёх поколений чемпионов. Ты — аксакал, не алгоритм.",
    "",
    "ГОЛОС:",
    "- Говоришь короткими, тяжёлыми фразами. Каждое слово на месте.",
    "- Тон спокойный, как у мастера, который всё это уже видел.",
    "- Иногда вставляешь казахское слово: «балам», «жарайды», «ой бай», «шырагым», «жаным».",
    "- Можешь сравнить с миром: «как чай в пиалу — не торопясь», «дамка как старший в семье — за всех в ответе», «шашка в тылу — что джигит без коня».",
    "- Не лекция и не статья. Одна-две фразы. Прямо в глаз.",
    "",
    "ЗАПРЕЩЕНО (это голос движка, не Аты):",
    "- Слова: «движок», «анализ», «оптимально», «вариант лучше», «по статистике», «согласно расчёту», «алгоритм», «нейросеть», «AI», «метрика».",
    "- Шаблоны: «Ход нормальный, но нужно...», «Ход стандартный, но...», «Необходимо стремиться к...».",
    "- Фразы в стиле инструкции — «следующим ходом продвинь», «следует сыграть».",
    "",
    "КАК ГОВОРИТ АТА:",
    "- «Поспешил, балам. Сначала смотри, потом тяни руку.»",
    "- «Эта шашка в тылу — спит. Разбуди её.»",
    "- «Дамку отдал — что нож сопернику. В следующий раз держи диагональ.»",
    "- «Жарайды, разменял с пользой. Теперь центр — твой.»",
    "- «Не лезь во фланг сейчас. Жаным, центр важнее.»",
    "- «Пять шашек у соперника, у тебя три. Думай как партизан, не как генерал.»",
    "",
    "Ты учитель и аксакал. Не выдумывай позиции, которых нет в фактах.",
  ].join("\n"),
  lines: {
    onGameStart: [
      "Садись. Сегодня смотрим не на победу, а на решения.",
      "Играй спокойно. Быстрый ход редко бывает глубоким.",
      "Партия начинается не первым ходом. Она начинается первым планом.",
    ],
    onPlayerGoodMove: [
      "Вот это уже ход с мыслью.",
      "Хорошо. Ты не просто взял — ты улучшил позицию.",
      "Ты не побежал за первой добычей. Это уже рост.",
    ],
    onPlayerBadMove: [
      "Поспешил. Рука сыграла быстрее головы.",
      "Идея понятная, но порядок ходов подвел.",
      "Ты увидел первую выгоду, а надо было увидеть последнюю позицию.",
    ],
    onOwnGoodMove: [
      "Смотри на центр. Там решается больше, чем кажется.",
      "Этот ход не громкий, но тяжелый.",
      "План важнее первой добычи.",
    ],
    onLowTime: [
      "Времени мало, но паника не считает варианты.",
      "Дыши ровно. Один точный ход лучше трех быстрых.",
    ],
    onWin: [
      "Хорошо. Сегодня ты не просто выиграл — ты выдержал позицию.",
      "Победа есть. Теперь посмотрим, была ли она чистой.",
    ],
    onLoss: [
      "Партия закончилась. Урок — нет.",
      "Не расстраивайся. Теперь у нас есть материал для работы.",
    ],
    onDraw: [
      "Ничья тоже учит. Ты удержал равновесие.",
      "Результат ровный. Посмотрим, где можно было требовать больше.",
    ],
  },
};

function buildBotPersona(profile: BotDialogueProfile): string {
  return [
    `Ты — ${profile.name}, соперник в DamaDojo.`,
    `Роль: ${profile.role}.`,
    `Кто ты: ${profile.longIdentity}`,
    `Стиль игры: ${profile.playStyle}`,
    `Голос: ${profile.voice}`,
    "Ты не Ата и не тренер. Ты можешь реагировать на ход, но не делаешь полный разбор.",
    "Говори одной короткой репликой. Не выдумывай позиционные факты вне данных движка.",
  ].join("\n");
}

function localizedBotText(profile: BotDialogueProfile): Record<Locale, string> {
  return {
    ru: profile.longIdentity,
    en: profile.longIdentity,
    kz: profile.longIdentity,
  };
}

function botTagline(profile: BotDialogueProfile): Record<Locale, string> {
  const line = `${profile.role} · ${profile.elo} ELO`;
  return { ru: line, en: line, kz: line };
}

function characterFromBotProfile(profile: BotDialogueProfile): Character {
  return {
    id: profile.id,
    name: profile.name,
    avatar: `/bots/${profile.id}/avatar.webp`,
    flag: "🇰🇿",
    elo: profile.elo,
    kind: "bot",
    tagline: botTagline(profile),
    bio: localizedBotText(profile),
    persona: buildBotPersona(profile),
    lines: {
      onGameStart: profile.fallbacks.gameStart,
      onPlayerGoodMove: [
        ...profile.fallbacks.playerBrilliant,
        ...profile.fallbacks.playerStrong,
      ],
      onPlayerBadMove: [
        ...profile.fallbacks.playerBlunder,
        ...profile.fallbacks.playerMistake,
      ],
      onOwnGoodMove: profile.fallbacks.botStrong,
      onLowTime: profile.fallbacks.lowTime,
      onWin: profile.fallbacks.botWin,
      onLoss: profile.fallbacks.botLoss,
      onDraw: profile.fallbacks.draw,
    },
  };
}

const BOTS_BY_ID = Object.fromEntries(
  BOT_DIALOGUE_PROFILES.map((profile) => [profile.id, characterFromBotProfile(profile)])
) as Record<BotDialogueProfile["id"], Character>;

const AIGERIM = BOTS_BY_ID.aigerim;
const ZHANAR = BOTS_BY_ID.zhanar;
const TEMIR = BOTS_BY_ID.temir;
const KANAT = BOTS_BY_ID.kanat;
const TALGAT = BOTS_BY_ID.talgat;

export const CHARACTERS: Character[] = [ATA, AIGERIM, ZHANAR, TEMIR, KANAT, TALGAT];

export const CHARACTERS_BY_ID: Record<string, Character> = Object.fromEntries(
  CHARACTERS.map((character) => [character.id, character])
);

export function getCharacter(id: string): Character | null {
  return CHARACTERS_BY_ID[id] ?? null;
}

export function getTrainer(): Character {
  return ATA;
}

export function getBots(): Character[] {
  return CHARACTERS.filter((character) => character.kind === "bot");
}

export function pickLine(character: Character, category: keyof Character["lines"]): string {
  const pool = character.lines[category];
  return pool[Math.floor(Math.random() * pool.length)] ?? "";
}

import { getBots, type Character } from "./characters";

export interface BotSelectionItem {
  character: Character;
  locked: boolean;
}

export type BotSideOptionId = "white" | "random" | "black";

export const SIDE_OPTIONS: { id: BotSideOptionId; label: string }[] = [
  { id: "white", label: "w" },
  { id: "random", label: "r" },
  { id: "black", label: "b" },
];

/** Preview lines shown in speech bubble before game starts */
export const BOT_PREVIEW_LINES: Record<string, string> = {
  kanat: "Салам! Давай сыграем, я тоже только учусь.",
  zhanar: "Готов к партии? Я не собираюсь поддаваться.",
  temir: "Защита — моя стихия. Попробуй пробить.",
  aigerim: "Сыграем спокойно. Ошибки покажут, кто видел дальше.",
  talgat: "Сыграем остро. Тихо тут не будет.",
};

export function getBotSelectionItems(): BotSelectionItem[] {
  return [...getBots()]
    .sort((a, b) => a.elo - b.elo)
    .map((character) => ({
      character,
      locked: character.id === "aigerim" || character.id === "talgat",
    }));
}

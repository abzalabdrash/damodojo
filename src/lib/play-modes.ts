export type PlayModeId = "online" | "bot" | "coach" | "friend" | "local";

export interface PlayMode {
  id: PlayModeId;
  title: string;
  subtitle: string;
  group: "primary" | "utility";
}

export const PLAY_MODES: readonly PlayMode[] = [
  {
    id: "online",
    title: "Играть онлайн",
    subtitle: "Быстрый матч с таймером и премувами",
    group: "primary",
  },
  {
    id: "bot",
    title: "Играть с ботом",
    subtitle: "Соперники с характером и своими репликами",
    group: "primary",
  },
  {
    id: "coach",
    title: "Играть с Ата",
    subtitle: "Тренер помогает во время партии",
    group: "primary",
  },
  {
    id: "friend",
    title: "Играть с другом",
    subtitle: "Пригласить по имени или отправить ссылку",
    group: "primary",
  },
  {
    id: "local",
    title: "Локально на этом устройстве",
    subtitle: "Fallback-режим для демо и игры рядом",
    group: "utility",
  },
] as const;

export function primaryPlayModes(): readonly PlayMode[] {
  return PLAY_MODES.filter((mode) => mode.group === "primary");
}

export function utilityPlayModes(): readonly PlayMode[] {
  return PLAY_MODES.filter((mode) => mode.group === "utility");
}

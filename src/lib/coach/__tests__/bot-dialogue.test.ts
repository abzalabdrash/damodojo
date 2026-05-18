import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { getBotSelectionItems } from "../bot-selection";
import { getBots } from "../characters";
import {
  BOT_DIALOGUE_PROFILES,
  BOT_IDS,
  buildBotDialogueSystemPrompt,
  buildBotDialogueUserMessage,
  fallbackBotLine,
  getBotDialogueProfile,
  type BotDialogueContext,
} from "../bot-dialogue";

describe("bot dialogue profiles", () => {
  it("defines the five opponent bots and excludes Ata", () => {
    expect(BOT_IDS).toEqual(["kanat", "zhanar", "temir", "aigerim", "talgat"]);
    expect(BOT_DIALOGUE_PROFILES).toHaveLength(5);
    expect(BOT_DIALOGUE_PROFILES.map((bot) => bot.id)).not.toContain("ata");
  });

  it("gives every bot a distinct voice and complete fallback bank", () => {
    for (const bot of BOT_DIALOGUE_PROFILES) {
      expect(bot.voice).toBeTruthy();
      expect(bot.playStyle).toBeTruthy();
      expect(bot.fallbacks.gameStart.length).toBeGreaterThanOrEqual(3);
      expect(bot.fallbacks.playerBlunder.length).toBeGreaterThanOrEqual(3);
      expect(bot.fallbacks.botStrong.length).toBeGreaterThanOrEqual(3);
      expect(bot.fallbacks.botWin.length).toBeGreaterThanOrEqual(2);
      expect(bot.fallbacks.botLoss.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns strong character-specific fallback lines", () => {
    expect(fallbackBotLine("zhanar", "player_blunder")).toContain("Ловушка");
    expect(fallbackBotLine("temir", "player_blunder").length).toBeLessThan(40);
    expect(fallbackBotLine("aigerim", "player_mistake").length).toBeLessThan(60);
    expect(fallbackBotLine("talgat", "bot_strong")).toContain("инициатив");
    expect(fallbackBotLine("kanat", "bot_blunder")).toContain("сам");
  });

  it("builds a prompt contract that prevents fake analysis", () => {
    const prompt = buildBotDialogueSystemPrompt(getBotDialogueProfile("talgat"));

    expect(prompt).toContain("Ты не Ата");
    expect(prompt).toContain("BOT_FACTS");
    expect(prompt).toContain("не выдумывай клетки");
    expect(prompt).toContain("не имитируй реальных известных игроков");
    expect(prompt).toContain("одну короткую реплику");
  });

  it("serializes engine facts without raw engine jargon", () => {
    const context: BotDialogueContext = {
      botId: "zhanar",
      phase: "middlegame",
      trigger: "player_blunder",
      moveClass: "blunder",
      notation: "c3xd4",
      motifTag: "double_capture",
      bestMoveNotation: "b2-a3",
      wpDeltaBucket: "large",
      engineFacts: [
        "Ход игрока классифицирован как зевок.",
        "Мотив: двойное взятие.",
      ],
    };

    const message = buildBotDialogueUserMessage(context);

    expect(message).toContain("BOT_FACTS");
    expect(message).toContain("trigger: player_blunder");
    expect(message).toContain("Мотив: двойное взятие.");
    expect(message).not.toContain("+2.4");
    expect(message).not.toContain("depth");
  });

  it("adds Talgat to the playable bot roster without making Ata a bot", () => {
    expect(getBots().map((bot) => bot.id)).toEqual([
      "aigerim",
      "zhanar",
      "temir",
      "kanat",
      "talgat",
    ]);
  });

  it("orders bot selection from weak to strong and locks the two strongest bots for Pro", () => {
    const items = getBotSelectionItems();

    expect(items.map((item) => item.character.id)).toEqual([
      "kanat",
      "zhanar",
      "temir",
      "aigerim",
      "talgat",
    ]);
    expect(items.filter((item) => item.locked).map((item) => item.character.id)).toEqual([
      "aigerim",
      "talgat",
    ]);
  });

  it("uses optimized WebP avatars for every playable bot", () => {
    for (const bot of getBots()) {
      expect(bot.avatar).toBe(`/bots/${bot.id}/avatar.webp`);
      expect(existsSync(join(process.cwd(), "public", "bots", bot.id, "avatar.webp"))).toBe(true);
      expect(existsSync(join(process.cwd(), "public", "bots", bot.id, "icon.webp"))).toBe(true);
    }
  });
});

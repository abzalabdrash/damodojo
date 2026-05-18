# Bot Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed, test-backed dialogue layer for the five DamaDojo opponent bots while keeping Ata separate as coach and reviewer.

**Architecture:** Add a focused `src/lib/coach/bot-dialogue.ts` module with bot profiles, fallback banks, dialogue context, and Featherless prompt/user-message builders. Keep `src/lib/coach/ata.ts` as the coach/review layer. Update the existing character roster to consume the new bot profiles and add Talgat.

**Tech Stack:** TypeScript, Vitest, existing Featherless coach API, existing DamaDojo engine review types.

---

## File Map

- Create `src/lib/coach/bot-dialogue.ts`: typed opponent roster, voice profiles, fallback lines, prompt builders, context helpers.
- Create `src/lib/coach/__tests__/bot-dialogue.test.ts`: tests for roster completeness, fallback quality, prompt safety, and context serialization.
- Modify `src/lib/coach/characters.ts`: add Talgat and align bot copy with the new profiles.
- Modify `src/lib/coach/featherless.ts`: use the new bot dialogue prompt for `bot-banter` situations.
- Modify `src/app/play/bots/page.tsx`: update section copy to "Школа Аты" and "Ученики и соперники" if needed after roster changes.

## Task 1: Bot Dialogue Tests

**Files:**
- Create: `src/lib/coach/__tests__/bot-dialogue.test.ts`
- Create later: `src/lib/coach/bot-dialogue.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/coach/__tests__/bot-dialogue.test.ts`

Expected: FAIL because `src/lib/coach/bot-dialogue.ts` does not exist.

## Task 2: Bot Dialogue Module

**Files:**
- Create: `src/lib/coach/bot-dialogue.ts`
- Test: `src/lib/coach/__tests__/bot-dialogue.test.ts`

- [ ] **Step 1: Implement typed profiles and helpers**

Add:

- `BotId`
- `BotDialogueTrigger`
- `BotDialogueContext`
- `BotDialogueProfile`
- `BOT_IDS`
- `BOT_DIALOGUE_PROFILES`
- `getBotDialogueProfile`
- `fallbackBotLine`
- `buildBotDialogueSystemPrompt`
- `buildBotDialogueUserMessage`

The module must include the five profiles: Kanat, Zhanar, Temir, Aigerim, Talgat.

- [ ] **Step 2: Run bot dialogue tests**

Run: `npm test -- src/lib/coach/__tests__/bot-dialogue.test.ts`

Expected: PASS.

## Task 3: Roster Integration

**Files:**
- Modify: `src/lib/coach/characters.ts`
- Test: `src/lib/coach/__tests__/bot-dialogue.test.ts`

- [ ] **Step 1: Add Talgat and align existing bot copy**

Use the new profiles to rewrite bot bios, taglines, personas, and deterministic
line banks. Keep Ata as `kind: "trainer"`. `getBots()` must return five bots.

- [ ] **Step 2: Add or extend test**

Add an assertion that `getBots().map((bot) => bot.id)` returns:

```ts
["aigerim", "zhanar", "temir", "kanat", "talgat"]
```

- [ ] **Step 3: Run targeted tests**

Run: `npm test -- src/lib/coach/__tests__/bot-dialogue.test.ts`

Expected: PASS.

## Task 4: Featherless Bot Banter Integration

**Files:**
- Modify: `src/lib/coach/featherless.ts`
- Test: `src/lib/coach/__tests__/bot-dialogue.test.ts`

- [ ] **Step 1: Use bot dialogue prompt for bot-banter**

When `streamCoachComment` receives `situation.mode === "bot-banter"` and a
known bot character, build the system and user messages with
`bot-dialogue.ts`. Keep trainer/review behavior unchanged.

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- src/lib/coach/__tests__/bot-dialogue.test.ts`

Expected: PASS.

## Task 5: Bot Select Copy

**Files:**
- Modify: `src/app/play/bots/page.tsx`

- [ ] **Step 1: Read relevant Next docs before page edit**

Run: `Get-ChildItem node_modules/next/dist/docs -Recurse -Filter "*client*" | Select-Object -First 5 FullName`

Then read the relevant client component guide if present.

- [ ] **Step 2: Update copy only**

Update visible Russian copy:

- Heading: `Школа Аты`
- Trainer section: `Тренер`
- Bot section: `Ученики и соперники`
- Primary trainer actions can stay minimal for this phase.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: PASS.

## Task 6: Verification And Commit

**Files:**
- All changed files.

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- src/lib/coach/__tests__/bot-dialogue.test.ts`

Expected: PASS.

- [ ] **Step 2: Run related coach tests**

Run: `npm test -- src/lib/coach/__tests__/ata.test.ts`

Expected: PASS.

- [ ] **Step 3: Run TypeScript**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach src/app/play/bots/page.tsx docs/superpowers/plans/2026-05-18-bot-dialogue.md
git commit -m "Add opponent bot dialogue layer"
```

import { describe, expect, it } from "vitest";

import {
  collapseRepeatedLiveComment,
  shouldKeepPreviousLiveComment,
  shouldTriggerLiveComment,
} from "../live-commentary";

describe("live commentary cadence", () => {
  it("does not comment on the bot's own reply move", () => {
    expect(
      shouldTriggerLiveComment({
        moveNumber: 6,
        isPlayerMove: false,
        hadCaptures: true,
        lastCommentMoveNumber: 3,
      }),
    ).toBe(false);
  });

  it("waits until at least the third player move", () => {
    expect(
      shouldTriggerLiveComment({
        moveNumber: 2,
        isPlayerMove: true,
        hadCaptures: true,
        lastCommentMoveNumber: -999,
      }),
    ).toBe(false);
  });

  it("uses a three-move cooldown even for interesting moves", () => {
    expect(
      shouldTriggerLiveComment({
        moveNumber: 5,
        isPlayerMove: true,
        hadCaptures: true,
        lastCommentMoveNumber: 3,
      }),
    ).toBe(false);
  });

  it("allows a meaningful player comment after the cooldown", () => {
    expect(
      shouldTriggerLiveComment({
        moveNumber: 6,
        isPlayerMove: true,
        hadCaptures: false,
        lastCommentMoveNumber: 3,
      }),
    ).toBe(true);
  });

  it("keeps an old bubble only when a new comment arrives before it expires", () => {
    expect(
      shouldKeepPreviousLiveComment({
        now: 1_000,
        previousVisibleUntil: 2_000,
        previousText: "Смотри центр.",
        fallbackText: "Начинаем.",
      }),
    ).toBe(true);

    expect(
      shouldKeepPreviousLiveComment({
        now: 3_000,
        previousVisibleUntil: 2_000,
        previousText: "Смотри центр.",
        fallbackText: "Начинаем.",
      }),
    ).toBe(false);
  });

  it("collapses repeated streamed phrases", () => {
    expect(collapseRepeatedLiveComment("Салам! Салам! Считай центр.")).toBe(
      "Салам! Считай центр.",
    );
    expect(collapseRepeatedLiveComment("Думай.Думай.Думай.")).toBe("Думай.");
  });

  it("trainer mode reacts on every student move, including move 1", () => {
    expect(
      shouldTriggerLiveComment({
        moveNumber: 1,
        isPlayerMove: true,
        hadCaptures: false,
        lastCommentMoveNumber: -999,
        isTrainerMode: true,
      }),
    ).toBe(true);

    expect(
      shouldTriggerLiveComment({
        moveNumber: 4,
        isPlayerMove: true,
        hadCaptures: false,
        lastCommentMoveNumber: 3,
        isTrainerMode: true,
      }),
    ).toBe(true);
  });

  it("trainer mode still skips bot's own reply move", () => {
    expect(
      shouldTriggerLiveComment({
        moveNumber: 4,
        isPlayerMove: false,
        hadCaptures: false,
        lastCommentMoveNumber: 3,
        isTrainerMode: true,
      }),
    ).toBe(false);
  });

  it("trainer mode does not double-fire on the same move number", () => {
    expect(
      shouldTriggerLiveComment({
        moveNumber: 5,
        isPlayerMove: true,
        hadCaptures: false,
        lastCommentMoveNumber: 5,
        isTrainerMode: true,
      }),
    ).toBe(false);
  });
});

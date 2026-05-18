import { describe, expect, it } from "vitest";

import { PLAY_MODES, primaryPlayModes, utilityPlayModes } from "../play-modes";

describe("play modes", () => {
  it("orders the primary product modes before utility modes", () => {
    expect(PLAY_MODES.map((m) => m.id)).toEqual([
      "online",
      "bot",
      "coach",
      "friend",
      "local",
    ]);
  });

  it("keeps local play out of the primary mode list", () => {
    expect(primaryPlayModes().map((m) => m.id)).toEqual([
      "online",
      "bot",
      "coach",
      "friend",
    ]);
    expect(utilityPlayModes().map((m) => m.id)).toEqual(["local"]);
  });
});

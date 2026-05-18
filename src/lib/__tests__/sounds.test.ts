import { describe, expect, it } from "vitest";

import { soundAssetFor } from "../sounds";

describe("sound assets", () => {
  it("maps board actions to the real Lichess standard sound files", () => {
    expect(soundAssetFor("move")).toBe("/sounds/lichess-standard/Move.mp3");
    expect(soundAssetFor("move-opponent")).toBe(
      "/sounds/lichess-standard/Move.mp3"
    );
    expect(soundAssetFor("capture")).toBe(
      "/sounds/lichess-standard/Capture.mp3"
    );
    expect(soundAssetFor("game-start")).toBe(
      "/sounds/lichess-standard/GenericNotify.mp3"
    );
    expect(soundAssetFor("low-time")).toBe(
      "/sounds/lichess-standard/LowTime.mp3"
    );
  });

  it("keeps analysis badge sounds synthesized until review audio is designed", () => {
    expect(soundAssetFor("badge-brilliant")).toBeNull();
    expect(soundAssetFor("badge-blunder")).toBeNull();
  });
});

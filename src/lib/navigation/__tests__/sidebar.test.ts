import { describe, expect, it } from "vitest";

import { isSidebarItemActive } from "../sidebar";

describe("sidebar navigation state", () => {
  it("keeps /play inactive when the user is on /play/bots", () => {
    expect(isSidebarItemActive("/play", "/play/bots")).toBe(false);
    expect(isSidebarItemActive("/play/bots", "/play/bots")).toBe(true);
  });

  it("keeps the Play item active for concrete play modes", () => {
    expect(isSidebarItemActive("/play", "/play", "coach=ata")).toBe(true);
    expect(isSidebarItemActive("/play", "/play", "bot=kanat")).toBe(true);
  });
});

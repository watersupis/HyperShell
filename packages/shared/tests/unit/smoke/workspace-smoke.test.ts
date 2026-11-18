import { describe, expect, it } from "vitest";

describe("workspace smoke", () => {
  it("loads shared package code", async () => {
    const mod = await import("../../../src/version");
    expect(mod.WORKSPACE_NAME).toBe("hypershell");
  });
});

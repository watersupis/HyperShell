import { describe, expect, it } from "vitest";

import { resolveSavedSessionTitle } from "../../../../../src/main/platform/process/sessionRecoveryTitle";

describe("resolveSavedSessionTitle", () => {
  it("names an ssh session after its host", () => {
    expect(
      resolveSavedSessionTitle({ profileId: "host-1", hostName: "checkmk" })
    ).toBe("checkmk");
  });

  it("falls back to the profile id when nothing resolves", () => {
    expect(resolveSavedSessionTitle({ profileId: "10.10.10.60" })).toBe(
      "10.10.10.60"
    );
    expect(resolveSavedSessionTitle({ profileId: "deleted-profile" })).toBe(
      "deleted-profile"
    );
    expect(resolveSavedSessionTitle({ profileId: "COM3" })).toBe("COM3");
  });
});

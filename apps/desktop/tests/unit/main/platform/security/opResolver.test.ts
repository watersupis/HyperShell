import { describe, expect, it } from "vitest";

import { isOnePasswordReference } from "../../../../../src/main/platform/security/opResolver";

describe("opResolver", () => {
  it("detects op references", () => {
    expect(isOnePasswordReference("op://vault/item/field")).toBe(true);
  });
});

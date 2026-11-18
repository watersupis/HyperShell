import { describe, expect, it } from "vitest";

import { roundTripSecret } from "../../../../../src/main/platform/security/secureStorage";

describe("secureStorage", () => {
  it("round-trips a secret payload", () => {
    expect(roundTripSecret("s3cr3t")).toBe("s3cr3t");
  });
});

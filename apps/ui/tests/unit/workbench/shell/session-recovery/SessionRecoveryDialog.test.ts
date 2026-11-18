import { describe, expect, it } from "vitest";

import { formatTransport } from "../../../../../src/workbench/shell/session-recovery/SessionRecoveryDialog";

describe("formatTransport", () => {
  it("labels every transport as itself", () => {
    expect(formatTransport("ssh")).toBe("SSH");
    expect(formatTransport("serial")).toBe("Serial");
    expect(formatTransport("sftp")).toBe("SFTP");
    expect(formatTransport("telnet")).toBe("Telnet");
    expect(formatTransport("local")).toBe("Local");
  });
});

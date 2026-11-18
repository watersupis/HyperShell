import { describe, expect, it } from "vitest";
import type { SavedSessionRecord } from "@hypershell/shared";

import { savedSessionToLayoutTab } from "../../../../../src/workbench/shell/session-recovery/savedSessionRestore";

function record(overrides: Partial<SavedSessionRecord> = {}): SavedSessionRecord {
  return {
    id: "session-2",
    hostId: null,
    hostName: null,
    transport: "ssh",
    profileId: "host-1",
    title: "Production",
    wasGraceful: false,
    savedAt: "2026-08-13T15:23:38.906Z",
    pluginData: {},
    ...overrides,
  };
}

describe("savedSessionToLayoutTab", () => {
  it("keeps a local session on the local transport", () => {
    const tab = savedSessionToLayoutTab(
      record({ transport: "local", profileId: "1f1f8716", title: "PowerShell" }),
      "recovery-1"
    );

    expect(tab).toMatchObject({
      sessionId: "recovery-1",
      transport: "local",
      profileId: "1f1f8716",
      title: "PowerShell",
    });
  });

  it("keeps ssh and serial sessions on their own transports", () => {
    expect(savedSessionToLayoutTab(record(), "recovery-1")?.transport).toBe("ssh");
    expect(
      savedSessionToLayoutTab(record({ transport: "serial", profileId: "COM3" }), "recovery-1")
        ?.transport
    ).toBe("serial");
  });

  it("carries the host id through for ssh sessions", () => {
    expect(
      savedSessionToLayoutTab(record({ hostId: "host-1" }), "recovery-1")?.hostId
    ).toBe("host-1");
  });

  it("preserves the transport and profile while mapping a saved session", () => {
    expect(savedSessionToLayoutTab(record({ transport: "sftp" }), "recovery-1")).toMatchObject({
      transport: "sftp",
      profileId: "host-1",
    });
  });
});

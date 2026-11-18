import { describe, expect, it } from "vitest";

import { fsListRequestSchema, openSessionRequestSchema, workspaceLayoutSchema } from "../../../src/ipc/schemas";

describe("openSessionRequestSchema", () => {
  it("rejects SFTP as a terminal session transport", () => {
    expect(openSessionRequestSchema.safeParse({
      transport: "sftp",
      profileId: "host-1",
      cols: 120,
      rows: 40,
    }).success).toBe(false);
  });

  it("accepts ssh requests", () => {
    const result = openSessionRequestSchema.parse({
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });

    expect(result.transport).toBe("ssh");
  });
});

describe("workspaceLayoutSchema", () => {
  it("accepts generic plugin tab markers and legacy SFTP tab markers", () => {
    for (const type of ["plugin", "sftp"] as const) {
      expect(workspaceLayoutSchema.safeParse({
        tabs: [{ transport: "ssh", profileId: "tab-1", title: "View", type }],
        splitDirection: "horizontal",
        paneSizes: [100],
        paneCount: 1,
      }).success).toBe(true);
    }
  });

  it("preserves legacy extension fields for plugin-owned workspace migrations", () => {
    const result = workspaceLayoutSchema.parse({
      tabs: [{
        transport: "local",
        profileId: "profile-1",
        title: "PowerShell",
        claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
      }],
      splitDirection: "horizontal",
      paneSizes: [100],
      paneCount: 1,
    });

    expect(result.tabs[0]).toHaveProperty("claudeSessionId");
  });
});

describe("generic filesystem schemas", () => {
  it("validates filesystem list requests", () => {
    expect(fsListRequestSchema.safeParse({ path: "C:\\Users" }).success).toBe(true);
  });
});

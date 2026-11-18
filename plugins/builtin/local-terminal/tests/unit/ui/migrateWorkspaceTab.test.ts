import { describe, expect, it } from "vitest";
import { migrateLocalTerminalWorkspaceTab } from "../../../ui/migrateWorkspaceTab";

describe("migrateLocalTerminalWorkspaceTab", () => {
  it("moves legacy recovery metadata into the plugin namespace without dropping data", () => {
    const migrated = migrateLocalTerminalWorkspaceTab({
      transport: "local",
      profileId: "profile-1",
      title: "PowerShell",
      claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
      pluginData: {
        "local-terminal": { marker: "existing" },
        "example.plugin": { preserved: true },
      },
    });

    expect(migrated).toEqual({
      transport: "local",
      profileId: "profile-1",
      title: "PowerShell",
      pluginData: {
        "local-terminal": {
          marker: "existing",
          claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
        },
        "example.plugin": { preserved: true },
      },
    });
  });

  it("leaves tabs without legacy local-terminal metadata unchanged", () => {
    const tab = { transport: "ssh", pluginData: { "example.plugin": { preserved: true } } };
    expect(migrateLocalTerminalWorkspaceTab(tab)).toBe(tab);
  });
});

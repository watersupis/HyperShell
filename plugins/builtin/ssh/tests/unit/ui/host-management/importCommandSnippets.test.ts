import { describe, expect, it, vi } from "vitest";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { importCommandSnippets } from "../../../../ui/host-management/importCommandSnippets";

const snippet = { id: "source-1", name: "Restart API", command: "systemctl restart api", category: null, sortOrder: 0 };

function bridge(overrides: Partial<PluginUiHostServices["externalPlugins"]> = {}): PluginUiHostServices["externalPlugins"] {
  return {
    list: async () => [{
      manifest: { id: "com.example.commands", dataImports: ["hypershell.command-snippets.v1"] },
      grantedPermissions: ["storage.write"],
    }],
    invoke: async () => undefined,
    ...overrides,
  };
}

describe("importCommandSnippets", () => {
  it("routes records to the manifest-declared receiver through generic plugin storage", async () => {
    const invoke = vi.fn(async () => undefined);
    const result = await importCommandSnippets(bridge({ invoke }), [snippet]);

    expect(result).toEqual({ imported: 1, warning: null });
    expect(invoke).toHaveBeenCalledWith({
      id: "com.example.commands",
      method: "storage.upsert",
      args: ["snippets", "sm-source-1", { id: "sm-source-1", name: "Restart API", body: "systemctl restart api" }],
    });
  });

  it("does not write without a declared receiver or storage permission", async () => {
    const invoke = vi.fn();
    await expect(importCommandSnippets(bridge({ list: async () => [] }), [snippet]))
      .resolves.toMatchObject({ imported: 0, warning: expect.stringContaining("No installed plugin") });
    await expect(importCommandSnippets(bridge({
      list: async () => [{ manifest: { id: "com.example.commands", dataImports: ["hypershell.command-snippets.v1"] }, grantedPermissions: [] }],
      invoke,
    }), [snippet])).resolves.toMatchObject({ imported: 0, warning: expect.stringContaining("storage write permission") });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports partial storage failures without hiding successful imports", async () => {
    const invoke = vi.fn(async ({ args }: { id: string; method: string; args: unknown[] }) => {
      if (args[1] === "sm-source-2") throw new Error("write failed");
    });
    const second = { ...snippet, id: "source-2", name: "Stop API" };
    await expect(importCommandSnippets(bridge({ invoke }), [snippet, second]))
      .resolves.toEqual({ imported: 1, warning: "1 command snippet(s) could not be imported." });
  });
});

import { describe, expect, it } from "vitest";
import { pluginManifestSchema } from "../../src/manifest";

const validManifest = {
  formatVersion: 1,
  id: "com.example.plugin",
  name: "Example",
  version: "1.0.0",
  apiVersion: "1.0.0",
  description: "Example plugin",
  entrypoint: "dist/index.js",
  permissions: ["hosts.read"],
  contributions: ["views"],
};

describe("plugin manifest schema", () => {
  it("accepts a valid manifest", () => {
    expect(pluginManifestSchema.parse(validManifest)).toEqual(validManifest);
  });

  it("accepts the generic workbench panel as a placement and view slot", () => {
    const manifest = {
      ...validManifest,
      ui: { placement: "workspace.panel", slots: ["workspace.panel"] },
    };

    expect(pluginManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("accepts navigation and terminal toolbar as contribution slots", () => {
    const manifest = {
      ...validManifest,
      ui: { placement: "workspace.secondarySidebar", slots: ["sidebar.navigation", "terminal.toolbar", "workspace.tab", "workspace.secondarySidebar"] },
    };

    expect(pluginManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it.each(["../index.js", "/dist/index.js", "dist\\index.js"])("rejects unsafe entrypoint %s", (entrypoint) => {
    expect(pluginManifestSchema.safeParse({ ...validManifest, entrypoint }).success).toBe(false);
  });

  it("rejects duplicate permissions and unknown fields", () => {
    expect(pluginManifestSchema.safeParse({ ...validManifest, permissions: ["hosts.read", "hosts.read"] }).success).toBe(false);
    expect(pluginManifestSchema.safeParse({ ...validManifest, unexpected: true }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { createSandboxDocument } from "../../../../src/workbench/plugin-runtime/sandboxDocument";

describe("createSandboxDocument", () => {
  it("loads plugin source through a data module under a restrictive CSP", () => {
    const source = "export const plugin = { activate: async () => ({ dispose() {} }) };";
    const document = createSandboxDocument({
      pluginId: "com.example.test",
      locale: "zh-CN",
      manifest: { id: "com.example.test", ui: { placement: "workspace.secondarySidebar", slots: ["workspace.secondarySidebar", "workspace.header"] } },
      launchContext: { hostId: "host-1", surface: "workspace.header", sessionTargets: [{ id: "session-1", name: "Local terminal" }] },
      grantedPermissions: [],
      source,
    });

    expect(document).toContain("<html lang=\"zh-CN\">");
    expect(document).toContain("default-src 'none'");
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("script-src data:");
    expect(document).not.toContain("unsafe-eval");
    const bootstrapMatch = /<script type="module" src="data:text\/javascript;base64,([A-Za-z0-9+/=]+)"><\/script>/.exec(document);
    expect(bootstrapMatch).not.toBeNull();
    const bootstrap = Buffer.from(bootstrapMatch![1], "base64").toString("utf8");
    expect(bootstrap).toContain('"workspace.toolbar"');
    expect(bootstrap).toContain('"workspace.secondarySidebar"');
    expect(bootstrap).toContain('"workspace.header"');
    expect(bootstrap).toContain('"hostId":"host-1"');
    expect(bootstrap).toContain('"surface":"workspace.header"');
    expect(bootstrap).toContain('"name":"Local terminal"');
    expect(bootstrap).toContain('beforeunload');
    expect(bootstrap).toContain('"plugin.navigationAttempt"');
    expect(bootstrap).toContain("Commands may only contribute to workspace.toolbar");
    expect(bootstrap).toContain("Views may only contribute to slots declared in the plugin manifest");
    const pluginMatch = /import\("data:text\/javascript;base64,([A-Za-z0-9+/=]+)"\)/.exec(bootstrap);
    expect(pluginMatch).not.toBeNull();
    expect(Buffer.from(pluginMatch![1], "base64").toString("utf8")).toBe(source);
  });
});

import { describe, expect, it } from "vitest";
import { ipcChannels } from "@hypershell/shared";
import { registerInternalPluginsIpc } from "../../../../../src/main/platform/ipc/internalPluginsIpc";
import { createPluginMainMethodRegistry } from "../../../../../src/main/plugin-runtime/pluginMainMethodRegistry";

const pluginCatalog = [
  { id: "ssh", title: "SSH", description: "SSH", kind: "core" },
  { id: "sftp", title: "SFTP", description: "SFTP", kind: "optional" },
  { id: "local-terminal", title: "Local Terminal", description: "Local terminal", kind: "optional" },
] as const;

function createHarness(initialValue?: string) {
  const rows = new Map<string, string>();
  if (initialValue !== undefined) rows.set("internal_plugins_enabled", initialValue);
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const db = {
    prepare(sql: string) {
      if (sql.startsWith("SELECT")) {
        return { get: (key: string) => rows.has(key) ? { value: rows.get(key)! } : undefined, run() {} };
      }
      return { get() { return undefined; }, run(key: string, value: string) { rows.set(key, value); } };
    },
  };
  const ipc = { handle(channel: string, handler: (...args: unknown[]) => unknown) { handlers.set(channel, handler); } };
  const invoke = (channel: string, ...args: unknown[]) => handlers.get(channel)?.({}, ...args);
  return { db, invoke, rows, ipc };
}

describe("internal plugin lifecycle settings", () => {
  it("defaults optional plugins to disabled while keeping SSH core", () => {
    const harness = createHarness();
    expect([...registerInternalPluginsIpc(harness.ipc as never, () => harness.db, pluginCatalog, createPluginMainMethodRegistry())]).toEqual([]);
    expect(harness.invoke(ipcChannels.internalPlugins.list)).toEqual([
      { id: "ssh", enabled: true, kind: "core" },
      { id: "sftp", enabled: false, kind: "optional" },
      { id: "local-terminal", enabled: false, kind: "optional" },
    ]);
  });

  it("persists optional plugin changes and rejects SSH changes", () => {
    const harness = createHarness();
    registerInternalPluginsIpc(harness.ipc as never, () => harness.db, pluginCatalog, createPluginMainMethodRegistry());
    expect(harness.invoke(ipcChannels.internalPlugins.setEnabled, { id: "sftp", value: true }))
      .toEqual({ restartRequired: true });
    expect(JSON.parse(harness.rows.get("internal_plugins_enabled")!)).toEqual(["sftp"]);
    expect(() => harness.invoke(ipcChannels.internalPlugins.setEnabled, { id: "ssh", value: false })).toThrow();
  });

  it("invokes only a registered internal-plugin method using a validated envelope", async () => {
    const harness = createHarness();
    const methods = createPluginMainMethodRegistry();
    methods.register("local-terminal", "session.info", async (payload) => ({ payload }));
    registerInternalPluginsIpc(harness.ipc as never, () => harness.db, pluginCatalog, methods);

    await expect(harness.invoke(ipcChannels.internalPlugins.invoke, {
      pluginId: "local-terminal",
      method: "session.info",
      payload: { sessionId: "session-1" },
    })).resolves.toEqual({ payload: { sessionId: "session-1" } });
    await expect(harness.invoke(ipcChannels.internalPlugins.invoke, {
      pluginId: "missing-plugin",
      method: "session.info",
      payload: {},
    })).rejects.toThrow("Plugin main method is unavailable");
    expect(() => harness.invoke(ipcChannels.internalPlugins.invoke, {
      pluginId: "local-terminal",
      method: "session.info",
      payload: {},
      unexpected: true,
    })).toThrow();
  });
});

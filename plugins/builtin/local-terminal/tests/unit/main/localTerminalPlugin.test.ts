import { describe, expect, it, vi } from "vitest";
import type { PluginIpcMain, PluginMainMethodRegistry } from "@hypershell/plugin-api";
import type { SessionTransportFactory } from "@hypershell/session-core";
import { registerLocalTerminalPlugin } from "../../../main";

describe("Local Terminal plugin lifecycle", () => {
  it("registers and removes the local transport with its profile IPC", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain: PluginIpcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn((channel) => handlers.delete(channel)),
    };
    const unregisterTransport = vi.fn();
    const unregisterPreparer = vi.fn();
    const unregisterLifecycle = vi.fn();
    const unregisterRecovery = vi.fn();
    const methods = new Map<string, (payload: unknown) => unknown>();
    const pluginMainMethods: PluginMainMethodRegistry = {
      register(pluginId, method, handler) {
        const key = `${pluginId}.${method}`;
        methods.set(key, handler);
        return () => methods.delete(key);
      },
    };
    let factory: SessionTransportFactory | undefined;

    const dispose = registerLocalTerminalPlugin(
      ipcMain,
      () => ({ list: vi.fn(() => []), create: vi.fn(), remove: vi.fn() }) as never,
      (_transport: "local", nextFactory: SessionTransportFactory) => {
        factory = nextFactory;
        return unregisterTransport;
      },
      (_transport, _preparer) => unregisterPreparer,
      (_listener) => unregisterLifecycle,
      (_transport, _provider) => unregisterRecovery,
      vi.fn(),
      vi.fn() as never,
      pluginMainMethods,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handlers.size).toBeGreaterThan(0);
    expect(factory).toBeTypeOf("function");
    expect(methods.has("local-terminal.claude.sessionInfo")).toBe(true);

    dispose();

    expect(handlers.size).toBe(0);
    expect(methods.size).toBe(0);
    expect(unregisterPreparer).toHaveBeenCalledOnce();
    expect(unregisterLifecycle).toHaveBeenCalledOnce();
    expect(unregisterRecovery).toHaveBeenCalledOnce();
    expect(unregisterTransport).toHaveBeenCalledOnce();
  });
});

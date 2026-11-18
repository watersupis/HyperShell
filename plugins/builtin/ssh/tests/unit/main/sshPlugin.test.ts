import { describe, expect, it, vi } from "vitest";
import type { PluginIpcMain } from "@hypershell/plugin-api";
import type { PluginMainMethodRegistry } from "@hypershell/plugin-api";
import type { SessionCommandExecutor, SessionOpenPreparer, SessionTransportFactory } from "@hypershell/session-core";
import { registerSshPlugin } from "../../../main";

describe("SSH plugin IPC lifecycle", () => {
  it("registers and removes the SSH import handlers with the plugin", () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const methods = new Map<string, (payload: unknown) => unknown>();
    const ipcMain: PluginIpcMain = {
      handle: vi.fn((channel, handler) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel) => {
        handlers.delete(channel);
      }),
    };
    const hostsRepository = {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
      remove: vi.fn(() => true),
      updateSortOrders: vi.fn(),
    };
    const groupsRepository = {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
      remove: vi.fn(() => true),
    };
    const unregisterTransport = vi.fn();
    const unregisterOpenPreparer = vi.fn();
    const unregisterCommandExecutor = vi.fn();
    const unregisterConnectionHistoryListener = vi.fn();
    const pluginMainMethods: PluginMainMethodRegistry = {
      register: vi.fn((pluginId, method, handler) => {
        const key = `${pluginId}.${method}`;
        methods.set(key, handler);
        return () => { methods.delete(key); };
      }),
    };
    let transportFactory: SessionTransportFactory | undefined;
    let sessionOpenPreparer: SessionOpenPreparer | undefined;
    let commandExecutor: SessionCommandExecutor | undefined;
    const spawnPty = vi.fn(() => ({
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: () => ({ dispose: vi.fn() }),
      onExit: () => ({ dispose: vi.fn() }),
    })) as never;

    const dispose = registerSshPlugin({
      ipcMain,
      platform: {
        paths: {
          getUserDataDirectory: () => "/tmp",
          getTemporaryDirectory: () => "/tmp",
          resolveSafeExportPath: (value) => value,
        },
        events: { sendToMainWindow: vi.fn() },
      },
      hostManagement: {
        passwords: {
          savedAt: () => null,
          save: () => "saved-password-profile",
          remove: vi.fn(),
        },
        setStatusTargets: vi.fn(),
      },
      pluginMainMethods,
      getHostsRepository: () => hostsRepository,
      getGroupsRepository: () => groupsRepository,
      getHost: () => undefined,
      sessionOpen: {
        resolveProfile: async () => null,
        findHost: () => null,
        getHostById: () => undefined,
        resolvePassword: async () => undefined,
        normalizeUsername: (username) => username,
        trace: vi.fn(),
      },
      registerSessionTransport: (_transport, factory) => {
        transportFactory = factory;
        return unregisterTransport;
      },
      registerSessionOpenPreparer: (_transport, preparer) => {
        sessionOpenPreparer = preparer;
        return unregisterOpenPreparer;
      },
      registerSessionLifecycleListener: vi.fn(() => unregisterConnectionHistoryListener),
      registerSessionCommandExecutor: (_transport, executor) => {
        commandExecutor = executor;
        return unregisterCommandExecutor;
      },
      getApplicationSettings: () => null,
      getDatabase: () => ({
        prepare: () => ({ run: () => ({ changes: 1 }), get: () => undefined, all: () => [] }),
      } as never),
      spawnPty,
    });

    expect(handlers.has("hosts:scan-putty")).toBe(true);
    expect(handlers.has("hosts:scan-ssh-manager")).toBe(true);
    expect(handlers.has("hosts:import-ssh-manager")).toBe(true);
    expect(handlers.has("hosts:list")).toBe(true);
    expect(handlers.has("groups:list")).toBe(true);
    expect(handlers.has("host-profiles:list")).toBe(true);
    expect(handlers.has("host-env-vars:list")).toBe(true);
    expect(handlers.has("tags:list")).toBe(true);
    expect(handlers.has("tags:get-host-tags")).toBe(true);
    expect(handlers.has("tmux:probe")).toBe(true);
    expect(methods.has("ssh.connectionHistory.listByHost")).toBe(true);
    expect(methods.has("ssh.connectionHistory.listRecent")).toBe(true);
    expect(transportFactory).toBeTypeOf("function");
    expect(sessionOpenPreparer).toBeTypeOf("function");
    expect(commandExecutor).toBeTypeOf("function");
    transportFactory?.({
      sessionId: "ssh-session",
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
      sshOptions: { hostname: "example.test" },
    });
    expect(spawnPty).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["example.test"]),
      expect.objectContaining({ cols: 80, rows: 24, name: "xterm-256color" }),
    );

    dispose();

    expect(unregisterTransport).toHaveBeenCalledOnce();
    expect(unregisterOpenPreparer).toHaveBeenCalledOnce();
    expect(unregisterCommandExecutor).toHaveBeenCalledOnce();
    expect(unregisterConnectionHistoryListener).toHaveBeenCalledOnce();
    expect(methods.size).toBe(0);
    expect(handlers.size).toBe(0);
  });
});

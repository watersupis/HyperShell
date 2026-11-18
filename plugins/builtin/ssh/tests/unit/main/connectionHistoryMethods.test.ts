import { describe, expect, it, vi } from "vitest";
import type { PluginMainMethodRegistry } from "@hypershell/plugin-api";
import type { ConnectionHistoryRepository } from "../../../main/connectionHistoryRepository";
import { registerConnectionHistoryMethods } from "../../../main/connectionHistoryMethods";

describe("SSH connection history main methods", () => {
  it("validates requests, returns validated history and unregisters methods", async () => {
    const handlers = new Map<string, (payload: unknown) => unknown>();
    const registry: PluginMainMethodRegistry = {
      register: (pluginId, method, handler) => {
        const key = `${pluginId}.${method}`;
        handlers.set(key, handler);
        return () => handlers.delete(key);
      },
    };
    const invoke = async (method: string, payload: unknown) => {
      const handler = handlers.get(`ssh.${method}`);
      if (!handler) throw new Error(`Plugin main method is unavailable: ssh.${method}`);
      return await handler(payload);
    };
    const row = {
      id: "history-1",
      hostId: "host-1",
      hostName: "Production",
      connectedAt: "2026-11-14T10:00:00.000Z",
      disconnectedAt: null,
      wasSuccessful: true,
      errorMessage: null,
    };
    const repository = {
      listByHost: vi.fn(() => [row]),
      listRecent: vi.fn(() => [row]),
    } as unknown as ConnectionHistoryRepository;
    const dispose = registerConnectionHistoryMethods(registry, repository);

    await expect(invoke("connectionHistory.listByHost", {
      hostId: "host-1",
      limit: 25,
    })).resolves.toEqual([row]);
    expect(repository.listByHost).toHaveBeenCalledWith("host-1", 25);
    await expect(invoke("connectionHistory.listByHost", {
      hostId: "",
    })).rejects.toThrow();
    await expect(invoke("connectionHistory.listRecent", undefined)).resolves.toEqual([row]);

    dispose();
    await expect(invoke("connectionHistory.listRecent", {})).rejects.toThrow(
      "Plugin main method is unavailable",
    );
  });
});

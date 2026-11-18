import { describe, expect, it, vi } from "vitest";
import type { PluginContext, PluginHostApi } from "../../src/runtime";
import type { PluginManifest, PluginPermission } from "../../src/manifest";
import { assertPluginPermission, createPermissionGuardedHostApi } from "../../src/runtime";

const manifest: PluginManifest = {
  formatVersion: 1 as const,
  id: "com.example.plugin",
  name: "Example",
  version: "1.0.0",
  apiVersion: "1.0.0",
  description: "Example plugin",
  entrypoint: "dist/index.js",
  permissions: ["hosts.read"],
  contributions: [],
};

function createContext(grantedPermissions: readonly PluginPermission[] = ["hosts.read"]): PluginContext {
  return {
    manifest,
    grantedPermissions,
    registrations: { registerCommand: () => ({ dispose() {} }), registerView: () => ({ dispose() {} }) },
    host: {} as PluginHostApi,
  };
}

describe("plugin permission guards", () => {
  it("rejects a permission that was not granted", () => {
    expect(() => assertPluginPermission(createContext(), "snippets.read")).toThrow("lacks permission");
  });

  it("checks permission before calling the host API", async () => {
    const listHosts = vi.fn(async () => [{ id: "host-1", name: "Server" }]);
    const host = { hosts: { list: listHosts } } as unknown as PluginHostApi;
    const guarded = createPermissionGuardedHostApi(createContext(), host);

    await expect(guarded.hosts.list()).resolves.toEqual([{ id: "host-1", name: "Server" }]);
    await expect(Promise.resolve().then(() => guarded.storage.list("items"))).rejects.toThrow("lacks permission");
    expect(listHosts).toHaveBeenCalledTimes(1);
  });

  it("guards generic plugin storage operations and legacy claims", async () => {
    const storage = {
      list: vi.fn(async () => [{ key: "one", value: { value: 1 } }]),
      upsert: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      claimLegacy: vi.fn(async () => 1),
    };
    const context: PluginContext = {
      ...createContext(["hosts.read"]),
      manifest: { ...manifest, permissions: ["storage.read", "storage.write"] },
      grantedPermissions: ["storage.read", "storage.write"],
    };
    const guarded = createPermissionGuardedHostApi(context, { storage } as unknown as PluginHostApi);

    await expect(guarded.storage.list("items")).resolves.toEqual([{ key: "one", value: { value: 1 } }]);
    await guarded.storage.upsert("items", "one", { value: 2 });
    await expect(guarded.storage.claimLegacy("legacy.items", "items")).resolves.toBe(1);
    expect(storage.upsert).toHaveBeenCalledWith("items", "one", { value: 2 });
    expect(storage.claimLegacy).toHaveBeenCalledWith("legacy.items", "items");
  });

  it("requires separate permissions for metrics, process termination and Docker actions", async () => {
    const inspect = vi.fn(async () => "ok");
    const context = { ...createContext(["processes.read"]), grantedPermissions: ["processes.read"] as PluginPermission[] };
    const guarded = createPermissionGuardedHostApi(context, { systems: { inspect } } as unknown as PluginHostApi);
    await expect(guarded.systems.inspect("session-1", "processes")).resolves.toBe("ok");
    await expect(guarded.systems.inspect("session-1", "metrics")).rejects.toThrow("monitoring.read");
    await expect(guarded.systems.inspect("session-1", "terminate-process", "42")).rejects.toThrow("processes.terminate");
    expect(inspect).toHaveBeenCalledTimes(1);
  });
});

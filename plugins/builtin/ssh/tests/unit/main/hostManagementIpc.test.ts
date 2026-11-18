import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGroupsRepositoryFromDatabase,
  createHostsRepositoryFromDatabase,
  openDatabase,
} from "@hypershell/db";
import type { SqliteDatabase } from "@hypershell/db";
import type { PluginIpcMain, PluginPlatformApi } from "@hypershell/plugin-api";
import { ipcChannels } from "@hypershell/shared";
import { registerHostManagementIpc } from "../../../main/hostManagementIpc";

type Handler = (...args: unknown[]) => unknown;

describe("SSH host management IPC", () => {
  const handlers = new Map<string, Handler>();
  const removeHandler = vi.fn((channel: string) => handlers.delete(channel));
  const ipcMain: PluginIpcMain = {
    handle: (channel, handler) => { handlers.set(channel, handler); },
    removeHandler,
  };
  let database: SqliteDatabase | undefined;
  let hosts: ReturnType<typeof createHostsRepositoryFromDatabase>;
  let groups: ReturnType<typeof createGroupsRepositoryFromDatabase>;
  const savedPasswordRemove = vi.fn();
  const setStatusTargets = vi.fn();
  const platform: PluginPlatformApi = {
    paths: {
      getUserDataDirectory: () => "/tmp",
      getTemporaryDirectory: () => "/tmp",
      resolveSafeExportPath: (filePath) => filePath,
    },
    events: { sendToMainWindow: vi.fn() },
  };
  let dispose: (() => void) | undefined;

  const setup = () => {
    dispose?.();
    handlers.clear();
    database?.close();
    database = openDatabase();
    hosts = createHostsRepositoryFromDatabase(database);
    groups = createGroupsRepositoryFromDatabase(database);
    removeHandler.mockClear();
    savedPasswordRemove.mockClear();
    setStatusTargets.mockClear();
    dispose = registerHostManagementIpc({
      ipcMain,
      platform,
      getHostsRepository: () => hosts,
      getGroupsRepository: () => groups,
      passwords: {
        savedAt: () => null,
        save: () => {
          database!.prepare("INSERT INTO auth_profiles (id, name, type) VALUES (?, ?, 'password')")
            .run("saved-password-profile", "saved-password-profile");
          return "saved-password-profile";
        },
        remove: savedPasswordRemove,
      },
      setStatusTargets,
    });
  };

  const call = (channel: string, request?: unknown) => handlers.get(channel)!({}, request);

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    database?.close();
    database = undefined;
  });

  it("persists the host group name returned from the shared repository", () => {
    setup();
    const first = call(ipcChannels.hosts.upsert, {
      id: "host-group-a", name: "web", hostname: "web.example.test", group: "Production",
    }) as { group: string; groupId: string };

    expect(first.group).toBe("Production");
    expect(call(ipcChannels.groups.list)).toContainEqual(
      expect.objectContaining({ id: first.groupId, name: "Production" }),
    );
  });

  it("reuses the existing group row when assigning another host", () => {
    setup();
    const first = call(ipcChannels.hosts.upsert, {
      id: "host-group-reuse-a", name: "web", hostname: "web.example.test", group: "Production",
    }) as { groupId: string };
    const second = call(ipcChannels.hosts.upsert, {
      id: "host-group-reuse-b", name: "api", hostname: "api.example.test", group: "Production",
    }) as { groupId: string };
    expect(second.groupId).toBe(first.groupId);
  });

  it("updates group assignment during reorder and clears it when omitted", () => {
    setup();
    call(ipcChannels.hosts.upsert, {
      id: "host-group-reorder", name: "worker", hostname: "worker.example.test", group: "Staging",
    });
    call(ipcChannels.hosts.reorder, {
      items: [{ id: "host-group-reorder", sortOrder: 0, groupId: null, group: "" }],
    });
    const host = (call(ipcChannels.hosts.list) as Array<{ id: string; groupId: string | null; group: string }>)
      .find((item) => item.id === "host-group-reorder");
    expect(host).toMatchObject({ groupId: null, group: "" });
  });

  it("clears group assignment when an upsert explicitly omits or empties the group", () => {
    setup();
    call(ipcChannels.hosts.upsert, {
      id: "host-group-clear", name: "worker", hostname: "worker.example.test", group: "Staging",
    });
    const cleared = call(ipcChannels.hosts.upsert, {
      id: "host-group-clear", name: "worker", hostname: "worker.example.test", group: "",
    }) as { groupId: string | null; group: string };
    expect(cleared).toMatchObject({ groupId: null, group: "" });

    call(ipcChannels.hosts.upsert, {
      id: "host-group-clear-omitted", name: "edge", hostname: "edge.example.test", group: "Staging",
    });
    const omitted = call(ipcChannels.hosts.upsert, {
      id: "host-group-clear-omitted", name: "edge", hostname: "edge.example.test",
    }) as { groupId: string | null; group: string };
    expect(omitted).toMatchObject({ groupId: null, group: "" });
  });

  it("delegates password removal and status targets to platform services", () => {
    setup();
    call(ipcChannels.hosts.upsert, {
      id: "host-password", name: "secure", hostname: "secure.example.test",
      authMethod: "password", savePassword: true, password: "secret",
    });
    call(ipcChannels.hosts.remove, { id: "host-password" });
    call(ipcChannels.hosts.setStatusTargets, { hostIds: ["host-a"] });

    expect(savedPasswordRemove).toHaveBeenCalledWith("saved-password-profile");
    expect(setStatusTargets).toHaveBeenCalledWith(["host-a"]);
  });

  it("removes all host-management handlers when the plugin is deactivated", () => {
    setup();
    const registeredCount = handlers.size;
    expect(registeredCount).toBeGreaterThan(0);
    dispose?.();
    dispose = undefined;

    expect(handlers.size).toBe(0);
    expect(removeHandler).toHaveBeenCalledTimes(registeredCount);
  });
});

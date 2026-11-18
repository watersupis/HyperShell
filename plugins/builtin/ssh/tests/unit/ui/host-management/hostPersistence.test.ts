import { describe, expect, it, vi } from "vitest";
import type { HostFormValue, HostRecord, TagRecord } from "@hypershell/shared";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { createHostRecord, mapHostRecord, normalizeHostEnvVars, persistHostRecord } from "../../../../ui/host-management/hostPersistence";

const dbHost: HostRecord = {
  id: "host-1",
  name: "Production",
  hostname: "example.test",
  port: 2200,
  username: "admin",
  identityFile: null,
  authProfileId: "auth-1",
  groupId: null,
  group: "Servers",
  notes: null,
  authMethod: "password",
  agentKind: "system",
  opReference: null,
  isFavorite: true,
  sortOrder: 2,
  color: "#336699",
  proxyJump: null,
  proxyJumpHostIds: null,
  keepAliveInterval: 30,
  autoReconnect: true,
  reconnectMaxAttempts: 4,
  reconnectBaseInterval: 3,
  passwordSavedAt: "2026-11-08T00:00:00.000Z",
  tmuxDetect: true,
  shellIntegration: true,
};

const formValue: HostFormValue = {
  name: "Production",
  hostname: "example.test",
  port: 2200,
  username: "admin",
  identityFile: "",
  hostProfileId: "",
  envVars: [
    { id: "valid", name: "APP_ENV", value: "prod", isEnabled: true, sortOrder: 9 },
    { id: "invalid", name: "NOT VALID", value: "ignored", isEnabled: true, sortOrder: 1 },
  ],
  group: "Servers",
  tags: "Production",
  tagIds: ["tag-1", "tag-1"],
  authMethod: "password",
  agentKind: "system",
  opReference: "",
  proxyJump: "",
  proxyJumpHostIds: "",
  keepAliveInterval: " 30 ",
  autoReconnect: true,
  reconnectMaxAttempts: 4,
  reconnectBaseInterval: 3,
  password: "secret",
  savePassword: true,
  clearSavedPassword: false,
  tmuxDetect: true,
  shellIntegration: true,
};

describe("SSH host persistence contribution", () => {
  it("maps persisted SSH settings and does not expose stored credentials", () => {
    const mapped = mapHostRecord(dbHost);

    expect(mapped).toMatchObject({
      id: "host-1",
      port: 2200,
      keepAliveInterval: "30",
      isFavorite: true,
      hasSavedPassword: true,
      password: "",
      savePassword: false,
    });
  });

  it("normalizes environment variables and strips credentials from the UI record", () => {
    expect(normalizeHostEnvVars(formValue.envVars)).toEqual([
      { id: "valid", name: "APP_ENV", value: "prod", isEnabled: true, sortOrder: 0 },
    ]);
    expect(createHostRecord(formValue, "host-new")).toMatchObject({
      id: "host-new",
      tagIds: ["tag-1"],
      password: "",
      savePassword: false,
      hasSavedPassword: true,
    });
  });

  it("persists host fields, password policy, environment variables and tags", async () => {
    const upsert = vi.fn(async () => dbHost);
    const replace = vi.fn(async () => undefined);
    const tags: TagRecord[] = [{ id: "tag-1", name: "Production", color: null }];
    const setForHost = vi.fn(async () => tags);
    const host = {
      hostManagement: {
        hosts: { upsert },
        environment: { replace },
        tags: { setForHost },
      },
    } as unknown as PluginUiHostServices;
    const record = createHostRecord(formValue, "host-new");
    const persisted = await persistHostRecord({ ...record, password: formValue.password, savePassword: true }, host);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "host-new",
      keepAliveInterval: 30,
      savePassword: true,
      password: "secret",
    }));
    expect(replace).toHaveBeenCalledWith({
      hostId: "host-new",
      envVars: [{ id: "valid", name: "APP_ENV", value: "prod", isEnabled: true, sortOrder: 0 }],
    });
    expect(setForHost).toHaveBeenCalledWith({ hostId: "host-new", tagIds: ["tag-1"] });
    expect(persisted).toMatchObject({ tagIds: ["tag-1"], tags: "Production", password: "" });
  });

  it("does not persist environment variables or tags when host upsert fails", async () => {
    const replace = vi.fn();
    const setForHost = vi.fn();
    const host = {
      hostManagement: {
        hosts: { upsert: vi.fn().mockRejectedValue(new Error("save failed")) },
        environment: { replace },
        tags: { setForHost },
      },
    } as unknown as PluginUiHostServices;

    await expect(persistHostRecord(createHostRecord(formValue, "host-new"), host)).resolves.toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(setForHost).not.toHaveBeenCalled();
  });

  it("can persist host-list fields without rewriting related SSH data", async () => {
    const replace = vi.fn();
    const setForHost = vi.fn();
    const host = {
      hostManagement: {
        hosts: { upsert: vi.fn(async () => dbHost) },
        environment: { replace },
        tags: { setForHost },
      },
    } as unknown as PluginUiHostServices;

    await persistHostRecord(
      { ...mapHostRecord(dbHost), color: "#ff0000" },
      host,
      { persistRelatedData: false }
    );

    expect(replace).not.toHaveBeenCalled();
    expect(setForHost).not.toHaveBeenCalled();
  });
});

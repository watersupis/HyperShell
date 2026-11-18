import type { GroupRecord, HostInput, HostRecord } from "@hypershell/db";
import type { PluginIpcMain, PluginPlatformApi } from "@hypershell/plugin-api";
import {
  HOST_OPTION_DEFAULTS,
  exportHostsRequestSchema,
  hostStatusTargetsRequestSchema,
  ipcChannels,
  removeGroupRequestSchema,
  removeHostRequestSchema,
  reorderHostsRequestSchema,
  upsertGroupRequestSchema,
  upsertHostRequestSchema,
  type UpsertHostRequest,
} from "@hypershell/shared";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { IpcMainInvokeEvent } from "electron";
import {
  exportHostsToCsv,
  exportHostsToJson,
  exportHostsToSshConfig,
} from "./hostExport";

export interface HostManagementRepository {
  create(input: HostInput): HostRecord;
  get(id: string): HostRecord | undefined;
  list(): HostRecord[];
  remove(id: string): boolean;
  updateSortOrders(items: Array<{ id: string; sortOrder: number; groupId: string | null }>): void;
}

export interface HostGroupsRepository {
  create(input: { id: string; name: string; description?: string | null }): GroupRecord;
  get(id: string): GroupRecord | undefined;
  list(): GroupRecord[];
  remove(id: string): boolean;
}

export interface HostManagementServices {
  ipcMain: PluginIpcMain;
  platform: PluginPlatformApi;
  getHostsRepository(): HostManagementRepository;
  getGroupsRepository(): HostGroupsRepository;
  passwords: {
    savedAt(host: Pick<HostRecord, "authMethod" | "authProfileId">): string | null;
    save(input: { hostId: string; hostName: string; username: string | null; password: string; existingAuthProfileId?: string | null }): string;
    remove(authProfileId: string | null | undefined): void;
  };
  setStatusTargets(hostIds: string[]): void;
}

function findOrCreateGroupId(repo: HostGroupsRepository, name: string | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return null;
  return repo.list().find((group) => group.name === trimmed)?.id
    ?? repo.create({ id: `group-${randomUUID()}`, name: trimmed }).id;
}

function presentHost(
  host: HostRecord,
  groups: HostGroupsRepository,
  passwords: HostManagementServices["passwords"],
) {
  return {
    ...host,
    passwordSavedAt: passwords.savedAt(host),
    group: host.groupId ? groups.get(host.groupId)?.name ?? "" : "",
  };
}

export function registerHostManagementIpc(services: HostManagementServices): () => void {
  const { ipcMain } = services;
  ipcMain.handle(ipcChannels.hosts.list, () => {
    const groups = services.getGroupsRepository();
    return services.getHostsRepository().list().map((host) =>
      presentHost(host, groups, services.passwords),
    );
  });

  ipcMain.handle(ipcChannels.hosts.upsert, (_event: IpcMainInvokeEvent, request: UpsertHostRequest) => {
    const parsed = upsertHostRequestSchema.parse(request);
    const hosts = services.getHostsRepository();
    const groups = services.getGroupsRepository();
    const existing = hosts.get(parsed.id);
    const authMethod = parsed.authMethod ?? HOST_OPTION_DEFAULTS.authMethod;
    let authProfileId = existing?.authProfileId ?? null;
    const password = parsed.password ?? "";

    if (authMethod === "password") {
      if (parsed.clearSavedPassword) {
        services.passwords.remove(authProfileId);
        authProfileId = null;
      }
      if (parsed.savePassword) {
        if (!password.trim()) throw new Error("Password is required when 'Save password' is enabled.");
        authProfileId = services.passwords.save({
          hostId: parsed.id,
          hostName: parsed.name,
          username: parsed.username ?? null,
          password,
          existingAuthProfileId: authProfileId,
        });
      }
    } else if (authProfileId) {
      services.passwords.remove(authProfileId);
      authProfileId = null;
    }

    const host = hosts.create({
      id: parsed.id,
      name: parsed.name,
      hostname: parsed.hostname,
      port: parsed.port,
      username: parsed.username,
      identityFile: parsed.identityFile,
      hostProfileId: parsed.hostProfileId,
      groupId: findOrCreateGroupId(groups, parsed.group),
      authProfileId,
      notes: parsed.notes,
      authMethod,
      agentKind: parsed.agentKind,
      opReference: parsed.opReference,
      isFavorite: parsed.isFavorite,
      color: parsed.color,
      sortOrder: parsed.sortOrder,
      proxyJump: parsed.proxyJump,
      proxyJumpHostIds: parsed.proxyJumpHostIds,
      keepAliveInterval: parsed.keepAliveInterval,
      autoReconnect: parsed.autoReconnect,
      reconnectMaxAttempts: parsed.reconnectMaxAttempts,
      reconnectBaseInterval: parsed.reconnectBaseInterval,
      tmuxDetect: parsed.tmuxDetect,
      shellIntegration: parsed.shellIntegration,
    });
    return presentHost(host, groups, services.passwords);
  });

  ipcMain.handle(ipcChannels.hosts.reorder, (_event, request: unknown) => {
    const parsed = reorderHostsRequestSchema.parse(request);
    const groups = services.getGroupsRepository();
    services.getHostsRepository().updateSortOrders(parsed.items.map((item) => ({
      id: item.id,
      sortOrder: item.sortOrder,
      groupId: item.group !== undefined ? findOrCreateGroupId(groups, item.group) : item.groupId,
    })));
    return { success: true };
  });

  ipcMain.handle(ipcChannels.hosts.remove, (_event, request: unknown) => {
    const parsed = removeHostRequestSchema.parse(request);
    const hosts = services.getHostsRepository();
    const existing = hosts.get(parsed.id);
    if (!hosts.remove(parsed.id)) throw new Error(`Host not found: ${parsed.id}`);
    services.passwords.remove(existing?.authProfileId);
    return { success: true };
  });

  ipcMain.handle(ipcChannels.groups.list, () => services.getGroupsRepository().list());
  ipcMain.handle(ipcChannels.groups.upsert, (_event, request: unknown) => {
    const parsed = upsertGroupRequestSchema.parse(request);
    return services.getGroupsRepository().create({
      id: parsed.id,
      name: parsed.name,
      description: parsed.description ?? null,
    });
  });
  ipcMain.handle(ipcChannels.groups.remove, (_event, request: unknown) => {
    const parsed = removeGroupRequestSchema.parse(request);
    services.getGroupsRepository().remove(parsed.id);
  });

  ipcMain.handle(ipcChannels.hosts.exportHosts, (_event, request: unknown) => {
    const parsed = exportHostsRequestSchema.parse(request);
    const outputPath = services.platform.paths.resolveSafeExportPath(parsed.filePath);
    const hosts = services.getHostsRepository().list();
    const content = parsed.format === "json"
      ? exportHostsToJson(hosts)
      : parsed.format === "csv"
        ? exportHostsToCsv(hosts)
        : exportHostsToSshConfig(hosts);
    writeFileSync(outputPath, content, "utf8");
    return { exported: hosts.length };
  });

  ipcMain.handle(ipcChannels.hosts.setStatusTargets, (_event, request: unknown) => {
    const parsed = hostStatusTargetsRequestSchema.parse(request);
    services.setStatusTargets(parsed.hostIds);
  });

  const channels = [
    ipcChannels.hosts.list,
    ipcChannels.hosts.upsert,
    ipcChannels.hosts.remove,
    ipcChannels.hosts.reorder,
    ipcChannels.hosts.exportHosts,
    ipcChannels.hosts.setStatusTargets,
    ipcChannels.groups.list,
    ipcChannels.groups.upsert,
    ipcChannels.groups.remove,
  ];
  return () => channels.forEach((channel) => ipcMain.removeHandler?.(channel));
}

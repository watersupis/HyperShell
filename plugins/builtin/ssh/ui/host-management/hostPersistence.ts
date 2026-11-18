import {
  DEFAULT_RECONNECT_BASE_INTERVAL,
  DEFAULT_RECONNECT_MAX_ATTEMPTS,
  ENV_VAR_NAME_REGEX,
  type HostFormValue,
  type HostRecord as HostDbRecord,
  type TagRecord,
  type HostUiRecord,
} from "@hypershell/shared";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

export function normalizeHostEnvVars(
  envVars: HostFormValue["envVars"] | undefined
): HostFormValue["envVars"] {
  if (!Array.isArray(envVars)) return [];

  return envVars
    .map((item, index) => ({
      id: item.id,
      name: item.name.trim(),
      value: item.value ?? "",
      isEnabled: item.isEnabled ?? true,
      sortOrder: index,
    }))
    .filter((item) => item.name.length > 0 && ENV_VAR_NAME_REGEX.test(item.name));
}

export function mapHostRecord(record: HostDbRecord): HostUiRecord {
  return {
    id: record.id,
    name: record.name,
    hostname: record.hostname,
    port: record.port ?? 22,
    username: record.username ?? "",
    identityFile: record.identityFile ?? "",
    hostProfileId: record.hostProfileId ?? "",
    envVars: [],
    group: record.group ?? "",
    tags: "",
    tagIds: [],
    authMethod: record.authMethod ?? "default",
    agentKind: record.agentKind ?? "system",
    opReference: record.opReference ?? "",
    notes: record.notes ?? undefined,
    isFavorite: record.isFavorite ?? false,
    sortOrder: record.sortOrder ?? null,
    color: record.color ?? null,
    proxyJump: record.proxyJump ?? "",
    proxyJumpHostIds: record.proxyJumpHostIds ?? "",
    keepAliveInterval: record.keepAliveInterval == null ? "" : String(record.keepAliveInterval),
    autoReconnect: record.autoReconnect ?? false,
    tmuxDetect: record.tmuxDetect ?? false,
    shellIntegration: record.shellIntegration ?? true,
    reconnectMaxAttempts: record.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX_ATTEMPTS,
    reconnectBaseInterval: record.reconnectBaseInterval ?? DEFAULT_RECONNECT_BASE_INTERVAL,
    password: "",
    savePassword: false,
    clearSavedPassword: false,
    hasSavedPassword: record.authMethod === "password" && record.authProfileId != null,
    passwordSavedAt: record.passwordSavedAt ?? null,
  };
}

export function createHostRecord(value: HostFormValue, id: string): HostUiRecord {
  const normalizedEnvVars = normalizeHostEnvVars(value.envVars);
  const normalizedTagIds = Array.from(new Set(value.tagIds ?? []));
  const nowIso = new Date().toISOString();
  return {
    ...value,
    id,
    envVars: normalizedEnvVars,
    tagIds: normalizedTagIds,
    password: "",
    savePassword: false,
    clearSavedPassword: false,
    hasSavedPassword:
      value.authMethod === "password"
        ? value.clearSavedPassword
          ? false
          : value.savePassword
            ? true
            : value.hasSavedPassword
        : false,
    passwordSavedAt:
      value.authMethod === "password"
        ? value.clearSavedPassword
          ? null
          : value.savePassword && (value.password ?? "").trim().length > 0
            ? nowIso
            : value.passwordSavedAt ?? null
        : null,
  };
}

export async function persistHostRecord(
  record: HostUiRecord,
  host: PluginUiHostServices,
  options: { persistRelatedData?: boolean } = {}
): Promise<HostUiRecord | null> {
  const authMethod = record.authMethod ?? "default";
  const keepAliveSource = typeof record.keepAliveInterval === "string" ? record.keepAliveInterval : "";
  const trimmedKeepAlive = keepAliveSource.trim();
  const parsedKeepAlive = trimmedKeepAlive.length === 0 ? null : Number.parseInt(trimmedKeepAlive, 10);
  const keepAliveInterval = parsedKeepAlive == null || Number.isNaN(parsedKeepAlive)
    ? null
    : Math.max(0, parsedKeepAlive);
  const savePassword = authMethod === "password" && record.savePassword;

  let persisted: HostUiRecord;
  try {
    const result = await host.hostManagement.hosts.upsert({
      id: record.id,
      name: record.name,
      hostname: record.hostname,
      port: record.port,
      username: record.username || null,
      identityFile: record.identityFile || null,
      hostProfileId: record.hostProfileId || null,
      group: record.group,
      tags: record.tags,
      notes: record.notes || null,
      authMethod,
      agentKind: record.agentKind ?? "system",
      opReference: record.opReference || null,
      isFavorite: record.isFavorite ?? false,
      color: record.color ?? null,
      sortOrder: record.sortOrder ?? null,
      proxyJump: record.proxyJump || null,
      proxyJumpHostIds: record.proxyJumpHostIds || null,
      keepAliveInterval,
      autoReconnect: record.autoReconnect ?? false,
      reconnectMaxAttempts: record.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX_ATTEMPTS,
      reconnectBaseInterval: record.reconnectBaseInterval ?? DEFAULT_RECONNECT_BASE_INTERVAL,
      tmuxDetect: record.tmuxDetect ?? false,
      shellIntegration: record.shellIntegration ?? true,
      savePassword,
      clearSavedPassword: authMethod !== "password" || record.clearSavedPassword,
      ...(savePassword && (record.password ?? "").trim().length > 0
        ? { password: record.password }
        : {}),
    });
    persisted = mapHostRecord(result);
  } catch (error) {
    console.error("[hypershell] failed to persist host:", error);
    return null;
  }

  if (options.persistRelatedData === false) return persisted;

  const envVars = normalizeHostEnvVars(record.envVars);
  try {
    await host.hostManagement.environment.replace({
      hostId: record.id,
      envVars: envVars.map(({ id, name, value, isEnabled, sortOrder }) => ({
        id, name, value, isEnabled, sortOrder,
      })),
    });
  } catch (error) {
    console.warn("[hypershell] failed to persist host env vars:", error);
  }

  let persistedTags: TagRecord[] = [];
  try {
    persistedTags = await host.hostManagement.tags.setForHost({
      hostId: record.id,
      tagIds: Array.from(new Set(record.tagIds ?? [])),
    });
  } catch (error) {
    console.warn("[hypershell] failed to persist host tags:", error);
  }

  return {
    ...persisted,
    envVars,
    tagIds: persistedTags.length > 0
      ? persistedTags.map((tag) => tag.id)
      : Array.from(new Set(record.tagIds ?? [])),
    tags: persistedTags.length > 0
      ? persistedTags.map((tag) => tag.name).join(", ")
      : record.tags,
  };
}

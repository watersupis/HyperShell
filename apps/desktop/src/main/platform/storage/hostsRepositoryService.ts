import {
  createHostsRepositoryFromDatabase,
  normalizeHostInput
} from "@hypershell/db";
import type { HostInput, HostRecord } from "@hypershell/db";
import { HOST_OPTION_DEFAULTS } from "@hypershell/shared";
import { app } from "electron";
import path from "node:path";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { closeDatabase, getOrCreateDatabase } from "../storage/database";

type HostsRepoLike = {
  create(input: HostInput): HostRecord;
  get(id: string): HostRecord | undefined;
  list(): HostRecord[];
  remove(id: string): boolean;
  updateSortOrders(items: Array<{ id: string; sortOrder: number; groupId: string | null }>): void;
};

type SettingsRecord = {
  key: string;
  value: string;
};

type SettingsRepoLike = {
  get(key: string): SettingsRecord | undefined;
  set(key: string, value: string): SettingsRecord;
};

let hostsRepo: HostsRepoLike | null = null;
let settingsRepo: SettingsRepoLike | null = null;
export function closeSharedDatabase(): void {
  try {
    closeDatabase();
  } finally {
    hostsRepo = null;
    settingsRepo = null;
  }
}
function resolveHostsFallbackPath(): string {
  return path.join(app.getPath("appData"), "HyperShell", "hosts.fallback.json");
}

export function createFileBackedHostsRepo(filePath: string): HostsRepoLike {
  type StoredHost = HostRecord;

  const readHosts = (): StoredHost[] => {
    if (!existsSync(filePath)) {
      return [];
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => ({
          id: String(item?.id ?? ""),
          name: String(item?.name ?? ""),
          hostname: String(item?.hostname ?? ""),
          port: Number(item?.port ?? HOST_OPTION_DEFAULTS.port),
          username: item?.username == null ? null : String(item.username),
          identityFile:
            item?.identityFile == null ? null : String(item.identityFile),
          hostProfileId:
            item?.hostProfileId == null ? null : String(item.hostProfileId),
          authProfileId:
            item?.authProfileId == null ? null : String(item.authProfileId),
          groupId: item?.groupId == null ? null : String(item.groupId),
          notes: item?.notes == null ? null : String(item.notes),
          authMethod: item?.authMethod == null ? HOST_OPTION_DEFAULTS.authMethod : String(item.authMethod),
          agentKind: item?.agentKind == null ? HOST_OPTION_DEFAULTS.agentKind : String(item.agentKind),
          opReference: item?.opReference == null ? null : String(item.opReference),
          isFavorite: Boolean(item?.isFavorite ?? HOST_OPTION_DEFAULTS.isFavorite),
          sortOrder: item?.sortOrder == null ? null : Number(item.sortOrder),
          color: item?.color == null ? null : String(item.color),
          proxyJump: item?.proxyJump == null ? null : String(item.proxyJump),
          proxyJumpHostIds: item?.proxyJumpHostIds == null ? null : String(item.proxyJumpHostIds),
          keepAliveInterval: item?.keepAliveInterval == null ? null : Number(item.keepAliveInterval),
          autoReconnect: Boolean(item?.autoReconnect ?? HOST_OPTION_DEFAULTS.autoReconnect),
          reconnectMaxAttempts: Number(item?.reconnectMaxAttempts ?? HOST_OPTION_DEFAULTS.reconnectMaxAttempts),
          reconnectBaseInterval: Number(item?.reconnectBaseInterval ?? HOST_OPTION_DEFAULTS.reconnectBaseInterval),
          tmuxDetect: Boolean(item?.tmuxDetect ?? HOST_OPTION_DEFAULTS.tmuxDetect),
          shellIntegration: Boolean(item?.shellIntegration ?? HOST_OPTION_DEFAULTS.shellIntegration)
        }))
        .filter((item) => item.id.length > 0 && item.name.length > 0 && item.hostname.length > 0);
    } catch {
      return [];
    }
  };

  const writeHosts = (hosts: StoredHost[]): void => {
    writeFileSync(filePath, JSON.stringify(hosts, null, 2), "utf8");
  };

  return {
    create(input: HostInput): HostRecord {
      const normalized = normalizeHostInput(input);

      const hosts = readHosts();
      const existingIndex = hosts.findIndex((host) => host.id === normalized.id);
      if (existingIndex >= 0) {
        hosts[existingIndex] = normalized;
      } else {
        hosts.push(normalized);
      }

      writeHosts(hosts);
      return normalized;
    },
    get(id: string): HostRecord | undefined {
      return readHosts().find((host) => host.id === id);
    },
    list(): HostRecord[] {
      return readHosts().sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    },
    remove(id: string): boolean {
      const hosts = readHosts();
      const index = hosts.findIndex((host) => host.id === id);
      if (index === -1) return false;
      hosts.splice(index, 1);
      writeHosts(hosts);
      return true;
    },
    updateSortOrders(items: Array<{ id: string; sortOrder: number; groupId: string | null }>): void {
      const hosts = readHosts();
      for (const item of items) {
        const host = hosts.find((h) => h.id === item.id);
        if (host) {
          host.sortOrder = item.sortOrder;
          host.groupId = item.groupId;
        }
      }
      writeHosts(hosts);
    }
  };
}

export function getOrCreateSettingsRepo(): SettingsRepoLike {
  if (settingsRepo) {
    return settingsRepo;
  }

  const db = getOrCreateDatabase();
  if (!db) {
    const store = new Map<string, string>();
    settingsRepo = {
      get(key: string): SettingsRecord | undefined {
        const value = store.get(key);
        return value === undefined ? undefined : { key, value };
      },
      set(key: string, value: string): SettingsRecord {
        store.set(key, value);
        return { key, value };
      }
    };
    return settingsRepo;
  }

  const getSetting = db.prepare("SELECT key, value FROM app_settings WHERE key = ?");
  const upsertSetting = db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  settingsRepo = {
    get(key: string): SettingsRecord | undefined {
      const row = getSetting.get(key) as SettingsRecord | undefined;
      return row ? { key: row.key, value: row.value } : undefined;
    },
    set(key: string, value: string): SettingsRecord {
      upsertSetting.run({ key, value });
      return { key, value };
    }
  };

  return settingsRepo;
}

export function getOrCreateHostsRepo() {
  if (!hostsRepo) {
    const db = getOrCreateDatabase();
    if (db) {
      hostsRepo = createHostsRepositoryFromDatabase(db);
      // One-time import: migrate hosts from JSON fallback into SQLite
      importFallbackHosts(hostsRepo);
    } else {
      console.error("[hypershell] No database available, falling back to JSON store");
      const fallbackPath = resolveHostsFallbackPath();
      console.log("[hypershell] Using fallback hosts store at:", fallbackPath);
      hostsRepo = createFileBackedHostsRepo(fallbackPath);
    }
  }
  return hostsRepo;
}

function importFallbackHosts(repo: HostsRepoLike): void {
  const fallbackPath = resolveHostsFallbackPath();
  if (!existsSync(fallbackPath)) return;

  try {
    const raw = readFileSync(fallbackPath, "utf8");
    const hosts = JSON.parse(raw);
    if (!Array.isArray(hosts) || hosts.length === 0) return;

    let imported = 0;
    for (const h of hosts) {
      if (!h?.id || !h?.name || !h?.hostname) continue;
      // Skip if already in DB
      if (repo.get(h.id)) continue;
      repo.create({
        id: h.id,
        name: h.name,
        hostname: h.hostname,
        port: h.port ?? 22,
        username: h.username ?? null,
        identityFile: h.identityFile ?? null,
        hostProfileId: h.hostProfileId ?? null,
        authProfileId: h.authProfileId ?? null,
        groupId: h.groupId ?? null,
        notes: h.notes ?? null,
        authMethod: h.authMethod ?? "default",
        agentKind: h.agentKind ?? "system",
        opReference: h.opReference ?? null,
        isFavorite: h.isFavorite ?? false
      });
      imported++;
    }

    if (imported > 0) {
      console.log(`[hypershell] Imported ${imported} host(s) from JSON fallback into SQLite`);
      // Rename fallback so we don't re-import
      const donePath = fallbackPath + ".migrated";
      try { copyFileSync(fallbackPath, donePath); } catch { /* best effort */ }
      try { writeFileSync(fallbackPath, "[]", "utf8"); } catch { /* best effort */ }
    }
  } catch (err) {
    console.warn("[hypershell] Failed to import fallback hosts:", err);
  }
}

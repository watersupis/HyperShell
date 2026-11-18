import { randomUUID } from "node:crypto";
import {
  ipcChannels,
  getLocalProfileEnvVarsRequestSchema,
  removeLocalProfileRequestSchema,
  reorderLocalProfilesRequestSchema,
  setLocalProfileHiddenRequestSchema,
  upsertLocalProfileRequestSchema,
  type LocalProfileEnvVar,
  type LocalProfileRecord
} from "@hypershell/shared";
import type { createLocalProfilesRepositoryFromDatabase } from "./localProfilesRepository";
import { reconcileLocalProfiles } from "./reconcileLocalProfiles";
import { createDefaultProbes, detectLocalShells } from "./detectLocalShells";
import type { PluginIpcMain } from "@hypershell/plugin-api";

type LocalProfilesRepo = ReturnType<typeof createLocalProfilesRepositoryFromDatabase>;

function toRecord(profile: ReturnType<LocalProfilesRepo["list"]>[number]): LocalProfileRecord {
  return {
    id: profile.id,
    name: profile.name,
    executable: profile.executable,
    args: profile.args,
    startingDirectory: profile.startingDirectory,
    icon: profile.icon,
    color: profile.color,
    elevated: profile.elevated,
    source: profile.source,
    detectKey: profile.detectKey,
    isAvailable: profile.isAvailable,
    isHidden: profile.isHidden,
    sortOrder: profile.sortOrder,
    claudeSession: profile.claudeSession,
    claudeSessionMode: profile.claudeSessionMode
  };
}

/** Runs detection and folds the result into the store. Safe to call repeatedly. */
export function runLocalShellDetection(repo: LocalProfilesRepo): void {
  const detected = detectLocalShells(createDefaultProbes());
  reconcileLocalProfiles(repo, detected, () => randomUUID());
}

export interface LocalProfilesIpcHandle {
  /**
   * Kicks off a detection pass on a later macrotask and resolves when it is
   * done. Detection spawns child processes and runs synchronously once it
   * starts, so it must never sit on the pre-window path 鈥?`plugin activation is
   * called before the main window and tray exist. Failures are logged and
   * swallowed here so a broken probe cannot abort startup.
   */
  scheduleDetection(): Promise<void>;
  dispose(): void;
}

export function registerLocalProfilesIpc(
  ipcMain: PluginIpcMain,
  getRepo: () => LocalProfilesRepo
): LocalProfilesIpcHandle {
  // `list` awaits this so the renderer's first read never races a detection
  // pass that has been deferred off the startup path.
  let detectionInFlight: Promise<void> | null = null;
  let detectionTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function scheduleDetection(): Promise<void> {
    if (disposed) return Promise.resolve();
    detectionInFlight = new Promise<void>((resolve) => {
      detectionTimer = setTimeout(() => {
        detectionTimer = null;
        if (disposed) {
          resolve();
          return;
        }
        try {
          runLocalShellDetection(getRepo());
        } catch (error) {
          console.error(
            "[local-profiles] shell detection failed:",
            error instanceof Error ? error.message : error
          );
        }
        resolve();
      }, 0);
    });

    return detectionInFlight;
  }

  ipcMain.handle(ipcChannels.localProfiles.list, async (): Promise<LocalProfileRecord[]> => {
    await detectionInFlight;
    return getRepo().list().map(toRecord);
  });

  ipcMain.handle(
    ipcChannels.localProfiles.upsert,
    async (_event: unknown, request: unknown): Promise<LocalProfileRecord> => {
      const parsed = upsertLocalProfileRequestSchema.parse(request);
      const repo = getRepo();
      const existing = repo.get(parsed.id);

      const created = repo.create({
        id: parsed.id,
        name: parsed.name,
        executable: parsed.executable,
        args: parsed.args ?? existing?.args ?? [],
        // `null` means "clear it" and `undefined` means "leave it alone", so
        // these two cannot use `??` 鈥?that would collapse an explicit clear
        // back into the stored value and the old colour/directory would
        // reappear as soon as the renderer reloaded the list.
        startingDirectory:
          parsed.startingDirectory !== undefined
            ? parsed.startingDirectory
            : existing?.startingDirectory ?? null,
        icon: parsed.icon ?? existing?.icon ?? "terminal",
        color: parsed.color !== undefined ? parsed.color : existing?.color ?? null,
        elevated: parsed.elevated ?? existing?.elevated ?? false,
        // Source and detect key are owned by detection, never by the renderer.
        source: existing?.source ?? "user",
        detectKey: existing?.detectKey ?? null,
        isAvailable: existing?.isAvailable ?? true,
        isHidden: existing?.isHidden ?? false,
        sortOrder: parsed.sortOrder ?? existing?.sortOrder ?? 0,
        claudeSession: parsed.claudeSession ?? existing?.claudeSession ?? false,
        claudeSessionMode:
          parsed.claudeSessionMode ?? existing?.claudeSessionMode ?? "continue"
      });

      if (parsed.envVars) {
        repo.replaceEnvVars(parsed.id, parsed.envVars);
      }

      return toRecord(created);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.remove,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = removeLocalProfileRequestSchema.parse(request);
      const repo = getRepo();
      const existing = repo.get(parsed.id);

      if (!existing) {
        return;
      }

      // Deleting a detected profile outright would let the next detection pass
      // re-insert it, so hide it instead 鈥?the tombstone reconciliation respects.
      if (existing.source === "detected") {
        repo.setHidden(parsed.id, true);
        return;
      }

      repo.remove(parsed.id);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.setHidden,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = setLocalProfileHiddenRequestSchema.parse(request);
      getRepo().setHidden(parsed.id, parsed.hidden);
    }
  );

  ipcMain.handle(
    ipcChannels.localProfiles.reorder,
    async (_event: unknown, request: unknown): Promise<void> => {
      const parsed = reorderLocalProfilesRequestSchema.parse(request);
      getRepo().reorder(parsed.items);
    }
  );

  ipcMain.handle(ipcChannels.localProfiles.rescan, async (): Promise<LocalProfileRecord[]> => {
    const repo = getRepo();
    runLocalShellDetection(repo);
    return repo.list().map(toRecord);
  });

  ipcMain.handle(
    ipcChannels.localProfiles.getEnvVars,
    async (_event: unknown, request: unknown): Promise<LocalProfileEnvVar[]> => {
      const parsed = getLocalProfileEnvVarsRequestSchema.parse(request);
      return getRepo().listEnvVars(parsed.id);
    }
  );

  return {
    scheduleDetection,
    dispose() {
      disposed = true;
      if (detectionTimer) {
        clearTimeout(detectionTimer);
        detectionTimer = null;
      }
      for (const channel of Object.values(ipcChannels.localProfiles)) {
        ipcMain.removeHandler?.(channel);
      }
    },
  };
}

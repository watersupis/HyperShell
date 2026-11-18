// Side-effect import: must run before any module that reads an Electron app
// path. Applies the HYPERSHELL_DATA_DIR override used by the E2E suite.
import "../platform/storage/appDataDir";

import { app, ipcMain, powerMonitor } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createSavedSessionRepositoryFromDatabase,
  type HostRecord,
  type SavedSessionInput,
} from "@hypershell/db";

import { createHostMonitor } from "../platform/monitoring/hostMonitor";
import {
  disposeSessionRuntime,
  registerIpc,
} from "../platform/ipc/registerIpc";
import { sessionManager } from "../platform/process/sessionRuntime";
import { resolveSavedSessionTitle } from "../platform/process/sessionRecoveryTitle";
import { getSessionRecoveryData } from "../platform/process/sessionLifecycleRegistry";
import { getUpdateService } from "../platform/updates/updateService";
import { performAutoBackup } from "../platform/ipc/backupIpc";
import { createAppMenu } from "../windows/menu/createAppMenu";
import { createTray } from "../windows/tray/createTray";
import { createMainWindow } from "../windows/createMainWindow";
import { assertAllowedRendererUrl } from "../windows/windowSecurity";
import { createMainProcessLifecycle } from "./mainLifecycle";
import { clearAll as clearCredentialCache } from "../platform/security/credentialCache";
import { getOrCreateHostsRepo } from "../platform/storage/hostsRepositoryService";
import { getOrCreateDatabase } from "../platform/storage/database";

const SESSION_RECOVERY_SAVE_INTERVAL_MS = 30_000;

let savedSessionRepository:
  | ReturnType<typeof createSavedSessionRepositoryFromDatabase>
  | null = null;
let sessionRecoveryTimer: ReturnType<typeof setInterval> | null = null;

function getSavedSessionRepository():
  | ReturnType<typeof createSavedSessionRepositoryFromDatabase>
  | null {
  if (savedSessionRepository) {
    return savedSessionRepository;
  }

  const db = getOrCreateDatabase();
  if (!db) {
    return null;
  }

  savedSessionRepository = createSavedSessionRepositoryFromDatabase(db);
  return savedSessionRepository;
}

function resolveHostForProfile(
  hosts: HostRecord[],
  profileId: string
): HostRecord | undefined {
  return hosts.find(
    (host) =>
      host.id === profileId ||
      (host.username ? profileId === `${host.username}@${host.hostname}` : false) ||
      profileId === host.hostname ||
      profileId === host.name
  );
}

function collectSavedSessions(): SavedSessionInput[] {
  const sessions = sessionManager.listSessions();
  const hosts = getOrCreateHostsRepo().list();

  return sessions.map((session) => {
    const host =
      session.transport === "ssh"
        ? resolveHostForProfile(hosts, session.profileId)
        : undefined;
    return {
      id: session.sessionId,
      hostId: host?.id ?? null,
      transport: session.transport,
      profileId: session.profileId,
      title: getSessionRecoveryData(session.transport, session.sessionId, session.profileId).title ?? resolveSavedSessionTitle({ profileId: session.profileId, hostName: host?.name }),
      pluginData: getSessionRecoveryData(session.transport, session.sessionId, session.profileId).pluginData ?? {},
    };
  });
}

function persistSessionRecoverySnapshot(): void {
  if (sessionManager.listSessions().length === 0) {
    return;
  }
  const repo = getSavedSessionRepository();
  if (!repo) {
    return;
  }
  repo.replaceAll(collectSavedSessions());
}

function getRendererUrl(): string {
  const bundledRendererEntry = path.join(
    import.meta.dirname,
    "..",
    "renderer",
    "index.html"
  );
  const rawUrl = process.env.SSHTERM_RENDERER_URL
    ?? (() => {
      if (existsSync(bundledRendererEntry)) {
        return pathToFileURL(bundledRendererEntry).toString();
      }

      return "http://127.0.0.1:5173";
    })();

  return assertAllowedRendererUrl(rawUrl, {
    packagedRendererPath: bundledRendererEntry,
    allowDevServer: !app.isPackaged,
  }).toString();
}

const mainProcessLifecycle = createMainProcessLifecycle({
  app,
  ipcMain,
  createMainWindow,
  createTray,
  createHostMonitor,
  registerIpc,
  getRendererUrl
});

async function bootstrap(): Promise<void> {
  createAppMenu();
  await performAutoBackup();
  await mainProcessLifecycle.bootstrap();
  getUpdateService().start();

  if (!sessionRecoveryTimer) {
    sessionRecoveryTimer = setInterval(
      persistSessionRecoverySnapshot,
      SESSION_RECOVERY_SAVE_INTERVAL_MS
    );
  }

  if (process.platform === "win32" || process.platform === "linux") {
    powerMonitor.on("lock-screen", () => {
      clearCredentialCache();
    });
  }
}

void bootstrap();

app.on("before-quit", () => {
  if (sessionRecoveryTimer) {
    clearInterval(sessionRecoveryTimer);
    sessionRecoveryTimer = null;
  }
  getSavedSessionRepository()?.markAllGraceful();
  disposeSessionRuntime();
  clearCredentialCache();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

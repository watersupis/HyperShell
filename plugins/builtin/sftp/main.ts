import type { PluginIpcMain } from "@hypershell/plugin-api";
import { sftpIpcChannels } from "@hypershell/plugin-api";
import type { SftpPluginServices } from "./main/sftpPluginServices";
import { registerSftpIpc } from "./main/sftpIpc";
import { resolveSftpConnectionOptions } from "./main/sftpConnectionOptions";
import { registerHostFingerprintIpc } from "./main/hostFingerprintIpc";
import { ipcChannels } from "@hypershell/shared";

export type { SftpPluginServices } from "./main/sftpPluginServices";

export const sftpPluginDescriptor = {
  id: "sftp",
  title: "SFTP",
  rendererEntry: "plugins/builtin/sftp/ui/SftpTab",
  ipcOwner: "sftp",
} as const;

export function registerSftpPlugin(ipcMain: PluginIpcMain, host: SftpPluginServices): () => void {
  const db = host.storage.getDatabase();
  if (!db) throw new Error("Database is unavailable");

  const cleanupSftp = registerSftpIpc(ipcMain, {
    db,
    sessionManager: host.sessions.manager,
    connectionPool: host.ssh.connectionPool,
    getUserDataDirectory: () => host.platform.paths.getUserDataDirectory(),
    getTemporaryDirectory: () => host.platform.paths.getTemporaryDirectory(),
    onSessionClosed: (sessionId) => host.editorWindows.notifyContextClosed("sftp", sessionId),
    resolveConnectionOptions: (hostId, request) => resolveSftpConnectionOptions(hostId, {
      credentials: {
        findHost: host.credentials.findHost,
        resolvePassword: (profileId, options) => host.credentials.resolvePassword(profileId, options),
      },
      stripDomain: host.credentials.normalizeUsername,
      resolveHostProfile: host.connections.resolveProfile,
      trace: host.credentials.trace,
    }, request),
    onConnected: ({ connectionOptions }) => {
      if (!connectionOptions.password || !connectionOptions.username) return;
      host.credentials.cachePassword({
        hostname: connectionOptions.hostname,
        port: connectionOptions.port ?? 22,
        username: connectionOptions.username,
        password: connectionOptions.password,
      });
    },
    emitSftpEvent: (event) => host.platform.events.sendToMainWindow(sftpIpcChannels.event, event),
    emitSyncEvent: (event) => host.platform.events.sendToMainWindow(sftpIpcChannels.syncEvent, event),
    emitKeyboardInteractive: (event) => host.platform.events.sendToMainWindow(sftpIpcChannels.keyboardInteractive, event),
  });
  registerHostFingerprintIpc(ipcMain, () => db);
  return () => {
    cleanupSftp();
    for (const channel of Object.values(ipcChannels.hostFingerprint)) {
      ipcMain.removeHandler?.(channel);
    }
  };
}

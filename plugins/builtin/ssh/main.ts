import type { SqliteDatabase } from "@hypershell/db";
import type { PluginIpcMain, PluginMainMethodRegistry, PluginPlatformApi } from "@hypershell/plugin-api";
import type {
  OpenSessionRequest,
  PtySpawn,
  SessionCommandExecutor,
  SessionOpenPreparer,
  SessionLifecycleListener,
  SessionTransportFactory,
} from "@hypershell/session-core";
import { ipcChannels } from "@hypershell/shared";
import { registerHostPortForwardIpc } from "./main/hostPortForwardIpc";
import { registerHostProfileIpc } from "./main/hostProfileIpc";
import { registerHostEnvVarIpc } from "./main/hostEnvVarIpc";
import { registerTagIpc } from "./main/tagIpc";
import { registerSshConfigIpc } from "./main/sshConfigIpc";
import { registerSshKeysIpc } from "./main/sshKeysIpc";
import { registerPuttyImportIpc } from "./main/puttyImportIpc";
import { registerSshManagerImportIpc } from "./main/sshManagerImportIpc";
import { registerTmuxIpc, type TmuxHostConnectionOptions } from "./main/tmuxIpc";
import { createSshSessionTransport, executeSshSessionCommand } from "./main/sshPtyTransport";
import { createSshSessionOpenPreparer, type SshSessionOpenServices } from "./main/sshSessionOpen";
import { createConnectionHistoryRepositoryFromDatabase } from "./main/connectionHistoryRepository";
import { createHostEnvVarRepositoryFromDatabase } from "./main/repositories/hostEnvVarRepository";
import { registerConnectionHistoryMethods } from "./main/connectionHistoryMethods";
import { createSshConnectionHistoryListener } from "./main/connectionHistoryLifecycle";
import {
  registerHostManagementIpc,
  type HostGroupsRepository,
  type HostManagementRepository,
  type HostManagementServices,
} from "./main/hostManagementIpc";

export interface SshPluginServices {
  ipcMain: PluginIpcMain;
  platform: PluginPlatformApi;
  hostManagement: Pick<HostManagementServices, "passwords" | "setStatusTargets">;
  pluginMainMethods: PluginMainMethodRegistry;
  getHostsRepository: () => HostManagementRepository;
  getGroupsRepository: () => HostGroupsRepository;
  getDatabase: () => SqliteDatabase;
  getHost: (id: string) => TmuxHostConnectionOptions | undefined;
  sessionOpen: Omit<SshSessionOpenServices, "getEnabledEnvVars">;
  registerSessionTransport: (transport: "ssh", factory: SessionTransportFactory) => () => void;
  registerSessionOpenPreparer: (transport: "ssh", preparer: SessionOpenPreparer) => () => void;
  registerSessionLifecycleListener: (listener: SessionLifecycleListener) => () => void;
  registerSessionCommandExecutor: (transport: "ssh", executor: SessionCommandExecutor) => () => void;
  getApplicationSettings: () => unknown;
  spawnPty: PtySpawn;
}

export function registerSshPlugin(services: SshPluginServices): () => void {
  let hostEnvVarRepository: ReturnType<typeof createHostEnvVarRepositoryFromDatabase> | undefined;
  const sessionOpen: SshSessionOpenServices = {
    ...services.sessionOpen,
    getEnabledEnvVars: (hostId) => {
      hostEnvVarRepository ??= createHostEnvVarRepositoryFromDatabase(services.getDatabase());
      return hostEnvVarRepository.toEnabledEnvMap(hostId);
    },
  };
  const unregisterTransport = services.registerSessionTransport(
    "ssh",
    (request: OpenSessionRequest) => createSshSessionTransport(request, services.spawnPty),
  );
  const unregisterOpenPreparer = services.registerSessionOpenPreparer(
    "ssh",
    createSshSessionOpenPreparer(sessionOpen),
  );
  const unregisterCommandExecutor = services.registerSessionCommandExecutor("ssh", executeSshSessionCommand);
  const connectionHistoryRepository = createConnectionHistoryRepositoryFromDatabase(services.getDatabase());
  const unregisterConnectionHistoryMethods = registerConnectionHistoryMethods(
    services.pluginMainMethods,
    connectionHistoryRepository,
  );
  const unregisterConnectionHistoryListener = services.registerSessionLifecycleListener(
    createSshConnectionHistoryListener({
      repository: connectionHistoryRepository,
      findHost: services.sessionOpen.findHost,
    }),
  );
  if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
    connectionHistoryRepository.cleanup(getConnectionHistoryRetentionDays(services.getApplicationSettings()));
  }
  const disposeHostManagement = registerHostManagementIpc({
    ...services.hostManagement,
    ipcMain: services.ipcMain,
    platform: services.platform,
    getHostsRepository: services.getHostsRepository,
    getGroupsRepository: services.getGroupsRepository,
  });
  registerSshConfigIpc(services.ipcMain, services.getHostsRepository);
  registerHostProfileIpc(services.ipcMain, services.getDatabase);
  registerHostEnvVarIpc(services.ipcMain, services.getDatabase);
  registerTagIpc(services.ipcMain, services.getDatabase);
  registerSshKeysIpc(services.ipcMain);
  const disposePuttyImport = registerPuttyImportIpc(services.ipcMain);
  const disposeSshManagerImport = registerSshManagerImportIpc(
    services.ipcMain,
    services.getHostsRepository,
    services.getGroupsRepository
  );
  const disposeHostPortForward = registerHostPortForwardIpc(services.ipcMain, services.getDatabase);
  const disposeTmux = registerTmuxIpc(services.ipcMain, services.getHost);
  const ownedChannels = [
    ipcChannels.hosts.importSshConfig,
    ipcChannels.hosts.scanPutty,
    ipcChannels.hosts.scanSshManager,
    ipcChannels.hosts.importSshManager,
    ...Object.values(ipcChannels.hostProfiles),
    ...Object.values(ipcChannels.hostEnvVars),
    ...Object.values(ipcChannels.tags),
    ...Object.values(ipcChannels.sshKeys),
    ...Object.values(ipcChannels.hostPortForward),
  ];

  return () => {
    unregisterCommandExecutor();
    unregisterOpenPreparer();
    unregisterTransport();
    unregisterConnectionHistoryListener();
    unregisterConnectionHistoryMethods();
    disposeHostManagement();
    disposeHostPortForward();
    disposeTmux();
    disposePuttyImport();
    disposeSshManagerImport();
    for (const channel of ownedChannels) services.ipcMain.removeHandler?.(channel);
  };
}

const DEFAULT_CONNECTION_HISTORY_RETENTION_DAYS = 90;

function getConnectionHistoryRetentionDays(settings: unknown): number {
  if (!settings || typeof settings !== "object") return DEFAULT_CONNECTION_HISTORY_RETENTION_DAYS;
  const general = (settings as { general?: unknown }).general;
  if (!general || typeof general !== "object") return DEFAULT_CONNECTION_HISTORY_RETENTION_DAYS;
  const rawDays = (general as { connectionHistoryRetentionDays?: unknown }).connectionHistoryRetentionDays;
  const numericDays = typeof rawDays === "number" ? rawDays : Number.parseInt(String(rawDays), 10);
  if (!Number.isFinite(numericDays)) return DEFAULT_CONNECTION_HISTORY_RETENTION_DAYS;
  return Math.min(3650, Math.max(1, Math.floor(numericDays)));
}

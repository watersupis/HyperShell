import type { PluginIpcMain, PluginPlatformApi } from "@hypershell/plugin-api";
import type { PluginMainMethodRegistry, PluginModule } from "@hypershell/plugin-api";
import type { SqliteDatabase } from "@hypershell/db";
import type { createGroupsRepository } from "@hypershell/db";

import { localTerminalPluginDescriptor, registerLocalTerminalPlugin } from "./local-terminal/main";
import { registerSftpPlugin, sftpPluginDescriptor, type SftpPluginServices } from "./sftp/main";
import type { PtySpawn, SessionCommandExecutor, SessionLifecycleListener, SessionOpenPreparer, SessionOutputObserver, SessionRecoveryDataProvider, SessionTransportFactory, SessionTransportKind } from "@hypershell/session-core";
import { registerRecordingBuiltinPlugin } from "./session-recording/main";
import { registerSshPlugin, type SshPluginServices } from "./ssh/main";
import { registerSerialPlugin, serialPluginDescriptor } from "./serial/main";
import { registerTunnelsPlugin, tunnelsPluginDescriptor } from "./tunnels/main";
import { createLocalProfilesRepository, createLocalProfilesRepositoryFromDatabase } from "./local-terminal/main/localProfilesRepository";
import { createSerialProfilesRepository, createSerialProfilesRepositoryFromDatabase } from "./serial/main/serialProfilesRepository";
import { registerQuickCommandCenterPlugin } from "./quick-command-center/main";

export interface BuiltinPluginRuntimeServices {
  platform: PluginPlatformApi;
  ipcMain: PluginIpcMain;
  getDatabase: () => SqliteDatabase;
  getOptionalDatabase: () => SqliteDatabase | null;
  getHostsRepository: SshPluginServices["getHostsRepository"];
  hostManagement: SshPluginServices["hostManagement"];
  getHost: SshPluginServices["getHost"];
  sshSessionOpen: SshPluginServices["sessionOpen"];
  getGroupsRepository: () => ReturnType<typeof createGroupsRepository>;
  registerSessionTransport: (
    transport: SessionTransportKind,
    factory: SessionTransportFactory,
  ) => () => void;
  registerSessionOpenPreparer: (
    transport: SessionTransportKind,
    preparer: SessionOpenPreparer,
  ) => () => void;
  registerSessionLifecycleListener: (listener: SessionLifecycleListener) => () => void;
  getApplicationSettings: () => unknown;
  registerSessionRecoveryDataProvider: (
    transport: SessionTransportKind,
    provider: SessionRecoveryDataProvider,
  ) => () => void;
  registerSessionCommandExecutor: (
    transport: "ssh",
    executor: SessionCommandExecutor,
  ) => () => void;
  spawnPty: PtySpawn;
  onSessionRecorder: (manager: SessionOutputObserver | null) => void;
  emitSessionEvent: (event: unknown) => void;
  pluginMainMethods: PluginMainMethodRegistry;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  sessions: SftpPluginServices["sessions"];
  editorWindows: SftpPluginServices["editorWindows"];
  ssh: SftpPluginServices["ssh"];
  connections: SftpPluginServices["connections"];
  credentials: SftpPluginServices["credentials"];
}

export function createBuiltinPluginModules(services: BuiltinPluginRuntimeServices): PluginModule[] {
  let localProfilesRepository: ReturnType<typeof createLocalProfilesRepositoryFromDatabase> | undefined;
  const getLocalProfilesRepository = () => {
    if (!localProfilesRepository) {
      const database = services.getOptionalDatabase();
      localProfilesRepository = database
        ? createLocalProfilesRepositoryFromDatabase(database)
        : createLocalProfilesRepository();
    }
    return localProfilesRepository;
  };

  let serialProfilesRepository: ReturnType<typeof createSerialProfilesRepository> | undefined;
  const getSerialProfilesRepository = () => {
    if (!serialProfilesRepository) {
      const database = services.getOptionalDatabase();
      serialProfilesRepository = database
        ? createSerialProfilesRepositoryFromDatabase(database)
        : createSerialProfilesRepository();
    }
    return serialProfilesRepository;
  };

  return [
    {
      id: "ssh",
      activate: () => registerSshPlugin({
        ipcMain: services.ipcMain,
        platform: services.platform,
        hostManagement: services.hostManagement,
        pluginMainMethods: services.pluginMainMethods,
        getHostsRepository: services.getHostsRepository,
        getGroupsRepository: services.getGroupsRepository,
        getDatabase: services.getDatabase,
        getHost: services.getHost,
        sessionOpen: services.sshSessionOpen,
        registerSessionTransport: services.registerSessionTransport,
        registerSessionOpenPreparer: services.registerSessionOpenPreparer,
        registerSessionLifecycleListener: services.registerSessionLifecycleListener,
        registerSessionCommandExecutor: services.registerSessionCommandExecutor,
        getApplicationSettings: services.getApplicationSettings,
        spawnPty: services.spawnPty,
      }),
    },
    {
      id: "recording",
      activate: () => registerRecordingBuiltinPlugin(
        services.ipcMain,
        services.getDatabase,
        services.onSessionRecorder,
        services.platform
      ),
    },
    {
      id: localTerminalPluginDescriptor.id,
      activate: () => registerLocalTerminalPlugin(
        services.ipcMain,
        getLocalProfilesRepository,
        services.registerSessionTransport,
        services.registerSessionOpenPreparer,
        services.registerSessionLifecycleListener,
        services.registerSessionRecoveryDataProvider,
        services.emitSessionEvent,
        services.spawnPty,
        services.pluginMainMethods,
      ),
    },
    {
      id: serialPluginDescriptor.id,
      activate: () => registerSerialPlugin(
        services.ipcMain,
        getSerialProfilesRepository,
        services.registerSessionTransport,
        services.registerSessionOpenPreparer,
      ),
    },
    {
      id: sftpPluginDescriptor.id,
      activate: () => registerSftpPlugin(services.ipcMain, {
        platform: services.platform,
        storage: { getDatabase: services.getOptionalDatabase },
        sessions: services.sessions,
        editorWindows: services.editorWindows,
        ssh: services.ssh,
        connections: services.connections,
        credentials: services.credentials,
      }),
    },
    {
      id: tunnelsPluginDescriptor.id,
      activate: () => registerTunnelsPlugin(services.ipcMain, services.spawnPty),
    },
    {
      id: "com.hypershell.quick-command-center",
      activate: () => registerQuickCommandCenterPlugin({
        getDatabase: services.getDatabase,
        sessions: services.sessions.manager,
        pluginMainMethods: services.pluginMainMethods,
        fetch: services.fetch,
      }),
    },
  ];
}

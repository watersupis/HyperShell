import {
  closeSessionRequestSchema,
  hostStatsRequestSchema,
  ipcChannels,
  openSessionRequestSchema,
  resizeSessionRequestSchema,
  setSignalsRequestSchema,
  writeSessionRequestSchema,
  DEFAULT_RECONNECT_BASE_INTERVAL,
  DEFAULT_RECONNECT_MAX_ATTEMPTS
} from "@hypershell/shared";
import type { HostStatsResponse } from "@hypershell/shared";
import type { PluginIpcMain } from "@hypershell/plugin-api";
import type {
  CloseSessionRequest,
  OpenSessionRequest,
  OpenSessionResponse,
  ResizeSessionRequest,
  WriteSessionRequest
} from "@hypershell/shared";
import { createSessionManager } from "@hypershell/session-core";
import {
  disposeProcessRuntime,
  disposeSsh2Connections,
  sessionManager,
  ssh2ConnectionPool,
  spawnPty,
} from "../process/sessionRuntime";
import {
  registerSessionCommandExecutor,
  registerSessionTransport,
} from "../process/sessionTransportRegistry";
import {
  prepareSessionOpen,
  registerSessionOpenPreparer,
} from "../process/sessionOpenRegistry";
import {
  publishSessionLifecycleEvent,
  registerSessionLifecycleListener,
  registerSessionRecoveryDataProvider,
} from "../process/sessionLifecycleRegistry";
import { getOrCreateHostsRepo } from "../storage/hostsRepositoryService";
import {
  createHostPasswordStore,
  resolveStoredHostPassword,
} from "../security/hostPasswordStore";
import { getOrCreateDatabase } from "../storage/database";
import { registerSettingsIpc } from "./settingsIpc";
import { registerWorkspaceIpc } from "./workspaceIpc";
import { registerOpIpc } from "./opIpc";
import { registerExternalPluginsIpc } from "./externalPluginsIpc";
import { registerInternalPluginsIpc } from "./internalPluginsIpc";
import { createPluginMainMethodRegistry } from "../../plugin-runtime/pluginMainMethodRegistry";
import { internalPluginCatalog } from "../../plugin-runtime/internalPluginCatalog";
import { activateEnabledPlugins } from "../../plugin-runtime/pluginHost";
import { createBuiltinPluginModules } from "@hypershell/builtin-runtime";
import { createSessionLogger, registerLoggingIpc } from "./loggingIpc";
import type { SessionOutputObserver } from "@hypershell/session-core";
import { registerBackupIpc } from "./backupIpc";
import { registerSessionRecoveryIpc } from "./sessionRecoveryIpc";
import {
  createRendererSessionOwnership,
  type ReapableRenderer,
} from "../process/rendererSessionOwnership";
import { getUpdateService, setUpdateStateEmitter } from "../updates/updateService";
import {
  createHostStatusService,
  type HostStatusTarget,
} from "../monitoring/hostStatusService";
import {
  get as getCachedCredential,
  set as setCachedCredential
} from "../security/credentialCache";
import {
  createCredentialResolver,
  stripDomain,
  type CredentialResolver
} from "../security/credentialResolver";
import { registerFsIpc } from "./fsIpc";
import { registerEditorIpc } from "./editorIpc";
import { editorWindowManager } from "../../windows/editorWindowManager";
import { createGroupsRepository, createGroupsRepositoryFromDatabase } from "@hypershell/db";
import type { SqliteDatabase, HostRecord as DbHostRecord } from "@hypershell/db";
import type {
  SessionManager,
  SessionTransportEvent,
  TransportHandle,
  OpenSessionInput,
  TelnetConnectionOptions
} from "@hypershell/session-core";
import type { IpcMainInvokeEvent } from "electron";
import { app, BrowserWindow, net } from "electron";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { SecureStorageUnavailableError } from "../security/secureStorage";

import {
  assertAbsolutePath,
  assertNotWindowsDevicePath,
  assertPathWithinAllowedRoots,
} from "@hypershell/shared/security/pathPolicy";

const registeredChannels = [
  ipcChannels.session.open,
  ipcChannels.session.resize,
  ipcChannels.session.write,
  ipcChannels.session.close,
  ipcChannels.settings.get,
  ipcChannels.settings.update,
  ipcChannels.session.setSignals,
  ipcChannels.session.hostStats,
  ipcChannels.session.saveState,
  ipcChannels.session.loadSavedState,
  ipcChannels.session.clearSavedState,
  ipcChannels.workspace.save,
  ipcChannels.workspace.load,
  ipcChannels.workspace.list,
  ipcChannels.workspace.remove,
  ipcChannels.workspace.saveLast,
  ipcChannels.workspace.loadLast,
  ipcChannels.sshKeys.list,
  ipcChannels.sshKeys.generate,
  ipcChannels.sshKeys.getFingerprint,
  ipcChannels.sshKeys.remove,
  ipcChannels.hostPortForward.list,
  ipcChannels.hostPortForward.upsert,
  ipcChannels.hostPortForward.remove,
  ipcChannels.hostPortForward.reorder,
  ipcChannels.connectionPool.stats,
  ipcChannels.op.listVaults,
  ipcChannels.op.listItems,
  ipcChannels.op.getItemFields,
  ipcChannels.plugins.list,
  ipcChannels.plugins.install,
  ipcChannels.plugins.installSelected,
  ipcChannels.plugins.cancelInstall,
  ipcChannels.plugins.setPermissions,
  ipcChannels.plugins.uninstall,
  ipcChannels.internalPlugins.list,
  ipcChannels.internalPlugins.setEnabled,
  ipcChannels.internalPlugins.invoke,
  ipcChannels.logging.start,
  ipcChannels.logging.stop,
  ipcChannels.logging.getState,
  ipcChannels.recording.start,
  ipcChannels.recording.stop,
  ipcChannels.recording.getState,
  ipcChannels.recording.list,
  ipcChannels.recording.delete,
  ipcChannels.recording.getFrames,
  ipcChannels.recording.export,
  ipcChannels.backup.create,
  ipcChannels.backup.restore,
  ipcChannels.backup.list,
  ipcChannels.backup.showOpenDialog,
  ipcChannels.app.setTheme,
  ipcChannels.update.check,
  ipcChannels.update.download,
  ipcChannels.update.install,
  ipcChannels.update.openRelease,
  ipcChannels.update.getState,
] as const;

const sessionLogger = createSessionLogger(() => {
  try {
    const database = getOrCreateDatabase();
    if (!database) return path.join(app.getPath("userData"), "logs");
    const row = database.prepare("SELECT value FROM app_settings WHERE key = ?").get("app.settings") as { value?: string } | undefined;
    const settings = row?.value ? JSON.parse(row.value) as { terminal?: Record<string, unknown> } : undefined;
    const configured = settings?.terminal?.textLogDirectory;
    if (typeof configured === "string" && configured.trim()) return path.resolve(configured.trim());
  } catch {
    // Use the default directory when settings are unavailable.
  }
  return path.join(app.getPath("userData"), "logs");
});

export function disposeSessionRuntime(): void {
  disposeProcessRuntime();
}

let credentialResolver: CredentialResolver | null = null;

/**
 * Shared by openSessionHandler (SSH) and resolveSftpConnectionOptions (SFTP) —
 * the two used to carry their own copies of host lookup and secret resolution,
 * and the copies drifted. See connection/credentialResolver.ts.
 */
function getCredentialResolver(): CredentialResolver {
  if (credentialResolver) {
    return credentialResolver;
  }

  credentialResolver = createCredentialResolver({
    hosts: () => getOrCreateHostsRepo(),
    readStoredPassword: (host) => resolveStoredHostPassword(host),
    readOnePasswordReference: async (reference) => {
      const { resolveOnePasswordReference } = await import(
        "../security/opResolver.js"
      );
      return resolveOnePasswordReference(reference);
    },
    readCachedCredential: (hostname, port, username, ttlMs) =>
      getCachedCredential(hostname, port, username, ttlMs),
    credentialCacheConfig: () => getCredentialCacheConfig(),
    trace: (transport, message, details) =>
      logAuthTrace(isAuthTraceEnabled(), transport, message, details)
  });

  return credentialResolver;
}

let cleanupRegisteredIpc: (() => void) | null = null;

export interface RegisterIpcOptions {
  emitSessionEvent?: (event: unknown) => void;
  emitPluginEvent?: (channel: string, event: unknown) => void;
  emitHostStatusEvent?: (event: unknown) => void;
  emitUpdateState?: (state: unknown) => void;
  sessionManager?: SessionManager;
  db?: SqliteDatabase;
  resolveHostProfile?: (profileId: string) => Promise<{ hostname: string; username?: string; port?: number; identityFile?: string; password?: string; proxyJump?: string; keepAliveSeconds?: number } | null>;
}

export type IpcMainLike = PluginIpcMain;

const APP_SETTINGS_KEY = "app.settings";
const DEFAULT_CREDENTIAL_CACHE_ENABLED = true;
const DEFAULT_CREDENTIAL_CACHE_TTL_MINUTES = 15;
const MIN_CREDENTIAL_CACHE_TTL_MINUTES = 1;
const MAX_CREDENTIAL_CACHE_TTL_MINUTES = 24 * 60;

type StoredAppSettings = {
  debug?: {
    authTracing?: unknown;
  };
  general?: {
    [key: string]: unknown;
  };
  security?: {
    credentialCacheEnabled?: unknown;
    credentialCacheTtlMinutes?: unknown;
  };
};

function readStoredAppSettings(): StoredAppSettings | null {
  const db = getOrCreateDatabase();
  if (!db) {
    return null;
  }

  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(APP_SETTINGS_KEY) as { value?: unknown } | undefined;
    if (!row || typeof row.value !== "string") {
      return null;
    }
    return JSON.parse(row.value) as StoredAppSettings;
  } catch {
    return null;
  }
}

function isAuthTraceEnabled(): boolean {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return false;
  }

  return Boolean(readStoredAppSettings()?.debug?.authTracing);
}

function getCredentialCacheConfig(): { enabled: boolean; ttlMs: number } {
  const parsed = readStoredAppSettings();
  const enabled =
    typeof parsed?.security?.credentialCacheEnabled === "boolean"
      ? parsed.security.credentialCacheEnabled
      : DEFAULT_CREDENTIAL_CACHE_ENABLED;

  const rawTtlMinutes = parsed?.security?.credentialCacheTtlMinutes;
  const numericTtlMinutes =
    typeof rawTtlMinutes === "number"
      ? rawTtlMinutes
      : Number.parseInt(String(rawTtlMinutes), 10);

  const ttlMinutes = Number.isFinite(numericTtlMinutes)
    ? Math.min(
        MAX_CREDENTIAL_CACHE_TTL_MINUTES,
        Math.max(MIN_CREDENTIAL_CACHE_TTL_MINUTES, Math.floor(numericTtlMinutes))
      )
    : DEFAULT_CREDENTIAL_CACHE_TTL_MINUTES;

  return {
    enabled,
    ttlMs: ttlMinutes * 60_000
  };
}

function logAuthTrace(
  enabled: boolean,
  scope: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  if (!enabled) {
    return;
  }

  const prefix = `[hypershell][auth:${scope}] ${message}`;
  if (metadata) {
    console.info(prefix, metadata);
    return;
  }
  console.info(prefix);
}

async function openSessionHandler(
  _event: IpcMainInvokeEvent,
  request: OpenSessionRequest,
  manager: SessionManager = sessionManager,
  prepareOpen: typeof prepareSessionOpen = prepareSessionOpen
): Promise<OpenSessionResponse> {
  const parsed = openSessionRequestSchema.parse(request);

  let telnetOptions: TelnetConnectionOptions | undefined;

  if (parsed.transport === "telnet" && parsed.telnetOptions) {
    telnetOptions = {
      hostname: parsed.telnetOptions.hostname,
      port: parsed.telnetOptions.port,
      mode: parsed.telnetOptions.mode,
      terminalType: parsed.telnetOptions.terminalType,
    };
  }

  const preparation = await prepareOpen(parsed);

  const openInput: OpenSessionInput = {
    ...parsed,
    sshOptions: { hostname: parsed.profileId },
    telnetOptions,
    autoReconnect: parsed.autoReconnect ?? false,
    maxReconnectAttempts:
      parsed.reconnectMaxAttempts ?? DEFAULT_RECONNECT_MAX_ATTEMPTS,
    reconnectBaseInterval:
      parsed.reconnectBaseInterval ?? DEFAULT_RECONNECT_BASE_INTERVAL,
    ...preparation.input,
  };

  const opened = await manager.open(openInput);

  return { ...opened, ...preparation.response };
}

async function resizeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: ResizeSessionRequest,
  manager: SessionManager = sessionManager
): Promise<void> {
  const parsed = resizeSessionRequestSchema.parse(_request);
  manager.resize(parsed.sessionId, parsed.cols, parsed.rows);
}

async function writeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: WriteSessionRequest,
  manager: SessionManager = sessionManager
): Promise<void> {
  const parsed = writeSessionRequestSchema.parse(_request);
  manager.write(parsed.sessionId, parsed.data);
}

async function closeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: CloseSessionRequest,
  manager: SessionManager = sessionManager,
  onBeforeClose?: (sessionId: string) => void
): Promise<void> {
  const parsed = closeSessionRequestSchema.parse(_request);
  onBeforeClose?.(parsed.sessionId);
  manager.close(parsed.sessionId);
}


const STATS_COMMAND = `echo "CPU:$(cat /proc/loadavg 2>/dev/null | cut -d' ' -f1-3 || sysctl -n vm.loadavg 2>/dev/null | tr -d '{}');MEM:$(free -m 2>/dev/null | awk 'NR==2{printf \\"%d/%dMB\\",$3,$2}' || vm_stat 2>/dev/null | awk '/Pages (active|wired|free)/{s+=$NF}END{printf \\"%dMB\\",s*4096/1048576}');DISK:$(df -h / 2>/dev/null | awk 'NR==2{print $5}');UP:$(uptime -p 2>/dev/null || uptime | sed 's/.*up/up/' | sed 's/,.*load.*//' | xargs)"`;

function parseStatsOutput(raw: string): Omit<HostStatsResponse, "latencyMs"> {
  const result: Omit<HostStatsResponse, "latencyMs"> = {
    cpuLoad: null,
    memUsage: null,
    diskUsage: null,
    uptime: null
  };

  try {
    const parts = raw.trim().split(";");
    for (const part of parts) {
      const colonIdx = part.indexOf(":");
      if (colonIdx < 0) continue;
      const key = part.slice(0, colonIdx).trim();
      const value = part.slice(colonIdx + 1).trim();
      if (!value) continue;

      switch (key) {
        case "CPU":
          result.cpuLoad = value;
          break;
        case "MEM":
          result.memUsage = value;
          break;
        case "DISK":
          result.diskUsage = value;
          break;
        case "UP":
          result.uptime = value;
          break;
      }
    }
  } catch {
    // parse errors are non-fatal
  }

  return result;
}

async function hostStatsHandler(
  _event: IpcMainInvokeEvent,
  request: unknown,
  manager: SessionManager = sessionManager
): Promise<HostStatsResponse> {
  const parsed = hostStatsRequestSchema.parse(request);
  const session = manager.getSession(parsed.sessionId);

  if (!session || session.state !== "connected" || session.transport !== "ssh") {
    return { cpuLoad: null, memUsage: null, diskUsage: null, uptime: null, latencyMs: null };
  }

  const startTime = Date.now();

  try {
    const stdout = await manager.execCommand(parsed.sessionId, STATS_COMMAND);
    const latencyMs = Date.now() - startTime;
    const stats = parseStatsOutput(stdout);
    return { ...stats, latencyMs };
  } catch {
    return { cpuLoad: null, memUsage: null, diskUsage: null, uptime: null, latencyMs: null };
  }
}

export function getRegisteredChannels(): readonly string[] {
  return registeredChannels;
}

export function registerIpc(
  ipcMain: IpcMainLike,
  options: RegisterIpcOptions = {}
): () => void {
  cleanupRegisteredIpc?.();

  const manager = options.sessionManager ?? sessionManager;
  const pluginMainMethods = createPluginMainMethodRegistry();
  const cleanupFsIpc = registerFsIpc(ipcMain);
  const cleanupEditorIpc = registerEditorIpc(ipcMain);
  const rendererSessions = createRendererSessionOwnership((sessionId) =>
    manager.close(sessionId)
  );
  const getDb = (): SqliteDatabase | null => options.db ?? getOrCreateDatabase();
  const requireDb = (): SqliteDatabase => {
    const db = getDb();
    if (!db) throw new Error("Database is unavailable");
    return db;
  };
  const hostPasswordStore = createHostPasswordStore(getDb);
  let groupsRepo:
    | ReturnType<typeof createGroupsRepository>
    | ReturnType<typeof createGroupsRepositoryFromDatabase>
    | undefined;
  const getGroupsRepository = () => {
    if (groupsRepo) return groupsRepo;
    const db = getDb();
    groupsRepo = db ? createGroupsRepositoryFromDatabase(db) : createGroupsRepository();
    return groupsRepo;
  };
  let recorder: SessionOutputObserver | null = null;
  const hostStatusService = createHostStatusService();
  const resolveHostStatusTargets = (hostIds: string[]): HostStatusTarget[] => {
    const hostsById = new Map<string, DbHostRecord>();
    for (const host of getOrCreateHostsRepo().list()) {
      hostsById.set(host.id, host);
    }

    const targets: HostStatusTarget[] = [];
    for (const hostId of hostIds) {
      const host = hostsById.get(hostId);
      if (!host) {
        continue;
      }
      targets.push({
        hostId: host.id,
        hostname: host.hostname,
        port: host.port ?? 22,
      });
    }

    return targets;
  };

  const unsubscribeSessionEvents = manager.onEvent((event) => {
    publishSessionLifecycleEvent(manager, event);
    options.emitSessionEvent?.(event);

    if ("type" in event && "sessionId" in event) {
      const sessionId = String(event.sessionId);

      if (event.type === "exit") {
        // Wait one tick to let SessionManager finalize reconnect/disconnect
        // state. A session that is only reconnecting still belongs to its
        // renderer and must stay reapable.
        setTimeout(() => {
          if (!manager.getSession(sessionId)) {
            rendererSessions.forget(sessionId);
            void recorder?.onSessionClosed(sessionId);
          }
        }, 0);
      }
    }

    // Session logging: intercept data events.
    if ("type" in event && event.type === "data" && "sessionId" in event && "data" in event) {
      sessionLogger.onSessionData(event.sessionId as string, event.data as string);
      recorder?.onSessionData(event.sessionId as string, event.data as string);
    }
  });
  const unsubscribeHostStatusEvents = hostStatusService.onStatus((event) => {
    options.emitHostStatusEvent?.(event);
  });

  for (const channel of registeredChannels) {
    ipcMain.removeHandler?.(channel);
  }

  ipcMain.handle(ipcChannels.session.open, async (event, request) => {
    const parsedRequest = openSessionRequestSchema.parse(request);
    const unavailableTransportPlugin = internalPluginCatalog.find((plugin) =>
      plugin.transports?.includes(parsedRequest.transport) && !enabledInternalPlugins.has(plugin.id)
    );
    if (unavailableTransportPlugin) {
      throw new Error(`${unavailableTransportPlugin.title} plugin is disabled`);
    }
    const opened = await openSessionHandler(
      event,
      request,
      manager,
      prepareSessionOpen
    );

    const sender = (event as { sender?: ReapableRenderer } | undefined)?.sender;
    if (sender) {
      if (sender.isDestroyed()) {
        // The window died while the open was in flight, so its "destroyed"
        // reap has already run — remembering now would register the session
        // to a renderer that will never come back, leaking the pty until app
        // exit. Close it here instead.
        manager.close(opened.sessionId);
      } else {
        rendererSessions.watch(sender);
        rendererSessions.remember(sender.id, opened.sessionId);
      }
    }

    return opened;
  });
  ipcMain.handle(ipcChannels.session.resize, (event, request) =>
    resizeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.write, (event, request) =>
    writeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.close, (event, request) =>
    closeSessionHandler(event, request, manager, (sessionId) => {
      void recorder?.onSessionClosed(sessionId);
      rendererSessions.forget(sessionId);
    })
  );
  ipcMain.handle(ipcChannels.session.setSignals, (_event, request) => {
    const parsed = setSignalsRequestSchema.parse(request);
    manager.setSignals(parsed.sessionId, parsed.signals);
    return { ok: true };
  });
  ipcMain.handle(ipcChannels.session.hostStats, (event, request) =>
    hostStatsHandler(event, request, manager)
  );

  registerSettingsIpc(ipcMain, () => getDb());
  const enabledInternalPlugins = new Set([
    ...registerInternalPluginsIpc(ipcMain, () => getDb(), internalPluginCatalog, pluginMainMethods),
    ...internalPluginCatalog.filter((plugin) => plugin.kind === "core").map((plugin) => plugin.id),
  ]);
  const pluginModules = createBuiltinPluginModules({
    ipcMain,
    fetch: (url, init) => net.fetch(url, init),
    platform: {
      paths: {
        getUserDataDirectory: () => app.getPath("userData"),
        getTemporaryDirectory: () => app.getPath("temp"),
        resolveSafeExportPath: (filePath) => {
          const resolved = assertAbsolutePath(filePath, "Absolute path is required for export");
          assertNotWindowsDevicePath(resolved);
          assertPathWithinAllowedRoots(
            resolved,
            [homedir(), tmpdir()],
            "Recording export path must be within the user home or temp directory"
          );
          return resolved;
        },
      },
      events: {
        sendToMainWindow: (channel, event) => options.emitPluginEvent?.(channel, event),
      },
    },
    getDatabase: requireDb,
    getOptionalDatabase: getDb,
    getHostsRepository: () => getOrCreateHostsRepo(),
    getHost: (id) => {
      const host = getOrCreateHostsRepo().get(id);
      if (!host) return undefined;
      return {
        hostname: host.hostname,
        username: host.username,
        port: host.port,
        identityFile: host.identityFile,
        proxyJump: host.proxyJump,
        keepAliveInterval: host.keepAliveInterval,
      };
    },
    sshSessionOpen: {
      resolveProfile: options.resolveHostProfile,
      findHost: (profileId) => getCredentialResolver().findHost(profileId),
      getHostById: (hostId) => getOrCreateHostsRepo().get(hostId),
      resolvePassword: (host, cacheLookup) =>
        getCredentialResolver().resolvePassword(host, {
          transport: "ssh",
          ...(cacheLookup ? { cacheLookup } : {}),
        }),
      normalizeUsername: stripDomain,
      trace: (message, details) =>
        logAuthTrace(isAuthTraceEnabled(), "ssh", message, details),
    },
    getApplicationSettings: readStoredAppSettings,
    getGroupsRepository,
    hostManagement: {
      passwords: {
        savedAt: (host) => hostPasswordStore.savedAt(host),
        remove: (authProfileId) => hostPasswordStore.remove(authProfileId),
        save: (input) => {
          try {
            return hostPasswordStore.save(input);
          } catch (error) {
            if (error instanceof SecureStorageUnavailableError) {
              throw new Error(
                "Secure storage is unavailable. Unlock your OS keychain and try again.",
                { cause: error },
              );
            }
            throw error;
          }
        },
      },
      setStatusTargets: (hostIds) => {
        if (hostIds.length === 0) {
          hostStatusService.setTargets([]);
          hostStatusService.stop();
          return;
        }
        hostStatusService.setTargets(resolveHostStatusTargets(hostIds));
        hostStatusService.start();
      },
    },
    onSessionRecorder: (manager) => { recorder = manager; },
    registerSessionOpenPreparer,
    registerSessionLifecycleListener,
    registerSessionRecoveryDataProvider,
    emitSessionEvent: (event) => options.emitSessionEvent?.(event),
    pluginMainMethods,
    registerSessionTransport,
    registerSessionCommandExecutor,
    spawnPty,
    sessions: { manager },
    editorWindows: {
      notifyContextClosed: (pluginId, windowKey) =>
        editorWindowManager.notifyWindowContextClosed(pluginId, windowKey),
    },
    ssh: { connectionPool: ssh2ConnectionPool },
    connections: {
      resolveProfile: options.resolveHostProfile ?? (async () => null),
    },
    credentials: {
      findHost: (profileId) => {
        const host = getCredentialResolver().findHost(profileId);
        if (!host) return null;
        return {
          id: host.id,
          name: host.name,
          hostname: host.hostname,
          username: host.username ?? undefined,
          port: host.port ?? undefined,
          identityFile: host.identityFile ?? undefined,
          proxyJump: host.proxyJump ?? undefined,
        };
      },
      resolvePassword: (profileId, passwordOptions) => {
        const resolver = getCredentialResolver();
        return resolver.resolvePassword(resolver.findHost(profileId), {
          ...passwordOptions,
          transport: passwordOptions.transport,
        });
      },
      normalizeUsername: stripDomain,
      cachePassword: ({ hostname, port, username, password }) => {
        const { enabled, ttlMs } = getCredentialCacheConfig();
        if (enabled) setCachedCredential(hostname, port, username, password, ttlMs);
      },
      trace: (transport, message, details) => {
        logAuthTrace(isAuthTraceEnabled(), transport, message, details);
      },
    },
  });
  const disposePlugins = activateEnabledPlugins(pluginModules, enabledInternalPlugins);
  registerWorkspaceIpc(ipcMain, () => getDb());
  registerOpIpc(ipcMain);
  registerExternalPluginsIpc(ipcMain, {
    sessionManager: manager,
    getDatabase: requireDb,
  }, path.join(app.getPath("userData"), "plugins"));
  registerLoggingIpc(ipcMain, sessionLogger);
  registerBackupIpc(ipcMain);
  registerSessionRecoveryIpc(ipcMain, requireDb);
  ipcMain.handle(ipcChannels.app.setTheme, (event: IpcMainInvokeEvent, theme: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const isLight = theme === "light";
    try {
      win.setTitleBarOverlay({
        color: isLight ? "#e3e8f0" : "#0a1929",
        symbolColor: isLight ? "#3e4f63" : "#8899aa",
      });
      win.setBackgroundColor(isLight ? "#e3e8f0" : "#07111f");
    } catch {
      // setTitleBarOverlay may not be available on all platforms
    }
  });

  setUpdateStateEmitter((state) => {
    options.emitUpdateState?.(state);
  });

  ipcMain.handle(ipcChannels.update.check, () =>
    getUpdateService().check({ manual: true })
  );
  ipcMain.handle(ipcChannels.update.download, () => getUpdateService().download());
  ipcMain.handle(ipcChannels.update.install, () => {
    getUpdateService().install();
  });
  ipcMain.handle(ipcChannels.update.openRelease, () => {
    getUpdateService().openRelease();
  });
  ipcMain.handle(ipcChannels.update.getState, () => getUpdateService().getState());

  ipcMain.handle(ipcChannels.connectionPool.stats, () => {
    return ssh2ConnectionPool.getStats();
  });

  const cleanup = () => {
    unsubscribeSessionEvents();
    unsubscribeHostStatusEvents();
    hostStatusService.stop();
    sessionLogger.stopAll();
    disposePlugins();
    cleanupFsIpc();
    cleanupEditorIpc();
    disposeSsh2Connections();
    for (const channel of registeredChannels) {
      ipcMain.removeHandler?.(channel);
    }

    if (cleanupRegisteredIpc === cleanup) {
      cleanupRegisteredIpc = null;
    }
  };

  cleanupRegisteredIpc = cleanup;
  return cleanup;
}

function createInertTransport(sessionId: string): TransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();

  return {
    write() {},
    resize() {},
    close() {
      for (const listener of listeners) {
        listener({
          type: "exit",
          sessionId,
          exitCode: null
        });
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export async function openSessionForTest(
  request: OpenSessionRequest
): Promise<OpenSessionResponse> {
  const result = await openSessionForTestInspectInput(request);
  return result.session;
}

export async function openSessionForTestInspectInput(
  request: OpenSessionRequest,
  options?: {
    prepareOpen?: typeof prepareSessionOpen;
  }
): Promise<{ session: OpenSessionResponse; input: OpenSessionInput | undefined }> {
  let capturedInput: OpenSessionInput | undefined;
  const testSessionManager = createSessionManager({
    createTransport(input) {
      return createInertTransport(input.sessionId);
    },
    sessionIdFactory: () => "test-session-1"
  });

  const originalOpen = testSessionManager.open.bind(testSessionManager);
  const managerWithCapture: SessionManager = {
    ...testSessionManager,
    open(input) {
      capturedInput = input;
      return originalOpen(input);
    }
  };

  const session = await openSessionHandler(
    {} as IpcMainInvokeEvent,
    request,
    managerWithCapture,
    options?.prepareOpen ?? prepareSessionOpen
  );

  return {
    session,
    input: capturedInput
  };
}

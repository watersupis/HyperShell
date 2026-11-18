import type { PluginManifest, PluginPermission, PluginUiPlacement } from "./manifest.js";

export interface Disposable { dispose(): void }
export interface PluginModule {
  id: string;
  activate(): void | (() => void);
}
export interface PluginPlatformApi {
  paths: {
    getUserDataDirectory(): string;
    getTemporaryDirectory(): string;
    resolveSafeExportPath(filePath: string): string;
  };
  events: {
    sendToMainWindow(channel: string, event: unknown): void;
  };
}

export interface PluginIpcMain {
  handle(channel: string, listener: (...args: any[]) => unknown): void;
  on?(channel: string, listener: (...args: any[]) => void): unknown;
  removeHandler?(channel: string): void;
  removeListener?(channel: string, listener: (...args: any[]) => void): unknown;
}

export type PluginMainMethodHandler = (payload: unknown) => unknown | Promise<unknown>;

export interface PluginMainMethodRegistry {
  register(pluginId: string, method: string, handler: PluginMainMethodHandler): () => void;
}
export type PluginUiSlot = "workspace.toolbar" | "sidebar.navigation" | "terminal.toolbar" | PluginUiPlacement | "workspace.header";
export interface PluginCommand { id: string; title: string; keywords?: string[]; slot?: "workspace.toolbar"; execute(): Promise<void> }
export interface PluginView { id: string; title: string; entrypoint: string; slot?: PluginUiPlacement | "workspace.header" }
export interface PluginRegistrationApi { registerCommand(command: PluginCommand): Disposable; registerView(view: PluginView): Disposable }
export interface PluginHostApi {
  hosts: { list(): Promise<Array<{ id: string; name: string; platform?: string }>> };
  storage: {
    list(collection: string): Promise<Array<{ key: string; value: unknown }>>;
    upsert(collection: string, key: string, value: unknown): Promise<void>;
    remove(collection: string, key: string): Promise<void>;
    claimLegacy(source: string, collection: string): Promise<number>;
  };
  sessions: {
    active(): Promise<Array<{ id: string; hostId: string; hostName: string }>>;
    broadcastTargets(): Promise<Array<{ id: string; name: string }>>;
    broadcast(sessionIds: string[], text: string): Promise<{ sent: number }>;
    broadcastMode(): Promise<{ enabled: boolean; sessionIds: string[] }>;
    setBroadcastMode(enabled: boolean, sessionIds: string[]): Promise<void>;
    setBroadcastEnabled(enabled: boolean): Promise<void>;
  };
  monitoring: { latest(hostIds?: string[]): Promise<Array<{ hostId: string; hostName: string; online: boolean; latencyMs: number | null; checkedAt: string }>> };
  systems: {
    inspect(sessionId: string, operation: "processes" | "ports" | "docker" | "images" | "volumes" | "networks" | "compose" | "metrics" | "disk-details" | "terminate-process" | "start-container" | "stop-container", target?: string): Promise<string>;
  };
}
export interface PluginContext {
  manifest: PluginManifest;
  grantedPermissions: readonly PluginPermission[];
  launchContext?: { hostId?: string; surface?: PluginUiPlacement | "workspace.header"; sessionTargets?: Array<{ id: string; name: string }> };
  registrations: PluginRegistrationApi;
  host: PluginHostApi;
}

export function assertPluginPermission(context: Pick<PluginContext, "manifest" | "grantedPermissions">, permission: PluginPermission): void {
  if (!context.grantedPermissions.includes(permission)) {
    throw new Error(`Plugin ${context.manifest.id} lacks permission: ${permission}`);
  }
}

export function createPermissionGuardedHostApi(context: PluginContext, host: PluginHostApi): PluginHostApi {
  const requirePermission = (permission: PluginPermission) => assertPluginPermission(context, permission);
  return {
    hosts: { list: () => { requirePermission("hosts.read"); return host.hosts.list(); } },
    storage: {
      list: (collection) => { requirePermission("storage.read"); return host.storage.list(collection); },
      upsert: (collection, key, value) => { requirePermission("storage.write"); return host.storage.upsert(collection, key, value); },
      remove: (collection, key) => { requirePermission("storage.write"); return host.storage.remove(collection, key); },
      claimLegacy: (source, collection) => { requirePermission("storage.write"); return host.storage.claimLegacy(source, collection); },
    },
    sessions: {
      active: () => { requirePermission("sessions.read"); return host.sessions.active(); },
      broadcastTargets: () => { requirePermission("sessions.broadcast"); return host.sessions.broadcastTargets(); },
      broadcast: (sessionIds, text) => { requirePermission("sessions.broadcast"); return host.sessions.broadcast(sessionIds, text); },
      broadcastMode: () => { requirePermission("sessions.broadcast"); return host.sessions.broadcastMode(); },
      setBroadcastMode: (enabled, sessionIds) => { requirePermission("sessions.broadcast"); return host.sessions.setBroadcastMode(enabled, sessionIds); },
      setBroadcastEnabled: (enabled) => { requirePermission("sessions.broadcast"); return host.sessions.setBroadcastEnabled(enabled); },
    },
    monitoring: { latest: (hostIds) => { requirePermission("monitoring.read"); return host.monitoring.latest(hostIds); } },
    systems: {
      inspect: async (sessionId, operation, target) => {
        const permission = operation === "metrics" || operation === "disk-details" ? "monitoring.read"
          : operation === "terminate-process" ? "processes.terminate"
            : operation === "start-container" || operation === "stop-container" ? "docker.manage"
              : "processes.read";
        requirePermission(permission);
        return await host.systems.inspect(sessionId, operation, target);
      },
    },
  };
}

export interface HyperShellPlugin { activate(context: PluginContext): Promise<Disposable> }

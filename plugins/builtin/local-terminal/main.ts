import type { createLocalProfilesRepositoryFromDatabase } from "./main/localProfilesRepository";
import type { PluginIpcMain, PluginMainMethodRegistry } from "@hypershell/plugin-api";
import type {
  OpenSessionRequest,
  PtySpawn,
  SessionLifecycleListener,
  SessionOpenPreparer,
  SessionRecoveryDataProvider,
  SessionTransportFactory,
} from "@hypershell/session-core";
import { createClaudeSessionBinder } from "./main/claudeSessionBinder";
import { registerClaudeMainMethods } from "./main/claudeIpc";
import { scanRecentClaudeSessions, watchClaudeSessions } from "./main/claudeSessions";
import { registerLocalProfilesIpc } from "./main/localProfilesIpc";
import { prepareLocalSessionOpen } from "./main/prepareLocalSession";
import { createLocalShellTransport } from "./main/localShellTransport";

export const localTerminalPluginDescriptor = {
  id: "local-terminal",
  title: "Local Terminal",
  description: "Launch local shells and WSL distributions.",
} as const;

export function registerLocalTerminalPlugin(
  ipcMain: PluginIpcMain,
  getRepository: () => ReturnType<typeof createLocalProfilesRepositoryFromDatabase>,
  registerTransport: (
    transport: "local",
    factory: SessionTransportFactory,
  ) => () => void,
  registerSessionOpenPreparer: (
    transport: "local",
    preparer: SessionOpenPreparer,
  ) => () => void,
  registerSessionLifecycleListener: (listener: SessionLifecycleListener) => () => void,
  registerSessionRecoveryDataProvider: (
    transport: "local",
    provider: SessionRecoveryDataProvider,
  ) => () => void,
  emitSessionEvent: (event: unknown) => void,
  spawnPty: PtySpawn,
  pluginMainMethods: PluginMainMethodRegistry,
): () => void {
  const profiles = registerLocalProfilesIpc(ipcMain, getRepository);
  void profiles.scheduleDetection();
  const unregisterTransport = registerTransport("local", (request) => createLocalTransportFromRequest(request, spawnPty));
  const unregisterOpenPreparer = registerSessionOpenPreparer("local", (request) =>
    prepareLocalSessionOpen(request, { getRepository })
  );
  const claudeBinder = createClaudeSessionBinder({
    scanRecent: scanRecentClaudeSessions,
    watch: watchClaudeSessions,
  });
  const unregisterLifecycleListener = registerSessionLifecycleListener(({ transport, event }) => {
    if (transport !== "local") return;
    if (event.type === "process-title") {
      claudeBinder.handleProcessTitle(event.sessionId, event.name);
    } else if (event.type === "exit") {
      claudeBinder.forget(event.sessionId);
    }
  });
  const unregisterRecoveryProvider = registerSessionRecoveryDataProvider("local", (sessionId, profileId) => {
    const claudeSessionId = claudeBinder.get(sessionId);
    const profileName = getRepository().get(profileId)?.name;
    return {
      ...(profileName ? { title: profileName } : {}),
      ...(claudeSessionId ? { pluginData: { "local-terminal": { claudeSessionId } } } : {}),
    };
  });
  const unsubscribeClaudeBindings = claudeBinder.onBinding((sessionId, claudeSessionId) => {
    emitSessionEvent({ type: "plugin-data", sessionId, pluginId: "local-terminal", data: claudeSessionId ? { claudeSessionId } : null });
  });
  const unregisterClaudeMethods = registerClaudeMainMethods(pluginMainMethods);
  return () => {
    unregisterClaudeMethods();
    unsubscribeClaudeBindings();
    claudeBinder.dispose();
    unregisterRecoveryProvider();
    unregisterLifecycleListener();
    unregisterOpenPreparer();
    unregisterTransport();
    profiles.dispose();
  };
}

function createLocalTransportFromRequest(request: OpenSessionRequest, spawnPty: PtySpawn) {
  if (!request.localOptions) {
    throw new Error("local transport requires resolved localOptions");
  }
  return createLocalShellTransport(request, request.localOptions, { spawnPty });
}

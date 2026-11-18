import {
  createNetworkMonitor,
  createProcessTitlePoller,
  createSessionManager,
  createWindowsProcessTreeProvider,
} from "@hypershell/session-core";
import {
  createRegisteredSessionTransport,
  executeRegisteredSessionCommand,
} from "./sessionTransportRegistry";
import { spawnPty } from "./ptyRuntime";
import { createSsh2ConnectionPool } from "./ssh2ConnectionPool";
import { registerPlatformSessionTransports } from "./platformSessionTransports";

export { spawnPty };

const networkMonitor = createNetworkMonitor({
  probeIntervalMs: process.env.VITEST || process.env.NODE_ENV === "test" ? 0 : 10_000,
});

const unregisterPlatformSessionTransports = registerPlatformSessionTransports();

export const sessionManager = createSessionManager({
  createTransport: createRegisteredSessionTransport,
  executeCommand: executeRegisteredSessionCommand,
  networkMonitor,
  processTitlePoller: createProcessTitlePoller({
    provider: createWindowsProcessTreeProvider(),
  }),
});

export const ssh2ConnectionPool = createSsh2ConnectionPool();

export function disposeSsh2Connections(): void {
  ssh2ConnectionPool.destroyAll();
}

export function disposeProcessRuntime(): void {
  sessionManager.destroyAll();
  disposeSsh2Connections();
  unregisterPlatformSessionTransports();
  networkMonitor.dispose();
}

import { ipcChannels } from "@hypershell/shared";
import type { SessionOutputObserver } from "@hypershell/session-core";
import type { SqliteDatabase } from "@hypershell/db";
import type { PluginIpcMain, PluginPlatformApi } from "@hypershell/plugin-api";
import {
  createSessionRecordingManager,
  registerRecordingIpc,
  type SessionRecordingManager,
} from "./recordingIpc";

export const recordingPluginDescriptor = {
  id: "recording",
  title: "Session Recording",
  rendererEntry: "plugins/builtin/session-recording/ui/RecordingPluginContribution",
  ipcOwner: "recording",
} as const;

const recordingChannels = Object.values(ipcChannels.recording);

export function registerRecordingPlugin(
  ipcMain: PluginIpcMain,
  getDatabase: () => SqliteDatabase,
  platform: PluginPlatformApi
): {
  manager: SessionRecordingManager & SessionOutputObserver;
  dispose: () => Promise<void>;
} {
  let manager: SessionRecordingManager | null = null;
  const getManager = () => (manager ??= createSessionRecordingManager(getDatabase(), platform));
  const lazyManager: SessionRecordingManager & SessionOutputObserver = {
    start: (request) => getManager().start(request),
    stop: (request) => manager?.stop(request) ?? Promise.resolve(null),
    getState: (sessionId) => manager?.getState(sessionId) ?? { active: false, recording: null },
    list: () => getManager().list(),
    delete: (id) => getManager().delete(id),
    getFrames: (id) => getManager().getFrames(id),
    exportRecording: (id, filePath) => getManager().exportRecording(id, filePath),
    onSessionData: (sessionId, data) => manager?.onSessionData(sessionId, data),
    onSessionClosed: (sessionId) => { void manager?.stop({ sessionId }); },
    stopAll: () => manager?.stopAll() ?? Promise.resolve(),
  };

  for (const channel of recordingChannels) {
    ipcMain.removeHandler?.(channel);
  }
  registerRecordingIpc(ipcMain, lazyManager);

  return {
    manager: lazyManager,
    async dispose() {
      for (const channel of recordingChannels) {
        ipcMain.removeHandler?.(channel);
      }
      await lazyManager.stopAll();
      manager = null;
    },
  };
}

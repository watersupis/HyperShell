import type { SqliteDatabase } from "@hypershell/db";
import type { PluginIpcMain, PluginPlatformApi } from "@hypershell/plugin-api";
import type { SessionOutputObserver } from "@hypershell/session-core";
import { registerRecordingPlugin } from "./main/recordingPlugin";

export function registerRecordingBuiltinPlugin(
  ipcMain: PluginIpcMain,
  getDatabase: () => SqliteDatabase,
  onManager: (manager: SessionOutputObserver | null) => void,
  platform: PluginPlatformApi
): () => void {
  const plugin = registerRecordingPlugin(ipcMain, getDatabase, platform);
  onManager(plugin.manager);
  return () => {
    onManager(null);
    void plugin.dispose();
  };
}

import type { PluginIpcMain } from "@hypershell/plugin-api";
import { registerPortForwardIpc } from "./main/portForwardIpc";
import type { PtySpawn } from "@hypershell/session-core";

export const tunnelsPluginDescriptor = { id: "tunnels" } as const;

export function registerTunnelsPlugin(ipcMain: PluginIpcMain, spawnPty: PtySpawn): () => void {
  return registerPortForwardIpc(ipcMain, spawnPty);
}

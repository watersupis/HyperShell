import {
  ipcChannels,
  startPortForwardRequestSchema,
  stopPortForwardRequestSchema,
  type PortForwardRecord,
  type StartPortForwardRequest,
  type StopPortForwardRequest
} from "@hypershell/shared";
import type { PtySpawn } from "@hypershell/session-core";
import type { IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import type { PluginIpcMain } from "@hypershell/plugin-api";
import { createPortForward, type PortForwardHandle } from "./portForwarding";

export function registerPortForwardIpc(ipcMain: PluginIpcMain, spawnPty: PtySpawn): () => void {
  const activeForwards = new Map<
    string,
    { handle: PortForwardHandle; record: PortForwardRecord }
  >();

  ipcMain.handle(ipcChannels.portForward.start, (_event: IpcMainInvokeEvent, request: StartPortForwardRequest) => {
    const parsed = startPortForwardRequestSchema.parse(request);
    const id = randomUUID();

    const handle = createPortForward(
      {
        hostname: parsed.hostname,
        username: parsed.username,
        port: parsed.port,
        forward: {
          protocol: parsed.protocol,
          localAddress: parsed.localAddress,
          localPort: parsed.localPort,
          remoteHost: parsed.remoteHost,
          remotePort: parsed.remotePort
        }
      },
      spawnPty
    );

    handle.onExit(() => { activeForwards.delete(id); });
    activeForwards.set(id, { handle, record: { id, ...parsed } });

    return { id };
  });

  ipcMain.handle(ipcChannels.portForward.stop, (_event: IpcMainInvokeEvent, request: StopPortForwardRequest) => {
    const parsed = stopPortForwardRequestSchema.parse(request);
    const active = activeForwards.get(parsed.id);
    if (active) {
      active.handle.close();
      activeForwards.delete(parsed.id);
    }
  });

  ipcMain.handle(ipcChannels.portForward.list, () => {
    return Array.from(activeForwards.values()).map((active) => active.record);
  });

  return () => {
    for (const active of activeForwards.values()) {
      active.handle.close();
    }
    activeForwards.clear();
    ipcMain.removeHandler?.(ipcChannels.portForward.start);
    ipcMain.removeHandler?.(ipcChannels.portForward.stop);
    ipcMain.removeHandler?.(ipcChannels.portForward.list);
  };
}

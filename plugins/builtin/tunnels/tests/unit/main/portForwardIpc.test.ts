import { describe, expect, it, vi } from "vitest";
import { ipcChannels } from "@hypershell/shared";
import type { PluginIpcMain } from "@hypershell/plugin-api";
import { registerPortForwardIpc } from "../../../main/portForwardIpc";

describe("port forward IPC lifecycle", () => {
  it("removes its handlers when the plugin is disposed", () => {
    const handlers = new Set<string>();
    const ipcMain: PluginIpcMain = {
      handle: vi.fn((channel) => { handlers.add(channel); }),
      removeHandler: vi.fn((channel) => { handlers.delete(channel); }),
    };

    const dispose = registerPortForwardIpc(ipcMain, vi.fn() as never);
    expect(handlers.size).toBe(3);

    dispose();

    expect(handlers.size).toBe(0);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(ipcChannels.portForward.start);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(ipcChannels.portForward.stop);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(ipcChannels.portForward.list);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { PluginIpcMain } from "@hypershell/plugin-api";
import type { SessionOpenPreparer, SessionTransportFactory } from "@hypershell/session-core";
import { registerSerialPlugin } from "../../../main";

describe("Serial plugin lifecycle", () => {
  it("registers and removes profile IPC, transport and open preparation", () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain: PluginIpcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn((channel) => handlers.delete(channel)),
    };
    const unregisterTransport = vi.fn();
    const unregisterOpenPreparer = vi.fn();
    let factory: SessionTransportFactory | undefined;
    let preparer: SessionOpenPreparer | undefined;
    const registerTransport = vi.fn((_transport: "serial", nextFactory: SessionTransportFactory) => {
      factory = nextFactory;
      return unregisterTransport;
    });
    const registerSessionOpenPreparer = vi.fn((_transport: "serial", nextPreparer: SessionOpenPreparer) => {
      preparer = nextPreparer;
      return unregisterOpenPreparer;
    });

    const dispose = registerSerialPlugin(
      ipcMain,
      () => ({
        create: vi.fn(),
        get: vi.fn((id: string) => id === "profile-1" ? {
          id,
          name: "Adapter",
          path: "COM4",
          baudRate: 115200,
          dataBits: 8,
          stopBits: 1,
          parity: "none",
          flowControl: "none",
          localEcho: false,
          dtr: true,
          rts: false,
          notes: null,
        } : undefined),
        list: vi.fn(),
        remove: vi.fn(),
      }),
      registerTransport,
      registerSessionOpenPreparer,
    );

    expect(handlers.size).toBeGreaterThan(0);
    expect(registerTransport).toHaveBeenCalledOnce();
    expect(factory).toBeTypeOf("function");
    expect(registerSessionOpenPreparer).toHaveBeenCalledOnce();
    expect(preparer?.({
      transport: "serial",
      profileId: "profile-1",
      cols: 80,
      rows: 24,
    })).toEqual({
      input: {
        serialOptions: {
          path: "COM4",
          baudRate: 115200,
          dataBits: 8,
          stopBits: 1,
          parity: "none",
          flowControl: "none",
          localEcho: false,
          dtr: true,
          rts: false,
        },
      },
    });

    dispose();

    expect(handlers.size).toBe(0);
    expect(unregisterTransport).toHaveBeenCalledOnce();
    expect(unregisterOpenPreparer).toHaveBeenCalledOnce();
  });
});

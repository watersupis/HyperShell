import type { createSerialProfilesRepository } from "./main/serialProfilesRepository";
import type { PluginIpcMain } from "@hypershell/plugin-api";
import type {
  OpenSessionRequest,
  SessionOpenPreparer,
  SessionTransportFactory,
} from "@hypershell/session-core";
import { registerSerialProfilesIpc } from "./main/serialProfilesIpc";
import { createSerialTransport, type SerialConnectionProfile } from "./main/serialTransport";

export const serialPluginDescriptor = { id: "serial" } as const;

export function registerSerialPlugin(
  ipcMain: PluginIpcMain,
  getRepository: () => ReturnType<typeof createSerialProfilesRepository>,
  registerTransport: (
    transport: "serial",
    factory: SessionTransportFactory,
  ) => () => void,
  registerSessionOpenPreparer: (
    transport: "serial",
    preparer: SessionOpenPreparer,
  ) => () => void,
): () => void {
  const unregisterIpc = registerSerialProfilesIpc(ipcMain, getRepository);
  const unregisterTransport = registerTransport("serial", createSerialTransportFromRequest);
  const unregisterOpenPreparer = registerSessionOpenPreparer("serial", (request) => {
    const profile = getRepository().get(request.profileId);
    if (!profile) return {};
    return {
      input: {
        serialOptions: {
          path: profile.path,
          baudRate: profile.baudRate,
          dataBits: profile.dataBits as 5 | 6 | 7 | 8,
          stopBits: profile.stopBits as 1 | 2,
          parity: profile.parity as "none" | "even" | "odd" | "mark" | "space",
          flowControl: profile.flowControl as "none" | "hardware" | "software",
          localEcho: profile.localEcho,
          dtr: profile.dtr,
          rts: profile.rts,
        },
      },
    };
  });

  return () => {
    unregisterOpenPreparer();
    unregisterTransport();
    unregisterIpc();
  };
}

function createSerialTransportFromRequest(request: OpenSessionRequest) {
  const options: SerialConnectionProfile = request.serialOptions ?? { path: request.profileId };
  return createSerialTransport(request, options);
}

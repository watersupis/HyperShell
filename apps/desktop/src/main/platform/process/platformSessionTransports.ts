import type { OpenSessionRequest } from "@hypershell/session-core";
import { registerSessionTransport } from "./sessionTransportRegistry";
import { createTelnetTransport } from "./telnet/telnetTransport";

export function registerPlatformSessionTransports(): () => void {
  return registerSessionTransport("telnet", createTelnetSessionTransport);
}

function createTelnetSessionTransport(request: OpenSessionRequest) {
  const options = request.telnetOptions ?? {
    hostname: request.profileId,
    port: 23,
    mode: "telnet" as const,
  };

  return createTelnetTransport(request, options);
}

import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenSessionRequest, TransportHandle } from "@hypershell/session-core";
import {
  createRegisteredSessionTransport,
  executeRegisteredSessionCommand,
  registerSessionCommandExecutor,
  registerSessionTransport,
} from "../../../../../src/main/platform/process/sessionTransportRegistry";

function createTransport(): TransportHandle {
  return {
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    onEvent: () => () => {},
  };
}

const serialRequest: OpenSessionRequest = {
  sessionId: "serial-session",
  transport: "serial",
  profileId: "COM1",
  cols: 80,
  rows: 24,
};

describe("session transport registry", () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it("dispatches requests to a registered transport without plugin identity", () => {
    const transport = createTransport();
    const factory = vi.fn(() => transport);
    dispose = registerSessionTransport("serial", factory);

    expect(createRegisteredSessionTransport(serialRequest)).toBe(transport);
    expect(factory).toHaveBeenCalledWith(serialRequest);
  });

  it("rejects duplicate registrations for the same transport kind", () => {
    dispose = registerSessionTransport("serial", () => createTransport());

    expect(() => registerSessionTransport("serial", () => createTransport()))
      .toThrow("A transport factory is already registered for: serial");
  });

  it("requires the owning plugin to register an optional transport", () => {
    expect(() => createRegisteredSessionTransport(serialRequest))
      .toThrow("No transport factory registered for serial sessions");
  });

  it("dispatches command execution through the registered transport capability", async () => {
    const input = {
      transport: "ssh" as const,
      profileId: "host-1",
      cols: 80,
      rows: 24,
    };
    const executor = vi.fn(async () => "result");
    dispose = registerSessionCommandExecutor("ssh", executor);

    await expect(executeRegisteredSessionCommand(input, "hostname")).resolves.toBe("result");
    expect(executor).toHaveBeenCalledWith(input, "hostname", undefined);
  });

  it("does not retain command executors after plugin disposal", async () => {
    const disposeExecutor = registerSessionCommandExecutor("ssh", async () => "result");
    disposeExecutor();

    await expect(executeRegisteredSessionCommand({
      transport: "ssh",
      profileId: "host-1",
      cols: 80,
      rows: 24,
    }, "hostname")).rejects.toThrow("No command executor registered for ssh sessions");
  });
});

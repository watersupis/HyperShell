import { describe, expect, it, vi } from "vitest";
import type { SessionLifecycleEvent } from "@hypershell/session-core";
import type { ConnectionHistoryRepository } from "../../../main/connectionHistoryRepository";
import { createSshConnectionHistoryListener } from "../../../main/connectionHistoryLifecycle";

function createListener() {
  const repository = {
    record: vi.fn((hostId: string | null, success: boolean, errorMessage?: string | null) => ({
      id: "history-1",
      hostId,
      hostName: "server",
      connectedAt: "2026-11-13T00:00:00.000Z",
      disconnectedAt: null,
      wasSuccessful: success,
      errorMessage: errorMessage ?? null,
    })),
    markDisconnected: vi.fn(() => true),
  } as unknown as ConnectionHistoryRepository;
  const listener = createSshConnectionHistoryListener({
    repository,
    findHost: (profileId) => profileId === "profile-1" ? { id: "host-1" } : null,
  });
  return { listener, repository };
}

describe("SSH connection history lifecycle", () => {
  it("records successful connections and marks them disconnected on exit", () => {
    const { listener, repository } = createListener();
    listener({
      transport: "ssh",
      profileId: "profile-1",
      event: { type: "status", sessionId: "session-1", state: "connected" },
    });
    listener({
      transport: "ssh",
      profileId: "profile-1",
      event: { type: "exit", sessionId: "session-1", exitCode: 0 },
    });

    expect(repository.record).toHaveBeenCalledOnce();
    expect(repository.record).toHaveBeenCalledWith("host-1", true);
    expect(repository.markDisconnected).toHaveBeenCalledWith("history-1");
  });

  it("records an error and failed status only once", () => {
    const { listener, repository } = createListener();
    const errorEvent: SessionLifecycleEvent = {
      transport: "ssh",
      profileId: "profile-1",
      event: { type: "error", sessionId: "session-1", message: "Permission denied" },
    };
    listener(errorEvent);
    listener({
      ...errorEvent,
      event: { type: "status", sessionId: "session-1", state: "failed" },
    });

    expect(repository.record).toHaveBeenCalledOnce();
    expect(repository.record).toHaveBeenCalledWith("host-1", false, "Permission denied");
  });

  it("ignores other transports and unresolved host profiles", () => {
    const { listener, repository } = createListener();
    listener({
      transport: "local",
      profileId: "profile-1",
      event: { type: "status", sessionId: "local-1", state: "connected" },
    });
    listener({
      transport: "ssh",
      profileId: "missing-profile",
      event: { type: "status", sessionId: "ssh-1", state: "connected" },
    });

    expect(repository.record).not.toHaveBeenCalled();
  });
});

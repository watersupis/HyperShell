import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveStoredHostPasswordMock = vi.fn(() => "saved-password");

const fakeHost = {
  id: "host-1",
  name: "host-1",
  hostname: "10.10.10.54",
  port: 22,
  username: "hermes",
  identityFile: null,
  hostProfileId: null,
  authProfileId: "host-password-host-1",
  groupId: null,
  notes: null,
  authMethod: "password",
  agentKind: "system",
  opReference: null,
  isFavorite: false,
  sortOrder: null,
  color: null,
  proxyJump: null,
  proxyJumpHostIds: null,
  keepAliveInterval: null,
  autoReconnect: false,
  reconnectMaxAttempts: 5,
  reconnectBaseInterval: 1
};

describe("generic session-open preparation", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveStoredHostPasswordMock.mockClear();
  });

  it("merges SSH options prepared by the enabled transport contribution", async () => {
    const { openSessionForTestInspectInput } = await import("../../../../../src/main/platform/ipc/registerIpc");

    const result = await openSessionForTestInspectInput({
      transport: "ssh",
      profileId: fakeHost.id,
      cols: 120,
      rows: 40
    }, {
      prepareOpen: () => Promise.resolve({
        input: {
          sshOptions: {
            hostname: fakeHost.hostname,
            username: fakeHost.username,
            port: fakeHost.port,
            password: resolveStoredHostPasswordMock(),
          },
        },
      }),
    });

    expect(result.session.sessionId).toBeTruthy();
    expect(result.input?.sshOptions?.hostname).toBe(fakeHost.hostname);
    expect(result.input?.sshOptions?.password).toBe("saved-password");
    expect(resolveStoredHostPasswordMock).toHaveBeenCalledTimes(1);
  });
});

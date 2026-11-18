import type { HostRecord } from "@hypershell/db";
import type { OpenSessionRequest } from "@hypershell/shared";
import { describe, expect, it, vi } from "vitest";
import { createSshSessionOpenPreparer, type SshSessionOpenServices } from "../../../main/sshSessionOpen";

const host: HostRecord = {
  id: "host-1", name: "host-1", hostname: "server.example", port: 2222,
  username: "DOMAIN\\operator", identityFile: "C:/keys/id_ed25519",
  hostProfileId: null, authProfileId: "auth-1", groupId: null, notes: null,
  authMethod: "password", agentKind: "system", opReference: null,
  isFavorite: false, sortOrder: null, color: null, proxyJump: "jump.example",
  proxyJumpHostIds: null, keepAliveInterval: 30, autoReconnect: true,
  reconnectMaxAttempts: 7, reconnectBaseInterval: 3, tmuxDetect: false,
  shellIntegration: true,
};

function createServices(overrides: Partial<SshSessionOpenServices> = {}) {
  return {
    resolveProfile: vi.fn(async () => null),
    findHost: vi.fn(() => host),
    getHostById: vi.fn(() => host),
    resolvePassword: vi.fn(async () => "saved-password"),
    normalizeUsername: vi.fn((username: string | undefined) => username?.split("\\").pop()),
    getEnabledEnvVars: vi.fn(() => ({ APP_MODE: "prod" })),
    trace: vi.fn(),
    ...overrides,
  } satisfies SshSessionOpenServices;
}

const request: OpenSessionRequest = {
  transport: "ssh", profileId: "host-1", cols: 80, rows: 24,
};

describe("SSH session-open preparation", () => {
  it("resolves host options, cached password key, environment, and reconnect defaults", async () => {
    const services = createServices();
    const prepared = await createSshSessionOpenPreparer(services)(request);

    expect(services.resolvePassword).toHaveBeenCalledWith(host, {
      hostname: host.hostname, port: host.port, username: "operator",
    });
    expect(prepared.input).toEqual({
      sshOptions: {
        hostname: host.hostname, username: host.username, port: host.port,
        identityFile: host.identityFile, shellIntegration: true,
        proxyJump: host.proxyJump, keepAliveSeconds: host.keepAliveInterval,
        password: "saved-password", envVars: { APP_MODE: "prod" },
      },
      autoReconnect: true, maxReconnectAttempts: 7, reconnectBaseInterval: 3,
    });
  });

  it("prefers a resolved profile and explicit reconnect values while adding host environment", async () => {
    const services = createServices({
      resolveProfile: vi.fn(async () => ({ hostname: "profile.example", port: 2200 })),
    });
    const prepared = await createSshSessionOpenPreparer(services)({
      ...request, autoReconnect: false, reconnectMaxAttempts: 2, reconnectBaseInterval: 9,
    });

    expect(services.findHost).not.toHaveBeenCalled();
    expect(services.resolvePassword).not.toHaveBeenCalled();
    expect(prepared.input).toEqual({
      sshOptions: { hostname: "profile.example", port: 2200, envVars: { APP_MODE: "prod" } },
      autoReconnect: false, maxReconnectAttempts: 2, reconnectBaseInterval: 9,
    });
  });

  it("falls back to the profile id and generic reconnect defaults without a host", async () => {
    const services = createServices({
      findHost: vi.fn(() => null), getHostById: vi.fn(() => undefined),
    });
    const prepared = await createSshSessionOpenPreparer(services)(request);

    expect(prepared.input).toEqual({
      sshOptions: { hostname: request.profileId },
      autoReconnect: false, maxReconnectAttempts: 5, reconnectBaseInterval: 1,
    });
  });
});

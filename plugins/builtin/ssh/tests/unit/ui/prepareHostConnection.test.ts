import { describe, expect, it, vi } from "vitest";
import type { PluginHostConnection, PluginUiHostServices } from "@hypershell/plugin-api";
import { prepareSshHostConnection } from "../../../ui/prepareHostConnection";

function createConnection(profile: Record<string, unknown> = { tmuxDetect: true, authMethod: "keyfile" }): PluginHostConnection {
  return {
    id: "host-1",
    name: "Production",
    hostname: "example.test",
    port: 22,
    username: "admin",
    hostProfileId: "profile-1",
    profile,
  };
}

function createHostServices(overrides: {
  isAvailable?: () => boolean;
  probeTmux?: () => Promise<Array<{ name: string; windowCount: number; createdAt: string; attached: boolean }>>;
  chooseTmux?: () => Promise<{ attachTo: string | null } | null>;
} = {}) {
  return {
    isAvailable: overrides.isAvailable ?? (() => true),
    remoteSessions: {
      probeTmux: vi.fn(overrides.probeTmux ?? (async () => [])),
    },
    challenges: {
      tmuxSessions: vi.fn(overrides.chooseTmux ?? (async () => ({ attachTo: "work" }))),
    },
  } as unknown as PluginUiHostServices;
}

describe("prepareSshHostConnection", () => {
  it.each([
    [{ tmuxDetect: false, authMethod: "keyfile" }, true],
    [{ tmuxDetect: true, authMethod: "password" }, true],
    [{ tmuxDetect: true, authMethod: "keyfile" }, false],
  ])("skips tmux probing when the host is not eligible", async (profile, available) => {
    const host = createHostServices({ isAvailable: () => available });

    await expect(prepareSshHostConnection(createConnection(profile), host)).resolves.toBeUndefined();
    expect(host.remoteSessions.probeTmux).not.toHaveBeenCalled();
  });

  it("returns the user's attach choice when tmux sessions are found", async () => {
    const sessions = [{ name: "work", windowCount: 2, createdAt: "now", attached: false }];
    const host = createHostServices({ probeTmux: async () => sessions });

    await expect(prepareSshHostConnection(createConnection(), host)).resolves.toEqual({ attachTo: "work" });
    expect(host.challenges.tmuxSessions).toHaveBeenCalledWith({
      host: {
        id: "host-1",
        name: "Production",
        hostname: "example.test",
        port: 22,
        username: "admin",
        hostProfileId: "profile-1",
      },
      sessions,
    });
  });

  it("falls back to a normal connection when probing fails or finds no sessions", async () => {
    const emptyHost = createHostServices();
    await expect(prepareSshHostConnection(createConnection(), emptyHost)).resolves.toBeUndefined();

    const failingHost = createHostServices({ probeTmux: async () => { throw new Error("offline"); } });
    await expect(prepareSshHostConnection(createConnection(), failingHost)).resolves.toBeUndefined();
  });

  it("treats a superseded probe as canceled", async () => {
    let resolveProbe!: (sessions: Array<{ name: string; windowCount: number; createdAt: string; attached: boolean }>) => void;
    const host = createHostServices({
      probeTmux: () => new Promise((resolve) => { resolveProbe = resolve; }),
    });
    const pending = prepareSshHostConnection(createConnection(), host);
    await prepareSshHostConnection(createConnection({ tmuxDetect: false }), host);
    resolveProbe([{ name: "work", windowCount: 1, createdAt: "now", attached: false }]);

    await expect(pending).resolves.toBeNull();
  });
});

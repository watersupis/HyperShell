import { describe, expect, it, vi } from "vitest";
import type { PluginHostActionContext, PluginHostContext } from "@hypershell/plugin-api";
import { connectSftpWithChallenges } from "../../../ui/connectSftp";

const host: PluginHostContext = {
  id: "host-1",
  name: "Web",
  hostname: "web.example",
  port: 22,
  username: "saved-user",
};

function makeServices(overrides: {
  connect?: PluginHostActionContext["sftp"]["connect"];
  credentials?: PluginHostActionContext["challenges"]["credentials"];
  hostKey?: PluginHostActionContext["challenges"]["hostKey"];
  trust?: PluginHostActionContext["security"]["trustHostFingerprint"];
} = {}) {
  const services = {
    sftp: { connect: overrides.connect ?? vi.fn().mockResolvedValue({ sftpSessionId: "sftp-1" }) },
    challenges: {
      credentials: overrides.credentials ?? vi.fn().mockResolvedValue(null),
      hostKey: overrides.hostKey ?? vi.fn().mockResolvedValue(false),
    },
    security: { trustHostFingerprint: overrides.trust ?? vi.fn().mockResolvedValue(undefined) },
  };
  return services;
}

describe("connectSftpWithChallenges", () => {
  it("returns the session id when the initial connection succeeds", async () => {
    const services = makeServices();
    await expect(connectSftpWithChallenges(host, services)).resolves.toBe("sftp-1");
    expect(services.sftp.connect).toHaveBeenCalledWith({ hostId: "host-1" });
    expect(services.challenges.credentials).not.toHaveBeenCalled();
  });

  it("prompts for credentials after a failed connection and retries", async () => {
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("Authentication failed"))
      .mockResolvedValueOnce({ sftpSessionId: "sftp-2" });
    const credentials = vi.fn().mockResolvedValue({ username: "root", password: "secret" });
    const services = makeServices({ connect, credentials });

    await expect(connectSftpWithChallenges(host, services)).resolves.toBe("sftp-2");
    expect(credentials).toHaveBeenCalledWith({ host, username: "saved-user", error: "Authentication failed" });
    expect(connect).toHaveBeenLastCalledWith({ hostId: "host-1", username: "root", password: "secret" });
  });

  it("rejects an empty username and asks again without another connection attempt", async () => {
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("Authentication failed"))
      .mockResolvedValueOnce({ sftpSessionId: "sftp-valid-user" });
    const credentials = vi.fn()
      .mockResolvedValueOnce({ username: "  ", password: "secret" })
      .mockResolvedValueOnce({ username: "root", password: "secret" });
    const services = makeServices({ connect, credentials });

    await expect(connectSftpWithChallenges(host, services)).resolves.toBe("sftp-valid-user");
    expect(credentials).toHaveBeenNthCalledWith(2, {
      host,
      username: "",
      error: "Username is required.",
    });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("re-prompts with the latest authentication error after submitted credentials fail", async () => {
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("Initial failure"))
      .mockRejectedValueOnce(new Error("Bad password"))
      .mockResolvedValueOnce({ sftpSessionId: "sftp-retried" });
    const credentials = vi.fn()
      .mockResolvedValueOnce({ username: "root", password: "wrong" })
      .mockResolvedValueOnce({ username: "root", password: "right" });
    const services = makeServices({ connect, credentials });

    await expect(connectSftpWithChallenges(host, services)).resolves.toBe("sftp-retried");
    expect(credentials).toHaveBeenNthCalledWith(2, {
      host,
      username: "root",
      error: "Bad password",
    });
    expect(connect).toHaveBeenLastCalledWith({ hostId: "host-1", username: "root", password: "right" });
  });

  it("returns null when the credential challenge is cancelled", async () => {
    const services = makeServices({
      connect: vi.fn().mockRejectedValue(new Error("Authentication failed")),
    });
    await expect(connectSftpWithChallenges(host, services)).resolves.toBeNull();
    expect(services.sftp.connect).toHaveBeenCalledTimes(1);
  });

  it("trusts a host key and retries the connection", async () => {
    const info = {
      hostname: host.hostname,
      port: host.port,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:abc",
      verificationStatus: "new_host" as const,
    };
    const connect = vi.fn()
      .mockResolvedValueOnce({ hostKeyVerification: info })
      .mockResolvedValueOnce({ sftpSessionId: "sftp-3" });
    const hostKey = vi.fn().mockResolvedValue(true);
    const trust = vi.fn().mockResolvedValue(undefined);
    const services = makeServices({ connect, hostKey, trust });

    await expect(connectSftpWithChallenges(host, services)).resolves.toBe("sftp-3");
    expect(hostKey).toHaveBeenCalledWith({ host, info });
    expect(trust).toHaveBeenCalledWith(expect.objectContaining({
      hostname: host.hostname,
      port: host.port,
      algorithm: info.algorithm,
      fingerprint: info.fingerprint,
    }));
  });

  it("does not trust or retry a rejected host key", async () => {
    const info = {
      hostname: host.hostname,
      port: host.port,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:abc",
      verificationStatus: "new_host" as const,
    };
    const connect = vi.fn().mockResolvedValue({ hostKeyVerification: info });
    const trust = vi.fn();
    const services = makeServices({ connect, trust });

    await expect(connectSftpWithChallenges(host, services)).resolves.toBeNull();
    expect(trust).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

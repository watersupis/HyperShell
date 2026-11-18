import type { PluginHostActionContext, PluginHostContext } from "@hypershell/plugin-api";

type SftpConnectionServices = {
  challenges: Pick<PluginHostActionContext["challenges"], "credentials" | "hostKey">;
  sftp: PluginHostActionContext["sftp"];
  security: PluginHostActionContext["security"];
};

export async function connectSftpWithChallenges(
  host: PluginHostContext,
  services: SftpConnectionServices
): Promise<string | null> {
  let prompting = false;
  let promptUsername = host.username.trim();
  let promptError: string | null = null;

  for (;;) {
    let credentials: { username: string; password?: string } | undefined;
    if (prompting) {
      const answer = await services.challenges.credentials({
        host,
        username: promptUsername,
        error: promptError,
      });
      if (!answer) return null;
      promptUsername = answer.username.trim();
      if (!promptUsername) {
        promptError = "Username is required.";
        continue;
      }
      credentials = { username: promptUsername, ...(answer.password ? { password: answer.password } : {}) };
    }

    let response;
    try {
      response = await services.sftp.connect({ hostId: host.id, ...credentials });
    } catch (error) {
      promptError = error instanceof Error ? error.message : String(error);
      prompting = true;
      continue;
    }

    if ("hostKeyVerification" in response) {
      const info = response.hostKeyVerification;
      if (!await services.challenges.hostKey({ host, info })) return null;
      await services.security.trustHostFingerprint({
        id: `fp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        hostname: info.hostname,
        port: info.port,
        algorithm: info.algorithm,
        fingerprint: info.fingerprint,
      });
      promptError = null;
      continue;
    }

    return response.sftpSessionId;
  }
}

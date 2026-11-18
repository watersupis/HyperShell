import { randomUUID } from "node:crypto";
import type { createLocalProfilesRepositoryFromDatabase } from "./localProfilesRepository";
import type { OpenSessionRequest } from "@hypershell/shared";
import type { SessionOpenPreparation } from "@hypershell/session-core";
import { getClaudeSessionInfo } from "./claudeSessions";
import { applyClaudeSessionArgs } from "./claudeSessionArgs";
import { buildClaudeResumeCommand } from "./claudeResumeCommand";

type LocalProfilesRepository = ReturnType<typeof createLocalProfilesRepositoryFromDatabase>;

export interface LocalSessionPreparationServices {
  getRepository(): LocalProfilesRepository;
  getClaudeSessionInfo?: (sessionId: string) => Promise<{ cwd: string | null } | null>;
  generateSessionId?: () => string;
}

export async function prepareLocalSessionOpen(
  request: OpenSessionRequest,
  services: LocalSessionPreparationServices
): Promise<SessionOpenPreparation> {
  const repository = services.getRepository();
  const profile = repository.get(request.profileId);

  if (!profile) {
    throw new Error(`Unknown local profile: ${request.profileId}`);
  }
  if (!profile.isAvailable) {
    throw new Error(`Local shell is not available: ${profile.name}`);
  }

  const envVars = Object.fromEntries(
    repository
      .listEnvVars(profile.id)
      .filter((entry) => entry.isEnabled)
      .map((entry) => [entry.name, entry.value])
  );
  const pluginData = request.pluginData?.["local-terminal"];
  const resumeSessionId =
    pluginData && typeof pluginData === "object" &&
    typeof (pluginData as Record<string, unknown>).claudeSessionId === "string"
      ? (pluginData as { claudeSessionId: string }).claudeSessionId
      : undefined;
  const launch = applyClaudeSessionArgs(
    {
      args: profile.args,
      claudeSession: profile.claudeSession,
      claudeSessionMode: profile.claudeSessionMode,
    },
    resumeSessionId,
    services.generateSessionId ?? randomUUID
  );

  let startupCommand: string | undefined;
  let claudeSessionId = launch.claudeSessionId;

  if (!profile.claudeSession && resumeSessionId) {
    const info = await (services.getClaudeSessionInfo ?? getClaudeSessionInfo)(
      resumeSessionId
    );
    if (info) {
      startupCommand = buildClaudeResumeCommand({
        executable: profile.executable,
        claudeSessionId: resumeSessionId,
        cwd: info.cwd,
      }) ?? undefined;
      if (startupCommand) {
        claudeSessionId = resumeSessionId;
      }
    }
  }

  return {
    input: {
      localOptions: {
        executable: profile.executable,
        args: launch.args,
        cwd: profile.startingDirectory ?? undefined,
        envVars,
        startupCommand,
      },
    },
    response: claudeSessionId ? { pluginData: { "local-terminal": { claudeSessionId } } } : undefined,
  };
}

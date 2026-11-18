import type { PluginHostConnection, PluginUiHostServices } from "@hypershell/plugin-api";

type HostConnectionServices = Pick<PluginUiHostServices, "isAvailable" | "remoteSessions" | "challenges">;

let latestConnectionRequest = 0;

export async function prepareSshHostConnection(
  connection: PluginHostConnection,
  host: HostConnectionServices
): Promise<{ attachTo: string | null } | null | undefined> {
  const requestId = ++latestConnectionRequest;
  const { profile } = connection;
  if (
    profile.tmuxDetect !== true ||
    profile.authMethod === "password" ||
    !host.isAvailable()
  ) {
    return undefined;
  }

  try {
    const sessions = await host.remoteSessions.probeTmux({ hostId: connection.id });
    if (requestId !== latestConnectionRequest) return null;
    if (sessions.length === 0) return undefined;

    const choice = await host.challenges.tmuxSessions({
      host: {
        id: connection.id,
        name: connection.name,
        hostname: connection.hostname,
        port: connection.port,
        username: connection.username,
        hostProfileId: connection.hostProfileId,
      },
      sessions,
    });
    return requestId === latestConnectionRequest ? choice : null;
  } catch {
    if (requestId !== latestConnectionRequest) return null;
    return undefined;
  }
}

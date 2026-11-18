import type { HostRecord } from "@hypershell/db";
import type {
  SessionOpenPreparer,
  SshConnectionOptions,
} from "@hypershell/session-core";
import type { OpenSessionRequest } from "@hypershell/shared";
import {
  DEFAULT_RECONNECT_BASE_INTERVAL,
  DEFAULT_RECONNECT_MAX_ATTEMPTS,
} from "@hypershell/shared";

export interface SshSessionOpenServices {
  resolveProfile?: (profileId: string) => Promise<SshConnectionOptions | null>;
  findHost: (profileId: string) => HostRecord | null;
  getHostById: (hostId: string) => HostRecord | undefined;
  resolvePassword: (
    host: HostRecord,
    cacheLookup?: { hostname: string; port: number; username: string },
  ) => Promise<string | undefined>;
  normalizeUsername: (username: string | undefined) => string | undefined;
  getEnabledEnvVars: (hostId: string) => Record<string, string>;
  trace: (message: string, details?: Record<string, unknown>) => void;
}

export function createSshSessionOpenPreparer(
  services: SshSessionOpenServices,
): SessionOpenPreparer {
  return async (request: OpenSessionRequest) => {
    if (request.transport !== "ssh") return {};

    services.trace("Open request received", { profileId: request.profileId });

    let host: HostRecord | null = null;
    let sshOptions = (await services.resolveProfile?.(request.profileId)) ?? undefined;
    if (sshOptions) {
      services.trace("Resolved profile from resolver", {
        profileId: request.profileId,
        hasPassword: Boolean(sshOptions.password),
        hasIdentityFile: Boolean(sshOptions.identityFile),
      });
    } else {
      host = services.findHost(request.profileId);
      if (host) {
        sshOptions = {
          hostname: host.hostname,
          username: host.username ?? undefined,
          port: host.port,
          identityFile: host.identityFile ?? undefined,
          shellIntegration: host.shellIntegration ?? true,
          ...(host.proxyJump ? { proxyJump: host.proxyJump } : {}),
          ...(host.keepAliveInterval != null
            ? { keepAliveSeconds: host.keepAliveInterval }
            : {}),
        };
        services.trace("Resolved host from DB", {
          hostId: host.id,
          authMethod: host.authMethod ?? "default",
          hasAuthProfile: Boolean(host.authProfileId),
        });

        const cacheUsername = services.normalizeUsername(host.username ?? undefined);
        const password = await services.resolvePassword(
          host,
          cacheUsername
            ? {
                hostname: host.hostname,
                port: host.port,
                username: cacheUsername,
              }
            : undefined,
        );
        if (password) sshOptions.password = password;
      }
    }

    // A resolved SSH profile may still map to a saved host by id; that host
    // supplies environment variables and reconnect defaults.
    host ??= services.getHostById(request.profileId) ?? null;
    if (host) {
      const envVars = services.getEnabledEnvVars(host.id);
      if (Object.keys(envVars).length > 0) {
        sshOptions = {
          ...(sshOptions ?? {
            hostname: host.hostname,
            username: host.username ?? undefined,
            port: host.port,
          }),
          envVars,
        };
      }
    }

    const preparedOptions = sshOptions ?? { hostname: request.profileId };
    services.trace("Opening SSH session", {
      profileId: request.profileId,
      hostname: preparedOptions.hostname,
      hasPassword: Boolean(preparedOptions.password),
      hasIdentityFile: Boolean(preparedOptions.identityFile),
    });

    return {
      input: {
        sshOptions: preparedOptions,
        autoReconnect: request.autoReconnect ?? Boolean(host?.autoReconnect),
        maxReconnectAttempts:
          request.reconnectMaxAttempts ??
          host?.reconnectMaxAttempts ??
          DEFAULT_RECONNECT_MAX_ATTEMPTS,
        reconnectBaseInterval:
          request.reconnectBaseInterval ??
          host?.reconnectBaseInterval ??
          DEFAULT_RECONNECT_BASE_INTERVAL,
      },
    };
  };
}

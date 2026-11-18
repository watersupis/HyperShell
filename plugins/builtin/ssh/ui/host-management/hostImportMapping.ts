import { DEFAULT_RECONNECT_BASE_INTERVAL, DEFAULT_RECONNECT_MAX_ATTEMPTS } from "@hypershell/shared";
import type { PuttySession, UpsertHostRequest } from "@hypershell/shared";
import type { SshConfigImportItem } from "./SshConfigImportDialog";

const defaultConnectionSettings = {
  authMethod: "default" as const,
  agentKind: "system" as const,
  autoReconnect: false,
  reconnectMaxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
  reconnectBaseInterval: DEFAULT_RECONNECT_BASE_INTERVAL,
  tmuxDetect: false,
  shellIntegration: true,
};

export function sshConfigImportToHost(item: SshConfigImportItem, id: string): UpsertHostRequest {
  return {
    id,
    name: item.alias,
    hostname: item.hostName ?? item.alias,
    port: item.port ?? 22,
    username: item.user || null,
    group: "Imported",
    tags: "ssh-config",
    ...defaultConnectionSettings,
  };
}

export function puttySessionToHost(session: PuttySession, id: string): UpsertHostRequest {
  return {
    id,
    name: session.name,
    hostname: session.hostname,
    port: session.port,
    username: session.username || null,
    identityFile: session.keyFile || null,
    group: "PuTTY Import",
    tags: "putty",
    ...defaultConnectionSettings,
  };
}

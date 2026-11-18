import type { SqliteDatabase } from "@hypershell/db";
import type { SessionManager, Ssh2ConnectionPool } from "@hypershell/session-core";
import type { PluginPlatformApi } from "@hypershell/plugin-api";

export interface BuiltinConnectionProfile {
  id: string;
  name: string;
  hostname: string;
  username?: string;
  port?: number;
  identityFile?: string;
  proxyJump?: string;
  keepAliveSeconds?: number;
}

export interface SftpPluginServices {
  platform: PluginPlatformApi & {
    paths: PluginPlatformApi["paths"] & { getTemporaryDirectory(): string };
  };
  storage: { getDatabase(): SqliteDatabase | null };
  sessions: {
    manager: SessionManager;
  };
  editorWindows: {
    notifyContextClosed(pluginId: string, windowKey: string): void;
  };
  ssh: { connectionPool: Ssh2ConnectionPool };
  connections: {
    resolveProfile(profileId: string): Promise<{
      hostname: string;
      username?: string;
      port?: number;
      identityFile?: string;
      password?: string;
      proxyJump?: string;
      keepAliveSeconds?: number;
    } | null>;
  };
  credentials: {
    findHost(profileId: string): BuiltinConnectionProfile | null;
    resolvePassword(
      profileId: string,
      options: {
        transport: string;
        existing?: string;
        cacheLookup?: { hostname: string; port: number; username: string };
      }
    ): Promise<string | undefined>;
    normalizeUsername(username: string | undefined): string | undefined;
    cachePassword(input: { hostname: string; port: number; username: string; password: string }): void;
    trace(transport: string, message: string, details?: Record<string, unknown>): void;
  };
}

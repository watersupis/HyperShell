import {
  ipcChannels,
  tmuxProbeRequestSchema,
  type TmuxProbeResponse,
} from "@hypershell/shared";
import { tmuxProbe, type TmuxSession } from "./tmux/tmuxProbe";
import type { PluginIpcMain } from "@hypershell/plugin-api";

export interface TmuxHostConnectionOptions {
  hostname: string;
  username: string | null;
  port: number;
  identityFile: string | null;
  proxyJump: string | null;
  keepAliveInterval: number | null;
}

export function registerTmuxIpc(
  ipcMain: PluginIpcMain,
  getHost: (id: string) => TmuxHostConnectionOptions | undefined,
): () => void {
  ipcMain.handle(
    ipcChannels.tmux.probe,
    async (_event: unknown, request: unknown): Promise<TmuxProbeResponse> => {
      const parsed = tmuxProbeRequestSchema.parse(request);
      const host = getHost(parsed.hostId);

      if (!host) {
        return { sessions: [] };
      }

      const sessions = await tmuxProbe({
        hostname: host.hostname,
        username: host.username ?? undefined,
        port: host.port,
        identityFile: host.identityFile ?? undefined,
        proxyJump: host.proxyJump ?? undefined,
        keepAliveSeconds: host.keepAliveInterval ?? undefined,
      });

      return {
        sessions: sessions.map((s: TmuxSession) => ({
          name: s.name,
          windowCount: s.windowCount,
          createdAt: s.createdAt.toISOString(),
          attached: s.attached,
        })),
      };
    },
  );

  return () => ipcMain.removeHandler?.(ipcChannels.tmux.probe);
}

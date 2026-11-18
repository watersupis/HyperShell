import { useState } from "react";
import { toast } from "sonner";
import type { PluginTerminalToolbarProps } from "@hypershell/plugin-api";
import { usePluginI18n } from "@hypershell/plugin-sdk";
import { connectSftpWithChallenges } from "./connectSftp";

export function SftpTerminalToolbar({ session, host, openTab }: PluginTerminalToolbarProps) {
  const { t } = usePluginI18n(host);
  const [busy, setBusy] = useState(false);
  if (session.transport !== "ssh" || !session.hostId) return null;

  const openSftp = async () => {
    if (!session.workingDirectory) {
      toast.error(t("Could not determine the current remote directory"));
      return;
    }

    setBusy(true);
    try {
      const record = (await host.hostManagement.hosts.list()).find((item) => item.id === session.hostId);
      if (!record) throw new Error(t("No saved SSH host matches this terminal"));
      const connectionHost = {
        id: record.id,
        name: record.name,
        hostname: record.hostname,
        port: record.port,
        username: record.username ?? "",
        ...(record.hostProfileId ? { hostProfileId: record.hostProfileId } : {}),
      };
      const sftpSessionId = await connectSftpWithChallenges(connectionHost, host);
      if (!sftpSessionId) return;
      openTab({
        sessionId: `sftp-tab-${sftpSessionId}`,
        title: `SFTP: ${record.name}`,
        type: "plugin",
        pluginId: "sftp",
        transport: "sftp",
        pluginData: { sftpSessionId, initialRemotePath: session.workingDirectory },
        hostId: record.id,
        preopened: true,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("SFTP connection failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy || !session.workingDirectory}
      onClick={() => void openSftp()}
      className="rounded p-1 text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      title={t(session.workingDirectory ? "Open SFTP at current directory" : "Waiting for the remote shell to report its current directory")}
      aria-label={t("Open SFTP at current directory")}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M1.5 3h3l1 1h5a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

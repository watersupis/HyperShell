import { startTransferEventCoordinator } from "./ui/transferEventCoordinator";
import type { PluginUiContribution } from "@hypershell/plugin-api";
import { connectSftpWithChallenges } from "./ui/connectSftp";

export const sftpUiContribution: PluginUiContribution = {
  id: "sftp",
  migrateSettings: (settings) => {
    const legacyKeys = ["usePopupTransferMonitor", "autoHideCompletedTransfers", "sftpChunkConcurrency"];
    if (!legacyKeys.some((key) => key in settings.general)) return settings;
    const pluginSettings = { ...settings.pluginSettings };
    const sftpSettings = { ...(pluginSettings.sftp ?? {}) };
    for (const key of legacyKeys) {
      const legacyValue = settings.general[key];
      if (sftpSettings[key] === undefined && (typeof legacyValue === "boolean" ||
          (key === "sftpChunkConcurrency" && [1, 2, 4].includes(legacyValue as number)))) {
        sftpSettings[key] = legacyValue;
      }
    }
    const general = { ...settings.general };
    for (const key of legacyKeys) delete general[key];
    pluginSettings.sftp = sftpSettings;
    return { ...settings, general, pluginSettings };
  },
  getSettingsPages: () => [{
    id: "transfers",
    title: "SFTP Transfers",
    load: () => import("./ui/SftpSettingsPage").then((module) => ({ default: module.SftpSettingsPage })),
  }],
  canRestoreSavedSession: () => false,
  loadOverlay: () =>
    import("./ui/components/TransferPopup").then((module) => ({ default: module.TransferPopup })),
  loadWorkspaceTabRenderer: () =>
    import("./ui/SftpTab").then((module) => ({ default: module.SftpTab })),
  loadTerminalToolbar: () =>
    import("./ui/SftpTerminalToolbar").then((module) => ({ default: module.SftpTerminalToolbar })),
  loadWindowRenderer: () =>
    import("./ui/editor/SftpEditorWindow").then((module) => ({ default: module.SftpEditorWindow })),
  activate: startTransferEventCoordinator,
  getHostActions: ({ openTab, host: hostServices }) => [{
    id: "sftp.open",
    label: "SFTP Browser",
    showAsHostQuickAction: true,
    execute: async (host) => {
      if (!hostServices.isAvailable()) return;
      const sftpSessionId = await connectSftpWithChallenges(host, hostServices);
      if (!sftpSessionId) return;
      const sessionId = `sftp-tab-${sftpSessionId}`;
      openTab({
        sessionId,
        title: `SFTP: ${host.name}`,
        type: "plugin",
        pluginId: "sftp",
        transport: "sftp",
        pluginData: { sftpSessionId },
        hostId: host.id,
        preopened: true,
      });
    },
  }],
  getCommands: ({ getActiveHost, hostActions }) => [{
    id: "sftp.open",
    title: "Open SFTP for Active Host",
    category: "SFTP",
    visible: () => getActiveHost() !== null,
    execute: () => {
      const host = getActiveHost();
      const action = hostActions.find((item) => item.id === "sftp.open");
      if (host && action) void action.execute(host);
    },
    keywords: ["file", "browse", "transfer"],
  }],
  getWorkspaceTabProps: (tab, isActive, onClose) => ({
    sftpSessionId: getSftpSessionId(tab) ?? tab.sessionId,
    hostId: tab.hostId ?? tab.profileId ?? "",
    initialRemotePath: typeof tab.pluginData?.initialRemotePath === "string" ? tab.pluginData.initialRemotePath : undefined,
    isActive,
    onClose,
  }),
  getTabPresentation: () => ({ label: "SFTP", icon: "folder" }),
  closeWorkspaceTab: (tab, host) => {
    const sftpSessionId = getSftpSessionId(tab);
    if (sftpSessionId) void host.remoteFiles.disconnect(sftpSessionId).catch(() => {});
  },
};

function getSftpSessionId(tab: { pluginData?: Record<string, unknown> }): string | undefined {
  const value = tab.pluginData?.sftpSessionId;
  if (typeof value === "string") return value;
  const legacyValue = (tab as typeof tab & { sftpSessionId?: unknown }).sftpSessionId;
  return typeof legacyValue === "string" ? legacyValue : undefined;
}

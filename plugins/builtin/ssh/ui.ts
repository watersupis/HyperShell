import type { PluginUiContribution } from "@hypershell/plugin-api";
import { connectionHistoryRecordArraySchema } from "./connectionHistory";
import { connectionHistoryStore } from "./ui/connectionHistoryStore";
import { getHostExportActions } from "./ui/hostExport";
import { hostImportStore } from "./ui/host-management/hostImportStore";
import { prepareSshHostConnection } from "./ui/prepareHostConnection";
import { createHostRecord, mapHostRecord, persistHostRecord } from "./ui/host-management/hostPersistence";
import type { HostFormValue, HostUiRecord } from "@hypershell/shared";

export const sshUiContribution: PluginUiContribution = {
  id: "ssh",
  loadOverlay: () =>
    import("./ui/SshPluginOverlay").then((module) => ({ default: module.SshPluginOverlay })),
  getHostActions: ({ host }) => [{
    id: "ssh.lastConnected",
    label: "Last connected",
    disabled: true,
    resolveLabel: async (target) => {
      const records = connectionHistoryRecordArraySchema.parse(await host.pluginMain.invoke(
        "ssh",
        "connectionHistory.listByHost",
        { hostId: target.id, limit: 200 },
      ));
      const latest = records.find((record) => record.wasSuccessful);
      if (!latest) return "Last connected: Never";
      const date = new Date(latest.connectedAt);
      return `Last connected: ${Number.isNaN(date.getTime()) ? latest.connectedAt : date.toLocaleString()}`;
    },
    execute: () => {},
  }, {
    id: "ssh.connectionHistory",
    label: "Connection History",
    execute: (target) => connectionHistoryStore.getState().open(target),
  }],
  prepareHostConnection: (connection, { host }) =>
    prepareSshHostConnection(connection, host),
  getSidebarActions: ({ host }) => [
    ...getHostExportActions(host),
    {
      id: "ssh.import-hosts",
      label: "Import SSH hosts…",
      action: () => hostImportStore.getState().show("ssh-config"),
    },
  ],
  getHostEditor: () => ({
    load: () => import("./ui/host-management/HostForm").then((module) => ({ default: module.HostForm })),
    mapRecord: mapHostRecord,
    createRecord: (value, id) => createHostRecord(value as HostFormValue, id),
    persistRecord: (record, host, options) =>
      persistHostRecord(record as HostUiRecord, host, options),
  }),
  getSettingsPages: () => [{
    id: "keys",
    title: "SSH Keys",
    load: () => import("./ui/SshKeyManager").then((module) => ({ default: module.SshKeyManager })),
  }, {
    id: "host-imports",
    title: "Host Imports",
    load: () => import("./ui/host-management/HostImportSettingsPage").then((module) => ({ default: module.HostImportSettingsPage })),
  }],
  getCommands: () => [
    { id: "ssh.import-config", title: "Import SSH Config", category: "Host", visible: () => true, execute: () => hostImportStore.getState().show("ssh-config"), keywords: ["import", "config", "openssh"] },
    { id: "ssh.import-putty", title: "Import from PuTTY", category: "Host", visible: () => true, execute: () => hostImportStore.getState().show("putty"), keywords: ["import", "putty", "migrate"] },
    { id: "ssh.import-manager", title: "Import from SshManager", category: "Host", visible: () => true, execute: () => hostImportStore.getState().show("ssh-manager"), keywords: ["import", "migrate"] },
  ],
};

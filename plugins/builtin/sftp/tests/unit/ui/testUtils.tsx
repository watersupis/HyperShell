import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { SftpUiHostProvider } from "../../../ui/hostServices";

let pluginSettings: Record<string, unknown> = {
  usePopupTransferMonitor: false,
  autoHideCompletedTransfers: false,
  sftpChunkConcurrency: 1,
};
const settingsListeners = new Set<() => void>();
const hostChangeListeners = new Set<() => void>();

export const sftpTestHost: PluginUiHostServices = {
  isAvailable: () => true,
  externalPlugins: { list: async () => [], invoke: async () => undefined },
  pluginMain: { invoke: async () => null },
  Modal: () => null,
  ui: {
    ConfirmDialog: () => null,
    PromptDialog: () => null,
    PaneResizeHandle: () => null,
    Button: () => null,
    IconButton: () => null,
    SidebarSection: () => null,
    ContextMenu: () => null,
    Input: () => null,
    Select: () => null,
    SectionLabel: () => null,
    TagManager: () => null,
  },
  i18n: {
    getLocale: () => "en",
    translate: (key) => key,
    subscribe: () => () => {},
  },
  settings: {
    getPlugin: () => pluginSettings,
    updatePlugin: async (_pluginId, partial) => {
      pluginSettings = { ...pluginSettings, ...partial };
      settingsListeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
  },
  remoteFiles: {
    disconnect: async () => {},
  },
  remoteSessions: {
    probeTmux: async () => [],
  },
  sshKeys: {
    list: async () => [],
    listPaths: async () => [],
    generate: async () => ({ path: "" }),
    remove: async () => {},
    convertPpk: async () => ({ success: false, error: "Not available in this test" }),
  },
  challenges: {
    credentials: async () => null,
    hostKey: async () => false,
    keyboardInteractive: async () => [],
    tmuxSessions: async () => null,
  },
  security: {
    trustHostFingerprint: async () => undefined,
  },
  hosts: {
    export: async () => ({ exported: 0 }),
  },
  hostManagement: {
    hosts: {
      upsert: async () => {
        for (const listener of hostChangeListeners) listener();
        return {} as never;
      },
      subscribeChanged: (listener) => {
        hostChangeListeners.add(listener);
        return () => hostChangeListeners.delete(listener);
      },
      notifyChanged: () => {
        for (const listener of hostChangeListeners) listener();
      },
    },
    tags: { list: async () => [], upsert: async () => ({} as never), remove: async () => {}, getForHost: async () => [], setForHost: async () => [] },
    profiles: { list: async () => [], upsert: async () => ({} as never), remove: async () => {} },
    environment: { list: async () => [], replace: async () => {} },
    portForwards: { list: async () => [], upsert: async () => ({} as never), remove: async () => false },
    onePassword: { listVaults: async () => [], listItems: async () => [], getItemFields: async () => [] },
    imports: { scanPuttySessions: async () => ({ sessions: [] }), scanSshManager: async () => ({ dbPath: "", hosts: [], groups: [], snippets: [] }), importSshManager: async () => ({ importedHosts: 0, importedGroups: 0, snippets: [], skippedDuplicates: 0 }) },
  },
  sftp: {
    connect: async () => ({ sftpSessionId: "sftp-test" }),
    readFile: async () => ({ content: "", encoding: "utf-8", size: 0, modifiedAt: null }),
    writeFile: async () => ({ status: "written", size: 0, modifiedAt: "" }),
    list: async () => ({ entries: [] }), stat: async () => ({} as never), chmod: async () => {},
    mkdir: async () => {}, rename: async () => {}, copy: async () => {}, delete: async () => {},
    deleteWithBackup: async () => ({ backupId: "", archivePath: "", expiresAt: 0, deletedPaths: [], failedPaths: [] }), restoreDeleteBackup: async () => [],
    operationLogsList: async () => [], operationLogAppend: async () => {}, operationLogsClear: async () => {},
    transferStart: async () => [], transferCancel: async () => {}, transferPause: async () => {},
    transferResume: async () => {}, transferRetry: async () => ({} as never), transferList: async () => ({ transfers: [] }),
    transferResolveConflict: async () => {}, onEvent: () => () => {}, bookmarksList: async () => [],
    bookmarksUpsert: async () => ({} as never), bookmarksRemove: async () => {}, syncStart: async () => ({ syncId: "" }),
    syncStop: async () => {}, syncList: async () => ({ syncs: [] }), onSyncEvent: () => () => {},
    dragOut: async () => ({ tempPath: "" }), startNativeDragOut: () => {},
  },
  files: {
    getPathForFile: () => "",
    showOpenDialog: async () => null,
    list: async () => ({ entries: [] }), stat: async () => ({} as never), getHome: async () => ({ path: "" }),
    getDrives: async () => ({ drives: [] }), openItem: async () => {}, showInFolder: async () => {},
    trash: async () => {}, rename: async () => {}, copy: async () => {},
    showSaveDialog: async () => null,
  },
  editor: { open: async () => {}, onOpenFile: () => () => {}, onSessionClosed: () => () => {} },
  localProfiles: {
    list: async () => [], upsert: async () => ({} as never), remove: async () => {},
    setHidden: async () => {}, reorder: async () => {}, rescan: async () => [], getEnvVars: async () => [],
  },
  recordings: {
    start: async () => ({} as never),
    stop: async () => null,
    getState: async () => ({ active: false, recording: null }),
    list: async () => [],
    delete: async () => ({ deleted: true }),
    getFrames: async () => [],
    export: async () => ({ exported: true }),
  },
  portForward: {
    start: async () => ({ id: "" }),
    stop: async () => {},
    list: async () => [],
  },
  serialProfiles: {
    list: async () => [],
    upsert: async () => ({} as never),
    remove: async () => {},
    listPorts: async () => [],
  },
};

export function resetSftpTestHost(): void {
  sftpTestHost.sftp.onEvent = () => () => {};
  sftpTestHost.sftp.transferList = async () => ({ transfers: [] });
  sftpTestHost.sftp.dragOut = async () => ({ tempPath: "" });
  sftpTestHost.files.list = async () => ({ entries: [] });
  sftpTestHost.files.getHome = async () => ({ path: "" });
}

export function setSftpTestPluginSettings(next: Record<string, unknown>): void {
  pluginSettings = { ...pluginSettings, ...next };
  settingsListeners.forEach((listener) => listener());
}

export function renderWithSftpHost(element: ReactElement): RenderResult {
  return render(
    <SftpUiHostProvider host={sftpTestHost}>{element}</SftpUiHostProvider>
  );
}

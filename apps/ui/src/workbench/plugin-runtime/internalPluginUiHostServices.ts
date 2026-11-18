import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { getShell, hasShell } from "../shared/shell";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { PromptDialog } from "../shared/PromptDialog";
import { settingsStore } from "../shell/settings/settingsStore";
import { translate } from "../shared/i18n";
import { Modal } from "../shared/Modal";
import { PaneResizeHandle } from "../editor-area/PaneResizeHandle";
import { Button } from "../shared/ui/Button";
import { IconButton } from "../shared/ui/IconButton";
import { Input } from "../shared/ui/Input";
import { Select } from "../shared/ui/Select";
import { SectionLabel } from "../shared/ui/SectionLabel";
import { TagManager } from "../shared/TagManager";
import { SidebarSection } from "../shared/SidebarSection";
import { ContextMenu } from "../shared/ContextMenu";

import { useConnectionChallengeStore } from "../shell/connections/challenges/connectionChallengeStore";
import { pickTmuxSession } from "../shell/connections/challenges/connectionChallengeFlows";

const hostChangeListeners = new Set<() => void>();
const emptyPluginSettings = Object.freeze({});

function notifyHostsChanged() {
  for (const listener of hostChangeListeners) listener();
}

export const internalPluginUiHostServices: PluginUiHostServices = {
  isAvailable: hasShell,
  externalPlugins: {
    list: () => getShell().pluginsList(),
    invoke: (request) => getShell().pluginsInvoke(request),
  },
  pluginMain: {
    invoke: (pluginId, method, payload) => getShell().internalPluginsInvoke({ pluginId, method, payload }),
  },
  Modal,
  ui: {
    ConfirmDialog,
    PromptDialog,
    PaneResizeHandle,
    Button,
    IconButton,
    Input,
    Select,
    SectionLabel,
    TagManager,
    SidebarSection,
    ContextMenu,
  },
  i18n: {
    getLocale: () => settingsStore.getState().settings.locale,
    translate,
    subscribe: (listener) => settingsStore.subscribe(() => listener()),
  },
  settings: {
    getPlugin: (pluginId) =>
      settingsStore.getState().settings.pluginSettings[pluginId] ?? emptyPluginSettings,
    updatePlugin: (pluginId, partial) =>
      settingsStore.getState().updatePluginSettings(pluginId, { ...partial }),
    subscribe: (listener) => settingsStore.subscribe(() => listener()),
  },
  remoteFiles: {
    disconnect: (sessionId) => getShell().sftpDisconnect({ sftpSessionId: sessionId }),
  },
  remoteSessions: {
    probeTmux: async (request) => (await getShell().tmuxProbe(request)).sessions,
  },
  sftp: {
    connect: (request) => getShell().sftpConnect(request),
    readFile: (request) => getShell().sftpReadFile(request),
    writeFile: (request) => getShell().sftpWriteFile(request),
    list: (request) => getShell().sftpList(request),
    stat: (request) => getShell().sftpStat(request),
    chmod: (request) => getShell().sftpChmod(request),
    mkdir: (request) => getShell().sftpMkdir(request),
    rename: (request) => getShell().sftpRename(request),
    copy: (request) => getShell().sftpCopy(request),
    delete: (request) => getShell().sftpDelete(request),
    deleteWithBackup: (request) => getShell().sftpDeleteWithBackup(request),
    restoreDeleteBackup: (request) => getShell().sftpRestoreDeleteBackup(request),
    operationLogsList: (request) => getShell().sftpOperationLogsList(request),
    operationLogAppend: (request) => getShell().sftpOperationLogAppend(request),
    operationLogsClear: (request) => getShell().sftpOperationLogsClear(request),
    transferStart: (request) => getShell().sftpTransferStart(request),
    transferCancel: (request) => getShell().sftpTransferCancel(request),
    transferPause: (request) => getShell().sftpTransferPause(request),
    transferResume: (request) => getShell().sftpTransferResume(request),
    transferRetry: (request) => getShell().sftpTransferRetry(request),
    transferList: () => getShell().sftpTransferList(),
    transferResolveConflict: (request) => getShell().sftpTransferResolveConflict(request),
    onEvent: (listener) => getShell().onSftpEvent(listener),
    bookmarksList: (request) => getShell().sftpBookmarksList(request),
    bookmarksUpsert: (request) => getShell().sftpBookmarksUpsert(request),
    bookmarksRemove: (request) => getShell().sftpBookmarksRemove(request),
    syncStart: (request) => getShell().sftpSyncStart(request),
    syncStop: (request) => getShell().sftpSyncStop(request),
    syncList: () => getShell().sftpSyncList(),
    onSyncEvent: (listener) => getShell().onSftpSyncEvent(listener),
    dragOut: (request) => getShell().sftpDragOut(request),
    startNativeDragOut: (request) => getShell().sftpStartNativeDragOut(request),
  },
  sshKeys: {
    list: () => getShell().sshKeysList(),
    listPaths: () => getShell().fsListSshKeys(),
    generate: (request) => getShell().sshKeysGenerate(request),
    remove: (request) => getShell().sshKeysRemove(request),
    convertPpk: (request) => getShell().sshKeysConvertPpk(request),
  },
  hostManagement: {
    hosts: {
      list: () => getShell().listHosts(),
      upsert: async (request) => {
        const record = await getShell().upsertHost(request);
        notifyHostsChanged();
        return record;
      },
      subscribeChanged: (listener) => {
        hostChangeListeners.add(listener);
        return () => hostChangeListeners.delete(listener);
      },
      notifyChanged: notifyHostsChanged,
    },
    tags: {
      list: () => getShell().listTags(),
      upsert: (request) => getShell().upsertTag(request),
      remove: (request) => getShell().removeTag(request),
      getForHost: (request) => getShell().tagsGetHostTags(request),
      setForHost: (request) => getShell().tagsSetHostTags(request),
    },
    profiles: {
      list: () => getShell().listHostProfiles(),
      upsert: (request) => getShell().upsertHostProfile(request),
      remove: (request) => getShell().removeHostProfile(request),
    },
    environment: {
      list: (request) => getShell().listHostEnvVars(request),
      replace: async (request) => {
        await getShell().replaceHostEnvVars(request);
      },
    },
    portForwards: {
      list: (request) => getShell().hostPortForwardList(request),
      upsert: (request) => getShell().hostPortForwardUpsert(request),
      remove: (request) => getShell().hostPortForwardRemove(request),
    },
    onePassword: {
      listVaults: () => getShell().opListVaults(),
      listItems: (request) => getShell().opListItems(request),
      getItemFields: (request) => getShell().opGetItemFields(request),
    },
    imports: {
      scanPuttySessions: () => getShell().scanPuttySessions(),
      scanSshManager: () => getShell().scanSshManager(),
      importSshManager: (request) => getShell().importSshManager(request),
    },
  },
  challenges: {
    credentials: async ({ host, username, error }) => {
      const answer = await useConnectionChallengeStore.getState().raise({ kind: "credentials", host, username, error });
      if (!answer) return null;
      useConnectionChallengeStore.getState().settle();
      return { username: answer.username, password: answer.password };
    },
    hostKey: async ({ host, info }) => {
      const answer = await useConnectionChallengeStore.getState().raise({ kind: "host-key", host, info });
      if (!answer) return false;
      useConnectionChallengeStore.getState().settle();
      return true;
    },
    keyboardInteractive: async (request) => {
      const answer = await useConnectionChallengeStore.getState().raise({ kind: "keyboard-interactive", request });
      if (answer) useConnectionChallengeStore.getState().settle();
      return answer?.responses ?? request.prompts.map(() => "");
    },
    tmuxSessions: ({ host, sessions }) => pickTmuxSession(host, sessions),
  },
  security: {
    trustHostFingerprint: (request) => getShell().hostFingerprintTrust(request),
  },
  hosts: {
    export: (request) => getShell().exportHosts(request),
  },
  files: {
    getPathForFile: (file) => getShell().getPathForFile(file),
    showSaveDialog: (options) => getShell().fsShowSaveDialog(options),
    showOpenDialog: (options) => getShell().fsShowOpenDialog(options),
    list: (request) => getShell().fsList(request),
    stat: (request) => getShell().fsStat(request),
    getHome: () => getShell().fsGetHome(),
    getDrives: () => getShell().fsGetDrives(),
    openItem: (request) => getShell().fsOpenItem(request),
    showInFolder: (request) => getShell().fsShowInFolder(request),
    trash: (request) => getShell().fsTrash(request),
    rename: (request) => getShell().fsRename(request),
    copy: (request) => getShell().fsCopy(request),
  },
  localProfiles: {
    list: () => getShell().listLocalProfiles(),
    upsert: (request) => getShell().upsertLocalProfile(request),
    remove: (id) => getShell().removeLocalProfile({ id }),
    setHidden: (id, hidden) => getShell().setLocalProfileHidden({ id, hidden }),
    reorder: (items) => getShell().reorderLocalProfiles({ items }),
    rescan: () => getShell().rescanLocalProfiles(),
    getEnvVars: (id) => getShell().getLocalProfileEnvVars({ id }),
  },
  editor: {
    open: (request) => getShell().editorOpen(request),
    onOpenFile: (listener) => getShell().onEditorOpenFile(listener),
    onSessionClosed: (listener) => getShell().onEditorSessionClosed(listener),
  },
  recordings: {
    start: (request) => getShell().recordingStart(request),
    stop: (request) => getShell().recordingStop(request),
    getState: (request) => getShell().recordingGetState(request),
    list: () => getShell().recordingList(),
    delete: (id) => getShell().recordingDelete({ id }),
    getFrames: (id) => getShell().recordingGetFrames({ id }),
    export: (id, filePath) => getShell().recordingExport({ id, filePath }),
  },
  portForward: {
    start: (request) => getShell().startPortForward(request),
    stop: (request) => getShell().stopPortForward(request),
    list: () => getShell().listPortForwards(),
  },
  serialProfiles: {
    list: () => getShell().listSerialProfiles(),
    upsert: (request) => getShell().upsertSerialProfile(request),
    remove: (request) => getShell().removeSerialProfile(request),
    listPorts: () => getShell().listSerialPorts(),
  },
};

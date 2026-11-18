import type {
  HostFingerprintTrustRequest,
  TmuxSessionInfo,
  FsEntry,
  FsGetDrivesResponse,
  FsListRequest,
  FsListResponse,
  FsPathRequest,
  LocalProfileEnvVar,
  LocalProfileRecord,
  PortForwardRecord,
  GetRecordingStateRequest,
  RecordingStateResponse,
  SessionRecordingRecord,
  StartRecordingRequest,
  StopRecordingRequest,
  RemoveSerialProfileRequest,
  SerialPortInfo,
  SerialProfileRecord,
  SetSignalsRequest,
  StartPortForwardRequest,
  StopPortForwardRequest,
  SshKeyInfo,
  GenerateSshKeyRequest,
  RemoveSshKeyRequest,
  ConvertPpkRequest,
  ConvertPpkResponse,
  UpsertSerialProfileRequest,
  UpsertLocalProfileRequest,
  ExportHostsRequest,
  GetHostTagsRequest,
  HostRecord,
  HostEnvVarRecord,
  HostPortForwardRecord,
  HostProfileRecord,
  UpsertHostRequest,
  ImportSshManagerRequest,
  ImportSshManagerResponse,
  ListHostEnvVarsRequest,
  ListHostPortForwardsRequest,
  OpGetItemFieldsRequest,
  OpGetItemFieldsResponse,
  OpListItemsRequest,
  OpListItemsResponse,
  OpListVaultsResponse,
  RemoveHostPortForwardRequest,
  RemoveHostProfileRequest,
  RemoveTagRequest,
  ReplaceHostEnvVarsRequest,
  ScanSshManagerResponse,
  SetHostTagsRequest,
  UpsertHostPortForwardRequest,
  UpsertHostProfileRequest,
  UpsertTagRequest,
  ScanPuttyResponse,
} from "@hypershell/shared";
import type { PluginManifest } from "./manifest.js";
import type {
  HostKeyVerificationInfo,
  KeyboardInteractiveRequest,
  SftpBookmark,
  SftpBookmarkListRequest,
  SftpBookmarkUpsertRequest,
  SftpChmodRequest,
  SftpConnectRequest,
  SftpConnectResponse,
  SftpCopyRequest,
  SftpDeleteRequest,
  SftpDeleteWithBackupRequest,
  SftpDeleteWithBackupResponse,
  SftpDragOutRequest,
  SftpDragOutResponse,
  SftpEntry,
  SftpEvent,
  SftpListRequest,
  SftpListResponse,
  SftpMkdirRequest,
  SftpOperationLog,
  SftpReadFileRequest,
  SftpReadFileResponse,
  SftpRenameRequest,
  SftpRestoreDeleteBackupRequest,
  SftpStatRequest,
  SftpSyncEvent,
  SftpSyncStartRequest,
  SftpSyncStatus,
  SftpSyncStopRequest,
  SftpTransferCancelRequest,
  SftpTransferListResponse,
  SftpTransferPauseRequest,
  SftpTransferResolveConflictRequest,
  SftpTransferResumeRequest,
  SftpTransferRetryRequest,
  SftpTransferStartRequest,
  SftpWriteFileRequest,
  SftpWriteFileResponse,
  TransferJob,
} from "./sftpSchemas.js";
import type { EditorOpenFile, EditorSessionClosed, SavedSessionRecord } from "@hypershell/shared";

export type PluginInputChangeEvent = { target: HTMLInputElement };
export type PluginSelectChangeEvent = { target: HTMLSelectElement };
export type PluginInputComponent = (props: {
  onChange?: (event: PluginInputChangeEvent) => void;
  [key: string]: any;
}) => any;
export type PluginSelectComponent = (props: {
  onChange?: (event: PluginSelectChangeEvent) => void;
  [key: string]: any;
}) => any;

export interface PluginUiCommand {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  visible: () => boolean;
  execute: () => void | Promise<void>;
  keywords?: string[];
}
export interface PluginHostContext {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  hostProfileId?: string;
}

export interface PluginHostConnection extends PluginHostContext {
  profile: Readonly<Record<string, unknown>>;
}

export interface PluginTabRequest {
  tabKey?: string;
  sessionId: string;
  title: string;
  dynamicTitle?: string;
  processTitle?: string;
  transport?: "ssh" | "serial" | "sftp" | "telnet" | "local";
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  profileId?: string;
  preopened?: boolean;
  type?: string;
  pluginId?: string;
  pluginData?: Record<string, unknown>;
  hostId?: string;
  tmuxAttachTarget?: string;
  fontSize?: number;
}

export interface PluginHostAction {
  id: string;
  label: string;
  disabled?: boolean;
  showAsHostQuickAction?: boolean;
  resolveLabel?: (host: PluginHostContext) => Promise<string>;
  execute(host: PluginHostContext): void | Promise<void>;
}

export interface PluginSidebarAction {
  id: string;
  label: string;
  action(): void | Promise<void>;
}

export interface PluginHostActionContext {
  isAvailable(): boolean;
  challenges: PluginUiHostServices["challenges"];
  sftp: Pick<PluginUiHostServices["sftp"], "connect">;
  security: PluginUiHostServices["security"];
  pluginMain: PluginUiHostServices["pluginMain"];
}

export type PluginRenderer = (...args: any[]) => any;
export type PluginLocale = "en" | "zh-CN";

export interface PluginUiHostServices {
  isAvailable(): boolean;
  externalPlugins: {
    list(): Promise<Array<{
      manifest: Pick<PluginManifest, "id" | "dataImports">;
      grantedPermissions: readonly string[];
    }>>;
    invoke(request: { id: string; method: string; args: unknown[] }): Promise<unknown>;
  };
  pluginMain: {
    invoke(pluginId: string, method: string, payload: unknown): Promise<unknown>;
  };
  Modal: PluginRenderer;
  ui: {
    ConfirmDialog: PluginRenderer;
    PromptDialog: PluginRenderer;
    PaneResizeHandle: PluginRenderer;
    Button: PluginRenderer;
    IconButton: PluginRenderer;
    Input: PluginRenderer;
    Select: PluginRenderer;
    SectionLabel: PluginRenderer;
    TagManager: PluginRenderer;
    SidebarSection: PluginRenderer;
    ContextMenu: PluginRenderer;
  };
  i18n: {
    getLocale(): PluginLocale;
    translate(key: string, locale?: PluginLocale): string;
    subscribe(listener: () => void): () => void;
  };
  settings: {
    getPlugin(pluginId: string): Readonly<Record<string, unknown>>;
    updatePlugin(pluginId: string, partial: Readonly<Record<string, unknown>>): Promise<void>;
    subscribe(listener: () => void): () => void;
  };
  remoteFiles: {
    disconnect(sessionId: string): Promise<void>;
  };
  remoteSessions: {
    probeTmux(request: { hostId: string }): Promise<TmuxSessionInfo[]>;
  };
  sftp: PluginSftpUiServices;
  sshKeys: {
    list(): Promise<SshKeyInfo[]>;
    listPaths(): Promise<string[]>;
    generate(request: GenerateSshKeyRequest): Promise<{ path: string }>;
    remove(request: RemoveSshKeyRequest): Promise<void>;
    convertPpk(request: ConvertPpkRequest): Promise<ConvertPpkResponse>;
  };
  hostManagement: {
    hosts: {
      list(): Promise<HostRecord[]>;
      upsert(request: UpsertHostRequest): Promise<HostRecord>;
      subscribeChanged(listener: () => void): () => void;
      notifyChanged(): void;
    };
    tags: {
      list(): Promise<import("@hypershell/shared").TagRecord[]>;
      upsert(request: UpsertTagRequest): Promise<import("@hypershell/shared").TagRecord>;
      remove(request: RemoveTagRequest): Promise<void>;
      getForHost(request: GetHostTagsRequest): Promise<import("@hypershell/shared").TagRecord[]>;
      setForHost(request: SetHostTagsRequest): Promise<import("@hypershell/shared").TagRecord[]>;
    };
    profiles: {
      list(): Promise<HostProfileRecord[]>;
      upsert(request: UpsertHostProfileRequest): Promise<HostProfileRecord>;
      remove(request: RemoveHostProfileRequest): Promise<void>;
    };
    environment: {
      list(request: ListHostEnvVarsRequest): Promise<HostEnvVarRecord[]>;
      replace(request: ReplaceHostEnvVarsRequest): Promise<void>;
    };
    portForwards: {
      list(request: ListHostPortForwardsRequest): Promise<HostPortForwardRecord[]>;
      upsert(request: UpsertHostPortForwardRequest): Promise<HostPortForwardRecord>;
      remove(request: RemoveHostPortForwardRequest): Promise<boolean>;
    };
    onePassword: {
      listVaults(): Promise<OpListVaultsResponse>;
      listItems(request: OpListItemsRequest): Promise<OpListItemsResponse>;
      getItemFields(request: OpGetItemFieldsRequest): Promise<OpGetItemFieldsResponse>;
    };
    imports: {
      scanPuttySessions(): Promise<ScanPuttyResponse>;
      scanSshManager(): Promise<ScanSshManagerResponse>;
      importSshManager(request: ImportSshManagerRequest): Promise<ImportSshManagerResponse>;
    };
  };
  challenges: {
    credentials(request: {
      host: PluginHostContext;
      username: string;
      error: string | null;
    }): Promise<{ username: string; password: string } | null>;
    hostKey(request: { host: PluginHostContext; info: HostKeyVerificationInfo }): Promise<boolean>;
    keyboardInteractive(request: KeyboardInteractiveRequest): Promise<string[]>;
    tmuxSessions(request: {
      host: PluginHostContext;
      sessions: TmuxSessionInfo[];
    }): Promise<{ attachTo: string | null } | null>;
  };
  security: {
    trustHostFingerprint(request: HostFingerprintTrustRequest): Promise<unknown>;
  };
  hosts: {
    export(request: ExportHostsRequest): Promise<{ exported: number }>;
  };
  files: {
    getPathForFile(file: File): string;
    list(request: FsListRequest): Promise<FsListResponse>;
    stat(request: FsPathRequest): Promise<FsEntry>;
    getHome(): Promise<{ path: string }>;
    getDrives(): Promise<FsGetDrivesResponse>;
    openItem(request: { path: string }): Promise<void>;
    showInFolder(request: { path: string }): Promise<void>;
    trash(request: { path: string }): Promise<void>;
    rename(request: { oldPath: string; newPath: string }): Promise<void>;
    copy(request: { paths: string[]; targetDirectory: string }): Promise<void>;
    showSaveDialog(options?: {
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }): Promise<string | null | undefined>;
    showOpenDialog(options?: {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      directory?: boolean;
    }): Promise<string | null | undefined>;
  };
  localProfiles: {
    list(): Promise<LocalProfileRecord[]>;
    upsert(request: UpsertLocalProfileRequest): Promise<LocalProfileRecord>;
    remove(id: string): Promise<void>;
    setHidden(id: string, hidden: boolean): Promise<void>;
    reorder(items: Array<{ id: string; sortOrder: number }>): Promise<void>;
    rescan(): Promise<LocalProfileRecord[]>;
    getEnvVars(id: string): Promise<LocalProfileEnvVar[]>;
  };
  editor: {
    open(request: import("@hypershell/shared").EditorOpenRequest): Promise<void>;
    onOpenFile(listener: (event: EditorOpenFile) => void): () => void;
    onSessionClosed(listener: (event: EditorSessionClosed) => void): () => void;
  };
  recordings: {
    start(request: StartRecordingRequest): Promise<SessionRecordingRecord>;
    stop(request: StopRecordingRequest): Promise<SessionRecordingRecord | null>;
    getState(request: GetRecordingStateRequest): Promise<RecordingStateResponse>;
    list(): Promise<unknown>;
    delete(id: string): Promise<unknown>;
    getFrames(id: string): Promise<unknown>;
    export(id: string, filePath: string): Promise<unknown>;
  };
  portForward: {
    start(request: StartPortForwardRequest): Promise<{ id: string }>;
    stop(request: StopPortForwardRequest): Promise<void>;
    list(): Promise<PortForwardRecord[]>;
  };
  serialProfiles: {
    list(): Promise<SerialProfileRecord[]>;
    upsert(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord>;
    remove(request: RemoveSerialProfileRequest): Promise<void>;
    listPorts(): Promise<SerialPortInfo[]>;
  };
}

export interface PluginSftpUiServices {
  connect(request: SftpConnectRequest): Promise<SftpConnectResponse>;
  readFile(request: SftpReadFileRequest): Promise<SftpReadFileResponse>;
  writeFile(request: SftpWriteFileRequest): Promise<SftpWriteFileResponse>;
  list(request: SftpListRequest): Promise<SftpListResponse>;
  stat(request: SftpStatRequest): Promise<SftpEntry>;
  chmod(request: SftpChmodRequest): Promise<void>;
  mkdir(request: SftpMkdirRequest): Promise<void>;
  rename(request: SftpRenameRequest): Promise<void>;
  copy(request: SftpCopyRequest): Promise<void>;
  delete(request: SftpDeleteRequest): Promise<void>;
  deleteWithBackup(request: SftpDeleteWithBackupRequest): Promise<SftpDeleteWithBackupResponse>;
  restoreDeleteBackup(request: SftpRestoreDeleteBackupRequest): Promise<TransferJob[]>;
  operationLogsList(request: { hostId: string }): Promise<SftpOperationLog[]>;
  operationLogAppend(request: { hostId: string; log: SftpOperationLog }): Promise<void>;
  operationLogsClear(request: { hostId: string }): Promise<void>;
  transferStart(request: SftpTransferStartRequest): Promise<TransferJob[]>;
  transferCancel(request: SftpTransferCancelRequest): Promise<void>;
  transferPause(request: SftpTransferPauseRequest): Promise<void>;
  transferResume(request: SftpTransferResumeRequest): Promise<void>;
  transferRetry(request: SftpTransferRetryRequest): Promise<TransferJob>;
  transferList(): Promise<SftpTransferListResponse>;
  transferResolveConflict(request: SftpTransferResolveConflictRequest): Promise<void>;
  onEvent(listener: (event: SftpEvent) => void): () => void;
  bookmarksList(request: SftpBookmarkListRequest): Promise<SftpBookmark[]>;
  bookmarksUpsert(request: SftpBookmarkUpsertRequest): Promise<SftpBookmark>;
  bookmarksRemove(request: { id: string }): Promise<void>;
  syncStart(request: SftpSyncStartRequest): Promise<{ syncId: string }>;
  syncStop(request: SftpSyncStopRequest): Promise<void>;
  syncList(): Promise<{ syncs: SftpSyncStatus[] }>;
  onSyncEvent(listener: (event: SftpSyncEvent) => void): () => void;
  dragOut(request: SftpDragOutRequest): Promise<SftpDragOutResponse>;
  startNativeDragOut(request: SftpDragOutRequest): void;
}

export interface PluginContextMenuAction {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
  icon?: any;
  shortcut?: string;
  danger?: boolean;
  customContent?: any;
}

export interface PluginWindowRendererProps {
  context: Readonly<Record<string, unknown>>;
  host: PluginUiHostServices;
}

export interface PluginWorkspaceLauncherProps {
  surface: "welcome" | "tabbar";
  openTab(tab: PluginTabRequest): void;
  host: PluginUiHostServices;
}

export interface PluginQuickConnectLauncherProps {
  openTab(tab: PluginTabRequest): void;
}

export interface PluginSidebarContributionProps {
  openTab(tab: PluginTabRequest): void;
  host: PluginUiHostServices;
}

export interface PluginSecondarySidebarViewProps {
  onClose(): void;
  host: PluginUiHostServices;
}

export interface PluginWorkspaceToolbarButtonProps {
  active: boolean;
  onToggle(): void;
  host: PluginUiHostServices;
}

export interface PluginTerminalToolbarProps {
  session: {
    sessionId: string;
    transport: string;
    profileId: string;
    hostId: string | null;
    title: string;
    workingDirectory: string | null;
    width: number;
    height: number;
    setSignals(signals: SetSignalsRequest["signals"]): Promise<void>;
  };
  openTab(tab: PluginTabRequest): void;
  host: PluginUiHostServices;
}

export interface PluginWorkspaceTab {
  sessionId: string;
  title?: string;
  type?: string;
  pluginId?: string;
  pluginData?: Record<string, unknown>;
  hostId?: string;
  profileId?: string;
  transport?: string;
}

export interface PluginSessionOpenPromptProps {
  sessionOpenData: Record<string, unknown>;
  onResume(): void;
  onFresh(): void;
  host: PluginUiHostServices;
}

export type PluginWorkspaceTabMigration = (
  tab: Readonly<Record<string, unknown>>
) => Record<string, unknown>;

export interface PluginSettingsMigrationState {
  general: Record<string, unknown>;
  pluginSettings: Record<string, Record<string, unknown>>;
}

export interface PluginQuickConnectProfile {
  id: string;
  label: string;
  hostname?: string;
  transport: string;
  group?: string;
  tags?: string[];
  description?: string;
  pluginId?: string;
}

export interface PluginTabPresentation {
  label: string;
  icon?: "folder";
}

export interface PluginPanelViewContribution {
  id: string;
  title: string;
  load: () => Promise<{ default: PluginRenderer }>;
}

export interface PluginSettingsPageProps {
  host: PluginUiHostServices;
}

export interface PluginSettingsPageContribution {
  id: string;
  title: string;
  load: () => Promise<{ default: PluginRenderer }>;
}

export interface PluginHostEditorContribution {
  load: () => Promise<{ default: PluginRenderer }>;
  mapRecord?: (record: HostRecord) => unknown;
  createRecord?: (value: unknown, id: string) => unknown;
  persistRecord?: (
    record: unknown,
    host: PluginUiHostServices,
    options?: { persistRelatedData?: boolean }
  ) => Promise<unknown | null>;
}

export interface PluginUiContribution {
  id: string;
  migrateSettings?: (settings: Readonly<PluginSettingsMigrationState>) => PluginSettingsMigrationState;
  canRestoreSavedSession?: (session: SavedSessionRecord) => boolean;
  loadContribution?: () => Promise<{ default: PluginRenderer }>;
  loadOverlay?: () => Promise<{ default: PluginRenderer }>;
  loadWorkspaceTabRenderer?: () => Promise<{ default: PluginRenderer }>;
  loadWindowRenderer?: () => Promise<{ default: PluginRenderer }>;
  loadWorkspaceLauncher?: () => Promise<{ default: PluginRenderer }>;
  loadSidebarContribution?: () => Promise<{ default: PluginRenderer }>;
  loadSecondarySidebarView?: () => Promise<{ default: PluginRenderer }>;
  loadWorkspaceToolbarButton?: () => Promise<{ default: PluginRenderer }>;
  loadTerminalToolbar?: () => Promise<{ default: PluginRenderer }>;
  loadSessionOpenPrompt?: () => Promise<{ default: PluginRenderer }>;
  getPanelViews?: () => PluginPanelViewContribution[];
  getSettingsPages?: () => PluginSettingsPageContribution[];
  getHostEditor?: () => PluginHostEditorContribution;
  prepareHostConnection?: (
    connection: PluginHostConnection,
    context: { host: PluginUiHostServices }
  ) => Promise<{ attachTo: string | null } | null | undefined>;
  getCommands?: (context: {
    getActiveHost(): PluginHostContext | null;
    hostActions: PluginHostAction[];
    openTab(tab: PluginTabRequest): void;
    openSecondarySidebar(pluginId: string, title?: string): void;
    openPanelView(pluginId: string, viewId: string): void;
  }) => PluginUiCommand[];
  getHostActions?: (context: {
    openTab(tab: PluginTabRequest): void;
    host: PluginHostActionContext;
  }) => PluginHostAction[];
  getSidebarActions?: (context: { host: PluginUiHostServices }) => PluginSidebarAction[];
  getQuickConnectProfiles?: () => PluginQuickConnectProfile[];
  openQuickConnectProfile?: (profileId: string, context: {
    openTab(tab: PluginTabRequest): void;
  }) => void;
  activate?: (host: PluginUiHostServices) => void | (() => void);
  getWorkspaceTabProps?: (
    tab: PluginWorkspaceTab,
    isActive: boolean,
    onClose: () => void
  ) => Record<string, unknown>;
  getTabPresentation?: (tab: PluginWorkspaceTab) => PluginTabPresentation;
  getSessionOpenData?: (tab: PluginWorkspaceTab) => Record<string, unknown> | undefined;
  migrateWorkspaceTab?: PluginWorkspaceTabMigration;
  closeWorkspaceTab?: (tab: PluginWorkspaceTab, host: PluginUiHostServices) => void;
}

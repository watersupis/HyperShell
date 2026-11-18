import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { toast } from "sonner";

import type { SftpEntry, TransferJob } from "@hypershell/plugin-api";
import { getSftpStore, disposeSftpStore, type SftpOperationLog } from "./sftpStore";
import { refreshTransfers, subscribeToDirectoryInvalidation } from "./transferEventCoordinator";
import { transferStore } from "./transferStore";
import { toErrorMessage } from "./utils/errorUtils";
import { getParentPath, joinRemotePath } from "./utils/fileUtils";
import { SftpToolbar } from "./components/SftpToolbar";
import type { SftpPanelId } from "./components/SftpBottomPanel";
import { SftpPropertiesDialog } from "./components/SftpPropertiesDialog";
import { SftpUiHostProvider, useSftpSetting, useSftpI18n, useSftpUiHost } from "./hostServices";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

const SftpDualPane = lazy(() => import("./components/SftpDualPane").then((module) => ({ default: module.SftpDualPane })));
const SftpBottomPanel = lazy(() => import("./components/SftpBottomPanel").then((module) => ({ default: module.SftpBottomPanel })));

export interface SftpTabProps {
  host: PluginUiHostServices;
  sftpSessionId: string;
  hostId: string;
  initialRemotePath?: string;
  isActive: boolean;
  onClose: () => void;
}

function joinLocalPath(base: string, name: string): string {
  const normalizedBase = base.replace(/[\\/]+$/, "");
  if (!normalizedBase) {
    return name;
  }

  const useWindowsSeparator =
    normalizedBase.includes("\\") || /^[a-zA-Z]:/.test(normalizedBase);

  return `${normalizedBase}${useWindowsSeparator ? "\\" : "/"}${name}`;
}

function mergeTransfers(existing: TransferJob[], next: TransferJob[]): TransferJob[] {
  const byId = new Map(existing.map((transfer) => [transfer.transferId, transfer]));
  for (const transfer of next) {
    byId.set(transfer.transferId, transfer);
  }
  return [...byId.values()];
}

function extractSftpEntries(response: unknown): SftpEntry[] {
  if (Array.isArray(response)) {
    return response as SftpEntry[];
  }

  if (!response || typeof response !== "object") {
    return [];
  }

  const payload = response as Record<string, unknown>;
  if (Array.isArray(payload.entries)) {
    return payload.entries as SftpEntry[];
  }

  if (Array.isArray(payload.items)) {
    return payload.items as SftpEntry[];
  }

  return [];
}

interface PendingTransferBatch {
  pendingIds: Set<string>;
  successfulJobs: TransferJob[];
  type: "upload" | "download";
  targetPath: string;
  undoablePaths: Set<string>;
  progressId: string | number;
  settled: boolean;
}

export function SftpTab(props: SftpTabProps) {
  return (
    <SftpUiHostProvider host={props.host}>
      <SftpTabContent {...props} />
    </SftpUiHostProvider>
  );
}

function SftpTabContent({ sftpSessionId, hostId, initialRemotePath, isActive, onClose }: SftpTabProps) {
  const host = useSftpUiHost();
  const ConfirmDialog = host.ui.ConfirmDialog;
  const PromptDialog = host.ui.PromptDialog;
  const PaneResizeHandle = host.ui.PaneResizeHandle;
  const { t } = useSftpI18n();
  const chunkConcurrency = useSftpSetting<1 | 2 | 4>("sftpChunkConcurrency");
  const store = useMemo(() => getSftpStore(sftpSessionId, initialRemotePath), [initialRemotePath, sftpSessionId]);
  const propertiesRequestIdRef = useRef(0);
  const pendingTransferBatchesRef = useRef(new Map<string, PendingTransferBatch>());
  const rootRef = useRef<HTMLDivElement>(null);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(208);
  const [toolPanels, setToolPanels] = useState<SftpPanelId[]>([]);
  const [activeToolPanel, setActiveToolPanel] = useState<SftpPanelId | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const remotePath = useStore(store, (state) => state.remotePath);
  const activePane = useStore(store, (state) => state.activePane);
  const localSelection = useStore(store, (state) => state.localSelection);
  const remoteSelection = useStore(store, (state) => state.remoteSelection);
  const [fileClipboard, setFileClipboard] = useState<{
    source: "local" | "remote";
    paths: string[];
    cut: boolean;
  } | null>(null);
  const undoActions = useStore(store, (state) => state.undoActions);
  const undoInProgressRef = useRef(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoingLogId, setUndoingLogId] = useState<string | null>(null);
  const localFilterText = useStore(store, (state) => state.localFilterText);
  const remoteFilterText = useStore(store, (state) => state.remoteFilterText);
  const localEntries = useStore(store, (state) => state.localEntries);
  const remoteEntries = useStore(store, (state) => state.remoteEntries);
  const setFilterText = useStore(store, (state) => state.setFilterText);

  const filterCaseSensitive = useStore(store, (state) => state.filterCaseSensitive);
  const filterRegex = useStore(store, (state) => state.filterRegex);
  const setFilterCaseSensitive = useStore(store, (state) => state.setFilterCaseSensitive);
  const setFilterRegex = useStore(store, (state) => state.setFilterRegex);

  const openToolPanel = useCallback((panel: SftpPanelId) => {
    setToolPanels((current) => current.includes(panel) ? current : [...current, panel]);
    setActiveToolPanel(panel);
  }, []);

  const closeToolPanel = useCallback((panel: SftpPanelId) => {
    setToolPanels((current) => {
      const next = current.filter((item) => item !== panel);
      setActiveToolPanel((active) => active === panel ? next.at(-1) ?? null : active);
      return next;
    });
  }, []);

  const closeAllToolPanels = useCallback(() => {
    setToolPanels([]);
    setActiveToolPanel(null);
  }, []);

  const filterText = activePane === "local" ? localFilterText : remoteFilterText;
  const activeEntries = activePane === "local" ? localEntries : remoteEntries;
  const filterTotalCount = activeEntries.length;
  const filterMatchCount = useMemo(() => {
    if (!filterText) return filterTotalCount;
    if (filterRegex) {
      try {
        const re = new RegExp(filterText, filterCaseSensitive ? "" : "i");
        return activeEntries.filter((e) => re.test(e.name)).length;
      } catch {
        return 0;
      }
    }
    if (filterCaseSensitive) {
      return activeEntries.filter((e) => e.name.includes(filterText)).length;
    }
    return activeEntries.filter((e) => e.name.toLowerCase().includes(filterText.toLowerCase())).length;
  }, [activeEntries, filterText, filterCaseSensitive, filterRegex, filterTotalCount]);

  // Dialog state for rename
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; path: string; oldName: string }>({
    open: false,
    path: "",
    oldName: "",
  });

  // Dialog state for delete confirmation
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; paths: string[] }>({
    open: false,
    paths: [],
  });

  // Dialog state for mkdir
  const [mkdirDialog, setMkdirDialog] = useState(false);

  // Dialog state for bookmark
  const [bookmarkDialog, setBookmarkDialog] = useState<{ open: boolean; path: string; defaultName: string }>({
    open: false,
    path: "",
    defaultName: "",
  });

  // Dialog state for properties
  const [propertiesDialog, setPropertiesDialog] = useState<{
    open: boolean;
    path: string;
    entry: SftpEntry | null;
    isLoading: boolean;
    error: string | null;
  }>({
    open: false,
    path: "",
    entry: null,
    isLoading: false,
    error: null
  });

  const refreshRemoteDirectory = useCallback(async () => {
    if (!host.isAvailable()) {
      throw new Error("SFTP list API is unavailable in preload bridge");
    }
    const response = await host.sftp.list({ sftpSessionId, path: remotePath });
    store.getState().setRemoteEntries(extractSftpEntries(response));
  }, [host, remotePath, sftpSessionId, store]);

  const refreshLocalDirectory = useCallback(async () => {
    const currentLocalPath = store.getState().localPath;
    if (!currentLocalPath) return;
    try {
      const response = await host.files.list({ path: currentLocalPath });
      store.getState().setLocalEntries(response?.entries ?? []);
    } catch {
      // ignore — non-critical refresh
    }
  }, [host, store]);

  useEffect(() => {
    if (!hostId || !host.isAvailable()) return;
    let cancelled = false;
    const persistedIds = new Set<string>();
    const pendingLogs = new Map<string, SftpOperationLog>();
    const undoIds = new Set<string>();
    let historyLoaded = false;

    const registerUndoFromLog = (log: SftpOperationLog) => {
      const data = log.undoData;
      if (!log.success || !data || typeof data.type !== "string" || data.undoneAt || data.undoSkippedAt || undoIds.has(log.id)) return;
      const paths = Array.isArray(data.paths) ? data.paths.filter((item): item is string => typeof item === "string") : [];
      const changes = Array.isArray(data.changes) ? data.changes.filter((item): item is { from: string; to: string } => Boolean(item && typeof item.from === "string" && typeof item.to === "string")) : [];
      if (data.type === "remote-delete" && (typeof data.backupId !== "string" || paths.length === 0 || (typeof data.expiresAt === "number" && data.expiresAt <= Date.now()))) return;
      if ((data.type === "local-created" || data.type === "remote-created") && paths.length === 0) return;
      if (data.type === "path-change" && (changes.length === 0 || (data.pane !== "local" && data.pane !== "remote"))) return;
      undoIds.add(log.id);
      store.getState().registerUndo({
        id: log.id,
        operation: log.operation ?? "Undo",
        undo: async () => {
          if (data.type === "remote-delete") {
            await host.sftp.restoreDeleteBackup({ sftpSessionId, backupId: data.backupId as string, paths });
            store.getState().recordOperation(`sftpRestoreDeleteBackup(backupId: "${data.backupId}", count: ${paths.length})`, t("Restore queued"), true, "Undo");
            void refreshTransfers();
          } else if (data.type === "path-change") {
            for (const item of changes.slice().reverse()) {
              if (data.pane === "local") await host.files.rename({ oldPath: item.to, newPath: item.from });
              else await host.sftp.rename({ sftpSessionId, oldPath: item.to, newPath: item.from });
            }
            store.getState().recordOperation(`undoPathChange(count: ${changes.length})`, t("Succeeded"), true, "Undo");
            if (data.pane === "local") await refreshLocalDirectory();
            else await refreshRemoteDirectory();
          } else if (data.type === "local-created") {
            for (const path of paths) await host.files.trash({ path });
            store.getState().recordOperation(`undoLocalCopy(count: ${paths.length})`, t("Succeeded"), true, "Undo");
            await refreshLocalDirectory();
          } else if (data.type === "remote-created") {
            for (const path of paths) await host.sftp.delete({ sftpSessionId, path, recursive: true });
            store.getState().recordOperation(`undoRemoteCopy(count: ${paths.length})`, t("Succeeded"), true, "Undo");
            await refreshRemoteDirectory();
          }
        }
      });
    };

    const unsubscribe = store.subscribe((state, previous) => {
      if (state.operationLogs === previous.operationLogs) return;
      for (const log of state.operationLogs) {
        if (persistedIds.has(log.id)) continue;
        persistedIds.add(log.id);
        pendingLogs.set(log.id, log);
        if (historyLoaded) registerUndoFromLog(log);
        void host.sftp.operationLogAppend({ hostId, log: { ...log, operation: log.operation ?? "Command" } }).catch(() => {
          persistedIds.delete(log.id);
        });
      }
    });

    void host.sftp.operationLogsList({ hostId }).then((logs) => {
      if (cancelled) return;
      const merged = [...pendingLogs.values(), ...logs.map((log) => ({
        ...log,
        operation: log.operation ?? "Command",
        undoData: log.undoData && typeof log.undoData === "object" && !Array.isArray(log.undoData)
          ? log.undoData as Record<string, unknown>
          : undefined
      }))].filter((log, index, all) => all.findIndex((item) => item.id === log.id) === index);
      store.getState().setOperationLogs(merged.sort((a, b) => b.timestamp - a.timestamp));
      historyLoaded = true;
      for (const log of [...merged].sort((a, b) => a.timestamp - b.timestamp)) {
        persistedIds.add(log.id);
        registerUndoFromLog(log);
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [host, hostId, refreshLocalDirectory, refreshRemoteDirectory, sftpSessionId, store, t]);

  useEffect(() => transferStore.subscribe((state) => {
    const batches = new Set(pendingTransferBatchesRef.current.values());
    for (const batch of batches) {
      if (batch.settled) continue;
      for (const transferId of [...batch.pendingIds]) {
        const job = state.transfers.find((item) => item.transferId === transferId);
        if (!job || (job.status !== "completed" && job.status !== "failed")) continue;
        batch.pendingIds.delete(transferId);
        if (job.status === "completed") batch.successfulJobs.push(job);
        pendingTransferBatchesRef.current.delete(transferId);
      }
      if (batch.pendingIds.size > 0) continue;
      batch.settled = true;
      const completedJobs = batch.successfulJobs;
      if (completedJobs.length === 0) {
        toast.error(t(batch.type === "upload" ? "Upload failed" : "Download failed"), { id: batch.progressId });
        continue;
      }

      const destinations = completedJobs.map((job) => batch.type === "upload" ? job.remotePath : job.localPath);
      const undoablePaths = destinations.filter((destination) => batch.undoablePaths.has(destination));
      const operation = batch.type === "upload" ? "Upload" : "Download";
      const undoData = undoablePaths.length
        ? { type: batch.type === "upload" ? "remote-created" : "local-created", paths: undoablePaths }
        : undefined;
      store.getState().recordOperation(
        `${operation.toLowerCase()}Complete(paths: ${JSON.stringify(destinations)})`,
        t("Succeeded"), true, operation, undoData
      );
      if (batch.type === "upload") {
        store.getState().setLocalSelection(new Set());
        store.getState().setRemotePath(batch.targetPath);
        store.getState().setRemoteSelection(new Set(destinations));
        void refreshRemoteDirectory();
      } else {
        store.getState().setRemoteSelection(new Set());
        store.getState().setLocalPath(batch.targetPath);
        store.getState().setLocalSelection(new Set(destinations));
        void refreshLocalDirectory();
      }
      toast.success(t(batch.type === "upload" ? "Upload completed" : "Download completed"), { id: batch.progressId });
    }
  }), [refreshLocalDirectory, refreshRemoteDirectory, store, t]);

  // Transfer events are owned by the application-level coordinator; this tab
  // only reacts when a transfer for *its* session lands on disk.
  useEffect(() => {
    if (!isActive) return;
    return subscribeToDirectoryInvalidation(sftpSessionId, () => {
      void refreshRemoteDirectory().catch(() => {});
      void refreshLocalDirectory();
    });
  }, [isActive, refreshLocalDirectory, refreshRemoteDirectory, sftpSessionId]);

  useEffect(() => {
    return () => {
      disposeSftpStore(sftpSessionId);
    };
  }, [sftpSessionId]);

  const handleUpload = useCallback(
    async (localPaths: string[], remoteTargetPath: string) => {
      if (localPaths.length === 0) {
        return;
      }

      try {
        const targetPath = remoteTargetPath || store.getState().remotePath;
        const targetEntries = extractSftpEntries(await host.sftp.list({ sftpSessionId, path: targetPath }));
        const existingNames = new Set(targetEntries.map((entry) => entry.name));
        const progressId = toast.loading(t("Uploading to {path}").replace("{path}", targetPath));

        const operations = await Promise.all(
          localPaths.map(async (localPath) => {
            let isDirectory: boolean;

            try {
              const stat = await host.files.stat({ path: localPath });
              isDirectory = Boolean(stat?.isDirectory);
            } catch {
              isDirectory = false;
            }

            const fileName = localPath.split(/[/\\]/).pop() ?? localPath;

            return {
              type: "upload" as const,
              localPath,
              remotePath: joinRemotePath(targetPath, fileName),
              isDirectory
            };
          })
        );

        const created =
          (await host.sftp.transferStart({
            sftpSessionId,
            operations,
            chunkConcurrency
          })) ?? [];

        if (created.length > 0) {
          const batch: PendingTransferBatch = {
            pendingIds: new Set(created.map((job) => job.transferId)),
            successfulJobs: [],
            type: "upload",
            targetPath,
            undoablePaths: new Set(operations.filter((operation) => !existingNames.has(operation.remotePath.split("/").pop() ?? operation.remotePath)).map((operation) => operation.remotePath)),
            progressId,
            settled: false
          };
          for (const job of created) pendingTransferBatchesRef.current.set(job.transferId, batch);
        }

        store.getState().recordOperation(
          operations.map((operation) => `sftpTransferStart(upload: "${operation.localPath}" -> "${operation.remotePath}")`).join("; "),
          t("Submitted {count} transfer task(s)").replace("{count}", String(created.length)),
          true
        );

        const current = transferStore.getState().transfers;
        transferStore.getState().setTransfers(mergeTransfers(current, created));
        store.getState().setRemotePath(targetPath);
        store.getState().setError("remote", null);
        void refreshTransfers();
      } catch (error) {
        const message = toErrorMessage(error, "Failed to start upload");
        store.getState().recordOperation(`sftpTransferStart(upload: ${localPaths.join(", ")})`, message, false);
        store.getState().setError("remote", message);
        toast.error(message);
      }
    },
    [host, sftpSessionId, store, t]
  );

  const handleDownload = useCallback(
    async (remotePaths: string[], localTargetPath: string) => {
      if (remotePaths.length === 0) {
        return;
      }

      try {
        const localPath = localTargetPath || store.getState().localPath;
        if (!localPath) {
          store.getState().setError("local", "Select a local destination folder first.");
          return;
        }

        const localStat = await host.files.stat({ path: localPath });
        if (!localStat?.isDirectory) {
          store.getState().setError("local", `Local destination is not a folder: ${localPath}`);
          return;
        }

        const localEntries = (await host.files.list({ path: localPath })).entries ?? [];
        const existingNames = new Set(localEntries.map((entry) => entry.name));
        const progressId = toast.loading(t("Downloading to {path}").replace("{path}", localPath));

        const entriesByPath = new Map(
          store.getState().remoteEntries.map((entry) => [entry.path, entry])
        );

        const operations = await Promise.all(
          remotePaths.map(async (remoteFilePath) => {
            let isDirectory = entriesByPath.get(remoteFilePath)?.isDirectory ?? false;
            if (!entriesByPath.has(remoteFilePath)) {
              try {
                const stat = await host.sftp.stat({
                  sftpSessionId,
                  path: remoteFilePath
                });
                isDirectory = Boolean(stat?.isDirectory);
              } catch {
                isDirectory = false;
              }
            }

            const fileName = remoteFilePath.split("/").pop() ?? remoteFilePath;

            return {
              type: "download" as const,
              localPath: joinLocalPath(localPath, fileName),
              remotePath: remoteFilePath,
              isDirectory
            };
          })
        );

        const created =
          (await host.sftp.transferStart({
            sftpSessionId,
            operations,
            chunkConcurrency
          })) ?? [];

        if (created.length > 0) {
          const batch: PendingTransferBatch = {
            pendingIds: new Set(created.map((job) => job.transferId)),
            successfulJobs: [],
            type: "download",
            targetPath: localPath,
            undoablePaths: new Set(operations.filter((operation) => !existingNames.has(operation.localPath.split(/[\\\\/]/).pop() ?? operation.localPath)).map((operation) => operation.localPath)),
            progressId,
            settled: false
          };
          for (const job of created) pendingTransferBatchesRef.current.set(job.transferId, batch);
        }

        store.getState().recordOperation(
          operations.map((operation) => `sftpTransferStart(download: "${operation.remotePath}" -> "${operation.localPath}")`).join("; "),
          t("Submitted {count} transfer task(s)").replace("{count}", String(created.length)),
          true
        );

        const current = transferStore.getState().transfers;
        transferStore.getState().setTransfers(mergeTransfers(current, created));
        store.getState().setLocalPath(localPath);
        store.getState().setError("local", null);
        void refreshTransfers();
      } catch (error) {
        const message = toErrorMessage(error, "Failed to start download");
        store.getState().recordOperation(`sftpTransferStart(download: ${remotePaths.join(", ")})`, message, false);
        store.getState().setError("local", message);
        toast.error(message);
      }
    },
    [host, sftpSessionId, store, t]
  );

  const handleRename = useCallback(
    (path: string) => {
      const oldName = path.split("/").pop() ?? "";
      setRenameDialog({ open: true, path, oldName });
    },
    []
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      const { path, oldName } = renameDialog;
      setRenameDialog({ open: false, path: "", oldName: "" });

      if (newName === oldName) return;

      const parentPath = getParentPath(path);
      const newPath = joinRemotePath(parentPath, newName);

      try {
        await host.sftp.rename({
          sftpSessionId,
          oldPath: path,
          newPath
        });

        store.getState().recordOperation(`sftpRename(oldPath: "${path}", newPath: "${newPath}")`, t("Succeeded"), true, "Rename", { type: "path-change", pane: "remote", changes: [{ from: path, to: newPath }] });
        await refreshRemoteDirectory();
      } catch (error) {
        store.getState().recordOperation(`sftpRename(oldPath: "${path}", newName: "${newName}")`, toErrorMessage(error, "Failed to rename"), false);
        throw error;
      }
    },
    [host, renameDialog, refreshRemoteDirectory, sftpSessionId, store, t]
  );

  const handleDelete = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      setDeleteDialog({ open: true, paths });
    },
    []
  );

  const handleDeleteConfirm = useCallback(async () => {
    const { paths } = deleteDialog;
    setDeleteDialog({ open: false, paths: [] });

    const progressId = toast.loading(t("Creating recovery archive before deletion"));
    try {
      const response = await host.sftp.deleteWithBackup({ sftpSessionId, paths });
      const deletedPaths = response.deletedPaths;
      const failedPaths = response.failedPaths;
      store.getState().recordOperation(
        `sftpDeleteWithBackup(paths: ${JSON.stringify(paths)})`,
        failedPaths.length ? `${t("Deleted")}: ${deletedPaths.length}; ${t("Failed")}: ${failedPaths.length}` : t("Succeeded"),
        deletedPaths.length > 0,
        "Delete",
        deletedPaths.length ? { type: "remote-delete", backupId: response.backupId, paths: deletedPaths, expiresAt: response.expiresAt } : undefined
      );
      if (failedPaths.length > 0) toast.error(`${t("Failed to delete")}: ${failedPaths.length}`, { id: progressId });
      else toast.success(t("Delete completed"), { id: progressId });
    } catch (error) {
      store.getState().recordOperation(`sftpDeleteWithBackup(paths: ${JSON.stringify(paths)})`, toErrorMessage(error, "Failed to archive before delete"), false, "Delete");
      toast.error(toErrorMessage(error, t("Failed to delete")), { id: progressId });
    }

    await refreshRemoteDirectory();
  }, [deleteDialog, host, refreshRemoteDirectory, sftpSessionId, store, t]);

  const handleMkdir = useCallback(() => {
    setMkdirDialog(true);
  }, []);

  const handleMkdirConfirm = useCallback(
    async (name: string) => {
      setMkdirDialog(false);

      const nextPath = joinRemotePath(remotePath, name);
      try {
        await host.sftp.mkdir({
          sftpSessionId,
          path: nextPath
        });
        store.getState().recordOperation(`sftpMkdir(path: "${nextPath}")`, t("Succeeded"), true);
      } catch (error) {
        store.getState().recordOperation(`sftpMkdir(path: "${nextPath}")`, toErrorMessage(error, "Failed to create folder"), false);
        throw error;
      }

      await refreshRemoteDirectory();
    },
    [host, refreshRemoteDirectory, remotePath, sftpSessionId, store, t]
  );

  const handleBookmark = useCallback(
    (path: string) => {
      if (!hostId) return;
      const defaultName = path.split("/").pop() || path;
      setBookmarkDialog({ open: true, path, defaultName });
    },
    [hostId]
  );

  const handleBookmarkConfirm = useCallback(
    async (name: string) => {
      const { path } = bookmarkDialog;
      setBookmarkDialog({ open: false, path: "", defaultName: "" });

      await host.sftp.bookmarksUpsert({
        hostId,
        name,
        remotePath: path
      });
    },
    [bookmarkDialog, host, hostId]
  );

  const closePropertiesDialog = useCallback(() => {
    propertiesRequestIdRef.current += 1;
    setPropertiesDialog({
      open: false,
      path: "",
      entry: null,
      isLoading: false,
      error: null
    });
  }, []);

  const handleProperties = useCallback(
    async (path: string) => {
      const requestId = propertiesRequestIdRef.current + 1;
      propertiesRequestIdRef.current = requestId;

      setPropertiesDialog({
        open: true,
        path,
        entry: null,
        isLoading: true,
        error: null
      });

      try {
        if (!host.isAvailable()) {
          throw new Error("SFTP stat API is unavailable in preload bridge");
        }

        const entry = await host.sftp.stat({ sftpSessionId, path });
        if (!entry) {
          throw new Error("File details are unavailable");
        }
        if (propertiesRequestIdRef.current !== requestId) {
          return;
        }

        setPropertiesDialog({
          open: true,
          path,
          entry,
          isLoading: false,
          error: null
        });
      } catch (statError) {
        if (propertiesRequestIdRef.current !== requestId) {
          return;
        }

        const message =
          statError instanceof Error ? statError.message : "Failed to load file details";
        setPropertiesDialog({
          open: true,
          path,
          entry: null,
          isLoading: false,
          error: message
        });
      }
    },
    [host, sftpSessionId]
  );

  const handleApplyPermissions = useCallback(
    async (permissions: number) => {
      const path = propertiesDialog.path;
      if (!path) {
        throw new Error("No file selected");
      }

      if (!host.isAvailable()) {
        throw new Error("SFTP chmod/stat APIs are unavailable in preload bridge");
      }

      try {
        await host.sftp.chmod({
          sftpSessionId,
          path,
          permissions
        });
        store.getState().recordOperation(`sftpChmod(path: "${path}", mode: ${permissions.toString(8)})`, t("Succeeded"), true);
      } catch (error) {
        store.getState().recordOperation(`sftpChmod(path: "${path}", mode: ${permissions.toString(8)})`, toErrorMessage(error, "Failed to change permissions"), false);
        throw error;
      }

      const refreshed = await host.sftp.stat({ sftpSessionId, path });
      if (!refreshed) {
        throw new Error("Failed to refresh file details after permission update");
      }

      setPropertiesDialog((previous) => {
        if (!previous.open || previous.path !== path) {
          return previous;
        }

        return {
          ...previous,
          entry: refreshed,
          error: null
        };
      });

      await refreshRemoteDirectory();
    },
    [host, propertiesDialog.path, refreshRemoteDirectory, sftpSessionId, store, t]
  );

  const handleFilterChange = useCallback(
    (text: string) => {
      setFilterText(activePane, text);
    },
    [activePane, setFilterText]
  );

  const handleRefresh = useCallback(async () => {
    const state = store.getState();
    if (state.activePane === "remote") {
      await refreshRemoteDirectory();
    } else {
      const currentLocalPath = state.localPath;
      if (currentLocalPath) {
        try {
          const response = await host.files.list({ path: currentLocalPath });
          store.getState().setLocalEntries(response?.entries ?? []);
        } catch {
          // ignore
        }
      }
    }
  }, [host, refreshRemoteDirectory, store]);

  const handleCopy = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    setFileClipboard({ source: store.getState().activePane, paths, cut: false });
    toast.success(t("Copied {count} item(s)").replace("{count}", String(paths.length)));
    store.getState().recordOperation(`clipboardCopy(count: ${paths.length})`, t("Succeeded"), true, "Copy");
  }, [store, t]);

  const handleCut = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    setFileClipboard({ source: store.getState().activePane, paths, cut: true });
    toast.message(t("Cut {count} item(s)").replace("{count}", String(paths.length)));
  }, [store, t]);

  const handlePaste = useCallback(async (targetOverride?: string) => {
    if (!fileClipboard) return;
    const targetDirectory = targetOverride ?? (activePane === "local" ? store.getState().localPath : store.getState().remotePath);
    const progressId = toast.loading(t("Copying {current}/{total}")
      .replace("{current}", "0")
      .replace("{total}", String(fileClipboard.paths.length)));
    try {
      if (fileClipboard.source !== activePane) {
        if (fileClipboard.cut) {
          toast.error(t("Cut and paste between panes is not supported; drag to transfer files"), { id: progressId });
          return;
        }
        if (fileClipboard.source === "local") await handleUpload(fileClipboard.paths, targetDirectory);
        else await handleDownload(fileClipboard.paths, targetDirectory);
        toast.success(t("Paste queued"), { id: progressId });
        return;
      }

      const destinations: string[] = [];
      for (const [index, sourcePath] of fileClipboard.paths.entries()) {
        toast.loading(t("Copying {current}/{total}").replace("{current}", String(index + 1)).replace("{total}", String(fileClipboard.paths.length)), { id: progressId });
        const name = sourcePath.split(/[\\\\/]/).filter(Boolean).at(-1) ?? sourcePath;
        if (fileClipboard.cut) {
          const nextPath = activePane === "local"
            ? joinLocalPath(targetDirectory, name)
            : joinRemotePath(targetDirectory, name);
          if (nextPath !== sourcePath) {
            if (activePane === "local") await host.files.rename({ oldPath: sourcePath, newPath: nextPath });
            else await host.sftp.rename({ sftpSessionId, oldPath: sourcePath, newPath: nextPath });
            destinations.push(nextPath);
            store.getState().recordOperation(
              `${activePane === "local" ? "fsRename" : "sftpRename"}(oldPath: "${sourcePath}", newPath: "${nextPath}")`,
              t("Succeeded"), true, "Move", { type: "path-change", pane: activePane, changes: [{ from: sourcePath, to: nextPath }] }
            );
          }
        } else {
          if (activePane === "local") await host.files.copy({ paths: [sourcePath], targetDirectory });
          else await host.sftp.copy({ sftpSessionId, paths: [sourcePath], targetDirectory });
          const nextPath = activePane === "local" ? joinLocalPath(targetDirectory, name) : joinRemotePath(targetDirectory, name);
          destinations.push(nextPath);
          store.getState().recordOperation(`copy(source: "${sourcePath}", destination: "${nextPath}")`, t("Succeeded"), true, "Copy", {
            type: activePane === "local" ? "local-created" : "remote-created", paths: [nextPath]
          });
        }
      }

      if (activePane === "local") {
        const response = await host.files.list({ path: targetDirectory });
        store.getState().setLocalEntries(response?.entries ?? []);
        store.getState().setLocalPath(targetDirectory);
        store.getState().setLocalSelection(new Set(destinations));
      } else {
        await refreshRemoteDirectory();
        store.getState().setRemotePath(targetDirectory);
        store.getState().setRemoteSelection(new Set(destinations));
      }
      if (fileClipboard.cut) setFileClipboard(null);
      store.getState().recordOperation(`${fileClipboard.cut ? "cut" : "copy"}Paste(count: ${destinations.length})`, t("Succeeded"), true, fileClipboard.cut ? "Move" : "Copy");
      toast.success(t(fileClipboard.cut ? "Move completed" : "Copy completed"), { id: progressId });
    } catch (error) {
      toast.error(toErrorMessage(error, t("Paste failed")), { id: progressId });
    }
  }, [activePane, fileClipboard, handleDownload, handleUpload, host, refreshRemoteDirectory, sftpSessionId, store, t]);

  const handleUndo = useCallback((logId?: string) => {
    if (undoInProgressRef.current) return;
    const availableActions = store.getState().undoActions;
    const action = logId
      ? availableActions.find((candidate) => candidate.id === logId)
      : availableActions.at(-1);
    if (!action) {
      if (!logId) toast.message(t("Nothing to undo"));
      return;
    }

    undoInProgressRef.current = true;
    setUndoingLogId(action.id);
    setIsUndoing(true);
    const persistUndoStatus = (status: "undoneAt" | "undoSkippedAt", errorMessage?: string) => {
      const state = store.getState();
      const originalLog = state.operationLogs.find((log) => log.id === action.id);
      if (!originalLog?.undoData) return;
      const updatedLog = {
        ...originalLog,
        undoData: {
          ...originalLog.undoData,
          [status]: Date.now(),
          ...(errorMessage ? { undoError: errorMessage } : {})
        }
      };
      state.setOperationLogs(state.operationLogs.map((log) => log.id === action.id ? updatedLog : log));
      void host.sftp.operationLogAppend({
        hostId,
        log: { ...updatedLog, operation: updatedLog.operation ?? "Command" }
      }).catch((error) => {
        toast.error(toErrorMessage(error, t("Failed to save undo status")));
      });
    };

    void action.undo().then(() => {
      store.getState().removeUndo(action.id);
      persistUndoStatus("undoneAt");
      toast.success(t("Undid {operation}").replace("{operation}", t(action.operation)));
    }).catch((error) => {
      store.getState().removeUndo(action.id);
      const message = toErrorMessage(error, t("Undo failed"));
      persistUndoStatus("undoSkippedAt", message);
      toast.error(message);
    }).finally(() => {
      undoInProgressRef.current = false;
      setUndoingLogId(null);
      setIsUndoing(false);
    });
  }, [host, hostId, store, t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;

      event.preventDefault();
      handleUndo();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCut, handleUndo, store]);

  const handleDisconnect = useCallback(async () => {
    await host.remoteFiles.disconnect(sftpSessionId);
    onClose();
  }, [host, onClose, sftpSessionId]);

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 flex-col">
      <SftpToolbar
        store={store}
        hostId={hostId}
        onDisconnect={() => { void handleDisconnect(); }}
        canUndo={undoActions.length > 0 && !isUndoing}
        onUndo={handleUndo}
        filterText={filterText}
        onFilterChange={handleFilterChange}
        filterMatchCount={filterMatchCount}
        filterTotalCount={filterTotalCount}
        filterInputRef={filterInputRef}
        filterCaseSensitive={filterCaseSensitive}
        filterRegex={filterRegex}
        onToggleCaseSensitive={() => setFilterCaseSensitive(!filterCaseSensitive)}
        onToggleRegex={() => setFilterRegex(!filterRegex)}
        onOpenPanel={openToolPanel}
        activePanel={activeToolPanel}
        selectedPath={(() => {
          const selection = activePane === "local" ? localSelection : remoteSelection;
          return selection.size === 1 ? Array.from(selection)[0] : null;
        })()}
        canCopy={(activePane === "local" ? localSelection : remoteSelection).size > 0}
        canPaste={Boolean(fileClipboard)}
        onRenameSelected={(path) => handleRename(path)}
        onCopySelected={() => handleCopy(Array.from(activePane === "local" ? localSelection : remoteSelection))}
        onCutSelected={() => handleCut(Array.from(activePane === "local" ? localSelection : remoteSelection))}
        onPaste={(targetDirectory) => { void handlePaste(targetDirectory); }}
      />

      {isActive && (
        <Suspense fallback={null}>
          <SftpDualPane
            store={store}
            onUpload={(localPaths, remoteTargetPath) => { void handleUpload(localPaths, remoteTargetPath); }}
            onDownload={(remotePaths, localTargetPath) => { void handleDownload(remotePaths, localTargetPath); }}
            onEdit={(remotePath: string) => {
              void host.editor.open({
                pluginId: "sftp",
                windowKey: sftpSessionId,
                context: { sftpSessionId },
                payload: { remotePath },
              });
            }}
            onProperties={(entryPath) => { void handleProperties(entryPath); }}
            onRename={handleRename}
            onDelete={handleDelete}
            onMkdir={handleMkdir}
            onBookmark={handleBookmark}
            onRefresh={() => { void handleRefresh(); }}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={(targetDirectory) => { void handlePaste(targetDirectory); }}
            canPaste={Boolean(fileClipboard)}
            filterInputRef={filterInputRef}
          />
        </Suspense>
      )}

      {activeToolPanel && (
        <>
          <PaneResizeHandle
            direction="vertical"
            onResize={(delta: number) => {
              const availableHeight = rootRef.current?.clientHeight ?? 720;
              setBottomPanelHeight((height) => Math.max(144, Math.min(availableHeight - 200, height - delta)));
            }}
            onResizeEnd={() => {}}
            className="z-10 w-full"
            style={{ cursor: "row-resize" }}
          />
          <Suspense fallback={null}>
            <SftpBottomPanel
              panels={toolPanels}
              activePanel={activeToolPanel}
              onActivatePanel={setActiveToolPanel}
              onClosePanel={closeToolPanel}
              onCloseAll={closeAllToolPanels}
              store={store}
              hostId={hostId}
              sftpSessionId={sftpSessionId}
              localPath={store.getState().localPath}
              remotePath={remotePath}
              height={bottomPanelHeight}
              onUndo={(logId) => handleUndo(logId)}
              undoingLogId={undoingLogId}
              onBookmarkSelect={(path) => store.getState().setRemotePath(path)}
            />
          </Suspense>
        </>
      )}

      <SftpPropertiesDialog
        open={propertiesDialog.open}
        path={propertiesDialog.path}
        entry={propertiesDialog.entry}
        isLoading={propertiesDialog.isLoading}
        error={propertiesDialog.error}
        onApplyPermissions={handleApplyPermissions}
        onClose={closePropertiesDialog}
      />

      <PromptDialog
        open={renameDialog.open}
        title={t("Rename")}
        label={t("Enter a new name:")}
        defaultValue={renameDialog.oldName}
        confirmLabel={t("Rename")}
        onConfirm={(newName: string) => { void handleRenameConfirm(newName); }}
        onCancel={() => setRenameDialog({ open: false, path: "", oldName: "" })}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        title={t("Delete")}
        message={t("Delete {count} item(s)?").replace("{count}", String(deleteDialog.paths.length))}
        description={t("Remote files are cached locally for 7 days before deletion.")}
        confirmLabel={t("Delete")}
        cancelLabel={t("Cancel")}
        variant="danger"
        onConfirm={() => { void handleDeleteConfirm(); }}
        onCancel={() => setDeleteDialog({ open: false, paths: [] })}
      />

      <PromptDialog
        open={mkdirDialog}
        title={t("New Folder")}
        label={t("Folder name:")}
        placeholder="my-folder"
        confirmLabel={t("Create")}
        onConfirm={(name: string) => { void handleMkdirConfirm(name); }}
        onCancel={() => setMkdirDialog(false)}
      />

      <PromptDialog
        open={bookmarkDialog.open}
        title={t("Bookmark")}
        label={t("Bookmark name:")}
        defaultValue={bookmarkDialog.defaultName}
        confirmLabel={t("Save")}
        onConfirm={(name: string) => { void handleBookmarkConfirm(name); }}
        onCancel={() => setBookmarkDialog({ open: false, path: "", defaultName: "" })}
      />
    </div>
  );
}

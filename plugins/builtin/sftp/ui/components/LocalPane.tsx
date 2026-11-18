import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import type React from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { toast } from "sonner";

import type { FsEntry } from "@hypershell/shared";
import type { SftpStoreState } from "../sftpStore";
import { getParentPath } from "../utils/fileUtils";
import { createRequestGuard, type RequestGuard } from "../utils/requestGuard";
import { DriveSelector } from "./DriveSelector";
import { FileContextMenu, fileContextIcons, type FileContextMenuAction } from "./FileContextMenu";
import { FileList } from "./FileList";
import { PathBreadcrumb, type PathBreadcrumbHandle } from "./PathBreadcrumb";
import { HistoryNavigation } from "./HistoryNavigation";
import { SftpStatusBar } from "./SftpStatusBar";
import { useSftpI18n, useSftpUiHost } from "../hostServices";

export interface LocalPaneProps {
  store: StoreApi<SftpStoreState>;
  onTransfer: (localPaths: string[], remotePath: string) => void;
  onDownload: (remotePaths: string[], localPath: string) => void;
  onCopy?: (paths: string[]) => void;
  onCut?: (paths: string[]) => void;
  onPaste?: (targetDirectory?: string) => void;
  canPaste?: boolean;
  isActive: boolean;
  onActivate: () => void;
  breadcrumbRef?: React.RefObject<PathBreadcrumbHandle | null>;
}

interface LocalContextMenuState {
  x: number;
  y: number;
  entry?: FsEntry;
}

function getFileName(filePath: string): string {
  const segments = filePath.split(/[\\/]/);
  return segments[segments.length - 1] || filePath;
}

export function LocalPane({ store, onTransfer, onDownload, onCopy = () => {}, onCut = () => {}, onPaste = () => {}, canPaste = false, isActive, onActivate, breadcrumbRef }: LocalPaneProps) {
  const host = useSftpUiHost();
  const ConfirmDialog = host.ui.ConfirmDialog;
  const PromptDialog = host.ui.PromptDialog;
  const { locale, t } = useSftpI18n();
  const localPath = useStore(store, (state) => state.localPath);
  const localEntries = useStore(store, (state) => state.localEntries);
  const localSelection = useStore(store, (state) => state.localSelection);
  const localSortBy = useStore(store, (state) => state.localSortBy);
  const localCursorIndex = useStore(store, (state) => state.localCursorIndex);
  const localFilterText = useStore(store, (state) => state.localFilterText);
  const filterCaseSensitive = useStore(store, (state) => state.filterCaseSensitive);
  const filterRegex = useStore(store, (state) => state.filterRegex);
  const isLoading = useStore(store, (state) => state.isLoading.local);
  const error = useStore(store, (state) => state.error.local);

  const setLocalPath = useStore(store, (state) => state.setLocalPath);
  const setLocalEntries = useStore(store, (state) => state.setLocalEntries);
  const setLocalSelection = useStore(store, (state) => state.setLocalSelection);
  const setLocalSortBy = useStore(store, (state) => state.setLocalSortBy);
  const setLoading = useStore(store, (state) => state.setLoading);
  const setError = useStore(store, (state) => state.setError);

  const filteredEntries = useMemo(() => {
    if (!localFilterText) return localEntries;
    if (filterRegex) {
      try {
        const re = new RegExp(localFilterText, filterCaseSensitive ? "" : "i");
        return localEntries.filter((entry) => re.test(entry.name));
      } catch {
        return localEntries;
      }
    }
    if (filterCaseSensitive) {
      return localEntries.filter((entry) => entry.name.includes(localFilterText));
    }
    const lower = localFilterText.toLowerCase();
    return localEntries.filter((entry) => entry.name.toLowerCase().includes(lower));
  }, [localEntries, localFilterText, filterCaseSensitive, filterRegex]);

  useEffect(() => {
    const maxIndex = Math.max(0, filteredEntries.length - 1);
    if (localCursorIndex > maxIndex) {
      store.getState().setCursorIndex("local", maxIndex);
    }
  }, [filteredEntries.length, localCursorIndex, store]);

  const [contextMenu, setContextMenu] = useState<LocalContextMenuState | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; path: string; oldName: string }>({
    open: false,
    path: "",
    oldName: "",
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; paths: string[] }>({
    open: false,
    paths: [],
  });

  const requestGuardRef = useRef<RequestGuard | null>(null);
  if (requestGuardRef.current === null) {
    requestGuardRef.current = createRequestGuard();
  }

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!path) {
        return;
      }

      const token = requestGuardRef.current!.begin();
      setLoading("local", true);
      setError("local", null);

      try {
        const response = await host.files.list({ path });
        if (!requestGuardRef.current!.isCurrent(token)) {
          return;
        }
        if (response?.error === "permission-denied") {
          setLocalEntries([]);
          setError("local", host.i18n.translate("You don't have permission to read this folder", locale));
          return;
        }
        setLocalEntries(response?.entries ?? []);
      } catch (loadError) {
        if (!requestGuardRef.current!.isCurrent(token)) {
          return;
        }
        const message =
          loadError instanceof Error ? loadError.message : "Failed to list local directory";
        if (message.includes("outside the allowed filesystem roots")) {
          try {
            const home = await host.files.getHome();
            if (home?.path && home.path !== path && requestGuardRef.current!.isCurrent(token)) {
              setLocalPath(home.path);
              setError("local", `Path is outside allowed roots. Returned to ${home.path}.`);
              return;
            }
          } catch {
            // Fall through to the original error if home lookup fails.
          }
        }
        if (requestGuardRef.current!.isCurrent(token)) {
          setError("local", message);
        }
      } finally {
        if (requestGuardRef.current!.isCurrent(token)) {
          setLoading("local", false);
        }
      }
    },
    [host, locale, setError, setLoading, setLocalEntries, setLocalPath]
  );

  useEffect(() => {
    if (localPath) {
      return;
    }

    let disposed = false;

    async function loadHome() {
      try {
        const home = await host.files.getHome();
        if (disposed) {
          return;
        }

        if (home?.path) {
          setLocalPath(home.path);
        }
      } catch (loadError) {
        if (!disposed) {
          const reason = loadError instanceof Error ? loadError.message : String(loadError);
          setError("local", `Failed to resolve local home directory: ${reason}`);
        }
      }
    }

    void loadHome();

    return () => {
      disposed = true;
    };
  }, [host, localPath, setError, setLocalPath]);

  useEffect(() => {
    if (!localPath) {
      return;
    }

    void loadDirectory(localPath);
  }, [loadDirectory, localPath]);

  const handleNavigate = useCallback(
    (path: string) => {
      setLocalPath(path);
      setLocalSelection(new Set<string>());
    },
    [setLocalPath, setLocalSelection]
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent, entry?: FsEntry) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, entry });
    },
    []
  );

  // Internal drop: paths from remote pane's file list → these are remote paths, trigger download
  const handleInternalDrop = useCallback(
    (paths: string[], targetDirectory?: string) => {
      onDownload(paths, targetDirectory ?? localPath);
    },
    [onDownload, localPath]
  );

  const handleInternalMove = useCallback(
    async (paths: string[], targetDirectory: string) => {
      const normalizedTarget = targetDirectory.replace(/\\/g, "/").replace(/\/+$/, "");
      let failed = 0;
      const moved: Array<{ from: string; to: string }> = [];
      const progressId = toast.loading(t("Moving {current}/{total}")
        .replace("{current}", "0")
        .replace("{total}", String(paths.length)));

      for (const [index, filePath] of paths.entries()) {
        toast.loading(t("Moving {current}/{total}")
          .replace("{current}", String(index + 1))
          .replace("{total}", String(paths.length)), { id: progressId });
        const normalizedSource = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
        const comparableSource = /^[a-z]:\//i.test(normalizedSource) ? normalizedSource.toLowerCase() : normalizedSource;
        const comparableTarget = /^[a-z]:\//i.test(normalizedTarget) ? normalizedTarget.toLowerCase() : normalizedTarget;
        if (comparableSource === comparableTarget) continue;
        if (comparableTarget.startsWith(`${comparableSource}/`)) {
          failed += 1;
          store.getState().recordOperation(`fsRename(oldPath: "${filePath}", target: "${targetDirectory}")`, "Cannot move a directory into itself", false, "Move");
          continue;
        }

        const separator = targetDirectory.includes("\\") ? "\\" : "/";
        const newPath = `${targetDirectory.replace(/[\\/]$/, "")}${separator}${getFileName(filePath)}`;
        if (normalizedSource === newPath.replace(/\\/g, "/").replace(/\/+$/, "")) continue;

        try {
          await host.files.rename({ oldPath: filePath, newPath });
          store.getState().recordOperation(`fsRename(oldPath: "${filePath}", newPath: "${newPath}")`, t("Succeeded"), true, "Move", { type: "path-change", pane: "local", changes: [{ from: filePath, to: newPath }] });
          moved.push({ from: filePath, to: newPath });
        } catch (error) {
          failed += 1;
          store.getState().recordOperation(`fsRename(oldPath: "${filePath}", newPath: "${newPath}")`, error instanceof Error ? error.message : "Failed to move", false, "Move");
        }
      }

      if (moved.length > 0) {
        store.getState().setLocalSelection(new Set(moved.map((item) => item.to)));
        store.getState().setLocalPath(targetDirectory);
        toast.success(t("Move completed"), { id: progressId });
      } else if (failed > 0) {
        toast.error(`${t("Failed to move")}: ${failed}`, { id: progressId });
        await loadDirectory(localPath);
      } else {
        toast.dismiss(progressId);
      }
      if (failed > 0 && moved.length > 0) toast.error(`${t("Failed to move")}: ${failed}`);
    },
    [loadDirectory, localPath, store, t]
  );

  // External drop: OS files → no meaningful action for local-to-local
  const handleExternalDrop = useCallback(
    (_localPaths: string[]) => {
      // No action — local-to-local OS drops don't make sense in this context
    },
    []
  );

  const handleRename = useCallback(
    (filePath: string) => {
      const oldName = getFileName(filePath);
      setRenameDialog({ open: true, path: filePath, oldName });
    },
    []
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      const { path: filePath, oldName } = renameDialog;
      setRenameDialog({ open: false, path: "", oldName: "" });

      if (newName === oldName) return;

      const parentPath = getParentPath(filePath);
      const newPath = parentPath.endsWith("\\")
        ? `${parentPath}${newName}`
        : `${parentPath}\\${newName}`;

      try {
        await host.files.rename({ oldPath: filePath, newPath });
        store.getState().recordOperation(`fsRename(oldPath: "${filePath}", newPath: "${newPath}")`, t("Succeeded"), true, "Rename", { type: "path-change", pane: "local", changes: [{ from: filePath, to: newPath }] });
        await loadDirectory(localPath);
      } catch (err) {
        store.getState().recordOperation(`fsRename(oldPath: "${filePath}", newName: "${newName}")`, err instanceof Error ? err.message : "Failed to rename", false);
        toast.error(err instanceof Error ? err.message : "Failed to rename");
      }
    },
    [renameDialog, loadDirectory, localPath, store, t]
  );

  const handleRenameEntry = useCallback(
    async (filePath: string, newName: string) => {
      const parentPath = getParentPath(filePath);
      const newPath = parentPath.endsWith("\\")
        ? `${parentPath}${newName}`
        : `${parentPath}\\${newName}`;
      try {
        await host.files.rename({ oldPath: filePath, newPath });
        store.getState().recordOperation(`fsRename(oldPath: "${filePath}", newPath: "${newPath}")`, t("Succeeded"), true, "Rename", { type: "path-change", pane: "local", changes: [{ from: filePath, to: newPath }] });
        await loadDirectory(localPath);
      } catch (error) {
        store.getState().recordOperation(`fsRename(oldPath: "${filePath}", newName: "${newName}")`, error instanceof Error ? error.message : "Failed to rename", false);
        throw error;
      }
    },
    [loadDirectory, localPath, store, t]
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

    let failed = 0;
      const progressId = toast.loading(t("Deleting {current}/{total}")
        .replace("{current}", "0")
        .replace("{total}", String(paths.length)));
      for (const [index, filePath] of paths.entries()) {
        toast.loading(t("Deleting {current}/{total}")
          .replace("{current}", String(index + 1))
          .replace("{total}", String(paths.length)), { id: progressId });
      try {
        await host.files.trash({ path: filePath });
          store.getState().recordOperation(`fsTrash(path: "${filePath}")`, t("Succeeded"), true, "Delete");
      } catch {
        failed += 1;
          store.getState().recordOperation(`fsTrash(path: "${filePath}")`, t("Failed"), false, "Delete");
      }
    }

    if (failed > 0) {
        toast.error(`Failed to delete ${failed} item${failed === 1 ? "" : "s"}`, { id: progressId });
      } else {
        toast.success(t("Delete completed"), { id: progressId });
    }

    await loadDirectory(localPath);
  }, [deleteDialog, host, loadDirectory, localPath, store, t]);

  const contextActions = useMemo<FileContextMenuAction[]>(() => {
    if (!contextMenu) return [];

    const selectedPaths = localSelection.size > 0
      ? Array.from(localSelection)
      : contextMenu.entry
        ? [contextMenu.entry.path]
        : [];

    if (contextMenu.entry) {
      const entry = contextMenu.entry;
      return [
        {
          label: t("Open"),
          action: () => {
            if (entry.isDirectory) handleNavigate(entry.path);
            else void host.files.openItem({ path: entry.path });
          }
        },
        {
          label: t("Upload to Remote"),
          action: () => onTransfer(selectedPaths, ""),
          shortcut: "F6",
          icon: fileContextIcons.transfer,
          disabled: selectedPaths.length === 0
        },
        { label: "", action: () => {}, separator: true },
        {
          label: t("Copy"),
          action: () => onCopy(selectedPaths),
          shortcut: "CTRL+C",
          icon: fileContextIcons.copy,
          disabled: selectedPaths.length === 0
        },
        {
          label: t("Cut"),
          action: () => onCut(selectedPaths),
          shortcut: "CTRL+X",
          icon: fileContextIcons.cut,
          disabled: selectedPaths.length === 0
        },
        {
          label: t("Paste"),
          action: () => onPaste(entry.isDirectory ? entry.path : localPath),
          shortcut: "CTRL+V",
          icon: fileContextIcons.paste,
          disabled: !canPaste
        },
        { label: "", action: () => {}, separator: true },
        {
          label: t("Rename"),
          action: () => handleRename(entry.path),
          shortcut: "F2",
          icon: fileContextIcons.rename
        },
        {
          label: t("Delete"),
          action: () => handleDelete(selectedPaths),
          shortcut: "F8 / DEL",
          icon: fileContextIcons.delete,
          disabled: selectedPaths.length === 0
        },
        { label: "", action: () => {}, separator: true },
        {
          label: t("Copy Relative Path"),
          action: () => { void navigator.clipboard?.writeText(entry.name); },
          icon: fileContextIcons.path
        },
        {
          label: t("Copy Path"),
          action: () => { void navigator.clipboard?.writeText(entry.path); },
          icon: fileContextIcons.path
        },
        {
          label: t("Show in Explorer"),
          action: () => { void host.files.showInFolder({ path: entry.path }); }
        }
      ];
    }

    return [
      {
        label: t("Paste"),
        action: () => onPaste(localPath),
        shortcut: "CTRL+V",
        icon: fileContextIcons.paste,
        disabled: !canPaste
      },
      { label: "", action: () => {}, separator: true },
      { label: t("Go Up"), action: () => handleNavigate(getParentPath(localPath)), shortcut: "BACKSPACE" },
      { label: t("Refresh"), action: () => void loadDirectory(localPath), shortcut: "CTRL+R" }
    ];
  }, [canPaste, contextMenu, handleDelete, handleNavigate, handleRename, host, loadDirectory, localPath, localSelection, onCopy, onCut, onPaste, onTransfer, t]);

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${isActive ? "border-t-2 border-accent" : "border-t-2 border-transparent"}`}
      role="group"
      aria-label="Local files"
      onMouseDown={onActivate}
      onContextMenu={(event) => handleContextMenu(event)}
    >
      <div className="flex items-center gap-1 border-b border-base-700 bg-base-900/80 px-1.5 py-[2px]">
        <HistoryNavigation store={store} pane="local" />
        <button
          type="button"
          title={t("Go Up")}
          aria-label={t("Go Up")}
          className="rounded p-1 text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary"
          onClick={() => handleNavigate(getParentPath(localPath))}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
        </button>
        <button
          type="button"
          title={t("Refresh")}
          aria-label={t("Refresh")}
          className="rounded p-1 text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary disabled:opacity-40"
          disabled={isLoading}
          onClick={() => void loadDirectory(localPath)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4.9 9a8 8 0 0 1 13.2-2L20 12M4 17v-5h5"/><path d="M19.1 15a8 8 0 0 1-13.2 2L4 12"/></svg>
        </button>
        <div className="mx-0.5 h-3 w-px bg-base-700" />
        <DriveSelector currentPath={localPath} onSelect={handleNavigate} />
        <div className="mx-0.5 h-3 w-px bg-base-700" />
        <PathBreadcrumb ref={breadcrumbRef} path={localPath} onNavigate={handleNavigate} separator="\\" editable onPathSubmit={handleNavigate} />
      </div>

      <FileList
        entries={filteredEntries}
        selection={localSelection}
        sortBy={localSortBy}
        isLoading={isLoading}
        error={error}
        onNavigate={handleNavigate}
        onSelect={setLocalSelection}
        onSort={(column, direction) => setLocalSortBy({ column, direction })}
        onInternalDrop={handleInternalDrop}
        onInternalMove={handleInternalMove}
        onExternalDrop={handleExternalDrop}
        onContextMenu={handleContextMenu}
        onRenameEntry={handleRenameEntry}
        paneType="local"
        currentPath={localPath}
        cursorIndex={localCursorIndex}
      />
      <SftpStatusBar entries={filteredEntries} selection={localSelection} />

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}

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
        message={t("Move {count} item(s) to Recycle Bin?").replace("{count}", String(deleteDialog.paths.length))}
        confirmLabel={t("Delete")}
        cancelLabel={t("Cancel")}
        variant="danger"
        onConfirm={() => { void handleDeleteConfirm(); }}
        onCancel={() => setDeleteDialog({ open: false, paths: [] })}
      />
    </div>
  );
}

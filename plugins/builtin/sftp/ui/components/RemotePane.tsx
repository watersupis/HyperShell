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

import type { SftpEntry } from "@hypershell/plugin-api";
import type { SftpStoreState } from "../sftpStore";
import { getParentPath, joinRemotePath } from "../utils/fileUtils";
import { createRequestGuard, type RequestGuard } from "../utils/requestGuard";
import { FileContextMenu, fileContextIcons, type FileContextMenuAction } from "./FileContextMenu";
import { FileList, type FileListEntry } from "./FileList";
import { PathBreadcrumb, type PathBreadcrumbHandle } from "./PathBreadcrumb";
import { HistoryNavigation } from "./HistoryNavigation";
import { SftpStatusBar } from "./SftpStatusBar";
import { useSftpI18n, useSftpUiHost } from "../hostServices";

export interface RemotePaneProps {
  store: StoreApi<SftpStoreState>;
  onTransfer: (remotePaths: string[], localPath: string) => void;
  onUpload: (localPaths: string[], remotePath: string) => void;
  onEdit: (remotePath: string) => void;
  onProperties: (remotePath: string) => void;
  onRename: (remotePath: string) => void;
  onDelete: (paths: string[]) => void;
  onMkdir: () => void;
  onBookmark: (remotePath: string) => void;
  onCopy?: (paths: string[]) => void;
  onCut?: (paths: string[]) => void;
  onPaste?: (targetDirectory?: string) => void;
  canPaste?: boolean;
  isActive: boolean;
  onActivate: () => void;
  breadcrumbRef?: React.RefObject<PathBreadcrumbHandle | null>;
}

interface RemoteContextMenuState {
  x: number;
  y: number;
  entry?: FileListEntry;
}

function extractRemoteEntries(
  response: unknown
): SftpEntry[] {
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

export function RemotePane({
  store,
  onTransfer,
  onUpload,
  onEdit,
  onProperties,
  onRename,
  onDelete,
  onMkdir,
  onBookmark,
  onCopy = () => {},
  onCut = () => {},
  onPaste = () => {},
  canPaste = false,
  isActive,
  onActivate,
  breadcrumbRef
}: RemotePaneProps) {
  const { t } = useSftpI18n();
  const host = useSftpUiHost();
  const sftpSessionId = useStore(store, (state) => state.sftpSessionId);
  const remotePath = useStore(store, (state) => state.remotePath);
  const remoteEntries = useStore(store, (state) => state.remoteEntries);
  const remoteSelection = useStore(store, (state) => state.remoteSelection);
  const remoteSortBy = useStore(store, (state) => state.remoteSortBy);
  const remoteCursorIndex = useStore(store, (state) => state.remoteCursorIndex);
  const remoteFilterText = useStore(store, (state) => state.remoteFilterText);
  const filterCaseSensitive = useStore(store, (state) => state.filterCaseSensitive);
  const filterRegex = useStore(store, (state) => state.filterRegex);
  const isLoading = useStore(store, (state) => state.isLoading.remote);
  const error = useStore(store, (state) => state.error.remote);

  const setRemotePath = useStore(store, (state) => state.setRemotePath);
  const setRemoteEntries = useStore(store, (state) => state.setRemoteEntries);
  const setRemoteSelection = useStore(store, (state) => state.setRemoteSelection);
  const setRemoteSortBy = useStore(store, (state) => state.setRemoteSortBy);
  const setLoading = useStore(store, (state) => state.setLoading);
  const setError = useStore(store, (state) => state.setError);

  const filteredEntries = useMemo(() => {
    if (!remoteFilterText) return remoteEntries;
    if (filterRegex) {
      try {
        const re = new RegExp(remoteFilterText, filterCaseSensitive ? "" : "i");
        return remoteEntries.filter((entry) => re.test(entry.name));
      } catch {
        return remoteEntries;
      }
    }
    if (filterCaseSensitive) {
      return remoteEntries.filter((entry) => entry.name.includes(remoteFilterText));
    }
    const lower = remoteFilterText.toLowerCase();
    return remoteEntries.filter((entry) => entry.name.toLowerCase().includes(lower));
  }, [remoteEntries, remoteFilterText, filterCaseSensitive, filterRegex]);

  useEffect(() => {
    const maxIndex = Math.max(0, filteredEntries.length - 1);
    if (remoteCursorIndex > maxIndex) {
      store.getState().setCursorIndex("remote", maxIndex);
    }
  }, [filteredEntries.length, remoteCursorIndex, store]);

  const [contextMenu, setContextMenu] = useState<RemoteContextMenuState | null>(null);

  const requestGuardRef = useRef<RequestGuard | null>(null);
  if (requestGuardRef.current === null) {
    requestGuardRef.current = createRequestGuard();
  }

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!sftpSessionId) {
        return;
      }

      const token = requestGuardRef.current!.begin();
      setLoading("remote", true);
      setError("remote", null);

      try {
        if (!host.isAvailable()) {
          throw new Error("SFTP list API is unavailable in preload bridge");
        }
        const response = await host.sftp.list({ sftpSessionId, path });
        if (!requestGuardRef.current!.isCurrent(token)) {
          return;
        }
        const entries = extractRemoteEntries(response);
        setRemoteEntries(entries);
      } catch (loadError) {
        if (!requestGuardRef.current!.isCurrent(token)) {
          return;
        }
        const message =
          loadError instanceof Error ? loadError.message : "Failed to list remote directory";
        console.error("[sftp-ui] loadDirectory failed:", message);
        setError("remote", message);
      } finally {
        if (requestGuardRef.current!.isCurrent(token)) {
          setLoading("remote", false);
        }
      }
    },
    [host, setError, setLoading, setRemoteEntries, sftpSessionId]
  );

  const handleRenameEntry = useCallback(
    async (path: string, newName: string) => {
      if (!sftpSessionId) throw new Error("SFTP session is unavailable");
      const newPath = `${getParentPath(path).replace(/\/$/, "")}/${newName}`;
      try {
        await host.sftp.rename({ sftpSessionId, oldPath: path, newPath });
        store.getState().recordOperation(`sftpRename(oldPath: "${path}", newPath: "${newPath}")`, t("Succeeded"), true, "Rename", { type: "path-change", pane: "remote", changes: [{ from: path, to: newPath }] });
        await loadDirectory(remotePath);
      } catch (error) {
        store.getState().recordOperation(`sftpRename(oldPath: "${path}", newName: "${newName}")`, error instanceof Error ? error.message : "Failed to rename", false);
        throw error;
      }
    },
    [host, loadDirectory, remotePath, sftpSessionId, store, t]
  );

  useEffect(() => {
    if (!remotePath) {
      return;
    }

    void loadDirectory(remotePath);
  }, [loadDirectory, remotePath]);

  const handleNavigate = useCallback(
    (path: string) => {
      setRemotePath(path);
      setRemoteSelection(new Set<string>());
    },
    [setRemotePath, setRemoteSelection]
  );

  // Internal drop: paths from local pane's file list → these are local FS paths, treat as upload
  const handleInternalDrop = useCallback(
    (paths: string[], targetDirectory?: string) => {
      onUpload(paths, targetDirectory ?? remotePath);
    },
    [onUpload, remotePath]
  );

  const handleInternalMove = useCallback(
    async (paths: string[], targetDirectory: string) => {
      if (!sftpSessionId) return;
      const normalizedTarget = targetDirectory.replace(/\\/g, "/").replace(/\/+$/, "");
      let failed = 0;
      const moved: Array<{ from: string; to: string }> = [];
      const progressId = toast.loading(t("Moving {current}/{total}")
        .replace("{current}", "0")
        .replace("{total}", String(paths.length)));

      for (const [index, path] of paths.entries()) {
        toast.loading(t("Moving {current}/{total}")
          .replace("{current}", String(index + 1))
          .replace("{total}", String(paths.length)), { id: progressId });
        const normalizedSource = path.replace(/\\/g, "/").replace(/\/+$/, "");
        if (normalizedSource === normalizedTarget) continue;
        if (normalizedTarget.startsWith(`${normalizedSource}/`)) {
          failed += 1;
          store.getState().recordOperation(`sftpRename(oldPath: "${path}", target: "${targetDirectory}")`, "Cannot move a directory into itself", false, "Move");
          continue;
        }

        const fileName = path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? path;
        const newPath = joinRemotePath(targetDirectory, fileName);
        if (normalizedSource === newPath.replace(/\\/g, "/").replace(/\/+$/, "")) continue;

        try {
          await host.sftp.rename({ sftpSessionId, oldPath: path, newPath });
          store.getState().recordOperation(`sftpRename(oldPath: "${path}", newPath: "${newPath}")`, t("Succeeded"), true, "Move", { type: "path-change", pane: "remote", changes: [{ from: path, to: newPath }] });
          moved.push({ from: path, to: newPath });
        } catch (error) {
          failed += 1;
          store.getState().recordOperation(`sftpRename(oldPath: "${path}", newPath: "${newPath}")`, error instanceof Error ? error.message : "Failed to move", false, "Move");
        }
      }

      if (moved.length > 0) {
        store.getState().setRemoteSelection(new Set(moved.map((item) => item.to)));
        store.getState().setRemotePath(targetDirectory);
        toast.success(t("Move completed"), { id: progressId });
      } else if (failed > 0) {
        toast.error(`${t("Failed to move")}: ${failed}`, { id: progressId });
        await loadDirectory(remotePath);
      } else {
        toast.dismiss(progressId);
      }
      if (failed > 0 && moved.length > 0) toast.error(`${t("Failed to move")}: ${failed}`);
    },
    [host, loadDirectory, remotePath, sftpSessionId, store, t]
  );

  // External drop: OS files dragged in → upload to current remote directory
  const handleExternalDrop = useCallback(
    (localPaths: string[]) => {
      onUpload(localPaths, remotePath);
    },
    [onUpload, remotePath]
  );

  const handleContextMenu = useCallback((event: ReactMouseEvent, entry?: FileListEntry) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
  }, []);

  const contextActions = useMemo<FileContextMenuAction[]>(() => {
    if (!contextMenu) return [];

    const selectedPaths = remoteSelection.size > 0
      ? Array.from(remoteSelection)
      : contextMenu.entry
        ? [contextMenu.entry.path]
        : [];

    if (contextMenu.entry) {
      const entry = contextMenu.entry;
      return [
        {
          label: t("Open"),
          action: () => handleNavigate(entry.path),
          disabled: !entry.isDirectory
        },
        {
          label: t("Edit"),
          action: () => onEdit(entry.path),
          disabled: entry.isDirectory
        },
        {
          label: t("Download"),
          action: () => onTransfer(selectedPaths, ""),
          shortcut: "F5",
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
          action: () => onPaste(entry.isDirectory ? entry.path : remotePath),
          shortcut: "CTRL+V",
          icon: fileContextIcons.paste,
          disabled: !canPaste
        },
        { label: "", action: () => {}, separator: true },
        { label: t("Rename"), action: () => onRename(entry.path), shortcut: "F2", icon: fileContextIcons.rename },
        {
          label: t("Delete"),
          action: () => onDelete(selectedPaths),
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
          label: t("Properties"),
          action: () => onProperties(entry.path)
        },
        {
          label: t("Bookmark This Folder"),
          action: () => onBookmark(entry.isDirectory ? entry.path : getParentPath(entry.path))
        }
      ];
    }

    return [
      {
        label: t("Paste"),
        action: () => onPaste(remotePath),
        shortcut: "CTRL+V",
        icon: fileContextIcons.paste,
        disabled: !canPaste
      },
      { label: "", action: () => {}, separator: true },
      { label: t("Go Up"), action: () => handleNavigate(getParentPath(remotePath)), shortcut: "BACKSPACE" },
      { label: t("New Folder"), action: onMkdir, shortcut: "F7" },
      { label: t("Refresh"), action: () => void loadDirectory(remotePath), shortcut: "CTRL+R" },
      { label: "", action: () => {}, separator: true },
      { label: t("Bookmark This Folder"), action: () => onBookmark(remotePath) }
    ];
  }, [canPaste, contextMenu, handleNavigate, host, loadDirectory, onBookmark, onCopy, onCut, onDelete, onEdit, onMkdir, onPaste, onProperties, onRename, onTransfer, remotePath, remoteSelection, t]);

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${isActive ? "border-t-2 border-accent" : "border-t-2 border-transparent"}`}
      role="group"
      aria-label="Remote files"
      onMouseDown={onActivate}
      onContextMenu={(event) => handleContextMenu(event)}
    >
      <div className="flex items-center gap-1 border-b border-base-700 bg-base-900/80 px-1.5 py-[2px]">
        <HistoryNavigation store={store} pane="remote" />
        <button type="button" title={t("Go Up")} aria-label={t("Go Up")} className="rounded p-1 text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary" onClick={() => handleNavigate(getParentPath(remotePath))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
        </button>
        <button type="button" title={t("Refresh")} aria-label={t("Refresh")} disabled={isLoading} className="rounded p-1 text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary disabled:opacity-40" onClick={() => void loadDirectory(remotePath)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4.9 9a8 8 0 0 1 13.2-2L20 12M4 17v-5h5"/><path d="M19.1 15a8 8 0 0 1-13.2 2L4 12"/></svg>
        </button>
        <div className="mx-0.5 h-3 w-px bg-base-700" />
        <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">{t("Remote")}</span>
        <div className="mx-0.5 h-3 w-px bg-base-700" />
        <PathBreadcrumb ref={breadcrumbRef} path={remotePath} onNavigate={handleNavigate} editable onPathSubmit={handleNavigate} />
      </div>

      <FileList
        entries={filteredEntries}
        selection={remoteSelection}
        sortBy={remoteSortBy}
        isLoading={isLoading}
        error={error}
        onNavigate={handleNavigate}
        onSelect={setRemoteSelection}
        onSort={(column, direction) => setRemoteSortBy({ column, direction })}
        onInternalDrop={handleInternalDrop}
        onInternalMove={handleInternalMove}
        onExternalDrop={handleExternalDrop}
        onContextMenu={handleContextMenu}
        onRenameEntry={handleRenameEntry}
        onEdit={onEdit}
        paneType="remote"
        currentPath={remotePath}
        cursorIndex={remoteCursorIndex}
        sftpSessionId={sftpSessionId}
      />
      <SftpStatusBar entries={filteredEntries} selection={remoteSelection} />

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";

import {
  formatFileSize,
  sortEntries,
  type SortColumn,
  type SortDirection
} from "../utils/fileUtils";
import { FileIcon } from "./FileIcon";
import { useSftpI18n, useSftpUiHost } from "../hostServices";
import { extractDroppedPaths } from "../utils/droppedFilePaths";

export interface FileListEntry {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
  permissions?: number;
}

export interface FileListSortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface FileListProps {
  entries: FileListEntry[];
  selection: Set<string>;
  sortBy: FileListSortState;
  isLoading: boolean;
  error: string | null;
  onNavigate: (path: string) => void;
  onSelect: (selection: Set<string>) => void;
  onSort: (column: SortColumn, direction: SortDirection) => void;
  onInternalDrop: (paths: string[], targetDirectory?: string) => void;
  onInternalMove: (paths: string[], targetDirectory: string) => void;
  onExternalDrop: (localPaths: string[]) => void;
  onContextMenu: (event: MouseEvent, entry?: FileListEntry) => void;
  onEdit?: (path: string) => void;
  onRenameEntry?: (path: string, newName: string) => Promise<void>;
  paneType: "local" | "remote";
  currentPath: string;
  cursorIndex: number;
  sftpSessionId?: string;
}

const ROW_HEIGHT = 22;
const RENAME_CLICK_DELAY_MS = 1000;

let activeInternalDrag: { sourcePane: "local" | "remote"; paths: string[] } | null = null;

function getPointerPosition(event: DragEvent): { x: number; y: number } {
  return {
    x: Number.isFinite(event.clientX) ? event.clientX : 0,
    y: Number.isFinite(event.clientY) ? event.clientY : 0
  };
}

function formatCompactDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate || "—";
  }

  const mon = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hr = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${date.getFullYear()}-${mon}-${day} ${hr}:${min}`;
}

export function FileList({
  entries,
  selection,
  sortBy,
  isLoading,
  error,
  onNavigate,
  onSelect,
  onSort,
  onInternalDrop,
  onInternalMove,
  onExternalDrop,
  onContextMenu,
  onEdit,
  onRenameEntry,
  paneType,
  currentPath,
  cursorIndex,
  sftpSessionId
}: FileListProps) {
  const { t } = useSftpI18n();
  const host = useSftpUiHost();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [dropActive, setDropActive] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ path: string; operation: "Move" | "Upload" | "Download"; x: number; y: number } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Resizable column widths
  const defaultColWidths = paneType === "remote"
    ? { size: 50, modified: 120, perms: 42 }
    : { size: 50, modified: 120, perms: 0 };
  const [colWidths, setColWidths] = useState(defaultColWidths);
  const resizingRef = useRef<{ col: "size" | "modified" | "perms"; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((col: "size" | "modified" | "perms", event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = colWidths[col];
    resizingRef.current = { col, startX, startW };

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(30, resizingRef.current.startW + delta);
      setColWidths((prev) => ({ ...prev, [resizingRef.current!.col]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [colWidths]);

  const sortedEntries = useMemo(
    () => sortEntries(entries, sortBy.column, sortBy.direction),
    [entries, sortBy.column, sortBy.direction]
  );
  const rowVirtualizer = useVirtualizer({
    count: sortedEntries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => sortedEntries[index]?.path ?? index,
    overscan: 10,
    scrollMargin: 20,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const paddingTop = Math.max(0, (firstVirtualRow?.start ?? 20) - 20);
  const paddingBottom = Math.max(
    0,
    rowVirtualizer.getTotalSize() - (lastVirtualRow?.end ?? rowVirtualizer.getTotalSize())
  );

  useEffect(() => {
    if (cursorIndex >= 0 && cursorIndex < sortedEntries.length) {
      rowVirtualizer.scrollToIndex(cursorIndex, { align: "auto" });
    }
  }, [cursorIndex, rowVirtualizer, sortedEntries]);


  // --- Mouse-drag range selection ---
  const dragSelectRef = useRef<{ startIndex: number } | null>(null);
  const didDragSelectRef = useRef(false);
  const selectionTimeRef = useRef(new Map<string, number>());
  const preparedNativeDragOutRef = useRef<Set<string>>(new Set());
  const pendingNativeDragOutRef = useRef<Set<string>>(new Set());

  const createNativeDragOutKey = useCallback(
    (remotePath: string) => `${sftpSessionId ?? ""}:${remotePath}`,
    [sftpSessionId]
  );

  const prepareNativeDirectoryDragOut = useCallback(
    (entry: FileListEntry) => {
      if (!sftpSessionId || !host.isAvailable() || !entry.isDirectory) return;

      const key = createNativeDragOutKey(entry.path);
      if (preparedNativeDragOutRef.current.has(key) || pendingNativeDragOutRef.current.has(key)) {
        return;
      }

      pendingNativeDragOutRef.current.add(key);
      toast(`Preparing ${entry.name} for drag-out...`);

      void host.sftp.dragOut({
        sftpSessionId,
        remotePath: entry.path,
        fileName: entry.name,
        isDirectory: true,
        prepareOnly: true,
      }).then((result) => {
        if (!result.tempPath) {
          toast.error(`Failed to prepare ${entry.name} for drag-out.`);
          return;
        }

        preparedNativeDragOutRef.current.add(key);
        toast.success(`${entry.name} is ready to drag out.`);
      }).catch(() => {
        toast.error(`Failed to prepare ${entry.name} for drag-out.`);
      }).finally(() => {
        pendingNativeDragOutRef.current.delete(key);
      });
    },
    [createNativeDragOutKey, sftpSessionId]
  );

  const handleRowMouseDown = useCallback(
    (index: number, entry: FileListEntry, event: MouseEvent) => {
      if (event.button !== 0) return; // left-click only
      // If the item is already selected, let native drag handle it (file transfer)
      if (selection.has(entry.path)) return;
      dragSelectRef.current = { startIndex: index };
    },
    [selection]
  );

  const handleRowMouseEnter = useCallback(
    (index: number) => {
      if (!dragSelectRef.current) return;
      // Only activate drag-select after moving to a different row
      if (dragSelectRef.current.startIndex === index) return;
      didDragSelectRef.current = true;
      const from = Math.min(dragSelectRef.current.startIndex, index);
      const to = Math.max(dragSelectRef.current.startIndex, index);
      const paths = sortedEntries.slice(from, to + 1).map((e) => e.path);
      onSelect(new Set(paths));
    },
    [onSelect, sortedEntries]
  );

  useEffect(() => {
    const handleMouseUp = () => {
      dragSelectRef.current = null;
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleBlankMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("tr, th, button, input, select, textarea, [contenteditable='true']")) return;
    const container = containerRef.current;
    const rows = Array.from(container?.querySelectorAll<HTMLTableRowElement>("tbody tr[data-index]") ?? []);
    const row = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    const rowIndex = row ? Number(row.dataset.index) : -1;
    const headerHeight = container?.querySelector("thead")?.getBoundingClientRect().height || 20;
    const listOffset = container
      ? event.clientY - container.getBoundingClientRect().top + container.scrollTop - headerHeight
      : sortedEntries.length * ROW_HEIGHT;
    const startIndex = rowIndex >= 0
      ? rowIndex
      : Math.max(0, Math.min(sortedEntries.length, Math.floor(listOffset / ROW_HEIGHT)));
    dragSelectRef.current = { startIndex: startIndex < 0 ? sortedEntries.length : startIndex };
  };

  const handleBlankClick = (event: MouseEvent<HTMLDivElement>) => {
    if (didDragSelectRef.current) {
      didDragSelectRef.current = false;
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("tr, th, button, input, select, textarea, [contenteditable='true']")) return;
    onSelect(new Set());
  };

  const handleHeaderClick = (column: SortColumn) => {
    const direction =
      sortBy.column === column && sortBy.direction === "asc" ? "desc" : "asc";
    onSort(column, direction);
  };

  const handleRowClick = (entry: FileListEntry, event: MouseEvent) => {
    // Skip click if a drag-select gesture just completed
    if (didDragSelectRef.current) {
      didDragSelectRef.current = false;
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      const next = new Set(selection);
      if (next.has(entry.path)) {
        next.delete(entry.path);
        selectionTimeRef.current.delete(entry.path);
      } else {
        next.add(entry.path);
        selectionTimeRef.current.set(entry.path, Date.now());
      }
      onSelect(next);
    } else if (event.shiftKey && selection.size > 0) {
      const paths = sortedEntries.map((item) => item.path);
      const selectedPaths = Array.from(selection);
      const lastSelected = selectedPaths[selectedPaths.length - 1];
      const startIndex = Math.max(paths.indexOf(lastSelected), 0);
      const endIndex = Math.max(paths.indexOf(entry.path), 0);
      const [from, to] =
        startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      const next = new Set(paths.slice(from, to + 1));
      next.forEach((path) => selectionTimeRef.current.set(path, Date.now()));
      onSelect(next);
    } else {
      onSelect(new Set([entry.path]));
      selectionTimeRef.current.set(entry.path, Date.now());
    }
  };

  const handleRowDoubleClick = (entry: FileListEntry) => {
    if (renamingPath === entry.path) return;
    if (entry.isDirectory) {
      onNavigate(entry.path);
      return;
    }

    onEdit?.(entry.path);
  };

  const startRename = (entry: FileListEntry, event: MouseEvent) => {
    if (!selection.has(entry.path) || !onRenameEntry) return;
    const selectedAt = selectionTimeRef.current.get(entry.path);
    if (selectedAt === undefined || Date.now() - selectedAt < RENAME_CLICK_DELAY_MS) return;
    event.stopPropagation();
    setRenameValue(entry.name);
    setRenamingPath(entry.path);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  };

  const finishRename = async (entry: FileListEntry, save: boolean) => {
    if (renamingPath !== entry.path) return;
    const newName = renameValue.trim();
    setRenamingPath(null);
    if (!save || !newName || newName === entry.name || !onRenameEntry) return;
    try {
      await onRenameEntry(entry.path, newName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename");
    }
  };

  const handleDragStart = (event: DragEvent<HTMLTableRowElement>, entry: FileListEntry) => {
    const paths = selection.has(entry.path) ? Array.from(selection) : [entry.path];

    if (sftpSessionId && paths.length === 1 && entry.isDirectory && event.altKey) {
      event.preventDefault();
      const key = createNativeDragOutKey(paths[0]);
      if (!preparedNativeDragOutRef.current.has(key)) {
        prepareNativeDirectoryDragOut(entry);
        return;
      }

      host.sftp.startNativeDragOut({
        sftpSessionId,
        remotePath: paths[0],
        fileName: entry.name,
        isDirectory: true,
      });
      return;
    }

    const isNativeFileDragOut = paneType === "remote" && sftpSessionId && paths.length === 1 && !entry.isDirectory && event.altKey;
    activeInternalDrag = isNativeFileDragOut ? null : { sourcePane: paneType, paths };

    // Always set internal data synchronously (for cross-pane drops)
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-sftp-paths", JSON.stringify(paths));
    event.dataTransfer.setData("application/x-hypershell-source-pane", paneType);
    event.dataTransfer.setData("text/plain", paths.join("\n"));

    // Native OS drag-out is explicit so normal drags stay inside the SFTP panes.
    if (isNativeFileDragOut) {
      void host.sftp.dragOut({
        sftpSessionId,
        remotePath: paths[0],
        fileName: entry.name,
        isDirectory: entry.isDirectory,
      }).catch(() => {
        // Drag-out is best-effort; internal drag still works
      });
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(true);
    const sourcePane = activeInternalDrag?.sourcePane ?? event.dataTransfer.getData("application/x-hypershell-source-pane");
    if (sourcePane !== "local" && sourcePane !== "remote") return;

    if (sourcePane === paneType) {
      setDropTarget(null);
      event.dataTransfer.dropEffect = "none";
      return;
    }

    const operation = paneType === "remote" ? "Upload" : "Download";
    const { x, y } = getPointerPosition(event);
    setDropTarget({ path: currentPath, operation, x, y });
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropActive(false);
    setDropTarget(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    setDropTarget(null);

    const internalDrag = activeInternalDrag;
    activeInternalDrag = null;
    const internalPaths = event.dataTransfer.getData("application/x-sftp-paths");
    const sourcePane = internalDrag?.sourcePane ?? event.dataTransfer.getData("application/x-hypershell-source-pane");
    if (sourcePane === "local" || sourcePane === "remote") {
      const paths = internalDrag?.paths ?? (internalPaths ? JSON.parse(internalPaths) as string[] : []);
      if (sourcePane !== paneType && paths.length > 0) onInternalDrop(paths);
      return;
    }

    const files = extractDroppedPaths(host, event.dataTransfer);
    if (files.length > 0) onExternalDrop(files);
  };

  const handleRowDrop = (event: DragEvent<HTMLTableRowElement>, entry: FileListEntry) => {
    const drag = activeInternalDrag;
    const internalPaths = event.dataTransfer.getData("application/x-sftp-paths");
    const sourcePane = drag?.sourcePane ?? event.dataTransfer.getData("application/x-hypershell-source-pane");
    if ((sourcePane !== "local" && sourcePane !== "remote") || (!drag && !internalPaths)) return;

    event.preventDefault();
    event.stopPropagation();
    const paths = drag?.paths ?? JSON.parse(internalPaths) as string[];
    if (entry.isDirectory) {
      if (sourcePane === paneType) onInternalMove(paths, entry.path);
      else onInternalDrop(paths, entry.path);
    }
    activeInternalDrag = null;
    setDropTarget(null);
  };

  const handleRowDragOver = (event: DragEvent<HTMLTableRowElement>, entry: FileListEntry) => {
    const sourcePane = activeInternalDrag?.sourcePane ?? event.dataTransfer.getData("application/x-hypershell-source-pane");
    if (sourcePane !== "local" && sourcePane !== "remote") return;

    event.preventDefault();
    event.stopPropagation();
    if (!entry.isDirectory) {
      setDropTarget(null);
      event.dataTransfer.dropEffect = "none";
      return;
    }

    const operation = sourcePane === paneType ? "Move" : paneType === "remote" ? "Upload" : "Download";
    const { x, y } = getPointerPosition(event);
    setDropTarget({ path: entry.path, operation, x, y });
    event.dataTransfer.dropEffect = operation === "Move" ? "move" : "copy";
  };

  const handleDragEnd = () => {
    if (activeInternalDrag?.sourcePane === paneType) activeInternalDrag = null;
    setDropTarget(null);
  };

  const renderSortIndicator = (column: SortColumn) => {
    if (sortBy.column !== column) {
      return null;
    }

    return sortBy.direction === "asc" ? " ▲" : " ▼";
  };

  const resizeHandle = (col: "size" | "modified" | "perms") => (
    <span
      role="separator"
      aria-orientation="vertical"
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent/50"
      onMouseDown={(e) => handleResizeStart(col, e)}
    />
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-sftp-pane={paneType}
      className={`relative min-h-0 flex-1 overflow-y-auto bg-base-800/70 ${
        dropActive ? "ring-2 ring-inset ring-accent/50" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseDown={handleBlankMouseDown}
      onClick={handleBlankClick}
      onContextMenu={(event) => onContextMenu(event)}
    >
      {dropTarget && (
        <div
          className="pointer-events-none fixed z-50 max-w-[min(360px,calc(100vw-24px))] truncate rounded border border-accent/40 bg-base-900/95 px-2 py-1 text-[11px] text-accent shadow-lg"
          style={{
            left: Math.max(8, Math.min(dropTarget.x + 14, window.innerWidth - 372)),
            top: Math.max(8, Math.min(dropTarget.y + 20, window.innerHeight - 40))
          }}
        >
          {dropTarget.operation === "Move"
            ? t("Move to {path}").replace("{path}", dropTarget.path)
            : dropTarget.operation === "Upload"
              ? t("Upload to remote folder {path}").replace("{path}", dropTarget.path)
              : t("Download to local folder {path}").replace("{path}", dropTarget.path)}
        </div>
      )}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center px-4 text-sm text-text-muted">
          {t("Loading files...")}
        </div>
	      ) : (
	        <table className="w-full table-fixed border-collapse text-[12px]" style={{ height: "auto" }}>
          <colgroup>
            <col />
            <col style={{ width: colWidths.size }} />
            <col style={{ width: colWidths.modified }} />
            {paneType === "remote" && <col style={{ width: colWidths.perms }} />}
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/30 bg-base-800 text-[9px] uppercase tracking-wider text-text-muted">
            <tr style={{ height: 20 }}>
              <th
                className="cursor-pointer px-1.5 text-left font-medium"
                onClick={() => handleHeaderClick("name")}
              >
                {t("Name")}{renderSortIndicator("name")}
              </th>
              <th
                className="relative cursor-pointer px-1.5 text-right font-medium"
                onClick={() => handleHeaderClick("size")}
              >
                {t("Size")}{renderSortIndicator("size")}
                {resizeHandle("size")}
              </th>
              <th
                className="relative cursor-pointer px-1.5 text-left font-medium"
                onClick={() => handleHeaderClick("modifiedAt")}
              >
                {t("Modified")}{renderSortIndicator("modifiedAt")}
                {resizeHandle("modified")}
              </th>
              {paneType === "remote" && (
                <th
                  className="relative cursor-pointer px-1.5 text-left font-medium"
                  onClick={() => handleHeaderClick("permissions")}
                >
                  {t("Permissions")}{renderSortIndicator("permissions")}
                  {resizeHandle("perms")}
                </th>
              )}
            </tr>
          </thead>
	          <tbody>
	            {sortedEntries.length === 0 ? (
	              <tr>
	                <td
	                  colSpan={paneType === "remote" ? 4 : 3}
	                  className="px-1.5 py-6 text-center text-[11px] text-text-muted"
	                >
	                  {t("No files or folders")}
	                </td>
	              </tr>
	            ) : (
	              <>
	                {paddingTop > 0 && (
	                  <tr aria-hidden="true">
	                    <td colSpan={paneType === "remote" ? 4 : 3} style={{ height: paddingTop, padding: 0, border: 0, lineHeight: 0 }} />
	                  </tr>
	                )}
	                {virtualRows.map((virtualRow) => {
	                  const index = virtualRow.index;
	                  const entry = sortedEntries[index]!;
	                  return (
	                <tr
	                  data-index={index}
	                  key={entry.path}
	                  style={{ height: ROW_HEIGHT, userSelect: "none" }}
	                  className={`transition-colors ${
	                    selection.has(entry.path)
	                      ? "bg-accent/15 ring-1 ring-inset ring-accent/60"
	                      : index % 2 === 0
	                        ? "hover:bg-base-700/30"
	                        : "bg-base-800/20 hover:bg-base-700/30"
	                  } ${cursorIndex === index && !selection.has(entry.path) ? "ring-1 ring-inset ring-accent/40" : ""}`}
	                  onMouseDown={(event) => handleRowMouseDown(index, entry, event)}
	                  onMouseEnter={() => handleRowMouseEnter(index)}
	                  onClick={(event) => handleRowClick(entry, event)}
                  onDoubleClick={() => handleRowDoubleClick(entry)}
	                  onContextMenu={(event) => {
	                    event.preventDefault();
	                    event.stopPropagation();
	                    if (!selection.has(entry.path)) {
	                      onSelect(new Set([entry.path]));
	                    }
	                    onContextMenu(event, entry);
	                  }}
	                  draggable={selection.has(entry.path)}
	                  onDragStart={(event) => handleDragStart(event, entry)}
                  onDragEnd={handleDragEnd}
	                  onDragOver={(event) => handleRowDragOver(event, entry)}
	                  onDrop={(event) => handleRowDrop(event, entry)}
	                  onDragLeave={(event) => {
	                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
	                  }}
	                >
	                  <td className="overflow-hidden px-1.5">
	                    <div className="flex min-w-0 items-center gap-1" style={{ height: ROW_HEIGHT }}>
	                      <FileIcon name={entry.name} isDirectory={entry.isDirectory} />
                      {renamingPath === entry.path ? (
                        <input
                          ref={renameInputRef}
                          aria-label={t("Rename")}
                          className="min-w-0 flex-1 rounded-sm border border-accent bg-base-900 px-1 text-[12px] text-text-primary outline-none"
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onBlur={() => void finishRename(entry, true)}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") void finishRename(entry, true);
                            if (event.key === "Escape") void finishRename(entry, false);
                          }}
                        />
                      ) : (
                        <span
                          className={`truncate text-[12px] ${entry.isDirectory ? "font-medium text-text-primary" : "text-text-primary"}`}
                          onClick={(event) => startRename(entry, event)}
                        >
                          {entry.name}
                        </span>
                      )}
	                    </div>
	                  </td>
	                  <td className="overflow-hidden whitespace-nowrap px-1.5 text-right text-[11px] text-text-secondary">
	                    {entry.isDirectory ? "—" : formatFileSize(entry.size)}
	                  </td>
	                  <td className="overflow-hidden whitespace-nowrap px-1.5 text-[11px] text-text-secondary">
	                    {formatCompactDate(entry.modifiedAt)}
	                  </td>
	                  {paneType === "remote" && (
	                    <td className="overflow-hidden whitespace-nowrap px-1.5 font-mono text-[10px] text-text-secondary">
	                      {(entry.permissions ?? 0).toString(8).padStart(4, "0")}
	                    </td>
	                  )}
	                </tr>
	                  );
	                })}
	                {paddingBottom > 0 && (
	                  <tr aria-hidden="true">
	                    <td colSpan={paneType === "remote" ? 4 : 3} style={{ height: paddingBottom, padding: 0, border: 0, lineHeight: 0 }} />
	                  </tr>
	                )}
	              </>
	            )}
	          </tbody>
	        </table>
	      )}
	    </div>
  );
}

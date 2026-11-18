import { useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";
import type { SftpBookmark } from "@hypershell/plugin-api";
import { toast } from "sonner";
import { useSftpI18n, useSftpUiHost } from "../hostServices";
import type { SftpStoreState } from "../sftpStore";
import type { StoreApi } from "zustand";
import { SyncPanel } from "./SyncPanel";
import { TransferPanel } from "./TransferPanel";

export type SftpPanelId = "bookmarks" | "logs" | "sync" | "transfers";

const panelLabels: Record<SftpPanelId, string> = {
  bookmarks: "Bookmarks",
  logs: "Operation Logs",
  sync: "Sync",
  transfers: "Transfers",
};

export interface SftpBottomPanelProps {
  panels: SftpPanelId[];
  activePanel: SftpPanelId;
  onActivatePanel: (panel: SftpPanelId) => void;
  onClosePanel: (panel: SftpPanelId) => void;
  onCloseAll: () => void;
  store: StoreApi<SftpStoreState>;
  hostId: string;
  sftpSessionId: string;
  localPath: string;
  remotePath: string;
  height: number;
  onUndo: (logId: string) => void;
  undoingLogId: string | null;
  onBookmarkSelect: (path: string) => void;
}

export function SftpBottomPanel({
  panels,
  activePanel,
  onActivatePanel,
  onClosePanel,
  onCloseAll,
  store,
  hostId,
  sftpSessionId,
  localPath,
  remotePath,
  height,
  onUndo,
  undoingLogId,
  onBookmarkSelect,
}: SftpBottomPanelProps) {
  const { t } = useSftpI18n();
  const host = useSftpUiHost();
  const [bookmarks, setBookmarks] = useState<SftpBookmark[]>([]);
  const operationLogs = useStore(store, (state) => state.operationLogs);
  const clearOperationLogs = useCallback(async () => {
    try {
      await host.sftp.operationLogsClear({ hostId });
      store.getState().clearOperationLogs();
    } catch {
      toast.error(t("Failed to clear operation logs"));
    }
  }, [host, hostId, store, t]);

  const removeBookmark = useCallback(async (bookmark: SftpBookmark) => {
    try {
      await host.sftp.bookmarksRemove({ id: bookmark.id });
      setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
    } catch {
      toast.error(t("Failed to delete bookmark"));
    }
  }, [host, t]);

  useEffect(() => {
    let cancelled = false;
    if (!hostId) {
      setBookmarks([]);
      return;
    }
    void host.sftp
      .bookmarksList({ hostId })
      .then((result) => {
        if (!cancelled) setBookmarks(result ?? []);
      })
      .catch(() => {
        if (!cancelled) setBookmarks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [host, hostId]);

  return (
    <section style={{ height }} className="flex min-h-36 shrink-0 flex-col border-t border-border-bright bg-base-900" aria-label="SFTP">
      <div className="flex h-8 shrink-0 items-stretch border-b border-base-700">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {panels.map((panel) => (
            <div key={panel} className={`flex shrink-0 items-center border-r border-base-700 ${activePanel === panel ? "bg-base-800 text-text-primary" : "text-text-muted hover:bg-base-800/70 hover:text-text-primary"}`}>
              <button
                type="button"
                role="tab"
                aria-selected={activePanel === panel}
                onClick={() => onActivatePanel(panel)}
                className="h-full px-3 text-xs"
              >
                {t(panelLabels[panel])}
              </button>
              <button
                type="button"
                aria-label={`${t("Close")} ${t(panelLabels[panel])}`}
                title={`${t("Close")} ${t(panelLabels[panel])}`}
                onClick={() => onClosePanel(panel)}
                className="mr-1 rounded p-1 text-text-muted hover:bg-base-600 hover:text-text-primary"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label={t("Close")}
          title={t("Close")}
          onClick={onCloseAll}
          className="flex w-8 shrink-0 items-center justify-center text-text-muted hover:bg-base-700 hover:text-text-primary"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {panels.map((panel) => (
          <div key={panel} className={`h-full min-h-0 ${activePanel === panel ? "" : "hidden"}`}>
            {panel === "bookmarks" && (
              <div className="h-full overflow-auto py-1">
                {bookmarks.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-text-muted">{t("No bookmarks")}</div>
                ) : bookmarks.map((bookmark) => (
                  <div key={bookmark.id} className="group flex w-full items-center hover:bg-base-800">
                    <button
                      type="button"
                      onClick={() => onBookmarkSelect(bookmark.remotePath)}
                      title={bookmark.remotePath}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left text-xs text-text-primary"
                    >
                      <span className="w-40 shrink-0 truncate">{bookmark.name}</span>
                      <span className="truncate font-mono text-[10px] text-text-muted">{bookmark.remotePath}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${t("Delete")} ${bookmark.name}`}
                      title={t("Delete")}
                      onClick={() => { void removeBookmark(bookmark); }}
                      className="mr-2 rounded p-1 text-text-muted opacity-0 hover:bg-base-600 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {panel === "logs" && (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex h-8 shrink-0 items-center justify-end border-b border-base-800 px-2">
                  <button
                    type="button"
                    onClick={clearOperationLogs}
                    disabled={operationLogs.length === 0}
                    className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-base-700 disabled:opacity-40"
                  >
                    {t("Clear")}
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {operationLogs.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-text-muted">{t("No operation logs")}</div>
                  ) : (
                    <table className="w-full table-fixed text-left text-xs">
                      <thead className="sticky top-0 bg-base-900 text-text-muted">
                        <tr>
                          <th className="w-36 px-3 py-1.5 font-medium">{t("Time")}</th>
                          <th className="w-24 px-3 py-1.5 font-medium">{t("Operation")}</th>
                          <th className="px-3 py-1.5 font-medium">{t("Command")}</th>
                          <th className="w-40 px-3 py-1.5 font-medium">{t("Result")}</th>
                          <th className="w-24 px-3 py-1.5 text-right font-medium">{t("Undo")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operationLogs.map((log) => (
                          <tr key={log.id} className="border-t border-base-800 align-top">
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[10px] text-text-muted">{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-text-secondary">{t(log.operation ?? "Command")}</td>
                            <td className="break-all px-3 py-1.5 font-mono text-[10px] text-text-secondary">{log.command}</td>
                            <td className={`break-words px-3 py-1.5 ${log.success ? "text-green-400" : "text-red-400"}`}>{log.result}</td>
                            <td className="whitespace-nowrap px-3 py-1 text-right">
                              {log.undoData?.undoSkippedAt ? (
                                <span className="text-[10px] text-text-muted" title={String(log.undoData.undoError ?? "")}>{t("Undo failed, skipped")}</span>
                              ) : log.undoData?.undoneAt ? (
                                <span className="text-[10px] text-text-muted">{t("Undone")}</span>
                              ) : log.success && ["Upload", "Download", "Move", "Rename"].includes(log.operation ?? "") && log.undoData ? (
                                <button
                                  type="button"
                                  disabled={undoingLogId !== null}
                                  onClick={() => onUndo(log.id)}
                                  className="rounded px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {undoingLogId === log.id ? t("Undoing...") : t("Undo")}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
            {panel === "sync" && (
              <SyncPanel embedded sftpSessionId={sftpSessionId} localPath={localPath} remotePath={remotePath} onClose={() => onClosePanel("sync")} />
            )}
            {panel === "transfers" && <TransferPanel embedded />}
          </div>
        ))}
      </div>
    </section>
  );
}

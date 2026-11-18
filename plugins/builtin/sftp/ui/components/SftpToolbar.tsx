import type React from "react";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import type { SftpPanelId } from "./SftpBottomPanel";
import type { SftpStoreState } from "../sftpStore";
import { useSftpI18n, useSftpUiHost } from "../hostServices";
import { transferStore } from "../transferStore";

export interface SftpToolbarProps {
  store: StoreApi<SftpStoreState>;
  hostId: string;
  onDisconnect: () => void;
  filterText: string;
  onFilterChange: (text: string) => void;
  filterMatchCount: number;
  filterTotalCount: number;
  filterInputRef: React.RefObject<HTMLInputElement | null>;
  filterCaseSensitive: boolean;
  filterRegex: boolean;
  onToggleCaseSensitive: () => void;
  onToggleRegex: () => void;
  onOpenPanel: (panel: SftpPanelId) => void;
  activePanel: SftpPanelId | null;
  selectedPath: string | null;
  canCopy: boolean;
  canPaste: boolean;
  onRenameSelected: (path: string) => void;
  onCopySelected: () => void;
  onCutSelected: () => void;
  onPaste: (targetDirectory?: string) => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function SftpToolbar({
  store,
  hostId,
  onDisconnect,
  filterText,
  onFilterChange,
  filterMatchCount,
  filterTotalCount,
  filterInputRef,
  filterCaseSensitive,
  filterRegex,
  onToggleCaseSensitive,
  onToggleRegex,
  onOpenPanel,
  activePanel,
  selectedPath,
  canCopy,
  canPaste,
  onRenameSelected,
  onCopySelected,
  onCutSelected,
  onPaste,
  onUndo,
  canUndo,
}: SftpToolbarProps) {
  const { t } = useSftpI18n();
  const host = useSftpUiHost();
  const operationLogs = useStore(store, (state) => state.operationLogs);
  const transferCount = useStore(transferStore, (state) => state.transfers.length);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [syncCount, setSyncCount] = useState(0);
  const panelCounts = {
    bookmarks: bookmarkCount,
    logs: operationLogs.length,
    sync: syncCount,
    transfers: transferCount
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      host.sftp.bookmarksList({ hostId }).catch(() => []),
      host.sftp.syncList().catch(() => ({ syncs: [] }))
    ]).then(([bookmarks, syncResult]) => {
      if (cancelled) return;
      setBookmarkCount(bookmarks?.length ?? 0);
      setSyncCount(syncResult?.syncs.length ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [activePanel, host, hostId]);

  return (
    <div className="flex items-center gap-1 border-b border-base-700 bg-base-900/80 px-2 py-1">
      <button type="button" title={`${t("Undo")} (CTRL+Z)`} aria-label={t("Undo")} disabled={!canUndo} onClick={onUndo} className="flex size-7 items-center justify-center rounded text-text-secondary hover:bg-base-700 focus-ring disabled:opacity-35">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M5.2 13a8 8 0 1 0 2.3-6L3 11"/></svg>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button type="button" title={`${t("Copy")} (CTRL+C)`} aria-label={t("Copy")} disabled={!canCopy} onClick={onCopySelected} className="flex size-7 items-center justify-center rounded text-text-secondary hover:bg-base-700 focus-ring disabled:opacity-40"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg></button>
        <button type="button" title={`${t("Cut")} (CTRL+X)`} aria-label={t("Cut")} disabled={!canCopy} onClick={onCutSelected} className="flex size-7 items-center justify-center rounded text-text-secondary hover:bg-base-700 focus-ring disabled:opacity-40"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="m8 8 12 12M8 16 20 4"/></svg></button>
        <button type="button" title={`${t("Paste")} (CTRL+V)`} aria-label={t("Paste")} disabled={!canPaste} onClick={() => onPaste()} className="flex size-7 items-center justify-center rounded text-text-secondary hover:bg-base-700 focus-ring disabled:opacity-40"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6v3H9z"/></svg></button>
        <button type="button" disabled={!selectedPath} onClick={() => selectedPath && onRenameSelected(selectedPath)} className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-base-700 disabled:opacity-40">{t("Rename")}</button>
      </div>

      <div className="flex items-center gap-1">
        <input
          ref={filterInputRef}
          type="text"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder={t("Filter (Ctrl+F)")}
          className="w-32 shrink-0 rounded border border-border/50 bg-base-800 px-1.5 py-0.5 text-xs text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent/50 sm:w-44"
        />
        {filterText && (
          <span className="text-[10px] text-text-muted whitespace-nowrap">
            {filterMatchCount}/{filterTotalCount}
          </span>
        )}
        <button
          type="button"
          title={t("Match case")}
          onClick={onToggleCaseSensitive}
          className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold transition-colors ${
            filterCaseSensitive
              ? "bg-accent/20 text-accent border border-accent/40"
              : "text-text-muted hover:text-text-secondary border border-transparent"
          }`}
        >
          Aa
        </button>
        <button
          type="button"
          title={t("Use regular expression")}
          onClick={onToggleRegex}
          className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono transition-colors ${
            filterRegex
              ? "bg-accent/20 text-accent border border-accent/40"
              : "text-text-muted hover:text-text-secondary border border-transparent"
          }`}
        >
          .*
        </button>
      </div>

      {(["bookmarks", "logs", "sync", "transfers"] as const).map((panel) => (
        <button
          key={panel}
          type="button"
          onClick={() => onOpenPanel(panel)}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${activePanel === panel ? "bg-accent/20 text-accent" : "text-text-secondary hover:bg-base-700 hover:text-text-primary"}`}
        >
          {t(panel === "logs" ? "Logs" : panel === "bookmarks" ? "Bookmarks" : panel === "sync" ? "Sync" : "Transfers")}
          {panelCounts[panel] > 0 && ` (${panelCounts[panel]})`}
        </button>
      ))}

      <button
        type="button"
        onClick={onDisconnect}
        className="rounded px-2 py-0.5 text-xs text-red-400/80 transition-colors hover:bg-red-400/10 hover:text-red-300"
      >
        {t("Disconnect")}
      </button>
    </div>
  );
}

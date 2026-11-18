import { useMemo } from "react";
import type { FileListEntry } from "./FileList";
import { formatFileSize } from "../utils/fileUtils";
import { useSftpI18n } from "../hostServices";

interface SftpStatusBarProps {
  entries: FileListEntry[];
  selection: Set<string>;
}

function summarize(items: FileListEntry[]) {
  let files = 0;
  let folders = 0;
  let totalSize = 0;
  for (const e of items) {
    if (e.isDirectory) {
      folders++;
    } else {
      files++;
      totalSize += e.size;
    }
  }
  return { files, folders, totalSize };
}

function formatCounts(files: number, folders: number, t: (key: string) => string): string {
  const parts: string[] = [];
  if (folders > 0) parts.push(t("{count} folder(s)").replace("{count}", String(folders)));
  if (files > 0) parts.push(t("{count} file(s)").replace("{count}", String(files)));
  return parts.join(", ") || t("Empty");
}

export function SftpStatusBar({ entries, selection }: SftpStatusBarProps) {
  const { t } = useSftpI18n();
  const stats = useMemo(() => summarize(entries), [entries]);

  const selectionStats = useMemo(() => {
    if (selection.size === 0) return null;
    const selected = entries.filter((e) => selection.has(e.path));
    return summarize(selected);
  }, [entries, selection]);

  return (
    <div className="flex items-center justify-between border-t border-base-700 bg-base-900/80 px-2 py-0.5 text-[10px] text-text-secondary">
      <span>
        {formatCounts(stats.files, stats.folders, t)} — {formatFileSize(stats.totalSize)}
      </span>
      {selectionStats && (
        <span>
          {t("Selected:")} {formatCounts(selectionStats.files, selectionStats.folders, t)} — {formatFileSize(selectionStats.totalSize)}
        </span>
      )}
    </div>
  );
}

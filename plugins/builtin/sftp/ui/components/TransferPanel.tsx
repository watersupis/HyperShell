import { useStore } from "zustand";
import { toast } from "sonner";

import { resolveTransferConflict } from "../resolveTransferConflict";
import { transferStore } from "../transferStore";
import { transferRowControls } from "../transferRowControls";
import { toErrorMessage } from "../utils/errorUtils";
import { formatFileSize } from "../utils/fileUtils";
import { TransferConflictActions } from "./TransferConflictActions";
import { useSftpSetting, useSftpI18n, useSftpUiHost } from "../hostServices";

function percentage(bytesTransferred: number, totalBytes: number): number {
  if (totalBytes <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (bytesTransferred / totalBytes) * 100));
}

export function TransferPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useSftpI18n();
  const host = useSftpUiHost();
  const usePopupTransferMonitor = useSftpSetting<boolean>("usePopupTransferMonitor");
  const transfers = useStore(transferStore, (state) => state.transfers);
  const attentionCount = useStore(transferStore, (state) => state.attentionCount);
  const conflictIds = useStore(transferStore, (state) => state.conflictIds);
  const panelOpen = useStore(transferStore, (state) => state.panelOpen);
  const filter = useStore(transferStore, (state) => state.filter);
  const setFilter = useStore(transferStore, (state) => state.setFilter);
  const setPanelOpen = useStore(transferStore, (state) => state.setPanelOpen);

  const cancelTransfer = async (transferId: string) => {
    if (!host.isAvailable()) {
      toast.error("Cancel transfer is unavailable in this build. Restart HyperShell.");
      return;
    }

    try {
      await host.sftp.transferCancel({ transferId });
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to cancel transfer"));
    }
  };

  const pauseTransfer = async (transferId: string) => {
    if (!host.isAvailable()) {
      toast.error("Pause transfer is unavailable in this build. Restart HyperShell.");
      return;
    }

    try {
      await host.sftp.transferPause({ transferId });
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to pause transfer"));
    }
  };

  const resumeTransfer = async (transferId: string) => {
    if (!host.isAvailable()) {
      toast.error("Resume transfer is unavailable in this build. Restart HyperShell.");
      return;
    }

    try {
      await host.sftp.transferResume({ transferId });
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to resume transfer"));
    }
  };

  const retryTransfer = async (transferId: string) => {
    try {
      await host.sftp.transferRetry({ transferId });
      toast.success("Transfer resumed");
    } catch (err) {
      toast.error(toErrorMessage(err, "Resume failed"));
    }
  };

  if (usePopupTransferMonitor && !embedded) {
    return null;
  }

  const filteredTransfers =
    filter === "all"
      ? transfers
      : filter === "active"
        ? transfers.filter(
            (transfer) =>
              transfer.status === "queued" ||
              transfer.status === "active" ||
              transfer.status === "paused"
          )
        : transfers.filter((transfer) => transfer.status === filter);

  if (!embedded && !panelOpen) {
    return attentionCount > 0 ? (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="flex items-center gap-2 border-t border-base-700 bg-base-900 px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
      >
        {t("Transfers ({count} need attention)").replace("{count}", String(attentionCount))}
      </button>
    ) : null;
  }

  return (
    <div className={`flex min-h-0 flex-col bg-base-900 ${embedded ? "h-full" : "max-h-[260px] border-t border-base-700"}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-base-700 px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary">{t("Transfers")}</span>
          <div className="flex gap-1 text-xs">
            {(["all", "active", "completed", "failed", "interrupted"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`rounded px-2 py-0.5 ${
                  filter === option
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t(option === "all" ? "All" : option.charAt(0).toUpperCase() + option.slice(1))}
              </button>
            ))}
          </div>
        </div>

        {!embedded && (
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="text-sm text-text-secondary hover:text-text-primary"
            title={t("Close transfer panel")}
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {filteredTransfers.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-text-secondary">{t("No transfers")}</div>
        ) : (
          filteredTransfers.map((transfer) => {
            const hasConflict = conflictIds.has(transfer.transferId);
            const controls = transferRowControls(transfer, hasConflict);
            return (
            <div
              key={transfer.transferId}
              className="flex items-center gap-3 border-b border-base-800 px-3 py-1.5 text-sm"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  transfer.status === "active"
                    ? "bg-blue-400"
                    : transfer.status === "completed"
                      ? "bg-green-400"
                      : transfer.status === "failed"
                        ? "bg-red-400"
                        : "bg-yellow-400"
                }`}
              />

              <span className="w-6 shrink-0 text-xs text-text-secondary">
                {transfer.type === "upload" ? "UP" : "DN"}
              </span>

              <span className="flex-1 truncate text-text-primary" title={transfer.remotePath}>
                {transfer.remotePath.split("/").pop() || transfer.remotePath}
              </span>

              {transfer.status === "active" && (
                <>
                  <span className="text-xs text-text-secondary">
                    {formatFileSize(transfer.speed)}/s
                  </span>
                  <div className="h-1.5 w-24 overflow-hidden rounded bg-base-700">
                    <div
                      className="h-full rounded bg-accent transition-all"
                      style={{
                        width: `${percentage(
                          transfer.bytesTransferred,
                          transfer.totalBytes
                        )}%`
                      }}
                    />
                  </div>
                </>
              )}

              <span className="w-20 text-right text-xs text-text-secondary">
                {formatFileSize(transfer.bytesTransferred)} / {formatFileSize(transfer.totalBytes)}
              </span>

              {transfer.status === "interrupted" && (
                <span className="text-xs text-yellow-400">{t("Interrupted")}</span>
              )}

              {controls.retry && (
                <button
                  type="button"
                  onClick={() => {
                    void retryTransfer(transfer.transferId);
                  }}
                  className="rounded px-2 py-0.5 text-xs text-blue-400 hover:bg-blue-900/30"
                >
                  {t("Resume")}
                </button>
              )}

              {controls.conflict && (
                <TransferConflictActions
                  transferId={transfer.transferId}
                  onResolve={(id, resolution, applyToAll) => resolveTransferConflict(host, id, resolution, applyToAll)}
                />
              )}

              {(controls.pause || controls.resume || controls.cancel) && (
                <div className="flex items-center gap-2">
                  {controls.pause && (
                    <button
                      type="button"
                      className="text-xs text-text-secondary hover:text-amber-300"
                      onClick={() => {
                        void pauseTransfer(transfer.transferId);
                      }}
                    >
                      Pause
                    </button>
                  )}
                  {controls.resume && (
                    <button
                      type="button"
                      className="text-xs text-text-secondary hover:text-emerald-300"
                      onClick={() => {
                        void resumeTransfer(transfer.transferId);
                      }}
                    >
                      Resume
                    </button>
                  )}
                  {controls.cancel && (
                    <button
                      type="button"
                      className="text-xs text-text-secondary hover:text-red-400"
                      onClick={() => {
                        void cancelTransfer(transfer.transferId);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}

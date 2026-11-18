import type { TransferConflictResolution } from "../resolveTransferConflict";
import { useSftpI18n } from "../hostServices";

export interface TransferConflictActionsProps {
  transferId: string;
  onResolve: (
    transferId: string,
    resolution: TransferConflictResolution,
    applyToAll: boolean
  ) => void;
}

const SINGLE_ACTIONS: Array<{ label: string; resolution: TransferConflictResolution }> = [
  { label: "Overwrite", resolution: "overwrite" },
  { label: "Skip", resolution: "skip" },
  { label: "Rename", resolution: "rename" }
];

const ALL_ACTIONS: Array<{ label: string; resolution: TransferConflictResolution }> = [
  { label: "Overwrite all", resolution: "overwrite" },
  { label: "Skip all", resolution: "skip" }
];

/**
 * Conflict resolution row shared by both transfer monitors. The popup and the
 * inline panel must offer identical choices — a conflict raised while one is
 * hidden has to stay resolvable in the other.
 */
export function TransferConflictActions({ transferId, onResolve }: TransferConflictActionsProps) {
  const { t } = useSftpI18n();
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[10px] font-medium text-text-secondary">{t("File exists:")}</span>

      {SINGLE_ACTIONS.map(({ label, resolution }) => (
        <button
          key={label}
          type="button"
          className="focus-ring rounded border border-border-bright bg-base-750 px-2 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-accent/60 hover:bg-accent/10"
          onClick={() => onResolve(transferId, resolution, false)}
        >
          {t(label)}
        </button>
      ))}

      <span className="mx-0.5 text-[10px] text-text-muted">|</span>

      {ALL_ACTIONS.map(({ label, resolution }) => (
        <button
          key={label}
          type="button"
          className="focus-ring rounded border border-warning/50 bg-base-750 px-2 py-1 text-[11px] font-medium text-text-primary transition-colors hover:border-warning hover:bg-warning/10"
          onClick={() => onResolve(transferId, resolution, true)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

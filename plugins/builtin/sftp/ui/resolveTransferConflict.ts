import { toast } from "sonner";

import { refreshTransfers } from "./transferEventCoordinator";
import { toErrorMessage } from "./utils/errorUtils";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

export type TransferConflictResolution = "overwrite" | "skip" | "rename";

/**
 * Send a conflict decision to the backend. Shared by both transfer monitors —
 * a conflict raised while one is hidden has to stay resolvable in the other,
 * so neither may own this logic privately.
 */
export function resolveTransferConflict(
  host: PluginUiHostServices,
  transferId: string,
  resolution: TransferConflictResolution,
  applyToAll: boolean
): void {
  void (async () => {
    try {
      await host.sftp.transferResolveConflict({
        transferId,
        resolution,
        applyToAll
      });
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to resolve conflict"));
    } finally {
      void refreshTransfers();
    }
  })();
}

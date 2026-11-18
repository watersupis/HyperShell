import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { ConnectionHistoryOverlay } from "./ConnectionHistoryDialog";
import { HostImportOverlay } from "./host-management/HostImportOverlay";

export function SshPluginOverlay({ host }: { host: PluginUiHostServices }) {
  return (
    <>
      <ConnectionHistoryOverlay host={host} />
      <HostImportOverlay host={host} />
    </>
  );
}

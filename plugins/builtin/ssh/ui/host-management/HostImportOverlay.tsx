import { useStore } from "zustand";
import { toast } from "sonner";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { hostImportStore } from "./hostImportStore";
import { SshConfigImportDialog } from "./SshConfigImportDialog";
import { PuttyImportDialog } from "./PuttyImportDialog";
import { SshManagerImportDialog } from "./SshManagerImportDialog";
import { puttySessionToHost, sshConfigImportToHost } from "./hostImportMapping";

export function HostImportOverlay({ host }: { host: PluginUiHostServices }) {
  const activeImport = useStore(hostImportStore, (state) => state.open);
  const close = () => hostImportStore.getState().close();

  const importSshConfig = async (items: Parameters<typeof sshConfigImportToHost>[0][]) => {
    try {
      await Promise.all(items.map((item, index) => host.hostManagement.hosts.upsert(
        sshConfigImportToHost(item, `imported-${crypto.randomUUID()}-${index}`),
      )));
      toast.success(`Imported ${items.length} SSH host${items.length === 1 ? "" : "s"}`);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import SSH config.");
    }
  };

  const importPutty = async (sessions: Parameters<typeof puttySessionToHost>[0][]) => {
    try {
      await Promise.all(sessions.map((session, index) => host.hostManagement.hosts.upsert(
        puttySessionToHost(session, `putty-${crypto.randomUUID()}-${index}`),
      )));
      toast.success(`Imported ${sessions.length} PuTTY session${sessions.length === 1 ? "" : "s"}`);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import PuTTY sessions.");
    }
  };

  return (
    <>
      <SshConfigImportDialog host={host} open={activeImport === "ssh-config"} onClose={close} onImport={(items) => void importSshConfig(items)} />
      <PuttyImportDialog host={host} open={activeImport === "putty"} onClose={close} onImport={(sessions) => void importPutty(sessions)} />
      <SshManagerImportDialog host={host} open={activeImport === "ssh-manager"} onClose={close} onImported={close} />
    </>
  );
}

import { lazy, Suspense } from "react";
import { useStore } from "zustand";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { localTerminalUiStore } from "./uiStore";

const LocalProfileForm = lazy(() =>
  import("./LocalProfileForm").then((module) => ({ default: module.LocalProfileForm }))
);

export function LocalTerminalOverlay({ host }: { host: PluginUiHostServices }) {
  const Modal = host.Modal;
  const open = useStore(localTerminalUiStore, (state) => state.profileDialogOpen);
  const profile = useStore(localTerminalUiStore, (state) => state.editingProfile);
  const envVars = useStore(localTerminalUiStore, (state) => state.editingProfileEnvVars);
  const envVarsLoaded = useStore(localTerminalUiStore, (state) => state.editingProfileEnvVarsLoaded);
  const close = localTerminalUiStore.getState().closeProfileDialog;

  return (
    <Modal
      open={open}
      onClose={close}
      title={profile ? `Edit ${profile.name}` : "New Local Profile"}
    >
      {open && (
        <Suspense fallback={null}>
          <LocalProfileForm
            host={host}
            key={profile?.id ?? "new-local"}
            profile={profile}
            envVars={envVars}
            envVarsLoaded={envVarsLoaded}
            onSave={close}
            onCancel={close}
            onDelete={close}
          />
        </Suspense>
      )}
    </Modal>
  );
}

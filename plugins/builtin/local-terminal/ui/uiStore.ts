import { createStore } from "zustand/vanilla";
import type { LocalProfileEnvVar, LocalProfileRecord } from "@hypershell/shared";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

interface LocalTerminalUiState {
  profileDialogOpen: boolean;
  editingProfile: LocalProfileRecord | null;
  editingProfileEnvVars: LocalProfileEnvVar[];
  editingProfileEnvVarsLoaded: boolean;
  createProfile: () => void;
  editProfile: (host: Pick<PluginUiHostServices, "localProfiles">, profile: LocalProfileRecord) => Promise<void>;
  closeProfileDialog: () => void;
}

let editRequestId = 0;

export const localTerminalUiStore = createStore<LocalTerminalUiState>()((set) => ({
  profileDialogOpen: false,
  editingProfile: null,
  editingProfileEnvVars: [],
  editingProfileEnvVarsLoaded: true,
  createProfile: () => {
    editRequestId += 1;
    set({
      profileDialogOpen: true,
      editingProfile: null,
      editingProfileEnvVars: [],
      editingProfileEnvVarsLoaded: true,
    });
  },
  editProfile: async (host, profile) => {
    const requestId = ++editRequestId;
    let envVars: LocalProfileEnvVar[] = [];
    let loaded = false;
    try {
      const result = await host.localProfiles.getEnvVars(profile.id);
      if (result) {
        envVars = result;
        loaded = true;
      }
    } catch {
      // Avoid overwriting environment variables that were not loaded.
    }
    if (requestId !== editRequestId) return;
    set({
      profileDialogOpen: true,
      editingProfile: profile,
      editingProfileEnvVars: envVars,
      editingProfileEnvVarsLoaded: loaded,
    });
  },
  closeProfileDialog: () => {
    editRequestId += 1;
    set({ profileDialogOpen: false });
  },
}));

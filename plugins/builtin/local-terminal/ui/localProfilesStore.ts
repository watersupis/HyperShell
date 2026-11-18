import { createStore } from "zustand/vanilla";
import { toast } from "sonner";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import type {
  LocalProfileRecord,
  UpsertLocalProfileRequest
} from "@hypershell/shared";

export type LocalProfilesState = {
  profiles: LocalProfileRecord[];
  loading: boolean;
  load: (host: Pick<PluginUiHostServices, "localProfiles">) => Promise<void>;
  save: (host: Pick<PluginUiHostServices, "localProfiles">, input: UpsertLocalProfileRequest) => Promise<void>;
  remove: (host: Pick<PluginUiHostServices, "localProfiles">, id: string) => Promise<void>;
  setHidden: (host: Pick<PluginUiHostServices, "localProfiles">, id: string, hidden: boolean) => Promise<void>;
  reorder: (host: Pick<PluginUiHostServices, "localProfiles">, items: Array<{ id: string; sortOrder: number }>) => Promise<void>;
  rescan: (host: Pick<PluginUiHostServices, "localProfiles">) => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Profiles the user can actually launch — hidden and missing shells are excluded. */
export function selectLaunchableProfiles(
  profiles: LocalProfileRecord[]
): LocalProfileRecord[] {
  return profiles.filter((profile) => !profile.isHidden && profile.isAvailable);
}

export const localProfilesStore = createStore<LocalProfilesState>()((set, get) => ({
  profiles: [],
  loading: false,

  load: async (host) => {
    set({ loading: true });
    try {
      set({ profiles: await host.localProfiles.list(), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  save: async (host, input) => {
    await host.localProfiles.upsert(input);
    await get().load(host);
  },

  remove: async (host, id) => {
    await host.localProfiles.remove(id);
    await get().load(host);
  },

  // These three are fired as `void store.setHidden(...)` from the sidebar, so
  // a rejection here would be an unhandled promise rejection the user never
  // sees. Report it and reload, which also rolls the optimistic-looking UI
  // back to whatever the main process actually has.
  setHidden: async (host, id, hidden) => {
    try {
      await host.localProfiles.setHidden(id, hidden);
    } catch (error) {
      toast.error(`Failed to ${hidden ? "hide" : "unhide"} profile: ${errorMessage(error)}`);
    }
    await get().load(host);
  },

  reorder: async (host, items) => {
    try {
      await host.localProfiles.reorder(items);
    } catch (error) {
      toast.error(`Failed to reorder profiles: ${errorMessage(error)}`);
    }
    await get().load(host);
  },

  rescan: async (host) => {
    try {
      const profiles = await host.localProfiles.rescan();
      if (profiles) {
        set({ profiles });
      }
    } catch (error) {
      toast.error(`Failed to rescan local shells: ${errorMessage(error)}`);
    }
  }
}));

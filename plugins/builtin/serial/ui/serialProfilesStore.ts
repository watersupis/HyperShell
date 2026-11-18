import { create } from "zustand";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import type { SerialProfileRecord, UpsertSerialProfileRequest } from "@hypershell/shared";

interface SerialProfilesState {
  profiles: SerialProfileRecord[];
  loading: boolean;
  loaded: boolean;
  load(host: Pick<PluginUiHostServices, "serialProfiles">): Promise<void>;
  upsert(host: Pick<PluginUiHostServices, "serialProfiles">, profile: UpsertSerialProfileRequest): Promise<SerialProfileRecord>;
  remove(host: Pick<PluginUiHostServices, "serialProfiles">, id: string): Promise<void>;
}

function notifyContributionsChanged(): void {
  window.dispatchEvent(new Event("hypershell:plugin-commands-changed"));
}

export const serialProfilesStore = create<SerialProfilesState>((set) => ({
  profiles: [],
  loading: false,
  loaded: false,
  async load(host) {
    set({ loading: true });
    try {
      const profiles = await host.serialProfiles.list();
      set({ profiles: profiles ?? [], loading: false, loaded: true });
      notifyContributionsChanged();
    } catch (error) {
      set({ loading: false, loaded: true });
      throw error;
    }
  },
  async upsert(host, profile) {
    const saved = await host.serialProfiles.upsert(profile);
    set((state) => ({
      profiles: state.profiles.some((item) => item.id === saved.id)
        ? state.profiles.map((item) => item.id === saved.id ? saved : item)
        : [...state.profiles, saved],
    }));
    notifyContributionsChanged();
    return saved;
  },
  async remove(host, id) {
    await host.serialProfiles.remove({ id });
    set((state) => ({ profiles: state.profiles.filter((item) => item.id !== id) }));
    notifyContributionsChanged();
  },
}));

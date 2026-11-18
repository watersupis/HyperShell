import type { PluginUiHostServices } from "@hypershell/plugin-api";

export const localTerminalTestHost = {
  localProfiles: {
    list: async () => [],
    upsert: async () => ({}) as never,
    remove: async () => {},
    setHidden: async () => {},
    reorder: async () => {},
    rescan: async () => [],
    getEnvVars: async () => [],
  },
} as Pick<PluginUiHostServices, "localProfiles">;

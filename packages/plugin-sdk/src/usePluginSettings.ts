import { useSyncExternalStore } from "react";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

export type PluginSettings = Readonly<Record<string, unknown>>;

export function usePluginSettings(host: PluginUiHostServices, pluginId: string) {
  const settings = useSyncExternalStore(
    host.settings.subscribe,
    () => host.settings.getPlugin(pluginId),
    () => host.settings.getPlugin(pluginId)
  );

  return {
    settings,
    update: (partial: Readonly<Record<string, unknown>>) =>
      host.settings.updatePlugin(pluginId, partial),
  };
}

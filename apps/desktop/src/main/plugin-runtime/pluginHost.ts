import type { PluginModule } from "@hypershell/plugin-api";

export type { PluginModule } from "@hypershell/plugin-api";

export function activateEnabledPlugins(
  modules: readonly PluginModule[],
  enabledPluginIds: ReadonlySet<string>
): () => void {
  const disposers = modules.flatMap((plugin) => {
    if (!enabledPluginIds.has(plugin.id)) return [];
    const dispose = plugin.activate();
    return dispose ? [dispose] : [];
  });

  return () => disposers.forEach((dispose) => dispose());
}

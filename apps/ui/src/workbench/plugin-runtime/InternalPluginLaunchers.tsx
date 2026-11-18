import { Suspense } from "react";
import type { PluginTabRequest } from "@hypershell/plugin-api";
import { internalPlugins } from "./internalPluginRegistry";
import { internalPluginUiHostServices } from "./internalPluginUiHostServices";

export function InternalPluginLaunchers({
  enabledPluginIds,
  surface,
  openTab,
}: {
  enabledPluginIds: ReadonlySet<string>;
  surface: "welcome" | "tabbar";
  openTab: (tab: PluginTabRequest) => void;
}) {
  return internalPlugins.map((plugin) => {
    const Launcher = plugin.workspaceLauncher;
    if (!Launcher || !enabledPluginIds.has(plugin.id)) return null;
    return (
      <Suspense key={plugin.id} fallback={null}>
        <Launcher surface={surface} openTab={openTab} host={internalPluginUiHostServices} />
      </Suspense>
    );
  });
}

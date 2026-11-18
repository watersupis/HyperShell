import { Suspense } from "react";
import type { PluginTabRequest } from "@hypershell/plugin-api";
import { internalPlugins } from "./internalPluginRegistry";
import { internalPluginUiHostServices } from "./internalPluginUiHostServices";

export function InternalPluginSidebarContributions({
  enabledPluginIds,
  openTab,
}: {
  enabledPluginIds: ReadonlySet<string>;
  openTab: (tab: PluginTabRequest) => void;
}) {
  return internalPlugins.map((plugin) => {
    const Contribution = plugin.sidebarContribution;
    if (!Contribution || !enabledPluginIds.has(plugin.id)) return null;
    return (
      <Suspense key={plugin.id} fallback={null}>
        <Contribution openTab={openTab} host={internalPluginUiHostServices} />
      </Suspense>
    );
  });
}

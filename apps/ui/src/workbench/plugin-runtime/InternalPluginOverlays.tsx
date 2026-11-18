import { Suspense } from "react";
import { internalPlugins } from "./internalPluginRegistry";
import { internalPluginUiHostServices } from "./internalPluginUiHostServices";

export function InternalPluginOverlays({ enabledPluginIds }: { enabledPluginIds: ReadonlySet<string> }) {
  return internalPlugins.map((plugin) => {
    const Overlay = plugin.overlay;
    if (!Overlay || !enabledPluginIds.has(plugin.id)) return null;
    return (
      <Suspense key={plugin.id} fallback={null}>
        <Overlay host={internalPluginUiHostServices} />
      </Suspense>
    );
  });
}

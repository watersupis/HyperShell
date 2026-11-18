import { Suspense, useMemo } from "react";
import { useStore } from "zustand";
import { useI18n } from "../shared/i18n";
import { WorkbenchPanel, type WorkbenchPanelView } from "../panel/WorkbenchPanel";
import { pluginPanelViewId, useWorkbenchPanelStore } from "../panel/panelStore";
import { internalPluginUiHostServices } from "./internalPluginUiHostServices";
import { getInternalPluginPanelViews } from "./internalPluginRegistry";
import { SandboxedPluginFrame } from "./SandboxedPluginFrame";
import type { WorkspacePluginContribution } from "./useWorkspacePluginContributions";

export function PluginWorkbenchPanel({
  enabledInternalPluginIds,
  externalPlugins,
  pluginsLoaded,
}: {
  enabledInternalPluginIds: ReadonlySet<string>;
  externalPlugins: WorkspacePluginContribution[];
  pluginsLoaded: boolean;
}) {
  const { t } = useI18n();
  const viewContexts = useStore(useWorkbenchPanelStore, (state) => state.viewContexts);
  const close = useWorkbenchPanelStore((state) => state.close);
  const views = useMemo<WorkbenchPanelView[]>(() => {
    const builtInViews = getInternalPluginPanelViews(enabledInternalPluginIds).map((view) => {
      const View = view.component;
      return {
        id: view.id,
        title: view.title,
        content: (
          <Suspense fallback={<div className="p-3 text-xs text-text-muted">{t("Loading plugin")}</div>}>
            <View host={internalPluginUiHostServices} />
          </Suspense>
        ),
      };
    });
    const externalViews = externalPlugins.map((plugin) => ({
      id: pluginPanelViewId(plugin.id),
      title: plugin.name,
      content: (
        <SandboxedPluginFrame
          key={`${plugin.id}:${viewContexts[pluginPanelViewId(plugin.id)]?.hostId ?? ""}`}
          pluginId={plugin.id}
          hostId={viewContexts[pluginPanelViewId(plugin.id)]?.hostId}
          surface="workspace.panel"
          onClose={close}
          fill
          showHeader={false}
        />
      ),
    }));
    return [...builtInViews, ...externalViews];
  }, [close, enabledInternalPluginIds, externalPlugins, t, viewContexts]);

  return <WorkbenchPanel views={views} loading={!pluginsLoaded} />;
}

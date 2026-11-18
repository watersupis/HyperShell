import { useEffect, useMemo, useState } from "react";
import { layoutStore, resolveTabTitle, type LayoutTab } from "../editor-area/layoutStore";
import { sessionInputRouterStore } from "./sessionInputRouter";
import { getInternalPluginForTab, isPluginWorkspaceTab } from "./internalPluginRegistry";
import { pluginUiSlots } from "../slots/pluginUiSlots";
import { useSecondarySidebarStore } from "./secondarySidebarStore";
import { getShell } from "../shared/shell";

interface ListedPlugin {
  grantedPermissions: string[];
  manifest: {
    id: string;
    name: string;
    ui?: {
      slots?: string[];
      placement?: string;
      workspaceToolbar?: boolean;
    };
  };
}

export interface WorkspacePluginContribution {
  id: string;
  name: string;
  slots: string[];
  placement: string;
  workspaceToolbar: boolean;
}

export function toWorkspacePluginContribution(plugin: ListedPlugin): WorkspacePluginContribution {
  return {
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    slots: plugin.manifest.ui?.slots ?? [plugin.manifest.ui?.placement ?? pluginUiSlots.workspaceTab],
    placement: plugin.manifest.ui?.placement ?? pluginUiSlots.workspaceTab,
    workspaceToolbar: plugin.manifest.ui?.workspaceToolbar === true,
  };
}

export function closeUninstalledExternalPluginTabs(
  installedPluginIds: ReadonlySet<string>,
  layout: Pick<ReturnType<typeof layoutStore.getState>, "tabs" | "panes" | "closeTabInPane"> = layoutStore.getState()
): void {
  const removedTabs = layout.tabs.filter(
    (tab) => tab.type === "plugin" && !getInternalPluginForTab(tab) && tab.pluginId && !installedPluginIds.has(tab.pluginId)
  );
  for (const tab of removedTabs) {
    for (const pane of layout.panes) {
      layout.closeTabInPane(tab.sessionId, pane.paneId);
    }
  }
}

export function useWorkspacePluginContributions(tabs: LayoutTab[]) {
  const [plugins, setPlugins] = useState<WorkspacePluginContribution[]>([]);
  const [pluginsLoaded, setPluginsLoaded] = useState(false);
  const pluginPanel = useSecondarySidebarStore((state) => state.plugin);
  const sessionTargets = useMemo(
    () => tabs.filter((tab) => !isPluginWorkspaceTab(tab)).map((tab) => ({ id: tab.sessionId, name: resolveTabTitle(tab) })),
    [tabs]
  );

  useEffect(() => {
    sessionInputRouterStore.getState().cleanTargets(sessionTargets.map((session) => session.id));
  }, [sessionTargets]);

  useEffect(() => {
    let cancelled = false;
    const reconcile = (listedPlugins: ListedPlugin[]) => {
      setPlugins(listedPlugins.map(toWorkspacePluginContribution));
      closeUninstalledExternalPluginTabs(
        new Set(listedPlugins.map((plugin) => plugin.manifest.id))
      );
      sessionInputRouterStore.getState().cleanOwners(
        listedPlugins
          .filter((plugin) => plugin.grantedPermissions.includes("sessions.broadcast"))
          .map((plugin) => plugin.manifest.id)
      );
      const panelTarget = useSecondarySidebarStore.getState().plugin;
      if (panelTarget?.source === "external" && !listedPlugins.some((plugin) => plugin.manifest.id === panelTarget.pluginId)) {
        useSecondarySidebarStore.getState().closePlugin();
      }
    };
    const refresh = () => {
      setPluginsLoaded(false);
      const listPlugins = getShell().pluginsList;
      void listPlugins()
        .then((listedPlugins) => {
          if (!cancelled) {
            reconcile(listedPlugins);
            setPluginsLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPlugins([]);
            sessionInputRouterStore.getState().cleanOwners([]);
            setPluginsLoaded(true);
          }
        });
    };

    refresh();
    window.addEventListener("hypershell:plugins-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("hypershell:plugins-changed", refresh);
    };
  }, []);

  const toolbarPlugins = useMemo(() => plugins.filter((plugin) => plugin.workspaceToolbar), [plugins]);
  const panelPlugins = useMemo(() => plugins.filter((plugin) => plugin.slots.includes(pluginUiSlots.panel)), [plugins]);
  const activeHeaderPlugin = pluginPanel?.source === "external"
    ? plugins.find((plugin) => plugin.id === pluginPanel.pluginId && plugin.slots.includes(pluginUiSlots.workspaceHeader))
    : undefined;

  return { plugins, toolbarPlugins, panelPlugins, pluginsLoaded, activeHeaderPlugin, pluginPanel, sessionTargets };
}

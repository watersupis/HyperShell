export const pluginUiSlots = {
  navigation: "sidebar.navigation",
  terminalToolbar: "terminal.toolbar",
  workspaceToolbar: "workspace.toolbar",
  workspaceTab: "workspace.tab",
  secondarySidebar: "workspace.secondarySidebar",
  panel: "workspace.panel",
  workspaceHeader: "workspace.header",
} as const;

export const pluginViewSlots: readonly string[] = [
  pluginUiSlots.workspaceTab,
  pluginUiSlots.secondarySidebar,
  pluginUiSlots.panel,
  pluginUiSlots.workspaceHeader,
];

export type PluginWorkspacePlacement = typeof pluginUiSlots.workspaceTab | typeof pluginUiSlots.secondarySidebar | typeof pluginUiSlots.panel;
export type PluginWorkspaceViewSlot = PluginWorkspacePlacement | typeof pluginUiSlots.workspaceHeader;

export interface PluginNavigationEntry {
  id: string;
  name: string;
  version: string;
  placement: PluginWorkspacePlacement;
  hostContextMenu: boolean;
}

import type { PluginUiContribution } from "@hypershell/plugin-api";

export const quickCommandCenterUiContribution: PluginUiContribution = {
  id: "com.hypershell.quick-command-center",
  loadSecondarySidebarView: () =>
    import("./ui/QuickCommandCenter").then((module) => ({ default: module.QuickCommandCenter })),
  loadWorkspaceToolbarButton: () =>
    import("./ui/QuickCommandCenterToolbarButton").then((module) => ({ default: module.QuickCommandCenterToolbarButton })),
  getCommands: ({ openSecondarySidebar }) => [{
    id: "quick-command-center.open",
    title: "Open Quick Command Center",
    category: "Tools",
    visible: () => true,
    execute: () => openSecondarySidebar("com.hypershell.quick-command-center", "Quick Command Center"),
    keywords: ["commands", "snippets", "terminal", "shortcuts"],
  }],
};

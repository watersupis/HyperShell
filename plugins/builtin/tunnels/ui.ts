import type { PluginUiContribution } from "@hypershell/plugin-api";

export const tunnelsUiContribution: PluginUiContribution = {
  id: "tunnels",
  loadSecondarySidebarView: () =>
    import("./ui/TunnelManagerPanel").then((module) => ({ default: module.TunnelManagerPanel })),
  loadWorkspaceToolbarButton: () =>
    import("./ui/TunnelsToolbarButton").then((module) => ({ default: module.TunnelsToolbarButton })),
  getCommands: ({ openSecondarySidebar }) => [{
    id: "tunnels.open-manager",
    title: "Open Tunnel Manager",
    category: "Tunnels",
    visible: () => true,
    execute: () => openSecondarySidebar("tunnels", "Tunnels"),
    keywords: ["port forwarding", "ssh", "forward"],
  }],
};

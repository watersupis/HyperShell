export interface BuiltinPluginDefinition {
  id: string;
  title: string;
  description: string;
  rendererEntry: string;
  ipcOwner: string;
  kind: "core" | "optional";
  featureIds: readonly string[];
  transports?: readonly string[];
  legacyTabTypes?: readonly string[];
}

export const builtinPluginCatalog: readonly BuiltinPluginDefinition[] = [
  {
    id: "ssh",
    title: "SSH",
    description: "Connect to remote hosts with interactive SSH terminals.",
    rendererEntry: "workbench/editor-area/terminal/TerminalPane",
    ipcOwner: "ssh",
    kind: "core",
    featureIds: ["sshTransport", "hosts"],
    transports: ["ssh"],
  },
  {
    id: "sftp",
    title: "SFTP",
    description: "Browse, transfer, synchronize, and edit remote files.",
    rendererEntry: "plugins/builtin/sftp/ui/SftpTab",
    ipcOwner: "sftp",
    kind: "optional",
    featureIds: ["sftp"],
    transports: ["sftp"],
    legacyTabTypes: ["sftp"],
  },
  {
    id: "local-terminal",
    title: "Local Terminal",
    description: "Launch local shells and WSL distributions.",
    rendererEntry: "workbench/editor-area/terminal/TerminalPane",
    ipcOwner: "local-terminal",
    kind: "optional",
    featureIds: ["localProfiles", "localShellTransport"],
    transports: ["local"],
  },
  {
    id: "serial",
    title: "Serial",
    description: "Connect to serial ports and manage serial profiles.",
    rendererEntry: "plugins/builtin/serial/ui/SerialSidebar",
    ipcOwner: "serial",
    kind: "optional",
    featureIds: ["serialProfiles", "serialTransport"],
    transports: ["serial"],
  },
  {
    id: "recording",
    title: "Session Recording",
    description: "Record terminal sessions and browse or replay saved recordings.",
    rendererEntry: "plugins/builtin/session-recording/ui/RecordingPluginContribution",
    ipcOwner: "recording",
    kind: "core",
    featureIds: ["sessionRecording"],
  },
  {
    id: "tunnels",
    title: "Tunnels",
    description: "Create and manage SSH port forwards.",
    rendererEntry: "plugins/builtin/tunnels/ui/TunnelManagerPanel",
    ipcOwner: "tunnels",
    kind: "optional",
    featureIds: ["portForward"],
  },
  {
    id: "com.hypershell.quick-command-center",
    title: "Quick Command Center",
    description: "Manage reusable commands and send them to terminal sessions.",
    rendererEntry: "plugins/builtin/quick-command-center/ui/QuickCommandCenter",
    ipcOwner: "com.hypershell.quick-command-center",
    kind: "optional",
    featureIds: ["quickCommandCenter"],
  },
];

export function getBuiltinPluginDefinition(id: string): BuiltinPluginDefinition | undefined {
  return builtinPluginCatalog.find((plugin) => plugin.id === id);
}

export function isBuiltinPluginTab(tab: { pluginId?: string; type?: string }): boolean {
  return builtinPluginCatalog.some((plugin) =>
    tab.pluginId === plugin.id || Boolean(tab.type && plugin.legacyTabTypes?.includes(tab.type))
  );
}

import type { Command } from "./searchCommands";

export type CommandContext = {
  // Layout
  getActiveSessionId: () => string | null;
  getPaneCount: () => number;
  splitPane: (direction: "horizontal" | "vertical") => void;
  closePane: () => void;
  activatePrevPane: () => void;
  activateNextPane: () => void;
  // Navigation
  openSettings: () => void;
  // Host
  openQuickConnect: () => void;
  openHostModal: () => void;
  getActiveHost: () => { id: string; name: string } | null;
  // Session
  hasActiveSession: () => boolean;
  disconnectActiveSession: () => void;
  reconnectActiveSession: () => void;
  // Workspace
  openWorkspaceMenu: () => void;
  // Backup
  createBackup: () => void;
  restoreBackup: () => void;
  // SSH Keys
  openKeyManager: () => void;
  // Dev/Debug
  reloadWindow: () => void;
  // Telnet
  openTelnetDialog: () => void;
};

export function createCommands(ctx: CommandContext): Command[] {
  return [
    // --- Navigation ---
    {
      id: "nav.settings",
      title: "Open Settings",
      category: "Navigation",
      shortcut: "Ctrl+,",
      visible: () => true,
      execute: () => ctx.openSettings(),
      keywords: ["preferences", "config", "options"],
    },
    // --- Layout ---
    {
      id: "layout.split-horizontal",
      title: "Split Pane Horizontal",
      category: "Layout",
      shortcut: "Ctrl+Shift+D",
      visible: () => ctx.getActiveSessionId() !== null,
      execute: () => ctx.splitPane("horizontal"),
    },
    {
      id: "layout.split-vertical",
      title: "Split Pane Vertical",
      category: "Layout",
      shortcut: "Ctrl+Shift+E",
      visible: () => ctx.getActiveSessionId() !== null,
      execute: () => ctx.splitPane("vertical"),
    },
    {
      id: "layout.close-pane",
      title: "Close Pane",
      category: "Layout",
      shortcut: "Ctrl+Shift+W",
      visible: () => ctx.getPaneCount() > 1,
      execute: () => ctx.closePane(),
    },
    {
      id: "layout.prev-pane",
      title: "Previous Pane",
      category: "Layout",
      shortcut: "Ctrl+Shift+[",
      visible: () => ctx.getPaneCount() > 1,
      execute: () => ctx.activatePrevPane(),
    },
    {
      id: "layout.next-pane",
      title: "Next Pane",
      category: "Layout",
      shortcut: "Ctrl+Shift+]",
      visible: () => ctx.getPaneCount() > 1,
      execute: () => ctx.activateNextPane(),
    },

    // --- Session ---
    {
      id: "session.disconnect",
      title: "Disconnect Active Session",
      category: "Session",
      visible: () => ctx.hasActiveSession(),
      execute: () => ctx.disconnectActiveSession(),
      keywords: ["close", "end", "stop"],
    },
    {
      id: "session.reconnect",
      title: "Reconnect Active Session",
      category: "Session",
      visible: () => ctx.hasActiveSession(),
      execute: () => ctx.reconnectActiveSession(),
      keywords: ["retry", "reopen"],
    },

    // --- Host ---
    {
      id: "host.connect",
      title: "Connect to Host...",
      category: "Host",
      shortcut: "Ctrl+K",
      visible: () => true,
      execute: () => ctx.openQuickConnect(),
      keywords: ["ssh", "open", "server"],
    },
    {
      id: "host.new",
      title: "New Host",
      category: "Host",
      visible: () => true,
      execute: () => ctx.openHostModal(),
      keywords: ["add", "create"],
    },
    {
      id: "host.telnet",
      title: "Telnet / Raw TCP Connect...",
      category: "Host",
      visible: () => true,
      execute: () => ctx.openTelnetDialog(),
      keywords: ["telnet", "raw", "tcp"],
    },
    // --- Workspace ---
    {
      id: "workspace.manage",
      title: "Manage Workspaces...",
      category: "Workspace",
      visible: () => true,
      execute: () => ctx.openWorkspaceMenu(),
      keywords: ["save", "load", "layout"],
    },

    // --- Backup ---
    {
      id: "backup.create",
      title: "Create Backup",
      category: "Backup",
      visible: () => true,
      execute: () => ctx.createBackup(),
      keywords: ["export", "save", "snapshot"],
    },
    {
      id: "backup.restore",
      title: "Restore Backup...",
      category: "Backup",
      visible: () => true,
      execute: () => ctx.restoreBackup(),
      keywords: ["import", "load", "recover"],
    },

    // --- SSH Keys ---
    {
      id: "keys.manage",
      title: "Manage SSH Keys...",
      category: "SSH Keys",
      visible: () => true,
      execute: () => ctx.openKeyManager(),
      keywords: ["key", "identity", "certificate", "generate", "keygen"],
    },

    // --- Dev/Debug ---
    {
      id: "dev.reload",
      title: "Reload Window",
      category: "Dev/Debug",
      shortcut: "Ctrl+Shift+R",
      visible: () => true,
      execute: () => ctx.reloadWindow(),
      keywords: ["refresh", "restart"],
    },
  ];
}

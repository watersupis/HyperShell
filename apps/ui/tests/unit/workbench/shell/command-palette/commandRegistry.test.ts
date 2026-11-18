import { describe, it, expect, vi } from "vitest";
import { createCommands, type CommandContext } from "../../../../../src/workbench/shell/command-palette/commandRegistry";

function makeMockContext(): CommandContext {
  return {
    getActiveSessionId: () => "session-1",
    getPaneCount: () => 2,
    splitPane: () => {},
    closePane: () => {},
    activatePrevPane: () => {},
    activateNextPane: () => {},
    openSettings: () => {},
    openQuickConnect: () => {},
    openHostModal: () => {},
    getActiveHost: () => null,
    hasActiveSession: () => true,
    disconnectActiveSession: () => {},
    reconnectActiveSession: () => {},
    openWorkspaceMenu: () => {},
    createBackup: () => {},
    restoreBackup: () => {},
    openKeyManager: () => {},
    reloadWindow: () => {},
    openTelnetDialog: () => {},
  };
}

describe("commandRegistry", () => {
  it("creates commands with unique IDs", () => {
    const commands = createCommands(makeMockContext());
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all commands have valid categories", () => {
    const validCategories = [
      "Navigation", "Layout", "Session", "Host",
      "Workspace",
      "Backup", "SSH Keys", "Dev/Debug",
    ];
    const commands = createCommands(makeMockContext());
    for (const cmd of commands) {
      expect(validCategories).toContain(cmd.category);
    }
  });

  it("visible() returns boolean for all commands", () => {
    const commands = createCommands(makeMockContext());
    for (const cmd of commands) {
      expect(typeof cmd.visible()).toBe("boolean");
    }
  });

  it("session commands are hidden when no active session", () => {
    const ctx = makeMockContext();
    ctx.hasActiveSession = () => false;
    ctx.getActiveSessionId = () => null;
    const commands = createCommands(ctx);
    const disconnect = commands.find((c) => c.id === "session.disconnect");
    expect(disconnect?.visible()).toBe(false);
  });

  it("restore backup command calls ctx.restoreBackup", () => {
    const ctx = makeMockContext();
    ctx.restoreBackup = vi.fn();
    const commands = createCommands(ctx);
    const restore = commands.find((c) => c.id === "backup.restore");
    expect(restore).toBeDefined();
    void restore!.execute();
    expect(ctx.restoreBackup).toHaveBeenCalledTimes(1);
  });

  it("create backup command calls ctx.createBackup", () => {
    const ctx = makeMockContext();
    ctx.createBackup = vi.fn();
    const commands = createCommands(ctx);
    const backup = commands.find((c) => c.id === "backup.create");
    expect(backup).toBeDefined();
    void backup!.execute();
    expect(ctx.createBackup).toHaveBeenCalledTimes(1);
  });
});

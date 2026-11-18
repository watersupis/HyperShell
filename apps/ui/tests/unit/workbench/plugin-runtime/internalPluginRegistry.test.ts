import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginHostConnection, PluginUiHostServices } from "@hypershell/plugin-api";
import type { SavedSessionRecord } from "@hypershell/shared";
import { internalPlugins, getInternalPluginCommands, getInternalPluginForTransport, getInternalPluginHostEditor, getInternalPluginHostEditorContribution, getInternalPluginSettingsPages, getInternalPluginSidebarActions, isPluginWorkspaceTab, canRestoreInternalSavedSession, migrateInternalWorkspaceTab, migrateInternalPluginSettings, prepareInternalHostConnection, corePlugins, optionalPlugins } from "../../../../src/workbench/plugin-runtime/internalPluginRegistry";
import { useRecordingStore } from "../../../../../../plugins/builtin/session-recording/ui/recordingStore";
import { localProfilesStore } from "../../../../../../plugins/builtin/local-terminal/ui/localProfilesStore";
import { hostImportStore } from "../../../../../../plugins/builtin/ssh/ui/host-management/hostImportStore";

const commandContext = {
  getActiveHost: () => null,
  hostActions: [],
  openTab: () => {},
  openSecondarySidebar: vi.fn(),
  openPanelView: vi.fn(),
};

describe("internal plugin registry", () => {
  beforeEach(() => {
    useRecordingStore.setState({ libraryOpen: false, playbackRecordingId: null, activeSessionIds: new Set() });
    localProfilesStore.setState({ profiles: [], loading: false });
    hostImportStore.getState().close();
  });

  it("classifies SSH and terminal recording as core and SFTP and local terminal as optional", () => {
    expect(corePlugins.map((plugin) => plugin.id)).toEqual(["ssh", "recording"]);
    expect(optionalPlugins.map((plugin) => plugin.id)).toEqual([
      "sftp",
      "local-terminal",
      "serial",
      "tunnels",
      "com.hypershell.quick-command-center",
    ]);
    expect(internalPlugins.every((plugin) => plugin.featureIds.length > 0)).toBe(true);
  });

  it("contributes a command that opens the recording library", async () => {
    const command = internalPlugins
      .find((plugin) => plugin.id === "recording")
      ?.getCommands?.(commandContext)
      .find((item) => item.id === "recording.library");

    expect(command).toBeDefined();
    await command?.execute();

    expect(useRecordingStore.getState().libraryOpen).toBe(true);
    expect(getInternalPluginCommands(new Set(["recording"]), commandContext).map((item) => item.id)).toContain("recording.library");
    expect(getInternalPluginCommands(new Set(), commandContext).map((item) => item.id)).not.toContain("recording.library");
  });

  it("uses plugin tab presentation for current and legacy plugin tabs", () => {
    const sftp = internalPlugins.find((plugin) => plugin.id === "sftp");
    expect(sftp?.getTabPresentation?.({ sessionId: "sftp-1", pluginId: "sftp" })?.label).toBe("SFTP");
    expect(sftp?.getTabPresentation?.({ sessionId: "sftp-1", type: "sftp" })?.label).toBe("SFTP");
  });

  it("classifies current and legacy plugin tabs without caller-specific checks", () => {
    expect(isPluginWorkspaceTab({ sessionId: "plugin-1", type: "plugin", pluginId: "external.sample" })).toBe(true);
    expect(isPluginWorkspaceTab({ sessionId: "sftp-1", type: "sftp" })).toBe(true);
    expect(isPluginWorkspaceTab({ sessionId: "terminal-1", type: "terminal" })).toBe(false);
  });

  it("delegates saved-session restoration to the owning transport contribution", () => {
    const session = (transport: SavedSessionRecord["transport"]): SavedSessionRecord => ({
      id: `saved-${transport}`,
      hostId: null,
      hostName: null,
      transport,
      profileId: "profile-1",
      title: "Saved session",
      wasGraceful: false,
      savedAt: "2026-11-09T00:00:00.000Z",
      pluginData: {},
    });

    expect(canRestoreInternalSavedSession(session("ssh"))).toBe(true);
    expect(canRestoreInternalSavedSession(session("sftp"))).toBe(false);
    expect(canRestoreInternalSavedSession(session("telnet"))).toBe(false);
  });

  it("resolves terminal contributions by their declared transport", () => {
    expect(getInternalPluginForTransport("local")?.id).toBe("local-terminal");
    expect(getInternalPluginForTransport("ssh")?.id).toBe("ssh");
    expect(getInternalPluginForTransport(undefined)).toBeUndefined();
    expect(getInternalPluginForTransport("local")?.sessionOpenPrompt).toBeDefined();
    expect(getInternalPluginForTransport("ssh")?.sessionOpenPrompt).toBeUndefined();
  });

  it("runs legacy workspace metadata migrations through plugin contributions", () => {
    const migrated = migrateInternalWorkspaceTab({
      transport: "local",
      profileId: "profile-1",
      title: "PowerShell",
      claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
      pluginData: { "other.plugin": { preserved: true } },
    });

    expect(migrated).not.toHaveProperty("claudeSessionId");
    expect(migrated.pluginData).toEqual({
      "other.plugin": { preserved: true },
      "local-terminal": { claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1" },
    });
  });

  it("moves legacy SFTP settings into their owning plugin namespaces", () => {
    const migrated = migrateInternalPluginSettings({
      general: {
        usePopupTransferMonitor: true,
        autoHideCompletedTransfers: false,
        sftpChunkConcurrency: 2,
        showSerialInSidebar: false,
        showLocalInSidebar: true,
        showRestoreBanner: false,
      },
      pluginSettings: {
        sftp: { sftpChunkConcurrency: 4, existingOption: "keep" },
        "local-terminal": { showInSidebar: false },
        other: { enabled: true },
      },
    });

    expect(migrated.general).toEqual({ showRestoreBanner: false });
    expect(migrated.pluginSettings).toEqual({
      sftp: {
        sftpChunkConcurrency: 4,
        existingOption: "keep",
        usePopupTransferMonitor: true,
        autoHideCompletedTransfers: false,
      },
      serial: { showInSidebar: false },
      "local-terminal": { showInSidebar: false },
      other: { enabled: true },
    });
  });

  it("drops invalid legacy plugin settings without overwriting existing values", () => {
    const migrated = migrateInternalPluginSettings({
      general: {
        sftpChunkConcurrency: 3,
        usePopupTransferMonitor: "yes",
      },
      pluginSettings: {
        sftp: { sftpChunkConcurrency: 2 },
        recording: { showRecordingButton: false },
      },
    });

    expect(migrated.general).toEqual({});
    expect(migrated.pluginSettings).toEqual({
      sftp: { sftpChunkConcurrency: 2 },
      recording: { showRecordingButton: false },
    });
  });

  it("keeps terminal recording enabled as a core capability without a plugin settings page", () => {
    const recording = internalPlugins.find((plugin) => plugin.id === "recording");
    expect(recording?.kind).toBe("core");
    expect(getInternalPluginSettingsPages(new Set(["recording"])).map((page) => page.categoryId)).not.toContain("plugin:recording:general");
  });

  it("loads global overlays only from plugin contributions", () => {
    expect(internalPlugins.find((plugin) => plugin.id === "sftp")?.overlay).toBeDefined();
    expect(internalPlugins.find((plugin) => plugin.id === "ssh")?.overlay).toBeDefined();
  });

  it("contributes SSH connection history as a host action", async () => {
    const invoke = vi.fn(async () => []);
    const actions = internalPlugins
      .find((plugin) => plugin.id === "ssh")
      ?.getHostActions?.({
        openTab: () => {},
        host: {
          isAvailable: () => true,
          challenges: {
            credentials: async () => null,
            hostKey: async () => false,
            keyboardInteractive: async () => [],
            tmuxSessions: async () => null,
          },
          sftp: { connect: async () => ({ sftpSessionId: "sftp-test" }) },
          security: { trustHostFingerprint: async () => undefined },
          pluginMain: { invoke },
        },
      }) ?? [];

    expect(actions.find((item) => item.id === "ssh.connectionHistory")?.label).toBe("Connection History");
    const lastConnected = actions.find((item) => item.id === "ssh.lastConnected");
    expect(lastConnected?.disabled).toBe(true);
    await expect(lastConnected?.resolveLabel?.({
      id: "host-1",
      name: "Server",
      hostname: "server.test",
      port: 22,
      username: "admin",
    })).resolves.toBe("Last connected: Never");
    expect(invoke).toHaveBeenCalledWith(
      "ssh",
      "connectionHistory.listByHost",
      { hostId: "host-1", limit: 200 },
    );
  });

  it("exposes host-list actions only from enabled plugin contributions", () => {
    expect(getInternalPluginSidebarActions(new Set()).map((item) => item.id)).toEqual([]);
    expect(getInternalPluginSidebarActions(new Set(["ssh"])).map((item) => item.id)).toEqual([
      "ssh.hosts.export.json",
      "ssh.hosts.export.csv",
      "ssh.hosts.export.ssh-config",
      "ssh.import-hosts",
    ]);
  });

  it("loads host editors only through enabled plugin contributions", () => {
    expect(getInternalPluginHostEditor(new Set())).toBeUndefined();
    expect(getInternalPluginHostEditor(new Set(["ssh"]))).toBeDefined();
    expect(getInternalPluginHostEditorContribution(new Set())).toBeUndefined();
    expect(getInternalPluginHostEditorContribution(new Set(["ssh"]))).toMatchObject({
      mapRecord: expect.any(Function),
      createRecord: expect.any(Function),
      persistRecord: expect.any(Function),
    });
  });

  it("exposes Serial and Local Terminal settings pages only while each plugin is enabled", () => {
    expect(getInternalPluginSettingsPages(new Set()).map((page) => page.pluginId)).toEqual([]);
    expect(getInternalPluginSettingsPages(new Set(["serial"])).map((page) => page.pluginId)).toEqual(["serial"]);
    expect(getInternalPluginSettingsPages(new Set(["local-terminal"])).map((page) => page.pluginId)).toEqual(["local-terminal"]);
  });

  it("runs host-connection preparation through enabled plugin contributions", async () => {
    const connection: PluginHostConnection = {
      id: "host-1",
      name: "Production",
      hostname: "example.test",
      port: 22,
      username: "admin",
      profile: { tmuxDetect: true, authMethod: "keyfile" },
    };
    const probeTmux = vi.fn(async () => [
      { name: "work", windowCount: 1, createdAt: "now", attached: false },
    ]);
    const host = {
      isAvailable: () => true,
      remoteSessions: { probeTmux },
      challenges: { tmuxSessions: async () => ({ attachTo: "work" }) },
    } as unknown as PluginUiHostServices;

    await expect(prepareInternalHostConnection(connection, new Set(), host)).resolves.toBeUndefined();
    expect(probeTmux).not.toHaveBeenCalled();

    await expect(prepareInternalHostConnection(connection, new Set(["ssh"]), host)).resolves.toEqual({ attachTo: "work" });
    expect(probeTmux).toHaveBeenCalledOnce();
  });

  it("provides terminal toolbar controls through plugin contributions", () => {
    expect(internalPlugins.find((plugin) => plugin.id === "recording")?.terminalToolbar).toBeDefined();
    expect(internalPlugins.find((plugin) => plugin.id === "ssh")?.terminalToolbar).toBeUndefined();
    expect(internalPlugins.find((plugin) => plugin.id === "serial")?.terminalToolbar).toBeDefined();
  });

  it("exposes plugin settings pages only while their plugin is enabled", () => {
    const ssh = internalPlugins.find((plugin) => plugin.id === "ssh");
    expect(ssh?.settingsPages?.map((page) => page.id)).toContain("keys");
    expect(ssh?.settingsPages?.map((page) => page.id)).toContain("host-imports");
    expect(getInternalPluginSettingsPages(new Set(["ssh"])).map((page) => page.categoryId)).toContain("plugin:ssh:keys");
    expect(getInternalPluginSettingsPages(new Set(["ssh"])).map((page) => page.categoryId)).toContain("plugin:ssh:host-imports");
    expect(getInternalPluginSettingsPages(new Set()).map((page) => page.categoryId)).not.toContain("plugin:ssh:keys");
    expect(getInternalPluginSettingsPages(new Set()).map((page) => page.categoryId)).not.toContain("plugin:ssh:host-imports");
    expect(getInternalPluginSettingsPages(new Set(["sftp", "recording"])).map((page) => page.categoryId)).toEqual(expect.arrayContaining([
      "plugin:sftp:transfers",
    ]));
    expect(getInternalPluginSettingsPages(new Set()).map((page) => page.categoryId)).not.toContain("plugin:sftp:transfers");
    expect(getInternalPluginSettingsPages(new Set()).map((page) => page.categoryId)).not.toContain("plugin:recording:general");
  });

  it("contributes SSH import commands only through the enabled plugin", async () => {
    const sshCommands = getInternalPluginCommands(new Set(["ssh"]), commandContext);
    expect(sshCommands.map((command) => command.id)).toEqual(expect.arrayContaining([
      "ssh.import-config",
      "ssh.import-putty",
      "ssh.import-manager",
    ]));
    expect(getInternalPluginCommands(new Set(), commandContext).map((command) => command.id)).not.toContain("ssh.import-config");

    await sshCommands.find((command) => command.id === "ssh.import-manager")?.execute();
    expect(hostImportStore.getState().open).toBe("ssh-manager");
  });

  it("exposes optional workspace launchers through their plugin contribution", () => {
    expect(internalPlugins.find((plugin) => plugin.id === "local-terminal")?.workspaceLauncher).toBeDefined();
    expect(internalPlugins.find((plugin) => plugin.id === "ssh")?.workspaceLauncher).toBeUndefined();
  });

  it("exposes optional sidebar sections through their plugin contribution", () => {
    expect(internalPlugins.find((plugin) => plugin.id === "local-terminal")?.sidebarContribution).toBeDefined();
    expect(internalPlugins.find((plugin) => plugin.id === "ssh")?.sidebarContribution).toBeUndefined();
  });

  it("contributes serial profile search and open behavior only while enabled", () => {
    const serial = internalPlugins.find((plugin) => plugin.id === "serial");
    expect(serial?.sidebarContribution).toBeDefined();
    expect(serial?.workspaceLauncher).toBeDefined();
    expect(serial?.getQuickConnectProfiles).toBeDefined();
    expect(getInternalPluginCommands(new Set(["serial"]), commandContext).map((item) => item.id)).toContain("serial.new-profile");
    expect(getInternalPluginCommands(new Set(), commandContext).map((item) => item.id)).not.toContain("serial.new-profile");
  });

  it("exposes tunnel panel, toolbar and command only through its plugin contribution", async () => {
    const tunnels = internalPlugins.find((plugin) => plugin.id === "tunnels");
    expect(tunnels?.secondarySidebarView).toBeDefined();
    expect(tunnels?.workspaceToolbarButton).toBeDefined();

    const command = getInternalPluginCommands(new Set(["tunnels"]), commandContext)
      .find((item) => item.id === "tunnels.open-manager");
    expect(command).toBeDefined();
    await command?.execute();
    expect(commandContext.openSecondarySidebar).toHaveBeenCalledWith("tunnels", "Tunnels");
    expect(getInternalPluginCommands(new Set(), commandContext).map((item) => item.id)).not.toContain("tunnels.open-manager");
  });

  it("contributes local shell commands only while the plugin is enabled", async () => {
    localProfilesStore.setState({
      profiles: [{
        id: "pwsh",
        name: "PowerShell",
        executable: "pwsh.exe",
        args: [],
        startingDirectory: null,
        icon: "powershell",
        color: null,
        elevated: false,
        source: "detected",
        detectKey: "pwsh",
        isAvailable: true,
        isHidden: false,
        sortOrder: 0,
        claudeSession: false,
        claudeSessionMode: "continue",
      }],
    });
    const openTab = vi.fn();
    const context = { ...commandContext, openTab };
    const commands = getInternalPluginCommands(new Set(["local-terminal"]), context);

    expect(commands.map((command) => command.id)).toContain("local:pwsh");
    expect(getInternalPluginCommands(new Set(), context).map((command) => command.id)).not.toContain("local:pwsh");
    await commands.find((command) => command.id === "local:pwsh")?.execute();
    expect(openTab).toHaveBeenCalledWith(expect.objectContaining({
      transport: "local",
      profileId: "pwsh",
      title: "PowerShell",
    }));
  });
});

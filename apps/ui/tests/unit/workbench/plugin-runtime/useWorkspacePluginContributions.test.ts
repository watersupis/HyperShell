import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellApi } from "../../../../src/workbench/shared/shell";
import { setShell } from "../../../../src/workbench/shared/shell";
import { createLayoutStore, layoutStore } from "../../../../src/workbench/editor-area/layoutStore";
import { closeUninstalledExternalPluginTabs, toWorkspacePluginContribution, useWorkspacePluginContributions } from "../../../../src/workbench/plugin-runtime/useWorkspacePluginContributions";
import { pluginUiSlots } from "../../../../src/workbench/slots/pluginUiSlots";
const makePlugin = (overrides: {
  permissions?: string[];
  ui?: { placement?: string; slots?: string[]; workspaceToolbar?: boolean };
} = {}) => ({
  manifest: {
    id: "sample.plugin",
    name: "Sample Plugin",
    ui: overrides.ui,
  },
  grantedPermissions: overrides.permissions ?? [],
});

describe("external plugin tab cleanup", () => {
  it("closes uninstalled plugin tabs across panes and preserves other tabs", () => {
    const layout = createLayoutStore();
    layout.getState().openTab({
      sessionId: "plugin-session",
      title: "External Plugin",
      type: "plugin",
      pluginId: "sample.removed",
    });
    layout.getState().splitPane("plugin-session");
    const secondPaneId = layout.getState().activePaneId;
    layout.getState().activateTab("plugin-session", secondPaneId);
    layout.getState().openTab({ sessionId: "terminal-session", title: "Terminal", type: "terminal" });
    layout.getState().openTab({
      sessionId: "sftp-session",
      title: "SFTP",
      type: "plugin",
      pluginId: "sftp",
      transport: "sftp",
    });

    closeUninstalledExternalPluginTabs(
      new Set(["sample.installed"]),
      layout.getState()
    );

    expect(layout.getState().tabs.map((tab) => tab.sessionId)).toEqual(["terminal-session", "sftp-session"]);
    expect(layout.getState().panes.every((pane) => !pane.tabSessionIds.includes("plugin-session"))).toBe(true);
  });

  it("keeps tabs belonging to installed plugins", () => {
    const layout = createLayoutStore();
    layout.getState().openTab({
      sessionId: "plugin-session",
      title: "External Plugin",
      type: "plugin",
      pluginId: "sample.installed",
    });

    closeUninstalledExternalPluginTabs(
      new Set(["sample.installed"]),
      layout.getState()
    );

    expect(layout.getState().tabs.map((tab) => tab.sessionId)).toEqual(["plugin-session"]);
  });
});

describe("external plugin contribution lifecycle", () => {
  const pluginsList = vi.fn();

  beforeEach(() => {
    pluginsList.mockReset().mockResolvedValue([makePlugin()]);
    setShell({ pluginsList } as unknown as ShellApi);
    layoutStore.setState({
      tabs: [],
      activeSessionId: null,
      panes: [{ paneId: "pane-1", sessionId: null, tabSessionIds: [] }],
      paneLayout: { type: "pane", paneId: "pane-1" },
      activePaneId: "pane-1",
      splitDirection: "horizontal",
      paneSizes: [100],
    });
  });

  afterEach(() => setShell(null));

  it("closes an open workspace tab after the installed plugin list removes its owner", async () => {
    layoutStore.getState().openTab({
      sessionId: "plugin-session",
      title: "Sample Plugin",
      type: "plugin",
      pluginId: "sample.plugin",
    });

    const { result } = renderHook(() => useWorkspacePluginContributions(layoutStore.getState().tabs));
    await waitFor(() => expect(result.current.pluginsLoaded).toBe(true));
    expect(layoutStore.getState().tabs).toHaveLength(1);

    pluginsList.mockResolvedValueOnce([]);
    await act(async () => {
      window.dispatchEvent(new Event("hypershell:plugins-changed"));
      await Promise.resolve();
    });

    await waitFor(() => expect(layoutStore.getState().tabs).toHaveLength(0));
  });

  it("removes stale plugin tabs when the app restores a layout after restart", async () => {
    pluginsList.mockResolvedValueOnce([]);
    layoutStore.getState().openTab({
      sessionId: "restored-plugin-session",
      title: "Removed Plugin",
      type: "plugin",
      pluginId: "sample.removed",
    });

    const { result } = renderHook(() => useWorkspacePluginContributions(layoutStore.getState().tabs));
    await waitFor(() => expect(result.current.pluginsLoaded).toBe(true));

    expect(layoutStore.getState().tabs).toHaveLength(0);
  });
});

describe("workspace plugin contributions", () => {
  it("uses the declared UI slots and defaults legacy placement to a workspace tab", () => {
    expect(toWorkspacePluginContribution(makePlugin())).toEqual({
      id: "sample.plugin",
      name: "Sample Plugin",
      slots: [pluginUiSlots.workspaceTab],
      placement: pluginUiSlots.workspaceTab,
      workspaceToolbar: false,
    });

    expect(toWorkspacePluginContribution(makePlugin({
      ui: { placement: pluginUiSlots.workspaceHeader, slots: [pluginUiSlots.terminalToolbar], workspaceToolbar: true },
    }))).toMatchObject({
      slots: [pluginUiSlots.terminalToolbar],
      placement: pluginUiSlots.workspaceHeader,
      workspaceToolbar: true,
    });
  });

  it("preserves panel slot contributions for the generic workbench panel", () => {
    expect(toWorkspacePluginContribution(makePlugin({
      ui: { placement: pluginUiSlots.panel, slots: [pluginUiSlots.panel] },
    }))).toMatchObject({
      slots: [pluginUiSlots.panel],
    });
  });

});

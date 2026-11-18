import { describe, expect, it } from "vitest";

import {
  createLayoutStore,
  resolveTabTitle,
  restorableWorkspaceTabs,
  serializeWorkspaceLayout,
  workspaceTabToLayoutTab,
} from "../../../../src/workbench/editor-area/layoutStore";

describe("layoutStore", () => {
  it("opens a tab for a new session", () => {
    const store = createLayoutStore();

    store.getState().openTab({ sessionId: "s1", title: "server-1" });

    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().tabs[0]?.tabKey).toBe("s1");
  });

  it("keeps plugin views in layout tabs but excludes them from session restore", () => {
    const store = createLayoutStore();
    store.getState().openTab({
      sessionId: "plugin:com.hypershell.host-monitor:host-1",
      title: "Host Monitor — server-1",
      type: "plugin",
      pluginId: "com.hypershell.host-monitor",
      hostId: "host-1",
    });

    expect(store.getState().tabs).toHaveLength(1);
    expect(serializeWorkspaceLayout(store.getState()).tabs).toEqual([]);
  });

  it("splits a pane", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "server-1" });
    store.getState().splitPane("s1");
    expect(store.getState().panes).toHaveLength(2);
    expect(store.getState().panes[1]?.sessionId).not.toBe("s1");
    expect(store.getState().tabs).toHaveLength(2);
    expect(store.getState().activePaneId).toBe(store.getState().panes[1]?.paneId);
  });

  it("moves a tab to another pane while retaining the target group's tabs", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "server-1" });
    store.getState().openTab({ sessionId: "s2", title: "server-2" });
    store.getState().splitPane("s2");
    const [firstPane, secondPane] = store.getState().panes;

    store.getState().moveTabToPane("s1", secondPane!.paneId);

    expect(store.getState().panes).toEqual([
      { paneId: firstPane!.paneId, sessionId: "s2", tabSessionIds: ["s2"] },
      {
        paneId: secondPane!.paneId,
        sessionId: "s1",
        tabSessionIds: ["split-session-2", "s1"],
      },
    ]);
    expect(store.getState().activePaneId).toBe(secondPane!.paneId);
    expect(store.getState().activeSessionId).toBe("s1");
  });

  it("collapses the source pane when dragging its last tab to another pane", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "server-1" });
    store.getState().splitPane("s1");
    const targetPaneId = store.getState().activePaneId;

    store.getState().moveTabToPane("s1", targetPaneId);

    expect(store.getState().panes).toHaveLength(1);
    expect(store.getState().panes[0]?.tabSessionIds).toContain("s1");
    expect(store.getState().paneLayout).toEqual({ type: "pane", paneId: targetPaneId });
    expect(store.getState().activePaneId).toBe(targetPaneId);
  });

  it("closes a pane", () => {
    const store = createLayoutStore();
    store.getState().splitPane("s1");
    const secondPaneId = store.getState().panes[1]?.paneId!;
    store.getState().closePane(secondPaneId);
    expect(store.getState().panes).toHaveLength(1);
  });

  it("does not close the last pane", () => {
    const store = createLayoutStore();
    const firstPaneId = store.getState().panes[0]?.paneId!;
    store.getState().closePane(firstPaneId);
    expect(store.getState().panes).toHaveLength(1);
  });

  it("replaces temporary session ids with backend ids", () => {
    const store = createLayoutStore();

    store.getState().openTab({
      tabKey: "tab-1",
      sessionId: "temp-1",
      title: "server-1",
      transport: "ssh",
      profileId: "host-1"
    });

    store.getState().replaceSessionId("temp-1", "session-42");

    expect(store.getState().tabs[0]?.sessionId).toBe("session-42");
    expect(store.getState().tabs[0]?.tabKey).toBe("tab-1");
    expect(store.getState().tabs[0]?.preopened).toBe(true);
    expect(store.getState().activeSessionId).toBe("session-42");
  });

  it("splitPane stores direction and default sizes", () => {
    const store = createLayoutStore();
    store.getState().splitPane("sess-1", "horizontal");
    const state = store.getState();
    expect(state.panes).toHaveLength(2);
    expect(state.splitDirection).toBe("horizontal");
    expect(state.paneSizes).toEqual([50, 50]);
  });

  it("splitPane vertical creates vertical split", () => {
    const store = createLayoutStore();
    store.getState().splitPane("sess-1", "vertical");
    expect(store.getState().splitDirection).toBe("vertical");
  });

  it("nests a vertical split inside the active right-hand pane", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "one" });
    store.getState().splitPane("s1", "horizontal");
    const rightPane = store.getState().activePaneId;
    store.getState().splitPane(store.getState().activeSessionId!, "vertical");

    const layout = store.getState().paneLayout;
    expect(layout.type).toBe("split");
    if (layout.type !== "split") throw new Error("Expected root split");
    expect(layout.direction).toBe("horizontal");
    const nestedSplit = layout.children[1];
    expect(nestedSplit.type).toBe("split");
    if (nestedSplit.type !== "split") throw new Error("Expected nested split");
    expect(nestedSplit.direction).toBe("vertical");
    expect(nestedSplit.children[0]).toEqual({ type: "pane", paneId: rightPane });
  });

  it("collapses only the closed branch of a nested split", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "one" });
    store.getState().splitPane("s1", "horizontal");
    const rightPane = store.getState().activePaneId;
    store.getState().splitPane(store.getState().activeSessionId!, "vertical");
    const bottomPane = store.getState().activePaneId;

    store.getState().closePane(bottomPane);

    expect(store.getState().panes.map((pane) => pane.paneId)).toEqual([
      "pane-1",
      rightPane,
    ]);
    expect(store.getState().paneLayout).toMatchObject({
      type: "split",
      direction: "horizontal",
      children: [{ type: "pane", paneId: "pane-1" }, { type: "pane", paneId: rightPane }],
    });
  });

  it("closes the final tab in a split pane and collapses its layout branch", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "one" });
    store.getState().splitPane("s1", "horizontal");
    const secondSessionId = store.getState().activeSessionId!;
    const secondPaneId = store.getState().activePaneId;

    expect(store.getState().closeTabInPane(secondSessionId, secondPaneId)).toBe(true);
    expect(store.getState().tabs.map((tab) => tab.sessionId)).toEqual(["s1"]);
    expect(store.getState().panes.map((pane) => pane.paneId)).toEqual(["pane-1"]);
    expect(store.getState().paneLayout).toEqual({ type: "pane", paneId: "pane-1" });
  });

  it("closes a shared plugin view in one group without closing its session", () => {
    const store = createLayoutStore();
    store.getState().openTab({
      sessionId: "sftp-1",
      title: "files",
      type: "plugin",
      pluginId: "sftp",
      pluginData: { sftpSessionId: "sftp-1" },
    });
    store.getState().splitPane("sftp-1", "horizontal");
    const secondPaneId = store.getState().activePaneId;

    expect(store.getState().closeTabInPane("sftp-1", secondPaneId)).toBe(false);
    expect(store.getState().tabs.map((tab) => tab.sessionId)).toEqual(["sftp-1"]);
    expect(store.getState().panes).toHaveLength(1);
  });

  it("reorders tabs within a pane without changing another pane", () => {
    const store = createLayoutStore();
    store.getState().openTab({ sessionId: "s1", title: "one" });
    store.getState().openTab({ sessionId: "s2", title: "two" });
    store.getState().splitPane("s2", "horizontal");
    const secondPaneId = store.getState().activePaneId;
    store.getState().openTab({ sessionId: "s1", title: "one" });
    store.getState().moveTabInPane("s1", "split-session-2", secondPaneId);

    expect(store.getState().panes[0]?.tabSessionIds).toEqual(["s1", "s2"]);
    expect(store.getState().panes[1]?.tabSessionIds).toEqual(["s1", "split-session-2"]);
  });

  it("setPaneSizes updates sizes array", () => {
    const store = createLayoutStore();
    store.getState().splitPane("sess-1", "horizontal");
    store.getState().setPaneSizes([30, 70]);
    expect(store.getState().paneSizes).toEqual([30, 70]);
  });

  it("closePane resets to single pane sizes", () => {
    const store = createLayoutStore();
    store.getState().splitPane("sess-1", "horizontal");
    expect(store.getState().panes).toHaveLength(2);
    store.getState().closePane("pane-2");
    expect(store.getState().panes).toHaveLength(1);
    expect(store.getState().paneSizes).toEqual([100]);
  });

  it("preserves plugin tab metadata", () => {
    const store = createLayoutStore();

    store.getState().openTab({
      sessionId: "plugin-1",
      title: "Plugin view",
      type: "plugin",
      pluginId: "sample-plugin",
      pluginData: { viewId: "files" },
      hostId: "host-1",
    });

    expect(store.getState().tabs[0]).toMatchObject({
      sessionId: "plugin-1",
      title: "Plugin view",
      type: "plugin",
      pluginId: "sample-plugin",
      pluginData: { viewId: "files" },
      hostId: "host-1",
      tabKey: "plugin-1",
    });
  });

  describe("setTabDynamicTitle", () => {
    it("sets the dynamic title without touching the base title", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      store.getState().setTabDynamicTitle("s1", "pwsh in hypershell");
      const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
      expect(tab?.dynamicTitle).toBe("pwsh in hypershell");
      expect(tab?.title).toBe("PowerShell");
    });

    it("clears the dynamic title with null", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      store.getState().setTabDynamicTitle("s1", "cd C:\\repos");
      store.getState().setTabDynamicTitle("s1", null);
      const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
      expect(tab?.dynamicTitle).toBeUndefined();
    });

    it("is a no-op for unknown sessions", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      const before = store.getState().tabs;
      store.getState().setTabDynamicTitle("nope", "x");
      expect(store.getState().tabs).toBe(before);
    });

    it("survives replaceSessionId", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "hermes" });
      store.getState().setTabDynamicTitle("s1", "htop");
      store.getState().replaceSessionId("s1", "s2");
      const tab = store.getState().tabs.find((t) => t.sessionId === "s2");
      expect(tab?.dynamicTitle).toBe("htop");
    });
  });

  describe("process titles", () => {
    it("sets the process title without touching base or dynamic titles", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      store.getState().setTabDynamicTitle("s1", "pwsh in hypershell");
      store.getState().setTabProcessTitle("s1", "llmtop");

      const tab = store.getState().tabs.find((t) => t.sessionId === "s1");
      expect(tab?.processTitle).toBe("llmtop");
      expect(tab?.dynamicTitle).toBe("pwsh in hypershell");
      expect(tab?.title).toBe("PowerShell");
    });

    it("clears the process title with null", () => {
      const store = createLayoutStore();
      store.getState().openTab({ sessionId: "s1", title: "PowerShell" });
      store.getState().setTabProcessTitle("s1", "llmtop");
      store.getState().setTabProcessTitle("s1", null);

      expect(store.getState().tabs.find((t) => t.sessionId === "s1")?.processTitle).toBeUndefined();
    });

    it("resolves process over dynamic over base", () => {
      expect(resolveTabTitle({ sessionId: "s1", title: "base" })).toBe("base");
      expect(resolveTabTitle({ sessionId: "s1", title: "base", dynamicTitle: "osc" })).toBe("osc");
      expect(
        resolveTabTitle({ sessionId: "s1", title: "base", dynamicTitle: "osc", processTitle: "llmtop" })
      ).toBe("llmtop");
    });
  });
});

describe("layoutStore terminal font sizes", () => {
  it("captures the current default for terminal tabs but not plugin tabs", () => {
    const store = createLayoutStore(() => 13);

    store.getState().openTab({ sessionId: "terminal-1", title: "Terminal" });
    store.getState().openTab({
      sessionId: "sftp-1",
      title: "SFTP",
      type: "plugin",
      transport: "sftp",
    });

    expect(store.getState().tabs.find((tab) => tab.sessionId === "terminal-1")?.fontSize).toBe(13);
    expect(store.getState().tabs.find((tab) => tab.sessionId === "sftp-1")?.fontSize).toBeUndefined();
  });

  it("changes one terminal tab without affecting another and preserves it on reconnect", () => {
    const store = createLayoutStore(() => 13);
    store.getState().openTab({ sessionId: "terminal-1", title: "First" });
    store.getState().openTab({ sessionId: "terminal-2", title: "Second" });

    store.getState().setTabFontSize("terminal-1", 13.5);

    expect(store.getState().tabs.find((tab) => tab.sessionId === "terminal-1")?.fontSize).toBe(13.5);
    expect(store.getState().tabs.find((tab) => tab.sessionId === "terminal-2")?.fontSize).toBe(13);

    store.getState().replaceSessionId("terminal-1", "terminal-1-connected");
    expect(
      store.getState().tabs.find((tab) => tab.sessionId === "terminal-1-connected")?.fontSize
    ).toBe(13.5);
  });
});

describe("layoutStore workspace persistence", () => {
  it("serializes each terminal tab font size", () => {
    const store = createLayoutStore(() => 13);
    store.getState().openTab({
      sessionId: "terminal-1",
      title: "Production",
      transport: "ssh",
      profileId: "host-1",
      fontSize: 13.5,
    });
    expect(serializeWorkspaceLayout(store.getState()).tabs[0]?.fontSize).toBe(13.5);
  });

  it("omits renderer-owned plugin tabs from persisted layouts", () => {
    const store = createLayoutStore(() => 13);
    store.getState().openTab({
      sessionId: "terminal-1",
      title: "Production",
      transport: "ssh",
      profileId: "host-1",
    });
    store.getState().openTab({
      sessionId: "sftp-tab-abc",
      title: "SFTP: box",
      transport: "sftp",
      type: "plugin",
      pluginId: "example-plugin",
      pluginData: { sftpSessionId: "abc" },
      hostId: "host-1",
      preopened: true,
    });

    const tabs = serializeWorkspaceLayout(store.getState()).tabs;

    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.profileId).toBe("host-1");
  });

  it("drops panes hosting omitted plugin tabs from paneCount and paneSizes", () => {
    const store = createLayoutStore(() => 13);
    store.getState().openTab({
      sessionId: "terminal-1",
      title: "Production",
      transport: "ssh",
      profileId: "host-1",
    });
    // Split, then land the SFTP tab in the new (active) pane.
    store.getState().splitPane("terminal-1");
    store.getState().openTab({
      sessionId: "sftp-tab-abc",
      title: "SFTP: box",
      transport: "sftp",
      type: "plugin",
      pluginId: "example-plugin",
      pluginData: { sftpSessionId: "abc" },
    });
    store.getState().setPaneSizes([30, 70]);

    const layout = serializeWorkspaceLayout(store.getState());

    // Keeping paneCount 2 / sizes [30, 70] would restore the single surviving
    // tab into a 30%-wide pane with nothing beside it.
    expect(layout.paneCount).toBe(1);
    expect(layout.paneSizes).toEqual([100]);
  });

  it("keeps a multi-pane terminal layout's sizes intact", () => {
    const store = createLayoutStore(() => 13);
    store.getState().openTab({
      sessionId: "terminal-1",
      title: "First",
      transport: "ssh",
      profileId: "host-1",
    });
    store.getState().splitPane("terminal-1");
    store.getState().openTab({
      sessionId: "terminal-2",
      title: "Second",
      transport: "ssh",
      profileId: "host-2",
    });
    store.getState().setPaneSizes([30, 70]);

    const layout = serializeWorkspaceLayout(store.getState());

    expect(layout.paneCount).toBe(2);
    expect(layout.paneSizes).toEqual([30, 70]);
  });

  it("hydrates saved font sizes and leaves legacy values for defaulting", () => {
    const savedTab = {
      transport: "ssh" as const,
      profileId: "host-1",
      title: "Production",
      fontSize: 14.5,
    };

    expect(workspaceTabToLayoutTab(savedTab, "restored-1")).toMatchObject({
      sessionId: "restored-1",
      fontSize: 14.5,
    });
    expect(
      workspaceTabToLayoutTab(
        { transport: "ssh", profileId: "host-1", title: "Legacy" },
        "legacy-1"
      ).fontSize
    ).toBeUndefined();
  });
});

describe("restorableWorkspaceTabs", () => {
  it("drops plugin and legacy SFTP views while keeping untyped legacy terminals", () => {
    const savedTabs = [
      { transport: "ssh" as const, profileId: "host-1", title: "Production" },
      {
        transport: "ssh" as const,
        profileId: "plugin-tab",
        title: "Plugin view",
        type: "plugin" as const,
      },
      {
        transport: "sftp" as const,
        profileId: "sftp-tab-0018a6da",
        title: "SFTP: box",
        type: "sftp" as const,
        hostId: "host-1",
      },
    ];

    expect(restorableWorkspaceTabs(savedTabs)).toEqual([savedTabs[0]]);
  });

  it("keeps terminal session tabs untouched", () => {
    const savedTabs = [
      { transport: "ssh" as const, profileId: "host-1", title: "Production" },
      { transport: "local" as const, profileId: "profile-1", title: "PowerShell" },
      { transport: "serial" as const, profileId: "COM3", title: "COM3" },
    ];

    expect(restorableWorkspaceTabs(savedTabs)).toEqual(savedTabs);
  });
});

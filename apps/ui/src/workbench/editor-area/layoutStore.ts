import { createStore } from "zustand/vanilla";
import type { WorkspaceLayout, WorkspaceTab } from "@hypershell/shared";
import {
  normalizeTerminalFontSize,
  settingsStore,
} from "../shell/settings/settingsStore";

export type LayoutTab = {
  tabKey?: string;
  sessionId: string;
  title: string;
  dynamicTitle?: string;
  /** Foreground program reported by the main-process poller. Local tabs only. */
  processTitle?: string;
  transport?: "ssh" | "serial" | "sftp" | "telnet" | "local";
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  profileId?: string;
  preopened?: boolean;
  autoConnect?: boolean;
  type?: string;
  pluginId?: string;
  pluginData?: Record<string, unknown>;
  hostId?: string;
  tmuxAttachTarget?: string;
  fontSize?: number;
};

export type Pane = {
  paneId: string;
  sessionId: string | null;
  tabSessionIds: string[];
};

export type PaneLayoutNode =
  | { type: "pane"; paneId: string }
  | {
      type: "split";
      groupId: string;
      direction: "horizontal" | "vertical";
      sizes: number[];
      children: [PaneLayoutNode, PaneLayoutNode];
    };

export type LayoutState = {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  panes: Pane[];
  paneLayout: PaneLayoutNode;
  activePaneId: string;
  splitDirection: "horizontal" | "vertical";
  paneSizes: number[];
  openTab: (tab: LayoutTab) => void;
  activateTab: (sessionId: string, paneId?: string) => void;
  closeTabInPane: (sessionId: string, paneId: string) => boolean;
  closeTabsInPane: (sessionIds: string[], paneId: string) => string[];
  replaceSessionId: (oldSessionId: string, nextSessionId: string) => void;
  splitPane: (sessionId: string, direction?: "horizontal" | "vertical") => void;
  setSplitSizes: (groupId: string, sizes: number[]) => void;
  closePane: (paneId: string) => void;
  activatePane: (paneId: string) => void;
  moveTabToPane: (sessionId: string, paneId: string) => void;
  moveTabInPane: (fromSessionId: string, toSessionId: string, paneId: string) => void;
  setPaneSizes: (sizes: number[]) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  setTabDynamicTitle: (sessionId: string, title: string | null) => void;
  setTabProcessTitle: (sessionId: string, name: string | null) => void;
  setTabFontSize: (sessionId: string, fontSize: number) => void;
  setTabPluginData: (sessionId: string, pluginId: string, data: Record<string, unknown> | null) => void;
};

function equalPaneSizes(count: number): number[] {
  const equalSize = Math.round(100 / count);
  return Array.from({ length: count }, (_, i) =>
    i < count - 1 ? equalSize : 100 - equalSize * (count - 1)
  );
}

function removePaneNode(node: PaneLayoutNode, paneId: string): PaneLayoutNode | null {
  if (node.type === "pane") return node.paneId === paneId ? null : node;
  const first = removePaneNode(node.children[0], paneId);
  const second = removePaneNode(node.children[1], paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, children: [first, second] };
}

export function createLayoutStore(
  getDefaultTerminalFontSize: () => number = () =>
    settingsStore.getState().settings.terminal.fontSize
) {
  let paneCounter = 1;
  let splitCounter = 0;

  return createStore<LayoutState>()((set, get) => ({
    tabs: [],
    activeSessionId: null,
    panes: [{ paneId: "pane-1", sessionId: null, tabSessionIds: [] }],
    paneLayout: { type: "pane", paneId: "pane-1" },
    activePaneId: "pane-1",
    splitDirection: "horizontal" as const,
    paneSizes: [100],

    openTab: (tab) =>
      set((state) => {
        const nextTab =
          isRendererOwnedTab(tab)
            ? tab
            : {
                ...tab,
                fontSize: normalizeTerminalFontSize(
                  tab.fontSize ?? getDefaultTerminalFontSize()
                ),
              };
        const tabs = state.tabs.some((t) => t.sessionId === tab.sessionId)
          ? state.tabs
          : [...state.tabs, { ...nextTab, tabKey: tab.tabKey ?? tab.sessionId }];
        const panes = state.panes.map((pane) =>
          pane.paneId === state.activePaneId
            ? {
                ...pane,
                sessionId: tab.sessionId,
                tabSessionIds: pane.tabSessionIds.includes(tab.sessionId)
                  ? pane.tabSessionIds
                  : [...pane.tabSessionIds, tab.sessionId],
              }
            : pane
        );
        return { tabs, activeSessionId: tab.sessionId, panes };
      }),

    activateTab: (sessionId, paneId) =>
      set((state) => {
        const targetPaneId = paneId ?? state.activePaneId;
        return {
          activeSessionId: sessionId,
          activePaneId: targetPaneId,
          panes: state.panes.map((pane) =>
            pane.paneId === targetPaneId
              ? {
                  ...pane,
                  sessionId,
                  tabSessionIds: pane.tabSessionIds.includes(sessionId)
                    ? pane.tabSessionIds
                    : [...pane.tabSessionIds, sessionId],
                }
              : pane
          ),
        };
      }),

    closeTabInPane: (sessionId, paneId) => {
      const state = get();
      const pane = state.panes.find((item) => item.paneId === paneId);
      if (!pane?.tabSessionIds.includes(sessionId)) return false;
      const remainingInPane = pane.tabSessionIds.filter((id) => id !== sessionId);
      const remainsInOtherPane = state.panes.some(
        (item) => item.paneId !== paneId && item.tabSessionIds.includes(sessionId)
      );
      const removesSession = !remainsInOtherPane;
      const nextSessionId = remainingInPane.at(-1) ?? null;
      const removesEmptyPane = remainingInPane.length === 0 && state.panes.length > 1;
      const updatedPanes = state.panes.map((item) =>
        item.paneId === paneId
          ? {
              ...item,
              tabSessionIds: remainingInPane,
              sessionId: item.sessionId === sessionId ? nextSessionId : item.sessionId,
            }
          : item
      );
      const panes = removesEmptyPane
        ? updatedPanes.filter((item) => item.paneId !== paneId)
        : updatedPanes;
      const paneLayout = removesEmptyPane
        ? removePaneNode(state.paneLayout, paneId) ?? {
            type: "pane" as const,
            paneId: panes[0]!.paneId,
          }
        : state.paneLayout;
      const activePaneId =
        removesEmptyPane && state.activePaneId === paneId
          ? panes[Math.min(state.panes.findIndex((item) => item.paneId === paneId), panes.length - 1)]!.paneId
          : state.activePaneId;
      const activePane = panes.find((item) => item.paneId === activePaneId);
      set({
        tabs: removesSession
          ? state.tabs.filter((tab) => tab.sessionId !== sessionId)
          : state.tabs,
        panes,
        paneLayout,
        activePaneId,
        activeSessionId:
          state.activePaneId === paneId &&
          (state.activeSessionId === sessionId || removesEmptyPane)
            ? activePane?.sessionId ?? null
            : state.activeSessionId,
        paneSizes: equalPaneSizes(panes.length),
      });
      return removesSession;
    },

    closeTabsInPane: (sessionIds, paneId) => {
      const removed: string[] = [];
      for (const sessionId of sessionIds) {
        if (get().closeTabInPane(sessionId, paneId)) removed.push(sessionId);
      }
      return removed;
    },

    replaceSessionId: (oldSessionId, nextSessionId) =>
      set((state) => {
        if (oldSessionId === nextSessionId) {
          return state;
        }

        const tabs = state.tabs.map((tab) =>
          tab.sessionId === oldSessionId
            ? {
                ...tab,
                tabKey: tab.tabKey ?? tab.sessionId,
                sessionId: nextSessionId,
                preopened: true
              }
            : tab
        );

        const dedupedTabs: LayoutTab[] = [];
        const seen = new Set<string>();
        const removedTabKeys: string[] = [];
        for (const tab of tabs) {
          if (seen.has(tab.sessionId)) {
            removedTabKeys.push(tab.tabKey ?? tab.sessionId);
            continue;
          }

          seen.add(tab.sessionId);
          dedupedTabs.push(tab);
        }

        if (removedTabKeys.length > 0) {
          console.warn(
            `[layoutStore] replaceSessionId removed duplicate tabs: ${removedTabKeys.join(", ")}`
          );
        }

        const panes = state.panes.map((pane) => ({
          ...pane,
          sessionId: pane.sessionId === oldSessionId ? nextSessionId : pane.sessionId,
          tabSessionIds: pane.tabSessionIds.map((id) =>
            id === oldSessionId ? nextSessionId : id
          ),
        }));

        return {
          tabs: dedupedTabs,
          panes,
          activeSessionId:
            state.activeSessionId === oldSessionId
              ? nextSessionId
              : state.activeSessionId
        };
      }),

    splitPane: (sessionId, direction) =>
      set((state) => {
        const sourcePane =
          state.panes.find(
            (pane) => pane.sessionId === sessionId && pane.paneId === state.activePaneId
          ) ??
          state.panes.find((pane) => pane.sessionId === sessionId) ??
          state.panes.find(
            (pane) => pane.paneId === state.activePaneId && pane.sessionId === null
          );
        if (!sourcePane) return state;
        paneCounter++;
        splitCounter++;
        const newPaneId = `pane-${paneCounter}`;
        const sourceTab = state.tabs.find((tab) => tab.sessionId === sessionId);
        let newSessionId = sessionId;
        if (sourceTab && !isRendererOwnedTab(sourceTab)) {
          let sessionSequence = paneCounter;
          do {
            newSessionId = `split-session-${sessionSequence++}`;
          } while (state.tabs.some((tab) => tab.sessionId === newSessionId));
        }
        const splitTab =
          newSessionId === sessionId || !sourceTab
            ? null
            : {
                ...sourceTab,
                sessionId: newSessionId,
                tabKey: newSessionId,
                dynamicTitle: undefined,
                processTitle: undefined,
                preopened: false,
              };
        const groupId = `split-${splitCounter}`;
        const newNode: PaneLayoutNode = {
          type: "split",
          groupId,
          direction: direction ?? "horizontal",
          sizes: [50, 50],
          children: [
            { type: "pane", paneId: sourcePane.paneId },
            { type: "pane", paneId: newPaneId },
          ],
        };
        const replacePane = (node: PaneLayoutNode): PaneLayoutNode => {
          if (node.type === "pane") {
            return node.paneId === sourcePane.paneId ? newNode : node;
          }
          return {
            ...node,
            children: node.children.map(replacePane) as [PaneLayoutNode, PaneLayoutNode],
          };
        };
        const sourceTabs = sourcePane.tabSessionIds.includes(sessionId)
          ? sourcePane.tabSessionIds
          : [...sourcePane.tabSessionIds, sessionId];
        const nextPanes = [
          ...state.panes.map((pane) =>
            pane.paneId === sourcePane.paneId ? { ...pane, tabSessionIds: sourceTabs } : pane
          ),
          { paneId: newPaneId, sessionId: newSessionId, tabSessionIds: [newSessionId] },
        ];
        return {
          tabs: splitTab ? [...state.tabs, splitTab] : state.tabs,
          panes: nextPanes,
          paneLayout: replacePane(state.paneLayout),
          activePaneId: newPaneId,
          activeSessionId: newSessionId,
          splitDirection: direction ?? state.splitDirection,
          paneSizes: equalPaneSizes(nextPanes.length),
        };
      }),

    setSplitSizes: (groupId, sizes) =>
      set((state) => {
        const updateSizes = (node: PaneLayoutNode): PaneLayoutNode => {
          if (node.type === "pane") return node;
          if (node.groupId === groupId) return { ...node, sizes };
          return {
            ...node,
            children: node.children.map(updateSizes) as [PaneLayoutNode, PaneLayoutNode],
          };
        };
        return { paneLayout: updateSizes(state.paneLayout) };
      }),

    closePane: (paneId) =>
      set((state) => {
        if (state.panes.length <= 1) return state;
        const removedPane = state.panes.find((pane) => pane.paneId === paneId);
        const nextPanes = state.panes.filter((pane) => pane.paneId !== paneId);
        const retainedSessionIds = new Set(nextPanes.flatMap((pane) => pane.tabSessionIds));
        const removedSessionIds = new Set(
          (removedPane?.tabSessionIds ?? []).filter((id) => !retainedSessionIds.has(id))
        );
        const paneLayout = removePaneNode(state.paneLayout, paneId) ?? {
          type: "pane" as const,
          paneId: nextPanes[0]!.paneId,
        };
        const activePaneId =
          state.activePaneId === paneId ? nextPanes[nextPanes.length - 1]!.paneId : state.activePaneId;
        const activeSessionId = nextPanes.find((pane) => pane.paneId === activePaneId)?.sessionId ?? null;
        return {
          panes: nextPanes,
          paneLayout,
          activePaneId,
          activeSessionId,
          tabs: state.tabs.filter((tab) => !removedSessionIds.has(tab.sessionId)),
          paneSizes: equalPaneSizes(nextPanes.length),
        };
      }),

    activatePane: (paneId) => {
      const pane = get().panes.find((item) => item.paneId === paneId);
      set({ activePaneId: paneId, activeSessionId: pane?.sessionId ?? null });
    },

    moveTabToPane: (sessionId, paneId) =>
      set((state) => {
        if (!state.tabs.some((tab) => tab.sessionId === sessionId)) return state;
        const targetPane = state.panes.find((pane) => pane.paneId === paneId);
        if (!targetPane || targetPane.sessionId === sessionId) return state;

        const sourcePane =
          state.panes.find(
            (pane) => pane.paneId === state.activePaneId && pane.tabSessionIds.includes(sessionId)
          ) ?? state.panes.find((pane) => pane.tabSessionIds.includes(sessionId));
        const movedPanes = state.panes.map((pane) => {
          if (pane.paneId === paneId) {
            return {
              ...pane,
              sessionId,
              tabSessionIds: pane.tabSessionIds.includes(sessionId)
                ? pane.tabSessionIds
                : [...pane.tabSessionIds, sessionId],
            };
          }
          if (sourcePane && pane.paneId === sourcePane.paneId) {
            const tabSessionIds = pane.tabSessionIds.filter((id) => id !== sessionId);
            return {
              ...pane,
              sessionId: pane.sessionId === sessionId ? tabSessionIds.at(-1) ?? null : pane.sessionId,
              tabSessionIds,
            };
          }
          return pane;
        });

        const sourceIsEmpty = sourcePane
          ? movedPanes.find((pane) => pane.paneId === sourcePane.paneId)?.tabSessionIds.length === 0
          : false;
        const panes = sourceIsEmpty
          ? movedPanes.filter((pane) => pane.paneId !== sourcePane!.paneId)
          : movedPanes;

        return {
          panes,
          paneLayout: sourceIsEmpty
            ? removePaneNode(state.paneLayout, sourcePane!.paneId) ?? state.paneLayout
            : state.paneLayout,
          paneSizes: sourceIsEmpty ? equalPaneSizes(panes.length) : state.paneSizes,
          activePaneId: paneId,
          activeSessionId: sessionId,
        };
      }),

    moveTabInPane: (fromSessionId, toSessionId, paneId) =>
      set((state) => {
        const pane = state.panes.find((item) => item.paneId === paneId);
        if (!pane) return state;
        const fromIndex = pane.tabSessionIds.indexOf(fromSessionId);
        const toIndex = pane.tabSessionIds.indexOf(toSessionId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return state;
        const tabSessionIds = [...pane.tabSessionIds];
        tabSessionIds.splice(fromIndex, 1);
        tabSessionIds.splice(toIndex, 0, fromSessionId);
        return {
          panes: state.panes.map((item) =>
            item.paneId === paneId ? { ...item, tabSessionIds } : item
          ),
        };
      }),

    setPaneSizes: (sizes) => set({ paneSizes: sizes }),

    moveTab: (fromIndex, toIndex) =>
      set((state) => {
        if (fromIndex === toIndex) return state;
        const tabs = [...state.tabs];
        const [moved] = tabs.splice(fromIndex, 1);
        tabs.splice(toIndex, 0, moved);
        return { tabs };
      }),

    setTabDynamicTitle: (sessionId, title) =>
      set((state) => {
        const index = state.tabs.findIndex((t) => t.sessionId === sessionId);
        if (index === -1) {
          return state;
        }
        const current = state.tabs[index];
        if ((current.dynamicTitle ?? null) === title) {
          return state;
        }
        const tabs = state.tabs.slice();
        if (title === null) {
          const { dynamicTitle: _cleared, ...rest } = current;
          tabs[index] = rest;
        } else {
          tabs[index] = { ...current, dynamicTitle: title };
        }
        return { tabs };
      }),

    setTabProcessTitle: (sessionId, name) =>
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId);
        if (index === -1) {
          return state;
        }

        const current = state.tabs[index];
        if ((current.processTitle ?? null) === name) {
          return state;
        }

        const tabs = [...state.tabs];
        if (name === null) {
          const { processTitle: _cleared, ...rest } = current;
          tabs[index] = rest;
        } else {
          tabs[index] = { ...current, processTitle: name };
        }

        return { tabs };
      }),

    setTabPluginData: (sessionId, pluginId, data) =>
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId);
        if (index === -1) return state;
        const current = state.tabs[index].pluginData ?? {};
        const next = { ...current };
        if (data === null) delete next[pluginId];
        else next[pluginId] = data;
        if (JSON.stringify(current[pluginId]) === JSON.stringify(next[pluginId])) return state;
        const tabs = [...state.tabs];
        tabs[index] = { ...tabs[index], pluginData: next };
        return { tabs };
      }),

    setTabFontSize: (sessionId, fontSize) =>
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.sessionId === sessionId);
        if (index === -1 || isRendererOwnedTab(state.tabs[index])) {
          return state;
        }

        const normalizedFontSize = normalizeTerminalFontSize(fontSize);
        if (state.tabs[index].fontSize === normalizedFontSize) {
          return state;
        }

        const tabs = [...state.tabs];
        tabs[index] = { ...tabs[index], fontSize: normalizedFontSize };
        return { tabs };
      }),
  }));
}

export const layoutStore = createLayoutStore();

function isRendererOwnedTab(tab: LayoutTab): boolean {
  return tab.type === "plugin" || Boolean(tab.pluginId);
}

export function serializeWorkspaceLayout(
  state: Pick<
    LayoutState,
    "tabs" | "splitDirection" | "paneSizes" | "panes"
  >
): WorkspaceLayout {
  // Plugin tabs are transient renderer-owned views, not restorable sessions.
  const transientSessionIds = new Set(
    state.tabs.filter(isRendererOwnedTab).map((tab) => tab.sessionId)
  );

  // Panes go with their tabs: a pane hosting an omitted plugin tab is not counted,
  // or paneSizes would describe panes the restored layout doesn't have — a
  // single surviving pane rendered at its old 50% width, half the workspace
  // blank. When any pane is dropped the remaining sizes no longer sum to 100,
  // so they are re-derived rather than partially kept.
  const keptPaneCount = Math.max(
    1,
    state.panes.filter(
      (pane) => pane.sessionId === null || !transientSessionIds.has(pane.sessionId)
    ).length
  );

  return {
    tabs: state.tabs
      .filter((tab) => !isRendererOwnedTab(tab))
      .map((tab) => ({
        transport: tab.transport ?? "ssh",
        profileId: tab.profileId ?? tab.sessionId,
        title: tab.title,
        type: "terminal",
        hostId: tab.hostId,
        fontSize: tab.fontSize,
        pluginData: tab.pluginData,
      })),
    splitDirection: state.splitDirection,
    paneSizes:
      keptPaneCount === state.panes.length
        ? state.paneSizes
        : equalPaneSizes(keptPaneCount),
    paneCount: keptPaneCount,
  };
}

/**
 * Filters a saved layout down to the tabs that can actually be reopened.
 *
 * Older workspaces may contain renderer-owned views that cannot be restored
 * as backend sessions. Untyped legacy records are treated as terminal tabs.
 */
export function restorableWorkspaceTabs(tabs: WorkspaceTab[]): WorkspaceTab[] {
  return tabs.filter((tab) => tab.type === undefined || tab.type === "terminal");
}

export function workspaceTabToLayoutTab(
  tab: WorkspaceTab,
  sessionId: string
): LayoutTab {
  return {
    sessionId,
    title: tab.title,
    transport: tab.transport,
    profileId: tab.profileId,
    type: tab.type ?? "terminal",
    hostId: tab.hostId,
    fontSize: tab.fontSize,
    pluginData: tab.pluginData,
  };
}

/**
 * Processes that keep their own OSC title current (e.g. Claude Code emits the
 * session topic). For these the generic process name would mask a better
 * title, so the dynamic title wins when present.
 */
const SELF_TITLED_PROCESSES = new Set(["claude"]);

/** Single source of truth for what a tab is called. */
export function resolveTabTitle(tab: LayoutTab): string {
  if (tab.processTitle && SELF_TITLED_PROCESSES.has(tab.processTitle) && tab.dynamicTitle) {
    return tab.dynamicTitle;
  }
  return tab.processTitle ?? tab.dynamicTitle ?? tab.title;
}

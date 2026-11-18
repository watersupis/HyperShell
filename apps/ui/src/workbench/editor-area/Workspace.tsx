import { Fragment, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { getShell } from "../shared/shell";
import { useStore } from "zustand";

import { ErrorBoundary } from "../shared/ErrorBoundary";
import { WelcomeScreen } from "./welcome";
import { requestTerminalFocus } from "./terminal/terminalFocus";
import { settingsStore } from "../shell/settings/settingsStore";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { resolveTabTitle, type LayoutTab, type Pane, type PaneLayoutNode, layoutStore } from "./layoutStore";
import { PaneResizeHandle } from "./PaneResizeHandle";
import { TabBar, TabDragPreview } from "./TabBar";
import { useI18n } from "../shared/i18n";
import { getInternalPluginForTab, getInternalPluginForTransport, getInternalPluginPanelViews, internalPlugins, isPluginWorkspaceTab, workspaceFeatureRegistry } from "../plugin-runtime/internalPluginRegistry";
import { PluginWorkspace } from "../plugin-runtime/PluginWorkspace";
import { useSecondarySidebarStore } from "../plugin-runtime/secondarySidebarStore";
import { sessionInputRouterStore } from "../plugin-runtime/sessionInputRouter";
import { PluginWorkbenchPanel } from "../plugin-runtime/PluginWorkbenchPanel";
import { SandboxedPluginFrame } from "../plugin-runtime/SandboxedPluginFrame";
import { pluginUiSlots } from "../slots/pluginUiSlots";
import { useWorkspacePluginContributions } from "../plugin-runtime/useWorkspacePluginContributions";
import { InternalPluginLaunchers } from "../plugin-runtime/InternalPluginLaunchers";
import { internalPluginUiHostServices } from "../plugin-runtime/internalPluginUiHostServices";
import { pluginPanelViewId, useWorkbenchPanelStore } from "../panel/panelStore";
import { useRecordingStore } from "../../../../../plugins/builtin/session-recording/ui/recordingStore";
import { PluginIcon } from "../plugin-runtime/PluginIcon";

const { terminal: TerminalPane } = workspaceFeatureRegistry;
const COMMAND_BROADCAST_OWNER = "com.hypershell.quick-command-center:broadcast";
const QUICK_COMMAND_CENTER_ID = "com.hypershell.quick-command-center";

const tabDropCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args).filter(
    (collision) => collision.id !== args.active.id
  );
  if (pointerCollisions.length === 0) return rectIntersection(args);

  return pointerCollisions.sort((left, right) => {
    const leftData = args.droppableContainers.find((container) => container.id === left.id)?.data.current as
      | { sessionId?: string }
      | undefined;
    const rightData = args.droppableContainers.find((container) => container.id === right.id)?.data.current as
      | { sessionId?: string }
      | undefined;
    return Number(Boolean(rightData?.sessionId)) - Number(Boolean(leftData?.sessionId));
  });
};

function PaneView({
  pane,
  isActive,
  activeSessionId,
  launcherContent,
  workspaceActions,
  onActivate,
  onCloseTab,
}: {
  pane: Pane;
  isActive: boolean;
  activeSessionId: string | null;

  launcherContent: ReactNode;
  workspaceActions?: ReactNode;
  onActivate: () => void;
  onCloseTab: (sessionId: string, paneId: string) => void;
}) {
  const { setNodeRef: setDropRef } = useDroppable({
    id: `pane-drop-${pane.paneId}`,
    data: { paneId: pane.paneId },
  });
  const { t } = useI18n();
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const paneTabs = pane.tabSessionIds
    .map((sessionId) => tabs.find((tab) => tab.sessionId === sessionId))
    .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab));
  const terminalTabs = paneTabs.filter((tab) => !isPluginWorkspaceTab(tab));
  const pluginTabs = paneTabs.filter(isPluginWorkspaceTab);
  const hasTabForSession = (sessionId: string | null) =>
    sessionId ? paneTabs.some((t) => t.sessionId === sessionId) : false;
  const resolvedSessionId =
    pane.sessionId && hasTabForSession(pane.sessionId)
      ? pane.sessionId
      : isActive && activeSessionId && hasTabForSession(activeSessionId)
        ? activeSessionId
        : pane.sessionId;
  return (
    // Redundant pointer shortcut: panes are reachable by focus and the
    // Ctrl+Shift+[ / ] pane-navigation shortcuts.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={setDropRef}
      className={`h-full w-full min-h-0 min-w-0 border-l border-border/40 first:border-l-0 relative flex flex-col ${
        isActive ? "shadow-[inset_0_1px_0_rgba(56,189,248,0.22)]" : ""
      }`}
      onClick={onActivate}
      onContextMenu={onActivate}
    >
      <div className="h-11 w-full min-w-0 shrink-0 border-b border-border-bright">
        <TabBar
          tabs={paneTabs}
          activeSessionId={resolvedSessionId}
          onActivate={(sessionId) => {
            layoutStore.getState().activateTab(sessionId, pane.paneId);
            requestTerminalFocus(sessionId);
          }}
          onClose={(sessionId) => onCloseTab(sessionId, pane.paneId)}
          onCloseOthers={(sessionId) => {
            pane.tabSessionIds
              .filter((id) => id !== sessionId)
              .forEach((id) => onCloseTab(id, pane.paneId));
          }}
          onCloseToRight={(sessionId) => {
            const index = pane.tabSessionIds.indexOf(sessionId);
            pane.tabSessionIds.slice(index + 1).forEach((id) => onCloseTab(id, pane.paneId));
          }}
          onSplit={(sessionId, direction) => layoutStore.getState().splitPane(sessionId, direction)}
          currentPaneId={pane.paneId}
          panes={layoutStore.getState().panes}
          onMoveToPane={(sessionId, paneId) => layoutStore.getState().moveTabToPane(sessionId, paneId)}
          launcherContent={launcherContent}
          rightContent={workspaceActions}
        />
      </div>
      <div className="relative min-h-0 flex-1">
      {pluginTabs.map((tab) => {
        const isVisible = tab.sessionId === resolvedSessionId;
        const internalPlugin = getInternalPluginForTab(tab);
        const InternalTab = internalPlugin?.workspaceTabRenderer;
        return (
          <div
            key={tab.tabKey ?? tab.sessionId}
            className={`absolute inset-0 flex flex-col ${isVisible ? "z-10" : "invisible pointer-events-none"}`}
          >
            {InternalTab && internalPlugin?.getWorkspaceTabProps ? (
              <InternalTab
                host={internalPluginUiHostServices}
                {...internalPlugin.getWorkspaceTabProps(
                  tab,
                  isVisible,
                  () => onCloseTab(tab.sessionId, pane.paneId)
                )}
              />
            ) : tab.pluginId ? (
              <PluginWorkspace
                pluginId={tab.pluginId}
                hostId={tab.hostId}
                onClose={() => onCloseTab(tab.sessionId, pane.paneId)}
                onOpenSettings={() => window.dispatchEvent(new Event("hypershell:open-plugin-settings"))}
              />
            ) : null}
          </div>
        );
      })}

      {!resolvedSessionId && terminalTabs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
          {t("Empty pane")}
        </div>
      )}

      {!resolvedSessionId && terminalTabs.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
          {t("Select a session tab")}
        </div>
      )}
      </div>
    </div>
  );
}

function PaneLayoutView({
  node,
  enabledInternalPluginIds,
  terminalToolbarPlugins,
  panes,
  activePaneId,
  activeSessionId,
  openTab,
  launcherContent,
  workspaceActions,
  onActivatePane,
  onCloseTab,
  onCloseOrphanedTab,
}: {
  node: PaneLayoutNode;
  enabledInternalPluginIds: ReadonlySet<string>;
  terminalToolbarPlugins: Array<{ id: string; name: string; slots: string[]; placement: string }>;
  panes: Pane[];
  activePaneId: string;
  activeSessionId: string | null;
  openTab: (tab: LayoutTab) => void;
  launcherContent: ReactNode;
  workspaceActions: ReactNode;
  onActivatePane: (paneId: string) => void;
  onCloseTab: (sessionId: string, paneId: string) => void;
  onCloseOrphanedTab: (sessionId: string) => void;
}) {
  const activeSidebarPlugin = useStore(useSecondarySidebarStore, (state) => state.plugin);
  const panelIsOpen = useStore(useWorkbenchPanelStore, (state) => state.isOpen);
  const activePanelViewId = useStore(useWorkbenchPanelStore, (state) => state.activeViewId);
  const setSplitSizes = useStore(layoutStore, (state) => state.setSplitSizes);
  const tabs = useStore(layoutStore, (state) => state.tabs);
  const [draggedTab, setDraggedTab] = useState<LayoutTab | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizingSplitSizesRef = useRef(new Map<string, number[]>());
  const paneFrames: Array<{ paneId: string; left: number; top: number; width: number; height: number }> = [];
  const splitFrames: Array<{
    groupId: string;
    direction: "horizontal" | "vertical";
    sizes: number[];
    left: number;
    top: number;
    width: number;
    height: number;
  }> = [];

  const collectFrames = (
    current: PaneLayoutNode,
    frame: { left: number; top: number; width: number; height: number }
  ) => {
    if (current.type === "pane") {
      paneFrames.push({ paneId: current.paneId, ...frame });
      return;
    }

    const firstRatio = current.sizes[0] / 100;
    splitFrames.push({ groupId: current.groupId, direction: current.direction, sizes: current.sizes, ...frame });
    if (current.direction === "horizontal") {
      const firstWidth = frame.width * firstRatio;
      collectFrames(current.children[0], { ...frame, width: firstWidth });
      collectFrames(current.children[1], {
        ...frame,
        left: frame.left + firstWidth,
        width: frame.width - firstWidth,
      });
      return;
    }

    const firstHeight = frame.height * firstRatio;
    collectFrames(current.children[0], { ...frame, height: firstHeight });
    collectFrames(current.children[1], {
      ...frame,
      top: frame.top + firstHeight,
      height: frame.height - firstHeight,
    });
  };

  collectFrames(node, { left: 0, top: 0, width: 100, height: 100 });
  const toolbarPaneId =
    paneFrames.find(
      (frame) => frame.top < 0.001 && frame.left + frame.width > 99.999
    )?.paneId ?? paneFrames[0]?.paneId;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const handleTabDragEnd = (event: DragEndEvent) => {
    setDraggedTab(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const source = active.data.current as { paneId?: string; sessionId?: string } | undefined;
    const target = over.data.current as { paneId?: string; sessionId?: string } | undefined;
    if (!source?.paneId || !source.sessionId || !target?.paneId) return;

    const store = layoutStore.getState();
    if (source.paneId === target.paneId) {
      if (target.sessionId) {
        store.moveTabInPane(source.sessionId, target.sessionId, source.paneId);
      }
      return;
    }

    if (source.sessionId === target.sessionId) return;
    store.moveTabToPane(source.sessionId, target.paneId);
    if (target.sessionId) {
      layoutStore.getState().moveTabInPane(source.sessionId, target.sessionId, target.paneId);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={tabDropCollisionDetection}
      onDragStart={({ active }) => {
        const sessionId = (active.data.current as { sessionId?: string } | undefined)?.sessionId;
        setDraggedTab(tabs.find((tab) => tab.sessionId === sessionId) ?? null);
      }}
      onDragEnd={handleTabDragEnd}
      onDragCancel={() => setDraggedTab(null)}
    >
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {draggedTab ? <TabDragPreview tab={draggedTab} /> : null}
      </DragOverlay>
    <div ref={containerRef} className="relative h-full min-h-0 min-w-0 overflow-hidden">
      {paneFrames.map((frame) => {
        const pane = panes.find((item) => item.paneId === frame.paneId);
        if (!pane) return null;
        return (
          <div
            key={pane.paneId}
            className="absolute min-h-0 min-w-0"
            style={{
              left: `${frame.left}%`,
              top: `${frame.top}%`,
              width: `${frame.width}%`,
              height: `${frame.height}%`,
            }}
          >
            <PaneView
              pane={pane}
              isActive={pane.paneId === activePaneId}
              activeSessionId={activeSessionId}
              launcherContent={launcherContent}
              workspaceActions={pane.paneId === toolbarPaneId ? workspaceActions : null}
              onActivate={() => onActivatePane(pane.paneId)}
              onCloseTab={onCloseTab}
            />
          </div>
        );
      })}
      {tabs.filter((tab) => !isPluginWorkspaceTab(tab)).map((tab) => {
        const pane = panes.find((item) => item.tabSessionIds.includes(tab.sessionId));
        const frame = paneFrames.find((item) => item.paneId === pane?.paneId);
        if (!pane || !frame) return null;

        const paneTabs = pane.tabSessionIds
          .map((sessionId) => tabs.find((item) => item.sessionId === sessionId))
          .filter((item): item is LayoutTab => Boolean(item));
        const resolvedSessionId = pane.sessionId && paneTabs.some((item) => item.sessionId === pane.sessionId)
          ? pane.sessionId
          : pane.paneId === activePaneId && activeSessionId && paneTabs.some((item) => item.sessionId === activeSessionId)
            ? activeSessionId
            : pane.sessionId;
        const activeTransientTab = paneTabs.some((item) => item.sessionId === resolvedSessionId && isPluginWorkspaceTab(item));
        const isVisible = !activeTransientTab && tab.sessionId === resolvedSessionId;
        const terminalTransport = tab.transport === "serial"
          ? "serial"
          : tab.transport === "telnet"
            ? "telnet"
            : tab.transport === "local"
              ? "local"
              : "ssh";

        return (
          <div
            key={tab.tabKey ?? tab.sessionId}
            className={`absolute min-h-0 min-w-0 flex flex-col ${isVisible ? "z-10" : "invisible pointer-events-none"}`}
            onFocusCapture={() => onActivatePane(pane.paneId)}
            style={{
              left: `${frame.left}%`,
              top: `calc(${frame.top}% + 44px)`,
              width: `${frame.width}%`,
              height: `calc(${frame.height}% - 44px)`,
            }}
          >
            <Suspense fallback={null}>
              <TerminalPane
                transport={terminalTransport}
                profileId={tab.profileId ?? tab.sessionId}
                sessionName={resolveTabTitle(tab)}
                sessionId={tab.preopened ? tab.sessionId : undefined}
                autoConnect={!tab.preopened && (tab.autoConnect || pane.paneId === activePaneId)}
                isVisible={isVisible}
                isActivePane={isVisible && pane.paneId === activePaneId}
                telnetOptions={tab.telnetOptions}
                tmuxAttachTarget={tab.tmuxAttachTarget}
                sessionOpenData={getInternalPluginForTransport(tab.transport)?.getSessionOpenData?.(tab)}
                sessionOpenPrompt={getInternalPluginForTransport(tab.transport)?.sessionOpenPrompt}
                sessionOpenPromptHost={internalPluginUiHostServices}
                fontSize={tab.fontSize ?? settingsStore.getState().settings.terminal.fontSize}
                onFontSizeChange={(fontSize) => layoutStore.getState().setTabFontSize(tab.sessionId, fontSize)}
                onSessionOpened={(sessionId) => layoutStore.getState().replaceSessionId(tab.sessionId, sessionId)}
                onPluginData={(sessionId, pluginId, data) => {
                  layoutStore.getState().setTabPluginData(sessionId, pluginId, data);
                }}
                onProcessExit={(exitCode) => {
                  if (tab.transport === "local" && exitCode === 0) onCloseOrphanedTab(tab.sessionId);
                }}
                renderToolbar={(session) => internalPlugins
                  .filter((plugin) => enabledInternalPluginIds.has(plugin.id) && plugin.terminalToolbar)
                  .map((plugin) => {
                    const TerminalToolbar = plugin.terminalToolbar!;
                    return (
                      <TerminalToolbar
                        key={plugin.id}
                        session={session}
                        host={internalPluginUiHostServices}
                        openTab={openTab}
                      />
                    );
                  }).concat(session.transport === "ssh" && session.hostId ? terminalToolbarPlugins
                    .map((plugin) => {
                      const pluginTabId = `plugin-tab-${plugin.id}-${session.hostId}`;
                      const isSidebarPlacement = plugin.placement === pluginUiSlots.secondarySidebar;
                      const isPanelPlacement = plugin.placement === pluginUiSlots.panel;
                      const active = isSidebarPlacement
                        ? activeSidebarPlugin?.source === "external" && activeSidebarPlugin.pluginId === plugin.id && activeSidebarPlugin.hostId === session.hostId
                        : isPanelPlacement
                          ? panelIsOpen && activePanelViewId === pluginPanelViewId(plugin.id)
                          : activeSessionId === pluginTabId;
                      return (
                        <button
                          key={plugin.id}
                          type="button"
                          aria-label={plugin.name}
                          aria-pressed={active}
                          title={plugin.name}
                          onClick={() => {
                            if (isSidebarPlacement) {
                              if (active) useSecondarySidebarStore.getState().closePlugin();
                              else useSecondarySidebarStore.getState().openPlugin({ pluginId: plugin.id, hostId: session.hostId!, title: plugin.name });
                            } else if (isPanelPlacement) {
                              useWorkbenchPanelStore.getState().openView(pluginPanelViewId(plugin.id), { hostId: session.hostId! });
                            } else {
                              const currentLayout = layoutStore.getState();
                              const existingPane = currentLayout.panes.find((item) => item.tabSessionIds.includes(pluginTabId));
                              if (existingPane) currentLayout.activateTab(pluginTabId, existingPane.paneId);
                              else openTab({ sessionId: pluginTabId, title: `${plugin.name} · ${session.title}`, type: "plugin", pluginId: plugin.id, hostId: session.hostId! });
                            }
                          }}
                          className={`rounded p-1 transition-colors ${active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"}`}
                        >
                          <PluginIcon pluginId={plugin.id} size={14} />
                        </button>
                      );
                    }) : [])}
              />
            </Suspense>
          </div>
        );
      })}
      {splitFrames.map((frame) => {
        const isHorizontal = frame.direction === "horizontal";
        const onResize = (delta: number) => {
          const container = containerRef.current;
          if (!container) return;
          const total = isHorizontal
            ? (container.clientWidth * frame.width) / 100
            : (container.clientHeight * frame.height) / 100;
          if (total <= 0) return;
          const change = (delta / total) * 100;
          const sizes = resizingSplitSizesRef.current.get(frame.groupId) ?? frame.sizes;
          const first = sizes[0] + change;
          const second = sizes[1] - change;
          if (first >= 10 && second >= 10) {
            const nextSizes = [first, second];
            resizingSplitSizesRef.current.set(frame.groupId, nextSizes);
            setSplitSizes(frame.groupId, nextSizes);
          }
        };
        const boundary = frame.sizes[0] / 100;
        return (
          <PaneResizeHandle
            key={frame.groupId}
            direction={frame.direction}
            onResize={onResize}
            onResizeEnd={() => resizingSplitSizesRef.current.delete(frame.groupId)}
            className={isHorizontal ? "h-full" : "w-full"}
            style={
              isHorizontal
                ? {
                    position: "absolute",
                    zIndex: 30,
                    left: `${frame.left + frame.width * boundary}%`,
                    top: `${frame.top}%`,
                    height: `${frame.height}%`,
                    transform: "translateX(-50%)",
                  }
                : {
                    position: "absolute",
                    zIndex: 30,
                    left: `${frame.left}%`,
                    top: `${frame.top + frame.height * boundary}%`,
                    width: `${frame.width}%`,
                    transform: "translateY(-50%)",
                  }
            }
          />
        );
      })}
    </div>
    </DndContext>
  );
}

interface WorkspaceProps {
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  enabledInternalPluginIds: ReadonlySet<string>;
}

export function Workspace({ onConnectSsh, enabledInternalPluginIds }: WorkspaceProps) {
  const { t } = useI18n();
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const availableBroadcastSessions = useMemo(() => [...new Map(
    tabs.filter((tab) => !isPluginWorkspaceTab(tab)).map((tab) => [tab.sessionId, tab])
  ).values()], [tabs]);
  const availableBroadcastSessionIds = useMemo(() => availableBroadcastSessions.map((tab) => tab.sessionId), [availableBroadcastSessions]);
  const { plugins, toolbarPlugins, panelPlugins, pluginsLoaded, activeHeaderPlugin, pluginPanel, sessionTargets: headerSessionTargets } =
    useWorkspacePluginContributions(tabs);
  const terminalToolbarPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.slots.includes(pluginUiSlots.terminalToolbar)),
    [plugins]
  );
  const panelIsOpen = useStore(useWorkbenchPanelStore, (state) => state.isOpen);
  const activePanelViewId = useStore(useWorkbenchPanelStore, (state) => state.activeViewId);
  const openTab = useStore(layoutStore, (state) => state.openTab);
  const launcherContent = (
    <InternalPluginLaunchers
      enabledPluginIds={enabledInternalPluginIds}
      surface="tabbar"
      openTab={openTab}
    />
  );
  const welcomeLauncherContent = (
    <InternalPluginLaunchers
      enabledPluginIds={enabledInternalPluginIds}
      surface="welcome"
      openTab={openTab}
    />
  );
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);
  const panes = useStore(layoutStore, (s) => s.panes);
  const paneLayout = useStore(layoutStore, (s) => s.paneLayout);
  const activePaneId = useStore(layoutStore, (s) => s.activePaneId);
  const activatePane = useStore(layoutStore, (s) => s.activatePane);
  const [headerContributionVisible, setHeaderContributionVisible] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastSessionIds, setBroadcastSessionIds] = useState<string[]>([]);
  const hasPanelViews = panelPlugins.length > 0 || getInternalPluginPanelViews(enabledInternalPluginIds).length > 0;
  const openRecordingLibrary = useRecordingStore((state) => state.openLibrary);

  useEffect(() => () => sessionInputRouterStore.getState().removeRoute(COMMAND_BROADCAST_OWNER), []);
  useEffect(() => {
    if (!broadcastOpen) return;
    const available = new Set(availableBroadcastSessionIds);
    const next = broadcastSessionIds.filter((id) => available.has(id));
    if (next.length !== broadcastSessionIds.length) {
      setBroadcastSessionIds(next);
      sessionInputRouterStore.getState().setRoute(COMMAND_BROADCAST_OWNER, true, next);
    }
  }, [availableBroadcastSessionIds, broadcastOpen, broadcastSessionIds]);

  const toggleBroadcast = () => {
    if (broadcastOpen) {
      sessionInputRouterStore.getState().removeRoute(COMMAND_BROADCAST_OWNER);
      setBroadcastOpen(false);
      return;
    }
    if (availableBroadcastSessionIds.length === 0) {
      toast.info(t("No active terminal sessions are available for broadcast."));
      return;
    }
    setBroadcastSessionIds(availableBroadcastSessionIds);
    sessionInputRouterStore.getState().setRoute(COMMAND_BROADCAST_OWNER, true, availableBroadcastSessionIds);
    setBroadcastOpen(true);
  };
  const toggleBroadcastSession = (sessionId: string) => {
    const next = broadcastSessionIds.includes(sessionId)
      ? broadcastSessionIds.filter((id) => id !== sessionId)
      : [...broadcastSessionIds, sessionId];
    setBroadcastSessionIds(next);
    sessionInputRouterStore.getState().setRoute(COMMAND_BROADCAST_OWNER, true, next);
  };

  const closeTab = (sessionId: string) => {
    const tab = layoutStore.getState().tabs.find((candidate) => candidate.sessionId === sessionId);
    if (!tab) return;
    closeBackendTab(tab, sessionId);

    layoutStore.setState((state) => {
      const nextTabs = state.tabs.filter((t) => t.sessionId !== sessionId);
      const closingActiveSession = state.activeSessionId === sessionId;
      const nextActive = closingActiveSession
        ? state.panes
            .find((pane) => pane.paneId === state.activePaneId)
            ?.tabSessionIds.filter((id) => id !== sessionId)
            .at(-1) ?? null
        : state.activeSessionId;
      const panes = state.panes.map((pane) => {
        const tabSessionIds = pane.tabSessionIds.filter((id) => id !== sessionId);
        const paneSessionId = pane.sessionId === sessionId ? tabSessionIds.at(-1) ?? null : pane.sessionId;
        return { ...pane, tabSessionIds, sessionId: paneSessionId };
      });
      return { tabs: nextTabs, activeSessionId: nextActive, panes };
    });
  };

  const closeBackendTab = (tab: (typeof tabs)[number], sessionId: string) => {
    const internalPlugin = tab ? getInternalPluginForTab(tab) : undefined;
    if (internalPlugin?.closeWorkspaceTab) return internalPlugin.closeWorkspaceTab(tab, internalPluginUiHostServices);
    if (isPluginWorkspaceTab(tab)) return;
    void getShell().closeSession({ sessionId }).catch(() => {});
  };

  const closeTabInPane = (sessionId: string, paneId: string) => {
    const tab = layoutStore.getState().tabs.find((candidate) => candidate.sessionId === sessionId);
    const removesSession = layoutStore.getState().closeTabInPane(sessionId, paneId);
    if (removesSession && tab) closeBackendTab(tab, sessionId);
  };

  const workspaceActions = (
    <div className="relative flex h-full shrink-0 items-end gap-0.5 px-2 pb-1.5">
      <button type="button" onClick={openRecordingLibrary} className="rounded p-1.5 text-text-muted transition-colors hover:bg-base-700/60 hover:text-text-primary" title={t("Browse recordings")} aria-label={t("Browse recordings")}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H7l1.5 2h4A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
          <circle cx="11.5" cy="10.5" r="2.5" fill="var(--color-base-800)" />
          <path d="M11.5 9v1.6l1 .6" strokeLinecap="round" />
        </svg>
      </button>
      {toolbarPlugins.map((plugin) => (
        <button
          key={plugin.id}
          onClick={() => {
            if (plugin.slots.includes(pluginUiSlots.panel)) {
              const panelStore = useWorkbenchPanelStore.getState();
              if (panelStore.isOpen && panelStore.activeViewId === pluginPanelViewId(plugin.id)) panelStore.close();
              else panelStore.openView(pluginPanelViewId(plugin.id));
              return;
            }
            if (plugin.slots.includes(pluginUiSlots.workspaceTab)) {
              const sessionId = `plugin-tab-${plugin.id}-all`;
              const existingPane = layoutStore.getState().panes.find((pane) => pane.tabSessionIds.includes(sessionId));
              if (existingPane) {
                layoutStore.getState().activateTab(sessionId, existingPane.paneId);
                return;
              }
              openTab({
                sessionId,
                title: plugin.name,
                type: "plugin",
                pluginId: plugin.id,
              });
              return;
            }
            if (pluginPanel?.source === "external" && pluginPanel.pluginId === plugin.id) useSecondarySidebarStore.getState().closePlugin();
            else useSecondarySidebarStore.getState().openPlugin({ pluginId: plugin.id, title: plugin.name });
          }}
          className={`rounded p-1.5 transition-colors ${plugin.slots.includes(pluginUiSlots.panel)
            ? panelIsOpen && activePanelViewId === pluginPanelViewId(plugin.id) ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"
            : pluginPanel?.source === "external" && pluginPanel.pluginId === plugin.id ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"}`}
          title={plugin.name}
          aria-label={plugin.name}
        >
          <PluginIcon pluginId={plugin.id} size={14} />
        </button>
      ))}
      {internalPlugins.filter((plugin) => enabledInternalPluginIds.has(plugin.id) && plugin.workspaceToolbarButton).map((plugin) => {
        const ToolbarButton = plugin.workspaceToolbarButton!;
        const active = pluginPanel?.source === "builtin" && pluginPanel.pluginId === plugin.id;
        return (
          <Fragment key={plugin.id}>
            {plugin.id === QUICK_COMMAND_CENTER_ID && <button
              type="button"
              onClick={toggleBroadcast}
              aria-pressed={broadcastOpen}
              aria-label={t("Toggle command broadcast")}
              title={t("Toggle command broadcast")}
              className={`rounded p-1.5 transition-colors disabled:opacity-40 ${broadcastOpen ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="1.5" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
              </svg>
            </button>}
            <ToolbarButton
              active={active}
              host={internalPluginUiHostServices}
              onToggle={() => {
                if (active) useSecondarySidebarStore.getState().closePlugin();
                else useSecondarySidebarStore.getState().openBuiltinPlugin({ pluginId: plugin.id, title: plugin.title });
              }}
            />
          </Fragment>
        );
      })}
      {hasPanelViews && (
        <button
          type="button"
          onClick={() => useWorkbenchPanelStore.getState().toggle()}
          className={`rounded p-1.5 transition-colors ${panelIsOpen ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"}`}
          title={t("Toggle panel")}
          aria-label={t("Toggle panel")}
          aria-pressed={panelIsOpen}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="2" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2 9.5H14" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="terminal-content-frame relative w-full min-w-0 flex-1 min-h-0 flex flex-col">
        {activeHeaderPlugin && <div className={headerContributionVisible ? "flex h-10 max-h-10 min-h-10 shrink-0 items-stretch overflow-hidden border-b border-border-bright bg-base-800" : "hidden"}>
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            <SandboxedPluginFrame
              key={activeHeaderPlugin.id}
              pluginId={activeHeaderPlugin.id}
              surface={pluginUiSlots.workspaceHeader}
              sessionTargets={headerSessionTargets}
              onClose={() => useSecondarySidebarStore.getState().closePlugin()}
              onSurfaceContributionChange={setHeaderContributionVisible}
              fill
              showHeader={false}
            />
          </div>
          <button type="button" onClick={() => useSecondarySidebarStore.getState().closePlugin()} className="shrink-0 px-3 text-text-muted hover:bg-base-700 hover:text-text-primary" title={t("Close side panel")} aria-label={t("Close side panel")}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </button>
        </div>}
        {broadcastOpen && tabs.length > 0 && <div className="flex min-h-10 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-base-800 px-3 py-1.5">
          <span className="shrink-0 text-xs font-medium text-text-primary">{t("Broadcast input")}</span>
          <div className="flex min-w-0 items-center gap-3">
            {availableBroadcastSessions.map((tab) => {
              const checked = broadcastSessionIds.includes(tab.sessionId);
              const title = resolveTabTitle(tab);
              return <button key={tab.sessionId} type="button" aria-pressed={checked} onClick={() => toggleBroadcastSession(tab.sessionId)} title={title} className={`max-w-52 shrink-0 truncate rounded border px-2 py-1 text-xs transition-colors ${checked ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-text-secondary hover:bg-base-700/70 hover:text-text-primary"}`}>
                {title}
              </button>;
            })}
          </div>
          <span className="ml-auto shrink-0 text-[10px] text-text-muted">{broadcastSessionIds.length}/{availableBroadcastSessions.length}</span>
        </div>}
        {tabs.length > 0 ? (
          <ErrorBoundary>
            <PaneLayoutView
              node={paneLayout}
              enabledInternalPluginIds={enabledInternalPluginIds}
              terminalToolbarPlugins={terminalToolbarPlugins}
              panes={panes}
              activePaneId={activePaneId}
              activeSessionId={activeSessionId}
              openTab={openTab}
              launcherContent={launcherContent}
              workspaceActions={workspaceActions}
              onActivatePane={activatePane}
              onCloseTab={closeTabInPane}
              onCloseOrphanedTab={closeTab}
            />
          </ErrorBoundary>
        ) : (
          <>
            <div className="h-11 w-full shrink-0 border-b border-border-bright bg-base-800">
              <div className="flex h-full justify-end">{workspaceActions}</div>
            </div>
            <WelcomeScreen
              onConnectSsh={onConnectSsh}
              launcherContent={welcomeLauncherContent}
            />
          </>
        )}
      </div>
      <PluginWorkbenchPanel
        enabledInternalPluginIds={enabledInternalPluginIds}
        externalPlugins={panelPlugins}
        pluginsLoaded={pluginsLoaded}
      />
    </div>
  );
}

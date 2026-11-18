import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { toast, Toaster } from "sonner";
import { getShell, hasShell } from "../workbench/shared/shell";

import { AppShell } from "../workbench/shell/AppShell";
import { Modal } from "../workbench/shared/Modal";
import { Workspace } from "../workbench/editor-area/Workspace";
import { requestTerminalFocus } from "../workbench/editor-area/terminal/terminalFocus";
import {
  layoutStore,
  restorableWorkspaceTabs,
  serializeWorkspaceLayout,
  workspaceTabToLayoutTab,
} from "../workbench/editor-area/layoutStore";
import type { PaneLayoutNode } from "../workbench/editor-area/layoutStore";
import { workspacePresetLayout, type WorkspaceLaunchTarget, type WorkspacePreset } from "../workbench/shell/WorkspaceCreator";
import { handlePaneShortcut } from "../workbench/editor-area/paneShortcuts";
const QuickConnectDialog = lazy(() => import("../workbench/shell/quick-connect/QuickConnectDialog").then((module) => ({ default: module.QuickConnectDialog })));
import type { QuickConnectProfile } from "../workbench/shell/quick-connect/searchIndex";
import { sessionRecoveryStore } from "../workbench/shell/session-recovery/sessionRecoveryStore";
const SessionRecoveryDialog = lazy(() => import("../workbench/shell/session-recovery/SessionRecoveryDialog").then((module) => ({ default: module.SessionRecoveryDialog })));
import {
  savedSessionToLayoutTab,
} from "../workbench/shell/session-recovery/savedSessionRestore";
import { Sidebar } from "../workbench/primary-sidebar/Sidebar";
const SettingsPanel = lazy(() => import("../workbench/shell/settings/SettingsPanel").then((module) => ({ default: module.SettingsPanel })));
import { useSecondarySidebarStore } from "../workbench/plugin-runtime/secondarySidebarStore";
import { migrateInternalWorkspaceTab } from "../workbench/plugin-runtime/internalPluginRegistry";
import { pluginPanelViewId, useWorkbenchPanelStore } from "../workbench/panel/panelStore";
import { getPluginSidebarTitle, PluginSecondarySidebarContent } from "../workbench/plugin-runtime/PluginSecondarySidebarContent";
import { settingsStore } from "../workbench/shell/settings/settingsStore";
import { appThemeVariant, resolveAppTheme } from "../workbench/shell/settings/appThemes";
import { resolveTerminalTheme } from "../workbench/editor-area/terminal/terminalTheme";
import type {
  HostFormValue,
  HostRecord as HostDbRecord,
  HostUiRecord as HostRecord,
  SavedSessionRecord,
  TagRecord,
  WorkspaceTab,
} from "@hypershell/shared";
const TelnetQuickConnect = lazy(() => import("../workbench/shell/connections/TelnetQuickConnect").then((module) => ({ default: module.TelnetQuickConnect })));
import { ConnectionChallengeDialogs } from "../workbench/shell/connections/challenges/ConnectionChallengeDialogs";
import {
  answerKeyboardInteractive,
} from "../workbench/shell/connections/challenges/connectionChallengeFlows";
const CommandPalette = lazy(() => import("../workbench/shell/command-palette/CommandPalette").then((module) => ({ default: module.CommandPalette })));
import { useCommandPaletteStore } from "../workbench/shell/command-palette/commandPaletteStore";
import { createCommands, type CommandContext } from "../workbench/shell/command-palette/commandRegistry";
import { useUpdateStore } from "../workbench/shell/updates/updateStore";
import { activateInternalPlugins, internalPlugins, getInternalPluginCommands, getInternalPluginHostEditor, getInternalPluginHostEditorContribution, getInternalPluginQuickConnectProfiles, openInternalPluginQuickConnectProfile, prepareInternalHostConnection, isPluginWorkspaceTab, canRestoreInternalSavedSession, migrateInternalPluginSettings } from "../workbench/plugin-runtime/internalPluginRegistry";
import { InternalPluginOverlays } from "../workbench/plugin-runtime/InternalPluginOverlays";
import { internalPluginUiHostServices } from "../workbench/plugin-runtime/internalPluginUiHostServices";

function DeferredMount({ active, children }: { active: boolean; children: ReactNode }) {
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => {
    if (active) setHasOpened(true);
  }, [active]);
  return active || hasOpened ? <Suspense fallback={null}>{children}</Suspense> : null;
}

async function loadHosts(mapRecord?: (record: HostDbRecord) => unknown): Promise<HostRecord[]> {
  if (!hasShell()) {
    console.warn("[hypershell] preload bridge not available — skipping host list");
    return [];
  }
  try {
    const dbHosts = await getShell().listHosts();
    return mapRecord ? dbHosts.map((record) => mapRecord(record) as HostRecord) : [];
  } catch (err) {
    console.error("[hypershell] failed to load hosts:", err);
    return [];
  }
}

async function loadTags(): Promise<TagRecord[]> {
  if (!hasShell()) {
    return [];
  }
  try {
    return await getShell().listTags();
  } catch (err) {
    console.error("[hypershell] failed to load tags:", err);
    return [];
  }
}

async function attachHostTags(hosts: HostRecord[]): Promise<HostRecord[]> {
  if (!hasShell()) {
    return hosts.map((host) => ({
      ...host,
      tagIds: host.tagIds ?? [],
      tags: host.tags ?? "",
    }));
  }

  const hostTagsById = await Promise.all(
    hosts.map(async (host) => {
      try {
        const hostTags = await getShell().tagsGetHostTags({
          hostId: host.id,
        });
        const safeHostTags = hostTags ?? [];
        return {
          hostId: host.id,
          tagIds: safeHostTags.map((tag) => tag.id),
          tags: safeHostTags.map((tag) => tag.name).join(", "),
        };
      } catch {
        return {
          hostId: host.id,
          tagIds: [] as string[],
          tags: "",
        };
      }
    })
  );

  const map = new Map(
    hostTagsById.map((item) => [item.hostId, { tagIds: item.tagIds, tags: item.tags }])
  );

  return hosts.map((host) => {
    const hostTags = map.get(host.id);
    return {
      ...host,
      tagIds: hostTags?.tagIds ?? [],
      tags: hostTags?.tags ?? "",
    };
  });
}

function useAppTheme() {
  const appTheme = useStore(settingsStore, (s) => s.settings.appearance.appTheme);

  useEffect(() => {
    function apply() {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const id = resolveAppTheme(appTheme, prefersDark);
      const variant = appThemeVariant(id);
      document.documentElement.dataset.theme = id;
      document.documentElement.dataset.variant = variant;
      void getShell().setAppTheme(variant);
    }

    apply();

    if (appTheme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [appTheme]);
}

function MainApp() {
  const [hosts, setHosts] = useState<HostRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<HostRecord | null>(null);
  const [connectingHostIds, setConnectingHostIds] = useState<Set<string>>(() => new Set());
  const [restoreBannerVisible, setRestoreBannerVisible] = useState(false);
  const [lastWorkspaceTabs, setLastWorkspaceTabs] = useState<WorkspaceTab[]>([]);
  const [sessionRecoveryOpen, setSessionRecoveryOpen] = useState(false);
  const [telnetDialogOpen, setTelnetDialogOpen] = useState(false);
  const backupRestoreInFlightRef = useRef(false);
  const [savedRecoverySessions, setSavedRecoverySessions] = useState<SavedSessionRecord[]>([]);
  const [enabledInternalPluginIds, setEnabledInternalPluginIds] = useState<Set<string>>(
    () => new Set(internalPlugins.filter((plugin) => plugin.kind === "core").map((plugin) => plugin.id))
  );
  const HostEditor = getInternalPluginHostEditor(enabledInternalPluginIds);
  const hostEditorContribution = getInternalPluginHostEditorContribution(enabledInternalPluginIds);
  const openTab = useStore(layoutStore, (s) => s.openTab);
  const secondarySidebarTarget = useStore(useSecondarySidebarStore, (s) => s.plugin);
  const closeSecondarySidebar = useSecondarySidebarStore((s) => s.closePlugin);
  const builtinHostActions = useMemo(
    () => internalPlugins
      .filter((plugin) => enabledInternalPluginIds.has(plugin.id))
      .flatMap((plugin) => plugin.getHostActions?.({
        openTab,
        host: {
          isAvailable: internalPluginUiHostServices.isAvailable,
          challenges: internalPluginUiHostServices.challenges,
          sftp: internalPluginUiHostServices.sftp,
          security: internalPluginUiHostServices.security,
          pluginMain: internalPluginUiHostServices.pluginMain,
        },
      }) ?? []),
    [enabledInternalPluginIds, openTab]
  );

  const isCommandPaletteOpen = useCommandPaletteStore((s) => s.isOpen);
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const terminalThemeName = useStore(
    settingsStore,
    (s) => s.settings.terminal.theme
  );
  const customThemes = useStore(settingsStore, (s) => s.settings.customThemes);
  const rememberSession = useStore(sessionRecoveryStore, (s) => s.remember);

  const openPlugin = useCallback((pluginId: string, placement: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel", hostId?: string, title?: string) => {
    if (placement === "workspace.secondarySidebar") {
      useSecondarySidebarStore.getState().openPlugin({ pluginId, hostId, title });
      return;
    }
    if (placement === "workspace.panel") {
      useWorkbenchPanelStore.getState().openView(pluginPanelViewId(pluginId), { hostId });
      return;
    }
    const sessionId = `plugin-tab-${pluginId}-${hostId ?? "all"}`;
    const existingPane = layoutStore.getState().panes.find((pane) => pane.tabSessionIds.includes(sessionId));
    if (existingPane) {
      layoutStore.getState().activateTab(sessionId, existingPane.paneId);
      return;
    }
    openTab({
      sessionId,
      title: title ?? pluginId,
      type: "plugin",
      pluginId,
      hostId,
    });
  }, [openTab]);

  useEffect(() => {
    const openPluginSettings = () => setSettingsOpen(true);
    window.addEventListener("hypershell:open-plugin-settings", openPluginSettings);
    return () => {
      window.removeEventListener("hypershell:open-plugin-settings", openPluginSettings);
    };
  }, []);

  // One transfer-event listener for the whole app — SFTP tabs and the transfer
  // popup subscribe to it instead of the IPC bridge.
  useEffect(() => {
    let cancelled = false;
    let deactivatePlugins: (() => void) | null = null;
    void Promise.all([
      getShell().internalPluginsList(),
      settingsStore.getState().load(),
    ]).then(async ([plugins]) => {
      if (cancelled) return;
      const settings = settingsStore.getState().settings;
      const currentMigrationState = {
        general: { ...settings.general } as Record<string, unknown>,
        pluginSettings: Object.fromEntries(
          Object.entries(settings.pluginSettings).map(([id, values]) => [id, { ...values }])
        ),
      };
      const migratedSettings = migrateInternalPluginSettings(currentMigrationState);
      if (JSON.stringify(currentMigrationState) !== JSON.stringify(migratedSettings)) {
        await settingsStore.getState().applyPluginSettingsMigrations(migratedSettings);
      }
      if (cancelled) return;
      const enabled = new Set(plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.id));
      setEnabledInternalPluginIds(enabled);
      deactivatePlugins = activateInternalPlugins(enabled);
    }).catch((error) => {
      console.warn("[hypershell] failed loading built-in plugin states:", error);
    });

    return () => {
      cancelled = true;
      deactivatePlugins?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([loadHosts(hostEditorContribution?.mapRecord), loadTags()]).then(
      async ([h, loadedTags]) => {
        const hostsWithTags = await attachHostTags(h);
        if (cancelled) {
          return;
        }
        setHosts(hostsWithTags);
        setTags(loadedTags);
      }
    );
    // Settings first: both the restore banner and the recovery prompt are
    // opt-out, and asking before the stored values are known would show them
    // once on every start regardless. One load serves both checks.
    const settingsLoaded = settingsStore.getState().load();

    void settingsLoaded.then(() => {
      if (!settingsStore.getState().settings.general.showRestoreBanner) return;
      return getShell().workspaceLoadLast().then((last) => {
        // Filter here rather than at restore time so the banner's count never
        // promises tabs that cannot come back.
        const restorable = restorableWorkspaceTabs(last?.layout?.tabs ?? []);
        if (restorable.length > 0) {
          setLastWorkspaceTabs(restorable);
          setRestoreBannerVisible(true);
        }
      });
    }).catch(() => {});

    void settingsLoaded
      .then(() => {
        if (!settingsStore.getState().settings.general.showSessionRecoveryPrompt) {
          return;
        }
        return getShell().sessionLoadSavedState().then((sessions) => {
          // Same rule as the banner above: list only what Restore can actually
          // reopen, so the dialog never promises a row that silently vanishes.
          const restorable = sessions.filter(canRestoreInternalSavedSession);
          if (restorable.length === 0) {
            return;
          }
          setSavedRecoverySessions(restorable);
          setSessionRecoveryOpen(true);
        });
      })
      .catch((error) => {
        console.warn("[hypershell] failed loading saved session recovery state:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [hostEditorContribution]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = internalPluginUiHostServices.hostManagement.hosts.subscribeChanged(() => {
      void Promise.all([loadHosts(hostEditorContribution?.mapRecord), loadTags()]).then(async ([loadedHosts, loadedTags]) => {
        if (cancelled) return;
        setHosts(await attachHostTags(loadedHosts));
        setTags(loadedTags);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hostEditorContribution]);

  useEffect(() => {
    const store = useUpdateStore.getState();
    void store.refresh();

    if (!hasShell()) {
      return;
    }
    return getShell().onUpdateState((state) => {
      useUpdateStore.getState().applyState(state);
    });
  }, []);

  // Auto-save workspace on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const state = layoutStore.getState();
      if (state.tabs.length === 0) return;
      const layout = serializeWorkspaceLayout(state);
      void getShell().workspaceSaveLast(layout);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const activeSessionHostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tab of tabs) {
      const match = tab.sessionId.match(/^ssh-(.+)-\d+$/);
      if (match) ids.add(match[1]);
      if (tab.hostId) ids.add(tab.hostId);
    }
    return ids;
  }, [tabs]);

  useEffect(() => {
    setConnectingHostIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        if (activeSessionHostIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeSessionHostIds]);

  useEffect(() => {
    for (const tab of tabs) {
      if (!isPluginWorkspaceTab(tab)) rememberSession(tab.sessionId);
    }
  }, [rememberSession, tabs]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (handlePaneShortcut(layoutStore, e)) {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useCommandPaletteStore.getState().toggle();
        return;
      }
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsQuickConnectOpen(true);
      }
      if (e.key === "," && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return getShell().onQuickConnect(() => {
      setIsQuickConnectOpen(true);
    });
  }, []);

  // Keyboard-interactive auth (2FA) relay
  useEffect(() => {
    return getShell().onKeyboardInteractive((request) => {
      void answerKeyboardInteractive(request);
    });
  }, []);

  useAppTheme();

  useEffect(() => {
    const terminalBg = resolveTerminalTheme(terminalThemeName, customThemes).background;
    document.documentElement.style.setProperty("--terminal-bg", terminalBg);
  }, [terminalThemeName, customThemes]);

  const openHostTab = useCallback(
    (host: HostRecord, tmuxAttachTarget?: string) => {
      setConnectingHostIds((prev) => new Set(prev).add(host.id));
      const optimisticSessionId = `ssh-${host.id}-${Date.now()}`;
      openTab({
        tabKey: optimisticSessionId,
        sessionId: optimisticSessionId,
        title: host.name,
        transport: "ssh",
        // Use stable host id so main process resolves the exact saved host record
        // (auth method, password ref, identity file, proxy jump, keep-alive, etc.).
        profileId: host.id,
        hostId: host.id,
        preopened: false,
        tmuxAttachTarget,
      });
      return optimisticSessionId;
    },
    [openTab]
  );

  const connectHost = useCallback(
    async (host: HostRecord) => {
      const connection = await prepareInternalHostConnection(
        {
          id: host.id,
          name: host.name,
          hostname: host.hostname,
          port: host.port,
          username: host.username,
          hostProfileId: host.hostProfileId,
          profile: host,
        },
        enabledInternalPluginIds,
        internalPluginUiHostServices
      );
      if (connection === null) return null;
      return openHostTab(host, connection?.attachTo ?? undefined);
    },
    [enabledInternalPluginIds, openHostTab]
  );


  const openWorkspaceTargets = useCallback(async (targets: WorkspaceLaunchTarget[], preset: WorkspacePreset) => {
    const oldTabs = layoutStore.getState().tabs;
    const opened: string[] = [];
    for (const target of targets) {
      try {
        if (target.transport === "local") {
          const sessionId = "local-" + target.profileId + "-" + Date.now() + "-" + opened.length;
          openTab({ tabKey: sessionId, sessionId, title: target.title, transport: "local", profileId: target.profileId, type: "terminal", preopened: false });
          opened.push(sessionId);
          continue;
        }
        const host = hosts.find((item) => item.id === target.hostId || item.id === target.profileId);
        if (!host) { toast.error("Workspace host is no longer available: " + target.title); continue; }
        const sessionId = await connectHost(host);
        if (sessionId) opened.push(sessionId);
      } catch (error) {
        toast.error("Failed to open " + target.title + ": " + (error instanceof Error ? error.message : String(error)));
      }
    }
    if (!opened.length) return;
    const openedTabs = layoutStore.getState().tabs.filter((tab) => opened.includes(tab.sessionId)).map((tab) => ({ ...tab, autoConnect: true }));
    for (const tab of oldTabs) void getShell().closeSession({ sessionId: tab.sessionId }).catch(() => {});
    const sizing = workspacePresetLayout(preset, targets.slice(0, opened.length));
    const paneCount = sizing.paneCount;
    layoutStore.setState({ tabs: openedTabs, activeSessionId: opened[0]!, panes: [{ paneId: "pane-1", sessionId: opened[0]!, tabSessionIds: opened }], paneLayout: { type: "pane", paneId: "pane-1" }, activePaneId: "pane-1", paneSizes: [100] });
    const paneIds = Array.from({ length: paneCount }, (_, index) => "workspace-pane-" + index);
    const paneTabs = preset === "tabs" || paneCount === 1
      ? [opened]
      : Array.from({ length: paneCount }, (_, index) => {
          const chunkSize = Math.ceil(opened.length / paneCount);
          return opened.slice(index * chunkSize, (index + 1) * chunkSize);
        });
    const panes = paneIds.map((paneId, index) => ({ paneId, sessionId: paneTabs[index]?.[0] ?? null, tabSessionIds: paneTabs[index] ?? [] }));
    const buildTree = (index: number): PaneLayoutNode => index === paneCount - 1 ? { type: "pane", paneId: paneIds[index] } : { type: "split", groupId: "workspace-split-" + index, direction: sizing.splitDirection, sizes: [sizing.paneSizes[index]! / sizing.paneSizes.slice(index).reduce((sum, size) => sum + size, 0) * 100, 100 - sizing.paneSizes[index]! / sizing.paneSizes.slice(index).reduce((sum, size) => sum + size, 0) * 100], children: [{ type: "pane", paneId: paneIds[index]! }, buildTree(index + 1)] };
    layoutStore.setState({ panes, paneLayout: paneCount === 1 ? { type: "pane", paneId: paneIds[0] } : buildTree(0), activePaneId: paneIds[0]!, activeSessionId: opened[0], paneSizes: sizing.paneSizes });
    requestAnimationFrame(() => requestTerminalFocus(opened[0]!));
  }, [hosts, connectHost, openTab]);

  const connectSshAdHoc = useCallback(
    (host: string, port: number, username: string, _password: string) => {
      const sessionId = `ssh-adhoc-${Date.now()}`;
      const portSuffix = port !== 22 ? `:${port}` : "";
      const profileId = username ? `${username}@${host}${portSuffix}` : `${host}${portSuffix}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title: username ? `${username}@${host}` : host,
        transport: "ssh",
        profileId,
        preopened: false,
      });
    },
    [openTab]
  );

  const connectTelnet = useCallback(
    (opts: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string }) => {
      const sessionId = `telnet-${Date.now()}`;
      const portSuffix = opts.port !== 23 ? `:${opts.port}` : "";
      const title = opts.mode === "raw"
        ? `raw://${opts.hostname}${portSuffix}`
        : `telnet://${opts.hostname}${portSuffix}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title,
        transport: "telnet",
        profileId: `${opts.hostname}:${opts.port}`,
        telnetOptions: opts,
        preopened: false,
      });
      setTelnetDialogOpen(false);
    },
    [openTab]
  );

  const duplicateHost = useCallback((host: HostRecord) => {
    const newHost: HostRecord = { ...host, id: `host-${Date.now()}`, name: `${host.name} (copy)` };
    setHosts((prev) => [...prev, newHost]);
    void hostEditorContribution?.persistRecord?.(newHost, internalPluginUiHostServices, {
      persistRelatedData: true,
    });
  }, [hostEditorContribution]);

  const deleteHost = useCallback(async (host: HostRecord) => {
    setHosts((prev) => prev.filter((h) => h.id !== host.id));
    await getShell().removeHost({ id: host.id });
  }, []);

  const toggleFavoriteHost = useCallback(
    (host: HostRecord) => {
      const updated = { ...host, isFavorite: !host.isFavorite };
      setHosts((prev) => prev.map((h) => (h.id === host.id ? updated : h)));
      void hostEditorContribution?.persistRecord?.(updated, internalPluginUiHostServices);
    },
    [hostEditorContribution]
  );

  const setHostColor = useCallback((host: HostRecord, color: string | null) => {
    const updated = { ...host, color };
    setHosts((prev) => prev.map((h) => (h.id === host.id ? updated : h)));
    void hostEditorContribution?.persistRecord?.(updated, internalPluginUiHostServices);
  }, [hostEditorContribution]);

  const reorderHosts = useCallback((items: Array<{ id: string; sortOrder: number; group: string }>) => {
    setHosts((prev) => {
      const updated = [...prev];
      for (const item of items) {
        const idx = updated.findIndex((h) => h.id === item.id);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], sortOrder: item.sortOrder, group: item.group };
        }
      }
      return updated.sort((a, b) =>
        (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999)
      );
    });
    void getShell().reorderHosts({
      items: items.map((i) => ({ id: i.id, sortOrder: i.sortOrder, groupId: null, group: i.group }))
    });
  }, []);

  const clearSavedSessionRecoveryState = useCallback(async () => {
    if (!hasShell()) {
      return;
    }
    try {
      await getShell().sessionClearSavedState();
    } catch (error) {
      console.warn("[hypershell] failed clearing saved session recovery state:", error);
    }
  }, []);

  const restoreSavedSessions = useCallback(async () => {
    for (let index = 0; index < savedRecoverySessions.length; index += 1) {
      const session = savedRecoverySessions[index];
      if (!canRestoreInternalSavedSession(session)) continue;
      const sessionId = `recovery-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
      openTab(savedSessionToLayoutTab(session, sessionId));
    }
    setSessionRecoveryOpen(false);
    setSavedRecoverySessions([]);
    await clearSavedSessionRecoveryState();
  }, [clearSavedSessionRecoveryState, openTab, savedRecoverySessions]);

  const dismissSavedSessionRecovery = useCallback(async () => {
    setSessionRecoveryOpen(false);
    setSavedRecoverySessions([]);
    await clearSavedSessionRecoveryState();
  }, [clearSavedSessionRecoveryState]);

  const restoreLastWorkspace = useCallback(() => {
    for (const tab of lastWorkspaceTabs) {
      layoutStore.getState().openTab(
        workspaceTabToLayoutTab(
          migrateInternalWorkspaceTab(tab),
          `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )
      );
    }
    setRestoreBannerVisible(false);
  }, [lastWorkspaceTabs]);

  const dismissRestoreBanner = useCallback(() => {
    setRestoreBannerVisible(false);
  }, []);

  const profiles = useMemo<QuickConnectProfile[]>(
    () => [
      ...hosts.map((h) => ({
        id: h.id,
        label: h.name,
        hostname: h.hostname,
        transport: "ssh" as const,
        group: h.group,
        tags: h.tags?.split(",").map((t) => t.trim()) ?? []
      })),
      ...getInternalPluginQuickConnectProfiles(enabledInternalPluginIds)
    ],
    [hosts, enabledInternalPluginIds]
  );


  const paletteCommands = useMemo(() => {
    const ctx: CommandContext = {
      getActiveSessionId: () => layoutStore.getState().activeSessionId,
      getPaneCount: () => layoutStore.getState().panes.length,
      splitPane: (direction) => {
        const sid = layoutStore.getState().activeSessionId;
        if (sid) layoutStore.getState().splitPane(sid, direction);
      },
      closePane: () => {
        const state = layoutStore.getState();
        if (state.panes.length > 1) state.closePane(state.activePaneId);
      },
      activatePrevPane: () => {
        const state = layoutStore.getState();
        const idx = state.panes.findIndex((p) => p.paneId === state.activePaneId);
        if (idx > 0) state.activatePane(state.panes[idx - 1].paneId);
      },
      activateNextPane: () => {
        const state = layoutStore.getState();
        const idx = state.panes.findIndex((p) => p.paneId === state.activePaneId);
        if (idx < state.panes.length - 1) state.activatePane(state.panes[idx + 1].paneId);
      },
      openSettings: () => setSettingsOpen(true),
      openQuickConnect: () => setIsQuickConnectOpen(true),
      openHostModal: () => { setEditingHost(null); setHostModalOpen(true); },
      getActiveHost: () => {
        const activeId = layoutStore.getState().activeSessionId;
        const tab = layoutStore.getState().tabs.find((t) => t.sessionId === activeId);
        if (!tab?.hostId) return null;
        const host = hosts.find((h) => h.id === tab.hostId);
        return host ? { id: host.id, name: host.name } : null;
      },
      hasActiveSession: () => layoutStore.getState().activeSessionId !== null,
      disconnectActiveSession: () => {
        const sid = layoutStore.getState().activeSessionId;
        if (sid) void getShell().closeSession({ sessionId: sid });
      },
      reconnectActiveSession: () => {
        const state = layoutStore.getState();
        const tab = state.tabs.find((t) => t.sessionId === state.activeSessionId);
        if (tab?.hostId) {
          const host = hosts.find((h) => h.id === tab.hostId);
          if (host) void connectHost(host);
        }
      },
      openWorkspaceMenu: () => {
        window.dispatchEvent(new CustomEvent("hypershell:open-workspace-menu"));
      },
      createBackup: () => {
        void (async () => {
          const filePath = await getShell().fsShowSaveDialog({
            filters: [{ name: "SQLite Database", extensions: ["db"] }],
          });
          if (filePath) void getShell().backupCreate({ filePath });
        })();
      },
      restoreBackup: () => {
        if (backupRestoreInFlightRef.current) {
          return;
        }
        void (async () => {
          backupRestoreInFlightRef.current = true;
          try {
            const filePath = await getShell().backupShowOpenDialog();
            if (!filePath) return;
            const confirmed = window.confirm(
              "Restoring a backup will replace your current database. The app will need to restart. Continue?"
            );
            if (!confirmed) return;
            const result = await getShell().backupRestore({ filePath });
            if (result?.requiresRestart) {
              toast.success("Database restored. Please restart the application.");
            }
          } catch (err) {
            toast.error(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            backupRestoreInFlightRef.current = false;
          }
        })();
      },
      openKeyManager: () => setSettingsOpen(true),
      reloadWindow: () => window.location.reload(),
      openTelnetDialog: () => setTelnetDialogOpen(true),
    };
    return [...createCommands(ctx), ...getInternalPluginCommands(enabledInternalPluginIds, {
      getActiveHost: () => {
        const activeId = layoutStore.getState().activeSessionId;
        const tab = layoutStore.getState().tabs.find((item) => item.sessionId === activeId);
        return hosts.find((host) => host.id === tab?.hostId) ?? null;
      },
      hostActions: builtinHostActions,
      openTab,
      openSecondarySidebar: (pluginId, title) => useSecondarySidebarStore.getState().openBuiltinPlugin({ pluginId, title }),
      openPanelView: (pluginId, viewId) => useWorkbenchPanelStore.getState().openView(pluginPanelViewId(pluginId, viewId)),
    })];
  }, [hosts, connectHost, enabledInternalPluginIds, builtinHostActions, openTab]);

  return (
    <>
      <AppShell
        secondarySidebarOpen={secondarySidebarTarget !== null}
        secondarySidebarTitle={secondarySidebarTarget ? getPluginSidebarTitle(secondarySidebarTarget) : ""}
        secondarySidebarContent={secondarySidebarTarget ? (
          <PluginSecondarySidebarContent target={secondarySidebarTarget} onClose={closeSecondarySidebar} />
        ) : null}
        onCloseSecondarySidebar={closeSecondarySidebar}
        onQuickConnect={() => setIsQuickConnectOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPlugin={(pluginId, placement, title) => openPlugin(pluginId, placement, undefined, title)}
        onOpenWorkspaceTargets={openWorkspaceTargets}
        sidebar={
          <Sidebar
            hosts={hosts}
            tags={tags}
            activeSessionHostIds={activeSessionHostIds}
            connectingHostIds={connectingHostIds}
            onConnectHost={(host) => { void connectHost(host); }}
            builtinHostActions={builtinHostActions}
            enabledInternalPluginIds={enabledInternalPluginIds}
            onEditHost={(host) => { setEditingHost(host); setHostModalOpen(true); }}
            onNewHost={() => { setEditingHost(null); setHostModalOpen(true); }}
            onDuplicateHost={duplicateHost}
            onDeleteHost={(host) => { void deleteHost(host); }}
            onToggleFavoriteHost={toggleFavoriteHost}
            onSetHostColor={setHostColor}
            onReorderHosts={reorderHosts}
            onOpenPlugin={openPlugin}
            onOpenTelnet={() => setTelnetDialogOpen(true)}
            restoreCount={restoreBannerVisible ? lastWorkspaceTabs.length : undefined}
            onRestore={restoreLastWorkspace}
            onDismissRestore={dismissRestoreBanner}
          />
        }
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Workspace
            onConnectSsh={connectSshAdHoc}
            enabledInternalPluginIds={enabledInternalPluginIds}
          />
        </div>
      </AppShell>

      {internalPlugins.filter((plugin) => enabledInternalPluginIds.has(plugin.id)).map((plugin) => {
          const Contribution = plugin.contribution;
          return Contribution ? <Contribution key={plugin.id} host={internalPluginUiHostServices} /> : null;
        })}

      <DeferredMount active={isQuickConnectOpen}>
        <QuickConnectDialog
          open={isQuickConnectOpen}
          onClose={() => setIsQuickConnectOpen(false)}
          profiles={profiles}
          onOpenProfile={(profile) => {
            if (openInternalPluginQuickConnectProfile(profile, openTab)) return;
            const host = hosts.find((item) => item.id === profile.id);
            if (host) void connectHost(host);
          }}
        />
      </DeferredMount>

      <DeferredMount active={isCommandPaletteOpen}>
        <CommandPalette commands={paletteCommands} />
      </DeferredMount>

      <DeferredMount active={telnetDialogOpen}>
        <TelnetQuickConnect
          open={telnetDialogOpen}
          onClose={() => setTelnetDialogOpen(false)}
          onConnect={connectTelnet}
        />
      </DeferredMount>

      <ConnectionChallengeDialogs />

      <Modal
        open={hostModalOpen}
        onClose={() => setHostModalOpen(false)}
        title={editingHost ? `Edit ${editingHost.name}` : "New Host"}
      >
        <DeferredMount active={hostModalOpen}>
          {HostEditor && <HostEditor
            key={editingHost?.id ?? "new"}
            initialValue={editingHost ?? undefined}
            submitLabel={editingHost ? "Update host" : "Add host"}
            host={internalPluginUiHostServices}
            onTagsChanged={(updatedTags: TagRecord[]) => setTags(updatedTags)}
            onSubmit={(value: HostFormValue) => {
              const id = editingHost?.id ?? `host-${Date.now()}`;
              const isDuplicate = !editingHost && hosts.some(
                (host) => host.name === value.name ||
                  (host.hostname === value.hostname && host.port === value.port)
              );
              if (isDuplicate) {
                setHostModalOpen(false);
                return;
              }

              const record = hostEditorContribution?.createRecord?.(value, id) as HostRecord | undefined;
              const persistRecord = hostEditorContribution?.persistRecord;
              if (!record || !persistRecord) return;

              setHosts((previous) => editingHost
                ? previous.map((host) => host.id === id ? record : host)
                : [...previous, record]);
              void persistRecord(record, internalPluginUiHostServices, {
                persistRelatedData: true,
              }).then((persistedValue) => {
                const persisted = persistedValue as HostRecord | null;
                if (!persisted) return;
                setHosts((previous) => previous.map((host) =>
                  host.id === id ? persisted : host
                ));
              });
              setHostModalOpen(false);
            }}
          />}
        </DeferredMount>
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
      >
        <DeferredMount active={settingsOpen}>
        <SettingsPanel
          enabledPluginIds={enabledInternalPluginIds}
          host={internalPluginUiHostServices}
        />
        </DeferredMount>
      </Modal>

      <DeferredMount active={sessionRecoveryOpen}>
        <SessionRecoveryDialog
          open={sessionRecoveryOpen}
          sessions={savedRecoverySessions}
          onRestore={restoreSavedSessions}
          onDismiss={dismissSavedSessionRecovery}
        />
      </DeferredMount>

      <InternalPluginOverlays enabledPluginIds={enabledInternalPluginIds} />

      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "!bg-base-700 !border !border-border !text-text-primary !text-sm",
        }}
      />
    </>
  );
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get("window");
  if (windowType === "plugin") {
    const pluginId = params.get("pluginId");
    const PluginWindow = pluginId
      ? internalPlugins.find((plugin) => plugin.id === pluginId)?.windowRenderer
      : undefined;
    if (!PluginWindow) {
      return <main role="alert" className="p-6 text-sm text-text-secondary">Plugin window is unavailable.</main>;
    }
    const rawContext = params.get("pluginContext");
    let context: Record<string, unknown> = {};
    if (rawContext && rawContext.length <= 8192) {
      try {
        const parsed: unknown = JSON.parse(rawContext);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          context = parsed as Record<string, unknown>;
        }
      } catch {
        context = {};
      }
    }
    return (
      <Suspense fallback={null}>
        <PluginWindow context={context} host={internalPluginUiHostServices} />
      </Suspense>
    );
  }

  return <MainApp />;
}

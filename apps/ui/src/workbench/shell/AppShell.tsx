import { lazy, Suspense, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useStore } from "zustand";
import { toast } from "sonner";
import { ActivityBar } from "../activity-bar/ActivityBar";
import type { WorkspaceLaunchTarget, WorkspacePreset } from "./WorkspaceCreator";
import { useI18n } from "../shared/i18n";
import { StatusBar } from "../status-bar/StatusBar";
import { SecondarySidebar } from "../secondary-sidebar/SecondarySidebar";
import { useSecondarySidebarLayoutStore } from "../secondary-sidebar/secondarySidebarStore";
import { Modal } from "../shared/Modal";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { getShell } from "../shared/shell";

const PluginManager = lazy(() => import("../plugin-runtime/PluginManager").then((module) => ({ default: module.PluginManager })));

export interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  secondarySidebarOpen: boolean;
  secondarySidebarTitle: string;
  secondarySidebarContent: ReactNode;
  onCloseSecondarySidebar: () => void;
  onQuickConnect: () => void;
  onOpenSettings: () => void;
  onOpenPlugin: (pluginId: string, placement: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel", title: string) => void;
  onOpenWorkspaceTargets: (targets: WorkspaceLaunchTarget[], preset: WorkspacePreset) => Promise<void>;
}

export function AppShell({
  sidebar,
  children,
  secondarySidebarOpen,
  secondarySidebarTitle,
  secondarySidebarContent,
  onCloseSecondarySidebar,
  onQuickConnect,
  onOpenSettings,
  onOpenPlugin,
  onOpenWorkspaceTargets,
}: AppShellProps) {
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [pluginRestartPending, setPluginRestartPending] = useState(false);
  const [pluginCloseConfirmation, setPluginCloseConfirmation] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { t } = useI18n();
  const panelWidth = useStore(useSecondarySidebarLayoutStore, (state) => state.width);
  const setPanelWidth = useStore(useSecondarySidebarLayoutStore, (state) => state.setWidth);
  const togglePluginManager = () => setPluginsOpen((open) => !open);
  const requestPluginManagerClose = () => {
    if (pluginRestartPending) setPluginCloseConfirmation(true);
    else setPluginsOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Custom title bar — replaces native title bar */}
      <div
        className="flex items-center h-9 shrink-0 bg-base-800 select-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="flex-1 text-center text-xs font-medium text-text-muted tracking-wide pointer-events-none">
          HyperShell
        </span>
        {/* Reserve space for the window controls overlay on the right */}
        <div className="w-[140px] shrink-0" />
      </div>
      {/* Separator — rendered below the native overlay so it spans full width */}
      <div className="h-px shrink-0 bg-border-bright" />

      <div className="flex flex-1 min-h-0">
        <ActivityBar
          pluginsOpen={pluginsOpen}
          onOpenPlugins={togglePluginManager}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onQuickConnect={onQuickConnect}
          onOpenSettings={onOpenSettings}
          onOpenPlugin={onOpenPlugin}
          onOpenWorkspaceTargets={onOpenWorkspaceTargets}
        />
        <aside
          id="primary-sidebar"
          aria-label={t("Primary sidebar")}
          aria-hidden={!sidebarOpen}
          inert={!sidebarOpen}
          className={`relative flex shrink-0 flex-col overflow-hidden bg-base-800 transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
            sidebarOpen ? "w-64" : "w-0"
          }`}
          style={{ borderRight: sidebarOpen ? '0.5px solid var(--terminal-frame-line)' : 'none' }}
        >
          {/* Subtle gradient overlay on sidebar */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.02] via-transparent to-transparent" />
          {/* Right edge highlight */}
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-accent/[0.06] via-transparent to-transparent" />

          <div className="terminal-logo-row relative flex h-11 shrink-0 items-center justify-center px-3">
            <span className="flex items-center select-none pointer-events-none">
              <span
                className="text-sm font-semibold text-text-primary tracking-tight"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                HyperShell
              </span>
              <span
                className="text-accent/75 text-sm font-light"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {">_"}
              </span>
              <motion.span
                className="inline-block w-[2px] h-[14px] bg-accent ml-0.5 rounded-full"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear", times: [0, 0.5, 0.5, 1] }}
              />
            </span>
          </div>

          <div className="relative flex-1 overflow-y-auto py-2">
            {sidebar}
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-surface">
          <div className="flex-1 flex flex-col min-h-0">{children}</div>
        </main>

        <SecondarySidebar
          open={secondarySidebarOpen}
          title={secondarySidebarTitle}
          width={panelWidth}
          onWidthChange={setPanelWidth}
          onClose={onCloseSecondarySidebar}
        >
          {secondarySidebarContent}
        </SecondarySidebar>
      </div>

      <StatusBar />
      <Modal
        open={pluginsOpen}
        onClose={requestPluginManagerClose}
        title={t("Plugin Manager")}
        size="lg"
        dialogClassName="h-[min(760px,calc(100dvh-7rem))]"
        contentClassName="flex-1"
      >
        <Suspense fallback={<div className="p-4 text-text-muted">{t("Loading")}</div>}>
          <PluginManager onPendingRestartChange={setPluginRestartPending} />
        </Suspense>
      </Modal>
      <ConfirmDialog
        open={pluginCloseConfirmation}
        title={t("Plugin changes need restart")}
        message={t("Plugin changes were made. Restart the application now?")}
        description={t("You can close this panel and restart later. Active sessions will disconnect if you restart now.")}
        confirmLabel={t("Restart app")}
        cancelLabel={t("Close without restarting")}
        onCancel={() => { setPluginCloseConfirmation(false); setPluginsOpen(false); }}
        onConfirm={() => {
          setPluginCloseConfirmation(false);
          setPluginsOpen(false);
          void getShell().pluginsRestart().catch((error: unknown) => {
            toast.error(error instanceof Error ? error.message : t("Restart failed"));
          });
        }}
      />
    </div>
  );
}

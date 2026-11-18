import { PluginIcon } from "../plugin-runtime/PluginIcon";
import { useEffect, useState } from "react";
import { WorkspaceMenu } from "../shell/WorkspaceMenu";
import type { WorkspaceLaunchTarget, WorkspacePreset } from "../shell/WorkspaceCreator";
import { useI18n } from "../shared/i18n";
import { getShell } from "../shared/shell";
import { pluginUiSlots } from "../slots/pluginUiSlots";

export interface ActivityBarProps {
  pluginsOpen: boolean;
  onOpenPlugins: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onQuickConnect: () => void;
  onOpenSettings: () => void;
  onOpenPlugin: (pluginId: string, placement: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel", title: string) => void;
  onOpenWorkspaceTargets?: (targets: WorkspaceLaunchTarget[], preset: WorkspacePreset) => Promise<void>;
}

export function ActivityBar({
  pluginsOpen,
  onOpenPlugins,
  sidebarOpen,
  onToggleSidebar,
  onQuickConnect,
  onOpenSettings,
  onOpenPlugin,
  onOpenWorkspaceTargets,
}: ActivityBarProps) {
  const { t } = useI18n();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [navigationPlugins, setNavigationPlugins] = useState<Array<{ id: string; name: string; placement: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel"; slots: string[] }>>([]);
  const sidebarToggleLabel = sidebarOpen
    ? t("Collapse primary sidebar")
    : t("Expand primary sidebar");

  useEffect(() => {
    const openWorkspaceMenu = () => setWorkspaceMenuOpen(true);
    window.addEventListener("hypershell:open-workspace-menu", openWorkspaceMenu);
    return () => window.removeEventListener("hypershell:open-workspace-menu", openWorkspaceMenu);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getShell().pluginsList().then((plugins) => {
        if (cancelled) return;
        setNavigationPlugins(plugins.flatMap(({ manifest }) => {
          const ui = manifest.ui;
          const slots = ui?.slots ?? [ui?.placement ?? pluginUiSlots.workspaceTab];
          if (!slots.includes(pluginUiSlots.navigation)) return [];
          return [{ id: manifest.id, name: manifest.name, placement: ui?.placement ?? pluginUiSlots.workspaceTab, slots }];
        }));
      }).catch(() => { if (!cancelled) setNavigationPlugins([]); });
    };
    refresh();
    window.addEventListener("hypershell:plugins-changed", refresh);
    return () => { cancelled = true; window.removeEventListener("hypershell:plugins-changed", refresh); };
  }, []);

  return (
    <nav
      aria-label={t("Activity bar")}
      className="relative flex w-12 shrink-0 flex-col items-center gap-2 border-r border-border bg-base-800 py-2"
    >
      <button
        type="button"
        aria-label={t("Hosts")}
        aria-controls="primary-sidebar"
        aria-expanded={sidebarOpen}
        aria-pressed={sidebarOpen}
        title={sidebarToggleLabel}
        onClick={onToggleSidebar}
        className={`flex size-9 items-center justify-center rounded-md transition-colors ${sidebarOpen ? "bg-base-700 text-text-primary" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"}`}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="3.5" width="14" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="3" y="11.5" width="14" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 6h.01M6 14h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <button
        type="button"
        aria-label={`${t("Quick Connect")} (Ctrl+K)`}
        title={`${t("Quick Connect")} (Ctrl+K)`}
        onClick={onQuickConnect}
        className="flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-base-700/60 hover:text-text-primary"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="m12.5 12.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="relative">
        <button
          type="button"
          data-workspace-menu-toggle="true"
          aria-label={t("Workspaces")}
          aria-expanded={workspaceMenuOpen}
          title={t("Workspaces")}
          onClick={() => setWorkspaceMenuOpen((open) => !open)}
          className="flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-base-700/60 hover:text-text-primary"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
            <rect x="11" y="2" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
            <rect x="2" y="11" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
            <rect x="11" y="11" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        {workspaceMenuOpen && (
          <WorkspaceMenu onClose={() => setWorkspaceMenuOpen(false)} onOpenTargets={onOpenWorkspaceTargets} />
        )}
      </div>

      {navigationPlugins.map((plugin) => (
        <button
          key={plugin.id}
          type="button"
          aria-label={plugin.name}
          title={plugin.name}
          onClick={() => onOpenPlugin(plugin.id, plugin.slots.includes(pluginUiSlots.workspaceTab) ? pluginUiSlots.workspaceTab : plugin.placement, plugin.name)}
          className="flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-base-700/60 hover:text-text-primary"
        >
          <PluginIcon pluginId={plugin.id} size={18} />
        </button>
      ))}

      <button
        className={`mt-auto flex size-9 items-center justify-center rounded-md transition-colors ${pluginsOpen ? "bg-base-700 text-text-primary" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"}`}
        type="button"
        aria-label={t("Plugin Manager")}
        title={t("Plugin Manager")}
        aria-pressed={pluginsOpen}
        onClick={onOpenPlugins}
      >
        <PluginIcon size={18} />
      </button>

      <button
        type="button"
        aria-label={t("Settings")}
        title={t("Settings")}
        onClick={onOpenSettings}
        className="flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-base-700/60 hover:text-text-primary"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </nav>
  );
}

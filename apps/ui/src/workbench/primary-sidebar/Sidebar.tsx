import { useEffect, useState } from "react";
import type { TagRecord } from "@hypershell/shared";
import { useStore } from "zustand";
import { ContextMenu } from "../shared/ContextMenu";
import { IconButton } from "../shared/ui/IconButton";
import type { HostUiRecord as HostRecord } from "@hypershell/shared";
import { settingsStore } from "../shell/settings/settingsStore";
import { SidebarHostList } from "./SidebarHostList";
import { SidebarSection } from "../shared/SidebarSection";
import { SidebarUpdateLabel } from "../shell/updates/SidebarUpdateLabel";
import { useI18n } from "../shared/i18n";
import type { PluginHostAction } from "@hypershell/plugin-api";
import { InternalPluginSidebarContributions } from "../plugin-runtime/InternalPluginSidebarContributions";
import { getInternalPluginSidebarActions } from "../plugin-runtime/internalPluginRegistry";
import { layoutStore } from "../editor-area/layoutStore";
import { getShell } from "../shared/shell";

export interface SidebarProps {
  hosts: HostRecord[];
  tags: TagRecord[];
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  onConnectHost: (host: HostRecord) => void;
  builtinHostActions: PluginHostAction[];
  enabledInternalPluginIds: ReadonlySet<string>;
  onEditHost: (host: HostRecord) => void;
  onNewHost: () => void;
  onDuplicateHost: (host: HostRecord) => void;
  onDeleteHost: (host: HostRecord) => void;
  onToggleFavoriteHost: (host: HostRecord) => void;
  onSetHostColor: (host: HostRecord, color: string | null) => void;
  onReorderHosts: (items: Array<{ id: string; sortOrder: number; group: string }>) => void;
  onOpenPlugin: (pluginId: string, placement: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel", hostId?: string, title?: string) => void;
  onOpenTelnet?: () => void;
  restoreCount?: number;
  onRestore?: () => void;
  onDismissRestore?: () => void;
}

export function Sidebar({
  hosts,
  tags,
  activeSessionHostIds,
  connectingHostIds,
  onConnectHost,
  builtinHostActions,
  enabledInternalPluginIds,
  onEditHost,
  onNewHost,

  onDuplicateHost,
  onDeleteHost,
  onToggleFavoriteHost,
  onSetHostColor,
  onReorderHosts,
  onOpenPlugin,
  onOpenTelnet,
  restoreCount,
  onRestore,
  onDismissRestore,
}: SidebarProps) {
  const [showHostFilter, setShowHostFilter] = useState(false);
  const [showHostAddress, setShowHostAddress] = useState(false);
  const [hostsMenu, setHostsMenu] = useState<{ x: number; y: number } | null>(null);
  const [externalPlugins, setExternalPlugins] = useState<Array<{ id: string; name: string; version: string; placement: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel"; hostContextMenu: boolean }>>([]);
  const contributedSidebarActions = getInternalPluginSidebarActions(enabledInternalPluginIds);
  const { t } = useI18n();
  const enableTelnet = useStore(
    settingsStore,
    (s) => s.settings.general.enableTelnet
  );
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getShell().pluginsList().then((plugins) => {
        if (!cancelled) setExternalPlugins(plugins.filter(({ manifest }) => manifest.ui?.hostContextMenu).map(({ manifest }) => ({
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          placement: manifest.ui?.placement ?? "workspace.tab",
          hostContextMenu: manifest.ui?.hostContextMenu ?? false,
        })));
      }).catch(() => {
        if (!cancelled) setExternalPlugins([]);
      });
    };
    refresh();
    window.addEventListener("hypershell:plugins-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("hypershell:plugins-changed", refresh);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <InternalPluginSidebarContributions
        enabledPluginIds={enabledInternalPluginIds}
        openTab={layoutStore.getState().openTab}
      />

      <SidebarSection
        title={t("Hosts")}
        className="flex-1 min-h-0"
        actions={
          <div className="flex gap-0.5">
            <IconButton
              variant="ghost"
              onClick={() => setShowHostFilter((visible) => !visible)}
              title={t("Filter hosts")}
              aria-label={t("Filter hosts")}
              aria-pressed={showHostFilter}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </IconButton>
            <IconButton
              variant="ghost"
              onClick={() => setShowHostAddress((visible) => !visible)}
              title={showHostAddress ? t("Hide host addresses") : t("Show host addresses")}
              aria-label={showHostAddress ? t("Hide host addresses") : t("Show host addresses")}
              aria-pressed={showHostAddress}
            >
              {showHostAddress ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4-6.5-4-6.5-4Z" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="8" cy="8" r="1.7" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 2l12 12M6.1 4.2A6.9 6.9 0 0 1 8 4c4.2 0 6.5 4 6.5 4a10 10 0 0 1-2.1 2.5M4.2 5.1A10.5 10.5 0 0 0 1.5 8s2.3 4 6.5 4c.7 0 1.3-.1 1.9-.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </IconButton>
            <IconButton variant="accent" onClick={onNewHost} title={t("New host")}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </IconButton>
            <IconButton
              variant="accent"
              title={t("More actions")}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHostsMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="3.5" cy="8" r="1.3" />
                <circle cx="8" cy="8" r="1.3" />
                <circle cx="12.5" cy="8" r="1.3" />
              </svg>
            </IconButton>
          </div>
        }
      >
        <SidebarHostList
          hosts={hosts}
          tags={tags}
          activeSessionHostIds={activeSessionHostIds}
          connectingHostIds={connectingHostIds}
          onConnect={onConnectHost}
          builtinHostActions={builtinHostActions}
          hostContextPlugins={externalPlugins.filter((plugin) => plugin.hostContextMenu)}
          onOpenPlugin={onOpenPlugin}
          onEdit={onEditHost}
          onDuplicate={onDuplicateHost}
          onDelete={onDeleteHost}
          onToggleFavorite={onToggleFavoriteHost}
          onCopyHostname={(host) => void navigator.clipboard.writeText(host.hostname)}
          onCopyAddress={(host) => void navigator.clipboard.writeText(host.hostname)}
          onSetColor={onSetHostColor}
          onReorder={onReorderHosts}
          onNewHost={onNewHost}
          showAddress={showHostAddress}
          showFilter={showHostFilter}
          onCloseFilter={() => setShowHostFilter(false)}
        />
      </SidebarSection>

      {hostsMenu && (
        <ContextMenu
          x={hostsMenu.x}
          y={hostsMenu.y}
          onClose={() => setHostsMenu(null)}
          actions={[
            ...contributedSidebarActions.map(({ label, action }) => ({
              label,
              action: () => void action(),
            })),
            ...(contributedSidebarActions.length > 0
              ? [{ label: "", action: () => {}, separator: true }]
              : []),
          ]}
        />
      )}

      {enableTelnet && onOpenTelnet && (
        <SidebarSection
          title="Telnet"
          actions={
            <div className="flex gap-0.5">
              <IconButton variant="accent" onClick={onOpenTelnet} title="Quick connect">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </IconButton>
            </div>
          }
        >
          <div className="px-2 py-2">
            <button
              onClick={onOpenTelnet}
              className="w-full text-left text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Quick Connect...
            </button>
          </div>
        </SidebarSection>
      )}

      {restoreCount != null && restoreCount > 0 && onRestore && onDismissRestore && (
        <div className="mt-auto border-t border-border px-3 py-2.5 flex flex-col gap-2">
          <span className="text-xs text-text-secondary">
            {restoreCount === 1
              ? t("Restore 1 session from last session?")
              : t("Restore {count} sessions from last session?").replace("{count}", String(restoreCount))}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onRestore}
              className="rounded bg-accent/15 border border-accent/30 px-3 py-1 text-xs text-accent hover:bg-accent/25 transition-colors font-medium"
            >
              Restore
            </button>
            <button
              onClick={onDismissRestore}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className={`${restoreCount ? "" : "mt-auto "}border-t border-border px-3 pt-2 pb-0.5 flex items-center justify-end`}>
        <SidebarUpdateLabel version={__APP_VERSION__} />
      </div>
    </div>
  );
}

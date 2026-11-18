import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getShell } from "../shared/shell";
import { createSandboxDocument } from "./sandboxDocument";
import { pluginUiSlots, pluginViewSlots } from "../slots/pluginUiSlots";
import { useI18n } from "../shared/i18n";
import { appThemeVariant } from "../shell/settings/appThemes";
import { sessionInputRouterStore } from "./sessionInputRouter";
import { isPluginWorkspaceTab } from "./internalPluginRegistry";
import { layoutStore, resolveTabTitle } from "../editor-area/layoutStore";

type PluginRuntimePackage = {
  manifest: { id: string; name: string; version: string; description: string; apiVersion: string; entrypoint: string; permissions: string[]; contributions: string[]; ui?: { placement?: "workspace.tab" | "workspace.secondarySidebar" | "workspace.panel"; slots?: string[]; hostContextMenu?: boolean } };
  grantedPermissions: string[];
  source: string;
};
type Contribution = { id: string; title: string; keywords?: string[]; slot: string };

export function SandboxedPluginFrame({ pluginId, hostId, surface, sessionTargets, onClose, onSurfaceContributionChange, fill = false, showHeader = true }: { pluginId: string; hostId?: string; surface?: string; sessionTargets?: Array<{ id: string; name: string }>; onClose: () => void; onSurfaceContributionChange?: (visible: boolean) => void; fill?: boolean; showHeader?: boolean }) {
  const { locale, t } = useI18n();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [runtime, setRuntime] = useState<PluginRuntimePackage | null>(null);
  const [commands, setCommands] = useState<Contribution[]>([]);
  const [views, setViews] = useState<Contribution[]>([]);
  const [status, setStatus] = useState("Loading plugin");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadRuntime = () => {
      void getShell().pluginsRuntime(pluginId).then((plugin) => {
      if (cancelled) return;
      setRuntime(plugin);
      setStatus("Starting plugin");
    }).catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    };
    loadRuntime();
    window.addEventListener("hypershell:plugins-changed", loadRuntime);
    return () => { cancelled = true; window.removeEventListener("hypershell:plugins-changed", loadRuntime); };
  }, [pluginId]);

  const srcDoc = useMemo(() => runtime ? createSandboxDocument({
    pluginId,
    locale,
    manifest: runtime.manifest,
    grantedPermissions: runtime.grantedPermissions,
    launchContext: hostId || surface || sessionTargets ? { hostId, surface, sessionTargets } : undefined,
    source: runtime.source,
  }) : undefined, [pluginId, locale, hostId, surface, sessionTargets, runtime]);

  useEffect(() => {
    if (!runtime) return;
    const surfaceViews = new Set<string>();
    const listener = (event: MessageEvent<unknown>) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow || event.origin !== "null") return;
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.pluginId !== pluginId || typeof message.type !== "string") return;

      if (message.type === "plugin.ready") {
        setStatus("Running in sandbox");
      } else if (message.type === "plugin.navigationAttempt") {
        setError("Plugin attempted to navigate its sandbox");
      } else if (message.type === "plugin.error") {
        setError(typeof message.error === "string" ? message.error.slice(0, 1000) : "Plugin failed");
      } else if (message.type === "command.register" || message.type === "view.register") {
        const contribution = message.type === "command.register" ? message.command : message.view;
        if (!contribution || typeof contribution !== "object") return;
        const item = contribution as Record<string, unknown>;
        if (typeof item.id !== "string" || item.id.length > 100 || typeof item.title !== "string" || item.title.length > 160) return;
        const slot = message.type === "command.register"
          ? pluginUiSlots.workspaceToolbar
          : typeof item.slot === "string" ? item.slot : runtime.manifest.ui?.placement ?? pluginUiSlots.workspaceTab;
        const allowedSlots = runtime.manifest.ui?.slots ?? [runtime.manifest.ui?.placement ?? pluginUiSlots.workspaceTab];
        if (message.type === "command.register" && slot !== pluginUiSlots.workspaceToolbar) return;
        if (message.type === "view.register" && (!pluginViewSlots.includes(slot) || !allowedSlots.includes(slot))) return;
        const value = { id: item.id, title: item.title, slot, keywords: Array.isArray(item.keywords) ? item.keywords.filter((word): word is string => typeof word === "string").slice(0, 20) : [] };
        const setter = message.type === "command.register" ? setCommands : setViews;
        setter((current) => current.some((entry) => entry.id === value.id) || current.length >= 64 ? current : [...current, value]);
        if (message.type === "view.register" && value.slot === surface && surface) {
          surfaceViews.add(value.id);
          onSurfaceContributionChange?.(true);
        }
      } else if (message.type === "command.remove" || message.type === "view.remove") {
        if (typeof message.id !== "string") return;
        const setter = message.type === "command.remove" ? setCommands : setViews;
        setter((current) => current.filter((item) => item.id !== message.id));
        if (message.type === "view.remove" && surfaceViews.delete(message.id) && surfaceViews.size === 0) {
          onSurfaceContributionChange?.(false);
        }
      } else if (message.type === "host.invoke") {
        if (typeof message.requestId !== "string" || message.requestId.length > 32 || typeof message.method !== "string" || !Array.isArray(message.args)) return;
        const args = message.args.slice(0, 8);
        try {
          if (JSON.stringify(args).length > 128 * 1024) return;
        } catch {
          return;
        }
        if (message.method === "sessions.broadcastMode") {
          if (!runtime.grantedPermissions.includes("sessions.broadcast") || args.length !== 0) {
            frame.contentWindow?.postMessage({ pluginId, type: "host.error", requestId: message.requestId, error: "Missing permission or invalid arguments" }, "*");
            return;
          }
          const route = sessionInputRouterStore.getState().routes[pluginId];
          frame.contentWindow?.postMessage({ pluginId, type: "host.result", requestId: message.requestId, value: { enabled: route?.enabled ?? false, sessionIds: route?.targetSessionIds ?? [] } }, "*");
          return;
        }
        if (message.method === "sessions.broadcastTargets") {
          if (!runtime.grantedPermissions.includes("sessions.broadcast") || args.length !== 0) {
            frame.contentWindow?.postMessage({ pluginId, type: "host.error", requestId: message.requestId, error: "Missing permission or invalid arguments" }, "*");
            return;
          }
          const targets = layoutStore.getState().tabs
            .filter((tab) => !isPluginWorkspaceTab(tab))
            .map((tab) => ({ id: tab.sessionId, name: resolveTabTitle(tab) }));
          frame.contentWindow?.postMessage({ pluginId, type: "host.result", requestId: message.requestId, value: targets }, "*");
          return;
        }
        if (message.method === "sessions.setBroadcastMode") {
          const [enabled, rawSessionIds] = args;
          const allowedIds = new Set(layoutStore.getState().tabs
            .filter((tab) => !isPluginWorkspaceTab(tab))
            .map((tab) => tab.sessionId));
          if (!runtime.grantedPermissions.includes("sessions.broadcast") || typeof enabled !== "boolean" || !Array.isArray(rawSessionIds) || rawSessionIds.length > 20 || rawSessionIds.some((id) => typeof id !== "string" || !allowedIds.has(id))) {
            frame.contentWindow?.postMessage({ pluginId, type: "host.error", requestId: message.requestId, error: "Invalid broadcast configuration or missing permission" }, "*");
            return;
          }
          sessionInputRouterStore.getState().setRoute(pluginId, enabled, rawSessionIds as string[]);
          frame.contentWindow?.postMessage({ pluginId, type: "host.result", requestId: message.requestId, value: undefined }, "*");
          return;
        }
        if (message.method === "sessions.setBroadcastEnabled") {
          const [enabled] = args;
          if (!runtime.grantedPermissions.includes("sessions.broadcast") || args.length !== 1 || typeof enabled !== "boolean") {
            frame.contentWindow?.postMessage({ pluginId, type: "host.error", requestId: message.requestId, error: "Invalid broadcast state or missing permission" }, "*");
            return;
          }
          sessionInputRouterStore.getState().setRouteEnabled(pluginId, enabled);
          frame.contentWindow?.postMessage({ pluginId, type: "host.result", requestId: message.requestId, value: undefined }, "*");
          return;
        }
        void getShell().pluginsInvoke({ id: pluginId, method: message.method, args }).then((value) => {
          frame.contentWindow?.postMessage({ pluginId, type: "host.result", requestId: message.requestId, value }, "*");
        }).catch((reason: unknown) => {
          frame.contentWindow?.postMessage({ pluginId, type: "host.error", requestId: message.requestId, error: reason instanceof Error ? reason.message : String(reason) }, "*");
        });
      }
    };
    window.addEventListener("message", listener);
    return () => {
      window.removeEventListener("message", listener);
      onSurfaceContributionChange?.(false);
    };
  }, [pluginId, runtime, surface, onSurfaceContributionChange]);

  useEffect(() => () => {
    frameRef.current?.contentWindow?.postMessage({ pluginId, type: "plugin.stop" }, "*");
  }, [pluginId]);

  const executeCommand = (id: string) => {
    frameRef.current?.contentWindow?.postMessage({ pluginId, type: "command.execute", id }, "*");
  };

  const syncTheme = useCallback(() => {
    const theme = document.documentElement.dataset.theme ?? "default";
    frameRef.current?.contentWindow?.postMessage({ pluginId, type: "plugin.theme", variant: appThemeVariant(theme) }, "*");
  }, [pluginId]);

  useEffect(() => {
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    syncTheme();
    return () => observer.disconnect();
  }, [syncTheme]);

  return (
    <section className={`${fill ? "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "mt-3 overflow-hidden rounded-md border border-border"}`} aria-label={runtime?.manifest.name ?? "External plugin"}>
      {showHeader && <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-primary">{runtime?.manifest.name ?? pluginId}</div>
          <div className="truncate text-xs text-text-muted">{views.length > 0 ? views.map((view) => view.title).join(" · ") : error ? "Plugin error" : status}</div>
        </div>
        <button className="text-xs text-text-secondary hover:text-text-primary" onClick={onClose}>Close</button>
      </header>}
      {error ? <pre role="alert" className="max-h-40 overflow-auto p-3 text-xs text-danger">{error}</pre> : (
        <>
          {commands.length > 0 && <div data-plugin-slot={pluginUiSlots.workspaceToolbar} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            {commands.map((command) => <button key={command.id} onClick={() => executeCommand(command.id)} className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary">{command.title}</button>)}
          </div>}
          {srcDoc && <div data-plugin-slot={surface ?? runtime?.manifest.ui?.placement ?? pluginUiSlots.workspaceTab} className={`relative ${fill ? "flex h-full min-h-0 min-w-0 flex-1 overflow-hidden" : ""}`}>
          <iframe
            key={`${pluginId}:${runtime?.manifest.version ?? "unknown"}`}
            ref={frameRef}
            title={`${runtime?.manifest.name ?? pluginId} sandbox`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={srcDoc}
            onLoad={() => {
              syncTheme();
            }}
            className={`${fill ? "block h-full min-h-0 w-full min-w-0 flex-1" : "block h-[min(60vh,520px)] w-full"} bg-surface`}
          />
          {status === "Running in sandbox" && !views.some((view) => view.slot === (surface ?? runtime?.manifest.ui?.placement ?? pluginUiSlots.workspaceTab)) && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/95 p-4 text-center text-xs text-text-muted">
              {t("This plugin has no view contribution yet")}
            </div>
          )}
          </div>}
        </>
      )}
    </section>
  );
}

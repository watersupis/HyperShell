import { useEffect, useState } from "react";
import { useI18n } from "../shared/i18n";
import { SandboxedPluginFrame } from "./SandboxedPluginFrame";
import { getShell, type ShellApi } from "../shared/shell";
import { pluginUiSlots } from "../slots/pluginUiSlots";

type Plugin = Awaited<ReturnType<ShellApi["pluginsList"]>>[number];

export function PluginWorkspace({ pluginId, hostId, surface = pluginUiSlots.workspaceTab, onClose, onOpenSettings }: {
  pluginId: string;
  hostId?: string;
  surface?: string;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const { locale, t } = useI18n();
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getShell().pluginsList().then((plugins) => {
        if (cancelled) return;
        const current = plugins.find((item) => item.manifest.id === pluginId) ?? null;
        if (!current) {
          setError(t("Plugin is not installed"));
          onClose();
          return;
        }
        setPlugin(current);
        setError(null);
      }).catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t("Failed to load plugins"));
      });
    };
    refresh();
    window.addEventListener("hypershell:plugins-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("hypershell:plugins-changed", refresh);
    };
  }, [pluginId, locale, onClose, t]);

  const missingPermissions = plugin?.manifest.permissions.filter((permission) => !plugin.grantedPermissions.includes(permission)) ?? [];

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface" aria-label={plugin?.manifest.name ?? t("Plugin Workspace")}>
      {error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <p role="alert" className="text-sm text-danger">{error}</p>
        </div>
      ) : plugin && missingPermissions.length > 0 ? (
        <div className="m-auto max-w-lg border-l-2 border-warning pl-4">
          <h2 className="text-sm font-medium text-text-primary">{plugin.manifest.name}</h2>
          <p className="mt-2 text-xs text-text-muted">{t("Grant required permissions in Settings to run this plugin.")}</p>
          <div className="my-3 flex flex-wrap gap-2">
            {missingPermissions.map((permission) => <code key={permission} className="text-xs text-warning">{permission}</code>)}
          </div>
          <button type="button" onClick={onOpenSettings} className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-base-700 hover:text-text-primary">
            {t("Open Plugin Settings")}
          </button>
        </div>
      ) : plugin ? (
        <SandboxedPluginFrame key={`${pluginId}:${hostId ?? ""}:${surface}`} pluginId={pluginId} hostId={hostId} surface={surface} onClose={onClose} fill showHeader={false} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-text-muted">{t("Loading plugin")}</div>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import { Button } from "../shared/ui/Button";
import { SectionLabel } from "../shared/ui/SectionLabel";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { useI18n } from "../shared/i18n";
import { getShell, type ShellApi } from "../shared/shell";
import { internalPlugins } from "./internalPluginRegistry";
import { PluginIcon } from "./PluginIcon";

type PreparedPluginPackage = NonNullable<Awaited<ReturnType<ShellApi["pluginsInstall"]>>>;

export function PluginManager({ onPendingRestartChange }: { onPendingRestartChange: (pending: boolean) => void }) {
  const { locale, t } = useI18n();
  const [internalPluginStates, setInternalPluginStates] = useState<Array<{ id: string; enabled: boolean; kind: "core" | "optional" }>>([]);
  const [externalPlugins, setExternalPlugins] = useState<Awaited<ReturnType<ShellApi["pluginsList"]>>>([]);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [preparedPackage, setPreparedPackage] = useState<PreparedPluginPackage | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);

  const refreshPlugins = async () => {
    const shell = getShell();
    const list = shell.pluginsList;
    const internalList = shell.internalPluginsList;
    const [external, internal] = await Promise.all([
      list ? list() : Promise.resolve([]),
      internalList ? internalList() : Promise.resolve([]),
    ]);
    setExternalPlugins(external);
    setInternalPluginStates(internal);
  };

  const setInternalPluginEnabled = async (id: string, enabled: boolean) => {
    const update = getShell().internalPluginsSetEnabled;
    setBusy(true);
    setPluginError(null);
    try {
      const result = await update({ id, enabled });
      setRestartRequired((current) => current || result.restartRequired);
      if (result.restartRequired) onPendingRestartChange(true);
      await refreshPlugins();
    } catch (error) {
      setPluginError(error instanceof Error ? error.message : t("Failed to update plugin state"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshPlugins().catch(() => setPluginError(t("Failed to load plugins")));
  }, [locale, t]);

  const installPlugin = async () => {
    const install = getShell().pluginsInstall;
    setBusy(true);
    setPluginError(null);
    try {
      const prepared = await install(locale);
      if (prepared) setPreparedPackage(prepared);
    } catch (error) {
      setPluginError(error instanceof Error ? error.message : t("Plugin installation failed"));
    } finally {
      setBusy(false);
    }
  };

  const updatePermissions = async (pluginId: string, permission: string, granted: boolean) => {
    const plugin = externalPlugins.find((item) => item.manifest.id === pluginId);
    const update = getShell().pluginsSetPermissions;
    if (!plugin) return;
    const permissions = granted
      ? [...plugin.grantedPermissions, permission]
      : plugin.grantedPermissions.filter((item) => item !== permission);
    setBusy(true);
    try {
      await update({ id: pluginId, permissions });
      await refreshPlugins();
      window.dispatchEvent(new Event("hypershell:plugins-changed"));
    } catch (error) {
      setPluginError(error instanceof Error ? error.message : t("Failed to update plugin permissions"));
    } finally {
      setBusy(false);
    }
  };

  const uninstallPlugin = async (pluginId: string) => {
    const uninstall = getShell().pluginsUninstall;
    setBusy(true);
    try {
      await uninstall(pluginId);
      await refreshPlugins();
      window.dispatchEvent(new Event("hypershell:plugins-changed"));
      setRestartRequired(true);
      onPendingRestartChange(true);
    } catch (error) {
      setPluginError(error instanceof Error ? error.message : t("Plugin uninstallation failed"));
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    setBusy(true);
    try { await getShell().pluginsRestart(); }
    catch (error) { setPluginError(error instanceof Error ? error.message : t("Restart failed")); }
    finally { setBusy(false); }
  };

  const confirmPreparedPackage = async () => {
    if (!preparedPackage) return;
    const pending = preparedPackage;
    setPreparedPackage(null);
    setBusy(true);
    setPluginError(null);
    try {
      await getShell().pluginsInstallSelected(pending.token);
      await refreshPlugins();
      window.dispatchEvent(new Event("hypershell:plugins-changed"));
      setRestartRequired(true);
      onPendingRestartChange(true);
    } catch (error) {
      setPluginError(error instanceof Error ? error.message : t("Plugin installation failed"));
    } finally {
      setBusy(false);
    }
  };

  const cancelPreparedPackage = () => {
    if (preparedPackage) void getShell().pluginsCancelInstall(preparedPackage.token);
    setPreparedPackage(null);
  };

  return (
    <section aria-label={t("Plugin Manager")} className="mx-auto w-full max-w-6xl p-5">
      <div className="mb-4 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void installPlugin()}>{t("Install / Update Plugin")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation("restart")}>{t("Restart app")}</Button>
      </div>
      <details className="group mb-2 rounded-md border border-border" aria-label={t("Built-in Plugins")}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold uppercase text-text-muted hover:bg-base-700/40 [&::-webkit-details-marker]:hidden">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="transition-transform group-open:rotate-90">
            <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("Built-in Plugins")}
          <span className="ml-auto font-normal normal-case text-text-muted">{internalPlugins.length}</span>
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...internalPlugins].sort((a, b) => Number(b.kind === "core") - Number(a.kind === "core")).map((plugin) => (
          <div key={plugin.id} className="flex min-w-0 items-start justify-between gap-3 rounded border border-border bg-base-800/40 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary"><PluginIcon pluginId={plugin.id} />{t(plugin.title)}</div>
              <div className="mt-1 text-xs text-text-muted">{t(plugin.description)}</div>
              <code className="mt-1 block text-[11px] text-text-muted">{plugin.id}</code>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
              <span className="text-text-secondary">{t("Built-in")}</span>
              {plugin.kind === "core" ? (
                <span className="text-success">{t("Core plugin")}</span>
              ) : internalPluginStates.some((item) => item.id === plugin.id && item.kind === "optional") ? (
                <label className="flex items-center gap-2 text-text-secondary">
                  <span>{internalPluginStates.find((item) => item.id === plugin.id)?.enabled ? t("Enabled") : t("Disabled")}</span>
                  <input
                    type="checkbox"
                    checked={internalPluginStates.find((item) => item.id === plugin.id)?.enabled ?? false}
                    disabled={busy}
                    aria-label={`${t(plugin.title)}: ${t("Enabled")}`}
                    onChange={(event) => void setInternalPluginEnabled(plugin.id, event.currentTarget.checked)}
                  />
                </label>
              ) : (
                <span className="text-success">{t("Enabled")}</span>
              )}
            </div>
          </div>
        ))}
        </div>
      </details>
      <div className="pt-5 pb-2"><SectionLabel>{t("External Plugins")}</SectionLabel></div>
      {externalPlugins.length === 0 && <p className="py-4 text-xs text-text-muted">{t("No external plugins installed")}</p>}
      <div className="divide-y divide-border border-y border-border">
        {externalPlugins.map((plugin) => (
          <div key={plugin.manifest.id} className="py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary"><PluginIcon pluginId={plugin.manifest.id} />{t(plugin.manifest.name)} <span className="text-xs text-text-muted">v{plugin.manifest.version}</span></div>
                <div className="mt-1 text-xs text-text-muted">{t(plugin.manifest.description)}</div>
                <code className="mt-1 block text-[11px] text-text-muted">{plugin.manifest.id}</code>
                <div className="mt-2 text-xs text-success">{t("Installed, runtime available")}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmation(plugin.manifest.id)}>
                  {t("Uninstall")}
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {plugin.manifest.permissions.map((permission) => (
                <label key={permission} className="flex items-center gap-2 text-xs text-text-secondary">
                  <PluginIcon pluginId={plugin.manifest.id} size={13} />
                  <input
                    type="checkbox"
                    checked={plugin.grantedPermissions.includes(permission)}
                    disabled={busy}
                    onChange={(event) => void updatePermissions(plugin.manifest.id, permission, event.currentTarget.checked)}
                  />
                  <span title={permission}>{t(`permission.${permission}`)}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {pluginError && <p role="alert" className="mt-2 text-xs text-danger">{pluginError}</p>}
      {restartRequired && <p role="status" className="mt-2 text-xs text-text-secondary">{t("Restart the app to apply built-in plugin changes")}</p>}
      <p className="mt-3 text-xs text-text-muted">{t("Built-in plugins update with HyperShell. Update external plugins using a newer .hspkg package.")}</p>
      <ConfirmDialog open={confirmation !== null || preparedPackage !== null}
        title={preparedPackage ? t(preparedPackage.action === "install" ? "Confirm plugin installation" : "Confirm plugin update") : t(confirmation === "restart" ? "Restart app" : "Uninstall")}
        message={preparedPackage
          ? `${t(preparedPackage.action === "install" ? "Install plugin named" : "Update plugin named")} “${t(preparedPackage.manifest.name)}”?`
          : t(confirmation === "restart" ? "Restart HyperShell now? Active sessions will disconnect." : "Uninstall this plugin?")}
        description={preparedPackage ? `v${preparedPackage.manifest.version} · ${preparedPackage.manifest.id}` : undefined}
        confirmLabel={t(preparedPackage ? preparedPackage.action === "install" ? "Install" : "Update" : confirmation === "restart" ? "Restart app" : "Uninstall")}
        cancelLabel={t("Cancel")} onCancel={() => { cancelPreparedPackage(); setConfirmation(null); }}
        onConfirm={() => {
          if (preparedPackage) { void confirmPreparedPackage(); return; }
          const action = confirmation;
          setConfirmation(null);
          if (action === "restart") void restart();
          else if (action) void uninstallPlugin(action);
        }} />
      <p className="mt-3 text-xs text-text-muted">{t("Plugins run in an isolated frame. Host actions still require permission and confirmation.")}</p>
    </section>
  );
}

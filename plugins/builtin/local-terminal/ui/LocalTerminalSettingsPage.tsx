import type { PluginSettingsPageProps } from "@hypershell/plugin-api";
import { usePluginI18n, usePluginSettings } from "@hypershell/plugin-sdk";

export function LocalTerminalSettingsPage({ host }: PluginSettingsPageProps) {
  const { t } = usePluginI18n(host);
  const { settings } = usePluginSettings(host, "local-terminal");
  const showInSidebar = settings.showInSidebar !== false;

  return (
    <label className="flex items-center justify-between gap-4 border-b border-border py-3 text-sm text-text-primary">
      <span>{t("Show Local Terminal in Sidebar")}</span>
      <input
        type="checkbox"
        checked={showInSidebar}
        onChange={(event) => void host.settings.updatePlugin("local-terminal", { showInSidebar: event.target.checked })}
      />
    </label>
  );
}

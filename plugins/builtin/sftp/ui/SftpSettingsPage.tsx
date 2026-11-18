import type { PluginSettingsPageProps } from "@hypershell/plugin-api";
import { usePluginI18n, usePluginSettings } from "@hypershell/plugin-sdk";

export function SftpSettingsPage({ host }: PluginSettingsPageProps) {
  const { t } = usePluginI18n(host);
  const { settings, update } = usePluginSettings(host, "sftp");
  const usePopupTransferMonitor = settings.usePopupTransferMonitor === true;
  const autoHideCompletedTransfers = settings.autoHideCompletedTransfers === true;
  const concurrency = [1, 2, 4].includes(Number(settings.sftpChunkConcurrency))
    ? Number(settings.sftpChunkConcurrency)
    : 1;

  return (
    <div>
      <div className="select-none pb-1 pt-2 text-[10px] font-medium uppercase tracking-widest text-text-muted/70">
        {t("Transfers")}
      </div>
      <SettingRow
        label={t("Popup SFTP Transfer Monitor")}
        description={t("Replace the inline transfer strip with a floating popup that shows animated progress and live speed")}
      >
        <input
          aria-label={t("Popup SFTP Transfer Monitor")}
          type="checkbox"
          checked={usePopupTransferMonitor}
          onChange={(event) => void update({ usePopupTransferMonitor: event.target.checked })}
          className="size-4 accent-accent"
        />
      </SettingRow>
      <SettingRow
        label={t("Auto-Hide Completed Transfers")}
        description={t("Automatically hide the transfer popup when all transfers finish")}
      >
        <input
          aria-label={t("Auto-Hide Completed Transfers")}
          type="checkbox"
          checked={autoHideCompletedTransfers}
          onChange={(event) => void update({ autoHideCompletedTransfers: event.target.checked })}
          className="size-4 accent-accent"
        />
      </SettingRow>
      <SettingRow
        label={t("Transfer Threads")}
        description={t("Number of parallel chunks for each large file transfer")}
      >
        <select
          aria-label={t("Transfer Threads")}
          value={concurrency}
          onChange={(event) => void update({ sftpChunkConcurrency: Number(event.target.value) })}
          className="w-40 rounded-lg border border-border bg-base-900 px-3 py-2 text-sm text-text-primary focus-ring"
        >
          <option value={1}>{t("1 thread")}</option>
          <option value={2}>{t("2 threads")}</option>
          <option value={4}>{t("4 threads")}</option>
        </select>
      </SettingRow>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3">
      <div className="min-w-0">
        <div className="text-sm text-text-primary">{label}</div>
        <div className="text-xs text-text-muted">{description}</div>
      </div>
      {children}
    </div>
  );
}

import type { PluginWorkspaceToolbarButtonProps } from "@hypershell/plugin-api";
import { usePluginI18n } from "@hypershell/plugin-sdk";

export function TunnelsToolbarButton({ active, onToggle, host }: PluginWorkspaceToolbarButtonProps) {
  const { t } = usePluginI18n(host);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded p-1.5 transition-colors ${active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"}`}
      title={t("Tunnels")}
      aria-label={t("Tunnels")}
      aria-pressed={active}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    </button>
  );
}

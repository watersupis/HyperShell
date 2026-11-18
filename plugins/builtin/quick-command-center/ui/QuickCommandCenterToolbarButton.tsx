import type { PluginWorkspaceToolbarButtonProps } from "@hypershell/plugin-api";

export function QuickCommandCenterToolbarButton({ active, onToggle, host }: PluginWorkspaceToolbarButtonProps) {
  const label = host.i18n.getLocale() === "zh-CN" ? "快捷指令中心" : "Quick Command Center";
  return (
    <button type="button" onClick={onToggle} title={label} aria-label={label} aria-pressed={active}
      className={`rounded p-1.5 transition-colors ${active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-base-700/60 hover:text-text-primary"}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M8 7h12M8 12h12M8 17h12" /><path d="M3.5 7h.01M3.5 12h.01M3.5 17h.01" strokeWidth="2.5" />
      </svg>
    </button>
  );
}

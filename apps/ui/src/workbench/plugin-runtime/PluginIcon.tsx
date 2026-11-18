const paths: Record<string, string> = {
  ssh: "M4 6h16v12H4z M7 9l3 3-3 3m6 0h4",
  sftp: "M3 7h7l2 2h9v11H3z M3 7V4h7l2 3",
  "local-terminal": "M3 5h18v14H3z M6 9l3 3-3 3m6 0h5",
  serial: "M4 7h16v10H4z M7 4v3m5-3v3m5-3v3M7 17v3m5-3v3m5-3v3",
  recording: "M4 4h16v16H4z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  tunnels: "M3 7h7m4 10h7M7 3l-4 4 4 4m10 2 4 4-4 4M10 7v10h4",
  "com.hypershell.quick-command-center": "M4 5h16v14H4z M7 9l3 3-3 3m7-6-2 6",
};
export function PluginIcon({ pluginId, size = 16 }: { pluginId?: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
    <path d={paths[pluginId ?? ""] ?? "M9 3h6v5h5v7h-5v6H9v-6H3V8h6z"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

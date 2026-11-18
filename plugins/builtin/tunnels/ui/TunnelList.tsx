import { useEffect } from "react";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { useTunnelStore } from "./tunnelStore";
import { usePluginI18n } from "@hypershell/plugin-sdk";

const protocolBadgeClasses: Record<string, string> = {
  local: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  remote: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  dynamic: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export function TunnelList({ host }: { host: PluginUiHostServices }) {
  const { t } = usePluginI18n(host);
  const { activeForwards, selectedForwardId, selectForward, refresh } = useTunnelStore();

  useEffect(() => { void refresh(host); }, [host, refresh]);

  const handleStop = async (id: string) => {
    await host.portForward.stop({ id });
    await refresh(host);
  };

  if (activeForwards.length === 0) {
    return (
      <div className="text-xs text-text-muted/60 italic p-3">{t("No active port forwards.")}</div>
    );
  }

  return (
    <div className="grid gap-1 p-2">
      {activeForwards.map((fwd) => (
        <div
          key={fwd.id}
          role="button"
          tabIndex={0}
          aria-pressed={fwd.id === selectedForwardId}
          onClick={() => selectForward(fwd.id === selectedForwardId ? null : fwd.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectForward(fwd.id === selectedForwardId ? null : fwd.id);
            }
          }}
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-all duration-100 ${
            fwd.id === selectedForwardId
              ? "bg-accent/10 border border-accent/20"
              : "bg-surface/40 border border-transparent hover:border-border/30"
          }`}
        >
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${protocolBadgeClasses[fwd.protocol ?? "local"] ?? ""}`}>
            {fwd.protocol === "local" ? "L" : fwd.protocol === "remote" ? "R" : "D"}
          </span>
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-text-primary truncate">
            :{fwd.localPort ?? "?"}
            {fwd.protocol !== "dynamic" && fwd.remoteHost && ` → ${fwd.remoteHost}:${fwd.remotePort ?? ""}`}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); void handleStop(fwd.id); }}
            className="ml-auto text-xs text-text-muted hover:text-red-400 transition-colors shrink-0"
          >
            {t("Stop")}
          </button>
        </div>
      ))}
    </div>
  );
}

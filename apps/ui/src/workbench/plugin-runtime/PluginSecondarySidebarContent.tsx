import { Suspense } from "react";
import type { PluginSidebarTarget } from "./secondarySidebarStore";
import { useI18n } from "../shared/i18n";
import { internalPlugins } from "./internalPluginRegistry";
import { internalPluginUiHostServices } from "./internalPluginUiHostServices";
import { PluginWorkspace } from "./PluginWorkspace";

export function getPluginSidebarTitle(target: PluginSidebarTarget): string {
  if (target.title) return target.title;
  if (target.source === "builtin") {
    return internalPlugins.find((plugin) => plugin.id === target.pluginId)?.title ?? target.pluginId;
  }
  return target.pluginId;
}

export function PluginSecondarySidebarContent({
  target,
  onClose,
}: {
  target: PluginSidebarTarget;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const builtin = target.source === "builtin"
    ? internalPlugins.find((plugin) => plugin.id === target.pluginId)
    : undefined;
  const BuiltinView = builtin?.secondarySidebarView;

  return (
    <Suspense fallback={<div className="p-3 text-xs text-text-muted">{t("Loading plugin")}</div>}>
      {target.source === "builtin" ? (
        BuiltinView
          ? <BuiltinView onClose={onClose} host={internalPluginUiHostServices} />
          : <div role="alert" className="p-3 text-xs text-text-muted">{t("Plugin view is unavailable")}</div>
      ) : (
        <PluginWorkspace
          key={`${target.pluginId}:${target.hostId ?? ""}`}
          pluginId={target.pluginId}
          hostId={target.hostId}
          surface="workspace.secondarySidebar"
          onClose={onClose}
          onOpenSettings={() => window.dispatchEvent(new Event("hypershell:open-plugin-settings"))}
        />
      )}
    </Suspense>
  );
}

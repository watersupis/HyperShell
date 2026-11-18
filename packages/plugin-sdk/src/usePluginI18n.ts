import { useSyncExternalStore } from "react";
import type { PluginLocale, PluginUiHostServices } from "@hypershell/plugin-api";

export interface PluginI18n {
  locale: PluginLocale;
  t: (key: string) => string;
}

export function usePluginI18n(host: PluginUiHostServices): PluginI18n {
  const locale = useSyncExternalStore(
    host.i18n.subscribe,
    host.i18n.getLocale,
    host.i18n.getLocale
  );

  return {
    locale,
    t: (key) => host.i18n.translate(key, locale),
  };
}

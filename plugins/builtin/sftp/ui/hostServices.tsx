import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { usePluginI18n } from "@hypershell/plugin-sdk";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

const SftpUiHostContext = createContext<PluginUiHostServices | null>(null);

export function SftpUiHostProvider({
  host,
  children,
}: {
  host: PluginUiHostServices;
  children: ReactNode;
}) {
  return <SftpUiHostContext.Provider value={host}>{children}</SftpUiHostContext.Provider>;
}

export function useSftpUiHost(): PluginUiHostServices {
  const host = useContext(SftpUiHostContext);
  if (!host) {
    throw new Error("SFTP UI requires host services");
  }
  return host;
}

export function useSftpI18n() {
  return usePluginI18n(useSftpUiHost());
}

export function useSftpSetting<T = unknown>(key: string): T {
  const host = useSftpUiHost();
  const settings = useSyncExternalStore(
    host.settings.subscribe,
    () => host.settings.getPlugin("sftp"),
    () => host.settings.getPlugin("sftp")
  );
  return settings[key] as T;
}

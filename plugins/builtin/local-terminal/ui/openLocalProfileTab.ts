import type { LocalProfileRecord } from "@hypershell/shared";
import type { PluginTabRequest } from "@hypershell/plugin-api";

export function openLocalProfileTab(
  openTab: (tab: PluginTabRequest) => void,
  profile: LocalProfileRecord
): void {
  const sessionId = `local-${profile.id}-${Date.now()}`;
  openTab({
    tabKey: sessionId,
    sessionId,
    title: profile.name,
    transport: "local",
    profileId: profile.id,
    type: "terminal",
    preopened: false,
  });
}

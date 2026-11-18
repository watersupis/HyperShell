import { localProfilesStore, selectLaunchableProfiles } from "./ui/localProfilesStore";
import { localTerminalUiStore } from "./ui/uiStore";
import { openLocalProfileTab } from "./ui/openLocalProfileTab";
import { resolveClaudeResumeSessionId } from "./ui/claudeResumeTarget";
import { migrateLocalTerminalWorkspaceTab } from "./ui/migrateWorkspaceTab";
import type { PluginUiContribution } from "@hypershell/plugin-api";

export const localTerminalUiContribution: PluginUiContribution = {
  id: "local-terminal",
  migrateSettings: (settings) => {
    if (!("showLocalInSidebar" in settings.general)) return settings;
    const general = { ...settings.general };
    const legacyValue = general.showLocalInSidebar;
    delete general.showLocalInSidebar;
    const pluginSettings = { ...settings.pluginSettings };
    const localSettings = { ...(pluginSettings["local-terminal"] ?? {}) };
    if (localSettings.showInSidebar === undefined && typeof legacyValue === "boolean") {
      localSettings.showInSidebar = legacyValue;
    }
    pluginSettings["local-terminal"] = localSettings;
    return { ...settings, general, pluginSettings };
  },
  loadOverlay: () =>
    import("./ui/LocalTerminalOverlay").then((module) => ({ default: module.LocalTerminalOverlay })),
  loadWorkspaceLauncher: () =>
    import("./ui/LocalTerminalLauncher").then((module) => ({ default: module.LocalTerminalLauncher })),
  loadSidebarContribution: () =>
    import("./ui/LocalTerminalSidebar").then((module) => ({ default: module.LocalTerminalSidebar })),
  loadSessionOpenPrompt: () =>
    import("./ui/ClaudeResumePrompt").then((module) => ({ default: module.ClaudeResumePrompt })),
  getSettingsPages: () => [{
    id: "sidebar",
    title: "Local Terminal",
    load: () => import("./ui/LocalTerminalSettingsPage").then((module) => ({ default: module.LocalTerminalSettingsPage })),
  }],
  getSessionOpenData: (tab) => {
    const profile = localProfilesStore.getState().profiles.find((item) => item.id === tab.profileId);
    const recoveryData = tab.pluginData?.["local-terminal"];
    const claudeSessionId =
      recoveryData && typeof recoveryData === "object" &&
      typeof (recoveryData as Record<string, unknown>).claudeSessionId === "string"
        ? (recoveryData as { claudeSessionId: string }).claudeSessionId
        : undefined;
    const resumeSessionId = resolveClaudeResumeSessionId({
      transport: tab.transport as "local" | undefined,
      profile,
      claudeSessionId,
    });
    return resumeSessionId ? { "local-terminal": { claudeSessionId: resumeSessionId } } : undefined;
  },
  migrateWorkspaceTab: migrateLocalTerminalWorkspaceTab,
  getCommands: ({ openTab }) =>
    selectLaunchableProfiles(localProfilesStore.getState().profiles).map((profile) => ({
      id: `local:${profile.id}`,
      title: `Open local shell: ${profile.name}`,
      category: "Local",
      visible: () => true,
      execute: () => openLocalProfileTab(openTab, profile),
    })),
  activate: (host) => {
    void localProfilesStore.getState().load(host);
    const notifyCommandsChanged = () => window.dispatchEvent(new Event("hypershell:plugin-commands-changed"));
    const unsubscribe = localProfilesStore.subscribe(notifyCommandsChanged);
    return () => {
      unsubscribe();
      localTerminalUiStore.getState().closeProfileDialog();
    };
  },
};

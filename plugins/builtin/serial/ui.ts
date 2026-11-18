import type { PluginUiContribution } from "@hypershell/plugin-api";
import { serialProfilesStore } from "./ui/serialProfilesStore";

export const serialUiContribution: PluginUiContribution = {
  id: "serial",
  migrateSettings: (settings) => {
    if (!("showSerialInSidebar" in settings.general)) return settings;
    const general = { ...settings.general };
    const legacyValue = general.showSerialInSidebar;
    delete general.showSerialInSidebar;
    const pluginSettings = { ...settings.pluginSettings };
    const serialSettings = { ...(pluginSettings.serial ?? {}) };
    if (serialSettings.showInSidebar === undefined && typeof legacyValue === "boolean") {
      serialSettings.showInSidebar = legacyValue;
    }
    pluginSettings.serial = serialSettings;
    return { ...settings, general, pluginSettings };
  },
  loadWorkspaceLauncher: () =>
    import("./ui/SerialLauncher").then((module) => ({ default: module.SerialLauncher })),
  loadSidebarContribution: () =>
    import("./ui/SerialSidebar").then((module) => ({ default: module.SerialSidebar })),
  loadTerminalToolbar: () =>
    import("./ui/SerialTerminalToolbar").then((module) => ({ default: module.SerialTerminalToolbar })),
  getSettingsPages: () => [{
    id: "sidebar",
    title: "Serial",
    load: () => import("./ui/SerialSettingsPage").then((module) => ({ default: module.SerialSettingsPage })),
  }],
  getQuickConnectProfiles: () => serialProfilesStore.getState().profiles.map((profile) => ({
    id: profile.id,
    label: profile.name,
    hostname: profile.path,
    transport: "serial",
    description: `${profile.baudRate} baud`,
  })),
  openQuickConnectProfile: (profileId, { openTab }) => {
    const profile = serialProfilesStore.getState().profiles.find((item) => item.id === profileId);
    if (!profile) return;
    const sessionId = `serial-${profile.id}-${crypto.randomUUID()}`;
    openTab({ sessionId, title: profile.name, transport: "serial", profileId: profile.id });
  },
  getCommands: () => [{
    id: "serial.new-profile",
    title: "New Serial Profile",
    category: "Serial",
    visible: () => true,
    execute: () => { window.dispatchEvent(new Event("hypershell:serial-new-profile")); },
    keywords: ["serial", "com", "uart", "port"],
  }],
  activate: (host) => {
    void serialProfilesStore.getState().load(host).catch(console.error);
  },
};

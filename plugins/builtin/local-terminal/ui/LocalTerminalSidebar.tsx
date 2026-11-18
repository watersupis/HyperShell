import { useState } from "react";
import { useStore } from "zustand";
import type { PluginSidebarContributionProps } from "@hypershell/plugin-api";
import { usePluginI18n, usePluginSettings } from "@hypershell/plugin-sdk";
import { localProfilesStore } from "./localProfilesStore";
import { SidebarLocalList } from "./SidebarLocalList";
import { localTerminalUiStore } from "./uiStore";
import { openLocalProfileTab } from "./openLocalProfileTab";

export function LocalTerminalSidebar({ openTab, host }: PluginSidebarContributionProps) {
  const { t } = usePluginI18n(host);
  const { settings } = usePluginSettings(host, "local-terminal");
  const SidebarSection = host.ui.SidebarSection;
  const [showHidden, setShowHidden] = useState(false);
  const profiles = useStore(localProfilesStore, (state) => state.profiles);
  const visible = typeof settings.showInSidebar === "boolean"
    ? settings.showInSidebar
    : true;

  if (!visible) return null;

  return (
    <SidebarSection title={t("Local")}>
      <SidebarLocalList
        profiles={profiles}
        onConnect={(profile) => openLocalProfileTab(openTab, profile)}
        onReorder={(items) => void localProfilesStore.getState().reorder(host, items)}
        onRescan={() => void localProfilesStore.getState().rescan(host)}
        showHidden={showHidden}
        onToggleShowHidden={() => setShowHidden((value) => !value)}
        onToggleHidden={(profile, hidden) =>
          void localProfilesStore.getState().setHidden(host, profile.id, hidden)
        }
        onNew={() => localTerminalUiStore.getState().createProfile()}
        onEdit={(profile) => void localTerminalUiStore.getState().editProfile(host, profile)}
      />
    </SidebarSection>
  );
}

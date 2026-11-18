import { useRef, useState } from "react";
import { useStore } from "zustand";
import { LocalProfileIcon } from "./LocalProfileIcon";
import { NewTabMenu } from "./NewTabMenu";
import { localProfilesStore, selectLaunchableProfiles } from "./localProfilesStore";
import type { PluginWorkspaceLauncherProps } from "@hypershell/plugin-api";
import { usePluginI18n } from "@hypershell/plugin-sdk";
import { openLocalProfileTab } from "./openLocalProfileTab";

export function LocalTerminalLauncher({ surface, openTab, host }: PluginWorkspaceLauncherProps) {
  const { t } = usePluginI18n(host);
  const Button = host.ui.Button;
  const IconButton = host.ui.IconButton;
  const profiles = useStore(localProfilesStore, (state) => state.profiles);
  const launchableProfiles = selectLaunchableProfiles(profiles);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  if (surface === "welcome") {
    if (launchableProfiles.length === 0) return null;
    return (
      <div className="flex max-w-md flex-wrap items-center justify-center gap-2">
        {launchableProfiles.map((profile) => (
          <Button key={profile.id} variant="outline" size="sm" shape="pill" onClick={() => openLocalProfileTab(openTab, profile)}>
            <LocalProfileIcon icon={profile.icon} className="h-3.5 w-3.5 shrink-0" />
            <span>{profile.name}</span>
          </Button>
        ))}
      </div>
    );
  }

  if (launchableProfiles.length === 0) return null;
  return (
    <div className="relative flex h-full shrink-0 items-center pb-2 pl-0.5">
      <IconButton
        ref={triggerRef}
        variant="ghost"
        onClick={() => setMenuOpen((open) => !open)}
        title={t("New Tab")}
        className="h-6 w-6"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </IconButton>
      {menuOpen && (
        <NewTabMenu
          profiles={launchableProfiles}
          onSelect={(profile) => openLocalProfileTab(openTab, profile)}
          onClose={() => setMenuOpen(false)}
          triggerRef={triggerRef}
        />
      )}
    </div>
  );
}

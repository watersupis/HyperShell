import { useState } from "react";
import { useTunnelStore } from "./tunnelStore";
import { TunnelTopology } from "./TunnelTopology";
import { TunnelList } from "./TunnelList";
import { TunnelForm } from "./TunnelForm";
import { PortForwardProfileForm, type PortForwardProfileValue } from "./PortForwardProfileForm";
import { readPortForwardProfiles } from "./portForwardProfiles";
import type { PluginSecondarySidebarViewProps } from "@hypershell/plugin-api";
import { usePluginI18n, usePluginSettings } from "@hypershell/plugin-sdk";

export function TunnelManagerPanel({ host }: PluginSecondarySidebarViewProps) {
  const { t } = usePluginI18n(host);
  const { settings, update } = usePluginSettings(host, "tunnels");
  const refresh = useTunnelStore((state) => state.refresh);
  const [showForm, setShowForm] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const profiles = readPortForwardProfiles(settings.portForwardProfiles);

  const saveProfile = async (value: PortForwardProfileValue) => {
    const existing = profiles.find((profile) => profile.name.toLowerCase() === value.name.trim().toLowerCase());
    const next = profiles.filter((profile) => profile.id !== existing?.id);
    next.push({ ...value, id: existing?.id ?? crypto.randomUUID(), name: value.name.trim() });
    await update({ portForwardProfiles: next });
    setShowProfileForm(false);
    setProfileError(false);
  };

  const startProfile = async (profile: (typeof profiles)[number]) => {
    await host.portForward.start({
      hostname: profile.hostname,
      username: profile.username || undefined,
      port: profile.sshPort,
      protocol: profile.protocol,
      localAddress: profile.localAddress,
      localPort: profile.localPort,
      remoteHost: profile.remoteHost,
      remotePort: profile.remotePort,
    });
    await refresh(host);
    setProfileError(false);
  };

  const removeProfile = async (id: string) => {
    await update({ portForwardProfiles: profiles.filter((profile) => profile.id !== id) });
    setProfileError(false);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-base-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-text-primary">{t("Tunnel Manager")}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setShowForm(true); setShowProfileForm(false); }} className="text-xs px-2.5 py-1 rounded-md bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors">+ {t("New")}</button>
          <button type="button" onClick={() => { setShowProfileForm(true); setShowForm(false); }} className="text-xs px-2.5 py-1 rounded-md border border-border text-text-secondary hover:bg-base-700">{t("Save profile")}</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <TunnelTopology />

        {showForm && (
          <div className="p-3">
            <TunnelForm
              host={host}
              onSubmit={() => { setShowForm(false); void refresh(host); }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {showProfileForm && (
          <div className="p-3">
            <PortForwardProfileForm t={t} onSubmit={(value) => { void saveProfile(value).catch(() => setProfileError(true)); }} />
            <button type="button" onClick={() => setShowProfileForm(false)} className="mt-2 text-xs text-text-muted hover:text-text-primary">{t("Cancel")}</button>
            {profileError && <p role="alert" className="mt-2 text-xs text-danger">{t("Failed to save profile")}</p>}
          </div>
        )}

        <section aria-label={t("Saved profiles")} className="border-y border-border">
          <h2 className="px-3 py-2 text-xs font-semibold text-text-secondary">{t("Saved profiles")}</h2>
          {profiles.length === 0 ? (
            <p className="px-3 pb-3 text-xs text-text-muted">{t("No saved port-forward profiles.")}</p>
          ) : profiles.map((profile) => (
            <div key={profile.id} className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-text-primary">{profile.name}</div>
                <div className="truncate text-[11px] text-text-muted">{profile.hostname}:{profile.sshPort} · {profile.protocol.toUpperCase()} :{profile.localPort}</div>
              </div>
              <button type="button" onClick={() => { void startProfile(profile).catch(() => setProfileError(true)); }} className="rounded-md border border-accent/30 px-2 py-1 text-xs text-accent hover:bg-accent/10">{t("Start")}</button>
              <button type="button" onClick={() => { void removeProfile(profile.id).catch(() => setProfileError(true)); }} className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-danger">{t("Delete")}</button>
            </div>
          ))}
        </section>
        {profileError && <p role="alert" className="m-3 text-xs text-danger">{t("Profile action failed")}</p>}

        <TunnelList host={host} />
      </div>
    </div>
  );
}

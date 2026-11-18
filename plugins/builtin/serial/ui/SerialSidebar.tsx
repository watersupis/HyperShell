import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { PluginSidebarContributionProps } from "@hypershell/plugin-api";
import { usePluginSettings } from "@hypershell/plugin-sdk";
import type { SerialProfileRecord } from "@hypershell/shared";
import { SerialProfileForm, type SerialProfileFormValue } from "./SerialProfileForm";
import { SidebarSerialList } from "./SidebarSerialList";
import { serialProfilesStore } from "./serialProfilesStore";

function toFormValue(profile: SerialProfileRecord | null): Partial<SerialProfileFormValue> | undefined {
  if (!profile) return undefined;
  return {
    name: profile.name,
    path: profile.path,
    baudRate: profile.baudRate,
    dataBits: profile.dataBits as SerialProfileFormValue["dataBits"],
    stopBits: profile.stopBits as SerialProfileFormValue["stopBits"],
    parity: profile.parity as SerialProfileFormValue["parity"],
    flowControl: profile.flowControl as SerialProfileFormValue["flowControl"],
    localEcho: profile.localEcho,
    dtr: profile.dtr,
    rts: profile.rts,
  };
}

export function SerialSidebar({ openTab, host }: PluginSidebarContributionProps) {
  const { settings } = usePluginSettings(host, "serial");
  const profiles = useStore(serialProfilesStore, (state) => state.profiles);
  const loaded = useStore(serialProfilesStore, (state) => state.loaded);
  const [editing, setEditing] = useState<SerialProfileRecord | null | undefined>(undefined);
  const [ports, setPorts] = useState<string[]>([]);

  useEffect(() => {
    if (!serialProfilesStore.getState().loading && !loaded) {
      void serialProfilesStore.getState().load(host).catch(console.error);
    }
  }, [host, loaded]);

  useEffect(() => {
    const openNewProfile = () => {
      setEditing(null);
      refreshPorts();
    };
    window.addEventListener("hypershell:serial-new-profile", openNewProfile);
    return () => window.removeEventListener("hypershell:serial-new-profile", openNewProfile);
  }, []);

  const refreshPorts = () => {
    void host.serialProfiles.listPorts().then((items) => setPorts(items.map((item) => item.path))).catch(console.error);
  };

  const submit = (value: SerialProfileFormValue) => {
    void serialProfilesStore.getState().upsert(host, {
      id: editing?.id ?? `serial-${crypto.randomUUID()}`,
      ...value,
      notes: editing?.notes ?? null,
    }).then(() => setEditing(undefined)).catch(console.error);
  };

  const connect = (profile: SerialProfileRecord) => {
    const sessionId = `serial-${profile.id}-${crypto.randomUUID()}`;
    openTab({ sessionId, title: profile.name, transport: "serial", profileId: profile.id });
  };

  const showInSidebar = typeof settings.showInSidebar === "boolean"
    ? settings.showInSidebar
    : true;
  if (!showInSidebar) return null;

  return (
    <>
      <section className="flex min-h-0 flex-col px-2">
        <header className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Serial</span>
          <button type="button" onClick={() => { setEditing(null); refreshPorts(); }} className="rounded p-1 text-text-muted hover:bg-base-700 hover:text-text-primary" title="New serial profile" aria-label="New serial profile">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </header>
        <SidebarSerialList profiles={profiles} onConnect={connect} onEdit={(profile) => { setEditing(profile); refreshPorts(); }} />
      </section>

      {editing !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(undefined); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="serial-profile-title" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-md border border-border bg-base-800 p-5 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h2 id="serial-profile-title" className="text-base font-semibold text-text-primary">{editing ? `Edit ${editing.name}` : "New Serial Profile"}</h2>
              <button type="button" onClick={() => setEditing(undefined)} className="rounded p-1 text-text-muted hover:bg-base-700 hover:text-text-primary" aria-label="Close">×</button>
            </header>
            <SerialProfileForm
              key={editing?.id ?? "new"}
              initialValue={toFormValue(editing)}
              submitLabel={editing ? "Update profile" : "Add profile"}
              availablePorts={ports}
              onRefreshPorts={refreshPorts}
              onSubmit={submit}
            />
            {editing && (
              <button type="button" onClick={() => {
                void serialProfilesStore.getState().remove(host, editing.id).then(() => setEditing(undefined)).catch(console.error);
              }} className="mt-3 rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">Delete profile</button>
            )}
          </section>
        </div>
      )}
    </>
  );
}

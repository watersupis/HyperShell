import { useEffect, useMemo, useState } from "react";
import type { HostRecord, LocalProfileRecord, WorkspaceLayout } from "@hypershell/shared";
import { getShell } from "../shared/shell";
import { useI18n } from "../shared/i18n";

export type WorkspacePreset = "columns-1" | "columns-2" | "columns-3" | "main-right" | "main-bottom" | "tabs";
export interface WorkspaceLaunchTarget {
  transport: "local" | "ssh";
  profileId: string;
  title: string;
  hostId?: string;
}

interface WorkspaceCreatorProps {
  onCancel: () => void;
  onOpen: (targets: WorkspaceLaunchTarget[], preset: WorkspacePreset) => Promise<void>;
  onSaveTemplate: (name: string, layout: WorkspaceLayout) => Promise<void>;
  initialName?: string;
  initialTargets?: WorkspaceLaunchTarget[];
  initialPreset?: WorkspacePreset;
}

const PRESETS: WorkspacePreset[] = ["columns-1", "columns-2", "columns-3", "main-right", "main-bottom", "tabs"];
const PRESET_LABELS: Record<WorkspacePreset, string> = {
  "columns-1": "1 column", "columns-2": "2 columns", "columns-3": "3 columns",
  "main-right": "Main + right", "main-bottom": "Main + bottom", tabs: "Tab switch",
};

export function workspacePresetLayout(preset: WorkspacePreset, targets: WorkspaceLaunchTarget[]): Pick<WorkspaceLayout, "paneCount" | "splitDirection" | "paneSizes"> {
  const paneCount = preset === "columns-3" ? Math.min(3, targets.length) : preset === "columns-2" || preset === "main-right" || preset === "main-bottom" ? Math.min(2, targets.length) : 1;
  const splitDirection = preset === "main-bottom" ? "vertical" : "horizontal";
  const size = Math.floor(100 / Math.max(1, paneCount));
  const paneSizes = Array.from({ length: Math.max(1, paneCount) }, (_, i) => i === paneCount - 1 ? 100 - size * (paneCount - 1) : size);
  if (preset === "main-right" || preset === "main-bottom") paneSizes.splice(0, paneSizes.length, 70, 30);
  return { paneCount: Math.max(1, paneCount), splitDirection, paneSizes };
}

export function WorkspaceCreator({ onCancel, onOpen, onSaveTemplate, initialName = "", initialTargets = [], initialPreset = "columns-1" }: WorkspaceCreatorProps) {
  const { t } = useI18n();
  const [hosts, setHosts] = useState<HostRecord[]>([]);
  const [profiles, setProfiles] = useState<LocalProfileRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => initialTargets.map((target) => target.transport + ":" + target.profileId));
  const [preset, setPreset] = useState<WorkspacePreset>(initialPreset);
  const [mode, setMode] = useState<"temporary" | "template">(initialName ? "template" : "temporary");
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getShell().listHosts(), getShell().listLocalProfiles()]).then(([nextHosts, nextProfiles]) => {
      if (cancelled) return;
      setHosts(nextHosts ?? []);
      setProfiles((nextProfiles ?? []).filter((profile) => profile.isAvailable && !profile.isHidden));
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const targets = useMemo<WorkspaceLaunchTarget[]>(() => [
    ...profiles.map((profile) => ({ transport: "local" as const, profileId: profile.id, title: profile.name })),
    ...hosts.map((host) => ({ transport: "ssh" as const, profileId: host.id, title: host.name, hostId: host.id })),
  ], [hosts, profiles]);
  const visibleTargets = targets.filter((target) => (target.title + " " + target.profileId).toLowerCase().includes(query.trim().toLowerCase()));
  const selected = targets.filter((target) => selectedKeys.includes(target.transport + ":" + target.profileId));
  const toggle = (target: WorkspaceLaunchTarget) => {
    const key = target.transport + ":" + target.profileId;
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length < 12 ? [...current, key] : current);
  };

  const submit = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    try {
      if (mode === "template") {
        const sizing = workspacePresetLayout(preset, selected);
        await onSaveTemplate(name.trim(), {
          tabs: selected.map((target) => ({ transport: target.transport, profileId: target.profileId, title: target.title, type: "terminal", hostId: target.hostId })),
          ...sizing,
        });
      } else {
        await onOpen(selected, preset);
      }
    } finally {
      setBusy(false);
    }
  };

  const preview = <div className="grid h-full min-h-36 place-items-center rounded-md border border-border-bright bg-base-900 p-3">
    {selected.length ? <div className="grid h-full w-full gap-1.5" style={{ gridTemplateColumns: preset === "main-right" ? "2fr 1fr" : preset === "columns-2" || preset === "columns-3" ? "repeat(" + Math.min(preset === "columns-3" ? 3 : 2, selected.length) + ", minmax(0, 1fr))" : "1fr", gridTemplateRows: preset === "main-bottom" ? "2fr 1fr" : "1fr" }}>
      {selected.slice(0, preset === "columns-3" ? 3 : preset === "columns-2" || preset === "main-right" || preset === "main-bottom" ? 2 : 1).map((target, index) => <div key={target.transport + target.profileId} className="flex min-w-0 items-center gap-2 rounded border border-border-bright bg-base-800 px-2 text-xs text-text-secondary"><span className="grid size-5 shrink-0 place-items-center rounded bg-accent/15 text-accent">{index + 1}</span><span className="truncate">{target.title}</span></div>)}
    </div> : <span className="text-xs text-text-muted">{t("Select terminals to preview the workspace")}</span>}
  </div>;

  return <div data-workspace-creator="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="workspace-create-title" className="flex max-h-[min(88vh,720px)] w-full max-w-[860px] flex-col overflow-hidden rounded-lg border border-border-bright bg-base-800 shadow-2xl">
      <header className="flex items-start justify-between border-b border-border px-5 py-4"><div><h2 id="workspace-create-title" className="text-base font-semibold text-text-primary">{initialName ? t("Edit workspace template") : t("Open temporary workspace")}</h2><p className="mt-1 text-xs text-text-muted">{t("Choose local terminals or SSH hosts. Select up to 12.")}</p></div><button type="button" aria-label={t("Cancel")} onClick={onCancel} className="grid size-8 place-items-center rounded border border-border-bright text-text-secondary hover:bg-base-700 hover:text-text-primary"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button></header>
      {!initialName && <div className="flex gap-1 border-b border-border px-5 pt-3"><button type="button" onClick={() => setMode("temporary")} className={"h-8 rounded-t border border-b-0 px-4 text-xs " + (mode === "temporary" ? "border-border-bright bg-base-700 text-text-primary" : "border-transparent text-text-secondary hover:bg-base-700/60 hover:text-text-primary")}>{t("Temporary connection")}</button><button type="button" onClick={() => setMode("template")} className={"h-8 rounded-t border border-b-0 px-4 text-xs " + (mode === "template" ? "border-border-bright bg-base-700 text-text-primary" : "border-transparent text-text-secondary hover:bg-base-700/60 hover:text-text-primary")}>{t("Save template")}</button></div>}
      {mode === "template" && <div className="border-b border-border px-5 py-3"><label htmlFor="workspace-template-name" className="mb-1.5 block text-xs font-medium text-text-secondary">{t("Template name")}</label><input id="workspace-template-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Template name")} className="h-9 w-full rounded-md border border-border-bright bg-surface px-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" /></div>}
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1.05fr_1fr]">
        <div className="flex min-h-64 min-w-0 flex-col gap-3"><div className="relative"><svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor"/><path d="m10.5 10.5 3 3" stroke="currentColor"/></svg><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search local terminals or SSH hosts")} className="h-9 w-full rounded-md border border-border-bright bg-surface pl-9 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" /></div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border-bright bg-base-900/60 p-2">
            {loading && <p className="p-3 text-xs text-text-muted">{t("Loading...")}</p>}
            {!loading && !visibleTargets.length && <p className="p-3 text-xs text-text-muted">{t("No matching terminals or hosts")}</p>}
            {!loading && visibleTargets.map((target) => <label key={target.transport + target.profileId} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-base-700/70"><input type="checkbox" checked={selectedKeys.includes(target.transport + ":" + target.profileId)} onChange={() => toggle(target)} disabled={!selectedKeys.includes(target.transport + ":" + target.profileId) && selected.length >= 12} className="size-4 accent-sky-500"/><span className="grid size-7 shrink-0 place-items-center rounded bg-base-700 text-accent">{target.transport === "ssh" ? "↗" : ">_"}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-text-primary">{target.title}</span><span className="block truncate text-[10px] text-text-muted">{target.transport === "ssh" ? (hosts.find((host) => host.id === target.hostId)?.hostname ?? "SSH") : t("Local terminal")}</span></span><span className="text-[10px] text-text-muted">{target.transport === "ssh" ? "SSH" : t("Local")}</span></label>)}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-text-primary">{t("Terminal layout")}</h3><span className="text-[11px] text-text-muted">{t("{selected} / 12 selected").replace("{selected}", String(selected.length))}</span></div>
          <div className="grid grid-cols-2 gap-2">{PRESETS.map((item) => <button key={item} type="button" onClick={() => setPreset(item)} aria-pressed={preset === item} className={"flex h-[58px] flex-col justify-between rounded-md border p-2 text-left focus-visible:outline-2 focus-visible:outline-accent " + (preset === item ? "border-accent bg-base-700" : "border-border-bright bg-base-800 hover:bg-base-700")}><span className="flex h-6 w-full gap-1" aria-hidden="true">{Array.from({ length: item === "columns-1" || item === "tabs" ? 1 : item === "columns-3" ? 3 : 2 }, (_, index) => <i key={index} className="flex-1 rounded-sm bg-text-muted/80" />)}</span><span className="text-[10px] text-text-primary">{t(PRESET_LABELS[item])}</span></button>)}</div>
          {preview}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-3"><span className="text-[11px] text-text-muted">{t("Select up to 12 terminals")}</span><div className="flex gap-2"><button type="button" onClick={onCancel} className="h-9 rounded-md border border-border-bright bg-base-700 px-3 text-xs text-text-primary hover:bg-base-600">{t("Cancel")}</button><button type="button" onClick={() => void submit()} disabled={!selected.length || busy || (mode === "template" && !name.trim())} className="h-9 rounded-md border border-accent bg-accent/15 px-3 text-xs font-semibold text-text-primary hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40">{mode === "template" ? t("Save template") : t("Open workspace")}</button></div></footer>
    </section>
  </div>;
}

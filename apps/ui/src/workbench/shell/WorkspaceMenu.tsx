import { useState, useEffect, useRef } from "react";
import { useI18n } from "../shared/i18n";
import type { WorkspaceLayout } from "@hypershell/shared";
import { WorkspaceCreator, type WorkspaceLaunchTarget, type WorkspacePreset } from "./WorkspaceCreator";
import { getShell } from "../shared/shell";
import { migrateInternalWorkspaceTab } from "../plugin-runtime/internalPluginRegistry";
import {
  layoutStore,
  restorableWorkspaceTabs,
  workspaceTabToLayoutTab,
} from "../editor-area/layoutStore";

interface WorkspaceRecord {
  name: string;
  updatedAt: string;
  layout: WorkspaceLayout;
}

export function WorkspaceMenu({ onClose, onOpenTargets }: { onClose: () => void; onOpenTargets?: (targets: WorkspaceLaunchTarget[], preset: WorkspacePreset) => Promise<void> }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WorkspaceRecord | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const list = await getShell().workspaceList();
    if (list) setWorkspaces(list.filter((w: WorkspaceRecord) => w.name !== "__last__"));
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        target instanceof Element &&
        target.closest('[data-workspace-menu-toggle="true"]')
      ) {
        return;
      }
      if (target instanceof Element && target.closest("[data-workspace-creator=\"true\"]")) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleLoad = async (name: string) => {
    const result = await getShell().workspaceLoad({ name });
    if (!result?.layout) return;
    const savedTabs = restorableWorkspaceTabs(result.layout.tabs).map(migrateInternalWorkspaceTab);
    if (onOpenTargets && savedTabs.every((tab) => tab.transport === "ssh" || tab.transport === "local")) {
      const targets = savedTabs.map((tab) => ({ transport: tab.transport as "ssh" | "local", profileId: tab.profileId, title: tab.title, hostId: tab.hostId }));
      await onOpenTargets(targets, presetForLayout(result.layout));
      onClose();
      return;
    }

    // Close existing tabs
    const currentTabs = layoutStore.getState().tabs;
    for (const tab of currentTabs) {
      void getShell().closeSession({ sessionId: tab.sessionId }).catch(() => {});
    }
    layoutStore.setState({
      tabs: [],
      activeSessionId: null,
      panes: [{ paneId: "pane-1", sessionId: null, tabSessionIds: [] }],
      paneLayout: { type: "pane", paneId: "pane-1" },
      // Collapsing to one pane invalidates the rest of the pane state too: a
      // stale activePaneId from a split layout would leave openTab below with
      // no matching pane (tabs restore but none shows), and stale sizes would
      // render the single pane at the old first-pane width.
      activePaneId: "pane-1",
      paneSizes: [100],
    });

    // Re-open sessions from workspace
    for (const tab of restorableWorkspaceTabs(result.layout.tabs)) {
      layoutStore.getState().openTab(
        workspaceTabToLayoutTab(
          migrateInternalWorkspaceTab(tab),
          `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )
      );
    }

    if (result.layout.splitDirection) {
      layoutStore.setState({ splitDirection: result.layout.splitDirection });
    }
    // Sizes only make sense for the panes that actually exist after restore
    // (currently always the single pane reset above). Legacy layouts saved
    // with more entries — multi-pane saves, or SFTP panes serialized before
    // they were excluded — would leave that one pane at a fraction of the
    // window, with nothing beside it.
    if (result.layout.paneSizes?.length === layoutStore.getState().panes.length) {
      layoutStore.setState({ paneSizes: result.layout.paneSizes });
    }
    onClose();
  };

  const saveTemplate = async (name: string, layout: WorkspaceLayout) => {
    await getShell().workspaceSave({ name, layout });
    await refresh();
    setCreating(false);
    setEditing(null);
  };

  const presetForLayout = (layout: WorkspaceLayout): WorkspacePreset => {
    if (layout.paneCount >= 3) return "columns-3";
    if (layout.paneCount === 2) {
      const weighted = layout.paneSizes?.[0] === 70 && layout.paneSizes?.[1] === 30;
      if (layout.splitDirection === "vertical") return weighted ? "main-bottom" : "columns-2";
      return weighted ? "main-right" : "columns-2";
    }
    return "columns-1";
  };

  const handleRemove = async (name: string) => {
    await getShell().workspaceRemove({ name });
    await refresh();
    setActionsFor(null);
    setConfirmDelete(null);
  };

  const beginEdit = (workspace: WorkspaceRecord) => {
    setEditing(workspace);
    setCreating(true);
    setActionsFor(null);
  };

  if (creating) return <WorkspaceCreator
    key={editing?.name ?? "new-workspace"}
    onCancel={() => { setCreating(false); setEditing(null); }}
    onOpen={async (targets, preset) => { await onOpenTargets?.(targets, preset); onClose(); }}
    onSaveTemplate={saveTemplate}
    initialName={editing?.name}
    initialTargets={editing?.layout.tabs.map((tab) => ({ transport: tab.transport as "ssh" | "local", profileId: tab.profileId, title: tab.title, hostId: tab.hostId }))}
    initialPreset={editing ? presetForLayout(editing.layout) : undefined}
  />;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/55 px-4 py-4 backdrop-blur-[2px]">
      <section ref={menuRef} role="dialog" aria-modal="true" aria-label={t("Workspaces")} className="flex h-[min(72vh,680px)] min-h-[360px] max-h-[88vh] w-full max-w-[960px] flex-col overflow-hidden rounded-lg border border-border-bright bg-base-900 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div><h2 className="text-xl font-semibold text-text-primary">{t("Workspaces")}</h2><p className="mt-1 text-sm text-text-muted">{t("Save terminal combinations and layouts for quick access.")}</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => { setEditing(null); setCreating(true); }} className="flex h-9 items-center gap-2 rounded-md border border-border-bright bg-base-700 px-3 text-sm font-medium text-text-primary hover:bg-base-600"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>{t("New Workspace")}</button>
            <button type="button" onClick={onClose} aria-label={t("Close")} title={t("Close")} className="grid size-9 place-items-center rounded-md border border-border-bright text-text-secondary hover:bg-base-700 hover:text-text-primary"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button>
          </div>
        </header>
        <div className="grid min-h-0 max-h-[min(72vh,720px)] flex-1 content-start gap-2 overflow-y-auto p-4">
          {workspaces.map((ws) => {
            const tabs = ws.layout?.tabs ?? [];
            const count = Math.max(1, ws.layout?.paneCount ?? 1);
            const direction = ws.layout?.splitDirection ?? "horizontal";
            const layouts = ["1 column", "2 columns", "3 columns", "Main + right", "Main + bottom", "Tab switch"];
            const isExpanded = expanded.has(ws.name);
            const weighted = ws.layout?.paneSizes?.[0] === 70 && ws.layout?.paneSizes?.[1] === 30;
            const chosenLayout = count >= 3 ? 2 : count === 1 ? 0 : direction === "vertical" ? weighted ? 4 : 1 : weighted ? 3 : 1;
            return <article key={ws.name} className="overflow-hidden rounded-md border border-border-bright bg-base-800">
              <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button type="button" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(ws.name)) next.delete(ws.name); else next.add(ws.name); return next; })} aria-label={(isExpanded ? t("Collapse workspace") : t("Expand workspace")) + " " + ws.name} aria-expanded={isExpanded} className="grid size-8 shrink-0 place-items-center rounded border border-transparent text-text-secondary hover:border-border-bright hover:bg-base-700 hover:text-text-primary">
                    <svg className={"transition-transform " + (isExpanded ? "rotate-90" : "")} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-text-primary">{ws.name}</h3><p className="mt-0.5 truncate text-xs text-text-secondary">{tabs.slice(0, 3).map((tab) => tab.title || tab.profileId).join(" · ")}{tabs.length > 3 ? " · +" + (tabs.length - 3) : ""}{tabs.length === 0 ? t("No terminals saved in this workspace.") : ""}</p></div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="hidden text-xs text-text-muted sm:inline">{t("{count} terminals").replace("{count}", String(tabs.length))}</span>
                  <button type="button" onClick={() => void handleLoad(ws.name)} className="flex h-8 items-center gap-2 rounded-md border border-border-bright bg-base-700 px-3 text-xs font-semibold text-text-primary hover:bg-base-600"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor" /></svg>{t("Open Workspace")}</button>
                  <button type="button" onClick={() => { setActionsFor((current) => current === ws.name ? null : ws.name); setConfirmDelete(null); }} aria-label={t("Workspace actions") + " " + ws.name} title={t("Workspace actions")} aria-expanded={actionsFor === ws.name} className="grid size-8 place-items-center rounded border border-transparent text-text-secondary hover:border-border-bright hover:bg-base-700 hover:text-text-primary"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/></svg></button>
                </div>
              </div>
              {actionsFor === ws.name && <div className="flex justify-end border-t border-border px-3 py-2">
                <div role="menu" className="w-48 rounded-md border border-border-bright bg-base-900 p-1 shadow-overlay">
                  {confirmDelete === ws.name ? <><p className="px-2 py-2 text-xs text-text-secondary">{t("Delete workspace template?")}</p><div className="flex justify-end gap-1"><button type="button" role="menuitem" onClick={() => setConfirmDelete(null)} className="rounded px-2 py-1.5 text-xs text-text-primary hover:bg-base-700">{t("Cancel")}</button><button type="button" role="menuitem" onClick={() => void handleRemove(ws.name)} className="rounded px-2 py-1.5 text-xs font-medium text-danger hover:bg-danger/10">{t("Delete template")}</button></div></> : <><button type="button" role="menuitem" onClick={() => beginEdit(ws)} className="block w-full rounded px-2 py-1.5 text-left text-xs text-text-primary hover:bg-base-700">{t("Edit template")}</button><button type="button" role="menuitem" onClick={() => setConfirmDelete(ws.name)} className="block w-full rounded px-2 py-1.5 text-left text-xs text-danger hover:bg-danger/10">{t("Delete template")}</button></>}
                </div>
              </div>}
              {isExpanded && <div className="border-t border-border px-4 py-3">
                <div className="flex flex-wrap gap-2 pb-3">{layouts.map((label, index) => <div key={label} aria-label={t(label) + (index === chosenLayout ? " · " + t("Selected") : "")} className={"flex h-[54px] w-[104px] flex-col justify-between rounded-md border p-1.5 " + (index === chosenLayout ? "border-accent bg-base-700" : "border-border-bright bg-base-800")}><div className="flex h-6 gap-0.5" aria-hidden="true">{Array.from({ length: Math.min(index === 0 || index === 5 ? 1 : index === 3 || index === 4 ? 2 : index, 3) }, (_, n) => <i key={n} className="flex-1 rounded-[1px] bg-text-muted" />)}</div><span className="truncate text-[10px] text-text-primary">{t(label)}</span></div>)}</div>
                {tabs.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{tabs.map((tab, index) => <div key={tab.profileId + index} className="min-w-0 rounded-md border border-border-bright bg-base-700/80 px-3 py-2.5"><div className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-orange-600 text-white"><svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/></svg></span><span className="truncate text-xs font-semibold text-text-primary">{tab.title || tab.profileId}</span></div><p className="mt-1 truncate pl-8 text-[11px] text-text-secondary">{tab.hostId ?? tab.profileId}</p><p className="mt-1 truncate pl-8 text-[10px] text-text-muted">{tab.transport}:{tab.profileId}</p></div>)}</div> : <div className="text-xs text-text-muted">{t("No terminals saved in this workspace.")}</div>}
              </div>}
            </article>;
          })}
          {!workspaces.length && <div className="grid min-h-44 place-items-center rounded-md border border-dashed border-border-bright text-sm text-text-muted">{t("No saved workspaces")}</div>}
        </div>
      </section>
    </div>
  );
}

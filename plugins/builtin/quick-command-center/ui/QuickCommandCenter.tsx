import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { PluginSecondarySidebarViewProps } from "@hypershell/plugin-api";
import { QUICK_COMMAND_CENTER_ID } from "../constants";
import { localizeFigDescription } from "./figDescription";

type Command = { id: string; name: string; body: string; prefix?: string; group?: string; createdAt?: string; description?: string };
type Target = { id: string; name: string };
type KnowledgeBaseStatus = { version: string; updatedAt: string; entryCount: number; source: string; license: string } | null;

export function QuickCommandCenter({ host }: PluginSecondarySidebarViewProps) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [publicCommands, setPublicCommands] = useState<Command[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [knowledgeBaseStatus, setKnowledgeBaseStatus] = useState<KnowledgeBaseStatus>(null);
  const [busy, setBusy] = useState(false);
  const [editorCommand, setEditorCommand] = useState<Command | null | undefined>(undefined);
  const [draft, setDraft] = useState({ name: "", body: "", prefix: "", group: "" });
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [view, setView] = useState<"quick" | "public">("quick");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(() => new Set());
  const locale = useSyncExternalStore(
    (onStoreChange) => host.i18n.subscribe(onStoreChange),
    () => host.i18n.getLocale(),
    () => host.i18n.getLocale(),
  );
  const chinese = locale === "zh-CN";
  const text = (en: string, zh: string) => chinese ? zh : en;

  const load = useCallback(async () => {
    const [items, figCommands, sessions, knowledgeStatus] = await Promise.all([
      host.pluginMain.invoke(QUICK_COMMAND_CENTER_ID, "commands.list", undefined),
      host.pluginMain.invoke(QUICK_COMMAND_CENTER_ID, "knowledgeBase.list", undefined),
      host.pluginMain.invoke(QUICK_COMMAND_CENTER_ID, "sessions.list", undefined),
      host.pluginMain.invoke(QUICK_COMMAND_CENTER_ID, "knowledgeBase.status", undefined),
    ]);
    setCommands(items as Command[]);
    setPublicCommands(figCommands as Command[]);
    setTargets(sessions as Target[]);
    setKnowledgeBaseStatus(knowledgeStatus as KnowledgeBaseStatus);
  }, [host]);
  useEffect(() => { void load().catch((error: unknown) => setStatus(String(error))); }, [load]);

  const shown = useMemo(() => {
    const entries = view === "public" ? publicCommands : commands;
    const q = filter.trim().toLowerCase();
    return entries.filter((item) => !q || item.name.toLowerCase().includes(q) || item.body.toLowerCase().includes(q) || item.prefix?.toLowerCase().includes(q) || item.group?.toLowerCase().includes(q));
  }, [commands, filter, publicCommands, view]);
  const commandGroups = useMemo(() => [...new Set(commands.map((item) => item.group?.trim()).filter((group): group is string => Boolean(group)))].sort((a, b) => a.localeCompare(b)), [commands]);
  const commandSections = useMemo(() => {
    const grouped = new Map<string, Command[]>();
    for (const item of shown) {
      const group = item.group?.trim() || text("Ungrouped", "未分组");
      const items = grouped.get(group);
      if (items) items.push(item);
      else grouped.set(group, [item]);
    }
    const compareNewest = (a: Command, b: Command) => {
      const aTime = Date.parse(a.createdAt ?? "");
      const bTime = Date.parse(b.createdAt ?? "");
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    };
    for (const items of grouped.values()) items.sort(compareNewest);
    return [...grouped.entries()].sort(([a, aItems], [b, bItems]) => {
      const newestFirst = compareNewest(aItems[0]!, bItems[0]!);
      if (newestFirst) return newestFirst;
      const ungrouped = text("Ungrouped", "未分组");
      if (a === ungrouped) return 1;
      if (b === ungrouped) return -1;
      return a.localeCompare(b);
    });
  }, [shown, chinese]);
  const publicGroups = useMemo(() => {
    const grouped = new Map<string, Command[]>();
    for (const item of shown) {
      const root = item.name.trim().split(/\s+/, 1)[0] || item.name;
      const group = grouped.get(root);
      if (group) group.push(item);
      else grouped.set(root, [item]);
    }
    return [...grouped.entries()];
  }, [shown]);

  const openEditor = (item?: Command) => {
    setDraft({ name: item?.name ?? "", body: item?.body ?? "", prefix: item?.prefix ?? "", group: item?.group ?? "" });
    setGroupPickerOpen(false);
    setEditorCommand(item ?? null);
  };
  const saveCommand = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.body.trim()) return;
    const item = editorCommand ?? undefined;
    const command = { id: item?.id ?? crypto.randomUUID(), name: draft.name.trim(), body: draft.body.trim(), ...(draft.prefix.trim() ? { prefix: draft.prefix.trim() } : {}), ...(draft.group.trim() ? { group: draft.group.trim() } : {}) };
    setBusy(true);
    try {
      const saved = await host.pluginMain.invoke(QUICK_COMMAND_CENTER_ID, "commands.save", command) as Command;
      setCommands((current) => [...current.filter((entry) => entry.id !== saved.id), saved]);
      if (!item && saved.group?.trim()) {
        setExpandedGroups((current) => new Set(current).add(saved.group!.trim()));
      }
      setEditorCommand(undefined);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const remove = async (item: Command) => {
    if (item.id.startsWith("builtin-") || !window.confirm(text("Delete this command?", "确定删除此命令吗？"))) return;
    await host.pluginMain.invoke(QUICK_COMMAND_CENTER_ID, "commands.remove", { id: item.id });
    setCommands((current) => current.filter((entry) => entry.id !== item.id));
  };
  const send = async (item: Command) => {
    if (!selected.length || !window.confirm(text(`Send to ${selected.length} session(s)?\n\n${item.body}`, `发送到 ${selected.length} 个会话？\n\n${item.body}`))) return;
    setBusy(true);
    try {
      const result = await host.pluginMain.invoke(QUICK_COMMAND_CENTER_ID, "sessions.send", { sessionIds: selected, command: item.body }) as { sent: number };
      setStatus(text(`Sent to ${result.sent} session(s).`, `已发送到 ${result.sent} 个会话。`));
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const updateKnowledgeBase = async () => {
    setBusy(true);
    setStatus("");
    try {
      const result = await host.pluginMain.invoke(QUICK_COMMAND_CENTER_ID, "knowledgeBase.update", undefined) as {
        updated: boolean;
        status: Exclude<KnowledgeBaseStatus, null>;
      };
      setKnowledgeBaseStatus(result.status);
      setStatus(result.updated
        ? text(`Updated ${result.status.entryCount} commands.`, `已更新 ${result.status.entryCount} 条命令。`)
        : text("The command library is already up to date.", "命令库已是最新版本。"));
      if (result.updated) await load();
      if (result.updated) window.dispatchEvent(new Event("hypershell:command-library-updated"));
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const field = "min-w-0 rounded border border-border bg-base-800 px-2 py-1.5 text-xs text-text-primary";
  const matchingCommandGroups = commandGroups.filter((group) => group.toLowerCase().includes(draft.group.trim().toLowerCase()));
  const Modal = host.Modal;
  const renderCommand = (item: Command) => (
    <article key={item.id} className="grid gap-2 border-b border-border pb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-text-primary">{item.name}</div>
          {item.prefix && <code className="text-[10px] text-accent">{item.prefix}</code>}
          {item.description && <div className="text-[10px] text-text-muted">{view === "public" ? localizeFigDescription(item.description, locale) : item.description}</div>}
        </div>
        {view === "quick" && <div className="flex gap-1">
          <button type="button" disabled={busy} onClick={() => openEditor(item)} className="rounded border border-border px-2 py-1 text-[10px] text-text-secondary disabled:opacity-50">{text("Edit", "编辑")}</button>
          <button type="button" disabled={busy} onClick={() => void remove(item)} className="rounded border border-border px-2 py-1 text-[10px] text-text-secondary disabled:opacity-50">{text("Delete", "删除")}</button>
        </div>}
      </div>
      <code className="block overflow-x-auto rounded bg-base-800 px-2 py-1.5 text-[11px] text-text-secondary">{item.body}</code>
      {view === "quick" && <div className="flex flex-wrap items-center gap-2">
        {targets.map((target) => (
          <label key={target.id} className="flex items-center gap-1 text-[10px] text-text-muted">
            <input type="checkbox" checked={selected.includes(target.id)} onChange={() => setSelected((current) => current.includes(target.id) ? current.filter((id) => id !== target.id) : [...current, target.id])} />
            <span className="max-w-28 truncate">{target.name}</span>
          </label>
        ))}
        <button type="button" disabled={busy || selected.length === 0} onClick={() => void send(item)} className="ml-auto rounded border border-accent/50 px-2 py-1 text-[10px] text-accent disabled:opacity-50">{text("Send", "发送")}</button>
      </div>}
    </article>
  );
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-3" aria-label={text("Quick Command Center", "快捷指令中心")}>
      <nav className="flex gap-1 border-b border-border" aria-label={text("Command library sections", "命令库分类")}>
        <button type="button" aria-current={view === "quick" ? "page" : undefined} onClick={() => { setView("quick"); setFilter(""); }} className={`border-b-2 px-2 py-1.5 text-xs ${view === "quick" ? "border-accent text-text-primary" : "border-transparent text-text-muted"}`}>{text("Quick commands", "快捷指令")}</button>
        <button type="button" aria-current={view === "public" ? "page" : undefined} onClick={() => { setView("public"); setFilter(""); }} className={`border-b-2 px-2 py-1.5 text-xs ${view === "public" ? "border-accent text-text-primary" : "border-transparent text-text-muted"}`}>{text("Public command library", "公共指令库")}</button>
      </nav>
      {view === "public" && (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[10px] text-text-muted" role="status">
            {knowledgeBaseStatus
              ? text(`Fig ${knowledgeBaseStatus.version} · ${knowledgeBaseStatus.entryCount} commands`, `Fig ${knowledgeBaseStatus.version} · ${knowledgeBaseStatus.entryCount} 条命令`)
              : text("Fig library not loaded", "Fig 命令库尚未加载")}
          </span>
          <button type="button" disabled={busy} onClick={() => void updateKnowledgeBase()} className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-secondary disabled:opacity-50">{busy ? text("Updating...", "更新中...") : text("Update", "更新")}</button>
        </div>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <input className={`${field} flex-1`} value={filter} onChange={(event) => setFilter(event.currentTarget.value)} placeholder={text("Filter commands", "筛选命令")} aria-label={text("Filter commands", "筛选命令")} />
        {view === "quick" && <button type="button" onClick={() => openEditor()} className="shrink-0 rounded border border-border px-2 py-1.5 text-xs text-text-secondary hover:bg-base-700">{text("New command", "新增指令")}</button>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {(view === "quick" ? commandSections : publicGroups).map(([root, items]) => {
          const expanded = (view === "quick" ? expandedGroups : expandedRoots).has(root);
          const setExpanded = view === "quick" ? setExpandedGroups : setExpandedRoots;
          return <section key={root} className="border-b border-border pb-1">
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => {
              const next = new Set(current);
              if (next.has(root)) next.delete(root);
              else next.add(root);
              return next;
            })} className="flex w-full items-center gap-2 py-1.5 text-left text-xs font-semibold text-text-primary hover:text-accent">
              <span aria-hidden="true" className="w-3 text-center">{expanded ? "▾" : "▸"}</span>
              <span className="min-w-0 flex-1 truncate">{root}</span>
              <span className="text-[10px] font-normal text-text-muted">{items.length}</span>
            </button>
            {expanded && <div className="grid gap-2 pl-3">
              {items.map(renderCommand)}
            </div>}
          </section>;
        })}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <span role="status" className="min-w-0 truncate text-[10px] text-text-muted">{status}</span>
      </footer>
      <Modal
        open={editorCommand !== undefined}
        onClose={() => setEditorCommand(undefined)}
        title={editorCommand ? text("Edit command", "编辑指令") : text("New command", "新增指令")}
        footer={<>
          <button type="button" onClick={() => setEditorCommand(undefined)} className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-base-700">{text("Cancel", "取消")}</button>
          <button type="submit" form="quick-command-editor" disabled={busy || !draft.name.trim() || !draft.body.trim()} className="rounded border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-50">{busy ? text("Saving...", "保存中...") : text("Save", "保存")}</button>
        </>}
      >
        <form id="quick-command-editor" onSubmit={(event) => void saveCommand(event)} className="grid min-h-[22rem] content-start gap-3">
          <label className="grid gap-1 text-xs text-text-secondary">
            {text("Command name", "指令名称")}
            <input autoFocus required maxLength={120} className={field} value={draft.name} onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((current) => ({ ...current, name: value }));
            }} />
          </label>
          <label className="grid gap-1 text-xs text-text-secondary">
            {text("Command text", "指令内容")}
            <textarea required rows={4} maxLength={4096} className={`${field} resize-y`} value={draft.body} onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((current) => ({ ...current, body: value }));
            }} />
          </label>
          <label className="grid gap-1 text-xs text-text-secondary">
            {text("Completion prefix (optional)", "补全前缀（可选）")}
            <input maxLength={120} className={field} value={draft.prefix} onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((current) => ({ ...current, prefix: value }));
            }} />
          </label>
          <label className="grid gap-1 text-xs text-text-secondary">
            {text("Group (optional)", "分组（可选）")}
            <div className="relative" onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setGroupPickerOpen(false);
            }}>
              <div className="flex overflow-hidden rounded border border-border bg-base-800 focus-within:border-accent/60">
                <input
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={groupPickerOpen}
                  aria-controls="quick-command-groups"
                  maxLength={80}
                  className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted"
                  value={draft.group}
                  onFocus={() => setGroupPickerOpen(true)}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, group: value }));
                    setGroupPickerOpen(true);
                  }}
                  placeholder={text("Choose or enter a group", "选择或输入分组")}
                />
                <button type="button" aria-label={text("Show groups", "显示分组")} aria-expanded={groupPickerOpen} onMouseDown={(event) => event.preventDefault()} onClick={() => setGroupPickerOpen((open) => !open)} className="grid w-8 shrink-0 place-items-center border-l border-border text-text-muted hover:bg-base-700 hover:text-text-primary">
                  <span aria-hidden="true">{groupPickerOpen ? "▴" : "▾"}</span>
                </button>
              </div>
              {groupPickerOpen && <div id="quick-command-groups" role="listbox" className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded border border-border bg-base-800 py-1 shadow-lg">
                {matchingCommandGroups.map((group) => <button key={group} type="button" role="option" aria-selected={draft.group === group} onMouseDown={(event) => event.preventDefault()} onClick={() => {
                  setDraft((current) => ({ ...current, group }));
                  setGroupPickerOpen(false);
                }} className={`block w-full px-2 py-1.5 text-left text-xs hover:bg-base-700 ${draft.group === group ? "text-accent" : "text-text-primary"}`}>{group}</button>)}
                {draft.group.trim() && !commandGroups.some((group) => group.toLowerCase() === draft.group.trim().toLowerCase()) && <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => setGroupPickerOpen(false)} className="block w-full border-t border-border px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-base-700">
                  {text(`Use “${draft.group.trim()}” as a new group`, `使用“${draft.group.trim()}”作为新分组`)}
                </button>}
                {!matchingCommandGroups.length && !draft.group.trim() && <div className="px-2 py-1.5 text-xs text-text-muted">{text("No groups yet", "暂无已有分组")}</div>}
              </div>}
            </div>
          </label>
        </form>
      </Modal>
    </section>
  );
}

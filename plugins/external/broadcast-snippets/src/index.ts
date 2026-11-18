import type { HyperShellPlugin } from "@hypershell/plugin-api";
import { expandSnippetCommand } from "./commandTemplate.js";

type Snippet = { id: string; name: string; body: string };
type ActiveSession = { id: string; hostId: string; hostName: string };

function parseSnippet(key: string, value: unknown): Snippet | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || typeof record.body !== "string") return null;
  return { id: key, name: record.name, body: record.body };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

export const plugin: HyperShellPlugin = {
  async activate(context) {
    const isChinese = document.documentElement.lang.toLowerCase().startsWith("zh");
    const label = (english: string, chinese: string) => isChinese ? chinese : english;
    if (context.grantedPermissions.includes("storage.write")) {
      await context.host.storage.claimLegacy("hypershell.command-snippets.v1", "snippets");
    }
    if (context.launchContext?.surface === "workspace.header") {
      const root = element("main");
      root.className = "qcc-broadcast-strip";
      const styles = element("style");
      styles.textContent = `html,body{width:100%;height:100%;min-height:0;overflow:hidden}body{padding:0;background:transparent}.qcc-broadcast-strip{display:flex;width:100%;height:40px;min-height:40px;max-height:40px;align-items:center;gap:8px;overflow:hidden;padding:0 12px;color:var(--plugin-text);font:12px system-ui,sans-serif}.qcc-broadcast-label{flex:none;color:var(--plugin-muted);font-weight:600}.qcc-broadcast-targets{display:flex;min-width:0;align-items:center;gap:4px;overflow-x:auto}.qcc-broadcast-target{max-width:220px;min-height:26px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;border:1px solid var(--plugin-border);border-radius:4px;background:var(--plugin-panel);color:var(--plugin-muted);cursor:pointer}.qcc-broadcast-target[aria-pressed=true]{border-color:var(--plugin-accent);background:var(--plugin-accent-contrast);color:var(--plugin-accent)}.qcc-broadcast-empty{color:var(--plugin-muted)}`;
      const title = element("span", label("Broadcast targets", "广播目标"));
      title.className = "qcc-broadcast-label";
      const targetList = element("div");
      targetList.className = "qcc-broadcast-targets";
      root.append(title, targetList);
      document.body.replaceChildren(styles, root);

      const sessionTargets = context.launchContext.sessionTargets ?? [];
      const mode = await context.host.sessions.broadcastMode();
      root.hidden = !mode.enabled;
      const selected = new Set(mode.sessionIds);
      let syncingMode = false;
      let disposed = false;
      const renderTargets = () => {
        targetList.replaceChildren();
        if (sessionTargets.length === 0) {
          targetList.append(element("span", label("No terminal sessions", "暂无终端会话")));
          targetList.lastElementChild?.classList.add("qcc-broadcast-empty");
          return;
        }
        for (const session of sessionTargets) {
          const button = element("button", session.name);
          button.type = "button";
          button.className = "qcc-broadcast-target";
          button.setAttribute("aria-pressed", String(selected.has(session.id)));
          button.title = session.name;
          button.addEventListener("click", async () => {
            button.disabled = true;
            if (selected.has(session.id)) selected.delete(session.id);
            else selected.add(session.id);
            try {
              const currentMode = await context.host.sessions.broadcastMode();
              await context.host.sessions.setBroadcastMode(currentMode.enabled, [...selected]);
              renderTargets();
            } catch {
              if (mode.sessionIds.includes(session.id)) selected.add(session.id);
              else selected.delete(session.id);
              button.disabled = false;
            }
          });
          targetList.append(button);
        }
      };
      renderTargets();
      let view = mode.enabled ? context.registrations.registerView({ id: "quick-command-center.broadcast-targets", title: label("Broadcast targets", "广播目标"), entrypoint: "dist/index.js", slot: "workspace.header" }) : undefined;
      const modeSync = window.setInterval(async () => {
        if (syncingMode || disposed) return;
        syncingMode = true;
        try {
          const currentMode = await context.host.sessions.broadcastMode();
          if (disposed) return;
          root.hidden = !currentMode.enabled;
          if (currentMode.enabled && !view) {
            view = context.registrations.registerView({ id: "quick-command-center.broadcast-targets", title: label("Broadcast targets", "广播目标"), entrypoint: "dist/index.js", slot: "workspace.header" });
          } else if (!currentMode.enabled && view) {
            view.dispose();
            view = undefined;
          }
          selected.clear();
          currentMode.sessionIds.forEach((id: string) => selected.add(id));
          renderTargets();
        } catch {
          if (disposed) return;
          root.hidden = true;
        } finally {
          syncingMode = false;
        }
      }, 1000);
      return { dispose() { disposed = true; window.clearInterval(modeSync); view?.dispose(); document.body.replaceChildren(); } };
    }

    const root = element("main");
    root.className = "qcc";
    const styles = element("style");
    styles.textContent = `.qcc{display:grid;gap:16px;max-width:960px;margin:0 auto;color:var(--plugin-text)}.qcc *{box-sizing:border-box}.qcc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:1px solid var(--plugin-border)}.qcc-heading{display:grid;gap:4px;min-width:0}.qcc-title{margin:0;font-size:18px;font-weight:650;line-height:1.35}.qcc-subtitle,.qcc-status,.qcc-empty,.qcc-count{margin:0;color:var(--plugin-muted);font-size:12px;line-height:1.5}.qcc-refresh,.qcc-tab,.qcc-button{min-height:32px;border:1px solid var(--plugin-border);border-radius:5px;background:var(--plugin-panel);color:var(--plugin-text);cursor:pointer}.qcc-refresh{width:34px;height:34px;padding:0;font-size:17px}.qcc-refresh:hover,.qcc-tab:hover,.qcc-button:hover{background:var(--plugin-raised)}.qcc-tabs{display:flex;gap:4px;padding:3px;width:max-content;max-width:100%;border:1px solid var(--plugin-border);border-radius:6px;background:var(--plugin-panel)}.qcc-tab{border-color:transparent;background:transparent;padding:0 12px}.qcc-tab[aria-selected=true]{border-color:var(--plugin-border);background:var(--plugin-raised);font-weight:600}.qcc-content{display:grid;gap:12px;min-width:0}.qcc-content[hidden]{display:none}.qcc-field{width:100%;min-width:0;padding:9px 10px;border:1px solid var(--plugin-border);border-radius:5px;background:var(--plugin-panel);color:var(--plugin-text)}.qcc-field::placeholder{color:var(--plugin-muted)}.qcc-list,.qcc-targets{display:grid;gap:8px}.qcc-card{display:grid;gap:12px;padding:14px;border:1px solid var(--plugin-border);border-radius:6px;background:var(--plugin-panel)}.qcc-card-title{font-size:13px;font-weight:600}.qcc-preview{display:block;overflow-wrap:anywhere;padding:9px 10px;border:1px solid var(--plugin-border);border-radius:4px;background:var(--plugin-surface);color:var(--plugin-muted);font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.qcc-parameters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:8px}.qcc-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.qcc-button{padding:0 12px}.qcc-button-primary{border-color:var(--plugin-accent);background:var(--plugin-accent-contrast);color:var(--plugin-accent);font-weight:600}.qcc-button:disabled{opacity:.48;cursor:not-allowed}.qcc-target{display:flex;align-items:center;gap:9px;min-height:36px;padding:6px 9px;border:1px solid var(--plugin-border);border-radius:4px;background:var(--plugin-panel);cursor:pointer}.qcc-target input{accent-color:var(--plugin-accent)}.qcc-status{min-height:18px}@media(max-width:520px){.qcc{gap:12px}.qcc-header{gap:8px}.qcc-title{font-size:16px}.qcc-tab{padding:0 8px}}`;
    document.body.replaceChildren(root);

    const header = element("header");
    header.className = "qcc-header";
    const heading = element("div");
    heading.className = "qcc-heading";
    const title = element("h1", label("Quick Command Center", "快捷命令中心"));
    title.className = "qcc-title";
    const subtitle = element("p", label("Reusable command snippets", "可重复使用的命令片段"));
    subtitle.className = "qcc-subtitle";
    heading.append(title, subtitle);
    const refresh = element("button", "↻");
    refresh.type = "button";
    refresh.className = "qcc-refresh";
    refresh.title = label("Refresh command center", "刷新快捷命令中心");
    refresh.setAttribute("aria-label", refresh.title);
    header.append(heading, refresh);

    const tabs = element("nav");
    tabs.className = "qcc-tabs";
    const broadcastTab = element("button", label("Broadcast", "广播"));
    const snippetsTab = element("button", label("Command snippets", "快捷命令中心"));
    broadcastTab.type = snippetsTab.type = "button";
    broadcastTab.className = snippetsTab.className = "qcc-tab";
    broadcastTab.setAttribute("aria-selected", "true");
    snippetsTab.setAttribute("aria-selected", "false");
    tabs.append(broadcastTab, snippetsTab);
    const broadcastContent = element("section");
    broadcastContent.className = "qcc-content";
    const content = element("section");
    content.className = "qcc-content";
    content.hidden = true;
    root.append(styles, header, tabs, broadcastContent, content);

    let snippets: Snippet[] = [];
    let sessions: ActiveSession[] = [];
    const status = element("p");
    status.className = "qcc-status";
    const broadcastToggle = element("button", label("Start broadcast", "启动广播"));
    broadcastToggle.type = "button";
    broadcastToggle.className = "qcc-button qcc-button-primary";
    broadcastContent.append(broadcastToggle);
    let broadcastEnabled = false;
    const updateBroadcastToggle = () => {
      broadcastToggle.textContent = broadcastEnabled ? label("Stop broadcast", "停止广播") : label("Start broadcast", "启动广播");
      broadcastToggle.classList.toggle("qcc-button-primary", !broadcastEnabled);
    };
    broadcastToggle.addEventListener("click", async () => {
      broadcastToggle.disabled = true;
      try {
        const mode = await context.host.sessions.broadcastMode();
        if (!mode.enabled && mode.sessionIds.length === 0) {
          broadcastToggle.title = label("Select sessions from the bar above first.", "请先在上方标签栏选择广播会话。");
          return;
        }
        const nextEnabled = !mode.enabled;
        await context.host.sessions.setBroadcastEnabled(nextEnabled);
        broadcastEnabled = nextEnabled;
        broadcastToggle.title = "";
        updateBroadcastToggle();
      } catch (error) {
        broadcastToggle.title = error instanceof Error ? error.message : String(error);
      } finally {
        broadcastToggle.disabled = false;
      }
    });
    const setTab = (tab: "broadcast" | "snippets") => {
      const showBroadcast = tab === "broadcast";
      broadcastContent.hidden = !showBroadcast;
      content.hidden = showBroadcast;
      broadcastTab.setAttribute("aria-selected", String(showBroadcast));
      snippetsTab.setAttribute("aria-selected", String(!showBroadcast));
      title.textContent = showBroadcast ? label("Terminal Broadcast", "终端广播") : label("Quick Command Center", "快捷命令中心");
      subtitle.textContent = showBroadcast ? label("Broadcast input across sessions", "跨会话同步终端输入") : label("Reusable command snippets", "可重复使用的命令片段");
    };
    broadcastTab.addEventListener("click", () => setTab("broadcast"));
    snippetsTab.addEventListener("click", () => setTab("snippets"));
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      await load();
      updateBroadcastToggle();
      renderSnippets();
      refresh.disabled = false;
    });

    const renderSnippets = () => {
      content.replaceChildren();
      const filter = element("input");
      filter.type = "search";
      filter.placeholder = label("Search snippets", "搜索命令片段");
      filter.className = "qcc-field";
      const list = element("div");
      list.className = "qcc-list";
      const editor = element("div");
      editor.className = "qcc-content";
      const newButton = element("button", label("New snippet", "新建片段"));
      newButton.type = "button";
      newButton.className = "qcc-button";
      const showEditor = (snippet?: Snippet) => {
        editor.replaceChildren();
        const name = element("input");
        name.className = "qcc-field";
        name.maxLength = 200;
        name.placeholder = label("Name", "名称");
        name.value = snippet?.name ?? "";
        const body = element("textarea");
        body.className = "qcc-field";
        body.maxLength = 16_384;
        body.rows = 5;
        body.placeholder = label("Snippet body", "命令内容");
        body.value = snippet?.body ?? "";
        const actions = element("div");
        actions.className = "qcc-actions";
        const save = element("button", label("Save", "保存"));
        save.type = "button";
        save.className = "qcc-button qcc-button-primary";
        save.disabled = !name.value.trim() || !body.value.trim();
        name.addEventListener("input", () => { save.disabled = !name.value.trim() || !body.value.trim(); });
        body.addEventListener("input", () => { save.disabled = !name.value.trim() || !body.value.trim(); });
        const cancel = element("button", label("Cancel", "取消"));
        cancel.type = "button";
        cancel.className = "qcc-button";
        cancel.addEventListener("click", () => editor.replaceChildren());
        save.addEventListener("click", async () => {
          save.disabled = true;
          try {
            const normalizedName = name.value.trim();
            if (snippets.some((item) => item.id !== snippet?.id && item.name === normalizedName)) {
              throw new Error(label("A snippet with this name already exists.", "已存在同名命令片段。"));
            }
            const id = snippet?.id ?? crypto.randomUUID();
            await context.host.storage.upsert("snippets", id, { id, name: normalizedName, body: body.value.trim() });
            await load();
            renderSnippets();
          } catch (error) {
            status.textContent = error instanceof Error ? error.message : String(error);
            save.disabled = false;
          }
        });
        actions.append(save, cancel);
        editor.append(name, body, actions);
      };
      newButton.addEventListener("click", () => showEditor());
      const paint = () => {
        list.replaceChildren();
        const filtered = snippets.filter((item) => item.name.toLowerCase().includes(filter.value.toLowerCase()));
        if (!filtered.length) {
          const empty = element("p", label("No matching snippets", "没有匹配的命令片段"));
          empty.className = "qcc-empty";
          list.append(empty);
        }
        for (const snippet of filtered) {
          const card = element("article");
          card.className = "qcc-card";
          const title = element("strong", snippet.name);
          title.className = "qcc-card-title";
          const commandPreview = element("code", snippet.body);
          commandPreview.className = "qcc-preview";
          card.append(title, commandPreview);
          const manage = element("div");
          manage.className = "qcc-actions";
          const edit = element("button", label("Edit", "编辑"));
          edit.type = "button";
          edit.className = "qcc-button";
          edit.addEventListener("click", () => showEditor(snippet));
          const remove = element("button", label("Delete", "删除"));
          remove.type = "button";
          remove.className = "qcc-button";
          remove.addEventListener("click", () => {
            manage.replaceChildren();
            const confirmation = element("span", label(`Delete "${snippet.name}"?`, `确定删除“${snippet.name}”吗？`));
            confirmation.className = "qcc-count";
            const confirm = element("button", label("Confirm", "确认删除"));
            confirm.type = "button";
            confirm.className = "qcc-button qcc-button-primary";
            confirm.addEventListener("click", async () => {
              confirm.disabled = true;
              try {
                await context.host.storage.remove("snippets", snippet.id);
                await load();
                renderSnippets();
              } catch (error) {
                status.textContent = error instanceof Error ? error.message : String(error);
                confirm.disabled = false;
              }
            });
            const cancel = element("button", label("Cancel", "取消"));
            cancel.type = "button";
            cancel.className = "qcc-button";
            cancel.addEventListener("click", () => manage.replaceChildren(edit, remove));
            manage.append(confirmation, confirm, cancel);
          });
          manage.append(edit, remove);
          card.append(manage);

          const placeholderNames = [...new Set([...snippet.body.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]))];
          const parameters = Object.create(null) as Record<string, string>;
          const parameterFields = element("div");
          parameterFields.className = "qcc-parameters";
          const actions = element("div");
          actions.className = "qcc-actions";
          let run: HTMLButtonElement | null = null;
          let target: HTMLSelectElement | null = null;
          const updateReadiness = () => {
            if (run) run.disabled = !target?.value || placeholderNames.some((name) => !parameters[name]?.trim());
          };
          for (const name of placeholderNames) {
            const input = element("input");
            input.placeholder = name;
            input.setAttribute("aria-label", name);
            input.required = true;
            input.maxLength = 4096;
            input.className = "qcc-field";
            input.addEventListener("input", () => {
              parameters[name] = input.value;
              commandPreview.textContent = snippet.body.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key: string) => parameters[key] ?? "${" + key + "}");
              updateReadiness();
            });
            parameterFields.append(input);
          }

          target = element("select");
          target.setAttribute("aria-label", label("Target session", "目标会话"));
          target.className = "qcc-field";
          target.append(new Option(label("Choose a connected host", "选择已连接主机"), ""));
          for (const session of sessions) target.append(new Option(session.hostName, session.id));
          target.addEventListener("change", updateReadiness);
          run = element("button", label("Review and send", "确认并发送"));
          run.type = "button";
          run.disabled = true;
          run.className = "qcc-button qcc-button-primary";
          run.addEventListener("click", async () => {
            if (!target?.value || placeholderNames.some((name) => !parameters[name]?.trim())) {
              status.textContent = label("Choose a target and fill in every parameter.", "请选择目标会话并填写所有参数。");
              return;
            }
            run.disabled = true;
            try {
              const command = expandSnippetCommand(snippet.body, parameters);
              const result = await context.host.sessions.broadcast([target.value], command);
              const session = sessions.find((item) => item.id === target?.value);
              status.textContent = result.sent
                ? label(`Command sent to ${session?.hostName ?? "the selected host"}.`, `命令已发送到 ${session?.hostName ?? "所选主机"}。`)
                : label("Command canceled.", "已取消发送命令。");
            } catch (error) {
              status.textContent = error instanceof Error ? error.message : String(error);
            } finally { updateReadiness(); }
          });
          actions.append(target, run);
          if (placeholderNames.length) card.append(parameterFields);
          card.append(actions);
          list.append(card);
        }
      };
      filter.addEventListener("input", paint);
      content.append(filter, newButton, editor, list);
      content.append(status);
      paint();
    };
    const view = context.registrations.registerView({ id: "quick-command-center.main", title: label("Terminal Tools", "终端工具"), entrypoint: "dist/index.js", slot: "workspace.secondarySidebar" });

    async function load() {
      try {
        [snippets, sessions] = await Promise.all([
          context.host.storage.list("snippets").then((rows) => rows
            .map(({ key, value }) => parseSnippet(key, value))
            .filter((snippet): snippet is Snippet => snippet !== null)),
          context.host.sessions.active(),
        ]);
        const mode = await context.host.sessions.broadcastMode();
        broadcastEnabled = mode.enabled;
        status.textContent = label(`${snippets.length} snippets`, `${snippets.length} 个命令片段`);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    }

    await load();
    updateBroadcastToggle();
    renderSnippets();
    return { dispose() { view.dispose(); root.remove(); } };
  },
};

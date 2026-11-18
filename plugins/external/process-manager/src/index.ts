import type { HyperShellPlugin } from "@hypershell/plugin-api";

type View = "processes" | "ports" | "containers" | "images" | "volumes" | "networks" | "compose";
type Session = { id: string; hostId: string; hostName: string };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function confirmAction(message: string, chinese: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = element("div");
    overlay.className = "confirm-overlay";
    const dialog = element("section");
    dialog.className = "confirm-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const text = element("p", message);
    const actions = element("div");
    actions.className = "confirm-actions";
    const finish = (value: boolean) => { overlay.remove(); resolve(value); };
    const cancel = element("button", chinese ? "取消" : "Cancel");
    const confirm = element("button", chinese ? "确认" : "Confirm");
    cancel.onclick = () => finish(false);
    confirm.className = "danger-button";
    confirm.onclick = () => finish(true);
    actions.append(cancel, confirm);
    dialog.append(text, actions);
    overlay.append(dialog);
    document.body.append(overlay);
    confirm.focus();
  });
}

export const plugin: HyperShellPlugin = {
  async activate(context) {
    const chinese = document.documentElement.lang.toLowerCase().startsWith("zh");
    const label = (english: string, translated: string) => chinese ? translated : english;
    const root = element("main");
    root.className = "tools";
    const style = element("style");
    style.textContent = `
      *{box-sizing:border-box}[hidden]{display:none!important}.tools{display:grid;gap:9px;width:100%;margin:0;color:var(--plugin-text);font:12px/1.45 system-ui,sans-serif}
      .heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.heading h1{margin:0;font-size:14px;font-weight:650}
      .subtle,.status{color:var(--plugin-muted);font-size:10px}.controls{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center}
      select,button,input{min-height:32px;border:1px solid var(--plugin-border);border-radius:5px;background:var(--plugin-panel);color:var(--plugin-text);padding:5px 8px;font:inherit}
      select{width:100%;min-width:0}button{cursor:pointer;white-space:nowrap}button:hover:not(:disabled),[aria-selected="true"]{background:var(--plugin-raised)}button:disabled{opacity:.55;cursor:default}
      input[type="search"]{width:100%;min-width:0}
      .status{min-height:15px;overflow-wrap:anywhere}.status[data-error="true"]{color:var(--plugin-danger)}.tabs{display:flex;gap:2px;overflow-x:auto;padding:3px;border:1px solid var(--plugin-border);border-radius:7px;background:var(--plugin-raised)}
      .tab{min-width:max-content;padding:5px 10px;border-color:transparent;background:transparent;color:var(--plugin-muted)}.tab[aria-selected="true"]{border-color:var(--plugin-border);background:var(--plugin-panel);color:var(--plugin-text)}
      .toolbar{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.toolbar input{flex:1;min-width:150px}.table-wrap{max-height:62vh;overflow:auto;border:1px solid var(--plugin-border);border-radius:6px;background:var(--plugin-panel)}
      table{width:100%;border-collapse:collapse;text-align:left;font-size:11px}th,td{padding:8px 9px;border-bottom:1px solid var(--plugin-border);vertical-align:top}th{position:sticky;top:0;background:var(--plugin-raised);color:var(--plugin-muted);font-weight:600;white-space:nowrap}td{overflow-wrap:anywhere}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:var(--plugin-raised)}
      .mono{font:11px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}.empty{padding:22px 12px;border:1px dashed var(--plugin-border);border-radius:4px;color:var(--plugin-muted);text-align:center}
      .danger-button{color:var(--plugin-danger)}.confirm-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:#0008}.confirm-dialog{display:grid;gap:14px;width:min(360px,100%);padding:16px;border:1px solid var(--plugin-border);border-radius:5px;background:var(--plugin-panel);color:var(--plugin-text)}.confirm-dialog p{margin:0}.confirm-actions{display:flex;justify-content:flex-end;gap:8px}
      @media(max-width:400px){.tools{gap:10px}.tab{padding:6px 7px}.table-wrap{max-height:56vh}th,td{padding:7px 6px}}
    `;
    document.head.append(style);
    document.body.replaceChildren(root);

    const heading = element("div");
    heading.className = "heading";
    const title = element("h1", label("Process & Port Manager", "进程与端口管理"));
    const subtitle = element("span", label("SSH tools", "SSH 工具"));
    subtitle.className = "subtle";
    heading.append(title, subtitle);
    const controls = element("div");
    controls.className = "controls";
    const sessionSelect = document.createElement("select");
    sessionSelect.setAttribute("aria-label", label("SSH host", "SSH 主机"));
    const autoRefresh = document.createElement("select");
    autoRefresh.setAttribute("aria-label", label("Auto refresh", "自动刷新"));
    for (const seconds of [0, 2, 5, 10]) { const option = element("option", seconds ? `${seconds} ${label("sec", "秒")}` : label("Off", "关闭")); option.value = String(seconds); autoRefresh.append(option); }
    autoRefresh.value = "2";
    controls.append(sessionSelect, autoRefresh);
    const status = element("div");
    status.className = "status";
    const tabs = element("nav");
    tabs.className = "tabs";
    tabs.setAttribute("role", "tablist");
    const content = element("section");
    const filterInput = document.createElement("input");
    filterInput.type = "search";
    filterInput.placeholder = label("PID, user, command or resource name", "PID、用户、命令或资源名称");
    filterInput.setAttribute("aria-label", filterInput.placeholder);
    const resultCount = element("span"); resultCount.className = "subtle";
    const processActions = element("div"); processActions.className = "toolbar";
    const pidInput = document.createElement("input"); pidInput.inputMode = "numeric"; pidInput.placeholder = label("Process ID", "进程 PID");
    pidInput.setAttribute("aria-label", pidInput.placeholder);
    const terminateButton = element("button", label("Terminate", "结束进程")); terminateButton.className = "danger-button";
    terminateButton.onclick = async () => {
      if (!/^\d{1,10}$/.test(pidInput.value) || Number(pidInput.value) < 1) { pidInput.setCustomValidity(label("Enter a valid process ID.", "请输入有效的进程 PID。")); pidInput.reportValidity(); pidInput.setCustomValidity(""); return; }
      if (!await confirmAction(label(`Send TERM to process ${pidInput.value}?`, `确定向进程 ${pidInput.value} 发送终止信号？`), chinese)) return;
      try { await context.host.systems.inspect(sessionSelect.value, "terminate-process", pidInput.value); await refresh(); }
      catch (error) { setError(error); }
    };
    processActions.append(pidInput, terminateButton);
    root.append(heading, controls, tabs, filterInput, status, content, resultCount, processActions);

    let sessions: Session[] = [];
    let activeView: View = "processes";
    let loading = false;
    let lastHeaders: string[] = [];
    let lastRows: string[][] = [];
    let sortColumn = -1;
    let sortDescending = true;
    let autoTimer: ReturnType<typeof setInterval> | undefined;
    const actions: Array<{ id: View; en: string; zh: string }> = [
      { id: "processes", en: "Processes", zh: "进程" },
      { id: "containers", en: "Containers", zh: "容器" },
      { id: "images", en: "Images", zh: "镜像" },
      { id: "volumes", en: "Volumes", zh: "卷" },
      { id: "networks", en: "Network", zh: "网络" },
      { id: "compose", en: "Compose", zh: "Compose" },
      { id: "ports", en: "Ports", zh: "端口" },
    ];

    function showEmpty(message: string) {
      content.replaceChildren();
      const empty = element("div", message);
      empty.className = "empty";
      content.append(empty);
    }

    function showTable(headers: string[], rows: string[][]) {
      lastHeaders = headers;
      lastRows = rows;
      const query = filterInput.value.trim().toLowerCase();
      const visibleRows = rows.filter((row) => row.join(" ").toLowerCase().includes(query));
      if (sortColumn >= 0) visibleRows.sort((left, right) => {
        const result = (left[sortColumn] ?? "").localeCompare(right[sortColumn] ?? "", undefined, { numeric: true, sensitivity: "base" });
        return sortDescending ? -result : result;
      });
      resultCount.textContent = `${visibleRows.length} / ${rows.length} ${label("items", "项")}`;
      content.replaceChildren();
      if (!visibleRows.length) {
        showEmpty(label("No results.", "没有找到结果。"));
        return;
      }
      const wrap = element("div");
      wrap.className = "table-wrap";
      const table = element("table");
      const thead = element("thead");
      const headerRow = element("tr");
      headers.forEach((header, index) => {
        const th = element("th");
        const sortButton = element("button", `${header} ${sortColumn === index ? sortDescending ? "↓" : "↑" : "↕"}`);
        sortButton.onclick = () => { sortDescending = sortColumn === index ? !sortDescending : true; sortColumn = index; showTable(lastHeaders, lastRows); };
        th.append(sortButton); headerRow.append(th);
      });
      thead.append(headerRow);
      const tbody = element("tbody");
      for (const cells of visibleRows) {
        const row = element("tr");
        for (const [index, cell] of cells.entries()) {
          const td = element("td", cell);
          if (index === 0 && (activeView === "processes" || activeView === "ports")) td.className = "mono";
          row.append(td);
        }
        tbody.append(row);
      }
      table.append(thead, tbody);
      wrap.append(table);
      content.append(wrap);
    }

    function renderRawLines(raw: string) {
      const lines = raw.split(/\r?\n/).filter((line) => line.trim());
      if (activeView === "ports") {
        showTable([label("Protocol / socket details", "协议 / 监听详情")], lines.map((line) => [line.trim()]));
        return;
      }
      const rows = lines.map((line) => {
        const match = line.trim().match(/^(\S+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.*)$/);
        return match ? [match[1], match[2], match[3], match[4], match[5], match[6]] : [line.trim()];
      });
      showTable(["PID", label("User", "用户"), "CPU %", label("Memory %", "内存 %"), label("Runtime", "运行时长"), label("Command", "命令")], rows);
    }

    function setError(error: unknown) {
      status.dataset.error = "true";
      status.textContent = error instanceof Error ? error.message : String(error);
    }

    async function refresh() {
      if (loading || !sessionSelect.value) return;
      loading = true;
      status.removeAttribute("data-error");
      status.textContent = label("Loading…", "正在读取…");
      showEmpty(label("Loading data…", "正在加载数据…"));
      try {
        const operation = activeView === "containers" ? "docker" : activeView;
        const raw = await context.host.systems.inspect(sessionSelect.value, operation);
        if (["containers", "images", "volumes", "networks", "compose"].includes(activeView)) {
          let entries: Array<Record<string, unknown>> = [];
          if (activeView === "compose") {
            try {
              const parsed: unknown = JSON.parse(raw);
              entries = Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [];
            } catch { entries = []; }
          } else {
            entries = raw.split(/\r?\n/).filter((line) => line.trim()).flatMap((line) => {
              try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
            });
          }
          if (!entries.length) showEmpty(raw.toLowerCase().includes("not found")
            ? label("Docker is not installed or this Docker feature is unavailable.", "此主机未安装 Docker 或当前 Docker 功能不可用。")
            : label("No resources found.", "没有找到资源。"));
          else {
            const columns = activeView === "containers" ? ["Names", "Image", "Status", "Ports"]
              : activeView === "images" ? ["Repository", "Tag", "ID", "CreatedSince", "Size"]
                : activeView === "volumes" ? ["Name", "Driver", "Scope"]
                  : activeView === "networks" ? ["ID", "Name", "Driver", "Scope"]
                    : ["Name", "Status", "ConfigFiles"];
            const rows = entries.map((entry) => columns.map((key) => String(entry[key] ?? "—")));
            const headers = columns.map((key) => label(key, ({ Repository: "镜像仓库", Tag: "标签", ID: "ID", CreatedSince: "创建时间", Size: "大小", Name: "名称", Driver: "驱动", Scope: "范围", Status: "状态", ConfigFiles: "配置文件", Names: "名称", Image: "镜像", Ports: "端口" } as Record<string, string>)[key] ?? key));
            if (activeView === "containers") headers.push(label("Action", "操作"));
            const displayRows = rows.map((row, index) => activeView === "containers"
              ? [...row, String(entries[index].Status ?? "").toLowerCase().startsWith("up") ? label("Stop", "停止") : label("Start", "启动")]
              : row);
            showTable(headers, displayRows);
            if (activeView === "containers") content.querySelectorAll("tbody tr").forEach((row) => {
              const rowName = row.firstElementChild?.textContent;
              const entry = entries.find((item) => String(item.Names ?? item.ID ?? "") === rowName);
              if (!entry) return;
              const running = String(entry.Status ?? "").toLowerCase().startsWith("up");
              const action = element("button", running ? label("Stop", "停止") : label("Start", "启动"));
              action.className = running ? "danger-button" : "";
              action.onclick = async () => {
                if (!await confirmAction(label(`${running ? "Stop" : "Start"} container ${entry.Names ?? entry.ID}?`, `确定${running ? "停止" : "启动"}容器 ${entry.Names ?? entry.ID}？`), chinese)) return;
                try {
                  await context.host.systems.inspect(sessionSelect.value, running ? "stop-container" : "start-container", String(entry.ID ?? ""));
                  await refresh();
                } catch (error) { setError(error); }
              };
              row.lastElementChild?.replaceChildren(action);
            });
          }
        } else if (activeView === "processes") {
          renderRawLines(raw);
        } else {
          renderRawLines(raw);
        }
        status.textContent = `${sessions.find((session) => session.id === sessionSelect.value)?.hostName ?? ""} · ${new Date().toLocaleTimeString()}`;
      } catch (error) { setError(error); }
      finally { loading = false; }
    }

    async function reloadSessions() {
      sessions = await context.host.sessions.active();
      if (context.launchContext?.hostId) sessions = sessions.filter((session) => session.hostId === context.launchContext!.hostId);
      sessionSelect.replaceChildren();
      const placeholder = element("option", sessions.length ? label("Select a host", "选择主机") : label("No connected SSH hosts", "没有已连接的 SSH 主机"));
      placeholder.value = "";
      placeholder.disabled = true;
      placeholder.selected = true;
      sessionSelect.append(placeholder);
      for (const session of sessions) {
        const option = element("option", session.hostName);
        option.value = session.id;
        sessionSelect.append(option);
      }
      const connected = sessions.length > 0;
      sessionSelect.disabled = !connected;
      if (connected) {
        sessionSelect.value = sessions[0].id;
        void refresh();
      } else {
        status.textContent = label("Connect to an SSH host to inspect processes, ports or containers.", "连接 SSH 主机后即可查看进程、端口和容器。");
        showEmpty(label("No connected SSH hosts.", "当前没有已连接的 SSH 主机。"));
      }
    }

    for (const item of actions) {
      const button = element("button", label(item.en, item.zh));
      button.className = "tab";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(activeView === item.id));
      button.onclick = () => {
        activeView = item.id;
        processActions.hidden = activeView !== "processes";
        tabs.querySelectorAll("button").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
        filterInput.value = "";
        sortColumn = -1;
        void refresh();
      };
      tabs.append(button);
    }
    sessionSelect.onchange = () => void refresh();
    filterInput.oninput = () => showTable(lastHeaders, lastRows);
    autoRefresh.onchange = () => {
      if (autoTimer) clearInterval(autoTimer);
      const seconds = Number(autoRefresh.value);
      autoTimer = seconds ? setInterval(() => void refresh(), seconds * 1000) : undefined;
    };
    processActions.hidden = activeView !== "processes";
    autoTimer = setInterval(() => void refresh(), Number(autoRefresh.value) * 1000);
    const view = context.registrations.registerView({ id: "process-manager.main", title: label("Process & Port Manager", "进程与端口管理"), entrypoint: "dist/index.js", slot: "workspace.tab" });
    await reloadSessions();
    return { dispose() { if (autoTimer) clearInterval(autoTimer); view.dispose(); style.remove(); root.remove(); } };
  },
};

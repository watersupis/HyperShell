import type { HyperShellPlugin } from "@hypershell/plugin-api";

type Session = { id: string; hostId: string; hostName: string };
type Sample = Record<string, number>;
type MetricKey = "cpuPercent" | "memoryPercent" | "diskPercent" | "networkRxBytes";
type MetricRefs = { value: HTMLElement; detail: HTMLElement; fill: HTMLElement };
type HostCard = {
  session: Session;
  root: HTMLElement;
  status: HTMLElement;
  metrics: Map<MetricKey, MetricRefs>;
  diskDetails: HTMLElement;
  diskLoaded: boolean;
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

export const plugin: HyperShellPlugin = {
  async activate(context) {
    const chinese = document.documentElement.lang.toLowerCase().startsWith("zh");
    const label = (english: string, translated: string) => chinese ? translated : english;
    const root = element("main");
    root.className = "monitor";
    const style = element("style");
    style.textContent = `
      *{box-sizing:border-box}[hidden]{display:none!important}.monitor{display:grid;gap:12px;width:100%;margin:0;color:var(--plugin-text);font:12px/1.45 system-ui,sans-serif}
      .heading,.host-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.heading h1{margin:0;font-size:16px;font-weight:650}.subtle{color:var(--plugin-muted);font-size:11px}
      .controls{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:7px;align-items:center}.controls.contextual select:first-child,.controls.contextual button:first-of-type{display:none}.controls select,.controls button,.host-heading button{min-height:34px;border:1px solid var(--plugin-border);border-radius:5px;background:var(--plugin-panel);color:var(--plugin-text);padding:6px 9px;font:inherit}.controls button,.host-heading button{cursor:pointer;white-space:nowrap}.controls button:hover:not(:disabled),.host-heading button:hover{background:var(--plugin-raised)}.controls button:disabled{opacity:.55;cursor:default}.controls select{width:100%;min-width:0}
      .views{display:flex;gap:3px;padding:3px;border-radius:6px;background:var(--plugin-raised)}.views button{min-height:30px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--plugin-muted);padding:5px 12px;font:inherit;cursor:pointer}.views button[aria-selected="true"]{border-color:var(--plugin-border);background:var(--plugin-panel);color:var(--plugin-text)}
      .host-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:10px;align-items:start}.host-card{display:grid;gap:9px;min-width:0;padding:11px;border:1px solid var(--plugin-border);border-radius:7px;background:var(--plugin-panel)}.host-heading strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.host-heading button{min-height:28px;padding:3px 8px;color:var(--plugin-muted)}.host-status{min-height:14px;color:var(--plugin-muted);font-size:10px;overflow-wrap:anywhere}.host-status[data-error="true"]{color:var(--plugin-danger)}
      .metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.metric{display:grid;gap:5px;min-width:0;min-height:102px;padding:9px;border:1px solid var(--plugin-border);border-radius:5px;background:var(--plugin-raised)}.metric-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px}.metric-name{color:var(--metric-color);font-size:10px}.metric-value{font-size:18px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--metric-color)}.metric-detail{min-height:14px;color:var(--plugin-muted);font-size:10px;overflow-wrap:anywhere}.track{height:4px;margin-top:auto;border-radius:4px;background:var(--plugin-border);overflow:hidden}.fill{height:100%;width:0;border-radius:inherit;background:var(--metric-color);transition:width .2s}.disk-panel{overflow:hidden;border:1px solid var(--plugin-border);border-radius:5px}.disk-panel summary{cursor:pointer;padding:7px 9px;background:var(--plugin-raised);font-size:10px;font-weight:600}.disk-details{display:grid;gap:7px;padding:8px}.disk-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;font-size:10px}.disk-track{grid-column:1/-1;height:4px;border-radius:4px;background:var(--plugin-raised);overflow:hidden}.disk-track span{display:block;height:100%;background:#0d9488}.empty{padding:28px 12px;border:1px dashed var(--plugin-border);border-radius:6px;color:var(--plugin-muted);text-align:center}
      @media(max-width:520px){.controls{grid-template-columns:minmax(0,1fr) auto}.controls select{grid-column:1/-1}.heading{align-items:flex-start}.metric{min-height:92px;padding:7px}.metric-value{font-size:16px}}
    `;
    document.head.append(style);
    document.body.replaceChildren(root);

    const heading = element("div");
    heading.className = "heading";
    heading.append(element("h1", label("Host Monitor", "主机监控")), element("span", label("Live metrics", "实时监控")));
    heading.lastElementChild!.className = "subtle";
    const controls = element("div");
    controls.className = "controls";
    const contextualHostId = context.launchContext?.hostId;
    if (contextualHostId) controls.classList.add("contextual");
    const hostSelect = document.createElement("select");
    hostSelect.setAttribute("aria-label", label("Add connected host", "添加已连接主机"));
    const addButton = element("button", label("Add host", "添加主机"));
    const intervalSelect = document.createElement("select");
    intervalSelect.setAttribute("aria-label", label("Refresh interval", "刷新间隔"));
    for (const seconds of [2, 5, 10]) {
      const option = element("option", `${seconds} ${label("sec", "秒")}`);
      option.value = String(seconds);
      intervalSelect.append(option);
    }
    intervalSelect.value = "5";
    const pauseButton = element("button", label("Pause", "暂停"));
    pauseButton.setAttribute("aria-label", label("Pause updates", "暂停刷新"));
    controls.append(hostSelect, addButton, intervalSelect, pauseButton);

    const views = element("div");
    views.className = "views";
    views.setAttribute("role", "tablist");
    const viewNames = [
      { id: "overview", en: "Overview", zh: "概览" },
      { id: "disk", en: "Disk", zh: "磁盘" },
      { id: "network", en: "Network", zh: "网络" },
    ];
    let activeView = "overview";
    const cards = new Map<string, HostCard>();
    const previousNetwork = new Map<string, { rx: number; tx: number; at: number }>();
    const sampling = new Set<string>();
    let sessions: Session[] = [];
    let paused = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const empty = element("div", contextualHostId
      ? label("No active session for this host.", "该主机当前没有活动会话。")
      : label("Add one or more connected hosts to monitor.", "添加一个或多个已连接主机开始监控。"));
    empty.className = "empty";
    const grid = element("div");
    grid.className = "host-grid";
    root.append(heading, controls, views, empty, grid);

    const definitions: Array<{ key: MetricKey; title: string; zh: string; color: string; group: string }> = [
      { key: "cpuPercent", title: "CPU", zh: "处理器", color: "#0d9488", group: "overview" },
      { key: "memoryPercent", title: "Memory", zh: "内存", color: "#2563eb", group: "overview" },
      { key: "diskPercent", title: "Disk", zh: "磁盘", color: "#d97706", group: "disk" },
      { key: "networkRxBytes", title: "Network", zh: "网络", color: "#db2777", group: "network" },
    ];

    function updateView() {
      for (const card of cards.values()) {
        for (const [key, refs] of card.metrics) {
          const definition = definitions.find((item) => item.key === key)!;
          refs.value.closest(".metric")!.toggleAttribute("hidden", activeView !== "overview" && definition.group !== activeView);
        }
        const disk = card.root.querySelector<HTMLDetailsElement>(".disk-panel")!;
        disk.hidden = activeView !== "disk";
        if (activeView === "disk" && disk.open) void loadDiskDetails(card);
      }
    }

    function createCard(session: Session): HostCard {
      const cardRoot = element("article");
      cardRoot.className = "host-card";
      const hostHeading = element("div");
      hostHeading.className = "host-heading";
      const hostName = element("strong", session.hostName);
      hostName.title = session.hostName;
      const removeButton = element("button", label("Remove", "移除"));
      removeButton.setAttribute("aria-label", `${label("Remove", "移除")} ${session.hostName}`);
      removeButton.onclick = () => {
        cards.delete(session.hostId);
        previousNetwork.delete(session.hostId);
        cardRoot.remove();
        empty.hidden = cards.size > 0;
        updateHostOptions();
      };
      hostHeading.append(hostName, removeButton);
      const status = element("div", label("Waiting for metrics…", "等待性能数据…"));
      status.className = "host-status";
      const metrics = element("div");
      metrics.className = "metrics";
      const metricRefs = new Map<MetricKey, MetricRefs>();
      for (const definition of definitions) {
        const metric = element("section");
        metric.className = "metric";
        metric.dataset.group = definition.group;
        metric.style.setProperty("--metric-color", definition.color);
        const metricHead = element("div");
        metricHead.className = "metric-head";
        const name = element("span", label(definition.title, definition.zh));
        name.className = "metric-name";
        const value = element("strong", "--");
        value.className = "metric-value";
        metricHead.append(name, value);
        const detail = element("div");
        detail.className = "metric-detail";
        const track = element("div");
        track.className = "track";
        const fill = element("div");
        fill.className = "fill";
        track.append(fill);
        metric.append(metricHead, detail, track);
        metrics.append(metric);
        metricRefs.set(definition.key, { value, detail, fill });
      }
      const diskPanel = element("details");
      diskPanel.className = "disk-panel";
      diskPanel.append(element("summary", label("Disk partitions", "磁盘分区")));
      const diskDetails = element("div");
      diskDetails.className = "disk-details";
      diskPanel.append(diskDetails);
      diskPanel.ontoggle = () => { if (diskPanel.open) void loadDiskDetails(hostCard); };
      cardRoot.append(hostHeading, status, metrics, diskPanel);
      const hostCard: HostCard = { session, root: cardRoot, status, metrics: metricRefs, diskDetails, diskLoaded: false };
      return hostCard;
    }

    async function loadDiskDetails(card: HostCard) {
      if (card.diskLoaded) return;
      card.diskLoaded = true;
      try {
        const raw = await context.host.systems.inspect(card.session.id, "disk-details");
        card.diskDetails.replaceChildren();
        for (const line of raw.split(/\r?\n/).filter(Boolean)) {
          const fields = line.split("\t");
          const [device, size, used, , percent, mount] = fields;
          const row = element("div");
          row.className = "disk-row";
          row.append(element("span", mount || device || ""), element("strong", `${used ?? ""} / ${size ?? ""} · ${percent ?? ""}`));
          const track = element("div");
          track.className = "disk-track";
          const fill = element("span");
          fill.style.width = `${Math.min(100, Number.parseInt(percent ?? "0", 10) || 0)}%`;
          track.append(fill);
          row.append(track);
          card.diskDetails.append(row);
        }
        if (!card.diskDetails.childElementCount) card.diskDetails.append(element("span", label("No disk details available.", "没有可用的磁盘信息。")));
      } catch {
        card.diskLoaded = false;
      }
    }

    async function refreshCard(card: HostCard) {
      if (sampling.has(card.session.hostId)) return;
      sampling.add(card.session.hostId);
      card.status.removeAttribute("data-error");
      try {
        const raw = await context.host.systems.inspect(card.session.id, "metrics");
        const sample = JSON.parse(raw) as Sample;
        const now = Date.now();
        const previous = previousNetwork.get(card.session.hostId);
        const elapsed = previous ? Math.max(1, (now - previous.at) / 1000) : 1;
        const rxRate = previous ? Math.max(0, sample.networkRxBytes - previous.rx) / elapsed : 0;
        const txRate = previous ? Math.max(0, sample.networkTxBytes - previous.tx) / elapsed : 0;
        previousNetwork.set(card.session.hostId, { rx: sample.networkRxBytes, tx: sample.networkTxBytes, at: now });
        for (const [key, refs] of card.metrics) {
          if (key === "cpuPercent") {
            const value = Math.max(0, sample.cpuPercent ?? 0);
            refs.value.textContent = `${value.toFixed(1)}%`;
            refs.detail.textContent = `${sample.cpuCores ?? "—"} ${label("cores", "核")} · ${label("load", "负载")} ${sample.load1 ?? "—"}`;
            refs.fill.style.width = `${Math.min(100, value)}%`;
          } else if (key === "memoryPercent") {
            const value = Math.max(0, sample.memoryPercent ?? 0);
            const total = sample.memoryTotalKb ?? 0;
            const available = sample.memoryAvailableKb ?? 0;
            refs.value.textContent = `${value.toFixed(1)}%`;
            refs.detail.textContent = total ? `${formatBytes((total - available) * 1024)} / ${formatBytes(total * 1024)}` : "";
            refs.fill.style.width = `${Math.min(100, value)}%`;
          } else if (key === "diskPercent") {
            const value = Math.max(0, sample.diskPercent ?? 0);
            refs.value.textContent = `${value.toFixed(1)}%`;
            refs.detail.textContent = label("Used space", "已用空间");
            refs.fill.style.width = `${Math.min(100, value)}%`;
          } else {
            refs.value.textContent = `↓ ${formatBytes(rxRate)}/s`;
            refs.detail.textContent = `↑ ${formatBytes(txRate)}/s`;
            refs.fill.style.width = rxRate > 0 ? "100%" : "0%";
          }
        }
        card.status.textContent = `${label("Uptime", "运行时长")} ${formatDuration(sample.uptimeSeconds ?? 0)} · ${label("Updated", "更新于")} ${new Date().toLocaleTimeString()}`;
      } catch (error) {
        card.status.dataset.error = "true";
        card.status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        sampling.delete(card.session.hostId);
      }
    }

    function updateHostOptions() {
      const previousId = hostSelect.value;
      hostSelect.replaceChildren();
      const available = sessions.filter((session) => !cards.has(session.hostId));
      const placeholder = element("option", available.length
        ? label("Select a connected host…", "选择已连接主机…")
        : label("No additional connected hosts", "没有其它已连接主机"));
      placeholder.value = "";
      placeholder.disabled = true;
      placeholder.selected = true;
      hostSelect.append(placeholder);
      for (const session of available) {
        const option = element("option", session.hostName);
        option.value = session.hostId;
        hostSelect.append(option);
      }
      if (available.some((session) => session.hostId === previousId)) hostSelect.value = previousId;
      addButton.disabled = available.length === 0;
    }

    async function loadSessions() {
      const active = await context.host.sessions.active() as Session[];
      const byHost = new Map<string, Session>();
      for (const session of active) {
        if (contextualHostId && session.hostId !== contextualHostId) continue;
        if (!byHost.has(session.hostId)) byHost.set(session.hostId, session);
      }
      sessions = [...byHost.values()];
      if (contextualHostId && sessions.length && !cards.has(contextualHostId)) {
        const card = createCard(sessions[0]);
        cards.set(contextualHostId, card);
        grid.append(card.root);
      }
      for (const [hostId, card] of cards) {
        const current = byHost.get(hostId);
        if (current) card.session = current;
        else {
          card.status.dataset.error = "true";
          card.status.textContent = label("No active session for this host.", "该主机当前没有活动会话。重新连接后请移除并重新添加。 ");
        }
      }
      updateHostOptions();
    }

    async function refresh() {
      await loadSessions();
      await Promise.all([...cards.values()].map((card) => refreshCard(card)));
      empty.hidden = cards.size > 0;
    }

    function restartTimer() {
      if (timer) clearInterval(timer);
      timer = paused ? undefined : setInterval(() => void refresh(), Number(intervalSelect.value) * 1000);
    }

    addButton.onclick = () => {
      const session = sessions.find((item) => item.hostId === hostSelect.value);
      if (!session || cards.has(session.hostId)) return;
      const card = createCard(session);
      cards.set(session.hostId, card);
      grid.append(card.root);
      empty.hidden = true;
      updateHostOptions();
      void refreshCard(card);
    };
    intervalSelect.onchange = restartTimer;
    pauseButton.onclick = () => {
      paused = !paused;
      pauseButton.textContent = label(paused ? "Resume" : "Pause", paused ? "继续" : "暂停");
      pauseButton.setAttribute("aria-label", label(paused ? "Resume updates" : "Pause updates", paused ? "继续刷新" : "暂停刷新"));
      restartTimer();
    };
    for (const view of viewNames) {
      const button = element("button", label(view.en, view.zh));
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(view.id === activeView));
      button.onclick = () => {
        activeView = view.id;
        views.querySelectorAll("button").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
        updateView();
        if (view.id === "disk") void Promise.all([...cards.values()].map((card) => loadDiskDetails(card)));
        if (view.id === "network") void refresh();
      };
      views.append(button);
    }

    await refresh();
    restartTimer();
    const view = context.registrations.registerView({
      id: "host-monitor.main",
      title: label("Host Monitor", "主机监控"),
      entrypoint: "dist/index.js",
      slot: context.launchContext?.surface === "workspace.secondarySidebar" ? "workspace.secondarySidebar" : "workspace.tab",
    });
    return {
      dispose() {
        if (timer) clearInterval(timer);
        view.dispose();
        style.remove();
        root.remove();
      },
    };
  },
};

function formatBytes(value: number): string {
  if (value < 1024) return `${value.toFixed(0)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(value: number): string {
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

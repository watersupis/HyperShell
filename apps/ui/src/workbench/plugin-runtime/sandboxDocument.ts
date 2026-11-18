type PluginSandboxInput = {
  pluginId: string;
  locale: "en" | "zh-CN";
  manifest: unknown;
  grantedPermissions: string[];
  launchContext?: { hostId?: string; surface?: string; sessionTargets?: Array<{ id: string; name: string }> };
  source: string;
};

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function createSandboxDocument(input: PluginSandboxInput): string {
  const sourceUrl = `data:text/javascript;base64,${toBase64(input.source)}`;
  const bootstrap = `
const parentWindow = window.parent;
const pluginId = ${JSON.stringify(input.pluginId)};
const launchContext = ${JSON.stringify(input.launchContext ?? {})};
const defaultViewSlot = ${JSON.stringify((input.manifest as { ui?: { placement?: string } }).ui?.placement ?? "workspace.tab")};
const allowedViewSlots = ${JSON.stringify((input.manifest as { ui?: { placement?: string; slots?: string[] } }).ui?.slots ?? [(input.manifest as { ui?: { placement?: string } }).ui?.placement ?? "workspace.tab"])};
const pendingCalls = new Map();
const commandHandlers = new Map();
let nextCallId = 0;
let pluginDisposable;
const send = (message) => parentWindow.postMessage({ pluginId, ...message }, "*");
window.addEventListener("beforeunload", () => send({ type: "plugin.navigationAttempt" }), { once: true });
const host = new Proxy(Object.create(null), {
  get(_target, group) {
    if (typeof group !== "string") return undefined;
    return new Proxy(Object.create(null), {
      get(_group, method) {
        if (typeof method !== "string") return undefined;
        return (...args) => new Promise((resolve, reject) => {
          const requestId = String(++nextCallId);
          pendingCalls.set(requestId, { resolve, reject });
          send({ type: "host.invoke", requestId, method: group + "." + method, args });
        });
      }
    });
  }
});
const registrations = {
  registerCommand(command) {
    if (!command || typeof command.id !== "string" || typeof command.title !== "string" || typeof command.execute !== "function") throw new Error("Invalid command contribution");
    if (command.slot !== undefined && command.slot !== "workspace.toolbar") throw new Error("Commands may only contribute to workspace.toolbar");
    commandHandlers.set(command.id, command.execute);
    send({ type: "command.register", command: { id: command.id, title: command.title, keywords: command.keywords ?? [], slot: command.slot ?? "workspace.toolbar" } });
    return { dispose() { commandHandlers.delete(command.id); send({ type: "command.remove", id: command.id }); } };
  },
  registerView(view) {
    if (!view || typeof view.id !== "string" || typeof view.title !== "string") throw new Error("Invalid view contribution");
    const slot = view.slot ?? defaultViewSlot;
    if (!allowedViewSlots.includes(slot)) throw new Error("Views may only contribute to slots declared in the plugin manifest");
    send({ type: "view.register", view: { id: view.id, title: view.title, slot } });
    return { dispose() { send({ type: "view.remove", id: view.id }); } };
  }
};
window.addEventListener("message", async (event) => {
  if (event.source !== parentWindow || !event.data || typeof event.data !== "object") return;
  const message = event.data;
  if (message.pluginId !== pluginId) return;
  if (message.type === "plugin.theme") {
    if (message.variant === "light" || message.variant === "dark") {
      document.documentElement.dataset.colorScheme = message.variant;
    }
  } else if (message.type === "host.result" || message.type === "host.error") {
    const pending = pendingCalls.get(message.requestId);
    if (!pending) return;
    pendingCalls.delete(message.requestId);
    if (message.type === "host.error") pending.reject(new Error(String(message.error)));
    else pending.resolve(message.value);
  } else if (message.type === "command.execute") {
    const handler = commandHandlers.get(message.id);
    if (!handler) return;
    try { await handler(); send({ type: "command.completed", id: message.id }); }
    catch (error) { send({ type: "plugin.error", error: String(error) }); }
  } else if (message.type === "plugin.stop") {
    try { pluginDisposable?.dispose?.(); } finally { commandHandlers.clear(); pendingCalls.clear(); }
  }
});
try {
  const module = await import(${JSON.stringify(sourceUrl)});
  const plugin = module.plugin ?? module.default;
  if (!plugin || typeof plugin.activate !== "function") throw new Error("Plugin entrypoint must export plugin.activate(context)");
  pluginDisposable = await plugin.activate({
    manifest: ${JSON.stringify(input.manifest)},
    grantedPermissions: ${JSON.stringify(input.grantedPermissions)},
    launchContext,
    registrations,
    host
  });
  send({ type: "plugin.ready" });
} catch (error) {
  send({ type: "plugin.error", error: String(error) });
}
`;
  const bootstrapUrl = `data:text/javascript;base64,${toBase64(bootstrap)}`;
  const contentSecurityPolicy = [
    "default-src 'none'",
    "script-src data:",
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "navigate-to 'none'",
  ].join("; ");
  return `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{color-scheme:dark;--plugin-surface:#111820;--plugin-panel:#18212a;--plugin-raised:#202b36;--plugin-border:#33404d;--plugin-text:#e6edf3;--plugin-muted:#9aa9b8;--plugin-accent:#55c2b5;--plugin-accent-contrast:#102a27;--plugin-danger:#f87171}html[data-color-scheme="light"]{color-scheme:light;--plugin-surface:#f5f7fa;--plugin-panel:#fff;--plugin-raised:#e9eef4;--plugin-border:#cbd5e1;--plugin-text:#1a2332;--plugin-muted:#58687b;--plugin-accent:#087f8c;--plugin-accent-contrast:#e4f5f5;--plugin-danger:#b42318}html,body{margin:0;min-height:100%;font:13px system-ui,sans-serif;color:var(--plugin-text);background:var(--plugin-surface)}body{padding:12px;box-sizing:border-box}button,input,textarea,select{font:inherit}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--plugin-accent);outline-offset:2px}</style></head><body><script type="module" src="${bootstrapUrl}"></script></body></html>`;
}

import type { HyperShellPlugin } from "@hypershell/plugin-api";

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

export const plugin: HyperShellPlugin = {
  async activate(context) {
    const root = createElement("main");
    root.style.cssText = "display:grid;gap:12px;padding:16px;color:var(--text-primary, #e5e7eb);font:13px system-ui,sans-serif";
    const heading = createElement("h1", context.manifest.name);
    heading.style.cssText = "font-size:16px;margin:0";
    const message = createElement("p", "Your plugin is running.");
    message.style.cssText = "margin:0;color:var(--text-secondary, #9ca3af)";
    root.append(heading, message);
    document.body.replaceChildren(root);

    const view = context.registrations.registerView({
      id: "example.main",
      title: context.manifest.name,
      entrypoint: "dist/index.js",
      slot: "workspace.secondarySidebar",
    });
    const command = context.registrations.registerCommand({
      id: "example.refresh",
      title: "Refresh example view",
      async execute() {
        message.textContent = `Refreshed at ${new Date().toLocaleTimeString()}.`;
      },
    });

    return {
      dispose() {
        command.dispose();
        view.dispose();
        root.remove();
      },
    };
  },
};

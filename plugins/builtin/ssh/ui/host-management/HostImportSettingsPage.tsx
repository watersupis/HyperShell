import type { PluginSettingsPageProps } from "@hypershell/plugin-api";
import { hostImportStore, type HostImportKind } from "./hostImportStore";

const importOptions: Array<{ kind: HostImportKind; title: string; description: string }> = [
  { kind: "ssh-config", title: "Import SSH Config", description: "Paste ~/.ssh/config content and preview hosts." },
  { kind: "putty", title: "Import from PuTTY", description: "Import saved SSH sessions from the Windows registry." },
  { kind: "ssh-manager", title: "Import from SshManager", description: "Import hosts, groups and snippets from an SshManager database." },
];

export function HostImportSettingsPage({ host }: PluginSettingsPageProps) {
  const Button = host.ui.Button;

  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-semibold text-text-primary">Host Imports</h2>
      {importOptions.map(({ kind, title, description }) => (
        <div key={kind} className="flex items-center gap-3 border-b border-border py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-text-primary">{title}</div>
            <div className="mt-1 text-xs text-text-muted">{description}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => hostImportStore.getState().show(kind)}>Open</Button>
        </div>
      ))}
    </section>
  );
}

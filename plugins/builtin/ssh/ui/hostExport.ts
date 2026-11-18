import { toast } from "sonner";
import type { PluginSidebarAction, PluginUiHostServices } from "@hypershell/plugin-api";

export type HostExportFormat = "json" | "csv" | "ssh-config";

const EXPORT_OPTIONS: Record<
  HostExportFormat,
  { extension: string; filterName: string }
> = {
  json: { extension: "json", filterName: "JSON" },
  csv: { extension: "csv", filterName: "CSV" },
  "ssh-config": { extension: "conf", filterName: "SSH Config" },
};

export function getHostExportActions(host: PluginUiHostServices): PluginSidebarAction[] {
  return (Object.keys(EXPORT_OPTIONS) as HostExportFormat[]).map((format) => {
    const option = EXPORT_OPTIONS[format];
    return {
      id: `ssh.hosts.export.${format}`,
      label: host.i18n.translate(`Export as ${option.filterName}`),
      action: async () => {
        if (!host.isAvailable()) {
          toast.error("Host export is unavailable in this environment.");
          return;
        }

        const filePath = await host.files.showSaveDialog({
          defaultPath: `hosts.${option.extension}`,
          filters: [{ name: option.filterName, extensions: [option.extension] }],
        });
        if (!filePath) return;

        try {
          const result = await host.hosts.export({ format, filePath });
          toast.success(
            `Exported ${result.exported} host${result.exported === 1 ? "" : "s"} to ${filePath}`
          );
        } catch (error) {
          toast.error(
            `Export failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      },
    };
  });
}

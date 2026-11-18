import type { PluginUiHostServices } from "@hypershell/plugin-api";

export function extractDroppedPaths(
  host: PluginUiHostServices,
  dataTransfer: DataTransfer | null
): string[] {
  if (!dataTransfer || !host.isAvailable()) {
    return [];
  }

  return Array.from(dataTransfer.files)
    .map((file) => host.files.getPathForFile(file))
    .filter(Boolean);
}

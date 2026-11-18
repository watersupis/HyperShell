export function migrateLocalTerminalWorkspaceTab(
  tab: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const claudeSessionId = tab.claudeSessionId;
  if (typeof claudeSessionId !== "string") return tab as Record<string, unknown>;

  const migrated = { ...tab };
  delete migrated.claudeSessionId;

  const pluginData = isRecord(tab.pluginData) ? tab.pluginData : {};
  const localTerminalData = isRecord(pluginData["local-terminal"])
    ? pluginData["local-terminal"]
    : {};

  migrated.pluginData = {
    ...pluginData,
    "local-terminal": { ...localTerminalData, claudeSessionId },
  };
  return migrated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

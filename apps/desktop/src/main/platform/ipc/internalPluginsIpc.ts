import { internalPluginInvokeRequestSchema, ipcChannels } from "@hypershell/shared";
import type { IpcMainLike } from "./registerIpc";
import type { InternalPluginDefinition } from "../../plugin-runtime/internalPluginCatalog";
import type { RuntimePluginMainMethodRegistry } from "../../plugin-runtime/pluginMainMethodRegistry";

export const INTERNAL_PLUGINS_SETTING_KEY = "internal_plugins_enabled";

export interface InternalPluginState {
  id: string;
  enabled: boolean;
  kind: "core" | "optional";
}

type DbLike = {
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
    run(...args: unknown[]): unknown;
  };
};

function readEnabledPlugins(db: DbLike, plugins: readonly InternalPluginDefinition[]): Set<string> {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(INTERNAL_PLUGINS_SETTING_KEY) as
    | { value: string }
    | undefined;
  if (!row) return new Set();

  try {
    const values: unknown = JSON.parse(row.value);
    if (!Array.isArray(values)) return new Set();
    const optionalIds = new Set(plugins.filter((plugin) => plugin.kind === "optional").map((plugin) => plugin.id));
    return new Set(values.filter((value): value is string => typeof value === "string" && optionalIds.has(value)));
  } catch {
    return new Set();
  }
}

export function enableInternalPlugin(db: DbLike, pluginId: string): void {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(INTERNAL_PLUGINS_SETTING_KEY) as
    | { value: string }
    | undefined;
  let enabled: string[] = [];
  try {
    const values: unknown = row ? JSON.parse(row.value) : [];
    if (Array.isArray(values)) enabled = values.filter((value): value is string => typeof value === "string");
  } catch {
    enabled = [];
  }
  if (!enabled.includes(pluginId)) enabled.push(pluginId);
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(INTERNAL_PLUGINS_SETTING_KEY, JSON.stringify(enabled));
}

export function registerInternalPluginsIpc(
  ipcMain: IpcMainLike,
  getDatabase: () => unknown,
  plugins: readonly InternalPluginDefinition[],
  methods: RuntimePluginMainMethodRegistry
): Set<string> {
  const db = getDatabase() as DbLike;
  const enabled = readEnabledPlugins(db, plugins);

  ipcMain.handle(ipcChannels.internalPlugins.list, () => plugins.map((plugin) => ({
    id: plugin.id,
    enabled: plugin.kind === "core" || enabled.has(plugin.id),
    kind: plugin.kind,
  } satisfies InternalPluginState)));

  ipcMain.handle(ipcChannels.internalPlugins.setEnabled, (_event, request: unknown) => {
    if (!request || typeof request !== "object") throw new Error("Invalid plugin state request");
    const { id, value } = request as { id?: unknown; value?: unknown };
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin || plugin.kind !== "optional" || typeof value !== "boolean") {
      throw new Error("Invalid plugin state request");
    }

    if (value) enabled.add(plugin.id);
    else enabled.delete(plugin.id);

    db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(INTERNAL_PLUGINS_SETTING_KEY, JSON.stringify([...enabled]));
    return { restartRequired: true };
  });

  ipcMain.handle(ipcChannels.internalPlugins.invoke, (_event, request: unknown) => {
    const parsed = internalPluginInvokeRequestSchema.parse(request);
    return methods.invoke(parsed.pluginId, parsed.method, parsed.payload);
  });

  return enabled;
}

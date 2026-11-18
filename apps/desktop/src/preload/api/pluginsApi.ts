import { internalPluginInvokeRequestSchema, ipcChannels } from "@hypershell/shared";
import { pluginManifestSchema, pluginPermissionSchema } from "@hypershell/plugin-api";
import { z } from "zod";
import type { PreloadIpcRenderer, PreloadLogger } from "./types";

const installedPluginSchema = z.object({
  manifest: pluginManifestSchema,
  installedAt: z.string(),
  grantedPermissions: z.array(pluginPermissionSchema),
  runtimeAvailable: z.literal(true),
});
const installedPluginsSchema = z.array(installedPluginSchema);
const runtimePackageSchema = z.object({
  manifest: pluginManifestSchema,
  grantedPermissions: z.array(pluginPermissionSchema),
  source: z.string().max(32 * 1024 * 1024),
});
const invokeRequestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(80),
  method: z.enum(["hosts.list", "storage.list", "storage.upsert", "storage.remove", "storage.claimLegacy", "sessions.active", "sessions.broadcast", "monitoring.latest", "systems.inspect"]),
  args: z.array(z.unknown()).max(8),
}).strict();
const setPermissionsSchema = z.object({
  id: z.string(),
  permissions: z.array(pluginPermissionSchema),
}).strict();

export type ExternalPlugin = z.infer<typeof installedPluginSchema>;
export type PluginPermission = z.infer<typeof pluginPermissionSchema>;
export const internalPluginStateSchema = z.object({
  id: z.string().min(1).max(80),
  enabled: z.boolean(),
  kind: z.enum(["core", "optional"]),
});
export type InternalPluginState = z.infer<typeof internalPluginStateSchema>;

export interface PluginsApi {
  internalPluginsList(): Promise<InternalPluginState[]>;
  internalPluginsSetEnabled(request: { id: string; enabled: boolean }): Promise<{ restartRequired: boolean }>;
  internalPluginsInvoke(request: { pluginId: string; method: string; payload: unknown }): Promise<unknown>;
  pluginsList(): Promise<ExternalPlugin[]>;
  pluginsUpdate(id: string): Promise<ExternalPlugin | null>;
  pluginsRestart(): Promise<void>;
  pluginsInstall(locale?: "en" | "zh-CN"): Promise<{ token: string; manifest: z.infer<typeof pluginManifestSchema>; action: "install" | "update" } | null>;
  pluginsInstallSelected(token: string): Promise<ExternalPlugin>;
  pluginsCancelInstall(token: string): Promise<void>;
  pluginsRuntime(id: string): Promise<z.infer<typeof runtimePackageSchema>>;
  pluginsInvoke(request: { id: string; method: string; args: unknown[] }): Promise<unknown>;
  pluginsSetPermissions(request: { id: string; permissions: PluginPermission[] }): Promise<void>;
  pluginsUninstall(id: string): Promise<void>;
}

export function createPluginsApi(ipcRenderer: PreloadIpcRenderer, _logger: PreloadLogger): PluginsApi {
  return {
    async internalPluginsList() {
      return z.array(internalPluginStateSchema).parse(await ipcRenderer.invoke(ipcChannels.internalPlugins.list));
    },
    async internalPluginsSetEnabled(request) {
      const parsed = z.object({ id: z.string().min(1).max(80), enabled: z.boolean() }).strict().parse(request);
      return z.object({ restartRequired: z.boolean() }).parse(
        await ipcRenderer.invoke(ipcChannels.internalPlugins.setEnabled, { id: parsed.id, value: parsed.enabled })
      );
    },
    async internalPluginsInvoke(request) {
      const parsed = internalPluginInvokeRequestSchema.parse(request);
      return ipcRenderer.invoke(ipcChannels.internalPlugins.invoke, parsed);
    },
    async pluginsList() {
      return installedPluginsSchema.parse(await ipcRenderer.invoke(ipcChannels.plugins.list));
    },
    async pluginsUpdate(id) {
      const result: unknown = await ipcRenderer.invoke(ipcChannels.plugins.update, z.string().parse(id));
      return result === null ? null : installedPluginSchema.parse(result);
    },
    async pluginsRestart() { await ipcRenderer.invoke(ipcChannels.plugins.restart); },
    async pluginsInstall(locale = "en") {
      const result: unknown = await ipcRenderer.invoke(ipcChannels.plugins.install, locale);
      if (result === null) return null;
      return z.object({ token: z.string().uuid(), manifest: pluginManifestSchema, action: z.enum(["install", "update"]) }).parse(result);
    },
    async pluginsInstallSelected(token) {
      return installedPluginSchema.parse(await ipcRenderer.invoke(ipcChannels.plugins.installSelected, z.string().uuid().parse(token)));
    },
    async pluginsCancelInstall(token) {
      await ipcRenderer.invoke(ipcChannels.plugins.cancelInstall, z.string().uuid().parse(token));
    },
    async pluginsRuntime(id) {
      const result = await ipcRenderer.invoke(ipcChannels.plugins.runtime, z.string().parse(id));
      return runtimePackageSchema.parse(result);
    },
    async pluginsInvoke(request) {
      return ipcRenderer.invoke(ipcChannels.plugins.invoke, invokeRequestSchema.parse(request));
    },
    async pluginsSetPermissions(request) {
      await ipcRenderer.invoke(ipcChannels.plugins.setPermissions, setPermissionsSchema.parse(request));
    },
    async pluginsUninstall(id) {
      await ipcRenderer.invoke(ipcChannels.plugins.uninstall, z.string().parse(id));
    },
  };
}

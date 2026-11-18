import { z } from "zod";

export const PLUGIN_API_VERSION = "1.0.0" as const;

export const pluginPermissionSchema = z.enum([
  "snippets.write",
  "command-history.read",
  "command-history.clear",
  "snippets.read",
  "snippets.execute",
  "sessions.read",
  "sessions.broadcast",
  "hosts.read",
  "monitoring.read",
  "monitoring.history.delete",
  "diagnostics.local",
  "processes.read",
  "processes.terminate",
  "docker.manage",
  "storage.read",
  "storage.write",
]);

export const pluginUiPlacementSchema = z.enum(["workspace.tab", "workspace.secondarySidebar", "workspace.panel"]);
export const pluginUiSlotSchema = z.enum(["sidebar.navigation", "terminal.toolbar", "workspace.tab", "workspace.secondarySidebar", "workspace.panel", "workspace.header"]);

export const pluginManifestSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  apiVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().trim().min(1).max(240),
  entrypoint: z.string().regex(/^[A-Za-z0-9._/-]+$/).refine((value) => !value.startsWith("/") && !value.split("/").includes("..")),
  permissions: z.array(pluginPermissionSchema).max(32).refine((items) => items.length === new Set(items).size),
  dataImports: z.array(z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(120)).max(16).optional(),
  contributions: z.array(z.enum(["commands", "views", "settings"])).max(8),
  ui: z.object({
    placement: pluginUiPlacementSchema.optional(),
    slots: z.array(pluginUiSlotSchema).max(4).optional(),
    workspaceToolbar: z.boolean().optional(),
    hostContextMenu: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export type PluginPermission = z.infer<typeof pluginPermissionSchema>;
export type PluginUiPlacement = z.infer<typeof pluginUiPlacementSchema>;
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

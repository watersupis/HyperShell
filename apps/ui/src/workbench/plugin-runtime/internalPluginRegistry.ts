import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { PluginHostConnection, PluginHostEditorContribution, PluginSessionOpenPromptProps, PluginSettingsMigrationState, PluginUiHostServices, PluginUiCommand as Command, PluginQuickConnectProfile, PluginSettingsPageContribution, PluginSidebarAction, PluginTabPresentation, PluginUiContribution, PluginWorkspaceTab, PluginTabRequest } from "@hypershell/plugin-api";
import type { SavedSessionRecord, WorkspaceTab } from "@hypershell/shared";
import {
  builtinPluginCatalog,
  isBuiltinPluginTab,
  type BuiltinPluginDefinition,
} from "../../../../../plugins/builtin/catalog";
import { builtinUiContributions } from "../../../../../plugins/builtin/ui";
import { internalPluginUiHostServices } from "./internalPluginUiHostServices";
import { pluginPanelViewId } from "../panel/panelStore";
export type WorkspacePluginTab = PluginWorkspaceTab;
export type InternalPluginDescriptor = BuiltinPluginDefinition;

export interface InternalPlugin extends InternalPluginDescriptor, PluginUiContribution {
  contribution?: LazyExoticComponent<ComponentType<any>>;
  overlay?: LazyExoticComponent<ComponentType<any>>;
  workspaceTabRenderer?: LazyExoticComponent<ComponentType<any>>;
  windowRenderer?: LazyExoticComponent<ComponentType<any>>;
  workspaceLauncher?: LazyExoticComponent<ComponentType<any>>;
  sidebarContribution?: LazyExoticComponent<ComponentType<any>>;
  secondarySidebarView?: LazyExoticComponent<ComponentType<any>>;
  workspaceToolbarButton?: LazyExoticComponent<ComponentType<any>>;
  terminalToolbar?: LazyExoticComponent<ComponentType<any>>;
  sessionOpenPrompt?: LazyExoticComponent<ComponentType<PluginSessionOpenPromptProps>>;
  hostEditor?: LazyExoticComponent<ComponentType<any>>;
  hostEditorContribution?: PluginHostEditorContribution;
  panelViews?: Array<{ id: string; title: string; component: LazyExoticComponent<ComponentType<any>> }>;
  settingsPages?: Array<{ id: string; title: string; component: LazyExoticComponent<ComponentType<any>> }>;
}

export const internalPlugins: InternalPlugin[] = builtinPluginCatalog.map((descriptor) => ({
  ...descriptor,
  ...(() => {
    const contribution = builtinUiContributions.find((item) => item.id === descriptor.id);
    return contribution ? {
      ...contribution,
      contribution: contribution.loadContribution
        ? lazy(() => contribution.loadContribution!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      overlay: contribution.loadOverlay
        ? lazy(() => contribution.loadOverlay!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      workspaceTabRenderer: contribution.loadWorkspaceTabRenderer
        ? lazy(() => contribution.loadWorkspaceTabRenderer!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      windowRenderer: contribution.loadWindowRenderer
        ? lazy(() => contribution.loadWindowRenderer!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      workspaceLauncher: contribution.loadWorkspaceLauncher
        ? lazy(() => contribution.loadWorkspaceLauncher!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      sidebarContribution: contribution.loadSidebarContribution
        ? lazy(() => contribution.loadSidebarContribution!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      secondarySidebarView: contribution.loadSecondarySidebarView
        ? lazy(() => contribution.loadSecondarySidebarView!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      workspaceToolbarButton: contribution.loadWorkspaceToolbarButton
        ? lazy(() => contribution.loadWorkspaceToolbarButton!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      terminalToolbar: contribution.loadTerminalToolbar
        ? lazy(() => contribution.loadTerminalToolbar!().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      sessionOpenPrompt: contribution.loadSessionOpenPrompt
        ? lazy(() => contribution.loadSessionOpenPrompt!().then((module) => ({ default: module.default as ComponentType<PluginSessionOpenPromptProps> })))
        : undefined,
      hostEditor: contribution.getHostEditor
        ? lazy(() => contribution.getHostEditor!().load().then((module) => ({ default: module.default as ComponentType<any> })))
        : undefined,
      hostEditorContribution: contribution.getHostEditor?.(),
      panelViews: contribution.getPanelViews?.().map((view) => ({
        id: view.id,
        title: view.title,
        component: lazy(() => view.load().then((module) => ({ default: module.default as ComponentType<any> }))),
      })),
      settingsPages: contribution.getSettingsPages?.().map((page: PluginSettingsPageContribution) => ({
        id: page.id,
        title: page.title,
        component: lazy(() => page.load().then((module) => ({ default: module.default as ComponentType<any> }))),
      })),
    } : {};
  })(),
}));

export const corePlugins = internalPlugins.filter((plugin) => plugin.kind === "core");
export const optionalPlugins = internalPlugins.filter((plugin) => plugin.kind === "optional");

export const workspaceFeatureRegistry = {
  terminal: lazy(() => import("../editor-area/terminal/TerminalPane").then((module) => ({ default: module.TerminalPane }))),
};

export function getInternalPluginForTab(tab: WorkspacePluginTab): InternalPlugin | undefined {
  return internalPlugins.find((plugin) =>
    (tab.pluginId && plugin.id === tab.pluginId) ||
    (tab.type && plugin.legacyTabTypes?.includes(tab.type))
  );
}

export function getInternalPluginForTransport(transport: string | undefined): InternalPlugin | undefined {
  if (!transport) return undefined;
  return internalPlugins.find((plugin) => plugin.transports?.includes(transport));
}

export function migrateInternalWorkspaceTab(tab: WorkspaceTab): WorkspaceTab {
  const migrated = internalPlugins.reduce(
    (current, plugin) => plugin.migrateWorkspaceTab?.(current) ?? current,
    tab as Record<string, unknown>
  );
  return migrated as WorkspaceTab;
}

export function migrateInternalPluginSettings(
  settings: PluginSettingsMigrationState
): PluginSettingsMigrationState {
  return internalPlugins.reduce(
    (current, plugin) => plugin.migrateSettings?.(current) ?? current,
    settings
  );
}

export function getInternalPluginTabPresentation(tab: WorkspacePluginTab): PluginTabPresentation | undefined {
  const plugin = getInternalPluginForTab(tab);
  if (!plugin) return undefined;
  return plugin.getTabPresentation?.(tab) ?? { label: plugin.title };
}

export function isPluginWorkspaceTab(tab: WorkspacePluginTab): boolean {
  return tab.type === "plugin" || isBuiltinPluginTab(tab);
}

export function canRestoreInternalSavedSession(session: SavedSessionRecord): boolean {
  const owner = internalPlugins.find((plugin) => plugin.transports?.includes(session.transport));
  return owner?.canRestoreSavedSession?.(session) ?? Boolean(owner);
}

export function getInternalPluginCommands(
  enabledIds: ReadonlySet<string>,
  context: Parameters<NonNullable<InternalPlugin["getCommands"]>>[0]
): Command[] {
  return internalPlugins.flatMap((plugin) =>
    enabledIds.has(plugin.id) ? plugin.getCommands?.(context) ?? [] : []
  );
}

export function getInternalPluginSidebarActions(
  enabledIds: ReadonlySet<string>
): PluginSidebarAction[] {
  return internalPlugins.flatMap((plugin) =>
    enabledIds.has(plugin.id)
      ? plugin.getSidebarActions?.({ host: internalPluginUiHostServices }) ?? []
      : []
  );
}

export function getInternalPluginPanelViews(enabledIds: ReadonlySet<string>) {
  return internalPlugins.flatMap((plugin) =>
    enabledIds.has(plugin.id)
      ? (plugin.panelViews ?? []).map((view) => ({
          id: pluginPanelViewId(plugin.id, view.id),
          pluginId: plugin.id,
          title: view.title,
          component: view.component,
        }))
      : []
  );
}

export function getInternalPluginSettingsPages(enabledIds: ReadonlySet<string>) {
  return internalPlugins.flatMap((plugin) =>
    enabledIds.has(plugin.id)
      ? (plugin.settingsPages ?? []).map((page) => ({
          ...page,
          pluginId: plugin.id,
          categoryId: `plugin:${plugin.id}:${page.id}`,
        }))
      : []
  );
}

export function getInternalPluginHostEditor(
  enabledIds: ReadonlySet<string>
): LazyExoticComponent<ComponentType<any>> | undefined {
  return internalPlugins.find((plugin) => enabledIds.has(plugin.id) && plugin.hostEditor)?.hostEditor;
}

export function getInternalPluginHostEditorContribution(
  enabledIds: ReadonlySet<string>
): PluginHostEditorContribution | undefined {
  return internalPlugins.find((plugin) =>
    enabledIds.has(plugin.id) && plugin.hostEditorContribution
  )?.hostEditorContribution;
}

export function getInternalPluginQuickConnectProfiles(
  enabledIds: ReadonlySet<string>
): PluginQuickConnectProfile[] {
  return internalPlugins.flatMap((plugin) =>
    enabledIds.has(plugin.id)
      ? (plugin.getQuickConnectProfiles?.() ?? []).map((profile) => ({ ...profile, pluginId: plugin.id }))
      : []
  );
}

export function openInternalPluginQuickConnectProfile(
  profile: PluginQuickConnectProfile,
  openTab: (tab: PluginTabRequest) => void
): boolean {
  if (!profile.pluginId) return false;
  const plugin = internalPlugins.find((item) => item.id === profile.pluginId);
  if (!plugin?.openQuickConnectProfile) return false;
  plugin.openQuickConnectProfile(profile.id, { openTab });
  return true;
}

export async function prepareInternalHostConnection(
  connection: PluginHostConnection,
  enabledIds: ReadonlySet<string>,
  host: PluginUiHostServices
): Promise<{ attachTo: string | null } | null | undefined> {
  for (const plugin of internalPlugins) {
    if (!enabledIds.has(plugin.id) || !plugin.prepareHostConnection) continue;
    const result = await plugin.prepareHostConnection(connection, { host });
    if (result !== undefined) return result;
  }
  return undefined;
}

export function activateInternalPlugins(enabledIds: ReadonlySet<string>): () => void {
  const disposers = internalPlugins.flatMap((plugin) => {
    if (!enabledIds.has(plugin.id) || !plugin.activate) return [];
    const dispose = plugin.activate(internalPluginUiHostServices);
    return dispose ? [dispose] : [];
  });
  return () => disposers.forEach((dispose) => dispose());
}

export function isInternalPluginFeatureEnabled(
  featureId: string,
  enabledIds: ReadonlySet<string>
): boolean {
  return internalPlugins.some((plugin) =>
    enabledIds.has(plugin.id) && plugin.featureIds.includes(featureId)
  );
}

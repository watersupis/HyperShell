import { create } from "zustand";

export interface PluginSidebarTarget {
  source: "external" | "builtin";
  pluginId: string;
  hostId?: string;
  title?: string;
}

interface SecondarySidebarPluginState {
  plugin: PluginSidebarTarget | null;
  openPlugin: (target: Omit<PluginSidebarTarget, "source">) => void;
  openBuiltinPlugin: (target: Omit<PluginSidebarTarget, "source">) => void;
  closePlugin: () => void;
}

export const useSecondarySidebarStore = create<SecondarySidebarPluginState>((set) => ({
  plugin: null,
  openPlugin: (plugin) => set({ plugin: { ...plugin, source: "external" } }),
  openBuiltinPlugin: (plugin) => set({ plugin: { ...plugin, source: "builtin" } }),
  closePlugin: () => set({ plugin: null }),
}));

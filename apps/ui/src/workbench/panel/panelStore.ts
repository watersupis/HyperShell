import { create } from "zustand";

export function pluginPanelViewId(pluginId: string, viewId = "main"): string {
  return `plugin:${pluginId}:${viewId}`;
}

export interface WorkbenchPanelViewContext {
  hostId?: string;
}

interface WorkbenchPanelState {
  isOpen: boolean;
  activeViewId: string | null;
  height: number;
  viewContexts: Record<string, WorkbenchPanelViewContext>;
  openView: (viewId: string, context?: WorkbenchPanelViewContext) => void;
  activateView: (viewId: string) => void;
  setActiveView: (viewId: string | null) => void;
  toggle: () => void;
  close: () => void;
  setHeight: (height: number) => void;
  removeViewContext: (viewId: string) => void;
}

export const useWorkbenchPanelStore = create<WorkbenchPanelState>((set) => ({
  isOpen: false,
  activeViewId: null,
  height: 260,
  viewContexts: {},
  openView: (viewId, context) => set((state) => ({
    isOpen: true,
    activeViewId: viewId,
    viewContexts: context ? { ...state.viewContexts, [viewId]: context } : state.viewContexts,
  })),
  activateView: (viewId) => set({ isOpen: true, activeViewId: viewId }),
  setActiveView: (viewId) => set({ activeViewId: viewId }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
  setHeight: (height) => {
    const maxHeight = typeof window === "undefined" ? 640 : Math.max(120, Math.min(640, window.innerHeight - 200));
    set({ height: Math.max(120, Math.min(maxHeight, height)) });
  },
  removeViewContext: (viewId) => set((state) => {
    const viewContexts = { ...state.viewContexts };
    delete viewContexts[viewId];
    return { viewContexts };
  }),
}));

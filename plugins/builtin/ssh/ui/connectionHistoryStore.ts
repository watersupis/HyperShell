import { create } from "zustand";
import type { PluginHostContext } from "@hypershell/plugin-api";

interface ConnectionHistoryState {
  target: PluginHostContext | null;
  open(target: PluginHostContext): void;
  close(): void;
}

export const connectionHistoryStore = create<ConnectionHistoryState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));

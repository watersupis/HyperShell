import { create } from "zustand";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

interface ActiveForward {
  id: string;
  hostname?: string;
  protocol?: string;
  localAddress?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  status: "active" | "stopped";
}

interface TunnelState {
  activeForwards: ActiveForward[];
  selectedForwardId: string | null;
  refresh: (host: Pick<PluginUiHostServices, "portForward">) => Promise<void>;
  selectForward: (id: string | null) => void;
}

export const useTunnelStore = create<TunnelState>((set) => ({
  activeForwards: [],
  selectedForwardId: null,
  async refresh(host) {
    try {
      const result = await host.portForward.list();
      if (result) {
        set({
          activeForwards: result.map((f: { id: string; hostname?: string; protocol?: string; localPort?: number; remoteHost?: string; remotePort?: number }) => ({
            status: "active" as const,
            ...f,
          })),
        });
      }
    } catch { /* ignore */ }
  },

  selectForward(id) {
    set({ selectedForwardId: id });
  },

}));

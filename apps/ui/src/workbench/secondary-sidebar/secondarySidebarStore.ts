import { create } from "zustand";

interface SecondarySidebarLayoutState {
  width: number;
  setWidth: (width: number) => void;
}

export const useSecondarySidebarLayoutStore = create<SecondarySidebarLayoutState>((set) => ({
  width: 380,
  setWidth: (width) => set({ width: Math.max(280, Math.min(720, width)) }),
}));

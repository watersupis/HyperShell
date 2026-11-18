import { create } from "zustand";

export type HostImportKind = "ssh-config" | "putty" | "ssh-manager";

interface HostImportState {
  open: HostImportKind | null;
  show(kind: HostImportKind): void;
  close(): void;
}

export const hostImportStore = create<HostImportState>((set) => ({
  open: null,
  show: (open) => set({ open }),
  close: () => set({ open: null }),
}));

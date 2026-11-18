import { createStore, type StoreApi } from "zustand/vanilla";

import type { FsEntry } from "@hypershell/shared";
import type { SftpEntry } from "@hypershell/plugin-api";

export type SftpPane = "local" | "remote";
export type SftpSortColumn = "name" | "size" | "modifiedAt" | "permissions";
export type SftpSortDirection = "asc" | "desc";

export interface SftpSortState {
  column: SftpSortColumn;
  direction: SftpSortDirection;
}

export interface SftpOperationLog {
  id: string;
  timestamp: number;
  operation?: string;
  command: string;
  result: string;
  success: boolean;
  undoData?: Record<string, unknown>;
}

export interface SftpUndoAction {
  id: string;
  operation: string;
  undo: () => Promise<void>;
}

export interface SftpStoreState {
  sftpSessionId: string;
  localPath: string;
  remotePath: string;
  localEntries: FsEntry[];
  remoteEntries: SftpEntry[];
  localSelection: Set<string>;
  remoteSelection: Set<string>;
  localSortBy: SftpSortState;
  remoteSortBy: SftpSortState;
  localHistory: string[];
  remoteHistory: string[];
  localHistoryIndex: number;
  remoteHistoryIndex: number;
  activePane: SftpPane;
  localCursorIndex: number;
  remoteCursorIndex: number;
  localFilterText: string;
  remoteFilterText: string;
  filterCaseSensitive: boolean;
  filterRegex: boolean;
  isLoading: { local: boolean; remote: boolean };
  error: { local: string | null; remote: string | null };
  operationLogs: SftpOperationLog[];
  undoActions: SftpUndoAction[];
  recordOperation: (command: string, result: string, success: boolean, operation?: string, undoData?: Record<string, unknown>) => void;
  registerUndo: (action: SftpUndoAction) => void;
  peekUndo: () => SftpUndoAction | undefined;
  removeUndo: (id: string) => void;
  clearOperationLogs: () => void;
  setOperationLogs: (logs: SftpOperationLog[]) => void;
  setActivePane: (pane: SftpPane) => void;
  setCursorIndex: (pane: SftpPane, index: number) => void;
  setFilterText: (pane: SftpPane, text: string) => void;
  setFilterCaseSensitive: (value: boolean) => void;
  setFilterRegex: (value: boolean) => void;
  setLocalPath: (path: string) => void;
  setRemotePath: (path: string) => void;
  setLocalEntries: (entries: FsEntry[]) => void;
  setRemoteEntries: (entries: SftpEntry[]) => void;
  setLocalSelection: (selection: Set<string>) => void;
  setRemoteSelection: (selection: Set<string>) => void;
  setLocalSortBy: (sortBy: SftpSortState) => void;
  setRemoteSortBy: (sortBy: SftpSortState) => void;
  setLoading: (pane: SftpPane, loading: boolean) => void;
  setError: (pane: SftpPane, error: string | null) => void;
  back: (pane: SftpPane) => void;
  forward: (pane: SftpPane) => void;
}

function pushHistory(
  history: string[],
  historyIndex: number,
  nextPath: string
): { history: string[]; historyIndex: number } {
  const normalized = nextPath.trim();
  const current = history[historyIndex];
  if (current === normalized) {
    return { history, historyIndex };
  }

  const nextHistory = history.slice(0, historyIndex + 1);
  nextHistory.push(normalized);
  return {
    history: nextHistory,
    historyIndex: nextHistory.length - 1
  };
}

function moveHistory(
  history: string[],
  historyIndex: number,
  offset: number
): { path: string; historyIndex: number } | null {
  const nextIndex = historyIndex + offset;
  if (nextIndex < 0 || nextIndex >= history.length) {
    return null;
  }

  return {
    path: history[nextIndex] ?? history[historyIndex] ?? "",
    historyIndex: nextIndex
  };
}

function inferOperation(command: string): string {
  if (/fsTrash|sftpDelete/i.test(command)) return "Delete";
  if (/transferStart\(upload/i.test(command)) return "Upload";
  if (/transferStart\(download/i.test(command)) return "Download";
  if (/Rename/i.test(command)) return "Rename";
  if (/Mkdir/i.test(command)) return "Create folder";
  return "Command";
}

function navigateHistory(
  state: SftpStoreState,
  pane: SftpPane,
  offset: number
): SftpStoreState | Partial<SftpStoreState> {
  const isLocal = pane === "local";
  const moved = moveHistory(
    isLocal ? state.localHistory : state.remoteHistory,
    isLocal ? state.localHistoryIndex : state.remoteHistoryIndex,
    offset
  );
  if (!moved) {
    return state;
  }

  return isLocal
    ? { localPath: moved.path, localHistoryIndex: moved.historyIndex }
    : { remotePath: moved.path, remoteHistoryIndex: moved.historyIndex };
}

export function createSftpStore(sftpSessionId: string, initialRemotePath = "/"): StoreApi<SftpStoreState> {
  return createStore<SftpStoreState>()((set, get) => ({
    sftpSessionId,
    localPath: "",
    remotePath: initialRemotePath,
    localEntries: [],
    remoteEntries: [],
    localSelection: new Set<string>(),
    remoteSelection: new Set<string>(),
    localSortBy: { column: "name", direction: "asc" },
    remoteSortBy: { column: "name", direction: "asc" },
    localHistory: [],
    remoteHistory: [initialRemotePath],
    localHistoryIndex: -1,
    remoteHistoryIndex: 0,
    activePane: "local" as SftpPane,
    localCursorIndex: 0,
    remoteCursorIndex: 0,
    localFilterText: "",
    remoteFilterText: "",
    filterCaseSensitive: false,
    filterRegex: false,
    isLoading: { local: false, remote: false },
    error: { local: null, remote: null },
    operationLogs: [],
    undoActions: [],

    recordOperation: (command, result, success, operation, undoData) =>
      set((state) => ({
        operationLogs: [
          { id: crypto.randomUUID(), timestamp: Date.now(), operation: operation ?? inferOperation(command), command, result, success, ...(undoData ? { undoData } : {}) },
          ...state.operationLogs
        ]
      })),

    registerUndo: (action) =>
      set((state) => ({ undoActions: [...state.undoActions, action].slice(-50) })),

    peekUndo: () => get().undoActions.at(-1),
    removeUndo: (id) =>
      set((state) => ({ undoActions: state.undoActions.filter((action) => action.id !== id) })),

    clearOperationLogs: () => set({ operationLogs: [] }),
    setOperationLogs: (operationLogs) => set({ operationLogs }),

    setActivePane: (pane) => set({ activePane: pane }),

    setCursorIndex: (pane, index) =>
      set(pane === "local" ? { localCursorIndex: index } : { remoteCursorIndex: index }),

    setFilterText: (pane, text) =>
      set(pane === "local" ? { localFilterText: text } : { remoteFilterText: text }),

    setFilterCaseSensitive: (value) => set({ filterCaseSensitive: value }),
    setFilterRegex: (value) => set({ filterRegex: value }),

    setLocalPath: (path) =>
      set((state) => {
        const { history, historyIndex } = pushHistory(
          state.localHistory,
          state.localHistoryIndex,
          path
        );

        return {
          localPath: path.trim(),
          localHistory: history,
          localHistoryIndex: historyIndex,
          localCursorIndex: 0,
          localFilterText: ""
        };
      }),

    setRemotePath: (path) =>
      set((state) => {
        const { history, historyIndex } = pushHistory(
          state.remoteHistory,
          state.remoteHistoryIndex,
          path
        );

        return {
          remotePath: path.trim(),
          remoteHistory: history,
          remoteHistoryIndex: historyIndex,
          remoteCursorIndex: 0,
          remoteFilterText: ""
        };
      }),

    setLocalEntries: (entries) => set({ localEntries: [...entries] }),
    setRemoteEntries: (entries) => set({ remoteEntries: [...entries] }),

    setLocalSelection: (selection) =>
      set({ localSelection: new Set(selection) }),

    setRemoteSelection: (selection) =>
      set({ remoteSelection: new Set(selection) }),

    setLocalSortBy: (sortBy) => set({ localSortBy: { ...sortBy } }),
    setRemoteSortBy: (sortBy) => set({ remoteSortBy: { ...sortBy } }),

    setLoading: (pane, loading) =>
      set((state) => ({
        isLoading: { ...state.isLoading, [pane]: loading }
      })),

    setError: (pane, error) =>
      set((state) => ({
        error: { ...state.error, [pane]: error }
      })),

    back: (pane) => set((state) => navigateHistory(state, pane, -1)),

    forward: (pane) => set((state) => navigateHistory(state, pane, 1))
  }));
}

const sftpStores = new Map<string, StoreApi<SftpStoreState>>();

export function getSftpStore(sftpSessionId: string, initialRemotePath = "/"): StoreApi<SftpStoreState> {
  const existing = sftpStores.get(sftpSessionId);
  if (existing) {
    return existing;
  }

  const store = createSftpStore(sftpSessionId, initialRemotePath);
  sftpStores.set(sftpSessionId, store);
  return store;
}

export function disposeSftpStore(sftpSessionId: string): void {
  sftpStores.delete(sftpSessionId);
}

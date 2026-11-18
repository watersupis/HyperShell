import { create } from "zustand";

type RecordingState = {
  libraryOpen: boolean;
  playbackRecordingId: string | null;
  activeSessionIds: ReadonlySet<string>;
  openLibrary: () => void;
  closeLibrary: () => void;
  play: (recordingId: string) => void;
  closePlayback: () => void;
  setSessionActive: (sessionId: string, active: boolean) => void;
};

export const useRecordingStore = create<RecordingState>((set) => ({
  libraryOpen: false,
  playbackRecordingId: null,
  activeSessionIds: new Set(),
  openLibrary: () => set({ libraryOpen: true }),
  closeLibrary: () => set({ libraryOpen: false }),
  play: (recordingId) => set({ libraryOpen: false, playbackRecordingId: recordingId }),
  closePlayback: () => set({ playbackRecordingId: null }),
  setSessionActive: (sessionId, active) => set((state) => {
    const activeSessionIds = new Set(state.activeSessionIds);
    if (active) activeSessionIds.add(sessionId);
    else activeSessionIds.delete(sessionId);
    return { activeSessionIds };
  }),
}));

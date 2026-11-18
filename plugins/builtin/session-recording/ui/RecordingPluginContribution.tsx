import { lazy, Suspense } from "react";
import { useRecordingStore } from "./recordingStore";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

const RecordingBrowserDialog = lazy(() =>
  import("./RecordingBrowserDialog").then((module) => ({ default: module.RecordingBrowserDialog }))
);
const RecordingPlaybackDialog = lazy(() =>
  import("./RecordingPlaybackDialog").then((module) => ({ default: module.RecordingPlaybackDialog }))
);

export function RecordingPluginContribution({ host }: { host: PluginUiHostServices }) {
  const libraryOpen = useRecordingStore((state) => state.libraryOpen);
  const playbackRecordingId = useRecordingStore((state) => state.playbackRecordingId);
  const closeLibrary = useRecordingStore((state) => state.closeLibrary);
  const play = useRecordingStore((state) => state.play);
  const closePlayback = useRecordingStore((state) => state.closePlayback);

  return (
    <Suspense fallback={null}>
      <RecordingBrowserDialog
        open={libraryOpen}
        onClose={closeLibrary}
        onPlay={play}
        host={host}
      />
      <RecordingPlaybackDialog
        open={playbackRecordingId !== null}
        recordingId={playbackRecordingId}
        onClose={closePlayback}
        host={host}
      />
    </Suspense>
  );
}

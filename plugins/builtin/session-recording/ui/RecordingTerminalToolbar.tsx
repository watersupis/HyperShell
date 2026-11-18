import { useEffect } from "react";
import { toast } from "sonner";
import type { PluginTerminalToolbarProps } from "@hypershell/plugin-api";
import { usePluginI18n } from "@hypershell/plugin-sdk";
import { useRecordingStore } from "./recordingStore";

export function RecordingTerminalToolbar({ session, host }: PluginTerminalToolbarProps) {
  const { t } = usePluginI18n(host);
  const recordingActive = useRecordingStore((state) => state.activeSessionIds.has(session.sessionId));
  const setSessionActive = useRecordingStore((state) => state.setSessionActive);
  useEffect(() => {
    let cancelled = false;
    void host.recordings.getState({ sessionId: session.sessionId }).then((state) => {
      if (!cancelled) setSessionActive(session.sessionId, state.active);
    }).catch(() => {
      if (!cancelled) setSessionActive(session.sessionId, false);
    });
    return () => { cancelled = true; };
  }, [host, session.sessionId, setSessionActive]);

  const toggleRecording = async () => {
    try {
      if (recordingActive) {
        await host.recordings.stop({ sessionId: session.sessionId });
        setSessionActive(session.sessionId, false);
        toast.success(t("Session recording stopped"));
      } else {
        await host.recordings.start({
          sessionId: session.sessionId,
          hostId: session.hostId,
          sessionName: session.title,
          title: session.title,
          width: session.width,
          height: session.height,
        });
        setSessionActive(session.sessionId, true);
        toast.success(t("Session recording started"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Recording failed"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void toggleRecording()}
        className={`grid h-6 w-6 place-items-center rounded transition-colors ${recordingActive ? "text-red-400 hover:text-red-300" : "text-text-muted hover:text-text-primary"}`}
        title={t(recordingActive ? "Current session is recording" : "Start recording")}
        aria-label={t(recordingActive ? "Current session is recording" : "Start recording")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <circle cx="7" cy="7" r={recordingActive ? 5.5 : 4.5} />
        </svg>
      </button>
    </>
  );
}

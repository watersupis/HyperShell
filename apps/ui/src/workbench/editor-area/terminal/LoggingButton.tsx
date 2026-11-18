import { useEffect, useState } from "react";
import { getShell } from "../../shared/shell";
import { toast } from "sonner";
import { useI18n } from "../../shared/i18n";

export interface LoggingButtonProps {
  sessionId: string;
  sessionName: string;
}

export function LoggingButton({ sessionId, sessionName }: LoggingButtonProps) {
  const { t } = useI18n();
  const [loggingActive, setLoggingActive] = useState(false);

  useEffect(() => {
    getShell().loggingGetState({ sessionId }).then((state) => {
      setLoggingActive(state.active);
    }).catch(() => {
      setLoggingActive(false);
    });

  }, [sessionId]);

  const toggleLogging = async () => {
    try {
      if (loggingActive) {
        await getShell().loggingStop({ sessionId });
        setLoggingActive(false);
        toast.success(t("Session text logging stopped"));
      } else {
        await getShell().loggingStart({ sessionId, sessionName });
        setLoggingActive(true);
        toast.success(t("Session text logging started"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Text logging failed"));
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => void toggleLogging()}
          className={`p-1 rounded transition-colors ${
            loggingActive ? "text-yellow-300 hover:text-yellow-200" : "text-text-muted hover:text-text-primary"
          }`}
          title={t(loggingActive ? "Stop text logging" : "Start text logging")}
          aria-label={t(loggingActive ? "Stop text logging" : "Start text logging")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 3.25h8M2 6h8M2 8.75h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

      </div>
    </>
  );
}

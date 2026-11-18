interface TerminalReconnectOverlayProps {
  state: string;
}

export function TerminalReconnectOverlay({ state }: TerminalReconnectOverlayProps) {
  if (state === "connected" || state === "connecting" || state === "disconnected" || state === "failed") {
    return null;
  }

  const content = (() => {
    switch (state) {
      case "waiting_for_network":
        return (
          <>
            <svg className="w-8 h-8 text-amber-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-sm font-medium text-text-primary">Offline</div>
            <div className="text-xs text-text-muted mt-1">Waiting for network...</div>
          </>
        );
      case "reconnecting":
        return (
          <>
            <svg className="w-8 h-8 text-accent animate-spin mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
            </svg>
            <div className="text-sm font-medium text-text-primary">Reconnecting...</div>
          </>
        );
      default:
        return null;
    }
  })();

  if (!content) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center text-center p-6">
        {content}
      </div>
    </div>
  );
}

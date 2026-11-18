export interface ConptyResizeScheduler {
  schedule(sessionId: string, cols: number, rows: number): void;
  dispose(): void;
}

export function createConptyResizeScheduler(
  resize: (sessionId: string, cols: number, rows: number) => void,
  delayMs = 120
): ConptyResizeScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  return {
    schedule(sessionId, cols, rows) {
      if (disposed) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!disposed) resize(sessionId, cols, rows);
      }, delayMs);
    },
    dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }
  };
}

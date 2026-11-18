export interface SessionOutputObserver {
  onSessionData(sessionId: string, data: string): void;
  onSessionClosed(sessionId: string): void;
}

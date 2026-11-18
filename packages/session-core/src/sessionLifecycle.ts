import type {
  SessionTransportEvent,
  SessionTransportKind,
} from "./transports/transportEvents";

export interface SessionLifecycleEvent {
  transport?: SessionTransportKind;
  profileId?: string;
  event: SessionTransportEvent;
}

export type SessionLifecycleListener = (event: SessionLifecycleEvent) => void;

export interface SessionRecoveryData {
  title?: string;
  pluginData?: Record<string, unknown>;
}

export type SessionRecoveryDataProvider = (
  sessionId: string,
  profileId: string
) => SessionRecoveryData | undefined;

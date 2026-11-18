import type { SessionTransportKind } from "@hypershell/session-core";
import type {
  SessionLifecycleEvent,
  SessionLifecycleListener,
  SessionRecoveryData,
  SessionRecoveryDataProvider,
  SessionTransportEvent,
  SessionManager,
} from "@hypershell/session-core";

const listeners = new Set<SessionLifecycleListener>();
const recoveryProviders = new Map<SessionTransportKind, SessionRecoveryDataProvider>();

export function registerSessionLifecycleListener(
  listener: SessionLifecycleListener
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishSessionLifecycleEvent(
  manager: SessionManager,
  event: SessionTransportEvent
): void {
  const sessionId = "sessionId" in event ? event.sessionId : undefined;
  const input = sessionId ? manager.getSessionInput(sessionId) : undefined;
  const transport = input?.transport ?? (sessionId ? manager.getSession(sessionId)?.transport : undefined);
  const lifecycleEvent: SessionLifecycleEvent = {
    event,
    transport,
    ...(input ? { profileId: input.profileId } : {}),
  };

  for (const listener of listeners) {
    listener(lifecycleEvent);
  }
}

export function registerSessionRecoveryDataProvider(
  transport: SessionTransportKind,
  provider: SessionRecoveryDataProvider
): () => void {
  if (recoveryProviders.has(transport)) {
    throw new Error(`Session recovery data provider already registered for: ${transport}`);
  }

  recoveryProviders.set(transport, provider);
  return () => {
    if (recoveryProviders.get(transport) === provider) {
      recoveryProviders.delete(transport);
    }
  };
}

export function getSessionRecoveryData(
  transport: SessionTransportKind,
  sessionId: string,
  profileId: string
): SessionRecoveryData {
  return recoveryProviders.get(transport)?.(sessionId, profileId) ?? {};
}

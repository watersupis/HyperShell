import type { SessionLifecycleEvent, SessionLifecycleListener } from "@hypershell/session-core";
import type { ConnectionHistoryRepository } from "./connectionHistoryRepository";

export interface SshConnectionHistoryServices {
  repository: ConnectionHistoryRepository;
  findHost: (profileId: string) => { id: string } | null;
}

export function createSshConnectionHistoryListener(
  services: SshConnectionHistoryServices
): SessionLifecycleListener {
  const activeRecords = new Map<string, string>();
  const recordedFailures = new Set<string>();
  const errorMessages = new Map<string, string>();

  const hostIdFor = (profileId: string | undefined): string | null => {
    if (!profileId) return null;
    return services.findHost(profileId)?.id ?? null;
  };

  const recordFailure = (sessionId: string, profileId: string | undefined, message?: string) => {
    if (activeRecords.has(sessionId) || recordedFailures.has(sessionId)) return;
    const hostId = hostIdFor(profileId);
    if (!hostId) return;
    services.repository.record(hostId, false, message ?? errorMessages.get(sessionId));
    recordedFailures.add(sessionId);
  };

  return ({ transport, profileId, event }: SessionLifecycleEvent) => {
    if (transport !== "ssh" || !("sessionId" in event)) return;
    const { sessionId } = event;

    if (event.type === "status") {
      if (event.state === "connected") {
        const hostId = hostIdFor(profileId);
        if (!hostId) return;
        const previousRecordId = activeRecords.get(sessionId);
        if (previousRecordId) services.repository.markDisconnected(previousRecordId);
        const record = services.repository.record(hostId, true);
        activeRecords.set(sessionId, record.id);
        recordedFailures.delete(sessionId);
        errorMessages.delete(sessionId);
      } else if (event.state === "failed") {
        recordFailure(sessionId, profileId);
      }
      return;
    }

    if (event.type === "error") {
      errorMessages.set(sessionId, event.message);
      recordFailure(sessionId, profileId, event.message);
      return;
    }

    if (event.type === "exit") {
      const recordId = activeRecords.get(sessionId);
      if (recordId) services.repository.markDisconnected(recordId);
      activeRecords.delete(sessionId);
      recordedFailures.delete(sessionId);
      errorMessages.delete(sessionId);
    }
  };
}

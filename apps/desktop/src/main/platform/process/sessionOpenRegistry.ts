import type { OpenSessionRequest } from "@hypershell/shared";
import type {
  SessionOpenPreparation,
  SessionOpenPreparer,
  SessionTransportKind,
} from "@hypershell/session-core";

const preparers = new Map<SessionTransportKind, SessionOpenPreparer>();

export function registerSessionOpenPreparer(
  transport: SessionTransportKind,
  preparer: SessionOpenPreparer
): () => void {
  if (preparers.has(transport)) {
    throw new Error(`A session open preparer is already registered for: ${transport}`);
  }

  preparers.set(transport, preparer);

  return () => {
    if (preparers.get(transport) === preparer) {
      preparers.delete(transport);
    }
  };
}

export async function prepareSessionOpen(
  request: OpenSessionRequest
): Promise<SessionOpenPreparation> {
  return await preparers.get(request.transport)?.(request) ?? {};
}

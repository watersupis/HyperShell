import type { OpenSessionRequest, OpenSessionResponse } from "@hypershell/shared";
import type { OpenSessionInput } from "./sessionManager";

export interface SessionOpenPreparation {
  input?: Partial<OpenSessionInput>;
  response?: Partial<OpenSessionResponse>;
}

export type SessionOpenPreparer = (
  request: OpenSessionRequest
) => SessionOpenPreparation | Promise<SessionOpenPreparation>;

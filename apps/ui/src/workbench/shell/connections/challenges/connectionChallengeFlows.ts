import type { TmuxSessionInfo } from "@hypershell/shared";
import type { KeyboardInteractiveRequest } from "@hypershell/plugin-api";

import { getShell } from "../../../shared/shell";
import type { PluginHostContext } from "@hypershell/plugin-api";
import { useConnectionChallengeStore } from "./connectionChallengeStore";

const challenges = () => useConnectionChallengeStore.getState();

/**
 * Relay a keyboard-interactive (2FA) request to the user and answer main.
 * Cancel sends one empty string per prompt so the server rejects auth cleanly.
 */
export async function answerKeyboardInteractive(request: KeyboardInteractiveRequest): Promise<void> {
  const answer = await challenges().raise({ kind: "keyboard-interactive", request });
  if (answer) {
    challenges().settle();
  }
  const responses = answer?.responses ?? request.prompts.map(() => "");
  await getShell().keyboardInteractiveRespond({ requestId: request.requestId, responses });
}

/**
 * Ask which detected tmux session to attach to. Resolves `{ attachTo: name }`,
 * `{ attachTo: null }` for a plain connection, or `null` when superseded —
 * then the caller opens nothing.
 */
export async function pickTmuxSession(
  host: PluginHostContext,
  sessions: TmuxSessionInfo[]
): Promise<{ attachTo: string | null } | null> {
  const answer = await challenges().raise({ kind: "tmux-sessions", host, sessions });
  if (!answer) {
    return null;
  }
  challenges().settle();
  return { attachTo: answer.attachTo };
}

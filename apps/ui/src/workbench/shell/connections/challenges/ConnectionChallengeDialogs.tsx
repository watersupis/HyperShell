import { HostKeyVerificationDialog } from "./HostKeyVerificationDialog";
import { KeyboardInteractiveDialog } from "./KeyboardInteractiveDialog";
import { TmuxSessionPicker } from "../../../editor-area/TmuxSessionPicker";
import { CredentialsChallengeDialog } from "./CredentialsChallengeDialog";
import { useConnectionChallengeStore } from "./connectionChallengeStore";

/**
 * Renders whichever connection challenge is currently raised. Mounted once in
 * App — the dialogs read the challenge store instead of App threading a
 * useState pair per dialog field.
 */
export function ConnectionChallengeDialogs() {
  const challenge = useConnectionChallengeStore((s) => s.challenge);
  const busy = useConnectionChallengeStore((s) => s.busy);
  const answer = useConnectionChallengeStore((s) => s.answer);
  const cancel = useConnectionChallengeStore((s) => s.cancel);

  const credentials = challenge?.kind === "credentials" ? challenge : null;
  const hostKey = challenge?.kind === "host-key" ? challenge : null;
  const keyboardInteractive = challenge?.kind === "keyboard-interactive" ? challenge : null;
  const tmux = challenge?.kind === "tmux-sessions" ? challenge : null;

  return (
    <>
      <CredentialsChallengeDialog
        open={credentials != null}
        host={credentials?.host ?? null}
        initialUsername={credentials?.username ?? ""}
        error={credentials?.error ?? null}
        submitting={credentials != null && busy}
        onSubmit={(username, password) => answer({ kind: "credentials", username, password })}
        onCancel={cancel}
      />
      <HostKeyVerificationDialog
        open={hostKey != null}
        info={hostKey?.info ?? null}
        onTrust={() => answer({ kind: "host-key", trust: true })}
        onReject={cancel}
      />
      <KeyboardInteractiveDialog
        request={keyboardInteractive?.request ?? null}
        onSubmit={(_requestId, responses) => answer({ kind: "keyboard-interactive", responses })}
        onCancel={cancel}
      />
      <TmuxSessionPicker
        open={tmux != null}
        sessions={tmux?.sessions ?? []}
        hostName={tmux?.host.name ?? ""}
        onAttach={(sessionName) => answer({ kind: "tmux-sessions", attachTo: sessionName })}
        onSkip={() => answer({ kind: "tmux-sessions", attachTo: null })}
      />
    </>
  );
}

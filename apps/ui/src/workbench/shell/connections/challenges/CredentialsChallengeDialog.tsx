import { useEffect, useRef, useState } from "react";

import { Modal } from "../../../shared/Modal";
import type { PluginHostContext } from "@hypershell/plugin-api";

interface CredentialsChallengeDialogProps {
  open: boolean;
  host: PluginHostContext | null;
  initialUsername: string;
  error: string | null;
  submitting: boolean;
  onSubmit: (username: string, password: string) => void;
  onCancel: () => void;
}

/** Generic username/password prompt raised by a connection flow. */
export function CredentialsChallengeDialog({
  open,
  host,
  initialUsername,
  error,
  submitting,
  onSubmit,
  onCancel,
}: CredentialsChallengeDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Reset the fields only when the dialog opens — a failed attempt re-raises
  // the challenge while the dialog stays open, and must not wipe what the
  // user typed.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setUsername(initialUsername);
      setPassword("");
    }
    wasOpen.current = open;
  }, [open, initialUsername]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={host ? `Credentials: ${host.name}` : "Credentials"}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(username, password);
        }}
      >
        {host ? (
          <p className="text-xs text-text-muted">
            Connect to `{host.hostname}:{host.port}`
          </p>
        ) : null}

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright"
            autoComplete="username"
            disabled={submitting}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Password / Key Passphrase</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright"
            autoComplete="current-password"
            disabled={submitting}
          />
        </label>

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-border bg-base-700/60 px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-accent/15 border border-accent/30 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/25 hover:border-accent/40 disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Connecting..." : "Continue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

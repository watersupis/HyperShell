import { useEffect, useState } from "react";
import type { PluginSessionOpenPromptProps } from "@hypershell/plugin-api";

import {
  CLAUDE_SESSION_INFO_METHOD,
  claudeSessionInfoResponseSchema,
} from "../contracts";
import { formatLastActive } from "./claudeResumeTime";

interface SessionInfo {
  title: string | null;
  lastActiveAt: string;
}

/** Offers a resume choice for Local Terminal session data owned by this plugin. */
export function ClaudeResumePrompt({
  sessionOpenData,
  onResume,
  onFresh,
  host,
}: PluginSessionOpenPromptProps) {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const pluginData = sessionOpenData["local-terminal"];
  const sessionId = pluginData && typeof pluginData === "object"
    ? (pluginData as Record<string, unknown>).claudeSessionId
    : undefined;

  useEffect(() => {
    let cancelled = false;
    if (typeof sessionId !== "string" || !sessionId || !host.isAvailable()) {
      onFresh();
      return;
    }

    void host.pluginMain.invoke("local-terminal", CLAUDE_SESSION_INFO_METHOD, { sessionId })
      .then((result) => claudeSessionInfoResponseSchema.parse(result))
      .then((result) => {
        if (cancelled) return;
        if (!result.info) {
          onFresh();
          return;
        }
        setInfo({ title: result.info.title, lastActiveAt: result.info.lastActiveAt });
      })
      .catch(() => {
        if (!cancelled) onFresh();
      });

    return () => {
      cancelled = true;
    };
  }, [host, onFresh, sessionId]);

  if (!info) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-base-900/80 backdrop-blur-sm">
      <div className="max-w-sm rounded-lg border border-border bg-base-800 p-4 shadow-lg">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Claude session
        </p>
        <p className="mt-2 text-sm text-text-primary">
          {info.title ?? "Untitled session"}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          last active {formatLastActive(info.lastActiveAt)}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Resume it
          </button>
          <button
            type="button"
            onClick={onFresh}
            className="flex-1 rounded-md border border-border bg-base-700 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-base-600 hover:text-text-primary"
          >
            Fresh shell
          </button>
        </div>
      </div>
    </div>
  );
}

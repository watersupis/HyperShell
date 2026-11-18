import { useCallback, useEffect, useRef, useState, type ComponentType, type DragEvent, type ReactNode } from "react";
import { useStore } from "zustand";
import type { PluginSessionOpenPromptProps } from "@hypershell/plugin-api";

import { extractDroppedPaths, formatPathsForTerminal } from "./droppedFilePaths";
import { getShell } from "../../shared/shell";
import { useTerminalSession } from "./useTerminalSession";
import { TerminalReconnectOverlay } from "./TerminalReconnectOverlay";
import { TerminalSearchBar } from "./TerminalSearchBar";
import { LoggingButton } from "./LoggingButton";
import { settingsStore } from "../../shell/settings/settingsStore";
import { useRecordingStore } from "../../../../../../plugins/builtin/session-recording/ui/recordingStore";

export interface TerminalToolbarSession {
  sessionId: string;
  transport: "ssh" | "serial" | "telnet" | "local";
  profileId: string;
  hostId: string | null;
  title: string;
  workingDirectory: string | null;
  width: number;
  height: number;
  setSignals(signals: { dtr?: boolean; rts?: boolean }): Promise<void>;
}

export interface TerminalPaneProps {
  transport: "ssh" | "serial" | "telnet" | "local";
  profileId: string;
  sessionName?: string;
  sessionId?: string;
  autoConnect?: boolean;
  isVisible?: boolean;
  isActivePane?: boolean;
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  tmuxAttachTarget?: string;
  sessionOpenData?: Record<string, unknown>;
  sessionOpenPrompt?: ComponentType<PluginSessionOpenPromptProps>;
  sessionOpenPromptHost: PluginSessionOpenPromptProps["host"];
  fontSize: number;
  onFontSizeChange: (fontSize: number) => void;
  onSessionOpened?: (sessionId: string) => void;
  onPluginData?: (sessionId: string, pluginId: string, data: Record<string, unknown> | null) => void;
  onProcessExit?: (exitCode: number | null) => void;
  renderToolbar?: (session: TerminalToolbarSession) => ReactNode;
}

export function TerminalPane({
  transport,
  profileId,
  sessionName,
  sessionId,
  autoConnect,
  isVisible = true,
  isActivePane = false,
  telnetOptions,
  tmuxAttachTarget,
  sessionOpenData,
  sessionOpenPrompt: SessionOpenPrompt,
  sessionOpenPromptHost,
  fontSize,
  onFontSizeChange,
  onSessionOpened,
  onPluginData,
  onProcessExit,
  renderToolbar,
}: TerminalPaneProps) {
  const [dropActive, setDropActive] = useState(false);
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const autoRecordSessions = useStore(settingsStore, (state) => state.settings.terminal.autoRecordSessions);
  const autoRecordingSessionIds = useRef(new Set<string>());
  // A restored session may require a plugin-owned reconnect choice before launch.
  const [resumeChoice, setResumeChoice] = useState<"pending" | "resume" | "fresh">(
    sessionOpenData && SessionOpenPrompt ? "pending" : "fresh"
  );
  const chooseResume = useCallback(() => setResumeChoice("resume"), []);
  const chooseFresh = useCallback(() => setResumeChoice("fresh"), []);
  const session = useTerminalSession({
    transport,
    profileId,
    sessionId,
    // Hold the launch until the user has answered the resume prompt.
    autoConnect: resumeChoice === "pending" ? false : autoConnect,
    telnetOptions,
    tmuxAttachTarget,
    sessionOpenData: resumeChoice === "resume" ? sessionOpenData : undefined,
    fontSize,
    onFontSizeChange,
    onSessionOpened,
    onPluginData,
    onWorkingDirectoryChange: setWorkingDirectory,
    onExit: onProcessExit
  });
  const {
    fit,
    focusTerminal,
    terminal,
    commandSuggestions,
    selectedCommandSuggestion,
    selectCommandSuggestion,
    acceptCommandSuggestion,
  } = session;

  useEffect(() => {
    if (!autoRecordSessions || session.state !== "connected" || !session.sessionId) return;
    const currentSessionId = session.sessionId;
    if (autoRecordingSessionIds.current.has(currentSessionId)) return;
    autoRecordingSessionIds.current.add(currentSessionId);
    void getShell().recordingGetState({ sessionId: currentSessionId }).then(async (state) => {
      if (state.active) {
        useRecordingStore.getState().setSessionActive(currentSessionId, true);
        return;
      }
      await getShell().recordingStart({
        sessionId: currentSessionId,
        hostId: transport === "ssh" ? profileId : null,
        sessionName: sessionName || `${transport} ${profileId}`,
        title: sessionName || `${transport.toUpperCase()} ${profileId}`,
        width: session.terminal?.cols ?? 80,
        height: session.terminal?.rows ?? 24,
      });
      useRecordingStore.getState().setSessionActive(currentSessionId, true);
    }).catch(() => {
      autoRecordingSessionIds.current.delete(currentSessionId);
    });
  }, [autoRecordSessions, profileId, session.sessionId, session.state, session.terminal, sessionName, transport]);

  useEffect(() => {
    if (!isVisible || !terminal) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      fit();
      if (isActivePane) focusTerminal();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [fit, focusTerminal, isActivePane, isVisible, terminal]);

  // Dropping a file inserts its path as terminal input, like Windows Terminal.
  const canAcceptDrop = session.state === "connected" && Boolean(session.sessionId);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canAcceptDrop) {
      return;
    }

    // Required: without preventDefault here the drop event never fires.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Ignore the dragleave fired when crossing into xterm's own child nodes.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setDropActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canAcceptDrop) {
      return;
    }

    event.preventDefault();
    setDropActive(false);

    const paths = extractDroppedPaths(event.dataTransfer);
    if (paths.length === 0) {
      return;
    }

    session.write(formatPathsForTerminal(paths));
    focusTerminal();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className={`flex-1 min-h-0 relative ${dropActive ? "ring-2 ring-inset ring-accent/50" : ""}`}
        style={{ backgroundColor: "var(--terminal-bg, var(--color-surface))" }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          ref={session.containerRef}
          className="absolute inset-0"
        />
        {commandSuggestions.length > 0 && (
          <div
            role="listbox"
            aria-label="Command suggestions"
            className="absolute bottom-3 left-3 z-30 max-h-[40%] w-[min(32rem,calc(100%-1.5rem))] overflow-auto rounded border border-border bg-base-800 shadow-lg"
          >
            {commandSuggestions.slice(0, 8).map((suggestion, index) => (
              <button
                key={`${suggestion.command}-${index}`}
                type="button"
                role="option"
                aria-selected={selectedCommandSuggestion === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => selectCommandSuggestion(index)}
                onClick={() => {
                  selectCommandSuggestion(index);
                  acceptCommandSuggestion();
                }}
                className={`block w-full border-b border-border/60 px-3 py-1.5 text-left last:border-b-0 ${selectedCommandSuggestion === index ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-base-700"}`}
              >
                <code className="block truncate text-xs">{suggestion.command}</code>
                {suggestion.description && <span className="block truncate text-[10px] text-text-muted">{suggestion.description}</span>}
              </button>
            ))}
          </div>
        )}
        {session.searchVisible && (
          <TerminalSearchBar
            searchAddon={session.searchAddon}
            onClose={() => session.setSearchVisible(false)}
            onFocusTerminal={session.focusTerminal}
          />
        )}
        <TerminalReconnectOverlay state={session.state} />
        {resumeChoice === "pending" && sessionOpenData && SessionOpenPrompt && (
          <SessionOpenPrompt
            sessionOpenData={sessionOpenData}
            onResume={chooseResume}
            onFresh={chooseFresh}
            host={sessionOpenPromptHost}
          />
        )}
        {session.sessionId && session.state === "connected" && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-base-800/80 rounded px-1.5 py-0.5 backdrop-blur-sm border border-border/30">
            <LoggingButton
              sessionId={session.sessionId}
              sessionName={sessionName || `${transport} ${profileId}`}
            />
            {renderToolbar?.({
              sessionId: session.sessionId,
              transport,
              profileId,
              hostId: transport === "ssh" ? profileId : null,
              title: sessionName || `${transport.toUpperCase()} ${profileId}`,
              workingDirectory,
              width: session.terminal?.cols ?? 80,
              height: session.terminal?.rows ?? 24,
              setSignals: (signals) => getShell().setSessionSignals({ sessionId: session.sessionId!, signals }),
            })}
          </div>
        )}
      </div>
    </div>
  );
}

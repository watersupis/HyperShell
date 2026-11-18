import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useStore } from "zustand";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { SessionEvent } from "@hypershell/shared";
import { getShell, hasShell } from "../../shared/shell";
import { localizationStore, translate } from "../../shared/i18n";

import { getActiveInputRelayTargets, sessionInputRouterStore } from "../../plugin-runtime/sessionInputRouter";
import { layoutStore } from "../layoutStore";
import { sessionStateStore } from "../sessionStateStore";
import {
  normalizeTerminalFontSize,
  settingsStore,
} from "../../shell/settings/settingsStore";
import { getTerminalOptions } from "./terminalTheme";
import { getTerminalClipboardAction, getTerminalRightClickAction } from "./terminalClipboard";
import {
  getNextTerminalFontSize,
  getTerminalFontSizeAction,
} from "./terminalFontSize";
import { TERMINAL_UNICODE_VERSION } from "./terminalUnicode";
import { loadOptionalWebglRenderer } from "./optionalWebglRenderer";
import { installTerminalRepaintGuard } from "./terminalRepaintGuard";
import { createConptyResyncWiggle, type ConptyResyncWiggle } from "./conptyResyncWiggle";
import { createConptyResizeScheduler, type ConptyResizeScheduler } from "./conptyResizeScheduler";
import {
  TERMINAL_FOCUS_REQUEST_EVENT,
  shouldHandleTerminalFocusRequest,
  type TerminalFocusRequestDetail
} from "./terminalFocus";
import {
  createAsyncOperationGuard,
  mapSessionEvent,
  resolveConnectAttempt,
  type TerminalSessionState
} from "./terminalSessionModel";
import { parseOsc7WorkingDirectory, sanitizeTitle } from "./titleSanitizer";
import { loadCommandSuggestions, type CommandLibraryEntry } from "./commandLibrary";

export type { TerminalSessionState } from "./terminalSessionModel";

export interface UseTerminalSessionInput {
  transport: "ssh" | "serial" | "telnet" | "local";
  profileId: string;
  sessionId?: string;
  autoConnect?: boolean;
  telnetOptions?: { hostname: string; port: number; mode: "telnet" | "raw"; terminalType?: string };
  tmuxAttachTarget?: string;
  sessionOpenData?: Record<string, unknown>;
  fontSize: number;
  onFontSizeChange: (fontSize: number) => void;
  onSessionOpened?: (sessionId: string) => void;
  onPluginData?: (sessionId: string, pluginId: string, data: Record<string, unknown> | null) => void;
  onWorkingDirectoryChange?: (path: string) => void;
  onExit?: (exitCode: number | null) => void;
}

export interface UseTerminalSessionResult {
  containerRef: RefObject<HTMLDivElement | null>;
  terminal: Terminal | null;
  searchAddon: SearchAddon | null;
  searchVisible: boolean;
  setSearchVisible: (visible: boolean) => void;
  sessionId: string | null;
  state: TerminalSessionState;
  fontSize: number;
  setFontSize: (fontSize: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetFontSize: () => void;
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  write: (data: string) => void;
  fit: () => void;
  focusTerminal: () => void;
  commandSuggestions: CommandLibraryEntry[];
  selectedCommandSuggestion: number;
  selectCommandSuggestion: (index: number) => void;
  acceptCommandSuggestion: () => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown terminal session error";
}

function logAsyncError(context: string, error: unknown): void {
  console.warn(`[hypershell] ${context}`, error);
}

const terminalSessionStates = new Set<TerminalSessionState>([
  "idle",
  "connecting",
  "connected",
  "reconnecting",
  "waiting_for_network",
  "disconnected",
  "failed",
]);

function isTerminalSessionState(value: string): value is TerminalSessionState {
  return terminalSessionStates.has(value as TerminalSessionState);
}

export function useTerminalSession(
  input: UseTerminalSessionInput
): UseTerminalSessionResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const terminalSettings = useStore(settingsStore, (s) => s.settings.terminal);
  const customThemes = useStore(settingsStore, (s) => s.settings.customThemes);
  const inputRelayRoutes = useStore(
    sessionInputRouterStore,
    (store) => store.routes
  );
  const inputRelayTargets = useMemo(
    () => getActiveInputRelayTargets(inputRelayRoutes),
    [inputRelayRoutes]
  );
  const sessionIdRef = useRef<string | null>(input.sessionId ?? null);
  const fontSizeRef = useRef(input.fontSize);
  const onFontSizeChangeRef = useRef(input.onFontSizeChange);
  const conptyWiggleRef = useRef<ConptyResyncWiggle | null>(null);
  const conptyResizeSchedulerRef = useRef<ConptyResizeScheduler | null>(null);
  const mountedRef = useRef(true);
  const asyncOperationGuardRef = useRef(createAsyncOperationGuard());
  const inputRelayTargetsRef = useRef<string[]>(inputRelayTargets);
  // input.onExit is a fresh closure every render — keep the latest one in a
  // ref rather than depending on it directly, so applySessionEvent (and the
  // onSessionEvent subscription that depends on it) doesn't get recreated on
  // every render.
  const onExitRef = useRef(input.onExit);
  const pendingSessionEventsRef = useRef<SessionEvent[]>([]);
  const eventUnsubscribeRef = useRef<(() => void) | null>(null);
  const tmuxAttachSentRef = useRef(false);
  const commandInputRef = useRef("");
  const commandSuggestionRequestRef = useRef(0);
  const completingSuggestionRef = useRef(false);
  const commandSuggestionsRef = useRef<CommandLibraryEntry[]>([]);
  const selectedCommandSuggestionRef = useRef(0);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [commandSuggestions, setCommandSuggestions] = useState<CommandLibraryEntry[]>([]);
  const [selectedCommandSuggestion, setSelectedCommandSuggestion] = useState(0);
  const [state, setState] = useState<TerminalSessionState>(
    input.sessionId ? "connecting" : "idle"
  );
  const stateRef = useRef<TerminalSessionState>(input.sessionId ? "connecting" : "idle");
  const idleDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectPromptShownRef = useRef(false);
  const reconnectRef = useRef<() => void>(() => {});
  fontSizeRef.current = input.fontSize;
  onFontSizeChangeRef.current = input.onFontSizeChange;
  commandSuggestionsRef.current = commandSuggestions;

  const selectCommandSuggestion = useCallback((index: number): void => {
    const count = commandSuggestionsRef.current.length;
    if (!count) return;
    const selected = (index + count) % count;
    selectedCommandSuggestionRef.current = selected;
    setSelectedCommandSuggestion(selected);
  }, []);

  const acceptCommandSuggestion = useCallback((): void => {
    const suggestion = commandSuggestionsRef.current[selectedCommandSuggestionRef.current];
    if (!suggestion) return;
    const currentInput = commandInputRef.current;
    const completion = suggestion.command.toLowerCase().startsWith(currentInput.toLowerCase())
      ? suggestion.command.slice(currentInput.length)
      : "";
    commandSuggestionRequestRef.current += 1;
    commandSuggestionsRef.current = [];
    setCommandSuggestions([]);
    setSelectedCommandSuggestion(0);
    selectedCommandSuggestionRef.current = 0;
    if (completion) {
      completingSuggestionRef.current = true;
      terminalRef.current?.paste(completion);
    }
    else commandInputRef.current = suggestion.command;
  }, []);

  const applyTerminalBackground = useCallback((background: string): void => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.style.backgroundColor = background;

    const root = container.querySelector(".xterm") as HTMLElement | null;
    if (root) {
      root.style.backgroundColor = background;
    }

    const viewport = container.querySelector(".xterm-viewport") as HTMLElement | null;
    if (viewport) {
      viewport.style.backgroundColor = background;
    }

    // Never set a background on the canvases inside .xterm-screen: the WebGL
    // renderer stacks a transparent link-layer canvas above the text canvas,
    // and an opaque CSS background on that overlay hides every glyph. (With
    // the DOM renderer the selector matched nothing, which is why this used
    // to look harmless.)
  }, []);

  const setStateSafe = useCallback((nextState: TerminalSessionState): void => {
    if (!mountedRef.current) {
      return;
    }

    stateRef.current = nextState;
    setState(nextState);

    if (nextState === "connected") {
      reconnectPromptShownRef.current = false;
    } else if ((nextState === "disconnected" || nextState === "failed") && !reconnectPromptShownRef.current) {
      commandInputRef.current = "";
      commandSuggestionRequestRef.current += 1;
      commandSuggestionsRef.current = [];
      setCommandSuggestions([]);
      const prompt = translate(
        "Connection lost. Press Enter to reconnect.",
        localizationStore.getState().locale
      );
      terminalRef.current?.writeln(`\r\n\x1b[31m${prompt}\x1b[0m`);
      reconnectPromptShownRef.current = true;
    }

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      sessionStateStore.getState().setSessionState(sessionId, nextState);
    }
  }, []);

  const clearIdleDisconnectTimer = useCallback(() => {
    if (idleDisconnectTimerRef.current) {
      clearTimeout(idleDisconnectTimerRef.current);
      idleDisconnectTimerRef.current = null;
    }
  }, []);

  const resetIdleDisconnectTimer = useCallback((targetSessionId = sessionIdRef.current) => {
    clearIdleDisconnectTimer();
    const timeoutMinutes = terminalSettings.idleDisconnectMinutes;
    if (!targetSessionId || stateRef.current !== "connected" || timeoutMinutes <= 0) return;

    idleDisconnectTimerRef.current = setTimeout(() => {
      idleDisconnectTimerRef.current = null;
      if (sessionIdRef.current !== targetSessionId || stateRef.current !== "connected" || !hasShell()) return;
      void getShell().closeSession({ sessionId: targetSessionId }).then(() => {
        if (sessionIdRef.current !== targetSessionId) return;
        setStateSafe("disconnected");
        sessionIdRef.current = null;
      }).catch((error) => {
        if (sessionIdRef.current === targetSessionId) setStateSafe("failed");
        logAsyncError("idle session close failed", error);
      });
    }, timeoutMinutes * 60_000);
  }, [clearIdleDisconnectTimer, setStateSafe, terminalSettings.idleDisconnectMinutes]);

  const writeTerminalError = useCallback((error: unknown): void => {
    if (!mountedRef.current) {
      return;
    }

    terminalRef.current?.writeln(`\r\n[error] ${toErrorMessage(error)}`);
  }, []);

  const writeClipboardText = useCallback(async (text: string): Promise<void> => {
    if (!text || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      logAsyncError("clipboard write failed", error);
    }
  }, []);

  const readClipboardText = useCallback(async (): Promise<string> => {
    if (!navigator.clipboard?.readText) {
      return "";
    }

    try {
      return await navigator.clipboard.readText();
    } catch (error) {
      logAsyncError("clipboard read failed", error);
      return "";
    }
  }, []);

  const setFontSize = useCallback((fontSize: number): void => {
    const normalizedFontSize = normalizeTerminalFontSize(fontSize);
    fontSizeRef.current = normalizedFontSize;
    onFontSizeChangeRef.current(normalizedFontSize);
  }, []);

  const increaseFontSize = useCallback((): void => {
    const nextFontSize = getNextTerminalFontSize(
      "increase",
      fontSizeRef.current,
      settingsStore.getState().settings.terminal.fontSize
    );
    fontSizeRef.current = nextFontSize;
    onFontSizeChangeRef.current(nextFontSize);
  }, []);

  const decreaseFontSize = useCallback((): void => {
    const nextFontSize = getNextTerminalFontSize(
      "decrease",
      fontSizeRef.current,
      settingsStore.getState().settings.terminal.fontSize
    );
    fontSizeRef.current = nextFontSize;
    onFontSizeChangeRef.current(nextFontSize);
  }, []);

  const resetFontSize = useCallback((): void => {
    const nextFontSize = getNextTerminalFontSize(
      "reset",
      fontSizeRef.current,
      settingsStore.getState().settings.terminal.fontSize
    );
    fontSizeRef.current = nextFontSize;
    onFontSizeChangeRef.current(nextFontSize);
  }, []);

  const sendSessionWrite = useCallback((sessionId: string, data: string): void => {
    if (!hasShell()) {
      return;
    }

    void getShell().writeSession({ sessionId, data }).catch((error) => {
      if (sessionId === sessionIdRef.current) {
        writeTerminalError(error);
        setStateSafe("failed");
      }
      logAsyncError("writeSession failed", error);
    });
  }, [setStateSafe, writeTerminalError]);

  const sendSessionResize = useCallback(
    (sessionId: string, cols: number, rows: number): void => {
      if (!hasShell()) {
        return;
      }

      void getShell().resizeSession({ sessionId, cols, rows }).catch((error) => {
        if (sessionId === sessionIdRef.current) {
          writeTerminalError(error);
          setStateSafe("failed");
        }
        logAsyncError("resizeSession failed", error);
      });
    },
    [setStateSafe, writeTerminalError]
  );

  const applySessionEvent = useCallback((event: SessionEvent): void => {
    const effect = mapSessionEvent(sessionIdRef.current, event);
    if (!effect.handled) {
      return;
    }

    if (effect.errorMessage) {
      terminalRef.current?.writeln(`\r\n[error] ${effect.errorMessage}`);
    }

    if (effect.state) {
      setStateSafe(effect.state);
    }

    if (effect.data) {
      resetIdleDisconnectTimer();
    }

    if (effect.state === "connected" && input.tmuxAttachTarget && sessionIdRef.current && !tmuxAttachSentRef.current) {
      tmuxAttachSentRef.current = true;
      const safeName = `'${input.tmuxAttachTarget.replace(/'/g, "'\\''")}'`;
      const cmd = `tmux attach -t ${safeName}\r`;
      void getShell().writeSession({
        sessionId: sessionIdRef.current,
        data: cmd,
      });
    }

    if (effect.clearSessionId) {
      sessionIdRef.current = null;
    }

    if (effect.exitCode !== undefined) {
      onExitRef.current?.(effect.exitCode ?? null);
    }

    if (effect.pluginData && sessionIdRef.current) {
      layoutStore.getState().setTabPluginData(
        sessionIdRef.current,
        effect.pluginData.pluginId,
        effect.pluginData.data
      );
    }

    if (effect.processTitle !== undefined && sessionIdRef.current) {
      layoutStore
        .getState()
        .setTabProcessTitle(
          sessionIdRef.current,
          effect.processTitle === null ? null : sanitizeTitle(effect.processTitle)
        );
    }

    const instance = terminalRef.current;
    if (!instance) {
      return;
    }

    if (effect.data) {
      instance.write(effect.data);
    }

  }, [resetIdleDisconnectTimer, setStateSafe, input.tmuxAttachTarget]);

  useEffect(() => {
    mountedRef.current = true;
    const asyncOperationGuard = asyncOperationGuardRef.current;
    return () => {
      mountedRef.current = false;
      asyncOperationGuard.invalidate();
      clearIdleDisconnectTimer();
      pendingSessionEventsRef.current = [];

      // Clean up event listener if still active
      eventUnsubscribeRef.current?.();
      eventUnsubscribeRef.current = null;

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        sessionStateStore.getState().removeSession(sessionId);
        // Close the session on the main process side
        getShell().closeSession({ sessionId }).catch((error) => {
          logAsyncError("closeSession on unmount failed", error);
        });
        sessionIdRef.current = null;
      }
    };
  }, [clearIdleDisconnectTimer]);

  useEffect(() => {
    if (!input.sessionId) {
      return;
    }

    asyncOperationGuardRef.current.issueToken();
    sessionIdRef.current = input.sessionId;
    // Only set "connecting" if the session hasn't already advanced
    // (e.g. session events may have set "connected" before this effect runs).
    const existing = sessionStateStore.getState().sessions[input.sessionId];
    setStateSafe(existing && isTerminalSessionState(existing.state) ? existing.state : "connecting");
    if (pendingSessionEventsRef.current.length > 0) {
      const queued = pendingSessionEventsRef.current;
      pendingSessionEventsRef.current = [];
      for (const event of queued) {
        applySessionEvent(event);
      }
    }
  }, [applySessionEvent, input.sessionId, setStateSafe]);

  useEffect(() => {
    inputRelayTargetsRef.current = inputRelayTargets;
  }, [inputRelayTargets]);

  useEffect(() => {
    onExitRef.current = input.onExit;
  }, [input.onExit]);

  useEffect(() => {
    let disposed = false;
    let disposeInput: { dispose(): void } | null = null;
    let titleDisposable: { dispose(): void } | null = null;
    let workingDirectoryDisposable: { dispose(): void } | null = null;
    let repaintGuard: { dispose(): void } | null = null;
    let instance: Terminal | null = null;
    let container: HTMLDivElement | null = null;
    let removeFocusListeners: (() => void) | null = null;

    void (async () => {
      const [
        { Terminal: XTerm },
        { FitAddon: FitAddonClass },
        { SearchAddon: SearchAddonClass },
        { UnicodeGraphemesAddon: UnicodeAddonClass }
      ] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-search"),
        import("@xterm/addon-unicode-graphemes")
      ]);
      if (disposed) {
        return;
      }

      const opts = getTerminalOptions({
        ...terminalSettings,
        fontSize: fontSizeRef.current,
        customThemes,
      });
      instance = new XTerm(opts);
      const addon = new FitAddonClass();
      const search = new SearchAddonClass();
      instance.loadAddon(addon);
      instance.loadAddon(search);
      instance.loadAddon(new UnicodeAddonClass());
      instance.unicode.activeVersion = TERMINAL_UNICODE_VERSION;
      fitAddonRef.current = addon;
      searchAddonRef.current = search;
      terminalRef.current = instance;
      setTerminal(instance);
      setSearchAddon(search);

      titleDisposable = instance.onTitleChange((rawTitle) => {
        const sessionId = sessionIdRef.current;
        if (!sessionId) {
          return;
        }
        layoutStore.getState().setTabDynamicTitle(sessionId, sanitizeTitle(rawTitle));
      });
      workingDirectoryDisposable = instance.parser.registerOscHandler(7, (value) => {
        const path = parseOsc7WorkingDirectory(value);
        if (path) input.onWorkingDirectoryChange?.(path);
        return true;
      });

      container = containerRef.current;
      if (container) {
        instance.open(container);
        void loadOptionalWebglRenderer(instance);
        repaintGuard = installTerminalRepaintGuard(instance);
        applyTerminalBackground(opts.theme?.background ?? "#07111f");
        try { addon.fit(); } catch { /* container may not have dimensions yet */ }
        instance.focus();
        instance.writeln("hypershell ready.");

        const focusTerminal = () => {
          instance?.focus();
        };
        container.addEventListener("mousedown", focusTerminal);
        container.addEventListener("touchstart", focusTerminal, { passive: true });

        const handleContextMenu = (event: MouseEvent) => {
          const action = getTerminalRightClickAction({
            hasSelection: instance?.hasSelection() ?? false,
            mouseTrackingActive: (instance?.modes.mouseTrackingMode ?? "none") !== "none"
          });
          if (!action) {
            return;
          }
          event.preventDefault();

          if (action === "copy") {
            const selection = instance?.getSelection() ?? "";
            if (selection) {
              void writeClipboardText(selection);
            }
            instance?.clearSelection();
            return;
          }

          void (async () => {
            const clipboardText = await readClipboardText();
            if (clipboardText) {
              instance?.paste(clipboardText);
            }
          })();
        };
        container.addEventListener("contextmenu", handleContextMenu);

        removeFocusListeners = () => {
          container?.removeEventListener("mousedown", focusTerminal);
          container?.removeEventListener("touchstart", focusTerminal);
          container?.removeEventListener("contextmenu", handleContextMenu);
        };
      }

      const isMacLike = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
      instance.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") {
          return true;
        }

        if (commandSuggestionsRef.current.length > 0) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            selectCommandSuggestion(selectedCommandSuggestionRef.current + (event.key === "ArrowDown" ? 1 : -1));
            return false;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            acceptCommandSuggestion();
            return false;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            commandInputRef.current = "";
            commandSuggestionRequestRef.current += 1;
            commandSuggestionsRef.current = [];
            setCommandSuggestions([]);
            return false;
          }
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            commandInputRef.current = "";
            commandSuggestionRequestRef.current += 1;
            commandSuggestionsRef.current = [];
            setCommandSuggestions([]);
          }
        }

        // Ctrl+Shift+F (or Cmd+Shift+F on Mac) — toggle terminal search
        const searchMod = isMacLike ? event.metaKey : event.ctrlKey;
        if (searchMod && event.shiftKey && event.key.toLowerCase() === "f") {
          event.preventDefault();
          setSearchVisible((v) => !v);
          return false;
        }

        const fontSizeAction = getTerminalFontSizeAction({
          event,
          isMacLike
        });
        if (fontSizeAction) {
          event.preventDefault();
          if (fontSizeAction === "increase") {
            increaseFontSize();
          } else if (fontSizeAction === "decrease") {
            decreaseFontSize();
          } else {
            resetFontSize();
          }
          return false;
        }

        const action = getTerminalClipboardAction({
          event,
          hasSelection: instance?.hasSelection() ?? false,
          isMacLike
        });

        if (!action) {
          return true;
        }

        event.preventDefault();

        if (action === "copy") {
          const selection = instance?.getSelection() ?? "";
          if (selection) {
            void writeClipboardText(selection);
          }
          return false;
        }

        void (async () => {
          const clipboardText = await readClipboardText();
          if (clipboardText) {
            instance?.paste(clipboardText);
          }
        })();

        return false;
      });

      disposeInput = instance.onData((data) => {
        const activeSessionId = sessionIdRef.current;

        if ((stateRef.current === "disconnected" || stateRef.current === "failed") && /[\r\n]/.test(data)) {
          reconnectRef.current();
          return;
        }

        if (!activeSessionId || !hasShell()) {
          return;
        }

        resetIdleDisconnectTimer(activeSessionId);

        if (completingSuggestionRef.current) {
          completingSuggestionRef.current = false;
          commandInputRef.current += data;
        } else if (["\r", "\n", "\u001b", "\u0003", "\u0015"].some((character) => data.includes(character))) {
          commandInputRef.current = "";
          commandSuggestionRequestRef.current += 1;
          commandSuggestionsRef.current = [];
          setCommandSuggestions([]);
          setSelectedCommandSuggestion(0);
        } else {
          const nextInput = data === "\u007f" || data === "\b"
            ? commandInputRef.current.slice(0, -1)
            : /^[\x20-\x7e]+$/.test(data)
              ? commandInputRef.current + data
              : commandInputRef.current;
          commandInputRef.current = nextInput;
          const requestId = ++commandSuggestionRequestRef.current;
          if (!nextInput) {
            commandSuggestionsRef.current = [];
            setCommandSuggestions([]);
            setSelectedCommandSuggestion(0);
          } else {
            void loadCommandSuggestions(nextInput).then((suggestions) => {
              if (requestId !== commandSuggestionRequestRef.current) return;
              const visibleSuggestions = suggestions.slice(0, 8);
              commandSuggestionsRef.current = visibleSuggestions;
              setCommandSuggestions(visibleSuggestions);
              selectedCommandSuggestionRef.current = 0;
              setSelectedCommandSuggestion(0);
            });
          }
        }

        const targetSessionIds =
          inputRelayTargetsRef.current.length > 0
            ? inputRelayTargetsRef.current
            : [activeSessionId];

        for (const sessionId of targetSessionIds) {
          sendSessionWrite(sessionId, data);
        }
      });
    })();

    return () => {
      disposed = true;
      disposeInput?.dispose();
      titleDisposable?.dispose();
      workingDirectoryDisposable?.dispose();
      repaintGuard?.dispose();
      removeFocusListeners?.();
      conptyWiggleRef.current?.dispose();
      conptyWiggleRef.current = null;
      conptyResizeSchedulerRef.current?.dispose();
      conptyResizeSchedulerRef.current = null;
      instance?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      setTerminal(null);
      setSearchAddon(null);
    };
    // `terminalSettings` / `customThemes` are read here only to seed the
    // initial xterm options. Listing them would tear down and rebuild the
    // terminal on every settings change; the effect below applies live updates
    // to the existing instance instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applyTerminalBackground,
    decreaseFontSize,
    increaseFontSize,
    readClipboardText,
    resetFontSize,
    sendSessionWrite,
    acceptCommandSuggestion,
    selectCommandSuggestion,
    writeClipboardText,
    input.onWorkingDirectoryChange,
    resetIdleDisconnectTimer
  ]);

  const onSessionOpened = input.onSessionOpened;
  const onPluginData = input.onPluginData;

  const connect = useCallback(async (): Promise<void> => {
    const instance = terminalRef.current;
    if (!instance || !hasShell()) {
      return;
    }

    const attemptId = asyncOperationGuardRef.current.issueToken();
    setStateSafe("connecting");
    try {
      const cols = instance.cols || 120;
      const rows = instance.rows || 40;
      const result = await resolveConnectAttempt({
        openSession: () =>
          getShell().openSession({
            transport: input.transport,
            profileId: input.profileId,
            cols,
            rows,
            tmuxAttach: Boolean(input.tmuxAttachTarget),
            ...(input.sessionOpenData ? { pluginData: input.sessionOpenData } : {}),
            ...(input.telnetOptions ? { telnetOptions: input.telnetOptions } : {})
          }),
        isStale: () =>
          !mountedRef.current ||
          !asyncOperationGuardRef.current.isCurrent(attemptId),
        closeSession: (sessionId) => {
          getShell().closeSession({ sessionId }).catch((error) => {
            logAsyncError("closeSession for stale connect attempt failed", error);
          });
        }
      });

      if (!result) {
        return;
      }

      sessionIdRef.current = result.sessionId;
      onSessionOpened?.(result.sessionId);
      for (const [pluginId, data] of Object.entries(result.pluginData ?? {})) {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          onPluginData?.(result.sessionId, pluginId, data as Record<string, unknown>);
        }
      }
      // Only apply the IPC result state if the event listener hasn't
      // already advanced past it (e.g. "connected" arrived before the
      // openSession promise resolved).
      const currentStoreState = sessionStateStore.getState().sessions[result.sessionId]?.state;
      if (currentStoreState !== "connected") {
        setStateSafe(result.state);
      }

      if (pendingSessionEventsRef.current.length > 0) {
        const queued = pendingSessionEventsRef.current;
        pendingSessionEventsRef.current = [];
        for (const event of queued) {
          applySessionEvent(event);
        }
      }
    } catch (error) {
      if (
        !mountedRef.current ||
        !asyncOperationGuardRef.current.isCurrent(attemptId)
      ) {
        return;
      }

      writeTerminalError(error);
      setStateSafe("failed");
    }
  }, [
    applySessionEvent,
    onSessionOpened,
    onPluginData,
    input.sessionOpenData,
    input.profileId,
    input.telnetOptions,
    input.tmuxAttachTarget,
    input.transport,
    setStateSafe,
    writeTerminalError
  ]);

  const disconnect = useCallback(async (): Promise<void> => {
    clearIdleDisconnectTimer();
    asyncOperationGuardRef.current.issueToken();
    const sessionId = sessionIdRef.current;
    if (!sessionId || !hasShell()) {
      setStateSafe("disconnected");
      return;
    }

    try {
      await getShell().closeSession({ sessionId });
      if (!mountedRef.current) {
        return;
      }

      setStateSafe("disconnected");
      sessionIdRef.current = null;
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      writeTerminalError(error);
      setStateSafe("failed");
    }
  }, [clearIdleDisconnectTimer, setStateSafe, writeTerminalError]);

  const reconnect = useCallback(async (): Promise<void> => {
    clearIdleDisconnectTimer();
    const previousSessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    reconnectPromptShownRef.current = false;
    if (previousSessionId && hasShell()) {
      try {
        await getShell().closeSession({ sessionId: previousSessionId });
      } catch (error) {
        logAsyncError("close stale session before reconnect failed", error);
      }
    }
    await connect();
  }, [clearIdleDisconnectTimer, connect]);

  reconnectRef.current = () => { void reconnect(); };

  useEffect(() => {
    if (state === "connected") resetIdleDisconnectTimer();
    else clearIdleDisconnectTimer();
  }, [clearIdleDisconnectTimer, resetIdleDisconnectTimer, state]);

  const write = useCallback((data: string): void => {
    const sessionId = sessionIdRef.current;

    if (sessionId) {
      sendSessionWrite(sessionId, data);
    }
  }, [sendSessionWrite]);

  const fit = useCallback((): void => {
    const instance = terminalRef.current;
    const addon = fitAddonRef.current;

    if (!instance || !addon) {
      return;
    }

    try {
      addon.fit();
    } catch {
      return;
    }

    const sessionId = sessionIdRef.current;
    const isWindowsLocalShell = input.transport === "local" && /Win/i.test(navigator.platform);
    if (sessionId) {
      if (isWindowsLocalShell) {
        conptyResizeSchedulerRef.current ??= createConptyResizeScheduler(sendSessionResize);
        conptyResizeSchedulerRef.current.schedule(sessionId, instance.cols, instance.rows);
      } else {
        sendSessionResize(sessionId, instance.cols, instance.rows);
      }
    }

    // Local shells on Windows sit on ConPTY, whose resize reflow diverges
    // from xterm's and leaves stale rows behind after widening (see
    // conptyResyncWiggle.ts). Watch fit()-driven resizes and resync once a
    // widening burst settles.
    if (isWindowsLocalShell) {
      conptyWiggleRef.current ??= createConptyResyncWiggle({
        resize: (cols, rows) => {
          const wiggleTarget = terminalRef.current;
          if (!wiggleTarget) {
            return;
          }
          wiggleTarget.resize(cols, rows);
          const wiggleSessionId = sessionIdRef.current;
          if (wiggleSessionId) {
            sendSessionResize(wiggleSessionId, cols, rows);
          }
        }
      });
      conptyWiggleRef.current.notifyResize(instance.cols, instance.rows);
    }
  }, [input.transport, sendSessionResize]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    const opts = getTerminalOptions({
      ...terminalSettings,
      fontSize: input.fontSize,
      customThemes,
    });
    const needsRefit =
      term.options.fontFamily !== opts.fontFamily ||
      term.options.fontSize !== opts.fontSize ||
      term.options.lineHeight !== opts.lineHeight ||
      term.options.letterSpacing !== opts.letterSpacing;
    Object.assign(term.options, {
      fontFamily: opts.fontFamily,
      fontSize: opts.fontSize,
      lineHeight: opts.lineHeight,
      letterSpacing: opts.letterSpacing,
      cursorBlink: opts.cursorBlink,
      scrollback: opts.scrollback,
      theme: opts.theme,
    });
    applyTerminalBackground(opts.theme?.background ?? "#07111f");
    if (needsRefit) fit();
  }, [applyTerminalBackground, terminalSettings, customThemes, fit, input.fontSize]);

  useEffect(() => {
    if (!terminal || input.autoConnect === false || sessionIdRef.current) {
      return;
    }

    void connect();
  }, [connect, input.autoConnect, terminal]);

  useEffect(() => {
    if (!hasShell()) {
      return;
    }

    const unsubscribe = getShell().onSessionEvent((event) => {
      if (!sessionIdRef.current) {
        const queue = pendingSessionEventsRef.current;
        queue.push(event);
        if (queue.length > 200) {
          queue.splice(0, queue.length - 200);
        }
        return;
      }

      applySessionEvent(event);
    });

    eventUnsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      eventUnsubscribeRef.current = null;
    };
  }, [applySessionEvent]);

  useEffect(() => {
    const onFocusRequest = (event: Event) => {
      const detail = (event as CustomEvent<TerminalFocusRequestDetail>).detail;
      if (!shouldHandleTerminalFocusRequest(detail?.sessionId, sessionIdRef.current)) {
        return;
      }

      requestAnimationFrame(() => {
        terminalRef.current?.focus();
      });
    };

    window.addEventListener(TERMINAL_FOCUS_REQUEST_EVENT, onFocusRequest);
    return () => {
      window.removeEventListener(TERMINAL_FOCUS_REQUEST_EVENT, onFocusRequest);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      fit();
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [fit]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let raf: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        fit();
        raf = null;
      });
    });
    resizeObserver.observe(container);

    // Re-fit when the terminal becomes visible (e.g. tab switch).
    // visibility:hidden keeps layout dimensions, so ResizeObserver won't fire.
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestAnimationFrame(() => fit());
        }
      },
      { threshold: 0.1 }
    );
    intersectionObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fit]);

  const focusTerminal = useCallback((): void => {
    terminalRef.current?.focus();
  }, []);

  return {
    containerRef,
    terminal,
    searchAddon,
    searchVisible,
    setSearchVisible,
    sessionId: sessionIdRef.current,
    state,
    fontSize: input.fontSize,
    setFontSize,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    connect,
    reconnect,
    disconnect,
    write,
    fit,
    focusTerminal,
    commandSuggestions,
    selectedCommandSuggestion,
    selectCommandSuggestion,
    acceptCommandSuggestion,
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeShell } from "../../../../../../src/workbench/shared/fakeShell";
import { setShell } from "../../../../../../src/workbench/shared/shell";
import type { PluginHostContext } from "@hypershell/plugin-api";
import {
  answerKeyboardInteractive,
  pickTmuxSession,
} from "../../../../../../src/workbench/shell/connections/challenges/connectionChallengeFlows";
import { useConnectionChallengeStore } from "../../../../../../src/workbench/shell/connections/challenges/connectionChallengeStore";

const host = {
  id: "h1",
  name: "web",
  hostname: "web.example",
  port: 22,
  username: "saved-user",
} satisfies PluginHostContext;

const store = () => useConnectionChallengeStore.getState();

/** Waits until the flow has raised a challenge of the given kind. */
async function challengeRaised(kind: string) {
  await vi.waitFor(() => {
    expect(store().challenge?.kind).toBe(kind);
  });
  return store().challenge!;
}

afterEach(() => {
  store().settle();
  setShell(null);
  vi.restoreAllMocks();
});

describe("answerKeyboardInteractive", () => {
  const request = {
    requestId: "kbd-1",
    name: "2FA",
    instructions: "",
    prompts: [
      { prompt: "Code:", echo: false },
      { prompt: "Backup:", echo: false },
    ],
  };

  it("relays the user's responses", async () => {
    const keyboardInteractiveRespond = vi.fn().mockResolvedValue(undefined);
    const { shell } = createFakeShell({ keyboardInteractiveRespond });
    setShell(shell);

    const flow = answerKeyboardInteractive(request);
    await challengeRaised("keyboard-interactive");
    store().answer({ kind: "keyboard-interactive", responses: ["123456", "789"] });
    await flow;

    expect(keyboardInteractiveRespond).toHaveBeenCalledWith({
      requestId: "kbd-1",
      responses: ["123456", "789"],
    });
    expect(store().challenge).toBeNull();
  });

  it("sends one empty response per prompt on cancel so auth fails cleanly", async () => {
    const keyboardInteractiveRespond = vi.fn().mockResolvedValue(undefined);
    const { shell } = createFakeShell({ keyboardInteractiveRespond });
    setShell(shell);

    const flow = answerKeyboardInteractive(request);
    await challengeRaised("keyboard-interactive");
    store().cancel();
    await flow;

    expect(keyboardInteractiveRespond).toHaveBeenCalledWith({
      requestId: "kbd-1",
      responses: ["", ""],
    });
  });
});

describe("pickTmuxSession", () => {
  const sessions = [{ name: "main", windowCount: 2, createdAt: "2026-01-01T00:00:00Z", attached: false }];

  it("resolves the chosen session name", async () => {
    setShell(createFakeShell().shell);
    const flow = pickTmuxSession(host, sessions);
    await challengeRaised("tmux-sessions");
    store().answer({ kind: "tmux-sessions", attachTo: "main" });
    await expect(flow).resolves.toEqual({ attachTo: "main" });
  });

  it("resolves attachTo null on skip and null when superseded", async () => {
    setShell(createFakeShell().shell);
    const skipped = pickTmuxSession(host, sessions);
    await challengeRaised("tmux-sessions");
    store().answer({ kind: "tmux-sessions", attachTo: null });
    await expect(skipped).resolves.toEqual({ attachTo: null });

    const superseded = pickTmuxSession(host, sessions);
    await challengeRaised("tmux-sessions");
    store().cancel();
    await expect(superseded).resolves.toBeNull();
  });
});

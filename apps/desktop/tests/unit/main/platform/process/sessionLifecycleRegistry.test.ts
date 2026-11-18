import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionManager } from "@hypershell/session-core";
import {
  getSessionRecoveryData,
  publishSessionLifecycleEvent,
  registerSessionLifecycleListener,
  registerSessionRecoveryDataProvider,
} from "../../../../../src/main/platform/process/sessionLifecycleRegistry";

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe("session lifecycle contributions", () => {
  it("publishes events with generic transport context", () => {
    const listener = vi.fn();
    cleanups.push(registerSessionLifecycleListener(listener));
    const manager = {
      getSessionInput: () => ({ transport: "local", profileId: "profile-1" }),
      getSession: () => undefined,
    } as unknown as SessionManager;
    const event = { type: "process-title", sessionId: "s1", name: "claude" } as const;

    publishSessionLifecycleEvent(manager, event);

    expect(listener).toHaveBeenCalledWith({
      transport: "local",
      profileId: "profile-1",
      event,
    });
  });

  it("provides and disposes opaque recovery metadata by transport", () => {
    const provider = vi.fn((sessionId: string, profileId: string) => ({ pluginData: { "example.plugin": { conversationId: sessionId } }, title: profileId }));
    const unregister = registerSessionRecoveryDataProvider("local", provider);
    cleanups.push(unregister);

    expect(getSessionRecoveryData("local", "s1", "PowerShell")).toEqual({
      title: "PowerShell",
      pluginData: { "example.plugin": { conversationId: "s1" } },
    });
    expect(provider).toHaveBeenCalledWith("s1", "PowerShell");

    unregister();
    expect(getSessionRecoveryData("local", "s1", "PowerShell")).toEqual({});
  });

  it("rejects duplicate recovery providers without replacing the owner", () => {
    const first = (_sessionId: string, _profileId: string) => ({ pluginData: { owner: "first" } });
    const unregister = registerSessionRecoveryDataProvider("local", first);
    cleanups.push(unregister);

    expect(() => registerSessionRecoveryDataProvider("local", () => ({ pluginData: { owner: "second" } })))
      .toThrow("Session recovery data provider already registered for: local");
    expect(getSessionRecoveryData("local", "s1", "PowerShell")).toEqual({
      pluginData: { owner: "first" },
    });
  });
});

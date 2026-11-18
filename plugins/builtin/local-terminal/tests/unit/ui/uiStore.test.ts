import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalProfileRecord } from "@hypershell/shared";
import type { PluginUiHostServices } from "@hypershell/plugin-api";
import { localTerminalTestHost } from "./testUtils";
import { localTerminalUiStore } from "../../../ui/uiStore";

const profile = (id: string) => ({ id, name: id }) as LocalProfileRecord;

describe("local terminal profile dialog state", () => {
  beforeEach(() => {
    localTerminalUiStore.getState().closeProfileDialog();
  });

  it("opens a new profile dialog with a safe environment-variable state", () => {
    localTerminalUiStore.getState().createProfile();

    expect(localTerminalUiStore.getState()).toMatchObject({
      profileDialogOpen: true,
      editingProfile: null,
      editingProfileEnvVars: [],
      editingProfileEnvVarsLoaded: true,
    });
  });

  it("keeps the latest edit request when profile reads finish out of order", async () => {
    let resolveFirst: ((value: Array<{ name: string; value: string; isEnabled: boolean }>) => void) | undefined;
    const getLocalProfileEnvVars = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([{ name: "PROFILE", value: "current", isEnabled: true }]);
    const host = { ...localTerminalTestHost, localProfiles: { ...localTerminalTestHost.localProfiles, getEnvVars: getLocalProfileEnvVars } } as unknown as Pick<PluginUiHostServices, "localProfiles">;

    const firstRequest = localTerminalUiStore.getState().editProfile(host, profile("first"));
    await localTerminalUiStore.getState().editProfile(host, profile("second"));
    resolveFirst?.([{ name: "PROFILE", value: "stale", isEnabled: true }]);
    await firstRequest;

    expect(localTerminalUiStore.getState()).toMatchObject({
      profileDialogOpen: true,
      editingProfile: { id: "second" },
      editingProfileEnvVars: [{ name: "PROFILE", value: "current", isEnabled: true }],
      editingProfileEnvVarsLoaded: true,
    });
  });
});

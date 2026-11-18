import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { localProfilesStore, selectLaunchableProfiles } from "../../../ui/localProfilesStore";
import type { LocalProfileRecord } from "@hypershell/shared";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() }
}));

function profile(overrides: Partial<LocalProfileRecord> = {}): LocalProfileRecord {
  return {
    id: "p1",
    name: "PowerShell",
    executable: "pwsh.exe",
    args: [],
    startingDirectory: null,
    icon: "powershell",
    color: null,
    elevated: false,
    source: "detected",
    detectKey: "pwsh7",
    isAvailable: true,
    isHidden: false,
    sortOrder: 1,
    claudeSession: false,
    claudeSessionMode: "continue" as const,
    ...overrides
  };
}

function host(methods: Partial<PluginUiHostServices["localProfiles"]>): Pick<PluginUiHostServices, "localProfiles"> {
  return { localProfiles: methods as PluginUiHostServices["localProfiles"] };
}

describe("selectLaunchableProfiles", () => {
  it("keeps available, visible profiles", () => {
    expect(selectLaunchableProfiles([profile()])).toHaveLength(1);
  });

  it("drops hidden profiles", () => {
    expect(selectLaunchableProfiles([profile({ isHidden: true })])).toEqual([]);
  });

  it("drops unavailable profiles", () => {
    expect(selectLaunchableProfiles([profile({ isAvailable: false })])).toEqual([]);
  });
});

describe("localProfilesStore", () => {
  beforeEach(() => {
    localProfilesStore.setState({ profiles: [], loading: false });
  });

  it("loads profiles through the host service", async () => {
    const listLocalProfiles = vi.fn().mockResolvedValue([profile()]);
    await localProfilesStore.getState().load(host({ list: listLocalProfiles }));

    expect(localProfilesStore.getState().profiles).toHaveLength(1);
    expect(localProfilesStore.getState().loading).toBe(false);
  });

  it("leaves state unchanged when profile listing fails", async () => {
    localProfilesStore.setState({ profiles: [profile()], loading: false });
    await localProfilesStore.getState().load(host({ list: vi.fn().mockRejectedValue(new Error("unavailable")) }));

    expect(localProfilesStore.getState().profiles).toEqual([profile()]);
    expect(localProfilesStore.getState().loading).toBe(false);
  });

  it("reloads after a save", async () => {
    const listLocalProfiles = vi.fn().mockResolvedValue([profile({ name: "Renamed" })]);
    const upsertLocalProfile = vi.fn().mockResolvedValue(profile({ name: "Renamed" }));
    const api = host({ list: listLocalProfiles, upsert: upsertLocalProfile });

    await localProfilesStore
      .getState()
      .save(api, { id: "p1", name: "Renamed", executable: "pwsh.exe" });

    expect(upsertLocalProfile).toHaveBeenCalled();
    expect(localProfilesStore.getState().profiles[0].name).toBe("Renamed");
  });
});

// The sidebar fires these three as `void store.<action>(...)`, so a rejection
// that escapes the store is an unhandled promise rejection the user never sees.
describe("localProfilesStore failure handling", () => {
  beforeEach(() => {
    localProfilesStore.setState({ profiles: [], loading: false });
    vi.mocked(toast.error).mockClear();
  });

  it("reports and recovers when setHidden fails", async () => {
    const listLocalProfiles = vi.fn().mockResolvedValue([profile({ isHidden: false })]);
    const setLocalProfileHidden = vi.fn().mockRejectedValue(new Error("db is read-only"));
    const api = host({ list: listLocalProfiles, setHidden: setLocalProfileHidden });

    await expect(localProfilesStore.getState().setHidden(api, "p1", true)).resolves.toBeUndefined();

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("db is read-only"));
    // Reloaded, so the list reflects what the main process really has.
    expect(listLocalProfiles).toHaveBeenCalled();
    expect(localProfilesStore.getState().profiles[0].isHidden).toBe(false);
  });

  it("reports and recovers when reorder fails", async () => {
    const listLocalProfiles = vi.fn().mockResolvedValue([profile({ sortOrder: 1 })]);
    const reorderLocalProfiles = vi.fn().mockRejectedValue(new Error("db is read-only"));
    const api = host({ list: listLocalProfiles, reorder: reorderLocalProfiles });

    await expect(
      localProfilesStore.getState().reorder(api, [{ id: "p1", sortOrder: 0 }])
    ).resolves.toBeUndefined();

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("db is read-only"));
    expect(localProfilesStore.getState().profiles[0].sortOrder).toBe(1);
  });

  it("reports and keeps the current list when rescan fails", async () => {
    const rescanLocalProfiles = vi.fn().mockRejectedValue(new Error("wsl.exe hung"));
    const api = host({ rescan: rescanLocalProfiles });
    localProfilesStore.setState({ profiles: [profile()] });

    await expect(localProfilesStore.getState().rescan(api)).resolves.toBeUndefined();

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("wsl.exe hung"));
    expect(localProfilesStore.getState().profiles).toHaveLength(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { createLocalProfilesRepositoryFromDatabase } from "../../../main/localProfilesRepository";
import { prepareLocalSessionOpen } from "../../../main/prepareLocalSession";

type MockRepository = ReturnType<typeof createLocalProfilesRepositoryFromDatabase> & {
  get: ReturnType<typeof vi.fn>;
  listEnvVars: ReturnType<typeof vi.fn>;
};

const request = {
  transport: "local" as const,
  profileId: "profile-1",
  cols: 100,
  rows: 30,
};

function createRepository(overrides: Record<string, unknown> = {}): MockRepository {
  return {
    get: vi.fn(() => ({
      id: "profile-1",
      name: "PowerShell",
      executable: "pwsh.exe",
      args: ["-NoLogo"],
      startingDirectory: "C:\\work",
      isAvailable: true,
      claudeSession: false,
      claudeSessionMode: "continue" as const,
      ...overrides,
    })),
    listEnvVars: vi.fn(() => [
      { name: "KEEP", value: "yes", isEnabled: true },
      { name: "DROP", value: "no", isEnabled: false },
    ]),
  } as unknown as MockRepository;
}

describe("prepareLocalSessionOpen", () => {
  it("resolves profile settings and enabled environment variables", async () => {
    const repository = createRepository();
    const getClaudeSessionInfo = vi.fn(async () => null);

    const prepared = await prepareLocalSessionOpen(request, {
      getRepository: () => repository,
      getClaudeSessionInfo,
      generateSessionId: () => "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
    });

    expect(prepared.input?.localOptions).toEqual({
      executable: "pwsh.exe",
      args: ["-NoLogo"],
      cwd: "C:\\work",
      envVars: { KEEP: "yes" },
      startupCommand: undefined,
    });
    expect(getClaudeSessionInfo).not.toHaveBeenCalled();
  });

  it("keeps Claude launcher args and generated session metadata with Local Terminal", async () => {
    const repository = createRepository({
      claudeSession: true,
      claudeSessionMode: "new",
    });
    const prepared = await prepareLocalSessionOpen(request, {
      getRepository: () => repository,
      getClaudeSessionInfo: vi.fn(async () => null),
      generateSessionId: () => "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
    });

    expect(prepared.input?.localOptions?.args).toEqual([
      "-NoLogo",
      "--session-id",
      "64afeb05-2f9f-4bba-8087-9b7029b2fab1",
    ]);
    expect(prepared.response).toEqual({
      pluginData: { "local-terminal": { claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1" } },
    });
  });

  it("rejects missing and unavailable local profiles", async () => {
    const missing = createRepository();
    missing.get.mockReturnValue(undefined as never);
    await expect(prepareLocalSessionOpen(request, {
      getRepository: () => missing,
      getClaudeSessionInfo: vi.fn(async () => null),
    })).rejects.toThrow("Unknown local profile");

    const unavailable = createRepository({ isAvailable: false });
    await expect(prepareLocalSessionOpen(request, {
      getRepository: () => unavailable,
      getClaudeSessionInfo: vi.fn(async () => null),
    })).rejects.toThrow("Local shell is not available");
  });
});

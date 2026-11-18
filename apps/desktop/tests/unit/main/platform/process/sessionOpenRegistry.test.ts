import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareSessionOpen,
  registerSessionOpenPreparer,
} from "../../../../../src/main/platform/process/sessionOpenRegistry";

const cleanups: Array<() => void> = [];

const request = {
  transport: "local" as const,
  profileId: "profile-1",
  cols: 80,
  rows: 24,
};

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe("session open preparer registry", () => {
  it("dispatches preparation by transport and returns its opaque result", async () => {
    const preparer = vi.fn(async () => ({
      input: { localOptions: { executable: "pwsh.exe" } },
      response: { pluginData: { "local-terminal": { claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1" } } },
    }));
    const unregister = registerSessionOpenPreparer("local", preparer);
    cleanups.push(unregister);

    await expect(prepareSessionOpen(request)).resolves.toEqual({
      input: { localOptions: { executable: "pwsh.exe" } },
      response: { pluginData: { "local-terminal": { claudeSessionId: "64afeb05-2f9f-4bba-8087-9b7029b2fab1" } } },
    });
    expect(preparer).toHaveBeenCalledWith(request);

    unregister();
    await expect(prepareSessionOpen(request)).resolves.toEqual({});
  });

  it("rejects a second owner and does not unregister a replacement", async () => {
    const first = () => ({});
    const second = () => ({ input: { localOptions: { executable: "sh" } } });
    const unregisterFirst = registerSessionOpenPreparer("local", first);
    cleanups.push(unregisterFirst);

    expect(() => registerSessionOpenPreparer("local", second)).toThrow(
      "A session open preparer is already registered for: local"
    );

    unregisterFirst();
    const unregisterSecond = registerSessionOpenPreparer("local", second);
    cleanups.push(unregisterSecond);
    unregisterFirst();
    await expect(prepareSessionOpen(request)).resolves.toEqual({
      input: { localOptions: { executable: "sh" } },
    });
    unregisterSecond();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@hypershell/db";
import type { SqliteDatabase } from "@hypershell/db";

const secrets = vi.hoisted(() => ({
  protect: vi.fn((value: string) => `protected:${value}`),
  reveal: vi.fn((value: string) => value.replace(/^protected:/, "")),
}));

vi.mock("../../../../../src/main/platform/security/secureStorage", () => ({
  protectSecretStrict: secrets.protect,
  revealSecretStrict: secrets.reveal,
}));

import { createHostPasswordStore } from "../../../../../src/main/platform/security/hostPasswordStore";

describe("host password store", () => {
  let database: SqliteDatabase;

  beforeEach(() => {
    database = openDatabase();
    secrets.protect.mockClear();
    secrets.reveal.mockClear();
  });

  afterEach(() => database.close());

  it("stores only protected secret data and resolves saved-password metadata", () => {
    const store = createHostPasswordStore(() => database);
    const profileId = store.save({
      hostId: "host-1",
      hostName: "Production",
      username: "admin",
      password: "top-secret",
    });

    expect(profileId).toBe("host-password-host-1");
    expect(secrets.protect).toHaveBeenCalledWith("top-secret");
    expect(database.prepare("SELECT secret_ref FROM auth_profiles WHERE id = ?").get(profileId))
      .toEqual({ secret_ref: "protected:top-secret" });
    expect(store.resolve({ authMethod: "password", authProfileId: profileId })).toBe("top-secret");
    expect(store.savedAt({ authMethod: "password", authProfileId: profileId })).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(store.resolve({ authMethod: "keyfile", authProfileId: profileId })).toBeNull();
  });

  it("updates an existing profile and removes it when the host stops using password auth", () => {
    const store = createHostPasswordStore(() => database);
    const profileId = store.save({
      hostId: "host-2",
      hostName: "Old name",
      username: "admin",
      password: "old-secret",
    });
    store.save({
      hostId: "host-2",
      hostName: "New name",
      username: "root",
      password: "new-secret",
      existingAuthProfileId: profileId,
    });
    expect(database.prepare("SELECT name, username FROM auth_profiles WHERE id = ?").get(profileId))
      .toEqual({ name: "host-password:host-2:New name", username: "root" });

    store.remove(profileId);
    expect(store.resolve({ authMethod: "password", authProfileId: profileId })).toBeNull();
    expect(store.savedAt({ authMethod: "password", authProfileId: profileId })).toBeNull();
  });

  it("fails closed if the database is unavailable", () => {
    const store = createHostPasswordStore(() => null);
    expect(() => store.save({
      hostId: "host-3",
      hostName: "Unavailable",
      username: null,
      password: "secret",
    })).toThrow("Database is unavailable");
  });
});

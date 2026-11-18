import type { SqliteDatabase } from "@hypershell/db";
import { revealSecretStrict, protectSecretStrict } from "./secureStorage";
import { getOrCreateDatabase } from "../storage/database";

type AuthProfileRow = {
  id: string;
  type: string;
  secret_ref: string | null;
  updated_at?: string | null;
};

function normalizeSqliteTimestampToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return `${value.replace(" ", "T")}Z`;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function createHostPasswordStore(
  getDatabase: () => SqliteDatabase | null = getOrCreateDatabase,
) {
  return {
    remove(authProfileId: string | null | undefined): void {
      if (!authProfileId) return;
      getDatabase()?.prepare("DELETE FROM auth_profiles WHERE id = ?").run(authProfileId);
    },
    save(input: {
      hostId: string;
      hostName: string;
      username: string | null;
      password: string;
      existingAuthProfileId?: string | null;
    }): string {
      const db = getDatabase();
      if (!db) throw new Error("Database is unavailable; cannot store host password.");
      const profileId = input.existingAuthProfileId ?? `host-password-${input.hostId}`;
      const protectedSecret = protectSecretStrict(input.password);
      db.prepare(`
        INSERT INTO auth_profiles (id, name, type, username, secret_ref, key_path)
        VALUES (@id, @name, 'password', @username, @secretRef, NULL)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          type = 'password',
          username = excluded.username,
          secret_ref = excluded.secret_ref,
          key_path = NULL,
          updated_at = CURRENT_TIMESTAMP
      `).run({
        id: profileId,
        name: `host-password:${input.hostId}:${input.hostName}`,
        username: input.username,
        secretRef: protectedSecret,
      });
      return profileId;
    },
    resolve(host: { authMethod?: string | null; authProfileId?: string | null }): string | null {
      if (host.authMethod !== "password" || !host.authProfileId) return null;
      const row = getDatabase()?.prepare(
        "SELECT id, type, secret_ref FROM auth_profiles WHERE id = ?",
      ).get(host.authProfileId) as AuthProfileRow | undefined;
      if (!row || row.type !== "password" || !row.secret_ref) return null;
      return revealSecretStrict(row.secret_ref);
    },
    savedAt(host: { authMethod?: string | null; authProfileId?: string | null }): string | null {
      if (host.authMethod !== "password" || !host.authProfileId) return null;
      const row = getDatabase()?.prepare(
        "SELECT updated_at FROM auth_profiles WHERE id = ? AND type = 'password'",
      ).get(host.authProfileId) as { updated_at?: string | null } | undefined;
      return normalizeSqliteTimestampToIso(row?.updated_at);
    },
  };
}

const defaultHostPasswordStore = createHostPasswordStore();

export function removeStoredHostPassword(authProfileId: string | null | undefined): void {
  defaultHostPasswordStore.remove(authProfileId);
}

export function saveStoredHostPassword(input: Parameters<typeof defaultHostPasswordStore.save>[0]): string {
  return defaultHostPasswordStore.save(input);
}

export function resolveStoredHostPassword(host: Parameters<typeof defaultHostPasswordStore.resolve>[0]): string | null {
  return defaultHostPasswordStore.resolve(host);
}

export function getStoredHostPasswordSavedAt(host: Parameters<typeof defaultHostPasswordStore.savedAt>[0]): string | null {
  return defaultHostPasswordStore.savedAt(host);
}

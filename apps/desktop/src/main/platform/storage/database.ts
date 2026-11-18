import { openDatabase } from "@hypershell/db";
import type { SqliteDatabase } from "@hypershell/db";
import { app } from "electron";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

let sharedDatabase: SqliteDatabase | null = null;

export function getOrCreateDatabase(): SqliteDatabase | null {
  if (!sharedDatabase) {
    try {
      const databasePath = resolveDatabasePath();
      console.log("[hypershell] Opening database at:", databasePath);
      sharedDatabase = openDatabase(databasePath);
      console.log("[hypershell] Database initialized successfully");
    } catch (error) {
      console.error("[hypershell] Failed to initialize SQLite:", error);
    }
  }
  return sharedDatabase;
}

export function closeDatabase(): void {
  const database = sharedDatabase;
  if (!database) return;

  try {
    database.close();
  } finally {
    sharedDatabase = null;
  }
}

export function resolveDatabasePath(): string {
  const stableDataDirectory = path.join(app.getPath("appData"), "HyperShell");
  const stableDatabasePath = path.join(stableDataDirectory, "hypershell.db");
  const legacyDatabasePath = path.join(app.getPath("userData"), "hypershell.db");

  mkdirSync(stableDataDirectory, { recursive: true });

  if (
    !existsSync(stableDatabasePath) &&
    existsSync(legacyDatabasePath) &&
    legacyDatabasePath !== stableDatabasePath
  ) {
    try {
      copyFileSync(legacyDatabasePath, stableDatabasePath);
      console.log("[hypershell] Migrated host DB to stable path:", stableDatabasePath);
    } catch (error) {
      console.warn("[hypershell] Failed migrating host DB, continuing with stable path:", error);
    }
  }

  return stableDatabasePath;
}

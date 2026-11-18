import type { SqliteDatabase } from "../index";
import { withOpenDatabase } from "../index";

export type PluginStorageEntry = {
  key: string;
  value: unknown;
  updatedAt: string;
};

const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const MAX_VALUE_BYTES = 64 * 1024;

function validateIdentifier(value: string, label: string): void {
  if (!identifierPattern.test(value)) throw new Error(`Invalid plugin storage ${label}`);
}

function encodeValue(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > MAX_VALUE_BYTES) {
    throw new Error("Plugin storage value exceeds the 64 KB limit");
  }
  return encoded;
}

type StorageRow = { key: string; value_json: string; updated_at: string };

function mapRow(row: StorageRow): PluginStorageEntry {
  return { key: row.key, value: JSON.parse(row.value_json), updatedAt: row.updated_at };
}

export function createPluginStorageRepository(databasePath = ":memory:") {
  return withOpenDatabase(databasePath, createPluginStorageRepositoryFromDatabase);
}

export function createPluginStorageRepositoryFromDatabase(db: SqliteDatabase) {
  const listRows = db.prepare(`
    SELECT key, value_json, updated_at
    FROM plugin_storage
    WHERE plugin_id = ? AND collection = ?
    ORDER BY key COLLATE NOCASE ASC
  `);
  const getRow = db.prepare(`
    SELECT key, value_json, updated_at
    FROM plugin_storage
    WHERE plugin_id = ? AND collection = ? AND key = ?
  `);
  const upsertRow = db.prepare(`
    INSERT INTO plugin_storage (plugin_id, collection, key, value_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(plugin_id, collection, key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  const deleteRow = db.prepare(`
    DELETE FROM plugin_storage
    WHERE plugin_id = ? AND collection = ? AND key = ?
  `);
  const claimLegacyRows = db.prepare(`
    INSERT OR IGNORE INTO plugin_storage (plugin_id, collection, key, value_json)
    SELECT ?, ?, key, value_json
    FROM plugin_storage
    WHERE plugin_id = '__legacy__' AND collection = ?
  `);
  const deleteLegacyRows = db.prepare(`
    DELETE FROM plugin_storage
    WHERE plugin_id = '__legacy__' AND collection = ?
  `);

  return {
    list(pluginId: string, collection: string): PluginStorageEntry[] {
      validateIdentifier(pluginId, "plugin ID");
      validateIdentifier(collection, "collection");
      return (listRows.all(pluginId, collection) as StorageRow[]).map(mapRow);
    },
    get(pluginId: string, collection: string, key: string): PluginStorageEntry | undefined {
      validateIdentifier(pluginId, "plugin ID");
      validateIdentifier(collection, "collection");
      validateIdentifier(key, "key");
      const row = getRow.get(pluginId, collection, key) as StorageRow | undefined;
      return row ? mapRow(row) : undefined;
    },
    upsert(pluginId: string, collection: string, key: string, value: unknown): void {
      validateIdentifier(pluginId, "plugin ID");
      validateIdentifier(collection, "collection");
      validateIdentifier(key, "key");
      upsertRow.run(pluginId, collection, key, encodeValue(value));
    },
    remove(pluginId: string, collection: string, key: string): boolean {
      validateIdentifier(pluginId, "plugin ID");
      validateIdentifier(collection, "collection");
      validateIdentifier(key, "key");
      return deleteRow.run(pluginId, collection, key).changes > 0;
    },
    claimLegacy(pluginId: string, source: string, collection: string): number {
      validateIdentifier(pluginId, "plugin ID");
      validateIdentifier(source, "legacy source");
      validateIdentifier(collection, "collection");
      if (pluginId === "__legacy__") throw new Error("The legacy storage namespace cannot claim data");
      return db.transaction(() => {
        const result = claimLegacyRows.run(pluginId, collection, source);
        deleteLegacyRows.run(source);
        return result.changes;
      })();
    },
  };
}

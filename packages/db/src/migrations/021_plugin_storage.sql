CREATE TABLE IF NOT EXISTS plugin_storage (
  plugin_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (plugin_id, collection, key)
);

CREATE INDEX IF NOT EXISTS idx_plugin_storage_collection
  ON plugin_storage (plugin_id, collection, key);

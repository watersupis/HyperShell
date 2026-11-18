CREATE TABLE IF NOT EXISTS sftp_operation_logs (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  operation TEXT NOT NULL,
  command TEXT NOT NULL,
  result TEXT NOT NULL,
  success INTEGER NOT NULL,
  undo_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_sftp_operation_logs_host_timestamp
  ON sftp_operation_logs(host_id, timestamp DESC);

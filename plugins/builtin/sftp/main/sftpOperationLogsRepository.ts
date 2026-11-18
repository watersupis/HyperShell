import type { SqliteDatabase } from "@hypershell/db";

export interface SftpOperationLogRecord {
  id: string;
  hostId: string;
  timestamp: number;
  operation: string;
  command: string;
  result: string;
  success: boolean;
  undoData?: unknown;
}

interface SftpOperationLogRow {
  id: string;
  host_id: string;
  timestamp: number;
  operation: string;
  command: string;
  result: string;
  success: number;
  undo_json: string | null;
}

function mapRow(row: SftpOperationLogRow): SftpOperationLogRecord {
  let undoData: Record<string, unknown> | undefined;
  if (row.undo_json) {
    try {
      undoData = JSON.parse(row.undo_json) as Record<string, unknown>;
    } catch {
      undoData = undefined;
    }
  }

  return {
    id: row.id,
    hostId: row.host_id,
    timestamp: row.timestamp,
    operation: row.operation,
    command: row.command,
    result: row.result,
    success: row.success === 1,
    ...(undoData ? { undoData } : {})
  };
}

export function createSftpOperationLogsRepository(db: SqliteDatabase) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO sftp_operation_logs
      (id, host_id, timestamp, operation, command, result, success, undo_json)
    VALUES (@id, @hostId, @timestamp, @operation, @command, @result, @success, @undoJson)
  `);
  const list = db.prepare(`
    SELECT id, host_id, timestamp, operation, command, result, success, undo_json
    FROM sftp_operation_logs WHERE host_id = ?
    ORDER BY timestamp DESC
  `);
  const clear = db.prepare("DELETE FROM sftp_operation_logs WHERE host_id = ?");

  return {
    append(record: SftpOperationLogRecord): void {
      insert.run({
        id: record.id,
        hostId: record.hostId,
        timestamp: record.timestamp,
        operation: record.operation,
        command: record.command,
        result: record.result,
        success: record.success ? 1 : 0,
        undoJson: record.undoData ? JSON.stringify(record.undoData) : null
      });
    },

    list(hostId: string): SftpOperationLogRecord[] {
      return (list.all(hostId) as SftpOperationLogRow[]).map(mapRow);
    },

    clear(hostId: string): void {
      clear.run(hostId);
    }
  };
}

import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type SqliteDatabase, createHostsRepositoryFromDatabase } from "@hypershell/db";
import { createSftpOperationLogsRepository } from "../../../main/sftpOperationLogsRepository";

describe("SftpOperationLogsRepository", () => {
  let db: SqliteDatabase;
  let repo: ReturnType<typeof createSftpOperationLogsRepository>;

  beforeEach(() => {
    db = openDatabase();
    createHostsRepositoryFromDatabase(db).create({
      id: "host-1",
      name: "test-host",
      hostname: "example.com"
    });
    repo = createSftpOperationLogsRepository(db);
  });

  it("persists operation and undo data by host", () => {
    repo.append({
      id: "log-1",
      hostId: "host-1",
      timestamp: 123,
      operation: "Delete",
      command: "sftpDeleteWithBackup()",
      result: "Succeeded",
      success: true,
      undoData: { type: "remote-delete", backupId: "backup-1", paths: ["/tmp/a"] }
    });

    expect(repo.list("host-1")).toEqual([{
      id: "log-1",
      hostId: "host-1",
      timestamp: 123,
      operation: "Delete",
      command: "sftpDeleteWithBackup()",
      result: "Succeeded",
      success: true,
      undoData: { type: "remote-delete", backupId: "backup-1", paths: ["/tmp/a"] }
    }]);
  });

  it("keeps history until explicitly cleared", () => {
    for (let index = 0; index < 505; index += 1) {
      repo.append({
        id: `log-${index}`,
        hostId: "host-1",
        timestamp: index,
        operation: "Copy",
        command: "copy()",
        result: "Succeeded",
        success: true
      });
    }

    expect(repo.list("host-1")).toHaveLength(505);
    repo.clear("host-1");
    expect(repo.list("host-1")).toEqual([]);
  });
});

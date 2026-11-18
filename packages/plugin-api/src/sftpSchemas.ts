import { z } from "zod";
import { sessionStateSchema } from "@hypershell/shared";

export const sftpEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  isDirectory: z.boolean(),
  permissions: z.number(),
  owner: z.number(),
  group: z.number()
});
export type SftpEntry = z.infer<typeof sftpEntrySchema>;

export const sftpConnectRequestSchema = z.union([
  z.object({
    hostId: z.string(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
  }),
  z.object({
    sessionId: z.string(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
  })
]);
export type SftpConnectRequest = z.infer<typeof sftpConnectRequestSchema>;

// Host key details returned when the remote key is unknown or has changed.
// Sent as a structured response field — never encoded inside an error message —
// so the renderer can raise a host-key challenge without parsing error text.
export const hostKeyVerificationInfoSchema = z.object({
  hostname: z.string(),
  port: z.number(),
  algorithm: z.string(),
  fingerprint: z.string(),
  verificationStatus: z.enum(["new_host", "key_changed"]),
  previousFingerprint: z.string().optional(),
});
export type HostKeyVerificationInfo = z.infer<typeof hostKeyVerificationInfoSchema>;

export const sftpConnectResponseSchema = z.union([
  z.object({
    sftpSessionId: z.string()
  }),
  z.object({
    hostKeyVerification: hostKeyVerificationInfoSchema
  })
]);
export type SftpConnectResponse = z.infer<typeof sftpConnectResponseSchema>;

export const sftpDisconnectRequestSchema = z.object({
  sftpSessionId: z.string()
});
export type SftpDisconnectRequest = z.infer<typeof sftpDisconnectRequestSchema>;

export const sftpListRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string()
});
export type SftpListRequest = z.infer<typeof sftpListRequestSchema>;

export const sftpListResponseSchema = z.object({
  entries: z.array(sftpEntrySchema)
});
export type SftpListResponse = z.infer<typeof sftpListResponseSchema>;

export const sftpStatRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string()
});
export type SftpStatRequest = z.infer<typeof sftpStatRequestSchema>;

export const sftpChmodRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  permissions: z.number().int().min(0).max(0o7777)
});
export type SftpChmodRequest = z.infer<typeof sftpChmodRequestSchema>;

export const sftpMkdirRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string()
});
export type SftpMkdirRequest = z.infer<typeof sftpMkdirRequestSchema>;

export const sftpRenameRequestSchema = z.object({
  sftpSessionId: z.string(),
  oldPath: z.string(),
  newPath: z.string()
});
export type SftpRenameRequest = z.infer<typeof sftpRenameRequestSchema>;

export const sftpCopyRequestSchema = z.object({
  sftpSessionId: z.string(),
  paths: z.array(z.string()).min(1),
  targetDirectory: z.string()
});
export type SftpCopyRequest = z.infer<typeof sftpCopyRequestSchema>;

export const sftpDeleteRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  recursive: z.boolean().optional().default(false)
});
export type SftpDeleteRequest = z.infer<typeof sftpDeleteRequestSchema>;

export const sftpDeleteWithBackupRequestSchema = z.object({
  sftpSessionId: z.string(),
  paths: z.array(z.string()).min(1)
});
export type SftpDeleteWithBackupRequest = z.infer<typeof sftpDeleteWithBackupRequestSchema>;

export const sftpDeleteWithBackupResponseSchema = z.object({
  backupId: z.string(),
  archivePath: z.string(),
  expiresAt: z.number(),
  deletedPaths: z.array(z.string()),
  failedPaths: z.array(z.string())
});
export type SftpDeleteWithBackupResponse = z.infer<typeof sftpDeleteWithBackupResponseSchema>;

export const sftpRestoreDeleteBackupRequestSchema = z.object({
  sftpSessionId: z.string(),
  backupId: z.string(),
  paths: z.array(z.string()).min(1)
});
export type SftpRestoreDeleteBackupRequest = z.infer<typeof sftpRestoreDeleteBackupRequestSchema>;

export const sftpOperationLogSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  operation: z.string(),
  command: z.string(),
  result: z.string(),
  success: z.boolean(),
  undoData: z.unknown().optional()
});
export type SftpOperationLog = z.infer<typeof sftpOperationLogSchema>;

export const sftpOperationLogsListRequestSchema = z.object({ hostId: z.string() });
export const sftpOperationLogsListResponseSchema = z.object({
  logs: z.array(sftpOperationLogSchema)
});
export const sftpOperationLogAppendRequestSchema = z.object({
  hostId: z.string(),
  log: sftpOperationLogSchema
});
export const sftpOperationLogsClearRequestSchema = z.object({ hostId: z.string() });

export const sftpReadFileRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string()
});
export type SftpReadFileRequest = z.infer<typeof sftpReadFileRequestSchema>;

export const sftpReadFileResponseSchema = z.object({
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]),
  // Null when the server permits reading the file but refuses to stat it. The
  // file still opens; only the save-conflict check is unavailable, and the
  // renderer omits `expectedSize`/`expectedModifiedAt` on the write.
  size: z.number().nullable(),
  modifiedAt: z.string().nullable()
});
export type SftpReadFileResponse = z.infer<typeof sftpReadFileResponseSchema>;

export const sftpWriteFileRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).optional().default("utf-8"),
  // Omit both to force an unconditional overwrite. Supplying them makes the
  // write conditional on the remote file being unchanged since it was read.
  expectedSize: z.number().optional(),
  expectedModifiedAt: z.string().optional()
});
export type SftpWriteFileRequest = z.infer<typeof sftpWriteFileRequestSchema>;

export const sftpWriteFileResponseSchema = z.object({
  status: z.enum(["written", "conflict"]),
  size: z.number(),
  modifiedAt: z.string()
});
export type SftpWriteFileResponse = z.infer<typeof sftpWriteFileResponseSchema>;

export const transferOpSchema = z.object({
  type: z.enum(["upload", "download"]),
  localPath: z.string(),
  remotePath: z.string(),
  isDirectory: z.boolean()
});
export type TransferOp = z.infer<typeof transferOpSchema>;

export const sftpTransferStartRequestSchema = z.object({
  sftpSessionId: z.string(),
  operations: z.array(transferOpSchema).min(1),
  chunkConcurrency: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional().default(1)
});
export type SftpTransferStartRequest = z.infer<typeof sftpTransferStartRequestSchema>;

export const sftpTransferCancelRequestSchema = z.object({
  transferId: z.string()
});
export type SftpTransferCancelRequest = z.infer<typeof sftpTransferCancelRequestSchema>;

export const sftpTransferPauseRequestSchema = z.object({
  transferId: z.string()
});
export type SftpTransferPauseRequest = z.infer<typeof sftpTransferPauseRequestSchema>;

export const sftpTransferResumeRequestSchema = z.object({
  transferId: z.string()
});
export type SftpTransferResumeRequest = z.infer<typeof sftpTransferResumeRequestSchema>;

export const sftpTransferRetryRequestSchema = z.object({
  transferId: z.string()
});
export type SftpTransferRetryRequest = z.infer<typeof sftpTransferRetryRequestSchema>;

export const transferJobStatusSchema = z.enum([
  "queued",
  "active",
  "paused",
  "interrupted",
  "completed",
  "failed"
]);
export type TransferJobStatus = z.infer<typeof transferJobStatusSchema>;

export const transferJobSchema = z.object({
  transferId: z.string(),
  groupId: z.string().optional(),
  type: z.enum(["upload", "download"]),
  localPath: z.string(),
  remotePath: z.string(),
  status: transferJobStatusSchema,
  bytesTransferred: z.number(),
  totalBytes: z.number(),
  speed: z.number(),
  error: z.string().optional(),
  // True when the current failed/paused state was caused by an explicit user
  // cancel or pause (vs. a genuine transfer error). Lets the UI distinguish
  // user-initiated stops without parsing the human-facing error message.
  userInitiated: z.boolean().optional()
});
export type TransferJob = z.infer<typeof transferJobSchema>;

export const sftpTransferListResponseSchema = z.object({
  transfers: z.array(transferJobSchema)
});
export type SftpTransferListResponse = z.infer<typeof sftpTransferListResponseSchema>;

export const sftpTransferResolveConflictRequestSchema = z.object({
  transferId: z.string(),
  resolution: z.enum(["overwrite", "skip", "rename"]),
  applyToAll: z.boolean().optional().default(false)
});
export type SftpTransferResolveConflictRequest = z.infer<
  typeof sftpTransferResolveConflictRequestSchema
>;

export const sftpEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("transfer-progress"),
    transferId: z.string(),
    bytesTransferred: z.number(),
    totalBytes: z.number(),
    speed: z.number(),
    status: transferJobStatusSchema
  }),
  z.object({
    kind: z.literal("transfer-conflict"),
    transferId: z.string(),
    remotePath: z.string(),
    localPath: z.string()
  }),
  z.object({
    kind: z.literal("status"),
    sftpSessionId: z.string(),
    state: sessionStateSchema
  }),
  z.object({
    kind: z.literal("transfer-complete"),
    // Lets the renderer route directory invalidation to the one SFTP tab that
    // owns this transfer instead of refreshing every open tab.
    sftpSessionId: z.string(),
    transferId: z.string(),
    status: z.enum(["completed", "failed"]),
    error: z.string().optional()
  })
]);
export type SftpEvent = z.infer<typeof sftpEventSchema>;

export const sftpBookmarkSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  name: z.string(),
  remotePath: z.string(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type SftpBookmark = z.infer<typeof sftpBookmarkSchema>;

export const sftpBookmarkListRequestSchema = z.object({
  hostId: z.string()
});
export type SftpBookmarkListRequest = z.infer<typeof sftpBookmarkListRequestSchema>;

export const sftpBookmarkUpsertRequestSchema = z.object({
  id: z.string().optional(),
  hostId: z.string(),
  name: z.string(),
  remotePath: z.string(),
  sortOrder: z.number().optional()
});
export type SftpBookmarkUpsertRequest = z.infer<typeof sftpBookmarkUpsertRequestSchema>;

export const sftpBookmarkRemoveRequestSchema = z.object({
  id: z.string()
});
export type SftpBookmarkRemoveRequest = z.infer<typeof sftpBookmarkRemoveRequestSchema>;

export const sftpBookmarkReorderRequestSchema = z.object({
  bookmarkIds: z.array(z.string())
});
export type SftpBookmarkReorderRequest = z.infer<typeof sftpBookmarkReorderRequestSchema>;

// --- Sync schemas ---

export const sftpSyncConfigSchema = z.object({
  sftpSessionId: z.string().min(1),
  localPath: z.string().min(1),
  remotePath: z.string().min(1),
  direction: z.enum(["local-to-remote", "remote-to-local", "bidirectional"]),
  excludePatterns: z.array(z.string()).default([]),
  deleteOrphans: z.boolean().default(false),
});

export const sftpSyncStartRequestSchema = sftpSyncConfigSchema;

export const sftpSyncStopRequestSchema = z.object({
  syncId: z.string().min(1),
});

export const sftpSyncStatusSchema = z.object({
  syncId: z.string().min(1),
  status: z.enum(["scanning", "syncing", "idle", "error", "stopped"]),
  filesScanned: z.number().int(),
  filesSynced: z.number().int(),
  bytesTransferred: z.number(),
  lastError: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
});

export const sftpSyncEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sync-progress"),
    syncId: z.string(),
    filesScanned: z.number(),
    filesSynced: z.number(),
    currentFile: z.string(),
  }),
  z.object({
    kind: z.literal("sync-complete"),
    syncId: z.string(),
    filesSynced: z.number(),
    bytesTransferred: z.number(),
    filesFailed: z.number(),
  }),
  z.object({
    kind: z.literal("sync-error"),
    syncId: z.string(),
    error: z.string(),
  }),
]);

export type SftpSyncConfig = z.infer<typeof sftpSyncConfigSchema>;
export type SftpSyncStartRequest = z.infer<typeof sftpSyncStartRequestSchema>;
export type SftpSyncStopRequest = z.infer<typeof sftpSyncStopRequestSchema>;
export type SftpSyncStatus = z.infer<typeof sftpSyncStatusSchema>;
export type SftpSyncEvent = z.infer<typeof sftpSyncEventSchema>;

// -- Keyboard-interactive auth schemas --

export const keyboardInteractivePromptSchema = z.object({
  prompt: z.string(),
  echo: z.boolean(),
});
export type KeyboardInteractivePrompt = z.infer<typeof keyboardInteractivePromptSchema>;

export const keyboardInteractiveRequestSchema = z.object({
  requestId: z.string(),
  name: z.string(),
  instructions: z.string(),
  prompts: z.array(keyboardInteractivePromptSchema),
});
export type KeyboardInteractiveRequest = z.infer<typeof keyboardInteractiveRequestSchema>;

export const keyboardInteractiveResponseSchema = z.object({
  requestId: z.string(),
  responses: z.array(z.string()),
});
export type KeyboardInteractiveResponse = z.infer<typeof keyboardInteractiveResponseSchema>;

export const sftpDragOutRequestSchema = z.object({
  sftpSessionId: z.string(),
  remotePath: z.string(),
  fileName: z.string(),
  isDirectory: z.boolean().optional(),
  prepareOnly: z.boolean().optional(),
});
export type SftpDragOutRequest = z.infer<typeof sftpDragOutRequestSchema>;

export const sftpDragOutResponseSchema = z.object({
  tempPath: z.string(),
});
export type SftpDragOutResponse = z.infer<typeof sftpDragOutResponseSchema>;

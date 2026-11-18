import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { SqliteDatabase } from "@hypershell/db";
import {
  createSessionRecordingRepositoryFromDatabase,
  type SessionRecordingRecord,
} from "./repositories/sessionRecordingRepository";
import { AsciinemaWriter, readAsciinemaCast } from "@hypershell/session-core";
import {
  ipcChannels,
  startRecordingRequestSchema,
  stopRecordingRequestSchema,
  getRecordingStateRequestSchema,
  deleteRecordingRequestSchema,
  getRecordingFramesRequestSchema,
  exportRecordingRequestSchema,
  recordingStateResponseSchema,
  recordingFramesResponseSchema,
  sessionRecordingRecordSchema,
  deleteRecordingResponseSchema,
  exportRecordingResponseSchema,
  type StartRecordingRequest,
  type StopRecordingRequest,
  type RecordingStateResponse,
  type RecordingFramesResponse,
  type DeleteRecordingResponse,
  type ExportRecordingResponse,
} from "@hypershell/shared";

import type { PluginIpcMain, PluginPlatformApi } from "@hypershell/plugin-api";

type SessionRecordingRepository = ReturnType<typeof createSessionRecordingRepositoryFromDatabase>;

type ActiveRecording = {
  sessionId: string;
  recordingId: string;
  writer: AsciinemaWriter;
};

export interface SessionRecordingManager {
  start(request: StartRecordingRequest): Promise<SessionRecordingRecord>;
  stop(request: StopRecordingRequest): Promise<SessionRecordingRecord | null>;
  getState(sessionId: string): RecordingStateResponse;
  list(): SessionRecordingRecord[];
  delete(id: string): Promise<DeleteRecordingResponse>;
  getFrames(id: string): RecordingFramesResponse;
  exportRecording(id: string, filePath: string): ExportRecordingResponse;
  onSessionData(sessionId: string, data: string): void;
  stopAll(): Promise<void>;
}

function resolveCaptureDirectory(db: SqliteDatabase, key: "recordingDirectory" | "textLogDirectory", fallback: string): string {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("app.settings") as { value?: string } | undefined;
    const settings = row?.value ? JSON.parse(row.value) as { terminal?: Record<string, unknown> } : undefined;
    const configured = settings?.terminal?.[key];
    return typeof configured === "string" && configured.trim() ? path.resolve(configured.trim()) : fallback;
  } catch {
    return fallback;
  }
}

function resolveRecordingsDir(platform: PluginPlatformApi, db: SqliteDatabase): string {
  return resolveCaptureDirectory(db, "recordingDirectory", path.join(platform.paths.getUserDataDirectory(), "recordings"));
}

function buildRecordingFileName(nowMs: number, sessionName: string): string {
  const safeName = sessionName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().replace(/[. ]+$/g, "") || "Terminal";
  const ts = new Date(nowMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${safeName}_${ts}.cast`;
}

function assertSafeExportPath(filePath: string, platform: PluginPlatformApi): string {
  return platform.paths.resolveSafeExportPath(filePath);
}

export function createSessionRecordingManager(
  db: SqliteDatabase,
  platform: PluginPlatformApi
): SessionRecordingManager {
  const repo: SessionRecordingRepository = createSessionRecordingRepositoryFromDatabase(db);
  const activeBySessionId = new Map<string, ActiveRecording>();

  function getFilePath(fileName: string): string {
    return path.join(resolveRecordingsDir(platform, db), fileName);
  }

  repo.backfillFilePaths(getFilePath);

  return {
    async start(request) {
      const existing = activeBySessionId.get(request.sessionId);
      if (existing) {
        await this.stop({ sessionId: request.sessionId });
      }

      const nowMs = Date.now();
      const recordingId = randomUUID();
      const fileName = buildRecordingFileName(nowMs, request.sessionName || request.title || "Terminal");
      const filePath = getFilePath(fileName);
      mkdirSync(path.dirname(filePath), { recursive: true });

      const title = request.title?.trim() || `Session ${new Date(nowMs).toISOString()}`;
      const writer = new AsciinemaWriter({
        filePath,
        width: request.width,
        height: request.height,
        title,
        startedAtMs: nowMs,
      });

      const created = repo.create({
        id: recordingId,
        hostId: request.hostId ?? null,
        title,
        fileName,
        filePath,
        width: request.width,
        height: request.height,
        startedAt: new Date(nowMs).toISOString(),
      });

      activeBySessionId.set(request.sessionId, {
        sessionId: request.sessionId,
        recordingId,
        writer,
      });

      return created;
    },

    async stop(request) {
      const active = activeBySessionId.get(request.sessionId);
      if (!active) {
        return null;
      }

      activeBySessionId.delete(request.sessionId);

      const finalized = await active.writer.finalize();
      return (
        repo.complete(active.recordingId, {
          endedAt: finalized.endedAt,
          durationMs: finalized.durationMs,
          fileSizeBytes: finalized.fileSizeBytes,
          eventCount: finalized.eventCount,
        }) ?? null
      );
    },

    getState(sessionId) {
      const active = activeBySessionId.get(sessionId);
      if (!active) {
        return {
          active: false,
          recording: null,
        };
      }

      return {
        active: true,
        recording: repo.get(active.recordingId) ?? null,
      };
    },

    list() {
      return repo.list(500);
    },

    async delete(id) {
      for (const [sessionId, active] of activeBySessionId) {
        if (active.recordingId === id) {
          await this.stop({ sessionId });
          break;
        }
      }

      const record = repo.get(id);
      if (!record) {
        return { deleted: false };
      }

      const filePath = record.filePath || getFilePath(record.fileName);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }

      return { deleted: repo.remove(id) };
    },

    getFrames(id) {
      const recording = repo.get(id);
      if (!recording) {
        throw new Error(`Recording ${id} was not found`);
      }

      const filePath = recording.filePath || getFilePath(recording.fileName);
      if (!existsSync(filePath)) {
        throw new Error(`Recording file does not exist: ${recording.fileName}`);
      }

      const parsed = readAsciinemaCast(filePath);
      return {
        recording,
        header: parsed.header,
        frames: parsed.frames,
      };
    },

    exportRecording(id, targetPath) {
      const recording = repo.get(id);
      if (!recording) {
        throw new Error(`Recording ${id} was not found`);
      }

      const sourcePath = recording.filePath || getFilePath(recording.fileName);
      if (!existsSync(sourcePath)) {
        throw new Error(`Recording file does not exist: ${recording.fileName}`);
      }

      const safeTargetPath = assertSafeExportPath(targetPath, platform);
      mkdirSync(path.dirname(safeTargetPath), { recursive: true });
      copyFileSync(sourcePath, safeTargetPath);

      return { filePath: safeTargetPath };
    },

    onSessionData(sessionId, data) {
      const active = activeBySessionId.get(sessionId);
      if (!active) {
        return;
      }

      active.writer.appendOutput(data);
    },

    async stopAll() {
      const sessionIds = [...activeBySessionId.keys()];
      await Promise.all(sessionIds.map((sessionId) => this.stop({ sessionId })));
    },
  };
}

export function registerRecordingIpc(
  ipcMain: PluginIpcMain,
  manager: SessionRecordingManager
): void {
  ipcMain.handle(ipcChannels.recording.start, async (_event: unknown, request: unknown) => {
    const parsed = startRecordingRequestSchema.parse(request);
    const created = await manager.start(parsed);
    return sessionRecordingRecordSchema.parse(created);
  });

  ipcMain.handle(ipcChannels.recording.stop, async (_event: unknown, request: unknown) => {
    const parsed = stopRecordingRequestSchema.parse(request);
    const stopped = await manager.stop(parsed);
    if (!stopped) {
      return null;
    }
    return sessionRecordingRecordSchema.parse(stopped);
  });

  ipcMain.handle(ipcChannels.recording.getState, async (_event: unknown, request: unknown) => {
    const parsed = getRecordingStateRequestSchema.parse(request);
    return recordingStateResponseSchema.parse(manager.getState(parsed.sessionId));
  });

  ipcMain.handle(ipcChannels.recording.list, async () => {
    return manager.list().map((record) => sessionRecordingRecordSchema.parse(record));
  });

  ipcMain.handle(ipcChannels.recording.delete, async (_event: unknown, request: unknown) => {
    const parsed = deleteRecordingRequestSchema.parse(request);
    const response = await manager.delete(parsed.id);
    return deleteRecordingResponseSchema.parse(response);
  });

  ipcMain.handle(ipcChannels.recording.getFrames, async (_event: unknown, request: unknown) => {
    const parsed = getRecordingFramesRequestSchema.parse(request);
    const response = manager.getFrames(parsed.id);
    return recordingFramesResponseSchema.parse(response);
  });

  ipcMain.handle(ipcChannels.recording.export, async (_event: unknown, request: unknown) => {
    const parsed = exportRecordingRequestSchema.parse(request);
    const response = manager.exportRecording(parsed.id, parsed.filePath);
    return exportRecordingResponseSchema.parse(response);
  });
}

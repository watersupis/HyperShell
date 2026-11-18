import { z } from "zod";

export const CLAUDE_SESSION_INFO_METHOD = "claude.sessionInfo";

export const claudeSessionInfoRequestSchema = z.object({
  sessionId: z.string().min(1).max(128),
}).strict();

export const claudeSessionInfoSchema = z.object({
  sessionId: z.string(),
  title: z.string().nullable(),
  cwd: z.string().nullable(),
  lastActiveAt: z.string(),
});

export const claudeSessionInfoResponseSchema = z.object({
  info: claudeSessionInfoSchema.nullable(),
}).strict();

export type ClaudeSessionInfoResponse = z.infer<typeof claudeSessionInfoResponseSchema>;

import { z } from "zod";

export const connectionHistoryRecordSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().nullable(),
  hostName: z.string().nullable(),
  connectedAt: z.string(),
  disconnectedAt: z.string().nullable(),
  wasSuccessful: z.boolean(),
  errorMessage: z.string().nullable(),
});

export const connectionHistoryRecordArraySchema = z.array(connectionHistoryRecordSchema);

export const listConnectionHistoryByHostRequestSchema = z.object({
  hostId: z.string().min(1),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const listRecentConnectionHistoryRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .default({});

export type ConnectionHistoryRecord = z.infer<typeof connectionHistoryRecordSchema>;
export type ListConnectionHistoryByHostRequest = z.infer<
  typeof listConnectionHistoryByHostRequestSchema
>;
export type ListRecentConnectionHistoryRequest = z.infer<
  typeof listRecentConnectionHistoryRequestSchema
>;

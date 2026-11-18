import type { PluginMainMethodRegistry } from "@hypershell/plugin-api";
import {
  connectionHistoryRecordArraySchema,
  listConnectionHistoryByHostRequestSchema,
  listRecentConnectionHistoryRequestSchema,
} from "../connectionHistory";
import type { ConnectionHistoryRepository } from "./connectionHistoryRepository";

export function registerConnectionHistoryMethods(
  methods: PluginMainMethodRegistry,
  repo: ConnectionHistoryRepository,
): () => void {
  const unregisterByHost = methods.register("ssh", "connectionHistory.listByHost", (payload) => {
    const request = listConnectionHistoryByHostRequestSchema.parse(payload);
    return connectionHistoryRecordArraySchema.parse(
      repo.listByHost(request.hostId, request.limit ?? 200),
    );
  });
  const unregisterRecent = methods.register("ssh", "connectionHistory.listRecent", (payload) => {
    const request = listRecentConnectionHistoryRequestSchema.parse(payload ?? {});
    return connectionHistoryRecordArraySchema.parse(repo.listRecent(request.limit ?? 200));
  });

  return () => {
    unregisterRecent();
    unregisterByHost();
  };
}

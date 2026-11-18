import type { PluginMainMethodRegistry } from "@hypershell/plugin-api";

import { getClaudeSessionInfo } from "./claudeSessions";
import {
  CLAUDE_SESSION_INFO_METHOD,
  claudeSessionInfoRequestSchema,
  claudeSessionInfoResponseSchema,
} from "../contracts";

export function registerClaudeMainMethods(
  methods: PluginMainMethodRegistry
): () => void {
  return methods.register("local-terminal", CLAUDE_SESSION_INFO_METHOD, async (payload) => {
    const parsed = claudeSessionInfoRequestSchema.parse(payload);
    const info = await getClaudeSessionInfo(parsed.sessionId).catch(() => null);
    return claudeSessionInfoResponseSchema.parse({ info });
  });
}

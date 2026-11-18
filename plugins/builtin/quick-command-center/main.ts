import { createPluginStorageRepositoryFromDatabase, type SqliteDatabase } from "@hypershell/db";
import type { PluginMainMethodRegistry } from "@hypershell/plugin-api";
import type { SessionManager } from "@hypershell/session-core";
import { z } from "zod";
import { QUICK_COMMAND_CENTER_ID } from "./constants";
import initialKnowledgeBase from "./knowledge-base/latest.json";
import { fetchFigKnowledgeBase } from "./figSpecSnapshot";

export { QUICK_COMMAND_CENTER_ID } from "./constants";
const LEGACY_SNIPPETS_SOURCE = "hypershell.command-snippets.v1";
const KNOWLEDGE_COLLECTION = "fig-knowledge";
const KNOWLEDGE_META_KEY = "current";
const COMMANDS_RESET_KEY = "initial-commands-cleared-v1";

const snippetSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  body: z.string().max(4096).refine((value) => value.trim().length > 0),
  prefix: z.string().trim().max(80).optional(),
  group: z.string().trim().max(80).optional(),
  createdAt: z.string().optional(),
  description: z.string().trim().max(240).optional(),
}).strict();
const knowledgeEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/),
  name: z.string().trim().min(1).max(120),
  prefix: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/),
  body: z.string().trim().min(1).max(4096),
  description: z.string().trim().max(240),
}).strict();
const knowledgeBaseSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().regex(/^[a-zA-Z0-9._+-]{1,80}$/),
  source: z.literal("Fig autocomplete specs"),
  sourceUrl: z.literal("https://github.com/withfig/autocomplete"),
  license: z.literal("MIT"),
  commands: z.array(knowledgeEntrySchema).min(1).max(20_000),
}).strict().superRefine((catalog, context) => {
  const ids = new Set<string>();
  for (const [index, command] of catalog.commands.entries()) {
    if (ids.has(command.id)) {
      context.addIssue({ code: "custom", path: ["commands", index, "id"], message: "Duplicate command ID" });
    }
    ids.add(command.id);
  }
});
const knowledgeBaseMetaSchema = z.object({
  version: z.string(),
  updatedAt: z.string(),
  entryCount: z.number().int().nonnegative(),
  source: z.literal("Fig autocomplete specs"),
  license: z.literal("MIT"),
}).strict();

type KnowledgeBaseMeta = z.infer<typeof knowledgeBaseMetaSchema>;

type QuickCommandCenterServices = {
  getDatabase(): SqliteDatabase;
  sessions: SessionManager;
  pluginMainMethods: PluginMainMethodRegistry;
  fetchKnowledgeBase?: () => Promise<unknown>;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
};



export function registerQuickCommandCenterPlugin(services: QuickCommandCenterServices): () => void {
  const storage = createPluginStorageRepositoryFromDatabase(services.getDatabase());
  storage.claimLegacy(QUICK_COMMAND_CENTER_ID, LEGACY_SNIPPETS_SOURCE, "snippets");
  if (!storage.get(QUICK_COMMAND_CENTER_ID, "state", COMMANDS_RESET_KEY)) {
    for (const { key } of storage.list(QUICK_COMMAND_CENTER_ID, "snippets")) {
      storage.remove(QUICK_COMMAND_CENTER_ID, "snippets", key);
    }
    storage.upsert(QUICK_COMMAND_CENTER_ID, "state", COMMANDS_RESET_KEY, true);
  }
  const bundledKnowledgeBase = knowledgeBaseSchema.parse(initialKnowledgeBase);
  const storedMeta = storage.get(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION, KNOWLEDGE_META_KEY);
  const storedVersion = storedMeta && typeof storedMeta.value === "object" && storedMeta.value !== null
    ? (storedMeta.value as { version?: unknown }).version
    : undefined;
  const isLegacyVersion = typeof storedVersion === "string" && /^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(storedVersion);
  if (!storedMeta || isLegacyVersion) {
    const bundledIds = new Set(bundledKnowledgeBase.commands.map((command) => `fig-${command.id}`));
    for (const command of bundledKnowledgeBase.commands) {
      storage.upsert(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION, `fig-${command.id}`, command);
    }
    for (const entry of storage.list(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION)) {
      if (entry.key !== KNOWLEDGE_META_KEY && !bundledIds.has(entry.key)) {
        storage.remove(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION, entry.key);
      }
    }
    storage.upsert(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION, KNOWLEDGE_META_KEY, {
      version: bundledKnowledgeBase.version,
      updatedAt: "Bundled",
      entryCount: bundledKnowledgeBase.commands.length,
      source: "Fig autocomplete specs",
      license: "MIT",
    } satisfies KnowledgeBaseMeta);
  }

  let updatingKnowledgeBase = false;
  const getKnowledgeBaseMeta = (): KnowledgeBaseMeta | null => {
    const stored = storage.get(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION, KNOWLEDGE_META_KEY);
    const parsed = stored ? knowledgeBaseMetaSchema.safeParse(stored.value) : null;
    return parsed?.success ? parsed.data : null;
  };
  const updateKnowledgeBase = async (): Promise<{ updated: boolean; status: KnowledgeBaseMeta }> => {
    if (updatingKnowledgeBase) throw new Error("Knowledge base update is already in progress");
    updatingKnowledgeBase = true;
    try {
      const payload = services.fetchKnowledgeBase
        ? await services.fetchKnowledgeBase()
        : await fetchFigKnowledgeBase(services.fetch);
      const catalog = knowledgeBaseSchema.parse(payload);
      const current = getKnowledgeBaseMeta();
      if (current?.version === catalog.version) return { updated: false, status: current };

      const nextIds = new Set(catalog.commands.map((command) => `fig-${command.id}`));
      for (const command of catalog.commands) {
        storage.upsert(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION, `fig-${command.id}`, command);
      }
      for (const entry of storage.list(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION)) {
        if (entry.key !== KNOWLEDGE_META_KEY && !nextIds.has(entry.key)) {
          storage.remove(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION, entry.key);
        }
      }
      const status = {
        version: catalog.version,
        updatedAt: new Date().toISOString(),
        entryCount: catalog.commands.length,
        source: "Fig autocomplete specs",
        license: "MIT",
      } satisfies KnowledgeBaseMeta;
      storage.upsert(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION, KNOWLEDGE_META_KEY, status);
      return { updated: true, status };
    } finally {
      updatingKnowledgeBase = false;
    }
  };

  const unregister = [
    services.pluginMainMethods.register(QUICK_COMMAND_CENTER_ID, "commands.list", () =>
      storage.list(QUICK_COMMAND_CENTER_ID, "snippets").map(({ key, value, updatedAt }) => {
        const stored = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
        const parsed = snippetSchema.safeParse({ ...stored, id: key, createdAt: stored.createdAt ?? updatedAt });
        return parsed.success ? parsed.data : null;
      }).filter((snippet): snippet is z.infer<typeof snippetSchema> => snippet !== null)
    ),
    services.pluginMainMethods.register(QUICK_COMMAND_CENTER_ID, "knowledgeBase.list", () =>
      storage.list(QUICK_COMMAND_CENTER_ID, KNOWLEDGE_COLLECTION)
        .filter(({ key }) => key !== KNOWLEDGE_META_KEY)
        .map(({ key, value }) => {
          const parsed = knowledgeEntrySchema.safeParse({ ...value as object, id: key.replace(/^fig-/, "") });
          return parsed.success ? parsed.data : null;
        }).filter((command): command is z.infer<typeof knowledgeEntrySchema> => command !== null)
    ),
    services.pluginMainMethods.register(QUICK_COMMAND_CENTER_ID, "knowledgeBase.status", () => getKnowledgeBaseMeta()),
    services.pluginMainMethods.register(QUICK_COMMAND_CENTER_ID, "knowledgeBase.update", () => updateKnowledgeBase()),
    services.pluginMainMethods.register(QUICK_COMMAND_CENTER_ID, "commands.save", (payload) => {
      const snippet = snippetSchema.parse(payload);
      if (snippet.id.startsWith("fig-")) throw new Error("Fig commands are read-only");
      const existing = storage.get(QUICK_COMMAND_CENTER_ID, "snippets", snippet.id);
      const existingCreatedAt = existing && typeof existing.value === "object" && existing.value !== null
        ? (existing.value as { createdAt?: unknown }).createdAt
        : undefined;
      const createdAt = typeof existingCreatedAt === "string"
        ? existingCreatedAt
        : existing?.updatedAt ?? new Date().toISOString();
      const saved = { ...snippet, createdAt };
      storage.upsert(QUICK_COMMAND_CENTER_ID, "snippets", snippet.id, saved);
      return saved;
    }),
    services.pluginMainMethods.register(QUICK_COMMAND_CENTER_ID, "commands.remove", (payload) => {
      const { id } = z.object({ id: z.string().min(1).max(128) }).strict().parse(payload);
      if (id.startsWith("fig-")) throw new Error("Fig commands are read-only");
      return storage.remove(QUICK_COMMAND_CENTER_ID, "snippets", id);
    }),
    services.pluginMainMethods.register(QUICK_COMMAND_CENTER_ID, "sessions.list", () =>
      services.sessions.listSessions()
        .filter((session) => session.transport === "ssh" && session.state === "connected")
        .map((session) => ({ id: session.sessionId, name: session.profileId }))
    ),
    services.pluginMainMethods.register(QUICK_COMMAND_CENTER_ID, "sessions.send", (payload) => {
      const request = z.object({
        sessionIds: z.array(z.string().min(1).max(128)).min(1).max(20),
        command: z.string().max(4096).refine((value) => value.trim().length > 0),
      }).strict().parse(payload);
      if (request.sessionIds.length !== new Set(request.sessionIds).size) {
        throw new Error("Duplicate target sessions are not allowed");
      }
      const connected = new Set(services.sessions.listSessions()
        .filter((session) => session.transport === "ssh" && session.state === "connected")
        .map((session) => session.sessionId));
      if (request.sessionIds.some((id) => !connected.has(id))) {
        throw new Error("One or more target sessions are not connected");
      }
      for (const id of request.sessionIds) services.sessions.write(id, `${request.command}\r`);
      return { sent: request.sessionIds.length };
    }),
  ];

  return () => unregister.forEach((dispose) => dispose());
}

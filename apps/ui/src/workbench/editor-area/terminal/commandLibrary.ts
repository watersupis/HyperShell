import { getShell, hasShell } from "../../shared/shell";

export interface CommandLibraryEntry {
  prefix: string;
  command: string;
  description: string;
}

const QUICK_COMMAND_CENTER_ID = "com.hypershell.quick-command-center";
let catalogPromise: Promise<CommandLibraryEntry[] | null> | null = null;
const COMMAND_LIBRARY_UPDATED_EVENT = "hypershell:command-library-updated";

if (typeof window !== "undefined") {
  window.addEventListener(COMMAND_LIBRARY_UPDATED_EVENT, () => { catalogPromise = null; });
}

export function getCommandSuggestions(
  input: string,
  library: readonly CommandLibraryEntry[]
): CommandLibraryEntry[] {
  if (!input || !/^[a-z0-9][a-z0-9 ._-]*$/i.test(input)) return [];
  const query = input.toLowerCase();
  return library.filter((entry) => entry.command.toLowerCase().startsWith(query));
}

async function loadCommandCatalog(): Promise<CommandLibraryEntry[] | null> {
  if (!hasShell()) return null;
  try {
    const [quickCommands, publicCommands] = await Promise.all([
      getShell().internalPluginsInvoke({ pluginId: QUICK_COMMAND_CENTER_ID, method: "commands.list", payload: undefined }),
      getShell().internalPluginsInvoke({ pluginId: QUICK_COMMAND_CENTER_ID, method: "knowledgeBase.list", payload: undefined }),
    ]);
    const values = [quickCommands, publicCommands].flatMap((items): unknown[] => Array.isArray(items) ? items : []);
    const unique = new Map<string, CommandLibraryEntry>();
    for (const value of values) {
      if (!value || typeof value !== "object") continue;
      const item = value as Record<string, unknown>;
      if (typeof item.body !== "string" || typeof item.prefix !== "string") continue;
      unique.set(item.body, {
        prefix: item.prefix,
        command: item.body,
        description: typeof item.description === "string" ? item.description : "",
      });
    }
    return [...unique.values()];
  } catch {
    return null;
  }
}

export async function loadCommandSuggestions(input: string): Promise<CommandLibraryEntry[]> {
  if (!input || !/^[a-z0-9][a-z0-9 ._-]*$/i.test(input)) return [];
  catalogPromise ??= loadCommandCatalog();
  const catalog = await catalogPromise;
  if (!catalog) {
    catalogPromise = null;
    return [];
  }
  return getCommandSuggestions(input, catalog);
}

import type { SshManagerSnippet } from "@hypershell/shared";
import type { PluginUiHostServices } from "@hypershell/plugin-api";

const COMMAND_SNIPPETS_DATA_TYPE = "hypershell.command-snippets.v1";

type ExternalPluginBridge = PluginUiHostServices["externalPlugins"];

export async function importCommandSnippets(
  externalPlugins: ExternalPluginBridge,
  snippets: SshManagerSnippet[],
): Promise<{ imported: number; warning: string | null }> {
  if (snippets.length === 0) return { imported: 0, warning: null };

  try {
    const receivers = (await externalPlugins.list()).filter((plugin) =>
      plugin.manifest.dataImports?.includes(COMMAND_SNIPPETS_DATA_TYPE)
    );
    if (receivers.length !== 1) {
      return {
        imported: 0,
        warning: receivers.length === 0
          ? "No installed plugin accepts command snippet imports."
          : "More than one installed plugin accepts command snippet imports.",
      };
    }

    const receiver = receivers[0];
    if (!receiver.grantedPermissions.includes("storage.write")) {
      return { imported: 0, warning: "Grant storage write permission to the command plugin, then import again." };
    }

    const results = await Promise.allSettled(snippets.map((snippet) => {
      const id = `sm-${snippet.id}`;
      return externalPlugins.invoke({
        id: receiver.manifest.id,
        method: "storage.upsert",
        args: ["snippets", id, { id, name: snippet.name, body: snippet.command }],
      });
    }));
    const imported = results.filter((result) => result.status === "fulfilled").length;
    return {
      imported,
      warning: imported === snippets.length
        ? null
        : `${snippets.length - imported} command snippet(s) could not be imported.`,
    };
  } catch (error) {
    return {
      imported: 0,
      warning: error instanceof Error ? error.message : "Command snippets could not be imported.",
    };
  }
}

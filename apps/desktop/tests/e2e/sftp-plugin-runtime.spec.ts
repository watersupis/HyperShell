import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { closeApp, launchApp } from "./electronHarness";

const optionalPluginApis = [
  { id: "sftp", method: "sftpTransferList" },
  {
    id: "sftp",
    method: "hostFingerprintLookup",
    args: [{ hostname: "example.test", port: 22, algorithm: "ssh-ed25519" }],
  },
  { id: "local-terminal", method: "listLocalProfiles" },
  { id: "serial", method: "listSerialProfiles" },
  { id: "tunnels", method: "listPortForwards" },
] as const;

async function invokeOptionalPluginApi(page: Page, method: string, args: unknown[] = []) {
  return page.evaluate(async ({ apiName, methodArgs }) => {
    const api = window.hypershell as unknown as Record<string, unknown>;
    const candidate = api[apiName];
    if (typeof candidate !== "function") return { error: `Preload method is missing: ${apiName}` };
    try {
      return { value: await (candidate as (...args: unknown[]) => Promise<unknown>)(...methodArgs) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, { apiName: method, methodArgs: args });
}

test("optional built-in plugins register and remove IPC handlers with their lifecycle", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "hypershell-optional-plugin-e2e-"));
  let app: Awaited<ReturnType<typeof launchApp>>["app"] | undefined;

  try {
    let launched = await launchApp(dataDir);
    app = launched.app;

    for (const plugin of optionalPluginApis) {
      await launched.page.evaluate((id) => window.hypershell.internalPluginsSetEnabled({ id, enabled: false }), plugin.id);
      await closeApp(launched.app);
      app = undefined;
      launched = await launchApp(dataDir);
      app = launched.app;

      const initiallyDisabled = await invokeOptionalPluginApi(launched.page, plugin.method, "args" in plugin ? plugin.args : []);
      expect(initiallyDisabled.error, `${plugin.id} should start disabled`).toContain("No handler registered");

      await expect(launched.page.evaluate((id) => window.hypershell.internalPluginsSetEnabled({ id, enabled: true }), plugin.id))
        .resolves.toMatchObject({ restartRequired: true });
      await closeApp(launched.app);
      app = undefined;
      launched = await launchApp(dataDir);
      app = launched.app;

      const activeResult = await invokeOptionalPluginApi(launched.page, plugin.method, "args" in plugin ? plugin.args : []);
      expect(activeResult.error, `${plugin.id} should register its API when enabled`).toBeUndefined();

      await expect(launched.page.evaluate((id) => window.hypershell.internalPluginsSetEnabled({ id, enabled: false }), plugin.id))
        .resolves.toMatchObject({ restartRequired: true });
      await closeApp(launched.app);
      app = undefined;
      launched = await launchApp(dataDir);
      app = launched.app;

      const afterDeactivation = await invokeOptionalPluginApi(launched.page, plugin.method, "args" in plugin ? plugin.args : []);
      expect(afterDeactivation.error, `${plugin.id} should remove its API when disabled`).toContain("No handler registered");
    }
  } finally {
    if (app) await closeApp(app);
    await rm(dataDir, { recursive: true, force: true });
  }
});

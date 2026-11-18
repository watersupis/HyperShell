import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZipFile } from "yazl";
import type { PluginPermission } from "@hypershell/plugin-api";
import { expect, test } from "@playwright/test";
import { createExternalPluginManager } from "../../src/main/plugin-runtime/externalPluginManager";
import { closeApp, launchApp } from "./electronHarness";

const manifest = {
  formatVersion: 1,
  id: "com.example.runtime-fixture",
  name: "Runtime Fixture",
  version: "1.0.0",
  apiVersion: "1.0.0",
  description: "External plugin runtime E2E fixture.",
  entrypoint: "dist/index.js",
  permissions: [],
  contributions: ["views"],
  ui: { placement: "workspace.secondarySidebar" },
};

async function createPluginPackage(
  outputPath: string,
  placement: "workspace.secondarySidebar" | "workspace.panel" = "workspace.secondarySidebar",
  overrides: Partial<typeof manifest> = {},
): Promise<void> {
  const packageManifest = {
    ...manifest,
    ...overrides,
    ui: placement === "workspace.panel"
      ? { placement, slots: [placement], workspaceToolbar: true }
      : { placement, slots: [placement, "sidebar.navigation"] },
  };
  const sandboxText = placement === "workspace.panel"
    ? "External plugin workspace.panel sandbox is running"
    : "External plugin sandbox is running";
  const files = new Map([
    ["plugin.json", Buffer.from(JSON.stringify(packageManifest))],
    ["dist/index.js", Buffer.from(`export const plugin = {
      activate(context) {
        const root = document.createElement("main");
        root.textContent = ${JSON.stringify(sandboxText)};
        document.body.replaceChildren(root);
        context.registrations.registerView({
          id: "runtime-fixture.main",
          title: "Runtime Fixture View",
          entrypoint: "dist/index.js",
          slot: "${placement}",
        });
      },
    };`)],
  ]);
  const checksums = [...files]
    .map(([filePath, data]) => `${createHash("sha256").update(data).digest("hex")}  ${filePath}`)
    .join("\n");
  const archive = new ZipFile();
  for (const [filePath, data] of files) archive.addBuffer(data, filePath);
  archive.addBuffer(Buffer.from(`${checksums}\n`), "checksums.sha256");

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath);
    output.once("error", reject);
    output.once("finish", resolve);
    archive.outputStream.once("error", reject);
    archive.outputStream.pipe(output);
    archive.end();
  });
}

test("isolates generic plugin storage by owner and requires declared legacy imports", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "hypershell-plugin-storage-e2e-"));
  let app: Awaited<ReturnType<typeof launchApp>>["app"] | undefined;

  try {
    const pluginsDirectory = path.join(dataDir, "HyperShell", "plugins");
    const manager = createExternalPluginManager(pluginsDirectory);
    const packages = [
      { id: "org.example.legacy-source", permissions: ["storage.read", "storage.write"], dataImports: undefined },
      { id: "org.example.importer", permissions: ["storage.read", "storage.write"], dataImports: ["test.legacy.records.v1"] },
      { id: "org.example.unrelated", permissions: ["storage.read", "storage.write"], dataImports: undefined },
    ];
    for (const item of packages) {
      const packagePath = path.join(dataDir, `${item.id}.hspkg`);
      await createPluginPackage(packagePath, "workspace.secondarySidebar", {
        id: item.id,
        permissions: item.permissions,
        dataImports: item.dataImports,
      });
      const installed = await manager.install(packagePath);
      await manager.setPermissions(installed.manifest.id, item.permissions as PluginPermission[]);
    }

    const launched = await launchApp(dataDir);
    app = launched.app;
    const result = await launched.page.evaluate(async () => {
      const api = window.hypershell;
      await api.pluginsInvoke!({
        id: "org.example.legacy-source",
        method: "storage.upsert",
        args: ["test.legacy.records.v1", "record-1", { label: "import me" }],
      });
      const claimed = await api.pluginsInvoke!({
        id: "org.example.importer",
        method: "storage.claimLegacy",
        args: ["test.legacy.records.v1", "records"],
      });
      const imported = await api.pluginsInvoke!({
        id: "org.example.importer",
        method: "storage.list",
        args: ["records"],
      });
      const sourceRecords = await api.pluginsInvoke!({
        id: "org.example.legacy-source",
        method: "storage.list",
        args: ["test.legacy.records.v1"],
      });
      const isolated = await api.pluginsInvoke!({
        id: "org.example.unrelated",
        method: "storage.list",
        args: ["records"],
      });
      let undeclaredImportRejected = false;
      try {
        await api.pluginsInvoke!({
          id: "org.example.unrelated",
          method: "storage.claimLegacy",
          args: ["test.legacy.records.v1", "records"],
        });
      } catch {
        undeclaredImportRejected = true;
      }
      return { claimed, imported, sourceRecords, isolated, undeclaredImportRejected };
    });

    expect(result).toEqual({
      claimed: 0,
      imported: [],
      sourceRecords: [{ key: "record-1", value: { label: "import me" } }],
      isolated: [],
      undeclaredImportRejected: true,
    });
  } finally {
    if (app) await closeApp(app);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("installs and runs an external plugin in its sandboxed Workbench view", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "hypershell-external-plugin-e2e-"));
  let app: Awaited<ReturnType<typeof launchApp>>["app"] | undefined;

  try {
    const packagePath = path.join(dataDir, "runtime-fixture.hspkg");
    await createPluginPackage(packagePath);
    const manager = createExternalPluginManager(path.join(dataDir, "HyperShell", "plugins"));
    const installed = await manager.install(packagePath);
    expect(installed.manifest.id).toBe(manifest.id);
    expect(installed.grantedPermissions).toEqual([]);

    const launched = await launchApp(dataDir);
    app = launched.app;
    await launched.page.getByRole("button", { name: "Runtime Fixture" }).click();

    const sandbox = launched.page.frameLocator('iframe[title="Runtime Fixture sandbox"]');
    await expect(sandbox.getByText("External plugin sandbox is running")).toBeVisible();
    await expect(launched.page.getByText("This plugin has no view contribution yet")).toHaveCount(0);
  } finally {
    if (app) await closeApp(app);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("installs and renders an external plugin in the generic Workbench panel", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "hypershell-external-panel-plugin-e2e-"));
  let app: Awaited<ReturnType<typeof launchApp>>["app"] | undefined;

  try {
    const packagePath = path.join(dataDir, "runtime-panel-fixture.hspkg");
    await createPluginPackage(packagePath, "workspace.panel");
    const manager = createExternalPluginManager(path.join(dataDir, "HyperShell", "plugins"));
    const installed = await manager.install(packagePath);
    expect(installed.manifest.ui?.slots).toEqual(["workspace.panel"]);

    const launched = await launchApp(dataDir);
    app = launched.app;
    await launched.page.getByTitle("Runtime Fixture", { exact: true }).click();

    const panel = launched.page.getByRole("region", { name: "Panel" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("tab", { name: "Runtime Fixture" })).toHaveAttribute("aria-selected", "true");
    const sandbox = launched.page.frameLocator('iframe[title="Runtime Fixture sandbox"]');
    await expect(sandbox.getByText("External plugin workspace.panel sandbox is running")).toBeVisible();

    await panel.getByRole("button", { name: "Close panel" }).click();
    await expect(panel).toHaveCount(0);
  } finally {
    if (app) await closeApp(app);
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("builds, installs shipped external plugin packages and renders the navigation plugin", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const pluginPaths = [
    "plugins/external/broadcast-snippets",
    "plugins/external/host-monitor",
    "plugins/external/network-diagnostics",
    "plugins/external/process-manager",
  ];
  const dataDir = await mkdtemp(path.join(tmpdir(), "hypershell-shipped-plugin-e2e-"));
  let app: Awaited<ReturnType<typeof launchApp>>["app"] | undefined;

  try {
    const manager = createExternalPluginManager(path.join(dataDir, "HyperShell", "plugins"));
    const installed = [];
    for (const pluginPath of pluginPaths) {
      const result = spawnSync(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["plugin:pack", "--", pluginPath],
        {
          cwd: repoRoot,
          encoding: "utf8",
          shell: process.platform === "win32",
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
        },
      );
      if (result.status !== 0) {
        throw new Error(`Failed to package ${pluginPath}:\n${result.stderr || result.stdout}`);
      }
      const packagePath = result.stdout.trim().split(/\r?\n/).at(-1);
      if (!packagePath) throw new Error(`Pack command did not report an artifact for ${pluginPath}`);
      const plugin = await manager.install(packagePath);
      await manager.setPermissions(plugin.manifest.id, plugin.manifest.permissions);
      installed.push(plugin);
    }
    expect((await manager.list()).map(({ manifest: plugin }) => plugin.id).sort()).toEqual(
      installed.map(({ manifest: plugin }) => plugin.id).sort(),
    );

    const launched = await launchApp(dataDir);
    app = launched.app;
    const runtimePlugins = await launched.page.evaluate(() => window.hypershell.pluginsList());
    for (const plugin of installed) {
      if (plugin.manifest.id === "com.hypershell.quick-command-center") continue;
      await launched.page.evaluate((id) => window.hypershell.pluginsRuntime(id), plugin.manifest.id);
    }
    await launched.page.getByRole("button", { name: "Host Monitor" }).click();
    const hostMonitor = launched.page.frameLocator('iframe[title="Host Monitor sandbox"]');
    await expect(hostMonitor.getByRole("heading", { name: /Host Monitor|主机监控/ })).toBeVisible();
    expect(runtimePlugins.some(({ manifest: plugin }) => plugin.id === "com.hypershell.host-monitor")).toBe(true);
    await expect(launched.page.getByRole("alert")).toHaveCount(0);
  } finally {
    if (app) await closeApp(app);
    await rm(dataDir, { recursive: true, force: true });
  }
});

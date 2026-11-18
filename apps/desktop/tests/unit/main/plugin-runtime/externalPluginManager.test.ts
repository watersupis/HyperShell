import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZipFile } from "yazl";
import { afterEach, describe, expect, it } from "vitest";
import { createExternalPluginManager } from "../../../../src/main/plugin-runtime/externalPluginManager";

const manifest = {
  formatVersion: 1,
  id: "com.example.test-plugin",
  name: "Test Plugin",
  version: "1.0.0",
  apiVersion: "1.0.0",
  description: "Plugin fixture",
  entrypoint: "dist/index.js",
  permissions: ["hosts.read"],
  contributions: ["views"],
};

const temporaryDirectories: string[] = [];

async function makePackage(files: Record<string, Buffer | string>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "hypershell-plugin-test-"));
  temporaryDirectories.push(directory);
  const archivePath = path.join(directory, "fixture.hspkg");
  const entries = Object.entries(files).map(([filePath, value]) => [filePath, Buffer.isBuffer(value) ? value : Buffer.from(value)] as const);
  const checksums = entries.map(([filePath, data]) => `${createHash("sha256").update(data).digest("hex")}  ${filePath}`).join("\n");
  const archive = new ZipFile();
  for (const [filePath, data] of entries) archive.addBuffer(data, filePath);
  archive.addBuffer(Buffer.from(`${checksums}\n`), "checksums.sha256");
  await new Promise<void>((resolve, reject) => {
    archive.outputStream.once("error", reject);
    const output = createWriteStream(archivePath);
    output.once("error", reject);
    output.once("finish", resolve);
    archive.outputStream.pipe(output);
    archive.end();
  });
  return archivePath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("external plugin manager", () => {
  it("installs a verified package, persists explicit permissions, and uninstalls", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hypershell-plugin-manager-"));
    temporaryDirectories.push(directory);
    const manager = createExternalPluginManager(path.join(directory, "plugins"));
    const archive = await makePackage({ "plugin.json": JSON.stringify(manifest), "dist/index.js": "export {};" });

    expect(await manager.readManifest(archive)).toEqual(manifest);
    const installed = await manager.install(archive);
    expect(installed.runtimeAvailable).toBe(true);
    expect(installed.grantedPermissions).toEqual([]);
    await manager.setPermissions(manifest.id, ["hosts.read"]);
    expect((await manager.list())[0]?.grantedPermissions).toEqual(["hosts.read"]);
    await expect(manager.setPermissions(manifest.id, ["processes.terminate"])).rejects.toThrow("did not request");
    await manager.uninstall(manifest.id);
    expect(await manager.list()).toEqual([]);
  });

  it("updates an installed plugin atomically and retains only still-requested grants", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hypershell-plugin-update-"));
    temporaryDirectories.push(directory);
    const manager = createExternalPluginManager(path.join(directory, "plugins"));
    const initial = await makePackage({ "plugin.json": JSON.stringify(manifest), "dist/index.js": "export const version = 1;" });
    await manager.install(initial);
    await manager.setPermissions(manifest.id, ["hosts.read"]);
    const newerManifest = { ...manifest, version: "2.0.0", permissions: ["hosts.read", "sessions.read"] };
    const update = await makePackage({ "plugin.json": JSON.stringify(newerManifest), "dist/index.js": "export const version = 2;" });

    const result = await manager.install(update, manifest.id);
    expect(result.manifest.version).toBe("2.0.0");
    expect(result.grantedPermissions).toEqual(["hosts.read"]);
    expect(await readFile(path.join(directory, "plugins", "installed", manifest.id, "dist/index.js"), "utf8")).toContain("version = 2");
    await expect(manager.install(initial, "com.example.other-plugin")).rejects.toThrow("same plugin id");
    expect((await manager.list())[0]?.manifest.version).toBe("2.0.0");
  });

  it("serializes concurrent registry updates and installs", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hypershell-plugin-concurrent-"));
    temporaryDirectories.push(directory);
    const pluginsRoot = path.join(directory, "plugins");
    const manager = createExternalPluginManager(pluginsRoot);
    const firstPackage = await makePackage({ "plugin.json": JSON.stringify(manifest), "dist/index.js": "export {};" });
    const secondManifest = { ...manifest, id: "com.example.second-plugin" };
    const secondPackage = await makePackage({ "plugin.json": JSON.stringify(secondManifest), "dist/index.js": "export {};" });

    await Promise.all([manager.install(firstPackage), manager.install(secondPackage)]);
    await Promise.all(Array.from({ length: 8 }, (_, index) =>
      manager.setPermissions(manifest.id, index % 2 === 0 ? ["hosts.read"] : [])
    ));

    expect((await manager.list()).map((plugin) => plugin.manifest.id).sort()).toEqual([
      "com.example.second-plugin",
      manifest.id,
    ]);
    expect((await readdir(pluginsRoot)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    await Promise.all([manager.uninstall(manifest.id), manager.uninstall(secondManifest.id)]);
    expect(await manager.list()).toEqual([]);
  });

  it("rejects path traversal and checksum tampering", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hypershell-plugin-manager-"));
    temporaryDirectories.push(root);
    const manager = createExternalPluginManager(path.join(root, "plugins"));
    const traversal = await makePackage({ "plugin.json": JSON.stringify(manifest), "dist/index.js": "export {};", "x/y": "x" });
    const archiveBytes = await readFile(traversal);
    const originalName = Buffer.from("x/y");
    const traversalName = Buffer.from("../");
    for (let offset = archiveBytes.indexOf(originalName); offset >= 0; offset = archiveBytes.indexOf(originalName, offset + originalName.length)) {
      traversalName.copy(archiveBytes, offset);
    }
    await writeFile(traversal, archiveBytes);
    await expect(manager.install(traversal)).rejects.toThrow();

    const zip = new ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)), "plugin.json");
    zip.addBuffer(Buffer.from("tampered"), "dist/index.js");
    zip.addBuffer(Buffer.from(`${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}  plugin.json\n${"0".repeat(64)}  dist/index.js\n`), "checksums.sha256");
    const badArchive = path.join(root, "bad.hspkg");
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(badArchive);
      output.once("error", reject);
      output.once("finish", resolve);
      zip.outputStream.pipe(output);
      zip.end();
    });
    await expect(manager.install(badArchive)).rejects.toThrow("Plugin checksum mismatch");
  });
});

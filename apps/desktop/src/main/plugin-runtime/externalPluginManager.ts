import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";
import { z } from "zod";
import { PLUGIN_API_VERSION, pluginManifestSchema, pluginPermissionSchema, type PluginManifest, type PluginPermission } from "@hypershell/plugin-api";

const MAX_PACKAGE_SIZE = 64 * 1024 * 1024;
const MAX_UNCOMPRESSED_SIZE = 128 * 1024 * 1024;
const MAX_FILE_SIZE = 32 * 1024 * 1024;
const MAX_RUNTIME_SOURCE_SIZE = 8 * 1024 * 1024;
const MAX_FILE_COUNT = 2048;
const REGISTRY_FILE = "registry.json";
const registrySchema = z.record(z.object({
  installedAt: z.string().datetime(),
  grantedPermissions: z.array(z.string()).max(32),
}).strict());

export type InstalledPlugin = {
  manifest: PluginManifest;
  installedAt: string;
  grantedPermissions: PluginPermission[];
  runtimeAvailable: true;
};

export type PluginRuntimePackage = {
  manifest: PluginManifest;
  grantedPermissions: PluginPermission[];
  source: string;
};

type Registry = Record<string, Omit<InstalledPlugin, "manifest" | "runtimeAvailable">>;
type ArchiveFile = { path: string; data: Buffer };

function isSafeArchivePath(value: string): boolean {
  return value.length > 0 && !value.includes("\\") && !value.startsWith("/") &&
    !value.includes("\0") && value.split("/").every((part) => part && part !== "." && part !== "..");
}

function openArchive(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true }, (error, archive) => {
      if (error || !archive) reject(error ?? new Error("Unable to read plugin archive"));
      else resolve(archive);
    });
  });
}

function readEntry(archive: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    archive.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(error ?? new Error("Unable to read archive entry"));
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

async function readArchiveFiles(filePath: string): Promise<ArchiveFile[]> {
  const details = await stat(filePath);
  if (details.size > MAX_PACKAGE_SIZE) throw new Error("Plugin package exceeds the 64 MB limit");
  const archive = await openArchive(filePath);
  const files: ArchiveFile[] = [];
  const paths = new Set<string>();
  let totalSize = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      archive.on("error", reject);
      archive.on("end", resolve);
      archive.on("entry", (entry: yauzl.Entry) => {
        void (async () => {
          const isDirectory = entry.fileName.endsWith("/");
          const archivePath = isDirectory ? entry.fileName.slice(0, -1) : entry.fileName;
          const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
          const fileType = unixMode & 0o170000;
          if (!isSafeArchivePath(archivePath) || paths.has(archivePath) ||
            (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000)) {
            throw new Error(`Unsafe or duplicate plugin path: ${entry.fileName}`);
          }
          paths.add(archivePath);
          if (isDirectory) {
            archive.readEntry();
            return;
          }
          if (files.length >= MAX_FILE_COUNT || entry.uncompressedSize > MAX_FILE_SIZE) {
            throw new Error("Plugin archive exceeds file limits");
          }
          totalSize += entry.uncompressedSize;
          if (totalSize > MAX_UNCOMPRESSED_SIZE) throw new Error("Plugin archive expands beyond 128 MB");
          files.push({ path: archivePath, data: await readEntry(archive, entry) });
          archive.readEntry();
        })().catch(reject);
      });
      archive.readEntry();
    });
  } finally {
    archive.close();
  }
  return files;
}

function parseChecksums(data: Buffer): Map<string, string> {
  const checksums = new Map<string, string>();
  for (const line of data.toString("utf8").split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    if (!match || !isSafeArchivePath(match[2]) || checksums.has(match[2])) throw new Error("Invalid plugin checksum manifest");
    checksums.set(match[2], match[1]);
  }
  return checksums;
}

export function createExternalPluginManager(rootDirectory: string) {
  const registryPath = path.join(rootDirectory, REGISTRY_FILE);
  const pluginsDirectory = path.join(rootDirectory, "installed");
  let registryMutationQueue: Promise<void> = Promise.resolve();

  function serializeRegistryMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = registryMutationQueue.then(operation);
    registryMutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function readRegistry(): Promise<Registry> {
    try {
      const parsed: unknown = JSON.parse(await readFile(registryPath, "utf8"));
      const valid = registrySchema.parse(parsed);
      for (const [id, record] of Object.entries(valid)) {
        if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id) || id.length > 80 ||
          record.grantedPermissions.some((permission) => !pluginPermissionSchema.safeParse(permission).success)) {
          throw new Error("Invalid plugin registry entry");
        }
      }
      return valid as Registry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error("Plugin registry is unreadable; refusing to modify installed plugins", { cause: error });
    }
  }

  async function writeRegistry(registry: Registry): Promise<void> {
    await mkdir(rootDirectory, { recursive: true });
    const temporaryPath = `${registryPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          await rename(temporaryPath, registryPath);
          return;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!(["EPERM", "EACCES", "EBUSY"] as string[]).includes(code ?? "") || attempt >= 5) throw error;
          await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
        }
      }
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  return {
    async readManifest(archivePath: string): Promise<PluginManifest> {
      const files = await readArchiveFiles(archivePath);
      const manifestData = files.find((file) => file.path === "plugin.json")?.data;
      if (!manifestData) throw new Error("Plugin package is missing plugin.json");
      const result = pluginManifestSchema.safeParse(JSON.parse(manifestData.toString("utf8")));
      if (!result.success) throw new Error(`Invalid plugin manifest: ${result.error.message}`);
      return result.data;
    },

    async list(): Promise<InstalledPlugin[]> {
      const registry = await readRegistry();
      const installed: InstalledPlugin[] = [];
      for (const [id, record] of Object.entries(registry)) {
        if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id) || id.length > 80) continue;
        try {
          const data = await readFile(path.join(pluginsDirectory, id, "plugin.json"), "utf8");
          const parsed = pluginManifestSchema.safeParse(JSON.parse(data));
          if (!parsed.success || parsed.data.id !== id) continue;
          installed.push({ manifest: parsed.data, ...record, runtimeAvailable: true });
        } catch {
          continue;
        }
      }
      return installed.sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
    },

    async install(archivePath: string, updateId?: string): Promise<InstalledPlugin> {
      const files = await readArchiveFiles(archivePath);
      const byPath = new Map(files.map((file) => [file.path, file.data]));
      const manifestData = byPath.get("plugin.json");
      const checksumData = byPath.get("checksums.sha256");
      if (!manifestData || !checksumData) throw new Error("Plugin package is missing plugin.json or checksums.sha256");
      const manifestResult = pluginManifestSchema.safeParse(JSON.parse(manifestData.toString("utf8")));
      if (!manifestResult.success) throw new Error(`Invalid plugin manifest: ${manifestResult.error.message}`);
      const manifest = manifestResult.data;
      if (updateId && manifest.id !== updateId) throw new Error("Update package must have the same plugin id");
      if (manifest.apiVersion.split(".")[0] !== PLUGIN_API_VERSION.split(".")[0]) {
        throw new Error(`Incompatible plugin API version: ${manifest.apiVersion}`);
      }
      if (!manifest.entrypoint.startsWith("dist/")) throw new Error("Plugin entrypoint must be inside dist/");
      if (!byPath.has(manifest.entrypoint)) throw new Error("Plugin entrypoint is missing from package");

      const checksums = parseChecksums(checksumData);
      if (checksums.size !== files.length - 1) throw new Error("Checksum manifest does not cover every package file");
      for (const file of files) {
        if (file.path === "checksums.sha256") continue;
        const expected = checksums.get(file.path);
        const actual = createHash("sha256").update(file.data).digest("hex");
        if (expected !== actual) throw new Error(`Plugin checksum mismatch: ${file.path}`);
      }

      return serializeRegistryMutation(async () => {
        const registry = await readRegistry();
        const previous = registry[manifest.id];
        if (!updateId && previous) throw new Error(`Plugin ${manifest.id} is already installed`);
        if (updateId && !previous) throw new Error("Plugin is not installed");
        await mkdir(pluginsDirectory, { recursive: true });
        const stagingDirectory = path.join(pluginsDirectory, `.install-${process.pid}-${randomUUID()}`);
        const destinationDirectory = path.join(pluginsDirectory, manifest.id);
        await mkdir(stagingDirectory, { recursive: false });
        const backupDirectory = path.join(pluginsDirectory, `.backup-${process.pid}-${randomUUID()}`);
        let backedUp = false;
        let moved = false;
        try {
          for (const file of files) {
            const targetPath = path.resolve(stagingDirectory, ...file.path.split("/"));
            if (!targetPath.startsWith(`${stagingDirectory}${path.sep}`)) throw new Error(`Unsafe plugin path: ${file.path}`);
            await mkdir(path.dirname(targetPath), { recursive: true });
            await writeFile(targetPath, file.data, { flag: "wx", mode: 0o600 });
          }
          if (updateId) {
            await rename(destinationDirectory, backupDirectory);
            backedUp = true;
          }
          await rename(stagingDirectory, destinationDirectory);
          moved = true;
          registry[manifest.id] = {
            installedAt: previous?.installedAt ?? new Date().toISOString(),
            grantedPermissions: previous?.grantedPermissions.filter((permission) => manifest.permissions.includes(permission)) ?? [],
          };
          await writeRegistry(registry);
        } catch (error) {
          await rm(stagingDirectory, { recursive: true, force: true });
          if (moved) await rm(destinationDirectory, { recursive: true, force: true });
          if (backedUp) await rename(backupDirectory, destinationDirectory);
          throw error;
        }
        if (backedUp) await rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined);
        return { manifest, ...registry[manifest.id], runtimeAvailable: true };
      });
    },

    async runtime(id: string): Promise<PluginRuntimePackage> {
      if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id) || id.length > 80) throw new Error("Invalid plugin id");
      const registry = await readRegistry();
      const record = registry[id];
      if (!record) throw new Error("Plugin is not installed");
      const pluginDirectory = path.join(pluginsDirectory, id);
      const manifest = pluginManifestSchema.parse(JSON.parse(await readFile(path.join(pluginDirectory, "plugin.json"), "utf8")));
      const entryPath = path.resolve(pluginDirectory, ...manifest.entrypoint.split("/"));
      if (!entryPath.startsWith(`${pluginDirectory}${path.sep}`)) throw new Error("Invalid plugin entrypoint");
      const [manifestFile, sourceFile, checksumsFile] = await Promise.all([
        readFile(path.join(pluginDirectory, "plugin.json")),
        readFile(entryPath),
        readFile(path.join(pluginDirectory, "checksums.sha256")),
      ]);
      if (manifest.id !== id || sourceFile.byteLength > MAX_RUNTIME_SOURCE_SIZE) throw new Error("Installed plugin manifest or entrypoint is invalid");
      const checksums = parseChecksums(checksumsFile);
      if (createHash("sha256").update(manifestFile).digest("hex") !== checksums.get("plugin.json") ||
        createHash("sha256").update(sourceFile).digest("hex") !== checksums.get(manifest.entrypoint)) {
        throw new Error("Installed plugin failed integrity verification");
      }
      return { manifest, grantedPermissions: record.grantedPermissions, source: sourceFile.toString("utf8") };
    },

    async setPermissions(id: string, permissions: PluginPermission[]): Promise<void> {
      if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id) || id.length > 80) throw new Error("Invalid plugin id");
      await serializeRegistryMutation(async () => {
        const registry = await readRegistry();
        if (!registry[id]) throw new Error("Plugin is not installed");
        const manifest = pluginManifestSchema.parse(JSON.parse(await readFile(path.join(pluginsDirectory, id, "plugin.json"), "utf8")));
        if (permissions.some((permission) => !manifest.permissions.includes(permission))) throw new Error("Cannot grant permissions the plugin did not request");
        registry[id] = { ...registry[id], grantedPermissions: [...new Set(permissions)] };
        await writeRegistry(registry);
      });
    },

    async uninstall(id: string): Promise<void> {
      if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id) || id.length > 80) throw new Error("Invalid plugin id");
      await serializeRegistryMutation(async () => {
        const registry = await readRegistry();
        if (!registry[id]) return;
        delete registry[id];
        await writeRegistry(registry);
        await rm(path.join(pluginsDirectory, id), { recursive: true, force: true });
      });
    }
  };
}

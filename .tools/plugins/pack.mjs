import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build as bundlePlugin } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pluginPath = process.argv.slice(2).find((argument) => argument !== "--");
if (!pluginPath) throw new Error("Usage: pnpm plugin:pack -- plugins/<plugin-name>");

const build = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", "@hypershell/plugin-api", "build"], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
if (build.status !== 0) process.exit(build.status ?? 1);
const { pluginManifestSchema } = await import("../../packages/plugin-api/dist/manifest.js");
const yazl = await import("yazl");
const requestedPluginRoot = path.resolve(repoRoot, pluginPath);
const pluginRoot = await realpath(requestedPluginRoot);
const realRepoRoot = await realpath(repoRoot);
if (pluginRoot === realRepoRoot || !pluginRoot.startsWith(`${realRepoRoot}${path.sep}`)) throw new Error("Plugin path must resolve inside the repository");
const manifestPath = path.join(pluginRoot, "plugin.json");
const manifestDetails = await lstat(manifestPath);
if (manifestDetails.isSymbolicLink()) throw new Error("Plugin manifest must not be a symlink");
const pluginPackagePath = path.join(pluginRoot, "package.json");
const packageDetails = await lstat(pluginPackagePath);
if (packageDetails.isSymbolicLink()) throw new Error("Plugin package metadata must not be a symlink");
const pluginPackage = JSON.parse(await readFile(pluginPackagePath, "utf8"));
const pluginBuild = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", pluginPackage.name, "build"], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
if (pluginBuild.status !== 0) process.exit(pluginBuild.status ?? 1);
const manifestResult = pluginManifestSchema.safeParse(JSON.parse(await readFile(manifestPath, "utf8")));
if (!manifestResult.success) throw new Error(manifestResult.error.message);
const manifest = manifestResult.data;
if (!manifest.entrypoint.startsWith("dist/")) throw new Error("entrypoint must be inside dist/");
const entrypoint = path.resolve(pluginRoot, manifest.entrypoint);
const bundledEntrypoint = await bundlePlugin({
  absWorkingDir: pluginRoot,
  entryPoints: [manifest.entrypoint],
  outfile: manifest.entrypoint,
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
  legalComments: "none",
});
if (bundledEntrypoint.outputFiles.length !== 1 || !bundledEntrypoint.outputFiles[0].path.endsWith(".js")) {
  throw new Error("Plugin entrypoint must bundle to one JavaScript file");
}
const bundledSource = Buffer.from(bundledEntrypoint.outputFiles[0].contents);

async function collect(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const details = await lstat(fullPath);
    if (details.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${fullPath}`);
    if (details.isDirectory()) await collect(fullPath, files);
    else if (details.isFile()) files.push(fullPath);
  }
  return files;
}

const includedFiles = [manifestPath];
for (const folder of ["dist", "assets"]) {
  const folderPath = path.join(pluginRoot, folder);
  try {
    if ((await lstat(folderPath)).isDirectory()) includedFiles.push(...await collect(folderPath));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (!includedFiles.includes(entrypoint)) throw new Error(`Missing plugin entrypoint: ${manifest.entrypoint}`);
includedFiles.sort((left, right) => path.relative(pluginRoot, left).localeCompare(path.relative(pluginRoot, right)));
const checksums = [];
const toArchivePath = (filePath) => path.relative(pluginRoot, filePath).split(path.sep).join("/");
for (const filePath of includedFiles) {
  const data = filePath === entrypoint ? bundledSource : await readFile(filePath);
  checksums.push(`${createHash("sha256").update(data).digest("hex")}  ${toArchivePath(filePath)}`);
}
const outputDirectory = path.join(pluginRoot, ".packages");
await mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, `${manifest.id}-${manifest.version}.hspkg`);
const archive = new yazl.ZipFile();
for (const filePath of includedFiles) {
  const archivePath = toArchivePath(filePath);
  if (filePath === entrypoint) archive.addBuffer(bundledSource, archivePath);
  else archive.addFile(filePath, archivePath);
}
archive.addBuffer(Buffer.from(`${checksums.join("\n")}\n`), "checksums.sha256");
const finished = new Promise((resolve, reject) => {
  archive.outputStream.on("close", resolve);
  archive.outputStream.on("error", reject);
});
archive.outputStream.pipe(createWriteStream(outputPath));
archive.end();
await finished;
process.stdout.write(`${outputPath}\n`);

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkPluginBoundaries } from "./check-boundaries.mjs";

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "hypershell-plugin-boundaries-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  async function addPackage(folder, name, manifest = {}) {
    const directory = path.join(root, folder);
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, ...manifest }));
    return directory;
  }

  const host = await addPackage("apps/desktop", "@hypershell/desktop");
  const api = await addPackage("packages/plugin-api", "@hypershell/plugin-api");
  const alpha = await addPackage("plugins/builtin/alpha", "@hypershell/plugin-alpha", {
    dependencies: { "@hypershell/plugin-api": "workspace:*" },
  });
  const beta = await addPackage("plugins/external/beta", "@hypershell/plugin-beta");
  await writeFile(path.join(alpha, "plugin.json"), JSON.stringify({ id: "alpha" }));
  await writeFile(path.join(beta, "plugin.json"), JSON.stringify({ id: "beta" }));
  return { root, host, api, alpha, beta };
}

test("allows public package imports and imports within the owning plugin", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(path.join(fixture.alpha, "src/index.ts"), [
    'import type { Contract } from "@hypershell/plugin-api";',
    'import { helper } from "./helper.js";',
    "export { helper };",
    "",
  ].join("\n"));
  await writeFile(path.join(fixture.alpha, "src/helper.ts"), "export const helper = 1;\n");

  const result = await checkPluginBoundaries(fixture.root);
  assert.deepEqual(result.violations, []);
  assert.equal(result.pluginCount, 2);
  assert.equal(result.scannedFiles, 2);
});

test("rejects host, package-private, cross-plugin imports and plugin dependencies", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(path.join(fixture.alpha, "src/index.ts"), [
    'import "../../../../apps/desktop/src/main.ts";',
    'import "@hypershell/plugin-api/src/internal.js";',
    'import "@hypershell/plugin-beta";',
    'import("../../../../packages/plugin-api/src/private.js");',
    'import "@hypershell/desktop";',
    "",
  ].join("\n"));
  const manifestPath = path.join(fixture.alpha, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.devDependencies = { "@hypershell/plugin-beta": "workspace:*" };
  await writeFile(manifestPath, JSON.stringify(manifest));

  const result = await checkPluginBoundaries(fixture.root);
  assert.equal(result.violations.length, 6);
  assert.match(result.violations.join("\n"), /host app source/);
  assert.match(result.violations.join("\n"), /package src internals/);
  assert.match(result.violations.join("\n"), /another plugin package/);
  assert.match(result.violations.join("\n"), /host app package/);
  assert.match(result.violations.join("\n"), /workspace package source/);
  assert.match(result.violations.join("\n"), /dependency on plugin/);
});

test("rejects dependencies on host application packages", async (t) => {
  const fixture = await createFixture(t);
  const manifestPath = path.join(fixture.alpha, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies["@hypershell/desktop"] = "workspace:*";
  await writeFile(manifestPath, JSON.stringify(manifest));

  const result = await checkPluginBoundaries(fixture.root);
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0], /dependency on host app/);
});

test("rejects plugin-ID conditionals in host code while allowing generic dispatch", async (t) => {
  const fixture = await createFixture(t);
  const hostSource = [
    "if (request.pluginId === \"alpha\") return renderAlpha();",
    "if (request.pluginId !== \"beta\") return null;",
    "switch (pluginId) { case \"alpha\": return true; }",
    "if (request[\"pluginId\"] === \"beta\") return renderBeta();",
    "if (plugin.id === \"alpha\") return renderAlphaById();",
    "if (plugin[\"id\"] === \"beta\") return renderBetaById();",
    "if (request.transport === \"ssh\") return runTransport();",
  ].join(String.fromCharCode(10));
  await writeFile(path.join(fixture.host, "src/main.ts"), hostSource);

  const result = await checkPluginBoundaries(fixture.root);
  const hostViolations = result.violations.filter((item) => item.includes("host code must resolve pluginId"));
  assert.equal(hostViolations.length, 6);
  assert.match(hostViolations.join(" "), /alpha/);
  assert.match(hostViolations.join(" "), /beta/);
});

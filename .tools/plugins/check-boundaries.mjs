import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "../..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const ignoredDirectories = new Set([".packages", "dist", "node_modules", "release"]);

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function findWorkspacePackages(root, folder) {
  const packages = [];
  const parent = path.join(root, folder);
  let entries;
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return packages;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(parent, entry.name);
    const manifestPath = path.join(directory, "package.json");
    try {
      const manifest = await readJson(manifestPath);
      if (typeof manifest.name === "string") packages.push({ directory, manifest, manifestPath });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return packages;
}

async function collectSourceFiles(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await collectSourceFiles(path.join(directory, entry.name), files);
      }
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function getModuleSpecifiers(sourceFile) {
  const specifiers = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push({ text: node.moduleSpecifier.text, line: sourceFile.getLineAndCharacterOfPosition(node.moduleSpecifier.getStart(sourceFile)).line + 1 });
    } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require")) {
        specifiers.push({ text: node.arguments[0].text, line: sourceFile.getLineAndCharacterOfPosition(node.arguments[0].getStart(sourceFile)).line + 1 });
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specifiers.push({ text: node.argument.literal.text, line: sourceFile.getLineAndCharacterOfPosition(node.argument.literal.getStart(sourceFile)).line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function dependencyEntries(manifest) {
  return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
    .flatMap((field) => Object.keys(manifest[field] ?? {}));
}

function getPluginIdBranches(sourceFile, pluginIds) {
  const branches = [];
  const isPluginId = (node) => {
    if (ts.isIdentifier(node) && node.text === "pluginId") return true;
    if (ts.isPropertyAccessExpression(node) && node.name.text === "pluginId") return true;
    if (ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "pluginId") return true;

    if (ts.isPropertyAccessExpression(node) && node.name.text === "id") {
      return true;
    }
    return ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "id";
  };
  const addBranch = (node, pluginId) => {
    if (pluginIds.has(pluginId)) {
      branches.push({ pluginId, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
    }
  };

  function visit(node) {
    if (ts.isBinaryExpression(node) && [
      ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ].includes(node.operatorToken.kind)) {
      if (isPluginId(node.left) && ts.isStringLiteral(node.right)) addBranch(node, node.right.text);
      if (isPluginId(node.right) && ts.isStringLiteral(node.left)) addBranch(node, node.left.text);
    } else if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) {
      let parent = node.parent;
      while (parent && !ts.isSwitchStatement(parent)) parent = parent.parent;
      if (parent && isPluginId(parent.expression)) addBranch(node, node.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return branches;
}

export async function checkPluginBoundaries(root = defaultRoot) {
  const plugins = [
    ...await findWorkspacePackages(root, "plugins/builtin"),
    ...await findWorkspacePackages(root, "plugins/external"),
  ];
  const apps = await findWorkspacePackages(root, "apps");
  const pluginByName = new Map(plugins.map((plugin) => [plugin.manifest.name, plugin]));
  const pluginIds = new Set();
  for (const plugin of plugins) {
    try {
      const manifest = await readJson(path.join(plugin.directory, "plugin.json"));
      if (typeof manifest.id === "string") pluginIds.add(manifest.id);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const appNames = new Set(apps.map((app) => app.manifest.name));
  const violations = [];
  let scannedFiles = 0;

  for (const plugin of plugins) {
    for (const dependency of dependencyEntries(plugin.manifest)) {
      if (pluginByName.has(dependency)) {
        violations.push(`${path.relative(root, plugin.manifestPath)}: dependency on plugin ${dependency} is not allowed`);
      } else if (appNames.has(dependency)) {
        violations.push(`${path.relative(root, plugin.manifestPath)}: dependency on host app ${dependency} is not allowed`);
      }
    }

    const files = await collectSourceFiles(plugin.directory);
    for (const filePath of files) {
      scannedFiles += 1;
      const sourceText = await readFile(filePath, "utf8");
      const scriptKind = filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);

      for (const specifier of getModuleSpecifiers(sourceFile)) {
        const relativeFile = path.relative(root, filePath).split(path.sep).join("/");
        const location = `${relativeFile}:${specifier.line}`;
        const packageMatch = specifier.text.match(/^(@[^/]+\/[^/]+|[^/]+)/);
        const importedPackage = packageMatch?.[1];
        const targetPlugin = importedPackage ? pluginByName.get(importedPackage) : undefined;

        if (targetPlugin && targetPlugin.directory !== plugin.directory) {
          violations.push(`${location}: import from another plugin package ${importedPackage} is not allowed`);
        }
        if (appNames.has(importedPackage)) {
          violations.push(`${location}: import from host app package ${importedPackage} is not allowed`);
        }
        if (/^@[^/]+\/[^/]+\/src(?:\/|$)/.test(specifier.text)) {
          violations.push(`${location}: package src internals are not public imports (${specifier.text})`);
        }
        if (/^(?:apps|packages)\//.test(specifier.text) || /^plugins\/(?:builtin|external)\//.test(specifier.text)) {
          violations.push(`${location}: workspace source must not be imported by repository-root path (${specifier.text})`);
        }

        if (specifier.text.startsWith(".")) {
          const targetPath = path.resolve(path.dirname(filePath), specifier.text);
          if (!isWithin(plugin.directory, targetPath)) {
            const targetPluginRoot = plugins.find((candidate) => isWithin(candidate.directory, targetPath));
            const targetWorkspacePath = path.relative(root, targetPath).split(path.sep).join("/");
            let reason = "outside its plugin directory";
            if (targetWorkspacePath.startsWith("apps/")) reason = "host app source";
            else if (targetWorkspacePath.startsWith("packages/")) reason = "workspace package source";
            else if (targetPluginRoot) reason = `another plugin's source (${targetPluginRoot.manifest.name})`;
            violations.push(`${location}: relative import escapes the plugin boundary into ${reason} (${specifier.text})`);
          }
        }
      }
    }
  }

  for (const app of apps) {
    let files = [];
    try {
      files = await collectSourceFiles(path.join(app.directory, "src"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const filePath of files) {
      if (filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx")) continue;
      const relativeFile = path.relative(root, filePath).split(path.sep).join("/");
      const sourceText = await readFile(filePath, "utf8");
      const scriptKind = filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
      for (const branch of getPluginIdBranches(sourceFile, pluginIds)) {
        violations.push(`${relativeFile}:${branch.line}: host code must resolve pluginId ${branch.pluginId} through contributions, not a plugin-specific branch`);
      }
    }
  }

  return { pluginCount: plugins.length, scannedFiles, violations: [...new Set(violations)].sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await checkPluginBoundaries(process.argv.includes("--root")
    ? path.resolve(process.argv[process.argv.indexOf("--root") + 1])
    : defaultRoot);
  if (result.violations.length) {
    process.stderr.write(`${result.violations.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Plugin boundary check passed: ${result.pluginCount} plugins, ${result.scannedFiles} source files.\n`);
  }
}

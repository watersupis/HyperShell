import { parse } from "@babel/parser";

const FIG_REPOSITORY = "https://github.com/withfig/autocomplete";
const FIG_MASTER_ATOM = `${FIG_REPOSITORY}/commits/master.atom`;
const FIG_RAW_COMMIT = "https://raw.githubusercontent.com/withfig/autocomplete";
const FIG_SPEC_NAMES = [
  "git", "docker", "kubectl", "npm", "pnpm", "yarn", "ssh", "curl", "tar", "grep", "find",
  "brew", "aws", "terraform", "systemctl", "podman", "helm",
] as const;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_SNAPSHOT_ENTRIES = 20_000;
const FETCH_TIMEOUT_MS = 45_000;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type AstNode = { type?: string; [key: string]: unknown };

function asNode(value: unknown): AstNode | null {
  return value !== null && typeof value === "object" ? value as AstNode : null;
}

function unwrap(value: unknown): AstNode | null {
  let current = asNode(value);
  while (current && ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "ParenthesizedExpression"].includes(String(current.type))) {
    current = asNode(current.expression);
  }
  return current;
}

function resolveStaticNode(value: unknown, bindings: Map<string, AstNode>, seen = new Set<string>()): AstNode | null {
  const current = unwrap(value);
  if (!current || current.type !== "Identifier" || typeof current.name !== "string") return current;
  if (seen.has(current.name)) return null;
  const initializer = bindings.get(current.name);
  if (!initializer) return current;
  seen.add(current.name);
  return resolveStaticNode(initializer, bindings, seen);
}

function staticStrings(value: unknown, bindings: Map<string, AstNode>): string[] {
  const current = resolveStaticNode(value, bindings);
  if (!current) return [];
  if (current.type === "StringLiteral") return typeof current.value === "string" ? [current.value] : [];
  if (current.type === "TemplateLiteral") {
    const expressions = Array.isArray(current.expressions) ? current.expressions : [];
    const quasis = Array.isArray(current.quasis) ? current.quasis : [];
    if (expressions.length !== 0 || quasis.length !== 1) return [];
    const valueNode = asNode(asNode(quasis[0])?.value);
    return typeof valueNode?.cooked === "string" ? [valueNode.cooked] : [];
  }
  if (current.type === "ArrayExpression" && Array.isArray(current.elements)) {
    return current.elements.flatMap((item) => {
      const element = asNode(item);
      return element?.type === "SpreadElement"
        ? staticStrings(element.argument, bindings)
        : staticStrings(item, bindings);
    });
  }
  return [];
}

function objectProperty(object: unknown, name: string, bindings: Map<string, AstNode>): AstNode | null {
  const current = resolveStaticNode(object, bindings);
  if (current?.type !== "ObjectExpression" || !Array.isArray(current.properties)) return null;
  for (const item of current.properties) {
    const property = asNode(item);
    if (property?.type === "SpreadElement") {
      const spreadValue = objectProperty(property.argument, name, bindings);
      if (spreadValue) return spreadValue;
      continue;
    }
    if (property?.type !== "ObjectProperty" || property.computed) continue;
    const key = asNode(property.key);
    const keyName = key?.type === "Identifier" ? key.name : key?.type === "StringLiteral" ? key.value : undefined;
    if (keyName === name) return asNode(property.value);
  }
  return null;
}

function arrayNodes(value: unknown, bindings: Map<string, AstNode>): AstNode[] {
  const current = resolveStaticNode(value, bindings);
  if (current?.type !== "ArrayExpression" || !Array.isArray(current.elements)) return [];
  return current.elements.flatMap((item) => {
    const element = asNode(item);
    if (element?.type === "SpreadElement") return arrayNodes(element.argument, bindings);
    const resolved = resolveStaticNode(item, bindings);
    return resolved ? [resolved] : [];
  });
}

function findCompletionSpec(source: string): { root: AstNode; bindings: Map<string, AstNode> } | null {
  const file = parse(source, { sourceType: "module", plugins: ["typescript"] }) as unknown as AstNode;
  const program = asNode(file.program);
  const body = Array.isArray(program?.body) ? program.body : [];
  const bindings = new Map<string, AstNode>();
  let root: AstNode | null = null;

  for (const item of body) {
    const topLevel = asNode(item);
    const declaration = topLevel?.type === "VariableDeclaration" ? topLevel : asNode(topLevel?.declaration);
    if (declaration?.type === "VariableDeclaration" && declaration.kind === "const") {
      for (const entry of Array.isArray(declaration.declarations) ? declaration.declarations : []) {
        const variable = asNode(entry);
        const id = asNode(variable?.id);
        const initializer = unwrap(variable?.init);
        if (id?.type !== "Identifier" || !initializer) continue;
        bindings.set(String(id.name), initializer);
        if (id.name === "completionSpec") root = initializer;
      }
    }
    if (!root && topLevel?.type === "ExportDefaultDeclaration") {
      const exported = unwrap(topLevel.declaration);
      if (exported?.type === "ObjectExpression") root = exported;
    }
  }

  return root ? { root, bindings } : null;
}

export function extractFigStaticCommands(source: string, expectedCommand: string) {
  const parsed = findCompletionSpec(source);
  if (!parsed) return [];
  const { root, bindings } = parsed;
  const rootNames = staticStrings(objectProperty(root, "name", bindings), bindings);
  const rootName = rootNames.find((name) => /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(name)) ?? expectedCommand;
  const commands = new Map<string, { id: string; name: string; prefix: string; body: string; description: string }>();

  const add = (path: string[], description: string) => {
    if (path.length < 2 || commands.size >= MAX_SNAPSHOT_ENTRIES) return;
    const prefix = path.join(" ");
    const id = `${expectedCommand}-${path.slice(1).join("-")}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 96);
    if (!id || commands.has(id)) return;
    commands.set(id, { id, name: prefix, prefix, body: prefix, description: description.slice(0, 240) });
  };

  const visit = (spec: AstNode, path: string[]) => {
    const description = staticStrings(objectProperty(spec, "description", bindings), bindings)[0] ?? "";
    if (path.length > 1) add(path, description);

    for (const option of arrayNodes(objectProperty(spec, "options", bindings), bindings)) {
      if (objectProperty(option, "args", bindings)) continue;
      const names = staticStrings(objectProperty(option, "name", bindings), bindings);
      const optionName = names.find((name) => /^--?[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name));
      if (optionName) {
        add([...path, optionName], staticStrings(objectProperty(option, "description", bindings), bindings)[0] ?? "");
      }
    }

    for (const child of arrayNodes(objectProperty(spec, "subcommands", bindings), bindings)) {
      const name = staticStrings(objectProperty(child, "name", bindings), bindings)
        .find((candidate) => /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(candidate));
      if (name) visit(child, [...path, name]);
    }
  };

  visit(root, [rootName]);
  return [...commands.values()];
}

async function fetchText(url: string, allowedHost: string, fetchImpl: FetchLike): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
    headers: { Accept: "text/plain, application/atom+xml" },
    cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to fetch ${allowedHost}: ${detail}`, { cause: error });
  }
  if (!response.ok) throw new Error(`Fig repository responded ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_SOURCE_BYTES) throw new Error("Fig spec exceeds the 2 MB per-file limit");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_SOURCE_BYTES) {
    throw new Error("Fig spec exceeds the 2 MB per-file limit");
  }
  return text;
}

export async function fetchFigKnowledgeBase(fetchImpl: FetchLike = fetch): Promise<unknown> {
  const atom = await fetchText(FIG_MASTER_ATOM, "github.com", fetchImpl);
  const commit = atom.match(/tag:github\.com,2008:Grit::Commit\/([a-f0-9]{40})/)?.[1];
  if (!commit) throw new Error("Unable to identify the latest Fig commit");

  let totalBytes = new TextEncoder().encode(atom).byteLength;
  const sources = await Promise.all(FIG_SPEC_NAMES.map(async (name) => {
    const source = await fetchText(`${FIG_RAW_COMMIT}/${commit}/src/${name}.ts`, "raw.githubusercontent.com", fetchImpl);
    totalBytes += new TextEncoder().encode(source).byteLength;
    if (totalBytes > MAX_TOTAL_SOURCE_BYTES) throw new Error("Fig specs exceed the 24 MB total limit");
    return { name, source };
  }));

  const unique = new Map<string, ReturnType<typeof extractFigStaticCommands>[number]>();
  for (const { name, source } of sources) {
    for (const command of extractFigStaticCommands(source, name)) {
      if (unique.size >= MAX_SNAPSHOT_ENTRIES) break;
      unique.set(command.id, command);
    }
  }
  if (unique.size === 0) throw new Error("No static Fig command definitions were found");

  return {
    schemaVersion: 1,
    version: commit,
    source: "Fig autocomplete specs",
    sourceUrl: FIG_REPOSITORY,
    license: "MIT",
    commands: [...unique.values()],
  };
}

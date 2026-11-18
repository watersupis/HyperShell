export function expandSnippetCommand(body: string, parameters: Record<string, string>): string {
  const placeholders = [...new Set([...body.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]))];
  const missing = placeholders.filter((name) =>
    !Object.prototype.hasOwnProperty.call(parameters, name) || !parameters[name].trim()
  );
  const unused = Object.keys(parameters).filter((name) => !placeholders.includes(name));
  if (missing.length || unused.length) {
    throw new Error(`Snippet parameters mismatch. Missing: ${missing.join(", ")}; unknown: ${unused.join(", ")}`);
  }

  const command = body.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => parameters[name]);
  if (command.length > 4096) throw new Error("Expanded snippet exceeds the 4096 character limit");
  return command;
}

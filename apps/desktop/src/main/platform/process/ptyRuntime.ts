import type { PtySpawn } from "@hypershell/session-core";

declare const require: (id: string) => unknown;

let cachedSpawn: PtySpawn | undefined;

function getNodePtySpawn(): PtySpawn {
  if (cachedSpawn) return cachedSpawn;

  const loaded = require("node-pty") as { spawn?: PtySpawn };
  if (!loaded.spawn) {
    throw new Error("node-pty did not provide a spawn function");
  }

  cachedSpawn = loaded.spawn;
  return cachedSpawn;
}

export const spawnPty: PtySpawn = (file, args, options) =>
  getNodePtySpawn()(file, args, options);

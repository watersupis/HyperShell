import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/*",
  "packages/*",
  "plugins/external/broadcast-snippets"
]);

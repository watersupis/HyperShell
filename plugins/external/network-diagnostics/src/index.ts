import type { HyperShellPlugin } from "@hypershell/plugin-api";

export const plugin: HyperShellPlugin = {
  async activate() {
    return { dispose() {} };
  },
};

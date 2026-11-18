import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["apps/*", "packages/*", "plugins/external/broadcast-snippets"],
    include: [
      "apps/*/tests/unit/**/*.test.ts",
      "apps/*/tests/unit/**/*.test.tsx",
      "packages/*/tests/unit/**/*.test.ts",
      "packages/*/tests/unit/**/*.test.tsx",
      "plugins/external/broadcast-snippets/tests/unit/**/*.test.ts"
    ],
    exclude: [
      ...configDefaults.exclude,
      "apps/ui/tests/**"
    ]
  }
});

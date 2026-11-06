import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Vitest runs outside the React Server Components bundler, so the
      // marker package is replaced with a no-op module.
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Integration tests share one database, so files run one at a time.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    restoreMocks: true,
  },
});

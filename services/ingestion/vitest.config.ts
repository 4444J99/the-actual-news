import { defineConfig } from "vitest/config";

// The service suites share one Postgres database and their fixtures DELETE
// + re-seed the same tables, so test files in this package must not run in
// parallel — the same reason services/gateway/vitest.config.ts exists.
// Without this, the DB-backed suites (pipeline.test.ts, identity.test.ts)
// race each other's clean().
export default defineConfig({
  test: {
    fileParallelism: false,
    // tsc emits compiled tests into dist/__tests__/; without this vitest
    // runs every test twice (src + dist). The dist copy is not a second
    // suite — the restore demo imports the compiled pipeline directly.
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});

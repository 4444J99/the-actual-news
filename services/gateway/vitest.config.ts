import { defineConfig } from "vitest/config";

// The service suites share one Postgres database and their fixtures DELETE
// + re-seed the same tables, so test files in this package must not run in
// parallel — the same reason .github/workflows/public-launch.yml serializes
// services with --workspace-concurrency=1. Without this, the DB-backed
// suites (publish.test.ts, federation.test.ts) race each other's clean().
export default defineConfig({
  test: {
    fileParallelism: false
  }
});

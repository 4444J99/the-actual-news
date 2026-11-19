#!/usr/bin/env node
// tools/restore-demo.mjs — the-actual-news#111, Step 7 / CT-13.
//
// Independent restore demo: ingests a fixed two-article feed into a
// throwaway source database, dumps it, restores the dump into a fresh
// database on a different blob-store path, and re-runs the finalize
// verification there. It exits 0 only when the restored database carries
// identical capture / evidence / story / claim identities and its finalize
// check passes — i.e. the "restart + independent restore demo" the issue
// asks for, against real code (the compiled ingestion pipeline and the
// shared finalize module), not a copy of either.
//
// Usage: POSTGRES_URI=postgres://news:news@localhost:5432/news_ledger_test?sslmode=disable
//        node tools/restore-demo.mjs
// The URI's database is used only to derive the connection parameters;
// the demo creates and drops its own throwaway databases. Requires
// pg_dump + psql on PATH (the CI public-launch job installs
// postgresql-client) and a role that can CREATE DATABASE (news is
// superuser locally and in the CI postgres service).
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// tools/ is not a workspace package, so `pg` does not resolve from here;
// reuse the pg the ingestion service itself depends on.
const require = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), "..", "services", "ingestion", "package.json")
);
const pg = require("pg");

const { Pool } = pg;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POSTGRES_URI = process.env.POSTGRES_URI;
if (!POSTGRES_URI) {
  console.error("restore-demo: missing $POSTGRES_URI");
  process.exit(2);
}

function fail(msg) {
  console.error(`restore-demo: FAIL: ${msg}`);
  process.exit(1);
}

function have(cmd) {
  return spawnSync("which", [cmd], { encoding: "utf8" }).status === 0;
}
for (const cmd of ["pg_dump", "psql"]) {
  if (!have(cmd)) fail(`${cmd} not on PATH (install postgresql-client)`);
}

const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SRC_DB = `tan_restore_src_${rand}`;
const DST_DB = `tan_restore_dst_${rand}`;

// Derive a maintenance connection (database `postgres`) from POSTGRES_URI.
const baseUrl = new URL(POSTGRES_URI);
const maintenanceUri = new URL(POSTGRES_URI);
maintenanceUri.pathname = "/postgres";
const srcUri = new URL(POSTGRES_URI);
srcUri.pathname = `/${SRC_DB}`;
const dstUri = new URL(POSTGRES_URI);
dstUri.pathname = `/${DST_DB}`;

const srcBlobDir = mkdtempSync(join(tmpdir(), "tan-restore-src-"));
const dstBlobDir = mkdtempSync(join(tmpdir(), "tan-restore-dst-"));

const maint = new Pool({ connectionString: maintenanceUri.toString() });
let srcPool = null;
let dstPool = null;
try {
  // 1. Throwaway databases.
  await maint.query(`CREATE DATABASE ${SRC_DB}`);
  await maint.query(`CREATE DATABASE ${DST_DB}`);
  console.log(`restore-demo: created ${SRC_DB} and ${DST_DB}`);

  // 2. Migrations on the source (001-010, in glob order, as migrate.sh).
  srcPool = new Pool({ connectionString: srcUri.toString() });
  dstPool = new Pool({ connectionString: dstUri.toString() });
  const migrations = readdirSync(join(ROOT, "db", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of migrations) {
    execFileSync("psql", [srcUri.toString(), "-v", "ON_ERROR_STOP=1", "-f", join(ROOT, "db", "migrations", f)], { stdio: "pipe" });
  }
  console.log(`restore-demo: applied ${migrations.length} migrations to ${SRC_DB}`);

  // 3. Build the ingestion service so the demo imports the real code.
  execFileSync("pnpm", ["--filter", "ingestion-service", "build"], { cwd: ROOT, stdio: "pipe" });
  const { runIngestion } = await import(pathToFileURL(join(ROOT, "services", "ingestion", "dist", "pipeline.js")).href);
  const { finalizeRun } = await import(pathToFileURL(join(ROOT, "services", "ingestion", "dist", "finalize.js")).href);

  // 4. Real ingest into the source: a fixed two-article feed.
  process.env.EVIDENCE_BLOB_STORE_DIR = srcBlobDir;
  const PLATFORM_ID = "plf_restore_demo";
  await srcPool.query(
    `INSERT INTO sources (source_id, platform_id, name, feed_url, source_class, fetch_interval_minutes, enabled)
     VALUES ('SRC1', $1, 'npr', 'https://example.local/feed.xml', 'primary_record', 60, true)`,
    [PLATFORM_ID]
  );
  const articles = [
    {
      title: "Council meets on Tuesday",
      url: "https://example.local/npr/story-one",
      content: "The city council met on Tuesday for a budget hearing. A vote was held on ordinance twelve after long debate.",
      published_at: null, source_id: "", source_class: "",
    },
    {
      title: "Harbor bridge reopens Friday",
      url: "https://example.local/npr/story-two",
      content: "The harbor bridge reopens on Friday after a year of repairs. Commuters welcomed the announcement with cautious optimism.",
      published_at: null, source_id: "", source_class: "",
    },
  ];
  const result = await runIngestion(srcPool, PLATFORM_ID, async () => articles);
  if (result.errors.length > 0) fail(`source ingest errors: ${result.errors.join("; ")}`);
  if (result.articles_new !== 2) fail(`source ingest articles_new=${result.articles_new}, want 2`);
  const srcRun = await srcPool.query(
    `SELECT run_id, status, finalize_ok FROM ingest_runs WHERE platform_id = $1`,
    [PLATFORM_ID]
  );
  if (srcRun.rows.length !== 1) fail(`source has ${srcRun.rows.length} runs, want 1`);
  if (srcRun.rows[0].status !== "succeeded") fail(`source run status=${srcRun.rows[0].status}, want succeeded`);
  if (srcRun.rows[0].finalize_ok !== true) fail(`source run finalize_ok=${srcRun.rows[0].finalize_ok}, want true`);
  console.log(`restore-demo: source ingest ok (run ${srcRun.rows[0].run_id}, finalize passed)`);

  // 5. Dump the source, restore into the fresh database, copy the blobs
  //    to a DIFFERENT path (the restore must not depend on the old path),
  //    then remove the source blobs to prove it.
  const dumpPath = join(mkdtempSync(join(tmpdir(), "tan-restore-dump-")), "src.dump");
  execFileSync("pg_dump", [srcUri.toString(), "-f", dumpPath], { stdio: "pipe" });
  execFileSync("psql", [dstUri.toString(), "-v", "ON_ERROR_STOP=1", "-f", dumpPath], { stdio: "pipe" });
  rmSync(dstBlobDir, { recursive: true, force: true });
  cpSync(srcBlobDir, dstBlobDir, { recursive: true });
  rmSync(srcBlobDir, { recursive: true, force: true });
  console.log(`restore-demo: restored dump into ${DST_DB}, blobs copied to a new path`);

  // 6. Finalize the RESTORED database against the NEW blob path.
  const fin = await finalizeRun(dstPool, srcRun.rows[0].run_id, dstBlobDir);
  if (!fin.ok) fail(`restored finalize failed: ${fin.errors.join("; ")}`);
  console.log(`restore-demo: restored finalize ok (${fin.checked} captures checked)`);

  // 7. Identity comparison: every identity-bearing row must be identical.
  const tables = [
    ["source_captures", "SELECT capture_id, source_id, platform_id, url, content_hash, blob_uri, status FROM source_captures ORDER BY capture_id"],
    ["evidence_objects", "SELECT evidence_id_hash, platform_id, blob_uri, media_type FROM evidence_objects ORDER BY evidence_id_hash"],
    ["stories", "SELECT story_id, platform_id, title, state FROM stories ORDER BY story_id"],
    ["story_versions", "SELECT story_version_id, story_id, body_markdown FROM story_versions ORDER BY story_version_id"],
    ["claims", "SELECT claim_id, story_id, story_version_id, text, text_hash FROM claims ORDER BY claim_id"],
    ["claim_evidence_edges", "SELECT edge_id, claim_id, evidence_id_hash, relation FROM claim_evidence_edges ORDER BY edge_id"],
    ["ingest_runs", "SELECT run_id, platform_id, status, finalize_ok FROM ingest_runs ORDER BY run_id"],
  ];
  for (const [name, sql] of tables) {
    const a = await srcPool.query(sql);
    const b = await dstPool.query(sql);
    if (JSON.stringify(a.rows) !== JSON.stringify(b.rows)) {
      fail(`identities differ in ${name}:\nsource: ${JSON.stringify(a.rows)}\nrestored: ${JSON.stringify(b.rows)}`);
    }
    console.log(`restore-demo: identical ${name} (${a.rows.length} rows)`);
  }

  console.log("restore-demo: OK — restore reproduces identical identities and finalize passes");
} finally {
  try { await srcPool?.end(); } catch {}
  try { await dstPool?.end(); } catch {}
  try { await maint.query(`DROP DATABASE IF EXISTS ${SRC_DB}`); } catch {}
  try { await maint.query(`DROP DATABASE IF EXISTS ${DST_DB}`); } catch {}
  try { await maint.end(); } catch {}
  rmSync(srcBlobDir, { recursive: true, force: true });
  rmSync(dstBlobDir, { recursive: true, force: true });
}

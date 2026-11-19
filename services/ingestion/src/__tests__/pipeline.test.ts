import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePool } from "../db.js";
import { runIngestion } from "../pipeline.js";
import type { FetchedArticle } from "../fetcher.js";

// DB-backed like services/verify/src/__tests__/server.test.ts: the caller
// provides PLATFORM_ID and POSTGRES_URI (see .env.example).
const pool = makePool(process.env.POSTGRES_URI ?? "");
const PLATFORM_ID = process.env.PLATFORM_ID ?? "plf_local_01";

const ARTICLE: FetchedArticle = {
  title: "Council meets on Tuesday",
  url: "https://example.local/npr/story",
  content:
    "The city council met on Tuesday for a budget hearing. A vote was held on ordinance twelve after long debate.",
  published_at: null,
  source_id: "",
  source_class: "",
};

async function clean() {
  // The suites share one test database, so clean the verification tables
  // first: their rows reference claims created by other suites' runs.
  await pool.query("DELETE FROM claim_evidence_edges");
  await pool.query("DELETE FROM reviews");
  await pool.query("DELETE FROM verification_tasks");
  await pool.query("DELETE FROM claims");
  await pool.query("DELETE FROM story_versions");
  await pool.query("DELETE FROM stories");
  await pool.query("DELETE FROM evidence_objects");
  await pool.query("DELETE FROM source_captures");
  await pool.query("DELETE FROM ingest_runs");
  await pool.query("DELETE FROM sources");
}

beforeEach(async () => {
  await clean();
  await pool.query(
    `INSERT INTO sources (source_id, platform_id, name, feed_url, source_class, fetch_interval_minutes, enabled)
     VALUES ('SRC1', $1, 'npr', 'https://example.local/feed.xml', 'primary_record', 60, true)`,
    [PLATFORM_ID]
  );
});

describe("runIngestion (#112)", () => {
  it("records acquisition as origin edges, never supports", async () => {
    // runIngestion persists captured bytes to a blob dir; keep it in tmp.
    process.env.EVIDENCE_BLOB_STORE_DIR = mkdtempSync(join(tmpdir(), "tan-ingest-"));
    // The fetcher's SSRF guard blocks localhost feeds, so drive ingestion
    // through the injectable fetch seam with a stubbed feed.
    const stubFeed = async (): Promise<FetchedArticle[]> => [ARTICLE];

    const result = await runIngestion(pool, PLATFORM_ID, stubFeed);
    expect(result.errors).toEqual([]);
    expect(result.sources_processed).toBe(1);
    expect(result.articles_new).toBe(1);
    expect(result.claims_extracted).toBe(2);

    const claims = await pool.query(
      "SELECT claim_id, support_status FROM claims ORDER BY claim_id"
    );
    expect(claims.rows).toHaveLength(2);
    for (const claim of claims.rows) {
      expect(claim.support_status).toBe("unsupported");
    }

    const edges = await pool.query(
      `SELECT relation, strength FROM claim_evidence_edges
       WHERE claim_id = ANY($1::text[])`,
      [claims.rows.map((c) => c.claim_id)]
    );
    expect(edges.rows).toHaveLength(2);
    for (const edge of edges.rows) {
      expect(edge.relation).toBe("origin");
      expect(Number(edge.strength)).toBe(0);
    }
  });
});

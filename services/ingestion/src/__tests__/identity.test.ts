import { describe, it, expect, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePool } from "../db.js";
import { runIngestion } from "../pipeline.js";
import type { FetchedArticle } from "../fetcher.js";

// CT-11 / CT-12 / CT-13 (the-actual-news#111): identity stability, transactional
// ingestion, run status, and blob URI/filename agreement. Step 0 of the plan:
// these tests FAIL against the pre-fix pipeline and are the reproduction.
//
// DB-backed like services/verify/src/__tests__/server.test.ts: the caller
// provides PLATFORM_ID and POSTGRES_URI (see .env.example).
const pool = makePool(process.env.POSTGRES_URI ?? "");
const PLATFORM_ID = process.env.PLATFORM_ID ?? "plf_local_01";

const ARTICLES: FetchedArticle[] = [
  {
    title: "Council meets on Tuesday",
    url: "https://example.local/npr/story-one",
    content:
      "The city council met on Tuesday for a budget hearing. A vote was held on ordinance twelve after long debate.",
    published_at: null,
    source_id: "",
    source_class: "",
  },
  {
    title: "Harbor bridge reopens Friday",
    url: "https://example.local/npr/story-two",
    content:
      "The harbor bridge reopens on Friday after a year of repairs. Commuters welcomed the announcement with cautious optimism.",
    published_at: null,
    source_id: "",
    source_class: "",
  },
];

async function clean() {
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

function blobPathFor(blobUri: string, blobDir: string): string {
  // blob_uri is blob://local/<name>; the file on disk must be <name>.blob
  // in the blob store dir. Pre-fix the URI carries the sha256: prefix while
  // the file is written without it, so this resolution fails.
  const name = blobUri.replace("blob://local/", "");
  return join(blobDir, `${name}.blob`);
}

describe("runIngestion identity (#111 / CT-11)", () => {
  it("ingesting the same feed twice mints no duplicate captures, stories, or claims", async () => {
    const blobDir = mkdtempSync(join(tmpdir(), "tan-ingest-"));
    process.env.EVIDENCE_BLOB_STORE_DIR = blobDir;
    const stubFeed = async (): Promise<FetchedArticle[]> => ARTICLES;

    const first = await runIngestion(pool, PLATFORM_ID, stubFeed);
    expect(first.errors).toEqual([]);
    expect(first.articles_new).toBe(2);
    expect(first.claims_extracted).toBe(4);

    // Make the source due again: otherwise the second run fetches nothing
    // (last_fetched_at is fresh) and the re-sighting defect never triggers.
    await pool.query("UPDATE sources SET last_fetched_at = NULL WHERE source_id = 'SRC1'");

    const second = await runIngestion(pool, PLATFORM_ID, stubFeed);
    expect(second.errors).toEqual([]);
    expect(second.articles_new).toBe(0);
    expect(second.claims_extracted).toBe(0);

    const captures = await pool.query(
      "SELECT capture_id, status, content_hash, blob_uri FROM source_captures ORDER BY created_at"
    );
    // One success capture per article; a second sighting must reuse the row,
    // not mint a fresh capture_id with status 'duplicate'.
    expect(captures.rows).toHaveLength(2);
    for (const row of captures.rows) {
      expect(row.status).toBe("success");
      // The stored blob URI must resolve to the file on disk.
      expect(existsSync(blobPathFor(row.blob_uri, blobDir))).toBe(true);
    }

    const stories = await pool.query("SELECT COUNT(*) AS c FROM stories");
    expect(Number(stories.rows[0].c)).toBe(2);
    const claims = await pool.query("SELECT COUNT(*) AS c FROM claims");
    expect(Number(claims.rows[0].c)).toBe(4);
  });
});

describe("runIngestion crash safety (#111 / CT-12)", () => {
  it("a crash mid-article leaves no partial rows and the run reports failed", async () => {
    const blobDir = mkdtempSync(join(tmpdir(), "tan-ingest-"));
    process.env.EVIDENCE_BLOB_STORE_DIR = blobDir;
    const stubFeed = async (): Promise<FetchedArticle[]> => ARTICLES;

    // Simulate a crash/restart mid-article: the first claims INSERT throws.
    // The throw must fire whether the insert goes through pool.query
    // (pre-fix) or a checked-out client (post-fix per-article transaction).
    let crashed = false;
    const maybeCrash = (sql: string) => {
      if (!crashed && /INSERT INTO claims/.test(sql)) {
        crashed = true;
        throw new Error("simulated crash mid-article");
      }
    };
    const crashingPool = {
      query: async (...args: [string, unknown[]?]) => {
        maybeCrash(args[0]);
        return pool.query(args[0], args[1]);
      },
      connect: async () => {
        const client = await pool.connect();
        return {
          query: async (...args: [string, unknown[]?]) => {
            maybeCrash(args[0]);
            return client.query(args[0], args[1]);
          },
          release: () => client.release(),
        };
      },
    };

    const result = await runIngestion(crashingPool as never, PLATFORM_ID, stubFeed);
    expect(crashed).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);

    // No partial rows for the crashed article: no story, version, claims,
    // edges, or success capture — the transaction rolled back.
    const stories = await pool.query("SELECT COUNT(*) AS c FROM stories");
    expect(Number(stories.rows[0].c)).toBe(0);
    const versions = await pool.query("SELECT COUNT(*) AS c FROM story_versions");
    expect(Number(versions.rows[0].c)).toBe(0);
    const claims = await pool.query("SELECT COUNT(*) AS c FROM claims");
    expect(Number(claims.rows[0].c)).toBe(0);
    const edges = await pool.query("SELECT COUNT(*) AS c FROM claim_evidence_edges");
    expect(Number(edges.rows[0].c)).toBe(0);
    const success = await pool.query(
      "SELECT COUNT(*) AS c FROM source_captures WHERE status = 'success'"
    );
    expect(Number(success.rows[0].c)).toBe(0);

    // A failed run must not look finished.
    const runs = await pool.query(
      "SELECT status, completed_at, failed_at FROM ingest_runs"
    );
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].status).toBe("failed");
    expect(runs.rows[0].completed_at).toBeNull();
    expect(runs.rows[0].failed_at).not.toBeNull();
  });
});

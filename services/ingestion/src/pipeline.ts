import fs from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { fetchFeed, contentHash } from "./fetcher.js";
import type { FetchedArticle } from "./fetcher.js";
import { finalizeRun } from "./finalize.js";
import { newId, hashHex } from "shared";

export type IngestResult = {
  sources_processed: number;
  articles_found: number;
  articles_new: number;
  claims_extracted: number;
  errors: string[];
};

function detectClaimType(text: string): string {
  if (/\d+%|\$[\d,]+|million|billion|\d+\s*(people|cases|deaths)/i.test(text)) {
    return "statistical";
  }
  if (/said|according to|stated|announced|reported/i.test(text)) {
    return "attribution";
  }
  return "factual";
}

function extractEntities(text: string): string[] {
  const words = text.split(/\s+/);
  return words
    .filter((w) => w.length > 1 && /^[A-Z]/.test(w) && !/^(The|A|An|In|On|At|By|For|To|Is|It|He|She|We|They)$/.test(w))
    .slice(0, 5);
}

// The blob store directory is required: the old code silently defaulted to a
// hardcoded Mac volume (/Volumes/Archive4T/...) on any other host, so a
// restore on another machine could never resolve the stored blob URIs.
// Fail fast with a clear error instead of ingesting into a location the
// operator never chose.
function requireBlobStoreDir(): string {
  const dir = process.env.EVIDENCE_BLOB_STORE_DIR;
  if (!dir) {
    throw new Error(
      "EVIDENCE_BLOB_STORE_DIR is not set: ingestion refuses to default to a host-specific blob path"
    );
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Blob URIs and blob filenames share one form: blob://local/<hex> names the
// file <hex>.blob. (The old code stored blob://local/sha256:<hex> while the
// file was written without the prefix, so the URI never resolved to a file.)
function blobUriFor(hash: string): string {
  return `blob://local/${hashHex(hash)}`;
}

async function recordErrorCapture(
  pool: Pool,
  platformId: string,
  runId: string,
  source: { source_id: string; feed_url: string },
  err: unknown
): Promise<void> {
  // No content was fetched, so there is no content hash to record — and
  // content_hash is NOT NULL, so NULL is not an option either. Use a
  // namespaced deterministic hash of the feed URL: it can never shadow a
  // real capture (real hashes are sha256 of article content) and repeated
  // failures of one source collapse to one error row, updated in place.
  const errorHash = contentHash(`ingest-error:${source.feed_url}`);
  await pool.query(
    `INSERT INTO source_captures (capture_id, source_id, platform_id, url, content_hash, status, error, run_id, created_at)
     VALUES ($1, $2, $3, $4, $5, 'error', $6, $7, now())
     ON CONFLICT (source_id, url, content_hash)
     DO UPDATE SET error = EXCLUDED.error, created_at = now(), run_id = EXCLUDED.run_id`,
    [
      newId(),
      source.source_id,
      platformId,
      source.feed_url,
      errorHash,
      String((err as Error)?.message ?? err),
      runId,
    ]
  );
}

// Ingest one article atomically: capture + evidence + story + version +
// claims + edges + sources.last_fetched_at commit together or not at all.
// A crash mid-article leaves no partial rows — the run's finalize step
// verifies that. The blob write stays outside the transaction (a file cannot
// roll back): it is content-addressed and idempotent, so a rolled-back
// attempt leaves an orphaned blob the next ingest of the same content
// reuses.
async function ingestArticle(
  pool: Pool,
  platformId: string,
  runId: string,
  source: { source_id: string; name: string; source_class: string },
  article: FetchedArticle,
  blobStoreDir: string,
  result: IngestResult
): Promise<void> {
  const hash = contentHash(article.content || article.title);

  const blobName = hashHex(hash);
  const blobPath = path.join(blobStoreDir, `${blobName}.blob`);
  if (!fs.existsSync(blobPath)) {
    fs.writeFileSync(blobPath, Buffer.from(article.content || article.title, "utf8"));
  }
  const blobUri = blobUriFor(hash);

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    // Dedup is a database guarantee now, not an application pre-check: the
    // UNIQUE (source_id, url, content_hash) constraint makes "same content,
    // one capture" true even under concurrent ingest, and re-sighting reuses
    // the existing row instead of minting a fresh capture_id.
    const cap = await client.query(
      `INSERT INTO source_captures (capture_id, source_id, platform_id, url, content_hash, blob_uri, status, run_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'success', $7, now())
       ON CONFLICT (source_id, url, content_hash) DO NOTHING RETURNING capture_id`,
      [newId(), source.source_id, platformId, article.url, hash, blobUri, runId]
    );
    if (cap.rowCount === 0) {
      // Already captured: reuse the row, ingest nothing again.
      await client.query("COMMIT");
      return;
    }

    const now = new Date().toISOString();

    // Register evidence object (content-addressed; the hash IS the id).
    const evidenceId = hash;
    await client.query(
      `INSERT INTO evidence_objects (evidence_id_hash, platform_id, blob_uri, media_type, extracted_text, provenance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (evidence_id_hash) DO NOTHING`,
      [
        evidenceId,
        platformId,
        blobUri,
        "text/html",
        article.content,
        JSON.stringify({
          source: source.name,
          source_class: source.source_class,
          url: article.url,
          collected_at: now,
          publisher: source.name,
        }),
        now,
      ]
    );

    // Create story
    const storyId = newId();
    await client.query(
      `INSERT INTO stories (story_id, platform_id, title, state, created_at, updated_at)
       VALUES ($1, $2, $3, 'draft', $4, $4)`,
      [storyId, platformId, article.title, now]
    );

    // Create version
    const versionId = newId();
    await client.query(
      `INSERT INTO story_versions (story_version_id, story_id, body_markdown, created_at)
       VALUES ($1, $2, $3, $4)`,
      [versionId, storyId, article.content || article.title, now]
    );

    // Extract claims. Claim identity is stable per version: the same
    // sentence re-extracted for the same version reuses its claim row
    // (UNIQUE (story_version_id, text_hash)), and the origin edge is unique
    // per (claim, evidence, relation) so a reused claim cannot accumulate
    // duplicate edges. Claim ids stay ULIDs per the spec ($ULID: all
    // mutable-entity identifiers are ULIDs) — content addressing lives in
    // text_hash, not in claim_id.
    const sentences = (article.content || article.title)
      .split(/[.!?]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 20);

    for (const text of sentences.slice(0, 50)) {
      const textHash = contentHash(text);
      const claimIns = await client.query(
        `INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, text_hash, entities, time_window, jurisdiction, support_status, confidence_model, confidence_review, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, 'unsupported', $10, $11, $12)
         ON CONFLICT (story_version_id, text_hash) DO NOTHING RETURNING claim_id`,
        [
          newId(),
          storyId,
          versionId,
          detectClaimType(text),
          text,
          textHash,
          JSON.stringify(extractEntities(text)),
          JSON.stringify({}),
          null,
          null,
          null,
          now,
        ]
      );
      let claimId: string;
      if (claimIns.rowCount && claimIns.rowCount > 0) {
        claimId = claimIns.rows[0].claim_id;
        result.claims_extracted++;
      } else {
        const existing = await client.query(
          `SELECT claim_id FROM claims WHERE story_version_id = $1 AND text_hash = $2`,
          [versionId, textHash]
        );
        claimId = existing.rows[0].claim_id;
      }

      // Record acquisition provenance: this claim was extracted from
      // this evidence. Relation 'origin' on purpose (#112) — the
      // article's own text is provenance, not editorial support, so
      // it must never be written as 'supports'; strength is
      // meaningless for a provenance edge.
      await client.query(
        `INSERT INTO claim_evidence_edges (edge_id, claim_id, evidence_id_hash, relation, strength, created_at)
         VALUES ($1, $2, $3, 'origin', 0, $4)
         ON CONFLICT (claim_id, evidence_id_hash, relation) WHERE reviewer_actor_id IS NULL DO NOTHING`,
        [newId(), claimId, evidenceId, now]
      );
    }

    // Update source last_fetched_at
    await client.query(
      `UPDATE sources SET last_fetched_at = now() WHERE source_id = $1`,
      [source.source_id]
    );

    await client.query("COMMIT");
    result.articles_new++;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be dead; the rollback is best-effort.
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function runIngestion(
  pool: Pool,
  platformId: string,
  fetchFeedFn: typeof fetchFeed = fetchFeed
): Promise<IngestResult> {
  const blobStoreDir = requireBlobStoreDir();
  const result: IngestResult = {
    sources_processed: 0,
    articles_found: 0,
    articles_new: 0,
    claims_extracted: 0,
    errors: [],
  };

  const runId = newId();
  const startedAt = new Date().toISOString();

  // Record run start
  await pool.query(
    `INSERT INTO ingest_runs (run_id, platform_id, started_at, created_at, status) VALUES ($1, $2, $3, $3, 'running')`,
    [runId, platformId, startedAt]
  );

  try {
    // Get enabled sources due for fetching
    const sourcesQ = await pool.query(
      `SELECT source_id, name, feed_url, source_class, fetch_interval_minutes, last_fetched_at
       FROM sources
       WHERE platform_id = $1 AND enabled = true
         AND (last_fetched_at IS NULL OR last_fetched_at < now() - make_interval(mins => fetch_interval_minutes))`,
      [platformId]
    );

    for (const source of sourcesQ.rows) {
      result.sources_processed++;
      try {
        const articles = await fetchFeedFn(source.feed_url);
        result.articles_found += articles.length;

        for (const article of articles) {
          article.source_id = source.source_id;
          article.source_class = source.source_class;
          await ingestArticle(pool, platformId, runId, source, article, blobStoreDir, result);
        }
      } catch (err: unknown) {
        result.errors.push(`Source ${source.name}: ${String((err as Error)?.message ?? err)}`);
        await recordErrorCapture(pool, platformId, runId, source, err);
      }
    }

    // Update run record. A run with any error is failed, not finished:
    // completed_at is set only on the success path, failed_at only on the
    // failure path, so "did the last run succeed?" never needs free-text
    // parsing again.
    const errorsText = result.errors.join("; ") || null;
    const failed = errorsText !== null;
    await pool.query(
      `UPDATE ingest_runs
       SET completed_at = CASE WHEN $6 THEN NULL ELSE now() END,
           failed_at = CASE WHEN $6 THEN now() ELSE NULL END,
           status = CASE WHEN $6 THEN 'failed' ELSE 'succeeded' END,
           sources_processed = $1, articles_found = $2, articles_new = $3,
           claims_extracted = $4, errors = $5
       WHERE run_id = $7`,
      [
        result.sources_processed,
        result.articles_found,
        result.articles_new,
        result.claims_extracted,
        errorsText,
        failed,
        runId,
      ]
    );

    // Finalize: verify the identity chain for everything this run captured
    // and record the receipt on the run row. Never throws.
    await finalizeRun(pool, runId, blobStoreDir);
    return result;
  } catch (err: unknown) {
    result.errors.push(String((err as Error)?.message ?? err));
    try {
      await pool.query(
        `UPDATE ingest_runs SET status = 'failed', failed_at = now(), errors = $1 WHERE run_id = $2`,
        [result.errors.join("; "), runId]
      );
    } catch {
      // The run row itself may be unreachable; the caller still gets the
      // errors, and finalize records what it can.
    }
    await finalizeRun(pool, runId, blobStoreDir);
    return result;
  }
}

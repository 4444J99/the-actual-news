import crypto from "node:crypto";
import { Pool } from "pg";
import { fetchFeed, contentHash } from "./fetcher.js";

export type IngestResult = {
  sources_processed: number;
  articles_found: number;
  articles_new: number;
  claims_extracted: number;
  errors: string[];
};

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

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

export async function runIngestion(pool: Pool, platformId: string): Promise<IngestResult> {
  const result: IngestResult = {
    sources_processed: 0,
    articles_found: 0,
    articles_new: 0,
    claims_extracted: 0,
    errors: [],
  };

  const runId = ulid();
  const startedAt = new Date().toISOString();

  // Record run start
  await pool.query(
    `INSERT INTO ingest_runs (run_id, platform_id, started_at, created_at) VALUES ($1, $2, $3, $3)`,
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
        const articles = await fetchFeed(source.feed_url);
        result.articles_found += articles.length;

        for (const article of articles) {
          article.source_id = source.source_id;
          article.source_class = source.source_class;

          const hash = contentHash(article.content || article.title);
          // Check dedup
          const existing = await pool.query(
            `SELECT capture_id FROM source_captures WHERE content_hash = $1 LIMIT 1`,
            [hash]
          );

          if (existing.rowCount && existing.rowCount > 0) {
            // Already seen — record as duplicate
            await pool.query(
              `INSERT INTO source_captures (capture_id, source_id, platform_id, url, content_hash, status, created_at)
               VALUES ($1, $2, $3, $4, $5, 'duplicate', now())`,
              [ulid(), source.source_id, platformId, article.url, hash]
            );
            continue;
          }

          result.articles_new++;

          // Register capture
          const captureId = ulid();
          const blobUri = `blob://ingested/${source.source_id}/${captureId}`;
          await pool.query(
            `INSERT INTO source_captures (capture_id, source_id, platform_id, url, content_hash, blob_uri, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'success', now())`,
            [captureId, source.source_id, platformId, article.url, hash, blobUri]
          );

          // Register evidence object
          const evidenceId = hash; // content-addressed
          const now = new Date().toISOString();
          await pool.query(
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
          const storyId = ulid();
          await pool.query(
            `INSERT INTO stories (story_id, platform_id, title, state, created_at, updated_at)
             VALUES ($1, $2, $3, 'draft', $4, $4)`,
            [storyId, platformId, article.title, now]
          );

          // Create version
          const versionId = ulid();
          await pool.query(
            `INSERT INTO story_versions (story_version_id, story_id, body_markdown, created_at)
             VALUES ($1, $2, $3, $4)`,
            [versionId, storyId, article.content || article.title, now]
          );

          // Extract claims
          const sentences = (article.content || article.title)
            .split(/[.!?]+/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 20);

          for (const text of sentences.slice(0, 50)) {
            const claimId = ulid();
            await pool.query(
              `INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, entities, time_window, jurisdiction, support_status, confidence_model, confidence_review, created_at)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 'unsupported', $9, $10, $11)`,
              [
                claimId,
                storyId,
                versionId,
                detectClaimType(text),
                text,
                JSON.stringify(extractEntities(text)),
                JSON.stringify({}),
                null,
                null,
                null,
                now,
              ]
            );
            result.claims_extracted++;

            // Create claim-evidence edge
            await pool.query(
              `INSERT INTO claim_evidence_edges (edge_id, claim_id, evidence_id_hash, relation, strength, created_at)
               VALUES ($1, $2, $3, 'supports', 0.5, $4)`,
              [ulid(), claimId, evidenceId, now]
            );
          }

          // Update source last_fetched_at
          await pool.query(
            `UPDATE sources SET last_fetched_at = now() WHERE source_id = $1`,
            [source.source_id]
          );
        }
      } catch (err: any) {
        result.errors.push(`Source ${source.name}: ${String(err?.message ?? err)}`);
        await pool.query(
          `INSERT INTO source_captures (capture_id, source_id, platform_id, url, content_hash, status, error, created_at)
           VALUES ($1, $2, $3, $4, $5, 'error', $6, now())`,
          [ulid(), source.source_id, platformId, source.feed_url, "error", String(err?.message ?? err)]
        );
      }
    }

    // Update run record
    await pool.query(
      `UPDATE ingest_runs SET completed_at = now(), sources_processed = $1, articles_found = $2, articles_new = $3, claims_extracted = $4, errors = $5 WHERE run_id = $6`,
      [result.sources_processed, result.articles_found, result.articles_new, result.claims_extracted, result.errors.join("; ") || null, runId]
    );

    return result;
  } catch (err: any) {
    result.errors.push(String(err?.message ?? err));
    await pool.query(
      `UPDATE ingest_runs SET completed_at = now(), errors = $1 WHERE run_id = $2`,
      [result.errors.join("; "), runId]
    );
    return result;
  }
}
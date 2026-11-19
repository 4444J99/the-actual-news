-- 010_identity_stability.sql — the-actual-news#111
--
-- Makes capture / claim identity stable and ingestion atomic:
--  * ingest_runs gains a real status ('running' | 'succeeded' | 'failed'),
--    a failed_at timestamp, and the finalize receipt columns.
--  * source_captures gains run_id (which run sighted it) and a uniqueness
--    guarantee on (source_id, url, content_hash) so a re-sighting reuses
--    the row instead of minting a fresh capture_id.
--  * claims gains text_hash (sha256 of the sentence text) with a uniqueness
--    guarantee on (story_version_id, text_hash) so re-extraction is
--    idempotent.
--  * claim_evidence_edges gains a uniqueness guarantee on
--    (claim_id, evidence_id_hash, relation) for system-written edges
--    (reviewer_actor_id IS NULL) so a reused claim cannot accumulate
--    duplicate origin edges. Reviewer-attested 'supports' edges are one
--    row per reviewer and are NOT covered — see the edge section below.
--
-- Safe to re-apply: every step is guarded (migrate.sh applies all files
-- on every run). Backfills use pgcrypto digest(), matching the
-- contentHash() helper (sha256:<hex>).

-- ── ingest_runs: status / failed_at / finalize receipt ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ingest_runs' AND column_name = 'status') THEN
    ALTER TABLE ingest_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'running';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ingest_runs' AND column_name = 'failed_at') THEN
    ALTER TABLE ingest_runs ADD COLUMN failed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ingest_runs' AND column_name = 'finalize_ok') THEN
    ALTER TABLE ingest_runs ADD COLUMN finalize_ok BOOLEAN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ingest_runs' AND column_name = 'finalize_checked_at') THEN
    ALTER TABLE ingest_runs ADD COLUMN finalize_checked_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'ingest_runs' AND column_name = 'finalize_errors') THEN
    ALTER TABLE ingest_runs ADD COLUMN finalize_errors TEXT;
  END IF;
END $$;

-- Backfill status for runs recorded before the column existed: a run with
-- a completed_at and no errors succeeded; one with errors failed; a run
-- with no completed_at never finished (crashed) and is failed, not running.
UPDATE ingest_runs
SET status = CASE
  WHEN completed_at IS NULL THEN 'failed'
  WHEN errors IS NOT NULL AND errors <> '' THEN 'failed'
  ELSE 'succeeded'
END,
failed_at = CASE
  WHEN (completed_at IS NULL OR (errors IS NOT NULL AND errors <> '')) THEN COALESCE(completed_at, started_at)
  ELSE NULL
END,
completed_at = CASE
  WHEN completed_at IS NULL OR (errors IS NOT NULL AND errors <> '') THEN NULL
  ELSE completed_at
END
WHERE status = 'running';

-- ── source_captures: run_id ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'source_captures' AND column_name = 'run_id') THEN
    ALTER TABLE source_captures ADD COLUMN run_id TEXT REFERENCES ingest_runs(run_id);
  END IF;
END $$;

-- Backfill error captures: the old code stored the literal 'error' as the
-- content hash, so every failure of one source collided on the same value.
-- Give each its deterministic namespaced hash (sha256 of
-- 'ingest-error:' + feed URL — the same value the pipeline now writes for a
-- failed fetch), so no error row shadows a real capture or another error row.
--
-- Order matters: dedupe FIRST. Two 'error' rows for one source share
-- (source_id, url, 'error'), so the dedupe below removes all but the
-- earliest before the backfill gives them identical hashes — otherwise the
-- backfill UPDATE itself violates the unique constraint on a re-run
-- (caught 2026-11-19 on test data).
DELETE FROM source_captures sc
USING source_captures keeper
WHERE sc.source_id = keeper.source_id
  AND sc.url = keeper.url
  AND sc.content_hash = keeper.content_hash
  AND (sc.created_at, sc.capture_id) > (keeper.created_at, keeper.capture_id);

UPDATE source_captures
SET content_hash = 'sha256:' || encode(digest('ingest-error:' || url, 'sha256'), 'hex')
WHERE content_hash = 'error';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_source_captures_identity') THEN
    ALTER TABLE source_captures
      ADD CONSTRAINT uq_source_captures_identity UNIQUE (source_id, url, content_hash);
  END IF;
END $$;

-- ── claims: text_hash ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'claims' AND column_name = 'text_hash') THEN
    ALTER TABLE claims ADD COLUMN text_hash TEXT;
  END IF;
END $$;

-- Order matters (same hazard as captures above): dedupe by raw text FIRST.
-- Two rows with the same text in one version (e.g. test fixtures inserted
-- directly, text_hash NULL) would get identical hashes from the backfill,
-- and the backfill UPDATE itself would violate the already-existing unique
-- constraint before the hash dedupe ever runs. The text dedupe removes all
-- but the earliest per (story_version_id, text); the hash dedupe after the
-- backfill covers rows whose hashes were already set.
DELETE FROM claims c
USING claims keeper
WHERE c.story_version_id = keeper.story_version_id
  AND c.text = keeper.text
  AND (c.created_at, c.claim_id) > (keeper.created_at, keeper.claim_id);

UPDATE claims
SET text_hash = 'sha256:' || encode(digest(convert_to(text, 'UTF8'), 'sha256'), 'hex')
WHERE text_hash IS NULL;

-- Deduplicate claims: keep the earliest row per (story_version_id, text_hash).
DELETE FROM claims c
USING claims keeper
WHERE c.story_version_id = keeper.story_version_id
  AND c.text_hash = keeper.text_hash
  AND (c.created_at, c.claim_id) > (keeper.created_at, keeper.claim_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_claims_version_text') THEN
    ALTER TABLE claims
      ADD CONSTRAINT uq_claims_version_text UNIQUE (story_version_id, text_hash);
  END IF;
END $$;

-- ── claim_evidence_edges: one system edge per (claim, evidence, relation) ──
-- The uniqueness is scoped to system-written edges (reviewer_actor_id IS
-- NULL): ingestion 'origin' edges must not accumulate duplicates, but a
-- reviewer-attested 'supports' edge is one row PER REVIEWER — #112's quorum
-- records two reviewers citing the same evidence for the same claim, and a
-- plain (claim, evidence, relation) unique would 500 the second review
-- (caught by services/verify tests, 2026-11-19). The dedupe below is
-- scoped the same way, so it never deletes a reviewer's attestation.
-- Upgrade note: an earlier draft of this file (same unmerged PR) created
-- the unscoped 3-column constraint; drop it first if present.
ALTER TABLE claim_evidence_edges DROP CONSTRAINT IF EXISTS uq_claim_evidence_edges_identity;

DELETE FROM claim_evidence_edges e
USING claim_evidence_edges keeper
WHERE e.claim_id = keeper.claim_id
  AND e.evidence_id_hash = keeper.evidence_id_hash
  AND e.relation = keeper.relation
  AND e.reviewer_actor_id IS NULL
  AND keeper.reviewer_actor_id IS NULL
  AND (e.created_at, e.edge_id) > (keeper.created_at, keeper.edge_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE indexname = 'uq_claim_evidence_edges_identity') THEN
    CREATE UNIQUE INDEX uq_claim_evidence_edges_identity
      ON claim_evidence_edges (claim_id, evidence_id_hash, relation)
      WHERE reviewer_actor_id IS NULL;
  END IF;
END $$;

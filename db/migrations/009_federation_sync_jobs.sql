-- 009_federation_sync_jobs.sql — the-actual-news#110
--
-- POST /v1/federation/sync used to be a stub: it advanced last_synced_at
-- and returned `sync_initiated` without fetching anything. The sync job
-- queue makes the exchange durable and observable:
--
-- * federation_sync_jobs — one row per sync attempt. The endpoint enqueues
--   (state 'pending') and returns 202; a worker claims the row, fetches the
--   peer's /v1/feed + /v1/story bundles, and lands them, or records the
--   failure. Retries are new jobs (re-POST); a failed job is never
--   auto-retried past its attempt bound by the worker loop.
-- * federated_stories — remote story id -> local story id mapping, with the
--   bundle_hash that was ingested. A remote id must never collide with a
--   local stories PK, and a re-sync of an unchanged bundle must be a no-op;
--   the mapping row is what makes both true.
--
-- Numbering note: the #110 plan named this migration 007, but
-- 007_publication_version.sql and 008_origin_edges.sql already exist at
-- main 9d75d228, so this lands as 009. No renumbering of earlier files.
BEGIN;

CREATE TABLE IF NOT EXISTS federation_sync_jobs (
  job_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  peer_id TEXT NOT NULL REFERENCES federation_peers(peer_id),
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS federated_stories (
  peer_id TEXT NOT NULL,
  remote_story_id TEXT NOT NULL,
  local_story_id TEXT NOT NULL REFERENCES stories(story_id),
  bundle_hash TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (peer_id, remote_story_id)
);

CREATE INDEX IF NOT EXISTS idx_federation_sync_jobs_pending
  ON federation_sync_jobs(platform_id, state, created_at);

CREATE INDEX IF NOT EXISTS idx_federated_stories_local
  ON federated_stories(local_story_id);

COMMIT;

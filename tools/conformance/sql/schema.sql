BEGIN;

CREATE TABLE actors (
  actor_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coi_disclosures (
  disclosure_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stories (
  story_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE story_versions (
  story_version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  disclosure_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence_objects (
  evidence_id_hash TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  blob_uri TEXT NOT NULL,
  media_type TEXT NOT NULL,
  extracted_text TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  claim_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  story_version_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_window JSONB NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction TEXT,
  support_status TEXT NOT NULL DEFAULT 'unsupported',
  confidence_model DOUBLE PRECISION,
  confidence_review DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claim_evidence_edges (
  edge_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  evidence_id_hash TEXT NOT NULL,
  relation TEXT NOT NULL,
  strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  reviewer_actor_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE corrections (
  correction_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_outbox (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL DEFAULT 'v1',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE transparency_checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  event_count INTEGER NOT NULL CHECK (event_count > 0),
  merkle_root TEXT NOT NULL,
  event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  leaf_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transparency_checkpoint_events (
  checkpoint_id TEXT NOT NULL REFERENCES transparency_checkpoints(checkpoint_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES event_outbox(event_id),
  leaf_index INTEGER NOT NULL CHECK (leaf_index >= 0),
  leaf_hash TEXT NOT NULL,
  PRIMARY KEY (checkpoint_id, event_id),
  UNIQUE (checkpoint_id, leaf_index),
  UNIQUE (event_id)
);

CREATE TABLE verification_tasks (
  task_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  review_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  verdict TEXT NOT NULL,
  notes TEXT,
  evidence_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ingestion identity tables (the-actual-news#111, CT-11/CT-12). Mirrors
-- db/migrations/005_sources.sql + 010_identity_stability.sql, minus the
-- sources FK (the conformance schema is self-contained). The uniqueness
-- constraints live in migration 010; the fixtures below encode the
-- post-fix state and the runner asserts the invariants in SQL.
CREATE TABLE ingest_runs (
  run_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  sources_processed INTEGER NOT NULL DEFAULT 0,
  articles_found INTEGER NOT NULL DEFAULT 0,
  articles_new INTEGER NOT NULL DEFAULT 0,
  claims_extracted INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  finalize_ok BOOLEAN,
  finalize_checked_at TIMESTAMPTZ,
  finalize_errors TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE source_captures (
  capture_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  url TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT NOT NULL,
  blob_uri TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error TEXT,
  run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

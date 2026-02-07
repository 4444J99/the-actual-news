BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS actors (
  actor_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coi_disclosures (
  disclosure_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id),
  statement TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  story_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_versions (
  story_version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id),
  body_markdown TEXT NOT NULL,
  disclosure_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_objects (
  evidence_id_hash TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  blob_uri TEXT NOT NULL,
  media_type TEXT NOT NULL,
  extracted_text TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id),
  story_version_id TEXT NOT NULL REFERENCES story_versions(story_version_id),
  claim_type TEXT NOT NULL,
  text TEXT NOT NULL,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_window JSONB NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction TEXT,
  support_status TEXT NOT NULL DEFAULT 'unsupported',
  confidence_model DOUBLE PRECISION,
  confidence_review DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_evidence_edges (
  edge_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id),
  evidence_id_hash TEXT NOT NULL REFERENCES evidence_objects(evidence_id_hash),
  relation TEXT NOT NULL,
  strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  reviewer_actor_id TEXT REFERENCES actors(actor_id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_tasks (
  task_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  story_id TEXT NOT NULL REFERENCES stories(story_id),
  claim_id TEXT NOT NULL REFERENCES claims(claim_id),
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  review_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES verification_tasks(task_id),
  actor_id TEXT NOT NULL REFERENCES actors(actor_id),
  verdict TEXT NOT NULL,
  notes TEXT,
  evidence_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS corrections (
  correction_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id),
  reason TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

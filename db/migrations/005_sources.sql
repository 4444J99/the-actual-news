BEGIN;

CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  source_class TEXT NOT NULL DEFAULT 'primary_record',
  fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_captures (
  capture_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  platform_id TEXT NOT NULL,
  url TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT NOT NULL,
  blob_uri TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  run_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  sources_processed INTEGER NOT NULL DEFAULT 0,
  articles_found INTEGER NOT NULL DEFAULT 0,
  articles_new INTEGER NOT NULL DEFAULT 0,
  claims_extracted INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_platform_enabled ON sources(platform_id, enabled);
CREATE INDEX IF NOT EXISTS idx_captures_source ON source_captures(source_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_captures_hash ON source_captures(content_hash);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_platform ON ingest_runs(platform_id, started_at DESC);

COMMIT;
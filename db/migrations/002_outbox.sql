BEGIN;

CREATE TABLE IF NOT EXISTS event_outbox (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL DEFAULT 'v1',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

COMMIT;

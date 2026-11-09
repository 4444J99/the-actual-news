BEGIN;

-- Federation peers
CREATE TABLE IF NOT EXISTS federation_peers (
  peer_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  peer_url TEXT NOT NULL,
  peer_name TEXT NOT NULL,
  public_key TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  last_synced_story_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stewardship transfers
CREATE TABLE IF NOT EXISTS stewardship_transfers (
  transfer_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  from_actor_id TEXT NOT NULL,
  to_actor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT
);

-- Platforms (multi-tenancy)
CREATE TABLE IF NOT EXISTS platforms (
  platform_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_pack_version TEXT NOT NULL DEFAULT 'v1.0.0',
  steward_actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Governance changes
CREATE TABLE IF NOT EXISTS governance_changes (
  change_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Memberships
CREATE TABLE IF NOT EXISTS memberships (
  member_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bounties
CREATE TABLE IF NOT EXISTS bounties (
  bounty_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  story_id TEXT REFERENCES stories(story_id),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bounty contributions
CREATE TABLE IF NOT EXISTS bounty_contributions (
  contribution_id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(bounty_id),
  actor_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payouts
CREATE TABLE IF NOT EXISTS payouts (
  payout_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  story_id TEXT REFERENCES stories(story_id),
  recipient_actor_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  quality_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_pack_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  actor_id TEXT,
  action_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_federation_peers_platform ON federation_peers(platform_id);
CREATE INDEX IF NOT EXISTS idx_stewardship_platform ON stewardship_transfers(platform_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_platform ON memberships(platform_id, status);
CREATE INDEX IF NOT EXISTS idx_bounties_platform ON bounties(platform_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_platform ON payouts(platform_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_platform ON audit_log(platform_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, created_at DESC);

COMMIT;
BEGIN;

CREATE INDEX IF NOT EXISTS idx_stories_platform_updated ON stories(platform_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_story_created ON story_versions(story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_story ON claims(story_id);
CREATE INDEX IF NOT EXISTS idx_edges_claim ON claim_evidence_edges(claim_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON verification_tasks(status);

COMMIT;

BEGIN;

ALTER TABLE stories ADD COLUMN IF NOT EXISTS published_version_id TEXT;

-- Backfill existing published records with their latest version so the public
-- bundle boundary is complete for already-published stories. A published
-- record with a null publication pointer must not fall back to an unreviewed
-- latest version for unauthenticated readers.
UPDATE stories s
SET published_version_id = latest.story_version_id
FROM (
  SELECT DISTINCT ON (story_id) story_id, story_version_id
  FROM story_versions
  ORDER BY story_id, created_at DESC
) latest
WHERE s.story_id = latest.story_id
  AND s.state = 'published'
  AND s.published_version_id IS NULL;

COMMIT;

-- 008_origin_edges.sql — the-actual-news#112
--
-- Ingestion used to record acquisition provenance as relation='supports', so
-- the publish gate counted a story's own article as primary support.
-- Ingestion now writes relation='origin'; this migration re-labels the
-- historical self-edges so live data stops auto-passing the gate.
--
-- An edge is an ingestion self-edge when it was never review-attested
-- (reviewer_actor_id IS NULL) and its evidence is the evidence the claim
-- was extracted from: the claim's own text appears in that evidence
-- object's extracted_text (ingestion extracts claims as sentences of the
-- article stored as the evidence object's extracted_text).
--
-- Known residuals (documented, not silently fixed):
-- * Articles ingested with empty content produce claims from the title,
--   which is not in extracted_text, so those self-edges are NOT relabeled
--   here. They stay 'supports' and the gate cannot exclude them for want
--   of an 'origin' edge; new ingestions of such articles write 'origin'.
-- * An independent evidence object that quotes a claim's sentence verbatim
--   matches the text test and is relabeled. That is the conservative
--   direction (it can only make the gate stricter, never looser).
--
-- Re-runnable: only relation='supports' rows are touched, so a second run
-- is a no-op.
BEGIN;

UPDATE claim_evidence_edges e
SET relation = 'origin'
WHERE e.relation = 'supports'
  AND e.reviewer_actor_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM claims c
    JOIN evidence_objects eo ON eo.evidence_id_hash = e.evidence_id_hash
    WHERE c.claim_id = e.claim_id
      AND eo.extracted_text IS NOT NULL
      AND position(c.text IN eo.extracted_text) > 0
  );

COMMIT;

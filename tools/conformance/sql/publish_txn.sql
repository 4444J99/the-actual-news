WITH
story_lock AS (
  SELECT s.story_id, s.platform_id, s.state
  FROM stories s
  WHERE s.platform_id = $1 AND s.story_id = $2
  FOR UPDATE
),
claim_base AS (
  SELECT c.claim_id, c.claim_type, c.text, c.support_status
  FROM claims c
  WHERE c.story_id = $2 AND c.story_version_id = $3
),
edges_support AS (
  SELECT e.claim_id, e.evidence_id_hash
  FROM claim_evidence_edges e
  WHERE e.claim_id IN (SELECT claim_id FROM claim_base)
    AND e.relation = 'supports'
),
evidence_enriched AS (
  SELECT
    eo.evidence_id_hash,
    eo.blob_uri,
    eo.provenance,
    (eo.provenance->>'source_class') AS source_class,
    CASE
      WHEN array_position($5, 'source') IS NOT NULL AND NULLIF(eo.provenance->>'source','') IS NOT NULL THEN eo.provenance->>'source'
      WHEN array_position($5, 'publisher') IS NOT NULL AND NULLIF(eo.provenance->>'publisher','') IS NOT NULL THEN eo.provenance->>'publisher'
      WHEN array_position($5, 'url') IS NOT NULL AND NULLIF(eo.provenance->>'url','') IS NOT NULL THEN eo.provenance->>'url'
      WHEN array_position($5, 'blob_uri') IS NOT NULL AND NULLIF(eo.blob_uri,'') IS NOT NULL THEN eo.blob_uri
      ELSE eo.blob_uri
    END AS independence_key
  FROM evidence_objects eo
  WHERE eo.evidence_id_hash IN (SELECT evidence_id_hash FROM edges_support)
),
-- #112: acquisition provenance is recorded with relation 'origin', never
-- 'supports'. A 'supports' edge counts only when its evidence is
-- independent of the claim's origin: a different evidence object from a
-- different publisher (different independence_key) than the origin
-- evidence. Self-support (same evidence, or same-publisher evidence)
-- must not satisfy the primary-evidence ratio or corroborate a
-- high-impact claim. Origin is known from the claim's 'origin' edges, or
-- — for legacy data written before 'origin' existed — from the
-- origin_evidence fallback below (evidence whose extracted_text contains
-- the claim's text). A claim with neither has no known origin, so its
-- 'supports' edges are evaluated on their own terms.
-- This query MUST stay identical in logic to the inlined copy in
-- services/gateway/src/server.ts and to tools/conformance/sql/publish_gate.sql;
-- change all three together.
edges_origin AS (
  SELECT e.claim_id, e.evidence_id_hash
  FROM claim_evidence_edges e
  WHERE e.claim_id IN (SELECT claim_id FROM claim_base)
    AND e.relation = 'origin'
),
origin_evidence AS (
  SELECT
    o.claim_id,
    o.evidence_id_hash AS origin_hash,
    CASE
      WHEN array_position($5, 'source') IS NOT NULL AND NULLIF(eo.provenance->>'source','') IS NOT NULL THEN eo.provenance->>'source'
      WHEN array_position($5, 'publisher') IS NOT NULL AND NULLIF(eo.provenance->>'publisher','') IS NOT NULL THEN eo.provenance->>'publisher'
      WHEN array_position($5, 'url') IS NOT NULL AND NULLIF(eo.provenance->>'url','') IS NOT NULL THEN eo.provenance->>'url'
      WHEN array_position($5, 'blob_uri') IS NOT NULL AND NULLIF(eo.blob_uri,'') IS NOT NULL THEN eo.blob_uri
      ELSE eo.blob_uri
    END AS origin_key
  FROM edges_origin o
  JOIN evidence_objects eo ON eo.evidence_id_hash = o.evidence_id_hash
  UNION
  -- Legacy shape: before #112 ingestion wrote the self-edge as 'supports'
  -- with no 'origin' edge. Such an edge's evidence is the claim's origin
  -- when the claim's own text appears in that evidence's extracted_text
  -- (ingestion extracts claims as sentences of the article stored there).
  -- Same criterion as db/migrations/008_origin_edges.sql. A verbatim
  -- republication matches too; that errs toward stricter, never looser.
  SELECT
    es.claim_id,
    es.evidence_id_hash AS origin_hash,
    CASE
      WHEN array_position($5, 'source') IS NOT NULL AND NULLIF(eo.provenance->>'source','') IS NOT NULL THEN eo.provenance->>'source'
      WHEN array_position($5, 'publisher') IS NOT NULL AND NULLIF(eo.provenance->>'publisher','') IS NOT NULL THEN eo.provenance->>'publisher'
      WHEN array_position($5, 'url') IS NOT NULL AND NULLIF(eo.provenance->>'url','') IS NOT NULL THEN eo.provenance->>'url'
      WHEN array_position($5, 'blob_uri') IS NOT NULL AND NULLIF(eo.blob_uri,'') IS NOT NULL THEN eo.blob_uri
      ELSE eo.blob_uri
    END AS origin_key
  FROM edges_support es
  JOIN claim_base cb ON cb.claim_id = es.claim_id
  JOIN evidence_objects eo ON eo.evidence_id_hash = es.evidence_id_hash
  WHERE eo.extracted_text IS NOT NULL
    AND position(cb.text IN eo.extracted_text) > 0
),
independent_support AS (
  SELECT es.claim_id, es.evidence_id_hash
  FROM edges_support es
  JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  WHERE NOT EXISTS (
    SELECT 1 FROM origin_evidence oe
    WHERE oe.claim_id = es.claim_id
      AND (oe.origin_hash = es.evidence_id_hash OR oe.origin_key = ev.independence_key)
  )
),
primary_supported_claims AS (
  SELECT DISTINCT es.claim_id
  FROM independent_support es
  JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  WHERE ev.source_class = ANY($4)
),
totals AS (
  SELECT
    (SELECT COUNT(*) FROM claim_base) AS total_claims,
    (SELECT COUNT(*) FROM claim_base WHERE support_status = 'unsupported') AS unsupported_claims,
    (SELECT COUNT(*) FROM claim_base WHERE support_status = 'contradicted') AS contradicted_claims,
    (SELECT COUNT(*) FROM primary_supported_claims) AS primary_supported_claims
),
high_impact_claims AS (
  SELECT cb.claim_id
  FROM claim_base cb
  WHERE
    cb.claim_type = ANY($6)
    OR EXISTS (SELECT 1 FROM unnest($7::text[]) r WHERE cb.text ~* r)
),
high_impact_support_counts AS (
  SELECT
    hic.claim_id,
    COUNT(DISTINCT ev.independence_key) AS independent_support_sources
  FROM high_impact_claims hic
  LEFT JOIN independent_support es ON es.claim_id = hic.claim_id
  LEFT JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  GROUP BY hic.claim_id
),
high_impact_rollup AS (
  SELECT
    (SELECT COUNT(*) FROM high_impact_claims) AS high_impact_claims,
    (SELECT COUNT(*) FROM high_impact_support_counts WHERE independent_support_sources >= $12) AS high_impact_corroborated
),
metrics AS (
  SELECT
    t.total_claims,
    t.unsupported_claims,
    t.contradicted_claims,
    t.primary_supported_claims,
    CASE WHEN t.total_claims = 0 THEN 0 ELSE (t.primary_supported_claims::float8 / t.total_claims::float8) END AS primary_evidence_ratio,
    CASE WHEN t.total_claims = 0 THEN 1 ELSE (t.unsupported_claims::float8 / t.total_claims::float8) END AS unsupported_claim_share,
    hr.high_impact_claims,
    hr.high_impact_corroborated,
    CASE WHEN hr.high_impact_claims = 0 THEN true ELSE (hr.high_impact_corroborated = hr.high_impact_claims) END AS corroboration_ok
  FROM totals t
  CROSS JOIN high_impact_rollup hr
),
gate AS (
  SELECT
    (
      EXISTS (SELECT 1 FROM story_lock)
      AND m.total_claims > 0
      AND m.contradicted_claims <= $10
      AND m.primary_evidence_ratio >= $8
      AND m.unsupported_claim_share <= $9
      AND (CASE WHEN $11 THEN m.corroboration_ok ELSE true END)
    ) AS pass
  FROM metrics m
),
updated_story AS (
  UPDATE stories
  SET state = 'published', updated_at = now()
  WHERE platform_id = $1
    AND story_id = $2
    AND (SELECT pass FROM gate)
  RETURNING story_id, platform_id
),
outbox AS (
  INSERT INTO event_outbox (event_id, platform_id, event_type, event_version, payload)
  SELECT
    'evt_' || $2 || '_' || $3,
    $1,
    'story.published.v1',
    'v1',
    jsonb_build_object(
      'story_id', $2,
      'story_version_id', $3,
      'policy_pack_version', $13::text
    )
  FROM updated_story
  RETURNING event_id
)
SELECT
  COALESCE(
    (SELECT 'published' FROM updated_story LIMIT 1),
    (SELECT state FROM story_lock LIMIT 1)
  ) AS story_state,
  (SELECT COUNT(*)::int FROM outbox) AS outbox_count,
  (SELECT pass FROM gate) AS publish_gate_pass;

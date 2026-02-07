import express from "express";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";

type Story = {
  story_id: string;
  platform_id: string;
  title: string;
  state: "draft" | "review" | "published";
  created_at: string;
  updated_at?: string;
};

type StoryVersion = {
  story_version_id: string;
  story_id: string;
  body_markdown: string;
  disclosure_markdown?: string | null;
  created_at: string;
};

type Claim = {
  claim_id: string;
  story_id: string;
  story_version_id: string;
  claim_type: "factual" | "statistical" | "attribution" | "interpretation";
  text: string;
  entities?: string[];
  time_window?: Record<string, unknown>;
  jurisdiction?: string | null;
  support_status: "unsupported" | "partially_supported" | "supported" | "contradicted";
  confidence_model?: number | null;
  confidence_review?: number | null;
  created_at: string;
};

type EvidenceEdge = {
  claim_id: string;
  evidence_id_hash: string;
  relation: "supports" | "contradicts" | "context";
  strength: number;
};

type Correction = {
  correction_id: string;
  claim_id: string;
  reason: string;
  created_at: string;
};

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);

const app = express();
app.use(express.json({ limit: "2mb" }));

// GET /v1/health
app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, platform_id: env.PLATFORM_ID });
});

// GET /v1/feed
app.get("/v1/feed", async (req, res) => {
  const scope = String(req.query.scope ?? "local");
  const limitRaw = Number(req.query.limit ?? 50);

  const limit =
    Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

  const state = req.query.state ? String(req.query.state) : null;

  const allowedStates = new Set(["draft", "review", "published"]);
  const stateFilter = state && allowedStates.has(state) ? state : null;

  try {
    const q = await pool.query(
      `
      SELECT story_id, title, state, updated_at
      FROM stories
      WHERE platform_id = $1
        AND ($2::text IS NULL OR state = $2)
      ORDER BY updated_at DESC
      LIMIT $3
      `,
      [env.PLATFORM_ID, stateFilter, limit]
    );

    return res.status(200).json({
      scope,
      items: q.rows.map((r: any) => ({
        story_id: r.story_id,
        title: r.title,
        state: r.state,
        updated_at: r.updated_at
      }))
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// GET /v1/story/:story_id
app.get("/v1/story/:story_id", async (req, res) => {
  const storyId = req.params.story_id;

  try {
    const storyQ = await pool.query(
      `
      SELECT story_id, platform_id, title, state, created_at, updated_at
      FROM stories
      WHERE story_id = $1 AND platform_id = $2
      LIMIT 1
      `,
      [storyId, env.PLATFORM_ID]
    );

    if (storyQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    const story: Story = storyQ.rows[0];

    const versionsQ = await pool.query(
      `
      SELECT story_version_id, story_id, body_markdown, disclosure_markdown, created_at
      FROM story_versions
      WHERE story_id = $1
      ORDER BY created_at DESC
      `,
      [storyId]
    );

    const versions: StoryVersion[] = versionsQ.rows;

    const claimsQ = await pool.query(
      `
      SELECT claim_id, story_id, story_version_id, claim_type, text, entities, time_window,
             jurisdiction, support_status, confidence_model, confidence_review, created_at
      FROM claims
      WHERE story_id = $1
      ORDER BY created_at ASC
      `,
      [storyId]
    );

    const claims: Claim[] = claimsQ.rows.map((r: any) => ({
      ...r,
      entities: Array.isArray(r.entities) ? r.entities : (r.entities ?? []),
      time_window: r.time_window ?? {}
    }));

    const edgesQ = await pool.query(
      `
      SELECT claim_id, evidence_id_hash,
             CASE
               WHEN relation = 'context_only' THEN 'context'
               WHEN relation = 'context' THEN 'context'
               ELSE relation
             END AS relation,
             strength
      FROM claim_evidence_edges
      WHERE claim_id IN (
        SELECT claim_id FROM claims WHERE story_id = $1
      )
      ORDER BY created_at ASC
      `,
      [storyId]
    );

    const evidence_edges: EvidenceEdge[] = edgesQ.rows.map((r: any) => ({
      claim_id: r.claim_id,
      evidence_id_hash: r.evidence_id_hash,
      relation: r.relation,
      strength: Number(r.strength ?? 0.5)
    }));

    const correctionsQ = await pool.query(
      `
      SELECT correction_id, claim_id, reason, created_at
      FROM corrections
      WHERE platform_id = $1
        AND claim_id IN (SELECT claim_id FROM claims WHERE story_id = $2)
      ORDER BY created_at ASC
      `,
      [env.PLATFORM_ID, storyId]
    );

    const corrections: Correction[] = correctionsQ.rows;

    const storyWithVersions = { ...story, versions };

    return res.status(200).json({
      story: storyWithVersions,
      claims,
      evidence_edges,
      corrections
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// POST /v1/story/:story_id/publish
const MIN_PRIMARY_EVIDENCE_RATIO = 0.5;
const MAX_UNSUPPORTED_CLAIM_SHARE = 0.10;
const REQUIRE_HIGH_IMPACT_CORROBORATION = true;

app.post("/v1/story/:story_id/publish", async (req, res) => {
  const storyId = req.params.story_id;
  const storyVersionId: string | null = req.body?.story_version_id ?? null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lockQ = await client.query(
      `
      SELECT story_id, platform_id, state
      FROM stories
      WHERE platform_id = $1 AND story_id = $2
      FOR UPDATE
      `,
      [env.PLATFORM_ID, storyId]
    );

    if (lockQ.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    const lockedState = String(lockQ.rows[0].state);
    if (lockedState === "published") {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "already_published", message: "story already published" });
    }

    const gateQ = await client.query(
      `
      WITH
      version_row AS (
        SELECT v.story_version_id
        FROM story_versions v
        WHERE v.story_id = $2
        ORDER BY v.created_at DESC
        LIMIT 1
      ),
      chosen_version AS (
        SELECT COALESCE($3::text, (SELECT story_version_id FROM version_row)) AS story_version_id
      ),
      claim_base AS (
        SELECT c.claim_id, c.claim_type, c.text, c.support_status
        FROM claims c
        JOIN chosen_version cv ON cv.story_version_id = c.story_version_id
        WHERE c.story_id = $2
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
          COALESCE(eo.provenance->>'source', eo.provenance->>'publisher', eo.provenance->>'url', eo.blob_uri) AS independence_key
        FROM evidence_objects eo
        WHERE eo.evidence_id_hash IN (SELECT evidence_id_hash FROM edges_support)
      ),
      primary_supported_claims AS (
        SELECT DISTINCT es.claim_id
        FROM edges_support es
        JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
        WHERE ev.source_class = 'primary'
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
          cb.claim_type IN ('statistical')
          OR (
            cb.claim_type = 'factual'
            AND (
              cb.text ~* '(accus|illegal|fraud|crime|charged|indict|lawsuit|killed|injur|shoot|arrest|explos|terror|abuse)'
              OR cb.text ~* '(\\$|usd|million|billion|percent|%)'
            )
          )
      ),
      high_impact_support_counts AS (
        SELECT
          hic.claim_id,
          COUNT(DISTINCT ev.independence_key) AS independent_support_sources
        FROM high_impact_claims hic
        LEFT JOIN edges_support es ON es.claim_id = hic.claim_id
        LEFT JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
        GROUP BY hic.claim_id
      ),
      high_impact_rollup AS (
        SELECT
          (SELECT COUNT(*) FROM high_impact_claims) AS high_impact_claims,
          (SELECT COUNT(*) FROM high_impact_support_counts WHERE independent_support_sources >= 2) AS high_impact_corroborated
      )
      SELECT
        (SELECT story_version_id FROM chosen_version) AS story_version_id,
        t.total_claims,
        t.unsupported_claims,
        t.contradicted_claims,
        t.primary_supported_claims,
        CASE WHEN t.total_claims = 0 THEN 0 ELSE (t.primary_supported_claims::double precision / t.total_claims::double precision) END AS primary_evidence_ratio,
        CASE WHEN t.total_claims = 0 THEN 1 ELSE (t.unsupported_claims::double precision / t.total_claims::double precision) END AS unsupported_claim_share,
        hr.high_impact_claims,
        hr.high_impact_corroborated,
        CASE WHEN hr.high_impact_claims = 0 THEN true ELSE (hr.high_impact_corroborated = hr.high_impact_claims) END AS corroboration_ok
      FROM totals t
      CROSS JOIN high_impact_rollup hr
      `,
      [env.PLATFORM_ID, storyId, storyVersionId]
    );

    if (gateQ.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "publish_gate_error",
        message: "cannot compute publish gate metrics (missing version or claims)"
      });
    }

    const m = gateQ.rows[0];

    const primaryEvidenceRatio = Number(m.primary_evidence_ratio ?? 0);
    const unsupportedClaimShare = Number(m.unsupported_claim_share ?? 1);
    const contradictedClaims = Number(m.contradicted_claims ?? 0);
    const totalClaims = Number(m.total_claims ?? 0);

    const corroborationOkDb = Boolean(m.corroboration_ok);
    const corroborationOk = REQUIRE_HIGH_IMPACT_CORROBORATION ? corroborationOkDb : true;

    const pass =
      totalClaims > 0 &&
      contradictedClaims === 0 &&
      primaryEvidenceRatio >= MIN_PRIMARY_EVIDENCE_RATIO &&
      unsupportedClaimShare <= MAX_UNSUPPORTED_CLAIM_SHARE &&
      corroborationOk;

    if (!pass) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "publish_gate_failed",
        message: "publish gate failed",
        thresholds: {
          min_primary_evidence_ratio: MIN_PRIMARY_EVIDENCE_RATIO,
          max_unsupported_claim_share: MAX_UNSUPPORTED_CLAIM_SHARE,
          require_high_impact_corroboration: REQUIRE_HIGH_IMPACT_CORROBORATION
        },
        metrics: {
          story_version_id: m.story_version_id,
          total_claims: totalClaims,
          unsupported_claims: Number(m.unsupported_claims ?? 0),
          contradicted_claims: contradictedClaims,
          primary_supported_claims: Number(m.primary_supported_claims ?? 0),
          primary_evidence_ratio: primaryEvidenceRatio,
          unsupported_claim_share: unsupportedClaimShare,
          high_impact_claims: Number(m.high_impact_claims ?? 0),
          high_impact_corroborated: Number(m.high_impact_corroborated ?? 0),
          corroboration_ok: corroborationOkDb
        }
      });
    }

    await client.query(
      `
      UPDATE stories
      SET state = 'published', updated_at = now()
      WHERE platform_id = $1 AND story_id = $2
      `,
      [env.PLATFORM_ID, storyId]
    );

    await client.query(
      `
      INSERT INTO event_outbox (event_id, platform_id, event_type, event_version, payload)
      VALUES ($1, $2, $3, 'v1', $4::jsonb)
      `,
      [
        ulidLike(),
        env.PLATFORM_ID,
        "story.published.v1",
        JSON.stringify({
          story_id: storyId,
          story_version_id: m.story_version_id,
          publication_scope: "local"
        })
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      story_id: storyId,
      state: "published",
      story_version_id: m.story_version_id,
      metrics: {
        total_claims: totalClaims,
        primary_evidence_ratio: primaryEvidenceRatio,
        unsupported_claim_share: unsupportedClaimShare,
        high_impact_claims: Number(m.high_impact_claims ?? 0),
        high_impact_corroborated: Number(m.high_impact_corroborated ?? 0),
        corroboration_ok: corroborationOkDb
      }
    });
  } catch (err: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  } finally {
    client.release();
  }
});

function ulidLike(): string {
  return (Date.now().toString(36).toUpperCase().padStart(10, "0") + Math.random().toString(36).slice(2, 18).toUpperCase()).slice(0, 26);
}

const server = app.listen(DEFAULT_PORT, () => {
  console.log(
    JSON.stringify(
      {
        service: "gateway",
        port: DEFAULT_PORT,
        platform_id: env.PLATFORM_ID
      },
      null,
      2
    )
  );
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());

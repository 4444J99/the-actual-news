import express from "express";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";
import { hashCanonical, merkleLeafHash, merkleProof, merkleRoot } from "./transparency.js";

type Story = {
  story_id: string;
  platform_id: string;
  title: string;
  state: "draft" | "review" | "published";
  created_at: string;
  updated_at?: string;
  published_version_id?: string | null;
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

type EventOutboxRow = {
  event_id: string;
  event_type: string;
  event_version: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "dev-internal-key"; // allow-secret

function checkAuth(req: any): boolean {
  const key = req.headers?.["x-api-key"];
  if (!key) return false;
  return String(key) === INTERNAL_API_KEY;
}

const app = express();
app.use(express.json({ limit: "2mb" }));

// Enable CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

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
  // Default to published for public (unauthenticated) reads.
  // Invalid state → 400, not silent filter removal.
  if (state && !allowedStates.has(state)) {
    return res.status(400).json({
      code: "bad_request",
      message: `state must be one of: ${[...allowedStates].join(", ")}`
    });
  }
  // Unauthenticated requests: only published state allowed.
  const apiKey = req.headers["x-api-key"]; // allow-secret
  const isAuthenticated = checkAuth(req);
  if (!isAuthenticated && state && state !== "published") {
    return res.status(403).json({
      code: "forbidden",
      message: "unauthenticated requests may only query published stories"
    });
  }
  const stateFilter = state
    ? state
    : isAuthenticated
      ? null
      : "published";

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
      SELECT story_id, platform_id, title, state, created_at, updated_at, published_version_id
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
    const isAuthenticated = checkAuth(req);

    // Unauthenticated reads: only published stories, only published version.
    if (!isAuthenticated && story.state !== "published") {
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    let versionsQuery = `
      SELECT story_version_id, story_id, body_markdown, disclosure_markdown, created_at
      FROM story_versions
      WHERE story_id = $1
    `;
    const versionsParams: any[] = [storyId];
    if (!isAuthenticated) {
      if (story.published_version_id) {
        versionsQuery += ` AND story_version_id = $2`;
        versionsParams.push(story.published_version_id);
      } else {
        versionsQuery += ` ORDER BY created_at DESC LIMIT 1`;
      }
    }
    const versionsQ = await pool.query(versionsQuery, versionsParams);

    const versions: StoryVersion[] = versionsQ.rows;

    let claimsQuery = `
      SELECT claim_id, story_id, story_version_id, claim_type, text, entities, time_window,
             jurisdiction, support_status, confidence_model, confidence_review, created_at
      FROM claims
      WHERE story_id = $1
    `;
    const claimsParams: any[] = [storyId];
    if (!isAuthenticated && story.published_version_id) {
      claimsQuery += ` AND story_version_id = $2`;
      claimsParams.push(story.published_version_id);
    }
    claimsQuery += ` ORDER BY created_at ASC`;
    const claimsQ = await pool.query(claimsQuery, claimsParams);

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
    const bundle = {
      story: storyWithVersions,
      claims,
      evidence_edges,
      corrections
    };

    return res.status(200).json({
      ...bundle,
      bundle_hash: hashCanonical(bundle)
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// GET /v1/story/:story_id/transparency
app.get("/v1/story/:story_id/transparency", async (req, res) => {
  const storyId = req.params.story_id;

  try {
    const bundle = await loadStoryBundle(storyId);
    if (!bundle) {
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    const checkpointQ = await pool.query(
      `
      SELECT
        cp.checkpoint_id,
        cp.merkle_root,
        cp.leaf_hashes,
        cp.created_at,
        ce.event_id,
        ce.leaf_index,
        ce.leaf_hash
      FROM transparency_checkpoints cp
      JOIN transparency_checkpoint_events ce ON ce.checkpoint_id = cp.checkpoint_id
      JOIN event_outbox eo ON eo.event_id = ce.event_id
      WHERE cp.platform_id = $1
        AND eo.platform_id = $1
        AND eo.payload->>'story_id' = $2
      ORDER BY cp.created_at DESC, ce.leaf_index ASC
      `,
      [env.PLATFORM_ID, storyId]
    );

    const checkpoints = checkpointQ.rows.map((r: any) => {
      const leafHashes = Array.isArray(r.leaf_hashes) ? r.leaf_hashes.map(String) : [];
      return {
        checkpoint_id: r.checkpoint_id,
        merkle_root: r.merkle_root,
        created_at: r.created_at,
        event_id: r.event_id,
        inclusion_proof: merkleProof(leafHashes, Number(r.leaf_index))
      };
    });

    return res.status(200).json({
      story_id: storyId,
      bundle_hash: hashCanonical(bundle),
      checkpoints
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// POST /v1/transparency/checkpoints
app.post("/v1/transparency/checkpoints", async (req, res) => {
  const limitRaw = Number(req.body?.limit ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 100;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const eventsQ = await client.query(
      `
      SELECT event_id, event_type, event_version, payload, created_at
      FROM event_outbox eo
      WHERE eo.platform_id = $1
        AND eo.event_type IN ('story.published.v1', 'correction.created.v1')
        AND NOT EXISTS (
          SELECT 1
          FROM transparency_checkpoint_events ce
          WHERE ce.event_id = eo.event_id
        )
      ORDER BY eo.created_at ASC, eo.event_id ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED
      `,
      [env.PLATFORM_ID, limit]
    );

    const events: EventOutboxRow[] = eventsQ.rows;
    if (events.length === 0) {
      await client.query("COMMIT");
      return res.status(200).json({ created: false, event_count: 0 });
    }

    const leaves = events.map((event) => ({
      event_id: event.event_id,
      event_type: event.event_type,
      event_version: event.event_version,
      payload: event.payload,
      created_at: event.created_at
    }));
    const leafHashes = leaves.map((leaf) => merkleLeafHash(leaf));
    const root = merkleRoot(leafHashes);
    const checkpointId = ulidLike();
    const eventIds = events.map((event) => event.event_id);

    await client.query(
      `
      INSERT INTO transparency_checkpoints (
        checkpoint_id,
        platform_id,
        event_count,
        merkle_root,
        event_ids,
        leaf_hashes
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      `,
      [
        checkpointId,
        env.PLATFORM_ID,
        events.length,
        root,
        JSON.stringify(eventIds),
        JSON.stringify(leafHashes)
      ]
    );

    for (let i = 0; i < events.length; i += 1) {
      await client.query(
        `
        INSERT INTO transparency_checkpoint_events (
          checkpoint_id,
          event_id,
          leaf_index,
          leaf_hash
        )
        VALUES ($1, $2, $3, $4)
        `,
        [checkpointId, events[i].event_id, i, leafHashes[i]]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      created: true,
      checkpoint_id: checkpointId,
      event_count: events.length,
      merkle_root: root,
      event_ids: eventIds
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

// GET /v1/transparency/checkpoints/:checkpoint_id
app.get("/v1/transparency/checkpoints/:checkpoint_id", async (req, res) => {
  const checkpointId = req.params.checkpoint_id;

  try {
    const checkpointQ = await pool.query(
      `
      SELECT checkpoint_id, platform_id, event_count, merkle_root, event_ids, leaf_hashes, created_at
      FROM transparency_checkpoints
      WHERE checkpoint_id = $1 AND platform_id = $2
      LIMIT 1
      `,
      [checkpointId, env.PLATFORM_ID]
    );

    if (checkpointQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "checkpoint not found" });
    }

    const eventsQ = await pool.query(
      `
      SELECT ce.event_id, ce.leaf_index, ce.leaf_hash, eo.event_type, eo.event_version, eo.payload, eo.created_at
      FROM transparency_checkpoint_events ce
      JOIN event_outbox eo ON eo.event_id = ce.event_id
      WHERE ce.checkpoint_id = $1 AND eo.platform_id = $2
      ORDER BY ce.leaf_index ASC
      `,
      [checkpointId, env.PLATFORM_ID]
    );

    return res.status(200).json({
      checkpoint: checkpointQ.rows[0],
      events: eventsQ.rows
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
// Thresholds are loaded from the policy pack (see env.ts).
// These are fallback defaults only.
const DEFAULT_MIN_PRIMARY_EVIDENCE_RATIO = 0.5;
const DEFAULT_MAX_UNSUPPORTED_CLAIM_SHARE = 0.10;

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

    const pp = env.POLICY_PACK;
    const gateQ = await client.query(
      `
      WITH
      version_row AS (
        SELECT v.story_version_id
        FROM story_versions v
        JOIN stories s ON s.story_id = v.story_id
        WHERE s.platform_id = $1 AND v.story_id = $2
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
          CASE
            WHEN array_position($5::text[], 'source') IS NOT NULL AND NULLIF(eo.provenance->>'source','') IS NOT NULL THEN eo.provenance->>'source'
            WHEN array_position($5::text[], 'publisher') IS NOT NULL AND NULLIF(eo.provenance->>'publisher','') IS NOT NULL THEN eo.provenance->>'publisher'
            WHEN array_position($5::text[], 'url') IS NOT NULL AND NULLIF(eo.provenance->>'url','') IS NOT NULL THEN eo.provenance->>'url'
            WHEN array_position($5::text[], 'blob_uri') IS NOT NULL AND NULLIF(eo.blob_uri,'') IS NOT NULL THEN eo.blob_uri
            ELSE eo.blob_uri
          END AS independence_key
        FROM evidence_objects eo
        WHERE eo.evidence_id_hash IN (SELECT evidence_id_hash FROM edges_support)
      ),
      primary_supported_claims AS (
        SELECT DISTINCT es.claim_id
        FROM edges_support es
        JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
        WHERE ev.source_class = ANY($4::text[])
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
          cb.claim_type = ANY($6::text[])
          OR EXISTS (
            SELECT 1
            FROM unnest($7::text[]) r
            WHERE cb.text ~* r
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
          (SELECT COUNT(*) FROM high_impact_support_counts WHERE independent_support_sources >= $8) AS high_impact_corroborated
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
      [
        env.PLATFORM_ID,
        storyId,
        storyVersionId,
        pp.evidence.primary_source_classes,
        pp.evidence.independence_key_fields,
        pp.claim.high_impact_claim_types,
        pp.claim.high_impact_regexes,
        pp.publish_gates.high_impact_min_independent_sources,
      ]
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
    const corroborationOk = pp.publish_gates.require_high_impact_corroboration ? corroborationOkDb : true;

    // Review prerequisite: qualifying reviews must exist for the exact target manifest.
    const minQuorum = Number(process.env.MIN_REVIEWER_QUORUM ?? 2);
    const reviewQ = await client.query(
      `SELECT count(DISTINCT r.actor_id) AS c
       FROM reviews r
       JOIN verification_tasks vt ON vt.task_id = r.task_id
       JOIN claims c ON c.claim_id = vt.claim_id
       WHERE c.story_id = $1 AND c.story_version_id = $2
         AND r.verdict IN ('supports', 'contradicts')`,
      [storyId, m.story_version_id]
    );
    const qualifyingReviews = Number(reviewQ.rows[0]?.c ?? 0);
    if (qualifyingReviews < minQuorum) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "review_required",
        message: "target manifest lacks qualifying review quorum",
        required: minQuorum,
        found: qualifyingReviews,
      });
    }

    const pass =
      totalClaims > 0 &&
      contradictedClaims <= pp.publish_gates.max_contradicted_claims &&
      primaryEvidenceRatio >= pp.publish_gates.min_primary_evidence_ratio &&
      unsupportedClaimShare <= pp.publish_gates.max_unsupported_claim_share &&
      corroborationOk;

    if (!pass) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "publish_gate_failed",
        message: "publish gate failed",
        thresholds: {
          min_primary_evidence_ratio: pp.publish_gates.min_primary_evidence_ratio,
          max_unsupported_claim_share: pp.publish_gates.max_unsupported_claim_share,
          max_contradicted_claims: pp.publish_gates.max_contradicted_claims,
          require_high_impact_corroboration: pp.publish_gates.require_high_impact_corroboration,
          high_impact_min_independent_sources: pp.publish_gates.high_impact_min_independent_sources
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
      SET state = 'published', published_version_id = $3, updated_at = now()
      WHERE platform_id = $1 AND story_id = $2
      `,
      [env.PLATFORM_ID, storyId, m.story_version_id]
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

async function loadStoryBundle(storyId: string) {
  const storyQ = await pool.query(
    `
    SELECT story_id, platform_id, title, state, created_at, updated_at
    FROM stories
    WHERE story_id = $1 AND platform_id = $2
    LIMIT 1
    `,
    [storyId, env.PLATFORM_ID]
  );

  if (storyQ.rowCount === 0) return null;

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

  return {
    story: { ...story, versions },
    claims,
    evidence_edges,
    corrections
  };
}

app.get("/v1/story/:story_id/simulation", async (req, res) => {
  const story_id = req.params.story_id;

  try {
    // 1. Get threads
    const threadsRes = await pool.query(`SELECT thread_id, status FROM sim_threads WHERE story_id = $1`, [story_id]);
    const threads = threadsRes.rows;

    if (threads.length === 0) {
      return res.status(200).json({ items: [] });
    }

    const threadIds = threads.map(t => t.thread_id);

    // 2. Get turns
    const turnsRes = await pool.query(`
      SELECT turn_id, thread_id, persona_id, parent_turn_id, content, created_at
      FROM sim_conversational_turns
      WHERE thread_id = ANY($1)
      ORDER BY created_at ASC
    `, [threadIds]);

    const personaIds = [...new Set(turnsRes.rows.map(r => r.persona_id))];

    // 3. Get personas
    let personas = [];
    if (personaIds.length > 0) {
      const personasRes = await pool.query(`
        SELECT persona_id, handle, traits
        FROM sim_personas
        WHERE persona_id = ANY($1)
      `, [personaIds]);
      personas = personasRes.rows;
    }

    // Form response
    const result = threads.map(thread => {
      const threadTurns = turnsRes.rows.filter(t => t.thread_id === thread.thread_id);
      return {
        thread_id: thread.thread_id,
        status: thread.status,
        turns: threadTurns.map(turn => ({
          ...turn,
          persona: personas.find(p => p.persona_id === turn.persona_id)
        }))
      };
    });

    return res.status(200).json({ items: result });
  } catch (err: any) {
    console.error("Simulation retrieval error", err);
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error fetching simulation",
      details: { error: err.message }
    });
  }
});

function ulidLike(): string {
  return (Date.now().toString(36).toUpperCase().padStart(10, "0") + Math.random().toString(36).slice(2, 18).toUpperCase()).slice(0, 26);
}

// ─── WP07: Federation ───────────────────────────────────────────────

// GET /v1/federation/peers — list known peers
app.get("/v1/federation/peers", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT peer_id, peer_url, peer_name, status, last_synced_at, created_at
       FROM federation_peers WHERE platform_id = $1 ORDER BY created_at DESC`,
      [env.PLATFORM_ID]
    );
    return res.status(200).json({ items: q.rows });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/federation/peers — register a peer
app.post("/v1/federation/peers", async (req, res) => {
  const { peer_url, peer_name, public_key } = req.body ?? {};
  if (!peer_url || !peer_name) {
    return res.status(400).json({ code: "bad_request", message: "peer_url and peer_name are required" });
  }

  const peer_id = ulidLike();
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO federation_peers (peer_id, platform_id, peer_url, peer_name, public_key, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
      [peer_id, env.PLATFORM_ID, peer_url, peer_name, public_key ?? null, now]
    );

    return res.status(201).json({ peer_id, peer_url, peer_name, status: "active", created_at: now });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/federation/sync — pull new published stories from a peer
app.post("/v1/federation/sync", async (req, res) => {
  const { peer_id } = req.body ?? {};
  if (!peer_id) {
    return res.status(400).json({ code: "bad_request", message: "peer_id is required" });
  }

  try {
    const peerQ = await pool.query(
      `SELECT peer_id, peer_url, status FROM federation_peers WHERE peer_id = $1 AND platform_id = $2`,
      [peer_id, env.PLATFORM_ID]
    );

    if (peerQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "peer not found" });
    }

    // In a full implementation, this would fetch from the peer's /v1/feed and /v1/story/:id endpoints.
    // For now, record the sync attempt and return status.
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE federation_peers SET last_synced_at = $1 WHERE peer_id = $2`,
      [now, peer_id]
    );

    await pool.query(
      `INSERT INTO audit_log (audit_id, platform_id, action_type, resource_type, resource_id, details, created_at)
       VALUES ($1, $2, 'federation_sync', 'peer', $3, $4::jsonb, $5)`,
      [ulidLike(), env.PLATFORM_ID, peer_id, JSON.stringify({ synced_at: now }), now]
    );

    return res.status(200).json({ peer_id, synced_at: now, status: "sync_initiated" });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// ─── WP10: Governance ───────────────────────────────────────────────

// GET /v1/audit — queryable audit log
app.get("/v1/audit", async (req, res) => {
  const actorFilter = req.query.actor_id ? String(req.query.actor_id) : null;
  const actionFilter = req.query.action_type ? String(req.query.action_type) : null;
  const resourceFilter = req.query.resource_type ? String(req.query.resource_type) : null;
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

  try {
    const q = await pool.query(
      `SELECT audit_id, platform_id, actor_id, action_type, resource_type, resource_id, details, created_at
       FROM audit_log
       WHERE platform_id = $1
         AND ($2::text IS NULL OR actor_id = $2)
         AND ($3::text IS NULL OR action_type = $3)
         AND ($4::text IS NULL OR resource_type = $4)
       ORDER BY created_at DESC
       LIMIT $5`,
      [env.PLATFORM_ID, actorFilter, actionFilter, resourceFilter, limit]
    );

    return res.status(200).json({ items: q.rows });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/stewardship/transfer — initiate stewardship transfer
app.post("/v1/stewardship/transfer", async (req, res) => {
  const { from_actor_id, to_actor_id, notes } = req.body ?? {};

  if (!from_actor_id || !to_actor_id) {
    return res.status(400).json({ code: "bad_request", message: "from_actor_id and to_actor_id are required" });
  }

  const transfer_id = ulidLike();
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO stewardship_transfers (transfer_id, platform_id, from_actor_id, to_actor_id, status, initiated_at, notes)
       VALUES ($1, $2, $3, $4, 'initiated', $5, $6)`,
      [transfer_id, env.PLATFORM_ID, from_actor_id, to_actor_id, now, notes ?? null]
    );

    await pool.query(
      `INSERT INTO audit_log (audit_id, platform_id, actor_id, action_type, resource_type, resource_id, details, created_at)
       VALUES ($1, $2, $3, 'stewardship_transfer_initiated', 'platform', $4, $5::jsonb, $6)`,
      [ulidLike(), env.PLATFORM_ID, from_actor_id, env.PLATFORM_ID, JSON.stringify({ to_actor_id, notes }), now]
    );

    return res.status(201).json({ transfer_id, from_actor_id, to_actor_id, status: "initiated", initiated_at: now });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// PUT /v1/stewardship/transfer/:id/approve — approve transfer
app.put("/v1/stewardship/transfer/:id/approve", async (req, res) => {
  const now = new Date().toISOString();

  try {
    const q = await pool.query(
      `UPDATE stewardship_transfers SET status = 'approved', approved_at = $1
       WHERE transfer_id = $2 AND platform_id = $3 AND status = 'initiated'
       RETURNING *`,
      [now, req.params.id, env.PLATFORM_ID]
    );

    if (q.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "transfer not found or not in initiated state" });
    }

    return res.status(200).json(q.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// PUT /v1/stewardship/transfer/:id/complete — complete transfer
app.put("/v1/stewardship/transfer/:id/complete", async (req, res) => {
  const now = new Date().toISOString();

  try {
    const q = await pool.query(
      `UPDATE stewardship_transfers SET status = 'completed', completed_at = $1
       WHERE transfer_id = $2 AND platform_id = $3 AND status = 'approved'
       RETURNING *`,
      [now, req.params.id, env.PLATFORM_ID]
    );

    if (q.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "transfer not found or not in approved state" });
    }

    const transfer = q.rows[0];

    // Update platform steward
    await pool.query(
      `UPDATE platforms SET steward_actor_id = $1 WHERE platform_id = $2`,
      [transfer.to_actor_id, env.PLATFORM_ID]
    ).catch(() => {
      // platforms table may not have this platform_id yet; insert it
      return pool.query(
        `INSERT INTO platforms (platform_id, name, steward_actor_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (platform_id) DO UPDATE SET steward_actor_id = $3`,
        [env.PLATFORM_ID, "Records Watch", transfer.to_actor_id, now]
      );
    });

    await pool.query(
      `INSERT INTO audit_log (audit_id, platform_id, actor_id, action_type, resource_type, resource_id, details, created_at)
       VALUES ($1, $2, $3, 'stewardship_transfer_completed', 'platform', $4, $5::jsonb, $6)`,
      [ulidLike(), env.PLATFORM_ID, transfer.to_actor_id, env.PLATFORM_ID, JSON.stringify({ from: transfer.from_actor_id, to: transfer.to_actor_id }), now]
    );

    return res.status(200).json(transfer);
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// ─── WP09: Institutions ─────────────────────────────────────────────

// GET /v1/platform/config — get platform configuration
app.get("/v1/platform/config", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT platform_id, name, config, policy_pack_version, steward_actor_id, created_at
       FROM platforms WHERE platform_id = $1`,
      [env.PLATFORM_ID]
    );

    if (q.rowCount === 0) {
      // Create default platform config
      const now = new Date().toISOString();
      await pool.query(
        `INSERT INTO platforms (platform_id, name, config, policy_pack_version, created_at) VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (platform_id) DO NOTHING`,
        [env.PLATFORM_ID, "Records Watch", JSON.stringify({}), "v1.0.0", now]
      );
      return res.status(200).json({
        platform_id: env.PLATFORM_ID,
        name: "Records Watch",
        config: {},
        policy_pack_version: "v1.0.0",
        steward_actor_id: null,
        created_at: now,
      });
    }

    return res.status(200).json(q.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// PUT /v1/platform/config — update platform configuration
app.put("/v1/platform/config", async (req, res) => {
  const { name, config } = req.body ?? {};
  const now = new Date().toISOString();

  try {
    const existing = await pool.query(
      `SELECT platform_id FROM platforms WHERE platform_id = $1`,
      [env.PLATFORM_ID]
    );

    if (existing.rowCount === 0) {
      await pool.query(
        `INSERT INTO platforms (platform_id, name, config, policy_pack_version, created_at) VALUES ($1, $2, $3::jsonb, 'v1.0.0', $4)`,
        [env.PLATFORM_ID, name ?? "Records Watch", JSON.stringify(config ?? {}), now]
      );
    } else {
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;

      if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
      if (config !== undefined) { sets.push(`config = $${idx++}::jsonb`); vals.push(JSON.stringify(config)); }

      if (sets.length > 0) {
        vals.push(env.PLATFORM_ID);
        await pool.query(
          `UPDATE platforms SET ${sets.join(", ")} WHERE platform_id = $${idx}`,
          vals
        );
      }
    }

    const q = await pool.query(
      `SELECT platform_id, name, config, policy_pack_version, steward_actor_id, created_at FROM platforms WHERE platform_id = $1`,
      [env.PLATFORM_ID]
    );

    await pool.query(
      `INSERT INTO audit_log (audit_id, platform_id, action_type, resource_type, resource_id, details, created_at) VALUES ($1, $2, 'platform_config_updated', 'platform', $3, $4::jsonb, $5)`,
      [ulidLike(), env.PLATFORM_ID, env.PLATFORM_ID, JSON.stringify({ name, config }), now]
    );

    return res.status(200).json(q.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// ─── WP08: Economics ────────────────────────────────────────────────

// POST /v1/memberships — create membership
app.post("/v1/memberships", async (req, res) => {
  const { actor_id, tier, expires_at } = req.body ?? {};
  if (!actor_id) {
    return res.status(400).json({ code: "bad_request", message: "actor_id is required" });
  }

  const member_id = ulidLike();
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO memberships (member_id, platform_id, actor_id, tier, status, started_at, expires_at, created_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $5)`,
      [member_id, env.PLATFORM_ID, actor_id, tier ?? "free", now, expires_at ?? null]
    );

    return res.status(201).json({ member_id, actor_id, tier: tier ?? "free", status: "active", started_at: now });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// GET /v1/memberships — list memberships
app.get("/v1/memberships", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT member_id, platform_id, actor_id, tier, status, started_at, expires_at, created_at
       FROM memberships WHERE platform_id = $1 ORDER BY created_at DESC`,
      [env.PLATFORM_ID]
    );
    return res.status(200).json({ items: q.rows });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/bounties — create bounty
app.post("/v1/bounties", async (req, res) => {
  const { story_id, amount, created_by } = req.body ?? {};
  if (!amount || !created_by) {
    return res.status(400).json({ code: "bad_request", message: "amount and created_by are required" });
  }

  const bounty_id = ulidLike();
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO bounties (bounty_id, platform_id, story_id, amount, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, 'open', $5, $6)`,
      [bounty_id, env.PLATFORM_ID, story_id ?? null, amount, created_by, now]
    );

    return res.status(201).json({ bounty_id, story_id, amount, status: "open", created_by, created_at: now });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/bounties/:id/contribute — contribute to bounty
app.post("/v1/bounties/:id/contribute", async (req, res) => {
  const { actor_id, amount } = req.body ?? {};
  if (!actor_id || !amount) {
    return res.status(400).json({ code: "bad_request", message: "actor_id and amount are required" });
  }

  const contribution_id = ulidLike();
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO bounty_contributions (contribution_id, bounty_id, actor_id, amount, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [contribution_id, req.params.id, actor_id, amount, now]
    );

    // Update bounty status to funded
    await pool.query(
      `UPDATE bounties SET status = 'funded' WHERE bounty_id = $1 AND status = 'open'`,
      [req.params.id]
    );

    return res.status(201).json({ contribution_id, bounty_id: req.params.id, actor_id, amount, created_at: now });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// GET /v1/bounties — list bounties
app.get("/v1/bounties", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT bounty_id, platform_id, story_id, amount, status, created_by, created_at FROM bounties WHERE platform_id = $1 ORDER BY created_at DESC`,
      [env.PLATFORM_ID]
    );
    return res.status(200).json({ items: q.rows });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/payouts — record a payout
app.post("/v1/payouts", async (req, res) => {
  const { story_id, recipient_actor_id, amount, quality_metrics } = req.body ?? {};
  if (!recipient_actor_id || !amount) {
    return res.status(400).json({ code: "bad_request", message: "recipient_actor_id and amount are required" });
  }

  const payout_id = ulidLike();
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO payouts (payout_id, platform_id, story_id, recipient_actor_id, amount, quality_metrics, policy_pack_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'v1.0.0', $7)`,
      [payout_id, env.PLATFORM_ID, story_id ?? null, recipient_actor_id, amount, JSON.stringify(quality_metrics ?? {}), now]
    );

    await pool.query(
      `INSERT INTO audit_log (audit_id, platform_id, action_type, resource_type, resource_id, details, created_at) VALUES ($1, $2, 'payout_recorded', 'payout', $3, $4::jsonb, $5)`,
      [ulidLike(), env.PLATFORM_ID, payout_id, JSON.stringify({ story_id, recipient_actor_id, amount }), now]
    );

    return res.status(201).json({ payout_id, story_id, recipient_actor_id, amount, created_at: now });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// GET /v1/economics/summary — revenue summary
app.get("/v1/economics/summary", async (req, res) => {
  try {
    const memberships = await pool.query(`SELECT count(*) as total, count(*) FILTER (WHERE status = 'active') as active FROM memberships WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const bounties = await pool.query(`SELECT count(*) as total, coalesce(sum(amount), 0) as total_amount FROM bounties WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const payouts = await pool.query(`SELECT count(*) as total, coalesce(sum(amount), 0) as total_amount FROM payouts WHERE platform_id = $1`, [env.PLATFORM_ID]);

    return res.status(200).json({
      memberships: memberships.rows[0],
      bounties: bounties.rows[0],
      payouts: payouts.rows[0],
    });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/corrections — append a correction to a claim
app.post("/v1/corrections", async (req, res) => {
  const { claim_id, reason, details } = req.body ?? {};

  if (!claim_id || !reason) {
    return res.status(400).json({
      code: "bad_request",
      message: "claim_id and reason are required"
    });
  }

  try {
    // Validate claim exists
    const claimQ = await pool.query(
      `SELECT claim_id, story_id FROM claims WHERE claim_id = $1 LIMIT 1`,
      [claim_id]
    );

    if (claimQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "claim not found" });
    }

    const correction_id = ulidLike();
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO corrections (correction_id, platform_id, claim_id, reason, details, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [correction_id, env.PLATFORM_ID, claim_id, reason, JSON.stringify(details ?? {}), now]
    );

    // Emit correction event to outbox
    await pool.query(
      `INSERT INTO event_outbox (event_id, platform_id, event_type, event_version, payload, created_at)
       VALUES ($1, $2, $3, 'v1', $4::jsonb, $5)`,
      [
        ulidLike(),
        env.PLATFORM_ID,
        "correction.created.v1",
        JSON.stringify({ correction_id, claim_id, reason }),
        now,
      ]
    );

    return res.status(201).json({
      correction_id,
      claim_id,
      reason,
      details: details ?? {},
      created_at: now,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// GET /v1/archive/export — full platform export
app.get("/v1/archive/export", async (req, res) => {
  if (!checkAuth(req)) {
    return res.status(401).json({ code: "unauthorized", message: "authentication required" });
  }
  try {
    const stories = await pool.query(`SELECT * FROM stories WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const versions = await pool.query(`SELECT sv.* FROM story_versions sv JOIN stories s ON s.story_id = sv.story_id WHERE s.platform_id = $1`, [env.PLATFORM_ID]);
    const claims = await pool.query(`SELECT c.* FROM claims c JOIN stories s ON s.story_id = c.story_id WHERE s.platform_id = $1`, [env.PLATFORM_ID]);
    const evidence = await pool.query(`SELECT * FROM evidence_objects WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const edges = await pool.query(`SELECT cee.* FROM claim_evidence_edges cee JOIN claims c ON c.claim_id = cee.claim_id JOIN stories s ON s.story_id = c.story_id WHERE s.platform_id = $1`, [env.PLATFORM_ID]);
    const corrections = await pool.query(`SELECT * FROM corrections WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const events = await pool.query(`SELECT * FROM event_outbox WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const checkpoints = await pool.query(`SELECT * FROM transparency_checkpoints WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const checkpointEvents = await pool.query(`SELECT tce.* FROM transparency_checkpoint_events tce JOIN transparency_checkpoints tc ON tc.checkpoint_id = tce.checkpoint_id WHERE tc.platform_id = $1`, [env.PLATFORM_ID]);
    const sources = await pool.query(`SELECT * FROM sources WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const captures = await pool.query(`SELECT sc.* FROM source_captures sc JOIN sources s ON s.source_id = sc.source_id WHERE s.platform_id = $1`, [env.PLATFORM_ID]);
    const runs = await pool.query(`SELECT * FROM ingest_runs WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const actors = await pool.query(`SELECT * FROM actors WHERE platform_id = $1`, [env.PLATFORM_ID]);
    const tasks = await pool.query(`SELECT vt.* FROM verification_tasks vt JOIN stories s ON s.story_id = vt.story_id WHERE s.platform_id = $1`, [env.PLATFORM_ID]);
    const reviews = await pool.query(`SELECT r.* FROM reviews r JOIN verification_tasks vt ON vt.task_id = r.task_id JOIN stories s ON s.story_id = vt.story_id WHERE s.platform_id = $1`, [env.PLATFORM_ID]);

    const archive = {
      platform_id: env.PLATFORM_ID,
      exported_at: new Date().toISOString(),
      policy_pack_version: "v1.0.0",
      data: {
        stories: stories.rows,
        story_versions: versions.rows,
        claims: claims.rows,
        evidence_objects: evidence.rows,
        claim_evidence_edges: edges.rows,
        corrections: corrections.rows,
        event_outbox: events.rows,
        transparency_checkpoints: checkpoints.rows,
        transparency_checkpoint_events: checkpointEvents.rows,
        sources: sources.rows,
        source_captures: captures.rows,
        ingest_runs: runs.rows,
        actors: actors.rows,
        verification_tasks: tasks.rows,
        reviews: reviews.rows,
      },
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="archive-${env.PLATFORM_ID}-${Date.now()}.json"`);
    return res.status(200).json(archive);
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// POST /v1/archive/import — import an archive
app.post("/v1/archive/import", async (req, res) => {
  if (!checkAuth(req)) {
    return res.status(401).json({ code: "unauthorized", message: "authentication required" });
  }
  const { platform_id, data } = req.body ?? {};

  if (!data || typeof data !== "object") {
    return res.status(400).json({ code: "bad_request", message: "data object is required" });
  }

  const targetPlatform = platform_id ?? env.PLATFORM_ID;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const counts: Record<string, number> = {};

    // Import in dependency order
    if (data.actors) {
      for (const row of data.actors) {
        await client.query(
          `INSERT INTO actors (actor_id, platform_id, display_name, role, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (actor_id) DO NOTHING`,
          [row.actor_id, targetPlatform, row.display_name, row.role, row.created_at]
        );
      }
      counts.actors = data.actors.length;
    }

    if (data.stories) {
      let inserted = 0;
      for (const row of data.stories) {
        const r = await client.query(
          `INSERT INTO stories (story_id, platform_id, title, state, created_at, updated_at) VALUES ($1, $2, $3, 'draft', $4, $5) ON CONFLICT (story_id) DO NOTHING`,
          [row.story_id, targetPlatform, row.title, row.created_at, row.updated_at]
        );
        inserted += r.rowCount ?? 0;
      }
      counts.stories = inserted;
    }

    if (data.story_versions) {
      for (const row of data.story_versions) {
        await client.query(
          `INSERT INTO story_versions (story_version_id, story_id, body_markdown, disclosure_markdown, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (story_version_id) DO NOTHING`,
          [row.story_version_id, row.story_id, row.body_markdown, row.disclosure_markdown, row.created_at]
        );
      }
      counts.story_versions = data.story_versions.length;
    }

    if (data.evidence_objects) {
      for (const row of data.evidence_objects) {
        await client.query(
          `INSERT INTO evidence_objects (evidence_id_hash, platform_id, blob_uri, media_type, extracted_text, provenance, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) ON CONFLICT (evidence_id_hash) DO NOTHING`,
          [row.evidence_id_hash, targetPlatform, row.blob_uri, row.media_type, row.extracted_text, JSON.stringify(row.provenance ?? {}), row.created_at]
        );
      }
      counts.evidence_objects = data.evidence_objects.length;
    }

    if (data.claims) {
      for (const row of data.claims) {
        await client.query(
          `INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, entities, time_window, jurisdiction, support_status, confidence_model, confidence_review, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12) ON CONFLICT (claim_id) DO NOTHING`,
          [row.claim_id, row.story_id, row.story_version_id, row.claim_type, row.text, JSON.stringify(row.entities ?? []), JSON.stringify(row.time_window ?? {}), row.jurisdiction, row.support_status, row.confidence_model, row.confidence_review, row.created_at]
        );
      }
      counts.claims = data.claims.length;
    }

    if (data.claim_evidence_edges) {
      for (const row of data.claim_evidence_edges) {
        await client.query(
          `INSERT INTO claim_evidence_edges (edge_id, claim_id, evidence_id_hash, relation, strength, reviewer_actor_id, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (edge_id) DO NOTHING`,
          [row.edge_id, row.claim_id, row.evidence_id_hash, row.relation, row.strength, row.reviewer_actor_id, row.notes, row.created_at]
        );
      }
      counts.claim_evidence_edges = data.claim_evidence_edges.length;
    }

    if (data.corrections) {
      for (const row of data.corrections) {
        await client.query(
          `INSERT INTO corrections (correction_id, platform_id, claim_id, reason, details, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (correction_id) DO NOTHING`,
          [row.correction_id, targetPlatform, row.claim_id, row.reason, JSON.stringify(row.details ?? {}), row.created_at]
        );
      }
      counts.corrections = data.corrections.length;
    }

    if (data.verification_tasks) {
      for (const row of data.verification_tasks) {
        await client.query(
          `INSERT INTO verification_tasks (task_id, platform_id, story_id, claim_id, task_type, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (task_id) DO NOTHING`,
          [row.task_id, targetPlatform, row.story_id, row.claim_id, row.task_type, row.status, row.created_at]
        );
      }
      counts.verification_tasks = data.verification_tasks.length;
    }

    if (data.reviews) {
      for (const row of data.reviews) {
        await client.query(
          `INSERT INTO reviews (review_id, task_id, actor_id, verdict, notes, evidence_edges, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) ON CONFLICT (review_id) DO NOTHING`,
          [row.review_id, row.task_id, row.actor_id, row.verdict, row.notes, JSON.stringify(row.evidence_edges ?? []), row.created_at]
        );
      }
      counts.reviews = data.reviews.length;
    }

    if (data.event_outbox) {
      for (const row of data.event_outbox) {
        await client.query(
          `INSERT INTO event_outbox (event_id, platform_id, event_type, event_version, payload, created_at, published_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) ON CONFLICT (event_id) DO NOTHING`,
          [row.event_id, targetPlatform, row.event_type, row.event_version, JSON.stringify(row.payload ?? {}), row.created_at, row.published_at]
        );
      }
      counts.event_outbox = data.event_outbox.length;
    }

    if (data.transparency_checkpoints) {
      for (const row of data.transparency_checkpoints) {
        await client.query(
          `INSERT INTO transparency_checkpoints (checkpoint_id, platform_id, event_count, merkle_root, event_ids, leaf_hashes, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) ON CONFLICT (checkpoint_id) DO NOTHING`,
          [row.checkpoint_id, targetPlatform, row.event_count, row.merkle_root, JSON.stringify(row.event_ids ?? []), JSON.stringify(row.leaf_hashes ?? []), row.created_at]
        );
      }
      counts.transparency_checkpoints = data.transparency_checkpoints.length;
    }

    if (data.transparency_checkpoint_events) {
      for (const row of data.transparency_checkpoint_events) {
        await client.query(
          `INSERT INTO transparency_checkpoint_events (checkpoint_id, event_id, leaf_index, leaf_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (checkpoint_id, event_id) DO NOTHING`,
          [row.checkpoint_id, row.event_id, row.leaf_index, row.leaf_hash]
        );
      }
      counts.transparency_checkpoint_events = data.transparency_checkpoint_events.length;
    }

    if (data.sources) {
      for (const row of data.sources) {
        await client.query(
          `INSERT INTO sources (source_id, platform_id, name, feed_url, source_class, fetch_interval_minutes, enabled, last_fetched_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (source_id) DO NOTHING`,
          [row.source_id, targetPlatform, row.name, row.feed_url, row.source_class, row.fetch_interval_minutes, row.enabled, row.last_fetched_at, row.created_at]
        );
      }
      counts.sources = data.sources.length;
    }

    if (data.source_captures) {
      for (const row of data.source_captures) {
        await client.query(
          `INSERT INTO source_captures (capture_id, source_id, platform_id, url, captured_at, content_hash, blob_uri, status, error, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (capture_id) DO NOTHING`,
          [row.capture_id, row.source_id, targetPlatform, row.url, row.captured_at, row.content_hash, row.blob_uri, row.status, row.error, row.created_at]
        );
      }
      counts.source_captures = data.source_captures.length;
    }

    if (data.ingest_runs) {
      for (const row of data.ingest_runs) {
        await client.query(
          `INSERT INTO ingest_runs (run_id, platform_id, started_at, completed_at, sources_processed, articles_found, articles_new, claims_extracted, errors, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (run_id) DO NOTHING`,
          [row.run_id, targetPlatform, row.started_at, row.completed_at, row.sources_processed, row.articles_found, row.articles_new, row.claims_extracted, row.errors, row.created_at]
        );
      }
      counts.ingest_runs = data.ingest_runs.length;
    }

    await client.query("COMMIT");

    return res.status(200).json({
      imported: true,
      platform_id: targetPlatform,
      counts,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  } finally {
    client.release();
  }
});

// GET /v1/verify/trust — verify platform integrity
app.get("/v1/verify/trust", async (req, res) => {
  try {
    const checks: Record<string, { pass: boolean; detail?: string }> = {};

    // Check 1: All published stories have publish events
    const publishedWithoutEvent = await pool.query(
      `SELECT s.story_id FROM stories s
       WHERE s.platform_id = $1 AND s.state = 'published'
         AND NOT EXISTS (SELECT 1 FROM event_outbox eo WHERE eo.platform_id = $1 AND eo.event_type = 'story.published.v1' AND eo.payload->>'story_id' = s.story_id)`,
      [env.PLATFORM_ID]
    );
    checks.published_stories_have_events = {
      pass: publishedWithoutEvent.rowCount === 0,
      detail: publishedWithoutEvent.rowCount ? `${publishedWithoutEvent.rowCount} published stories without publish events` : undefined,
    };

    // Check 2: All evidence objects have valid content hashes (sha256: prefix)
    const badHashes = await pool.query(
      `SELECT evidence_id_hash FROM evidence_objects WHERE platform_id = $1 AND evidence_id_hash NOT LIKE 'sha256:%'`,
      [env.PLATFORM_ID]
    );
    checks.evidence_hashes_valid = {
      pass: badHashes.rowCount === 0,
      detail: badHashes.rowCount ? `${badHashes.rowCount} evidence objects with invalid hash format` : undefined,
    };

    // Check 3: All corrections reference existing claims
    const orphanCorrections = await pool.query(
      `SELECT c.correction_id FROM corrections c WHERE c.platform_id = $1 AND NOT EXISTS (SELECT 1 FROM claims cl WHERE cl.claim_id = c.claim_id)`,
      [env.PLATFORM_ID]
    );
    checks.corrections_reference_claims = {
      pass: orphanCorrections.rowCount === 0,
      detail: orphanCorrections.rowCount ? `${orphanCorrections.rowCount} orphan corrections` : undefined,
    };

    // Check 4: All transparency checkpoints have valid merkle roots
    const badCheckpoints = await pool.query(
      `SELECT checkpoint_id FROM transparency_checkpoints WHERE platform_id = $1 AND (merkle_root IS NULL OR merkle_root = '')`,
      [env.PLATFORM_ID]
    );
    checks.checkpoint_merkle_roots = {
      pass: badCheckpoints.rowCount === 0,
      detail: badCheckpoints.rowCount ? `${badCheckpoints.rowCount} checkpoints with invalid merkle roots` : undefined,
    };

    // Check 5: All claims reference existing story versions
    const orphanClaims = await pool.query(
      `SELECT c.claim_id FROM claims c WHERE NOT EXISTS (SELECT 1 FROM story_versions sv WHERE sv.story_version_id = c.story_version_id)`,
      []
    );
    checks.claims_reference_versions = {
      pass: orphanClaims.rowCount === 0,
      detail: orphanClaims.rowCount ? `${orphanClaims.rowCount} claims with missing versions` : undefined,
    };

    const allPass = Object.values(checks).every((c) => c.pass);

    return res.status(200).json({
      platform_id: env.PLATFORM_ID,
      all_pass: allPass,
      checks,
      checked_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// GET /v1/corrections/:claim_id — list corrections for a claim
app.get("/v1/corrections/:claim_id", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT correction_id, claim_id, reason, details, created_at
       FROM corrections
       WHERE platform_id = $1 AND claim_id = $2
       ORDER BY created_at ASC`,
      [env.PLATFORM_ID, req.params.claim_id]
    );

    return res.status(200).json({ items: q.rows });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

export { pool };

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

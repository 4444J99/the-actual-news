import express from "express";
import crypto from "node:crypto";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);
const PORT = Number(process.env.CLAIM_PORT ?? DEFAULT_PORT);

type ClaimType = "factual" | "statistical" | "attribution" | "interpretation";
type SupportStatus = "unsupported" | "partially_supported" | "supported" | "contradicted";

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

function detectClaimType(text: string): ClaimType {
  if (/\d+%|\$[\d,]+|million|billion|\d+\s*(people|cases|deaths)/i.test(text)) {
    return "statistical";
  }
  if (/said|according to|stated|announced|reported/i.test(text)) {
    return "attribution";
  }
  return "factual";
}

function extractEntities(text: string): string[] {
  const words = text.split(/\s+/);
  return words
    .filter((w) => w.length > 1 && /^[A-Z]/.test(w) && !/^(The|A|An|In|On|At|By|For|To|Is|It|He|She|We|They)$/.test(w))
    .slice(0, 5);
}

export const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "claim", platform_id: env.PLATFORM_ID });
});

// POST /v1/extract — start claim extraction
app.post("/v1/extract", async (req, res) => {
  const { platform_id, story_id, story_version_id, body_markdown, model_policy } = req.body ?? {};

  if (!story_id || !story_version_id || !body_markdown) {
    return res.status(400).json({
      code: "bad_request",
      message: "story_id, story_version_id, and body_markdown are required",
    });
  }

  const pid = platform_id ?? env.PLATFORM_ID;
  const job_id = ulid();
  const now = new Date().toISOString();

  try {
    // Record extraction job
    // (jobs table not in schema; we track via claims directly)

    const sentences = String(body_markdown)
      .split(/[.!?]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 20);

    const maxClaims = model_policy?.max_claims ?? 200;
    const extracted = sentences.slice(0, maxClaims);

    const claimIds: string[] = [];
    for (const text of extracted) {
      const claim_id = ulid();
      await pool.query(
        `INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, entities, time_window, jurisdiction, support_status, confidence_model, confidence_review, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, 'unsupported', $9, $10, $11)`,
        [
          claim_id,
          story_id,
          story_version_id,
          detectClaimType(text),
          text,
          JSON.stringify(extractEntities(text)),
          JSON.stringify({}),
          null,
          null,
          null,
          now,
        ]
      );
      claimIds.push(claim_id);
    }

    return res.status(202).json({ job_id, claims_created: claimIds.length, claim_ids: claimIds });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// GET /v1/stories/:story_id/claims — list claims for a story
app.get("/v1/stories/:story_id/claims", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT claim_id, story_id, story_version_id, claim_type, text, entities, time_window,
              jurisdiction, support_status, confidence_model, confidence_review, created_at
       FROM claims
       WHERE story_id = $1
       ORDER BY created_at ASC`,
      [req.params.story_id]
    );

    const items = q.rows.map((r: any) => ({
      ...r,
      entities: Array.isArray(r.entities) ? r.entities : (r.entities ?? []),
      time_window: r.time_window ?? {},
    }));

    return res.status(200).json({ items });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// PUT /v1/claims/:claim_id/support — update claim support status
app.put("/v1/claims/:claim_id/support", async (req, res) => {
  const { support_status } = req.body ?? {};
  const allowed = new Set(["unsupported", "partially_supported", "supported", "contradicted"]);
  if (!support_status || !allowed.has(support_status)) {
    return res.status(400).json({ code: "bad_request", message: "invalid support_status" });
  }

  try {
    const result = await pool.query(
      `UPDATE claims SET support_status = $1 WHERE claim_id = $2 RETURNING claim_id, support_status`,
      [support_status, req.params.claim_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "claim not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

export { pool };

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ service: "claim", port: PORT, platform_id: env.PLATFORM_ID }));
  });

  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
import express from "express";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";
import { newId, contentHash } from "shared";

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);
const PORT = Number(process.env.CLAIM_PORT ?? DEFAULT_PORT);

type ClaimType = "factual" | "statistical" | "attribution" | "interpretation";
type SupportStatus = "unsupported" | "partially_supported" | "supported" | "contradicted";

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
  const job_id = newId();
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

    // One transaction for the whole extraction: a crash mid-loop must not
    // leave half the claims, and re-extracting the same body for the same
    // version reuses the existing claim rows (UNIQUE (story_version_id,
    // text_hash)) instead of minting duplicates.
    const client = await pool.connect();
    const claimIds: string[] = [];
    try {
      await client.query("BEGIN");
      for (const text of extracted) {
        const textHash = contentHash(text);
        const ins = await client.query(
          `INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, text_hash, entities, time_window, jurisdiction, support_status, confidence_model, confidence_review, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, 'unsupported', $10, $11, $12)
           ON CONFLICT (story_version_id, text_hash) DO NOTHING RETURNING claim_id`,
          [
            newId(),
            story_id,
            story_version_id,
            detectClaimType(text),
            text,
            textHash,
            JSON.stringify(extractEntities(text)),
            JSON.stringify({}),
            null,
            null,
            null,
            now,
          ]
        );
        if (ins.rowCount && ins.rowCount > 0) {
          claimIds.push(ins.rows[0].claim_id);
        } else {
          const existing = await client.query(
            `SELECT claim_id FROM claims WHERE story_version_id = $1 AND text_hash = $2`,
            [story_version_id, textHash]
          );
          claimIds.push(existing.rows[0].claim_id);
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Best-effort; the connection may already be dead.
      }
      throw err;
    } finally {
      client.release();
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
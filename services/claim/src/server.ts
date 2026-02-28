import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.CLAIM_PORT ?? 8082);
const PLATFORM_ID = process.env.PLATFORM_ID ?? "unknown";

type ClaimType = "factual" | "statistical" | "attribution" | "interpretation";
type SupportStatus = "unsupported" | "partially_supported" | "supported" | "contradicted";

type Claim = {
  claim_id: string;
  story_id: string;
  story_version_id: string;
  claim_type: ClaimType;
  text: string;
  entities: string[];
  time_window?: { start?: string; end?: string };
  jurisdiction?: string | null;
  support_status: SupportStatus;
  confidence_model?: number | null;
  confidence_review?: number | null;
  created_at: string;
};

type ExtractionJob = {
  job_id: string;
  platform_id: string;
  story_id: string;
  story_version_id: string;
  status: "pending" | "completed" | "failed";
  created_at: string;
};

// In-memory stores
const claims = new Map<string, Claim>();
const jobs = new Map<string, ExtractionJob>();

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

export const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "claim", platform_id: PLATFORM_ID });
});

// POST /v1/extract — start claim extraction
app.post("/v1/extract", (req, res) => {
  const { platform_id, story_id, story_version_id, body_markdown, model_policy } = req.body ?? {};

  if (!story_id || !story_version_id || !body_markdown) {
    return res.status(400).json({
      code: "bad_request",
      message: "story_id, story_version_id, and body_markdown are required",
    });
  }

  const job_id = ulid();
  const now = new Date().toISOString();

  const job: ExtractionJob = {
    job_id,
    platform_id: platform_id ?? PLATFORM_ID,
    story_id,
    story_version_id,
    status: "pending",
    created_at: now,
  };
  jobs.set(job_id, job);

  // Simulate basic claim extraction from markdown
  const sentences = body_markdown
    .split(/[.!?]+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 20);

  const maxClaims = model_policy?.max_claims ?? 200;
  const extracted = sentences.slice(0, maxClaims);

  for (const text of extracted) {
    const claim: Claim = {
      claim_id: ulid(),
      story_id,
      story_version_id,
      claim_type: detectClaimType(text),
      text,
      entities: extractEntities(text),
      support_status: "unsupported",
      confidence_model: null,
      confidence_review: null,
      created_at: now,
    };
    claims.set(claim.claim_id, claim);
  }

  job.status = "completed";

  return res.status(202).json({ job_id });
});

// GET /v1/stories/:story_id/claims — list claims for a story
app.get("/v1/stories/:story_id/claims", (req, res) => {
  const story_id = req.params.story_id;
  const items = Array.from(claims.values())
    .filter((c) => c.story_id === story_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  return res.status(200).json({ items });
});

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

export { claims, jobs };

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ service: "claim", port: PORT, platform_id: PLATFORM_ID }));
  });

  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}

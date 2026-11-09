import express from "express";
import crypto from "node:crypto";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);

const PORT = Number(process.env.STORY_PORT ?? DEFAULT_PORT);

type Story = {
  story_id: string;
  platform_id: string;
  title: string;
  state: "draft" | "review" | "published";
  created_at: string;
  updated_at: string;
};

type StoryVersion = {
  story_version_id: string;
  story_id: string;
  body_markdown: string;
  disclosure_markdown?: string | null;
  created_at: string;
};

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

export const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "story", platform_id: env.PLATFORM_ID });
});

// POST /v1/stories — create a story
app.post("/v1/stories", async (req, res) => {
  const { title, initial_body_markdown } = req.body ?? {};

  if (!title || typeof title !== "string") {
    return res.status(400).json({ code: "bad_request", message: "title is required" });
  }

  const now = new Date().toISOString();
  const story_id = ulid();

  try {
    await pool.query(
      `INSERT INTO stories (story_id, platform_id, title, state, created_at, updated_at)
       VALUES ($1, $2, $3, 'draft', $4, $4)`,
      [story_id, env.PLATFORM_ID, title, now]
    );

    if (initial_body_markdown && typeof initial_body_markdown === "string") {
      const version_id = ulid();
      await pool.query(
        `INSERT INTO story_versions (story_version_id, story_id, body_markdown, created_at)
         VALUES ($1, $2, $3, $4)`,
        [version_id, story_id, initial_body_markdown, now]
      );
    }

    return res.status(201).json({
      story_id,
      platform_id: env.PLATFORM_ID,
      title,
      state: "draft",
      created_at: now,
      updated_at: now,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// GET /v1/stories — list stories
app.get("/v1/stories", async (req, res) => {
  const stateFilter = req.query.state ? String(req.query.state) : null;
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

  const allowedStates = new Set(["draft", "review", "published"]);
  const validState = stateFilter && allowedStates.has(stateFilter) ? stateFilter : null;

  try {
    const q = await pool.query(
      `SELECT story_id, platform_id, title, state, created_at, updated_at
       FROM stories
       WHERE platform_id = $1
         AND ($2::text IS NULL OR state = $2)
       ORDER BY updated_at DESC
       LIMIT $3`,
      [env.PLATFORM_ID, validState, limit]
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

// GET /v1/stories/:story_id — get story with versions
app.get("/v1/stories/:story_id", async (req, res) => {
  try {
    const storyQ = await pool.query(
      `SELECT story_id, platform_id, title, state, created_at, updated_at
       FROM stories
       WHERE story_id = $1 AND platform_id = $2
       LIMIT 1`,
      [req.params.story_id, env.PLATFORM_ID]
    );

    if (storyQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    const versionsQ = await pool.query(
      `SELECT story_version_id, story_id, body_markdown, disclosure_markdown, created_at
       FROM story_versions
       WHERE story_id = $1
       ORDER BY created_at DESC`,
      [req.params.story_id]
    );

    return res.status(200).json({
      ...storyQ.rows[0],
      versions: versionsQ.rows,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// POST /v1/stories/:story_id/versions — add a version
app.post("/v1/stories/:story_id/versions", async (req, res) => {
  const { body_markdown, disclosure_markdown } = req.body ?? {};

  if (!body_markdown || typeof body_markdown !== "string") {
    return res.status(400).json({ code: "bad_request", message: "body_markdown is required" });
  }

  try {
    const storyQ = await pool.query(
      `SELECT story_id, platform_id FROM stories WHERE story_id = $1 AND platform_id = $2 LIMIT 1`,
      [req.params.story_id, env.PLATFORM_ID]
    );

    if (storyQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    const now = new Date().toISOString();
    const version_id = ulid();

    await pool.query(
      `INSERT INTO story_versions (story_version_id, story_id, body_markdown, disclosure_markdown, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [version_id, req.params.story_id, body_markdown, disclosure_markdown ?? null, now]
    );

    await pool.query(
      `UPDATE stories SET updated_at = $1 WHERE story_id = $2 AND platform_id = $3`,
      [now, req.params.story_id, env.PLATFORM_ID]
    );

    return res.status(201).json({
      story_version_id: version_id,
      story_id: req.params.story_id,
      body_markdown,
      disclosure_markdown: disclosure_markdown ?? null,
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

// PUT /v1/stories/:story_id/state — transition story state
app.put("/v1/stories/:story_id/state", async (req, res) => {
  const { state } = req.body ?? {};
  const allowedTransitions: Record<string, string[]> = {
    draft: ["review"],
    review: ["published"],
  };

  if (!state || !["draft", "review", "published"].includes(state)) {
    return res.status(400).json({ code: "bad_request", message: "state must be draft, review, or published" });
  }

  try {
    const storyQ = await pool.query(
      `SELECT story_id, state FROM stories WHERE story_id = $1 AND platform_id = $2 LIMIT 1`,
      [req.params.story_id, env.PLATFORM_ID]
    );

    if (storyQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    const currentState = storyQ.rows[0].state;
    if (currentState === "published") {
      return res.status(409).json({ code: "conflict", message: "published stories cannot transition" });
    }

    const allowed = allowedTransitions[currentState] ?? [];
    if (!allowed.includes(state)) {
      return res.status(409).json({
        code: "conflict",
        message: `cannot transition from ${currentState} to ${state}`
      });
    }

    // published transition must go through gateway publish gate, not this endpoint
    if (state === "published") {
      return res.status(403).json({
        code: "forbidden",
        message: "publication must go through the gateway publish gate"
      });
    }

    const now = new Date().toISOString();
    await pool.query(
      `UPDATE stories SET state = $1, updated_at = $2 WHERE story_id = $3 AND platform_id = $4`,
      [state, now, req.params.story_id, env.PLATFORM_ID]
    );

    return res.status(200).json({ story_id: req.params.story_id, state, updated_at: now });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

export { } from "./db.js";

export { pool };

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ service: "story", port: PORT, platform_id: env.PLATFORM_ID }));
  });

  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
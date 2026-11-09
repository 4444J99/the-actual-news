import express from "express";
import crypto from "node:crypto";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);
const PORT = Number(process.env.VERIFY_PORT ?? DEFAULT_PORT);

type TaskStatus = "open" | "in_progress" | "resolved";
type TaskType = "evidence_gap" | "corroboration" | "contradiction" | "coi_check";
type Verdict = "supports" | "contradicts" | "context_only" | "cannot_determine";

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

export const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "verify", platform_id: env.PLATFORM_ID });
});

// GET /v1/tasks — list verification tasks
app.get("/v1/tasks", async (req, res) => {
  const statusFilter = req.query.status ? String(req.query.status) : null;
  const allowedStatuses = new Set(["open", "in_progress", "resolved"]);

  try {
    const q = await pool.query(
      `SELECT task_id, platform_id, story_id, claim_id, task_type, status, created_at
       FROM verification_tasks
       WHERE platform_id = $1
         AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at ASC`,
      [env.PLATFORM_ID, statusFilter && allowedStatuses.has(statusFilter) ? statusFilter : null]
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

// POST /v1/tasks — create a verification task
app.post("/v1/tasks", async (req, res) => {
  const { story_id, claim_id, task_type } = req.body ?? {};

  if (!story_id || !claim_id || !task_type) {
    return res.status(400).json({
      code: "bad_request",
      message: "story_id, claim_id, and task_type are required",
    });
  }

  const allowedTypes = new Set(["evidence_gap", "corroboration", "contradiction", "coi_check"]);
  if (!allowedTypes.has(task_type)) {
    return res.status(400).json({
      code: "bad_request",
      message: `task_type must be one of: ${[...allowedTypes].join(", ")}`,
    });
  }

  const task_id = ulid();
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO verification_tasks (task_id, platform_id, story_id, claim_id, task_type, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'open', $6)`,
      [task_id, env.PLATFORM_ID, story_id, claim_id, task_type, now]
    );

    return res.status(201).json({
      task_id,
      platform_id: env.PLATFORM_ID,
      story_id,
      claim_id,
      task_type,
      status: "open",
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

// POST /v1/tasks/:task_id/review — submit a review
app.post("/v1/tasks/:task_id/review", async (req, res) => {
  const { actor_id, verdict, notes, evidence_edges } = req.body ?? {};

  if (!actor_id || !verdict || !notes) {
    return res.status(400).json({
      code: "bad_request",
      message: "actor_id, verdict, and notes are required",
    });
  }

  const allowedVerdicts = new Set(["supports", "contradicts", "context_only", "cannot_determine"]);
  if (!allowedVerdicts.has(verdict)) {
    return res.status(400).json({
      code: "bad_request",
      message: `verdict must be one of: ${[...allowedVerdicts].join(", ")}`,
    });
  }

  try {
    // Ensure actor exists (upsert)
    await pool.query(
      `INSERT INTO actors (actor_id, platform_id, display_name, role, created_at)
       VALUES ($1, $2, $3, 'reviewer', now())
       ON CONFLICT (actor_id) DO NOTHING`,
      [actor_id, env.PLATFORM_ID, actor_id]
    );

    // Check for duplicate review by same actor
    const dupCheck = await pool.query(
      `SELECT review_id FROM reviews WHERE task_id = $1 AND actor_id = $2 LIMIT 1`,
      [req.params.task_id, actor_id]
    );
    if (dupCheck.rowCount && dupCheck.rowCount > 0) {
      return res.status(409).json({ code: "conflict", message: "actor already reviewed this task" });
    }

    const taskQ = await pool.query(
      `SELECT task_id, status FROM verification_tasks WHERE task_id = $1 AND platform_id = $2 LIMIT 1`,
      [req.params.task_id, env.PLATFORM_ID]
    );

    if (taskQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "task not found" });
    }

    if (taskQ.rows[0].status === "resolved") {
      return res.status(409).json({ code: "conflict", message: "task already resolved" });
    }

    const now = new Date().toISOString();
    const review_id = ulid();

    await pool.query(
      `INSERT INTO reviews (review_id, task_id, actor_id, verdict, notes, evidence_edges, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [review_id, req.params.task_id, actor_id, verdict, notes, JSON.stringify(evidence_edges ?? []), now]
    );

    // Quorum: count distinct reviewers with qualifying (decisive) verdicts only
    const quorumQ = await pool.query(
      `SELECT count(DISTINCT actor_id) as reviewer_count FROM reviews WHERE task_id = $1 AND verdict IN ('supports', 'contradicts')`,
      [req.params.task_id]
    );
    const reviewerCount = Number(quorumQ.rows[0]?.reviewer_count ?? 0);
    const minQuorum = Number(process.env.MIN_REVIEWER_QUORUM ?? 2);

    // Resolve only if quorum met
    if (reviewerCount >= minQuorum) {
      await pool.query(
        `UPDATE verification_tasks SET status = 'resolved' WHERE task_id = $1`,
        [req.params.task_id]
      );
    } else {
      await pool.query(
        `UPDATE verification_tasks SET status = 'in_progress' WHERE task_id = $1`,
        [req.params.task_id]
      );
    }

    // If verdict is supports/contradicts, update claim support status
    if (verdict === "contradicts") {
      await pool.query(
        `UPDATE claims SET support_status = 'contradicted'
         WHERE claim_id = (SELECT claim_id FROM verification_tasks WHERE task_id = $1)`,
        [req.params.task_id]
      );
    } else if (verdict === "supports") {
      await pool.query(
        `UPDATE claims SET support_status = CASE
           WHEN support_status = 'unsupported' THEN 'partially_supported'
           ELSE support_status
         END
         WHERE claim_id = (SELECT claim_id FROM verification_tasks WHERE task_id = $1)`,
        [req.params.task_id]
      );
    }

    return res.status(201).json({
      review_id,
      task_id: req.params.task_id,
      actor_id,
      verdict,
      notes,
      evidence_edges: evidence_edges ?? [],
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

export { pool };

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ service: "verify", port: PORT, platform_id: env.PLATFORM_ID }));
  });

  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
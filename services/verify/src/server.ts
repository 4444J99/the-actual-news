import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.VERIFY_PORT ?? 8084);
const PLATFORM_ID = process.env.PLATFORM_ID ?? "unknown";

type TaskStatus = "open" | "in_progress" | "resolved";
type TaskType = "evidence_gap" | "corroboration" | "contradiction" | "coi_check";
type Verdict = "supports" | "contradicts" | "context_only" | "cannot_determine";

type VerificationTask = {
  task_id: string;
  story_id: string;
  claim_id: string;
  task_type: TaskType;
  status: TaskStatus;
  created_at: string;
};

type Review = {
  review_id: string;
  task_id: string;
  actor_id: string;
  verdict: Verdict;
  notes: string;
  evidence_edges: { evidence_id_hash: string; relation: string; strength: number }[];
  created_at: string;
};

// In-memory stores
const tasks = new Map<string, VerificationTask>();
const reviews = new Map<string, Review[]>();

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

export const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "verify", platform_id: PLATFORM_ID });
});

// GET /v1/tasks — list verification tasks
app.get("/v1/tasks", (req, res) => {
  const statusFilter = req.query.status ? String(req.query.status) : null;
  const allowedStatuses = new Set(["open", "in_progress", "resolved"]);

  let items = Array.from(tasks.values());

  if (statusFilter && allowedStatuses.has(statusFilter)) {
    items = items.filter((t) => t.status === statusFilter);
  }

  items.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return res.status(200).json({ items });
});

// POST /v1/tasks — create a verification task (not in OpenAPI but needed)
app.post("/v1/tasks", (req, res) => {
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

  const task: VerificationTask = {
    task_id,
    story_id,
    claim_id,
    task_type,
    status: "open",
    created_at: now,
  };

  tasks.set(task_id, task);
  reviews.set(task_id, []);

  return res.status(201).json(task);
});

// POST /v1/tasks/:task_id/review — submit a review
app.post("/v1/tasks/:task_id/review", (req, res) => {
  const task = tasks.get(req.params.task_id);

  if (!task) {
    return res.status(404).json({ code: "not_found", message: "task not found" });
  }

  if (task.status === "resolved") {
    return res.status(409).json({ code: "conflict", message: "task already resolved" });
  }

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

  const now = new Date().toISOString();
  const review: Review = {
    review_id: ulid(),
    task_id: task.task_id,
    actor_id,
    verdict,
    notes,
    evidence_edges: evidence_edges ?? [],
    created_at: now,
  };

  const taskReviews = reviews.get(task.task_id) ?? [];
  taskReviews.push(review);
  reviews.set(task.task_id, taskReviews);

  task.status = "resolved";

  return res.status(201).json(review);
});

export { tasks, reviews };

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ service: "verify", port: PORT, platform_id: PLATFORM_ID }));
  });

  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}

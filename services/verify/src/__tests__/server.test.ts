import { describe, it, expect, beforeEach } from "vitest";
import http from "node:http";
import { app, tasks, reviews } from "../server.js";

let server: http.Server;
let baseUrl: string;

function fetch(path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: opts.method ?? "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode!, json: () => Promise.resolve(JSON.parse(data)) });
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

beforeEach(async () => {
  tasks.clear();
  reviews.clear();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;

  return () => new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /v1/health", () => {
  it("should return ok", async () => {
    const res = await fetch("/v1/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("verify");
  });
});

describe("POST /v1/tasks", () => {
  it("should create a verification task", async () => {
    const res = await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1", claim_id: "C1", task_type: "evidence_gap" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task_id).toBeTruthy();
    expect(body.status).toBe("open");
    expect(body.task_type).toBe("evidence_gap");
  });

  it("should reject missing fields", async () => {
    const res = await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1" },
    });
    expect(res.status).toBe(400);
  });

  it("should reject invalid task_type", async () => {
    const res = await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1", claim_id: "C1", task_type: "invalid" },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/tasks", () => {
  it("should list tasks", async () => {
    await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1", claim_id: "C1", task_type: "evidence_gap" },
    });
    await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1", claim_id: "C2", task_type: "corroboration" },
    });

    const res = await fetch("/v1/tasks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
  });

  it("should filter by status", async () => {
    await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1", claim_id: "C1", task_type: "evidence_gap" },
    });

    const res = await fetch("/v1/tasks?status=resolved");
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });
});

describe("POST /v1/tasks/:task_id/review", () => {
  it("should submit a review and resolve the task", async () => {
    const createRes = await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1", claim_id: "C1", task_type: "evidence_gap" },
    });
    const { task_id } = await createRes.json();

    const res = await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: {
        actor_id: "REVIEWER1",
        verdict: "supports",
        notes: "Evidence confirms the claim",
        evidence_edges: [{ evidence_id_hash: "sha256:abc", relation: "supports", strength: 0.9 }],
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.verdict).toBe("supports");

    // Task should now be resolved
    const taskRes = await fetch("/v1/tasks?status=resolved");
    const taskBody = await taskRes.json();
    expect(taskBody.items).toHaveLength(1);
  });

  it("should reject review on resolved task", async () => {
    const createRes = await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1", claim_id: "C1", task_type: "corroboration" },
    });
    const { task_id } = await createRes.json();

    await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: { actor_id: "R1", verdict: "supports", notes: "OK" },
    });

    const res = await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: { actor_id: "R2", verdict: "contradicts", notes: "Disagree" },
    });
    expect(res.status).toBe(409);
  });

  it("should return 404 for unknown task", async () => {
    const res = await fetch("/v1/tasks/NONEXISTENT/review", {
      method: "POST",
      body: { actor_id: "R1", verdict: "supports", notes: "N/A" },
    });
    expect(res.status).toBe(404);
  });
});

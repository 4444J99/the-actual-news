import { describe, it, expect, beforeEach } from "vitest";
import http from "node:http";
import { app, pool } from "../server.js";

let server: http.Server;
let baseUrl: string;

function fetch(path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: opts.method ?? "GET",
      headers: {
        "x-api-key": "dev-internal-key",
        ...(opts.body ? { "Content-Type": "application/json" } : {})
      },
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
  await pool.query("DELETE FROM reviews");
  await pool.query("DELETE FROM verification_tasks");
  await pool.query("DELETE FROM claim_evidence_edges");
  await pool.query("DELETE FROM claims");
  await pool.query("DELETE FROM story_versions");
  await pool.query("DELETE FROM stories");
  await pool.query("DELETE FROM evidence_objects");
  await pool.query("INSERT INTO stories (story_id, platform_id, title, state, created_at, updated_at) VALUES ('S1','plf_local_01','Test','draft',now(),now()) ON CONFLICT (story_id) DO NOTHING");
  await pool.query("INSERT INTO story_versions (story_version_id, story_id, body_markdown, created_at) VALUES ('SV1','S1','body',now()) ON CONFLICT (story_version_id) DO NOTHING");
  await pool.query("INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, created_at) VALUES ('C1','S1','SV1','factual','text',now()) ON CONFLICT (claim_id) DO NOTHING");
  await pool.query("INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, created_at) VALUES ('C2','S1','SV1','factual','text',now()) ON CONFLICT (claim_id) DO NOTHING");
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

    await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: {
        actor_id: "REVIEWER1",
        verdict: "supports",
        notes: "Evidence confirms the claim",
        evidence_edges: [{ evidence_id_hash: "sha256:abc", relation: "supports", strength: 0.9 }],
      },
    });
    const res = await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: {
        actor_id: "REVIEWER2",
        verdict: "supports",
        notes: "Confirmed",
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

  it("inserts review-attested supports edges once quorum is reached (#112)", async () => {
    await pool.query(
      `INSERT INTO evidence_objects (evidence_id_hash, platform_id, blob_uri, media_type, provenance)
       VALUES ('sha256:abc', 'plf_local_01', 's3://evidence/abc', 'text/html',
               '{"source_class":"primary_record","source":"ap","publisher":"ap"}'::jsonb)
       ON CONFLICT (evidence_id_hash) DO NOTHING`
    );
    await pool.query("DELETE FROM claim_evidence_edges");
    const createRes = await fetch("/v1/tasks", {
      method: "POST",
      body: { story_id: "S1", claim_id: "C1", task_type: "evidence_gap" },
    });
    const { task_id } = await createRes.json();

    const edge = { evidence_id_hash: "sha256:abc", relation: "supports", strength: 0.9 };

    await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: {
        actor_id: "REVIEWER1",
        verdict: "supports",
        notes: "Evidence confirms the claim",
        evidence_edges: [edge],
      },
    });
    // No quorum yet: a single review must not create edges.
    let edgesQ = await pool.query("SELECT * FROM claim_evidence_edges WHERE claim_id = 'C1'");
    expect(edgesQ.rows).toHaveLength(0);

    const res = await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: {
        actor_id: "REVIEWER2",
        verdict: "supports",
        notes: "Confirmed",
        evidence_edges: [edge],
      },
    });
    expect(res.status).toBe(201);

    // Both accepted reviews' cited edges are recorded, attributed to the
    // reviewer who cited them; ingestion 'origin' edges are untouched.
    edgesQ = await pool.query(
      `SELECT relation, strength, reviewer_actor_id
       FROM claim_evidence_edges WHERE claim_id = 'C1' ORDER BY reviewer_actor_id`
    );
    expect(edgesQ.rows).toHaveLength(2);
    for (const row of edgesQ.rows) {
      expect(row.relation).toBe("supports");
      expect(Number(row.strength)).toBe(0.9);
    }
    expect(edgesQ.rows.map((r) => r.reviewer_actor_id)).toEqual(["REVIEWER1", "REVIEWER2"]);

    const claimQ = await pool.query("SELECT support_status FROM claims WHERE claim_id = 'C1'");
    expect(claimQ.rows[0].support_status).toBe("partially_supported");
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
    await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: { actor_id: "R2", verdict: "contradicts", notes: "Disagree" },
    });

    const res = await fetch(`/v1/tasks/${task_id}/review`, {
      method: "POST",
      body: { actor_id: "R3", verdict: "supports", notes: "Late" },
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

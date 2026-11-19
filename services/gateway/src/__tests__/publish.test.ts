import { describe, it, expect, beforeEach } from "vitest";
import http from "node:http";
import { app, pool } from "../server.js";

// DB-backed like services/verify/src/__tests__/server.test.ts: the caller
// provides PLATFORM_ID and POSTGRES_URI (see .env.example).
const PLATFORM_ID = process.env.PLATFORM_ID ?? "plf_local_01";

let server: http.Server;
let baseUrl: string;

function fetch(path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: opts.method ?? "GET",
      headers: {
        "x-api-key": "dev-internal-key",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
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

async function clean() {
  await pool.query("DELETE FROM claim_evidence_edges");
  await pool.query("DELETE FROM reviews");
  await pool.query("DELETE FROM verification_tasks");
  await pool.query("DELETE FROM claims");
  await pool.query("DELETE FROM story_versions");
  await pool.query("DELETE FROM stories");
  await pool.query("DELETE FROM evidence_objects");
  await pool.query("DELETE FROM event_outbox");
  await pool.query("DELETE FROM actors");
}

// Seed one story ingested from a single primary_record publisher (npr).
// When corroborated=false the only edges are the story's own origin
// evidence: a review-attested 'supports' edge to the origin evidence on C1
// (the old self-support shape, now review-attested) and an 'origin' edge
// on C2. When corroborated=true each claim also has a review-attested
// 'supports' edge to independent primary evidence from another publisher
// (ap). The review rows satisfy the publish prerequisite (resolved tasks,
// two decisive reviewers) in both cases, so the verdict isolates the gate.
async function seedStory(corroborated: boolean) {
  const citedHash = corroborated ? "sha256:ap" : "sha256:origin";
  const claimStatus = corroborated ? "partially_supported" : "unsupported";

  for (const actor of ["REV1", "REV2"]) {
    await pool.query(
      `INSERT INTO actors (actor_id, platform_id, display_name, role, created_at)
       VALUES ($1, $2, $1, 'reviewer', now()) ON CONFLICT (actor_id) DO NOTHING`,
      [actor, PLATFORM_ID]
    );
  }
  await pool.query(
    `INSERT INTO stories (story_id, platform_id, title, state, created_at, updated_at)
     VALUES ('S1', $1, 'Test story', 'review', now(), now())`,
    [PLATFORM_ID]
  );
  await pool.query(
    `INSERT INTO story_versions (story_version_id, story_id, body_markdown, created_at)
     VALUES ('SV1', 'S1', 'The city council met on Tuesday. A vote was held on ordinance 12.', now())`
  );
  await pool.query(
    `INSERT INTO evidence_objects (evidence_id_hash, platform_id, blob_uri, media_type, extracted_text, provenance)
     VALUES
       ('sha256:origin', $1, 's3://evidence/origin', 'text/html',
        'The city council met on Tuesday. A vote was held on ordinance 12.',
        '{"source":"npr","publisher":"npr","source_class":"primary_record","url":"https://example.local/npr/story"}'::jsonb),
       ('sha256:ap', $1, 's3://evidence/ap', 'text/html', NULL,
        '{"source":"ap","publisher":"ap","source_class":"primary_record","url":"https://example.local/ap/story"}'::jsonb)`,
    [PLATFORM_ID]
  );
  await pool.query(
    `INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, support_status, created_at)
     VALUES
       ('C1', 'S1', 'SV1', 'factual', 'The city council met on Tuesday.', $1, now()),
       ('C2', 'S1', 'SV1', 'factual', 'A vote was held on ordinance 12.', $1, now())`,
    [claimStatus]
  );
  await pool.query(
    `INSERT INTO claim_evidence_edges (edge_id, claim_id, evidence_id_hash, relation, strength, reviewer_actor_id, notes, created_at)
     VALUES
       ('E1', 'C1', 'sha256:origin', 'supports', 0.9, 'REV1', 'Origin article supports this', now()),
       ('E2', 'C2', 'sha256:origin', 'origin', 0, NULL, NULL, now())`
  );
  if (corroborated) {
    await pool.query(
      `INSERT INTO claim_evidence_edges (edge_id, claim_id, evidence_id_hash, relation, strength, reviewer_actor_id, notes, created_at)
       VALUES
         ('E3', 'C1', 'sha256:ap', 'supports', 0.9, 'REV1', 'Independent AP corroboration', now()),
         ('E4', 'C2', 'sha256:ap', 'supports', 0.9, 'REV2', 'Independent AP corroboration', now())`
    );
  }
  await pool.query(
    `INSERT INTO verification_tasks (task_id, platform_id, story_id, claim_id, task_type, status, created_at)
     VALUES
       ('T1', $1, 'S1', 'C1', 'evidence_gap', 'resolved', now()),
       ('T2', $1, 'S1', 'C2', 'evidence_gap', 'resolved', now())`,
    [PLATFORM_ID]
  );
  await pool.query(
    `INSERT INTO reviews (review_id, task_id, actor_id, verdict, notes, evidence_edges, created_at)
     VALUES
       ('R1', 'T1', 'REV1', 'supports', 'Confirmed',
        jsonb_build_array(jsonb_build_object('evidence_id_hash', $1::text, 'relation', 'supports', 'strength', 0.9)), now()),
       ('R2', 'T2', 'REV2', 'supports', 'Confirmed',
        jsonb_build_array(jsonb_build_object('evidence_id_hash', $1::text, 'relation', 'supports', 'strength', 0.9)), now())`,
    [citedHash]
  );
}

beforeEach(async () => {
  await clean();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;

  return () => new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /v1/story/:story_id/publish (#112)", () => {
  it("rejects a single-publisher story whose only support is its own origin evidence", async () => {
    await seedStory(false);

    const res = await fetch("/v1/story/S1/publish", {
      method: "POST",
      body: { story_version_id: "SV1" },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("publish_gate_failed");
    expect(body.metrics.primary_supported_claims).toBe(0);
    expect(body.metrics.primary_evidence_ratio).toBe(0);

    const storyQ = await pool.query("SELECT state FROM stories WHERE story_id = 'S1'");
    expect(storyQ.rows[0].state).toBe("review");
  });

  it("publishes the same story once each claim has independent primary corroboration", async () => {
    await seedStory(true);

    const res = await fetch("/v1/story/S1/publish", {
      method: "POST",
      body: { story_version_id: "SV1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("published");
    // The success response reports the ratio but not the raw count (the
    // 409 path reports both); the count is asserted via the DB below.
    expect(body.metrics.total_claims).toBe(2);
    expect(body.metrics.primary_evidence_ratio).toBe(1);

    const storyQ = await pool.query("SELECT state FROM stories WHERE story_id = 'S1'");
    expect(storyQ.rows[0].state).toBe("published");
    const countQ = await pool.query(
      `SELECT COUNT(DISTINCT claim_id) AS c FROM claim_evidence_edges
       WHERE relation = 'supports' AND reviewer_actor_id IS NOT NULL
         AND evidence_id_hash = 'sha256:ap'`
    );
    expect(Number(countQ.rows[0].c)).toBe(2);
  });
});

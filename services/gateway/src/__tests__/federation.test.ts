import { describe, it, expect, beforeEach, afterAll } from "vitest";
import http from "node:http";
import { app, pool, runFederationSyncJob } from "../server.js";
import { hashCanonical } from "../transparency.js";

// DB-backed like services/gateway/src/__tests__/publish.test.ts: the caller
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
  // FK-safe order: children before parents (federated_stories references
  // stories; federation_sync_jobs references federation_peers; corrections
  // and edges reference claims).
  await pool.query("DELETE FROM claim_evidence_edges");
  await pool.query("DELETE FROM corrections");
  await pool.query("DELETE FROM reviews");
  await pool.query("DELETE FROM verification_tasks");
  await pool.query("DELETE FROM claims");
  await pool.query("DELETE FROM story_versions");
  await pool.query("DELETE FROM federated_stories");
  await pool.query("DELETE FROM federation_sync_jobs");
  await pool.query("DELETE FROM stories");
  await pool.query("DELETE FROM evidence_objects");
  await pool.query("DELETE FROM federation_peers");
  await pool.query("DELETE FROM audit_log");
  await pool.query("DELETE FROM event_outbox");
  await pool.query("DELETE FROM actors");
}

// One published peer story with a version, two claims, one edge, one
// correction — the canned bundle the stub peer serves. The bundle_hash is
// computed with the gateway's own hashCanonical, exactly as a real peer's
// /v1/story endpoint computes it.
function peerBundle(overrides: { claimText?: string } = {}) {
  const story = {
    story_id: "STORY-PEER-001",
    platform_id: "plf_peer_01",
    title: "Peer story",
    state: "published",
    created_at: "2026-11-19T10:00:00.000Z",
    updated_at: "2026-11-19T10:00:00.000Z",
    published_version_id: "VER-PEER-001",
    versions: [
      {
        story_version_id: "VER-PEER-001",
        story_id: "STORY-PEER-001",
        body_markdown: "Peer body.",
        disclosure_markdown: null,
        created_at: "2026-11-19T10:00:00.000Z"
      }
    ]
  };
  const claims = [
    {
      claim_id: "CLAIM-PEER-001",
      story_id: "STORY-PEER-001",
      story_version_id: "VER-PEER-001",
      claim_type: "factual",
      text: overrides.claimText ?? "The peer story is published.",
      entities: [],
      time_window: {},
      jurisdiction: null,
      support_status: "supported",
      confidence_model: 0.9,
      confidence_review: null,
      created_at: "2026-11-19T10:00:00.000Z"
    },
    {
      claim_id: "CLAIM-PEER-002",
      story_id: "STORY-PEER-001",
      story_version_id: "VER-PEER-001",
      claim_type: "factual",
      text: "A second peer claim.",
      entities: [],
      time_window: {},
      jurisdiction: null,
      support_status: "supported",
      confidence_model: 0.8,
      confidence_review: null,
      created_at: "2026-11-19T10:00:00.000Z"
    }
  ];
  const evidence_edges = [
    {
      claim_id: "CLAIM-PEER-001",
      evidence_id_hash: "sha256:peer-evidence-001",
      relation: "supports",
      strength: 0.9
    }
  ];
  const corrections = [
    {
      correction_id: "CORR-PEER-001",
      claim_id: "CLAIM-PEER-002",
      reason: "Peer correction.",
      created_at: "2026-11-19T10:00:00.000Z"
    }
  ];
  const bundle = { story, claims, evidence_edges, corrections };
  return { ...bundle, bundle_hash: hashCanonical(bundle) };
}

// A stub peer: canned /v1/feed + /v1/story, never a live peer. `tamper`
// mutates the served bundle after its hash is computed, so the worker must
// reject it on the hash check.
function startStubPeer(bundle: Record<string, any>, tamper = false) {
  const hits: string[] = [];
  const served = tamper
    ? { ...bundle, claims: [{ ...bundle.claims[0], text: "Tampered claim text." }, bundle.claims[1]] }
    : bundle;
  const stub = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.url?.startsWith("/v1/feed")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        scope: "local",
        items: [{ story_id: "STORY-PEER-001", title: "Peer story", state: "published", updated_at: "2026-11-19T10:00:00.000Z" }]
      }));
    } else if (req.url?.startsWith("/v1/story/STORY-PEER-001")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(served));
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "not_found" }));
    }
  });
  return new Promise<{ url: string; hits: string[]; close: () => Promise<void> }>((resolve) => {
    stub.listen(0, "127.0.0.1", () => {
      const addr = stub.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        hits,
        close: () => new Promise<void>((r) => stub.close(() => r()))
      });
    });
  });
}

async function registerPeer(peerUrl: string) {
  const res = await fetch("/v1/federation/peers", {
    method: "POST",
    body: { peer_url: peerUrl, peer_name: "stub-peer" }
  });
  expect(res.status).toBe(201);
  return (await res.json()).peer_id as string;
}

async function peerRow(peerId: string) {
  const q = await pool.query(
    `SELECT last_synced_at, last_synced_story_id FROM federation_peers WHERE peer_id = $1`,
    [peerId]
  );
  return q.rows[0];
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

afterAll(async () => {
  await pool.end();
});

describe("POST /v1/federation/sync (#110)", () => {
  it("no longer pretends: sync returns a job, not sync_initiated, and the cursor does not move until the job lands", async () => {
    const peer = await startStubPeer(peerBundle());
    try {
      const peerId = await registerPeer(peer.url);
      const hitsBefore = peer.hits.length;

      const res = await fetch("/v1/federation/sync", { method: "POST", body: { peer_id: peerId } });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.job_id).toMatch(/^[A-Z0-9]{10,26}$/); // newId(): 26-char ULID
      expect(body.status).toBe("pending");
      expect(body).not.toHaveProperty("sync_initiated");
      expect(JSON.stringify(body)).not.toContain("sync_initiated");

      // The stub peer was not fetched by the enqueue, and the cursor still
      // says "never synced" — it advances only after a batch commits.
      expect(peer.hits.length).toBe(hitsBefore);
      const row = await peerRow(peerId);
      expect(row.last_synced_at).toBeNull();
      expect(row.last_synced_story_id).toBeNull();

      // Re-POSTing while the job is pending returns the same job.
      const again = await fetch("/v1/federation/sync", { method: "POST", body: { peer_id: peerId } });
      expect(again.status).toBe(202);
      expect((await again.json()).job_id).toBe(body.job_id);
    } finally {
      await peer.close();
    }
  });

  it("happy path: the story lands in the local feed with versions, claims and edges intact", async () => {
    const peer = await startStubPeer(peerBundle());
    try {
      const peerId = await registerPeer(peer.url);
      const sync = await fetch("/v1/federation/sync", { method: "POST", body: { peer_id: peerId } });
      const jobId = (await sync.json()).job_id as string;

      const result = await runFederationSyncJob(jobId);
      expect(result.state).toBe("done");
      expect(result.ingested).toBe(1);
      expect(result.skipped).toBe(0);

      const feed = await fetch("/v1/feed?state=published");
      expect(feed.status).toBe(200);
      const items = (await feed.json()).items as any[];
      expect(items.map((i) => i.story_id)).toContain("STORY-PEER-001");

      const bundleRes = await fetch("/v1/story/STORY-PEER-001");
      expect(bundleRes.status).toBe(200);
      const bundleBody = await bundleRes.json();
      expect(bundleBody.story.title).toBe("Peer story");
      expect(bundleBody.story.state).toBe("published");
      expect(bundleBody.story.versions).toHaveLength(1);
      expect(bundleBody.story.versions[0].body_markdown).toBe("Peer body.");
      expect(bundleBody.claims).toHaveLength(2);
      expect(bundleBody.claims.map((c: any) => c.claim_id).sort()).toEqual([
        "CLAIM-PEER-001",
        "CLAIM-PEER-002"
      ]);
      expect(bundleBody.evidence_edges).toHaveLength(1);
      expect(bundleBody.evidence_edges[0]).toMatchObject({
        claim_id: "CLAIM-PEER-001",
        evidence_id_hash: "sha256:peer-evidence-001",
        relation: "supports"
      });
      expect(bundleBody.corrections).toHaveLength(1);
      expect(bundleBody.corrections[0].correction_id).toBe("CORR-PEER-001");

      const mapping = await pool.query(
        `SELECT peer_id, remote_story_id, local_story_id, bundle_hash FROM federated_stories WHERE peer_id = $1`,
        [peerId]
      );
      expect(mapping.rowCount).toBe(1);
      expect(mapping.rows[0].remote_story_id).toBe("STORY-PEER-001");
      expect(mapping.rows[0].local_story_id).toBe("STORY-PEER-001");
      expect(mapping.rows[0].bundle_hash).toBe(peerBundle().bundle_hash);

      const row = await peerRow(peerId);
      expect(row.last_synced_at).not.toBeNull();
      expect(row.last_synced_story_id).toBe("STORY-PEER-001");

      const job = await fetch(`/v1/federation/jobs/${jobId}`);
      expect((await job.json()).state).toBe("done");
      const audit = await pool.query(
        `SELECT action_type FROM audit_log WHERE platform_id = $1 AND action_type = 'federation_sync'`,
        [PLATFORM_ID]
      );
      expect(audit.rowCount).toBe(1);
    } finally {
      await peer.close();
    }
  });

  it("re-sync is a no-op: no duplicate rows, cursor unchanged", async () => {
    const peer = await startStubPeer(peerBundle());
    try {
      const peerId = await registerPeer(peer.url);
      const first = await fetch("/v1/federation/sync", { method: "POST", body: { peer_id: peerId } });
      const firstJob = (await first.json()).job_id as string;
      await runFederationSyncJob(firstJob);

      const cursorBefore = await peerRow(peerId);
      const countBefore = await pool.query(`SELECT COUNT(*) AS c FROM stories WHERE platform_id = $1`, [PLATFORM_ID]);

      const second = await fetch("/v1/federation/sync", { method: "POST", body: { peer_id: peerId } });
      const secondJob = (await second.json()).job_id as string;
      expect(secondJob).not.toBe(firstJob);
      const result = await runFederationSyncJob(secondJob);
      expect(result.state).toBe("done");
      expect(result.ingested).toBe(0);
      expect(result.skipped).toBe(1);

      const countAfter = await pool.query(`SELECT COUNT(*) AS c FROM stories WHERE platform_id = $1`, [PLATFORM_ID]);
      expect(Number(countAfter.rows[0].c)).toBe(Number(countBefore.rows[0].c));
      const cursorAfter = await peerRow(peerId);
      expect(cursorAfter.last_synced_story_id).toBe(cursorBefore.last_synced_story_id);
    } finally {
      await peer.close();
    }
  });

  it("peer down fails closed: job failed, cursor untouched, audit row written", async () => {
    // A peer URL nothing listens on.
    const dead = await startStubPeer(peerBundle());
    await dead.close();
    const peerId = await registerPeer(dead.url);

    const sync = await fetch("/v1/federation/sync", { method: "POST", body: { peer_id: peerId } });
    const jobId = (await sync.json()).job_id as string;
    const result = await runFederationSyncJob(jobId);
    expect(result.state).toBe("failed");
    expect(result.last_error).toMatch(/fetch .* failed|ECONNREFUSED/i);

    const row = await peerRow(peerId);
    expect(row.last_synced_at).toBeNull();
    expect(row.last_synced_story_id).toBeNull();

    const job = await fetch(`/v1/federation/jobs/${jobId}`);
    const jobBody = await job.json();
    expect(jobBody.state).toBe("failed");
    expect(jobBody.last_error).toBeTruthy();
    const audit = await pool.query(
      `SELECT action_type FROM audit_log WHERE platform_id = $1 AND action_type = 'federation_sync_failed'`,
      [PLATFORM_ID]
    );
    expect(audit.rowCount).toBe(1);
    const stories = await pool.query(`SELECT COUNT(*) AS c FROM stories WHERE platform_id = $1`, [PLATFORM_ID]);
    expect(Number(stories.rows[0].c)).toBe(0);
  });

  it("bundle-hash mismatch is rejected: no rows land", async () => {
    const peer = await startStubPeer(peerBundle(), true);
    try {
      const peerId = await registerPeer(peer.url);
      const sync = await fetch("/v1/federation/sync", { method: "POST", body: { peer_id: peerId } });
      const jobId = (await sync.json()).job_id as string;

      const result = await runFederationSyncJob(jobId);
      expect(result.state).toBe("failed");
      expect(result.last_error).toMatch(/bundle_hash mismatch/);

      const stories = await pool.query(`SELECT COUNT(*) AS c FROM stories WHERE platform_id = $1`, [PLATFORM_ID]);
      expect(Number(stories.rows[0].c)).toBe(0);
      const row = await peerRow(peerId);
      expect(row.last_synced_at).toBeNull();
    } finally {
      await peer.close();
    }
  });

  it("validates its inputs: missing peer_id is 400, unknown peer is 404", async () => {
    const missing = await fetch("/v1/federation/sync", { method: "POST", body: {} });
    expect(missing.status).toBe(400);
    const unknown = await fetch("/v1/federation/sync", {
      method: "POST",
      body: { peer_id: "NOPE-NOPE-NOPE-0000000000" }
    });
    expect(unknown.status).toBe(404);
    const job = await fetch("/v1/federation/jobs/NOPE-NOPE-NOPE-0000000000");
    expect(job.status).toBe(404);
  });
});

// federation.ts — the-actual-news#110
//
// POST /v1/federation/sync used to be a stub: it advanced last_synced_at
// and returned `sync_initiated` without fetching anything. The sync job
// queue (db/migrations/009_federation_sync_jobs.sql) makes the exchange
// durable: the endpoint enqueues a pending job and returns 202, and this
// module does the work — fetch the peer's /v1/feed + /v1/story bundles,
// verify each bundle_hash, and land the story + version + claims + edges +
// corrections as federated rows under the local platform_id.
//
// Design notes (each is a deliberate choice, recorded here rather than
// silently assumed):
// * The worker consumes the gateway's own public contract: unauthenticated
//   reads of /v1/feed?state=published and /v1/story/:id, which the peer
//   bounds to published stories and their approved published version. No
//   peer authentication is attempted: federation_peers.public_key exists
//   but no signature scheme is specified anywhere in-repo (see #110 plan
//   step 8 — that is a recorded open decision, not a silent default).
// * bundle_hash is the only integrity check the repo defines, so a bundle
//   whose recomputed hash mismatches is rejected and the job fails closed.
// * A remote story_id must never collide with a local stories PK: the
//   local id is the remote id when it is free, otherwise a fresh ulidLike
//   id, and federated_stories records the mapping either way. The same
//   rule applies to version / claim / correction ids inside the bundle.
// * claim_evidence_edges.evidence_id_hash has a foreign key to
//   evidence_objects, and the /v1/story bundle carries no evidence objects,
//   so the worker inserts a placeholder evidence_objects row per
//   referenced hash (blob_uri `federated://<peer_id>/<hash>`,
//   media_type 'unknown', provenance marking the federation source) —
//   ON CONFLICT DO NOTHING, so a hash that already exists locally as a
//   real object is never overwritten. This is the one place the plan's
//   "insert the story + version + claims + edges + corrections" step
//   needed a schema-driven addition; the evidence is the FK in
//   db/migrations/001_init.sql.
// * Each story lands in its own transaction. The peer cursor
//   (last_synced_at / last_synced_story_id) advances only after the whole
//   batch commits; any story failure fails the job, leaves the cursor
//   alone, and writes a federation_sync_failed audit row. A retry is a
//   new job (re-POST /v1/federation/sync); already-mapped stories are
//   skipped by hash, so a retry resumes instead of duplicating.
// * A remote story whose bundle changed after it was mapped is re-ingested
//   by deleting the old local federated rows first. Local verification
//   work (verification_tasks / reviews) referencing those rows blocks the
//   delete, so that story fails with a clear error instead of silently
//   dropping review history.
import { hashCanonical } from "./transparency.js";

export const FEDERATION_FETCH_TIMEOUT_MS = 10_000;
export const FEDERATION_FEED_LIMIT = 100;
export const FEDERATION_MAX_ATTEMPTS = 5;
export const FEDERATION_JOB_DEADLINE_MS = 60_000;

function ulidLike(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    Math.random().toString(36).slice(2, 18).toUpperCase()
  ).slice(0, 26);
}

type WireBundle = {
  story: Record<string, any>;
  claims: Record<string, any>[];
  evidence_edges: Record<string, any>[];
  corrections: Record<string, any>[];
  bundle_hash?: string;
};

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err: any) {
    throw new Error(`fetch ${url} failed: ${err?.message ?? err}`, { cause: err });
  }
  if (!res.ok) {
    throw new Error(`fetch ${url} returned HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch (err: any) {
    throw new Error(`fetch ${url} returned malformed JSON: ${err?.message ?? err}`, { cause: err });
  }
}

function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateBundle(raw: unknown, storyId: string): WireBundle {
  if (!isRecord(raw)) throw new Error(`story ${storyId}: bundle is not an object`);
  const { story, claims, evidence_edges, corrections, bundle_hash } = raw as WireBundle;
  if (!isRecord(story)) throw new Error(`story ${storyId}: bundle has no story object`);
  if (typeof story.story_id !== "string" || story.story_id !== storyId) {
    throw new Error(`story ${storyId}: bundle story_id does not match the requested id`);
  }
  if (!Array.isArray(claims) || !Array.isArray(evidence_edges) || !Array.isArray(corrections)) {
    throw new Error(`story ${storyId}: bundle claims/evidence_edges/corrections must be arrays`);
  }
  if (typeof bundle_hash !== "string" || !bundle_hash) {
    throw new Error(`story ${storyId}: bundle carries no bundle_hash`);
  }
  const recomputed = hashCanonical({ story, claims, evidence_edges, corrections });
  if (recomputed !== bundle_hash) {
    throw new Error(
      `story ${storyId}: bundle_hash mismatch (received ${bundle_hash}, recomputed ${recomputed})`
    );
  }
  return { story, claims, evidence_edges, corrections, bundle_hash };
}

async function idIsFree(
  client: any,
  table: string,
  idColumn: string,
  id: string
): Promise<boolean> {
  const q = await client.query(`SELECT 1 FROM ${table} WHERE ${idColumn} = $1 LIMIT 1`, [id]);
  return q.rowCount === 0;
}

async function deleteFederatedStory(client: any, localStoryId: string): Promise<void> {
  // Delete in FK order. verification_tasks / reviews reference stories and
  // claims: if local review work exists, the delete throws and the caller
  // fails the story instead of dropping review history.
  await client.query(
    `DELETE FROM claim_evidence_edges WHERE claim_id IN (SELECT claim_id FROM claims WHERE story_id = $1)`,
    [localStoryId]
  );
  await client.query(
    `DELETE FROM corrections WHERE claim_id IN (SELECT claim_id FROM claims WHERE story_id = $1)`,
    [localStoryId]
  );
  await client.query(`DELETE FROM claims WHERE story_id = $1`, [localStoryId]);
  await client.query(`DELETE FROM story_versions WHERE story_id = $1`, [localStoryId]);
  await client.query(`DELETE FROM stories WHERE story_id = $1`, [localStoryId]);
}

async function ingestBundle(
  client: any,
  platformId: string,
  peerId: string,
  remoteStoryId: string,
  bundle: WireBundle
): Promise<{ localStoryId: string; action: "inserted" | "replaced" }> {
  const { story, claims, evidence_edges, corrections, bundle_hash } = bundle;

  const existing = await client.query(
    `SELECT local_story_id, bundle_hash FROM federated_stories WHERE peer_id = $1 AND remote_story_id = $2`,
    [peerId, remoteStoryId]
  );

  let localStoryId: string;
  let action: "inserted" | "replaced" = "inserted";
  if (existing.rowCount > 0) {
    if (existing.rows[0].bundle_hash === bundle_hash) {
      return { localStoryId: existing.rows[0].local_story_id, action: "inserted" };
    }
    // Bundle changed since the last ingest: replace the local federated rows.
    localStoryId = existing.rows[0].local_story_id;
    await deleteFederatedStory(client, localStoryId);
    action = "replaced";
  } else if (await idIsFree(client, "stories", "story_id", remoteStoryId)) {
    localStoryId = remoteStoryId;
  } else {
    localStoryId = ulidLike();
  }

  const storyVersions: Record<string, any>[] = (story as any).versions ?? [];
  if (storyVersions.length === 0) {
    throw new Error(`story ${remoteStoryId}: bundle carries no versions`);
  }

  await client.query(
    `INSERT INTO stories (story_id, platform_id, title, state, created_at, updated_at, published_version_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      localStoryId,
      platformId,
      story.title,
      story.state,
      story.created_at,
      story.updated_at ?? story.created_at,
      story.published_version_id ?? storyVersions[0].story_version_id
    ]
  );

  const versionIdMap = new Map<string, string>();
  for (const v of storyVersions) {
    const localVersionId = (await idIsFree(client, "story_versions", "story_version_id", v.story_version_id))
      ? v.story_version_id
      : ulidLike();
    versionIdMap.set(v.story_version_id, localVersionId);
    await client.query(
      `INSERT INTO story_versions (story_version_id, story_id, body_markdown, disclosure_markdown, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [localVersionId, localStoryId, v.body_markdown, v.disclosure_markdown ?? null, v.created_at]
    );
  }

  // Evidence placeholders: the bundle carries edge hashes but no evidence
  // objects, and claim_evidence_edges has an FK to evidence_objects.
  const seenHashes = new Set<string>();
  for (const edge of evidence_edges) {
    const hash = edge.evidence_id_hash;
    if (typeof hash !== "string" || !hash || seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    await client.query(
      `INSERT INTO evidence_objects (evidence_id_hash, platform_id, blob_uri, media_type, extracted_text, provenance)
       VALUES ($1, $2, $3, 'unknown', NULL, $4::jsonb)
       ON CONFLICT (evidence_id_hash) DO NOTHING`,
      [
        hash,
        platformId,
        `federated://${peerId}/${encodeURIComponent(hash)}`,
        JSON.stringify({ federated_from: peerId, remote_evidence_id_hash: hash })
      ]
    );
  }

  const claimIdMap = new Map<string, string>();
  for (const claim of claims) {
    const localClaimId = (await idIsFree(client, "claims", "claim_id", claim.claim_id))
      ? claim.claim_id
      : ulidLike();
    claimIdMap.set(claim.claim_id, localClaimId);
    const localVersionId = versionIdMap.get(claim.story_version_id);
    if (!localVersionId) {
      throw new Error(
        `story ${remoteStoryId}: claim ${claim.claim_id} references unknown version ${claim.story_version_id}`
      );
    }
    await client.query(
      `INSERT INTO claims (claim_id, story_id, story_version_id, claim_type, text, entities, time_window,
                           jurisdiction, support_status, confidence_model, confidence_review, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)`,
      [
        localClaimId,
        localStoryId,
        localVersionId,
        claim.claim_type,
        claim.text,
        JSON.stringify(claim.entities ?? []),
        JSON.stringify(claim.time_window ?? {}),
        claim.jurisdiction ?? null,
        claim.support_status,
        claim.confidence_model ?? null,
        claim.confidence_review ?? null,
        claim.created_at
      ]
    );
  }

  for (const edge of evidence_edges) {
    const localClaimId = claimIdMap.get(edge.claim_id);
    if (!localClaimId) {
      throw new Error(
        `story ${remoteStoryId}: edge references unknown claim ${edge.claim_id}`
      );
    }
    await client.query(
      `INSERT INTO claim_evidence_edges (edge_id, claim_id, evidence_id_hash, relation, strength)
       VALUES ($1, $2, $3, $4, $5)`,
      [ulidLike(), localClaimId, edge.evidence_id_hash, edge.relation, Number(edge.strength ?? 0.5)]
    );
  }

  for (const correction of corrections) {
    const localClaimId = claimIdMap.get(correction.claim_id);
    if (!localClaimId) {
      throw new Error(
        `story ${remoteStoryId}: correction ${correction.correction_id} references unknown claim ${correction.claim_id}`
      );
    }
    const localCorrectionId = (await idIsFree(
      client,
      "corrections",
      "correction_id",
      correction.correction_id
    ))
      ? correction.correction_id
      : ulidLike();
    await client.query(
      `INSERT INTO corrections (correction_id, platform_id, claim_id, reason, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [localCorrectionId, platformId, localClaimId, correction.reason, correction.created_at]
    );
  }

  await client.query(
    `INSERT INTO federated_stories (peer_id, remote_story_id, local_story_id, bundle_hash, fetched_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (peer_id, remote_story_id) DO UPDATE
       SET local_story_id = EXCLUDED.local_story_id,
           bundle_hash = EXCLUDED.bundle_hash,
           fetched_at = now()`,
    [peerId, remoteStoryId, localStoryId, bundle_hash]
  );

  return { localStoryId, action };
}

export type FederationJobResult = {
  job_id: string;
  state: "done" | "failed";
  ingested: number;
  skipped: number;
  replaced: number;
  last_error?: string;
};

async function writeAudit(
  client: any,
  platformId: string,
  actionType: string,
  peerId: string,
  details: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (audit_id, platform_id, action_type, resource_type, resource_id, details, created_at)
     VALUES ($1, $2, $3, 'peer', $4, $5::jsonb, now())`,
    [ulidLike(), platformId, actionType, peerId, JSON.stringify(details)]
  );
}

/**
 * Run one federation sync job to completion. Claims the job (pending or
 * failed, under the attempt bound), fetches the peer feed, and ingests each
 * bundle. Returns the terminal job state; never throws for a job-level
 * failure — the failure is recorded on the job row and in the audit log.
 */
export async function runFederationSyncJob(
  pool: any,
  platformId: string,
  jobId: string
): Promise<FederationJobResult> {
  const claim = await pool.query(
    `UPDATE federation_sync_jobs
     SET state = 'running', attempts = attempts + 1, updated_at = now()
     WHERE job_id = $1 AND platform_id = $2 AND state IN ('pending', 'failed')
       AND attempts < $3
     RETURNING job_id, peer_id, attempts`,
    [jobId, platformId, FEDERATION_MAX_ATTEMPTS]
  );
  if (claim.rowCount === 0) {
    const existing = await pool.query(
      `SELECT state, attempts FROM federation_sync_jobs WHERE job_id = $1 AND platform_id = $2`,
      [jobId, platformId]
    );
    if (existing.rowCount === 0) throw new Error(`federation job ${jobId} not found`);
    const row = existing.rows[0];
    if (row.state === "done") {
      return { job_id: jobId, state: "done", ingested: 0, skipped: 0, replaced: 0 };
    }
    throw new Error(
      `federation job ${jobId} is ${row.state} after ${row.attempts} attempts and cannot be claimed`
    );
  }
  const { peer_id: peerId } = claim.rows[0];
  const deadline = Date.now() + FEDERATION_JOB_DEADLINE_MS;
  let ingested = 0;
  let skipped = 0;
  let replaced = 0;

  const fail = async (message: string): Promise<FederationJobResult> => {
    await pool
      .query(
        `UPDATE federation_sync_jobs SET state = 'failed', last_error = $2, updated_at = now()
         WHERE job_id = $1`,
        [jobId, message]
      )
      .catch(() => undefined);
    const client = await pool.connect().catch(() => null);
    if (client) {
      try {
        await writeAudit(client, platformId, "federation_sync_failed", peerId, {
          job_id: jobId,
          error: message
        });
      } catch {
        // The failure is already recorded on the job row; a failed audit
        // write must not mask it.
      } finally {
        client.release();
      }
    }
    return {
      job_id: jobId,
      state: "failed",
      ingested,
      skipped,
      replaced,
      last_error: message
    };
  };

  try {
    const peerQ = await pool.query(
      `SELECT peer_id, peer_url, status, last_synced_at, last_synced_story_id
       FROM federation_peers WHERE peer_id = $1 AND platform_id = $2`,
      [peerId, platformId]
    );
    if (peerQ.rowCount === 0) return fail(`peer ${peerId} not found`);
    const peer = peerQ.rows[0];
    if (peer.status !== "active") return fail(`peer ${peerId} is not active (status ${peer.status})`);

    const base = String(peer.peer_url).replace(/\/+$/, "");
    const feed = await fetchJson(
      `${base}/v1/feed?state=published&limit=${FEDERATION_FEED_LIMIT}`,
      FEDERATION_FETCH_TIMEOUT_MS
    );
    if (!isRecord(feed) || !Array.isArray(feed.items)) {
      return fail(`peer ${peerId} returned a malformed /v1/feed response`);
    }

    let newest: { story_id: string; updated_at: string } | null = null;
    for (const item of feed.items) {
      if (Date.now() > deadline) {
        return fail(`job deadline (${FEDERATION_JOB_DEADLINE_MS}ms) exceeded at ${ingested} ingested`);
      }
      const remoteStoryId = item?.story_id;
      if (typeof remoteStoryId !== "string" || !remoteStoryId) {
        return fail(`peer ${peerId} feed item has no story_id`);
      }
      if (typeof item.updated_at === "string" && (!newest || item.updated_at > newest.updated_at)) {
        newest = { story_id: remoteStoryId, updated_at: item.updated_at };
      }
      const rawBundle = await fetchJson(
        `${base}/v1/story/${encodeURIComponent(remoteStoryId)}`,
        FEDERATION_FETCH_TIMEOUT_MS
      );
      let bundle: WireBundle;
      try {
        bundle = validateBundle(rawBundle, remoteStoryId);
      } catch (err: any) {
        return fail(err?.message ?? String(err));
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const already = await client.query(
          `SELECT bundle_hash FROM federated_stories WHERE peer_id = $1 AND remote_story_id = $2`,
          [peerId, remoteStoryId]
        );
        if (already.rowCount > 0 && already.rows[0].bundle_hash === bundle.bundle_hash) {
          await client.query("COMMIT");
          skipped += 1;
          continue;
        }
        const res = await ingestBundle(client, platformId, peerId, remoteStoryId, bundle);
        await client.query("COMMIT");
        if (res.action === "replaced") replaced += 1;
        else ingested += 1;
      } catch (err: any) {
        await client.query("ROLLBACK").catch(() => undefined);
        return fail(`story ${remoteStoryId}: ${err?.message ?? err}`);
      } finally {
        client.release();
      }
    }

    const now = new Date().toISOString();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE federation_peers SET last_synced_at = $1, last_synced_story_id = $2 WHERE peer_id = $3`,
        [now, newest ? newest.story_id : peer.last_synced_story_id, peerId]
      );
      await client.query(
        `UPDATE federation_sync_jobs SET state = 'done', last_error = NULL, updated_at = now() WHERE job_id = $1`,
        [jobId]
      );
      await writeAudit(client, platformId, "federation_sync", peerId, {
        job_id: jobId,
        ingested,
        skipped,
        replaced
      });
      await client.query("COMMIT");
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => undefined);
      return fail(`finalizing sync: ${err?.message ?? err}`);
    } finally {
      client.release();
    }
    return { job_id: jobId, state: "done", ingested, skipped, replaced };
  } catch (err: any) {
    return fail(err?.message ?? String(err));
  }
}

/** Claim the oldest pending job for this platform and run it, if any. */
export async function processNextFederationJob(
  pool: any,
  platformId: string
): Promise<FederationJobResult | null> {
  const next = await pool.query(
    `SELECT job_id FROM federation_sync_jobs
     WHERE platform_id = $1 AND state = 'pending'
     ORDER BY created_at ASC LIMIT 1`,
    [platformId]
  );
  if (next.rowCount === 0) return null;
  return runFederationSyncJob(pool, platformId, next.rows[0].job_id);
}

/**
 * Background claim loop: picks up pending jobs every interval. Skipped in
 * test runs (NODE_ENV=test) so tests can drive jobs deterministically.
 */
export function startFederationWorker(
  pool: any,
  platformId: string,
  intervalMs = 10_000
): NodeJS.Timeout {
  const timer = setInterval(() => {
    processNextFederationJob(pool, platformId).catch((err) => {
      console.error(JSON.stringify({ service: "gateway", federation_worker_error: String(err?.message ?? err) }));
    });
  }, intervalMs);
  timer.unref();
  return timer;
}

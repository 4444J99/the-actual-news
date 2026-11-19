import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { hashHex } from "shared";

// Finalize verification (the-actual-news#111, Step 7).
//
// Runs at the end of each ingest run and checks the identity chain for every
// article the run captured: the capture row exists, the evidence row exists
// with the same blob URI, the blob file exists on disk and hashes to the
// recorded content hash, the story and a version exist, and every claim of
// the story has its ingestion ('origin') edge to that evidence. The result
// is recorded on the ingest_runs row (finalize_ok / finalize_checked_at /
// finalize_errors) so a run can be asked "did it finalize?" without parsing
// free text.
//
// This function never throws: an internal failure is recorded as
// finalize_ok=false with the error text, so a finalize problem can never
// mask (or fake) the run's own status. A run with zero success captures
// finalizes vacuously true — the run row's own status carries whether the
// run itself succeeded.

export type FinalizeResult = {
  ok: boolean;
  checked: number;
  errors: string[];
};

function sha256File(filePath: string): string {
  const buf = readFileSync(filePath);
  return "sha256:" + createHash("sha256").update(buf).digest("hex");
}

export async function finalizeRun(
  pool: Pool,
  runId: string,
  blobStoreDir: string
): Promise<FinalizeResult> {
  const errors: string[] = [];
  let checked = 0;
  try {
    const caps = await pool.query(
      `SELECT capture_id, content_hash, blob_uri FROM source_captures
       WHERE run_id = $1 AND status = 'success'`,
      [runId]
    );
    for (const cap of caps.rows) {
      checked++;
      const captureId = String(cap.capture_id);
      const hash = String(cap.content_hash);
      const blobUri = String(cap.blob_uri ?? "");

      const ev = await pool.query(
        `SELECT evidence_id_hash, blob_uri FROM evidence_objects
         WHERE evidence_id_hash = $1`,
        [hash]
      );
      if (ev.rowCount === 0) {
        errors.push(`capture ${captureId}: no evidence row for ${hash}`);
        continue;
      }
      if (String(ev.rows[0].blob_uri ?? "") !== blobUri) {
        errors.push(
          `capture ${captureId}: evidence blob_uri ${ev.rows[0].blob_uri} != capture blob_uri ${blobUri}`
        );
      }

      const blobName = blobUri.replace("blob://local/", "");
      if (blobName === blobUri || blobName !== hashHex(hash)) {
        errors.push(
          `capture ${captureId}: blob_uri ${blobUri} does not name the content hash ${hash}`
        );
        continue;
      }
      const blobPath = path.join(blobStoreDir, `${blobName}.blob`);
      if (!existsSync(blobPath)) {
        errors.push(`capture ${captureId}: blob file missing at ${blobPath}`);
        continue;
      }
      if (sha256File(blobPath) !== hash) {
        errors.push(`capture ${captureId}: blob file at ${blobPath} does not hash to ${hash}`);
        continue;
      }

      const stories = await pool.query(
        `SELECT DISTINCT c.story_id FROM claims c
         JOIN claim_evidence_edges e ON e.claim_id = c.claim_id
         WHERE e.evidence_id_hash = $1`,
        [hash]
      );
      if (stories.rowCount === 0) {
        errors.push(`capture ${captureId}: no story claims the evidence ${hash}`);
        continue;
      }
      for (const s of stories.rows) {
        const storyId = String(s.story_id);
        const vers = await pool.query(
          `SELECT COUNT(*) AS c FROM story_versions WHERE story_id = $1`,
          [storyId]
        );
        if (Number(vers.rows[0].c) === 0) {
          errors.push(`capture ${captureId}: story ${storyId} has no version`);
        }
        const orphans = await pool.query(
          `SELECT c.claim_id FROM claims c
           WHERE c.story_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM claim_evidence_edges e
               WHERE e.claim_id = c.claim_id
                 AND e.relation = 'origin'
                 AND e.evidence_id_hash = $2
             )`,
          [storyId, hash]
        );
        for (const o of orphans.rows) {
          errors.push(
            `capture ${captureId}: claim ${o.claim_id} of story ${storyId} has no origin edge to ${hash}`
          );
        }
      }
    }
  } catch (err: unknown) {
    errors.push(`finalize error: ${String((err as Error)?.message ?? err)}`);
  }

  const ok = errors.length === 0;
  try {
    await pool.query(
      `UPDATE ingest_runs
       SET finalize_ok = $1, finalize_checked_at = now(), finalize_errors = $2
       WHERE run_id = $3`,
      [ok, errors.join("; ") || null, runId]
    );
  } catch {
    // Recording the receipt must never fail the caller.
  }
  return { ok, checked, errors };
}

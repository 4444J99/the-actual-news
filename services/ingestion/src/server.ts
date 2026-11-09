import express from "express";
import crypto from "node:crypto";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";
import { runIngestion } from "./pipeline.js";

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);
const PORT = Number(process.env.INGESTION_PORT ?? DEFAULT_PORT);

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

export const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "ingestion", platform_id: env.PLATFORM_ID });
});

// GET /v1/sources — list registered sources
app.get("/v1/sources", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT source_id, platform_id, name, feed_url, source_class, fetch_interval_minutes, enabled, last_fetched_at, created_at
       FROM sources WHERE platform_id = $1 ORDER BY created_at DESC`,
      [env.PLATFORM_ID]
    );
    return res.status(200).json({ items: q.rows });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/sources — register a new source
app.post("/v1/sources", async (req, res) => {
  const { name, feed_url, source_class, fetch_interval_minutes } = req.body ?? {};

  if (!name || !feed_url) {
    return res.status(400).json({ code: "bad_request", message: "name and feed_url are required" });
  }

  const source_id = ulid();
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO sources (source_id, platform_id, name, feed_url, source_class, fetch_interval_minutes, enabled, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
      [source_id, env.PLATFORM_ID, name, feed_url, source_class ?? "primary_record", fetch_interval_minutes ?? 60, now]
    );

    return res.status(201).json({
      source_id,
      platform_id: env.PLATFORM_ID,
      name,
      feed_url,
      source_class: source_class ?? "primary_record",
      fetch_interval_minutes: fetch_interval_minutes ?? 60,
      enabled: true,
      created_at: now,
    });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// PUT /v1/sources/:source_id — update a source
app.put("/v1/sources/:source_id", async (req, res) => {
  const { enabled, fetch_interval_minutes, name } = req.body ?? {};

  try {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (enabled !== undefined) { sets.push(`enabled = $${idx++}`); vals.push(enabled); }
    if (fetch_interval_minutes !== undefined) { sets.push(`fetch_interval_minutes = $${idx++}`); vals.push(fetch_interval_minutes); }
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }

    if (sets.length === 0) {
      return res.status(400).json({ code: "bad_request", message: "no fields to update" });
    }

    vals.push(req.params.source_id, env.PLATFORM_ID);
    const result = await pool.query(
      `UPDATE sources SET ${sets.join(", ")} WHERE source_id = $${idx} AND platform_id = $${idx + 1} RETURNING *`,
      vals
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "source not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// POST /v1/ingest/run — trigger ingestion
app.post("/v1/ingest/run", async (req, res) => {
  try {
    const result = await runIngestion(pool, env.PLATFORM_ID);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// GET /v1/ingest/runs — list recent ingest runs
app.get("/v1/ingest/runs", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT run_id, platform_id, started_at, completed_at, sources_processed, articles_found, articles_new, claims_extracted, errors, created_at
       FROM ingest_runs WHERE platform_id = $1 ORDER BY started_at DESC LIMIT 50`,
      [env.PLATFORM_ID]
    );
    return res.status(200).json({ items: q.rows });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// GET /v1/ingest/status — last run status
app.get("/v1/ingest/status", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT run_id, started_at, completed_at, sources_processed, articles_found, articles_new, claims_extracted, errors
       FROM ingest_runs WHERE platform_id = $1 ORDER BY started_at DESC LIMIT 1`,
      [env.PLATFORM_ID]
    );

    const sourcesQ = await pool.query(
      `SELECT count(*) as total, count(*) FILTER (WHERE enabled = true) as enabled FROM sources WHERE platform_id = $1`,
      [env.PLATFORM_ID]
    );

    return res.status(200).json({
      last_run: q.rows[0] ?? null,
      sources: sourcesQ.rows[0],
    });
  } catch (err: any) {
    return res.status(500).json({ code: "internal_error", message: "unexpected server error", details: { error: String(err?.message ?? err) } });
  }
});

// Durable scheduler (simple interval-based)
const INGEST_INTERVAL_MS = Number(process.env.INGEST_INTERVAL_MINUTES ?? 60) * 60 * 1000;
let schedulerHandle: ReturnType<typeof setInterval> | null = null;

function startScheduler() {
  schedulerHandle = setInterval(async () => {
    console.log(JSON.stringify({ service: "ingestion", event: "scheduled_run", time: new Date().toISOString() }));
    try {
      const result = await runIngestion(pool, env.PLATFORM_ID);
      console.log(JSON.stringify({ service: "ingestion", event: "scheduled_run_complete", result }));
    } catch (err: any) {
      console.error(JSON.stringify({ service: "ingestion", event: "scheduled_run_error", error: String(err?.message ?? err) }));
    }
  }, INGEST_INTERVAL_MS);
}

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ service: "ingestion", port: PORT, platform_id: env.PLATFORM_ID }));
    startScheduler();
  });

  process.on("SIGTERM", () => {
    if (schedulerHandle) clearInterval(schedulerHandle);
    server.close();
  });
  process.on("SIGINT", () => {
    if (schedulerHandle) clearInterval(schedulerHandle);
    server.close();
  });
}
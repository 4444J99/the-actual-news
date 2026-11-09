import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);
const PORT = Number(process.env.EVIDENCE_PORT ?? DEFAULT_PORT);

// Evidence blob store. Defaults to an OS temp dir so the service is not tied
// to a single machine's filesystem; production deploys set
// EVIDENCE_BLOB_STORE_DIR (e.g. /data/evidence-blobs in Docker Compose).
const BLOB_STORE_DIR = process.env.EVIDENCE_BLOB_STORE_DIR ?? path.join(os.tmpdir(), "evidence-blobs");

// Ensure blob store directory exists
if (!fs.existsSync(BLOB_STORE_DIR)) {
  fs.mkdirSync(BLOB_STORE_DIR, { recursive: true });
}

type EvidenceObject = {
  evidence_id_hash: string;
  platform_id: string;
  blob_uri: string;
  media_type: string;
  extracted_text?: string | null;
  provenance: Record<string, unknown>;
  created_at: string;
};

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

function sha256Buffer(buf: Buffer): string {
  return "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
}

export const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.raw({ type: "*/*", limit: "50mb" }));

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "evidence", platform_id: env.PLATFORM_ID });
});

// POST /v1/evidence/upload — upload raw bytes, returns evidence_id_hash
app.post("/v1/evidence/upload", async (req, res) => {
  const mediaType = req.headers["content-type"] || "application/octet-stream";
  const provenanceHeader = req.headers["x-provenance"];
  let provenance: Record<string, unknown> = {};
  if (provenanceHeader) {
    try { provenance = JSON.parse(String(provenanceHeader)); } catch { provenance = {}; }
  }

  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ code: "bad_request", message: "request body must contain raw bytes" });
  }

  const buf = req.body as Buffer;
  const evidence_id_hash = sha256Buffer(buf);
  const blobPath = path.join(BLOB_STORE_DIR, evidence_id_hash.replace("sha256:", "") + ".blob");

  // Write bytes to blob store
  fs.writeFileSync(blobPath, buf);

  const blob_uri = `blob://local/${evidence_id_hash}`;
  const now = new Date().toISOString();

  if (!provenance.source || !provenance.collected_at) {
    // Allow upload without full provenance; provenance can be added on registration
    provenance = { ...provenance, collected_at: provenance.collected_at ?? now };
  }

  try {
    await pool.query(
      `INSERT INTO evidence_objects (evidence_id_hash, platform_id, blob_uri, media_type, extracted_text, provenance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (evidence_id_hash) DO NOTHING`,
      [evidence_id_hash, env.PLATFORM_ID, blob_uri, mediaType, null, JSON.stringify(provenance), now]
    );

    return res.status(201).json({
      evidence_id_hash,
      blob_uri,
      media_type: mediaType,
      size_bytes: buf.length,
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

// GET /v1/evidence/:hash/bytes — retrieve stored bytes and verify hash
app.get("/v1/evidence/:hash/bytes", async (req, res) => {
  const hash = req.params.hash;
  const fullHash = hash.startsWith("sha256:") ? hash : `sha256:${hash}`;
  const blobPath = path.join(BLOB_STORE_DIR, fullHash.replace("sha256:", "") + ".blob");

  if (!fs.existsSync(blobPath)) {
    return res.status(404).json({ code: "not_found", message: "blob not found" });
  }

  const buf = fs.readFileSync(blobPath);
  const computedHash = sha256Buffer(buf);

  if (computedHash !== fullHash) {
    return res.status(500).json({
      code: "integrity_error",
      message: "stored bytes do not match recorded hash",
      details: { expected: fullHash, computed: computedHash }
    });
  }

  // Look up media type from DB
  let mediaType = "application/octet-stream";
  try {
    const q = await pool.query(
      `SELECT media_type FROM evidence_objects WHERE evidence_id_hash = $1`,
      [fullHash]
    );
    if (q.rowCount && q.rowCount > 0) {
      mediaType = q.rows[0].media_type;
    }
  } catch { /* ignore */ }

  res.setHeader("Content-Type", mediaType);
  res.setHeader("X-Content-Hash", fullHash);
  res.send(buf);
});

// POST /v1/evidence/presign — generate a presigned upload URL (legacy)
app.post("/v1/evidence/presign", (req, res) => {
  const { media_type, filename } = req.body ?? {};

  if (!media_type || !filename) {
    return res.status(400).json({
      code: "bad_request",
      message: "media_type and filename are required",
    });
  }

  const blob_uri = `blob://${env.PLATFORM_ID}/${ulid()}/${filename}`;
  const upload_url = `http://localhost:${PORT}/v1/evidence/upload`;

  return res.status(200).json({ upload_url, blob_uri });
});

// POST /v1/evidence — register evidence object (metadata only, for URL-based evidence)
app.post("/v1/evidence", async (req, res) => {
  const { platform_id, blob_uri, media_type, extracted_text, provenance } = req.body ?? {};

  if (!blob_uri || !media_type || !provenance) {
    return res.status(400).json({
      code: "bad_request",
      message: "blob_uri, media_type, and provenance are required",
    });
  }

  if (!provenance.source || !provenance.collected_at) {
    return res.status(400).json({
      code: "bad_request",
      message: "provenance must include source and collected_at",
    });
  }

  const pid = platform_id ?? env.PLATFORM_ID;
  // Derive identity from embedded content hash when available (e.g. uploaded blobs),
  // otherwise fall back to hashing the URI for URL-based evidence.
  const embedded = String(blob_uri).match(/sha256:[a-f0-9]{64}/);
  const evidence_id_hash = embedded ? embedded[0] : sha256Buffer(Buffer.from(blob_uri, "utf8"));
  const now = new Date().toISOString();

  try {
    await pool.query(
      `INSERT INTO evidence_objects (evidence_id_hash, platform_id, blob_uri, media_type, extracted_text, provenance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (evidence_id_hash) DO NOTHING`,
      [evidence_id_hash, pid, blob_uri, media_type, extracted_text ?? null, JSON.stringify(provenance), now]
    );

    const q = await pool.query(
      `SELECT evidence_id_hash, platform_id, blob_uri, media_type, extracted_text, provenance, created_at
       FROM evidence_objects WHERE evidence_id_hash = $1`,
      [evidence_id_hash]
    );

    return res.status(201).json(q.rows[0]);
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

// GET /v1/evidence/:evidence_id_hash — get evidence by hash
app.get("/v1/evidence/:evidence_id_hash", async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT evidence_id_hash, platform_id, blob_uri, media_type, extracted_text, provenance, created_at
       FROM evidence_objects WHERE evidence_id_hash = $1`,
      [req.params.evidence_id_hash]
    );

    if (q.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "evidence not found" });
    }

    return res.status(200).json(q.rows[0]);
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
    console.log(JSON.stringify({ service: "evidence", port: PORT, platform_id: env.PLATFORM_ID }));
  });

  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
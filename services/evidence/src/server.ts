import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.EVIDENCE_PORT ?? 8083);
const PLATFORM_ID = process.env.PLATFORM_ID ?? "unknown";

type EvidenceObject = {
  evidence_id_hash: string;
  platform_id: string;
  blob_uri: string;
  media_type: string;
  extracted_text?: string;
  provenance: Record<string, unknown>;
  created_at: string;
};

// In-memory store
const evidence = new Map<string, EvidenceObject>();

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

function sha256(data: string): string {
  return "sha256:" + crypto.createHash("sha256").update(data).digest("hex");
}

export const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "evidence", platform_id: PLATFORM_ID });
});

// POST /v1/evidence/presign — generate a presigned upload URL
app.post("/v1/evidence/presign", (req, res) => {
  const { platform_id, media_type, filename, content_sha256 } = req.body ?? {};

  if (!media_type || !filename) {
    return res.status(400).json({
      code: "bad_request",
      message: "media_type and filename are required",
    });
  }

  const blob_uri = `blob://${platform_id ?? PLATFORM_ID}/${ulid()}/${filename}`;
  const upload_url = `https://storage.example.com/upload/${ulid()}`;

  return res.status(200).json({ upload_url, blob_uri });
});

// POST /v1/evidence — register evidence object
app.post("/v1/evidence", (req, res) => {
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

  const evidence_id_hash = sha256(blob_uri);
  const now = new Date().toISOString();

  const obj: EvidenceObject = {
    evidence_id_hash,
    platform_id: platform_id ?? PLATFORM_ID,
    blob_uri,
    media_type,
    extracted_text,
    provenance,
    created_at: now,
  };

  evidence.set(evidence_id_hash, obj);

  return res.status(201).json(obj);
});

// GET /v1/evidence/:evidence_id_hash — get evidence by hash
app.get("/v1/evidence/:evidence_id_hash", (req, res) => {
  const hash = req.params.evidence_id_hash;
  const obj = evidence.get(hash);

  if (!obj) {
    return res.status(404).json({ code: "not_found", message: "evidence not found" });
  }

  return res.status(200).json(obj);
});

export { evidence };

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ service: "evidence", port: PORT, platform_id: PLATFORM_ID }));
  });

  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}

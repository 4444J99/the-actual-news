import { describe, it, expect, beforeEach } from "vitest";
import http from "node:http";
import { app, evidence } from "../server.js";

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
  evidence.clear();
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
    expect(body.service).toBe("evidence");
  });
});

describe("POST /v1/evidence/presign", () => {
  it("should generate presigned upload URL", async () => {
    const res = await fetch("/v1/evidence/presign", {
      method: "POST",
      body: { platform_id: "test", media_type: "application/pdf", filename: "doc.pdf" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upload_url).toBeTruthy();
    expect(body.blob_uri).toBeTruthy();
  });

  it("should reject missing fields", async () => {
    const res = await fetch("/v1/evidence/presign", {
      method: "POST",
      body: { platform_id: "test" },
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/evidence", () => {
  it("should register evidence object", async () => {
    const res = await fetch("/v1/evidence", {
      method: "POST",
      body: {
        platform_id: "test",
        blob_uri: "blob://test/doc.pdf",
        media_type: "application/pdf",
        provenance: { source: "Reuters", collected_at: "2026-01-01T00:00:00Z" },
      },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.evidence_id_hash).toContain("sha256:");
    expect(body.blob_uri).toBe("blob://test/doc.pdf");
  });

  it("should reject missing provenance fields", async () => {
    const res = await fetch("/v1/evidence", {
      method: "POST",
      body: {
        blob_uri: "blob://test/doc.pdf",
        media_type: "application/pdf",
        provenance: {},
      },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/evidence/:evidence_id_hash", () => {
  it("should retrieve registered evidence", async () => {
    const createRes = await fetch("/v1/evidence", {
      method: "POST",
      body: {
        platform_id: "test",
        blob_uri: "blob://test/evidence1.pdf",
        media_type: "application/pdf",
        provenance: { source: "AP News", collected_at: "2026-01-01T00:00:00Z" },
      },
    });
    const { evidence_id_hash } = await createRes.json();

    const res = await fetch(`/v1/evidence/${encodeURIComponent(evidence_id_hash)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evidence_id_hash).toBe(evidence_id_hash);
  });

  it("should return 404 for unknown hash", async () => {
    const res = await fetch("/v1/evidence/sha256:nonexistent");
    expect(res.status).toBe(404);
  });
});

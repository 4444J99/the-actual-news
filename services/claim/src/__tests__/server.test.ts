import { describe, it, expect, beforeEach } from "vitest";
import http from "node:http";
import { app, claims, jobs } from "../server.js";

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
  claims.clear();
  jobs.clear();
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
    expect(body.service).toBe("claim");
  });
});

describe("POST /v1/extract", () => {
  it("should extract claims from markdown", async () => {
    const res = await fetch("/v1/extract", {
      method: "POST",
      body: {
        platform_id: "test",
        story_id: "S001",
        story_version_id: "SV001",
        body_markdown: "The mayor announced new budget cuts. City spending decreased by 15 percent last quarter. John Smith said the cuts were necessary.",
        model_policy: { model_gateway_uri: "http://example.com" },
      },
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.job_id).toBeTruthy();
    expect(claims.size).toBeGreaterThan(0);
  });

  it("should reject missing fields", async () => {
    const res = await fetch("/v1/extract", {
      method: "POST",
      body: { platform_id: "test" },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/stories/:story_id/claims", () => {
  it("should list claims for a story", async () => {
    await fetch("/v1/extract", {
      method: "POST",
      body: {
        platform_id: "test",
        story_id: "STORY1",
        story_version_id: "SV1",
        body_markdown: "The president signed the bill into law yesterday. Congress voted 250 to 180 in favor of the legislation.",
        model_policy: { model_gateway_uri: "http://example.com" },
      },
    });

    const res = await fetch("/v1/stories/STORY1/claims");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].story_id).toBe("STORY1");
  });

  it("should return empty for unknown story", async () => {
    const res = await fetch("/v1/stories/UNKNOWN/claims");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });
});

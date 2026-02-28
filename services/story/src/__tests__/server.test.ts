import { describe, it, expect, beforeEach } from "vitest";
import http from "node:http";
import { app, stories, versions } from "../server.js";

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
        resolve({
          status: res.statusCode!,
          json: () => Promise.resolve(JSON.parse(data)),
        });
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

beforeEach(async () => {
  stories.clear();
  versions.clear();
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
    expect(body.ok).toBe(true);
    expect(body.service).toBe("story");
  });
});

describe("POST /v1/stories", () => {
  it("should create a story", async () => {
    const res = await fetch("/v1/stories", {
      method: "POST",
      body: { title: "Test Story" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Test Story");
    expect(body.state).toBe("draft");
    expect(body.story_id).toBeTruthy();
  });

  it("should reject missing title", async () => {
    const res = await fetch("/v1/stories", { method: "POST", body: {} });
    expect(res.status).toBe(400);
  });

  it("should create initial version if body provided", async () => {
    const res = await fetch("/v1/stories", {
      method: "POST",
      body: { title: "Story With Body", initial_body_markdown: "# Hello" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(versions.get(body.story_id)).toHaveLength(1);
  });
});

describe("GET /v1/stories", () => {
  it("should list stories", async () => {
    await fetch("/v1/stories", { method: "POST", body: { title: "A" } });
    await fetch("/v1/stories", { method: "POST", body: { title: "B" } });

    const res = await fetch("/v1/stories");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
  });

  it("should filter by state", async () => {
    await fetch("/v1/stories", { method: "POST", body: { title: "Draft" } });

    const res = await fetch("/v1/stories?state=published");
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });
});

describe("GET /v1/stories/:story_id", () => {
  it("should return story with versions", async () => {
    const createRes = await fetch("/v1/stories", {
      method: "POST",
      body: { title: "Detail", initial_body_markdown: "Body text" },
    });
    const { story_id } = await createRes.json();

    const res = await fetch(`/v1/stories/${story_id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Detail");
    expect(body.versions).toHaveLength(1);
  });

  it("should return 404 for unknown story", async () => {
    const res = await fetch("/v1/stories/NONEXISTENT");
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/stories/:story_id/versions", () => {
  it("should add a version", async () => {
    const createRes = await fetch("/v1/stories", {
      method: "POST",
      body: { title: "Versioned" },
    });
    const { story_id } = await createRes.json();

    const res = await fetch(`/v1/stories/${story_id}/versions`, {
      method: "POST",
      body: { body_markdown: "# Version 1" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.body_markdown).toBe("# Version 1");
  });

  it("should reject missing body_markdown", async () => {
    const createRes = await fetch("/v1/stories", {
      method: "POST",
      body: { title: "No Body" },
    });
    const { story_id } = await createRes.json();

    const res = await fetch(`/v1/stories/${story_id}/versions`, {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(400);
  });
});

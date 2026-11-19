import { describe, it, expect, vi, afterEach } from "vitest";
import http from "node:http";
import express from "express";

// Proves the federation rate limiter actually throttles: with a limit of 3
// per minute the 4th request is rejected with 429 + the rate_limited code,
// so the CodeQL js/missing-rate-limiting guard on the federation handlers
// is real and not just a middleware that never fires. Mirrors
// services/verify/src/__tests__/rateLimit.test.ts.
describe("federation rate limiter", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.GATEWAY_FEDERATION_RATE_LIMIT_MAX;
  });

  it("rejects requests past the limit with 429", async () => {
    process.env.GATEWAY_FEDERATION_RATE_LIMIT_MAX = "3";
    const { createFederationRateLimiter } = await import("../rateLimit.js");
    const app = express();
    app.post("/probe", createFederationRateLimiter(), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const addr = server.address() as { port: number };
      const post = () =>
        new Promise<number>((resolve, reject) => {
          const req = http.request(
            { host: "127.0.0.1", port: addr.port, path: "/probe", method: "POST" },
            (res) => {
              res.resume();
              res.on("end", () => resolve(res.statusCode!));
            }
          );
          req.on("error", reject);
          req.end();
        });
      expect(await post()).toBe(200);
      expect(await post()).toBe(200);
      expect(await post()).toBe(200);
      expect(await post()).toBe(429);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

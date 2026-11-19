import rateLimit from "express-rate-limit";

// Why this exists: CodeQL `js/missing-rate-limiting` flags the federation
// handlers — sync performs repeated DB writes (job enqueue + worker ingest)
// and the job-status read hits the DB on every poll, with no per-caller
// throttle, so one caller can flood job creation. A fixed window per
// client IP is the smallest real fix: no new infra, no new service, and
// the limit is env-tunable for tests and deployments.
//
// Why `express-rate-limit` instead of a hand-rolled counter: it is the
// library CodeQL models for this query, so the check recognises the guard
// instead of flagging the same handler again. Same idiom as
// services/verify/src/rateLimit.ts (review handler).
export function createFederationRateLimiter() {
  const max = Number(process.env.GATEWAY_FEDERATION_RATE_LIMIT_MAX ?? 120);
  return rateLimit({
    windowMs: 60_000,
    limit: Number.isFinite(max) && max > 0 ? max : 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      code: "rate_limited",
      message: "too many federation sync requests, try again shortly",
    },
  });
}

export const federationRateLimiter = createFederationRateLimiter();

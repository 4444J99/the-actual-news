import rateLimit from "express-rate-limit";

// Why this exists: CodeQL `js/missing-rate-limiting` flags the review handler —
// it performs auth plus repeated DB writes with no per-caller throttle, so one
// caller (or a leaked internal key) can flood review inserts. A fixed window
// per client IP is the smallest real fix: no new infra, no new service, and
// the limit is env-tunable for tests and deployments.
//
// Why `express-rate-limit` instead of a hand-rolled counter: it is the
// library CodeQL models for this query, so the check recognises the guard
// instead of flagging the same handler again.
export function createReviewRateLimiter() {
  const max = Number(process.env.VERIFY_REVIEW_RATE_LIMIT_MAX ?? 120);
  return rateLimit({
    windowMs: 60_000,
    limit: Number.isFinite(max) && max > 0 ? max : 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      code: "rate_limited",
      message: "too many review submissions, try again shortly",
    },
  });
}

export const reviewRateLimiter = createReviewRateLimiter();

# Activation Ledger

Status: **ship-soon**

This ledger is the activation record for the public web worker: what is proven,
what is still gated, and what the live origin actually serves. It is updated
whenever the activation state changes; the launch report
(`docs/public-launch-report.md`) remains the readiness verdict, and this ledger
is the evidence behind it.

## Current state (2026-11-20)

- Repo head verified: `3de45bf1` (`main`, green 12/12).
- Worker build: `pnpm cloudflare:build` passes with
  `@opennextjs/cloudflare` 1.20.18 and `wrangler` 4.165.0 (see
  `apps/public-web/package.json`). The 1.20.18 bump restores the worker build
  for Next 16.4.5: 1.19.11 failed every route with
  `Unexpected loadManifest(/.next/server/preview-props.json)` because Next
  16.4.5 calls `getPreviewProps()` in the server constructor and 1.19.11 has
  no `preview-props` handling; 1.20.18 inlines `server/preview-props.json`.
- Preview proof (2026-11-20, `wrangler dev` 4.165.0 on `127.0.0.1:8787`):
  the repo smoke gate passes 34/34 checks (`pnpm smoke:public` against the
  preview origin), including `/`, `/api/healthz`, `/v1/feed`, `/launch.json`,
  `/feed.xml`, and `/robots.txt`.
- Local gates (2026-11-20): `pnpm launch:local` passes (58 service tests
  plus public-app and conversion smokes); `pnpm launch:check` passes
  non-strict with 3 warnings, one per blank revenue URL below.
- Live origin: **not deployed**. The public URL serves nothing (see probe).
- Release: `v0.0.1` is still a draft with 0 assets; there are zero tags.
  No release is published by this ledger.

## Open gates

These are decisions and credentials only Anthony can supply. Nothing here is
worked around with placeholders.

| # | Gate | Owner | State |
| --- | --- | --- | --- |
| 1 | Cloudflare deploy credential (a token that can deploy this worker) | Anthony | Open — deploy is not attempted without it |
| 2 | `NEXT_PUBLIC_NEWSLETTER_URL`: hosted signup page outside the app's fallback routes | Anthony | Open — blank in `wrangler.jsonc` |
| 3 | `NEXT_PUBLIC_MEMBERSHIP_URL`: hosted checkout or membership page outside the app's fallback routes | Anthony | Open — blank in `wrangler.jsonc` |
| 4 | `NEXT_PUBLIC_SPONSOR_URL`: hosted sponsor intake outside the app's fallback routes | Anthony | Open — blank in `wrangler.jsonc` |

Gates 2–4 are the three launch-report blockers. Until each is set to a real
hosted destination, `/briefing`, `/membership`, and `/sponsor` keep serving
their newspaper-style conversion pages with setup notes, which is the designed
fallback, not a defect.

## Live-origin probe (2026-11-20)

Target: `https://the-actual-news-public.ivixivi.workers.dev`

- `pnpm cloudflare:smoke` against the live URL: **0 OK over 51 distinct
  routes, every route 404** (54 FAIL lines including retries of
  `/robots.txt`). Cloudflare answers and the subdomain resolves, but no
  worker is bound to it.
- The custom domain `recordswatch.org` has no DNS delegation at all
  (NXDOMAIN on its nameservers), so custom-domain cutover is a separate,
  larger job after the worker itself is deployed.

## Deploy record

| Field | Value |
| --- | --- |
| Deploy SHA | n/a — never deployed |
| Deployed by | — |
| Deployed at | — |
| Live URL | `https://the-actual-news-public.ivixivi.workers.dev` (404, no worker bound) |

## History

- 2026-11-20: Ledger created. Worker build restored for Next 16.4.5
  (`@opennextjs/cloudflare` 1.19.11 → 1.20.18, `wrangler` 4.100.0 →
  4.165.0); preview proven 34/34; live origin probed 0/51 (all 404); deploy and
  revenue gates recorded as open. Work: the-actual-news#46.

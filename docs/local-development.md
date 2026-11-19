# Local Development Guide

Face: internal

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`npm install -g pnpm`)
- **Make** (included on macOS/Linux)

Optional:

- **Docker** and Docker Compose, only if you want containerized PostgreSQL/API mocks or to reproduce image packaging checks locally.

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/organvm-iii-ergon/the-actual-news.git
cd the-actual-news

# 2. Copy environment config
cp .env.example .env
source .env

# 3. Optional: start Docker-managed PostgreSQL + Prism API mocks
make up

# 4. Run database migrations
make migrate

# 5. Install dependencies
pnpm install

# 6. Start all services in development mode
make dev
# Or start just the gateway:
make dev-minimal
```

## Architecture Overview

```
the-actual-news/
├── apps/public-web/     # Next.js frontend (port 3000)
├── services/
│   ├── gateway/         # API gateway (port 8080)
│   ├── story/           # Story management (port 8081)
│   ├── claim/           # Claim verification (port 8082)
│   ├── evidence/        # Evidence collection (port 8083)
│   └── verify/          # Verification engine (port 8084)
├── contracts/
│   ├── openapi/         # OpenAPI specs for all services
│   ├── events/          # Event schemas (JSON Schema)
│   └── policy-packs/    # Verification policy configurations
├── infra/               # Docker Compose + Postgres init
├── tools/
│   ├── conformance/     # Protocol conformance test suite
│   └── migrate.sh       # Database migration runner
└── db/migrations/       # SQL migration files
```

## Demo Mode (Without Blockchain)

The platform can run with mock services for demos. The optional Docker Compose
setup uses [Prism](https://stoplight.io/prism) to mock all OpenAPI-defined
service endpoints, so you can demonstrate the full news verification flow
without any blockchain infrastructure. This demo setup is separate from the
required public website launch path.

### Demo Flow

1. **Start infrastructure:** `make up` (starts Postgres + 5 Prism mock services)
2. **Run migrations:** `make migrate`
3. **Start frontend:** `cd apps/public-web && pnpm dev`
4. **Visit** http://localhost:3000 — the frontend renders with mock API data
5. **Run conformance tests:** `make test`

### Service Endpoints

| Service | Port | Health |
|---------|------|--------|
| Frontend | 3000 | http://localhost:3000 |
| Gateway | 8080 | http://localhost:8080 |
| Story | 8081 | http://localhost:8081 |
| Claim | 8082 | http://localhost:8082 |
| Evidence | 8083 | http://localhost:8083 |
| Verify | 8084 | http://localhost:8084 |
| PostgreSQL | 5432 | `pg_isready -h localhost` |

## Useful Commands

```bash
make up          # Optional: start Docker infrastructure
make up-public   # Optional: build/run the public reader app container
make up-internal # Optional: build/run internal Postgres + services containers
make down        # Stop and remove volumes
make down-public # Stop public app container
make down-internal # Stop internal containers and volumes
make migrate     # Run database migrations
make reset       # down + up + migrate
pnpm env:check   # Validate public/internal env boundary
pnpm public-source:check # Validate public-web source env boundary
pnpm public-env:template # Print a browser-safe public launch env template
pnpm launch:check # Report public launch readiness for audience/revenue URLs
pnpm launch:local # Required no-Docker local launch gate
pnpm launch:deployed # Required deployed-origin gate after real public URLs are configured
pnpm launch:report # Write docs/public-launch-report.md from current public env state
pnpm launch:smoke # Build, boot standalone public app, and smoke test launch routes
pnpm launch:conversions # Verify pending and hosted provider conversion redirects
pnpm cloudflare:build # Build the full public Next.js app for Cloudflare Workers with OpenNext
pnpm cloudflare:preview # Preview the OpenNext Worker locally through Wrangler
pnpm cloudflare:deploy # Deploy the full dynamic public app to Cloudflare Workers
pnpm cloudflare:smoke # Smoke test the deployed public Cloudflare Worker
pnpm container:check # Audit optional Docker boundaries without Docker installed
make lint        # Lint OpenAPI specs with Redocly
pnpm smoke:public # Smoke test the running public app on localhost:3000
pnpm test:services # Run service tests that do not need Postgres
pnpm conformance:doctor # Check psql and POSTGRES_URI before DB-backed conformance
pnpm conformance:test # Run DB-backed conformance only
make test        # Run conformance tests
make dev         # Start all services in dev mode
make dev-minimal # Start gateway only
```

Optional internal containers bind service ports to `127.0.0.1` by default. `pnpm container:check` also verifies Docker build contexts exclude generated runtime state such as `data/` and local database volumes.

## Public vs Internal Config

Use `.env.public.example` as the template for browser-safe values only. It may contain public URLs such as hosted newsletter, membership, and sponsor links.

Run `pnpm env:check` before deployment or before adding new env variables. It fails if `.env.public.example` contains secret-looking keys or values, or if required internal placeholders are missing from `.env.internal.example`.

Run `pnpm public-source:check` after public-web source changes. It fails if public browser code reads unsupported `process.env` keys or references internal-only env names.

Run `pnpm launch:check` to see which audience, revenue, analytics, and public URL settings are still placeholders. Before a real public deployment, run strict mode against the actual public env file:

```bash
pnpm public-env:template > .env.public
PUBLIC_ENV_FILE=.env.public pnpm launch:check:strict
```

If `NEXT_PUBLIC_NEWSLETTER_URL`, `NEXT_PUBLIC_MEMBERSHIP_URL`, or `NEXT_PUBLIC_SPONSOR_URL` are blank, the public app still serves `/briefing`, `/membership`, and `/sponsor` as newspaper-style conversion pages with setup notes. Set those values when the hosted provider pages are ready.

Set `NEXT_PUBLIC_ANALYTICS_DOMAIN` to the public site host when using a public, keyless analytics script such as Plausible. Keep `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` on the CSP-allowed Plausible browser script URL. Keep analytics API keys, payment secrets, email provider tokens, and CRM tokens out of `NEXT_PUBLIC_*`.

The public app exposes `GET /api/healthz` for deployment health checks. It reports only public configuration status and growth capability flags such as share packets, the share kit, media kit, offer packets, structured data, feeds, and conversion routes. It must not be expanded to include secrets or internal connection strings.

With the public app running, use `pnpm smoke:public` to verify the launch-critical public routes: homepage, conversion pages, feeds, sitemap, robots, share-kit JSON, social-card SVG, clipping page, verifier boundary page, structured data, and health endpoint. Set `PUBLIC_WEB_BASE_URL` to smoke test another origin.

The same smoke command checks response hardening headers, verifies public JSON-LD for the organization, website, articles, and offer pages, and scans public response bodies for credential-like values or internal configuration names.

The sitemap includes the front page, offer pages, sponsor registry, media kit, distribution/launch routes, the launch runbook, share kit, provider handoff, campaign queue, stable `/go/*` conversion routes, and every public atom clip/story URL. `robots.txt` points crawlers and launch automation to the sitemap, RSS feed, JSON Feed, distribution kit, launch manifest, launch runbook, share kit, provider handoff, campaigns, media kit, sponsor registry, and health endpoint.

The public app also serves `/site.webmanifest` and `/icon.svg` for branded install/bookmark metadata, public shortcuts, and share-target metadata.

The `/distribution` route is the public launch kit for share copy, atom share packets, campaign packets, media-kit links, offer packets, conversion steps, feeds, and conversion routes. It includes copy-ready controls for launch copy, route URLs, atom URLs, atom text, campaign pushes, and offer packets. `/principles` is the public trust page for the editorial firewall, funding boundary, correction visibility, and internal systems boundary. `/media-kit` and `/media-kit.json` expose public positioning, proof points, press copy, partner/sponsor asset links, and boundary notes. `/sponsors` and `/sponsors.json` are the public sponsor disclosure registry and firewall record. Public clip and story pages also expose X, LinkedIn, email, social-card, copy URL, and copy text controls. The `/launch.json` route is the machine-readable readiness manifest for distribution automation, `/share-kit.json` is the narrower machine-readable sharing packet for POSSE/social automation with campaign packets and media-kit data included, `/provider-handoff.json` is the machine-readable provider setup packet for hosted newsletter, membership, and sponsor pages, and `/campaigns.json` is the machine-readable queue for recurring atom, audience, membership, and sponsor campaigns. These JSON routes include growth capability flags, public clip, story, social-card, X, LinkedIn, and email links for each atom plus public briefing, membership, and sponsor offer packets with conversion steps. Stable `/go/briefing`, `/go/membership`, and `/go/sponsor` routes preserve UTM parameters and fall back to public offer pages while providers are pending. The public web app also serves reader-safe `/v1/feed` and `/v1/story/:story_id` routes from the same origin for initial launch. These surfaces are safe to publish because they contain only public URLs, public offer copy, press copy, and boundary guidance.

Visit `/launch` to inspect the public-safe readiness ledger in the browser. It should show only public URLs, configured/not-configured status, runbook steps, and links to `/launch.json`, `/runbook.json`, `/share-kit.json`, `/provider-handoff.json`, `/campaigns.json`, `/media-kit`, `/distribution`, and feed endpoints.

Use `pnpm launch:smoke` before deployment to build the public app, start the generated standalone server on `PUBLIC_WEB_PORT` or `3100`, run public smoke checks against it, and shut it down.

Use `pnpm launch:conversions` to verify that same-origin provider fallback URLs stay pending, hosted provider URLs mark health and launch JSON ready, and `/go/*` redirects preserve UTM attribution.

Use `pnpm launch:local` for the required no-Docker launch path. It runs env checks, public source boundary checks, optional container boundary auditing, typecheck, service tests, standalone public smoke, conversion redirect boundary smoke, and the non-strict launch readiness report.

After deploying the public app, run the deployed-origin gate. It requires a real HTTPS origin, verifies strict public env readiness, confirms `PUBLIC_WEB_BASE_URL` matches `NEXT_PUBLIC_SITE_URL`, and smoke tests the live routes:

```bash
PUBLIC_ENV_FILE=.env.public PUBLIC_WEB_BASE_URL=https://recordswatch.org pnpm launch:deployed
```

The deployed gate expects hosted provider URLs to be configured. Its route smoke verifies `/go/*` redirects to those hosted destinations with UTM parameters instead of expecting pending fallback pages.

CI runs the same public launch gates in `.github/workflows/public-launch.yml`. The conformance job provisions a temporary Postgres service; local conformance still requires `POSTGRES_URI`. CI also runs `pnpm container:check` and builds the public and internal Docker images in a non-blocking job, so Docker remains optional for local frontend work.

## Cloudflare Deployment

The full public app deploys to Cloudflare Workers through OpenNext, not Docker:

```bash
pnpm cloudflare:build
pnpm cloudflare:preview
PUBLIC_WEB_BASE_URL=http://127.0.0.1:8787 pnpm smoke:public
pnpm cloudflare:deploy
pnpm cloudflare:smoke
```

`apps/public-web/wrangler.jsonc` contains only browser-safe public variables for the Worker. Do not add database URLs, payment keys, newsletter API tokens, CRM tokens, webhook secrets, or reviewer queues there.

When hosted provider destinations are ready, put only those public URLs in `apps/public-web/wrangler.jsonc` as `NEXT_PUBLIC_NEWSLETTER_URL`, `NEXT_PUBLIC_MEMBERSHIP_URL`, and `NEXT_PUBLIC_SPONSOR_URL`, then run:

```bash
pnpm cloudflare:build
pnpm cloudflare:deploy
pnpm cloudflare:smoke
```

The current full-app Worker URL is `https://the-actual-news-public.ivixivi.workers.dev`. The Cloudflare Pages project `the-actual-news` can remain a lightweight static media-kit preview, but the full dynamic Next.js app, API routes, feeds, redirects, generated social cards, and JSON artifacts belong on the Worker.

Use `.env.internal.example` as the template for database, blob storage, model gateway, event bus, and reviewer-service settings. Real values from that file belong in a secret manager or private environment file, not in the public app.

Set `NEXT_PUBLIC_SITE_URL` before public deployment so canonical URLs and `sitemap.xml` point at the live domain.

See `docs/deployment-boundaries.md` for the full public/internal split.
See `docs/public-launch-checklist.md` for the public launch gate.

## Conformance Tests

The `tools/conformance/` directory contains protocol conformance tests with
pre-built fixtures (CT-01 through CT-13, plus the CT-BUNDLE-01 bundle replay). Run them with:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
export POSTGRES_URI="postgres://USER:PASSWORD@HOST:5432/news_ledger?sslmode=disable"
pnpm conformance:doctor
bash tools/migrate.sh
make test
# Or directly:
pnpm conformance:test
```

`tools/migrate.sh` needs the `psql` client on PATH and fails early with the same install guidance as `pnpm conformance:doctor`. On macOS with Homebrew, either `libpq` or `postgresql@16` provides it.
The conformance harness itself uses the Node `pg` driver, creates isolated temporary schemas from its own fixture schema, and does not require Docker. Migrations are still required when you are validating the application ledger schema rather than only the conformance fixtures.

CT-11 and CT-12 encode the ingestion identity invariants (no duplicate
captures/stories/claims on a double ingest; no partial rows and a failed
run status on a mid-ingest crash) as fixture data; the live proof that the
pipeline produces that state is
`services/ingestion/src/__tests__/identity.test.ts`. CT-13 is live: the
harness runs `tools/restore-demo.mjs`, which ingests a fixed feed, dumps
the database, restores it into a fresh database on a different blob path,
re-runs finalize verification there, and requires every identity-bearing
row to be identical.

## Evidence blob store

Ingestion writes one blob per captured article and records it as
`blob://local/<sha256-hex>`, where `<hex>` is the article content hash
without the `sha256:` prefix; the blob file on disk is `<hex>.blob` in the
blob store directory, and `evidence_id_hash` keeps the `sha256:` prefix.
The URI and the filename name the same hash, so a blob resolves after the
store moves or the database is restored elsewhere.

`EVIDENCE_BLOB_STORE_DIR` is **required** for ingestion: the service
fails fast at startup when it is unset (there is no default path — an
earlier `/Volumes/Archive4T/...` default silently wrote blobs to a
machine-specific location). The evidence service keeps its own tmpdir
default; only ingestion requires the variable. Point it at a directory
the service can create and write, e.g.:

```bash
export EVIDENCE_BLOB_STORE_DIR="$PWD/.data/blobs"
```

## Teardown

```bash
make down
```

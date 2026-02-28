# CLAUDE.md — the-actual-news

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**The Actual News** — verifiable news ledger platform treating news as a public service. A pnpm monorepo with an OpenAPI-defined gateway, microservices for claims/evidence/stories/verification, and a PostgreSQL-backed audit trail. Deployed as a Next.js static export on Cloudflare Pages.

## Commands

```bash
# Development
make dev             # Run all services in parallel (pnpm -r --parallel dev)
make dev-minimal     # Gateway only (cd services/gateway && pnpm dev)

# Infrastructure
make up              # docker-compose -f infra/docker-compose.yml up -d (PostgreSQL)
make down            # Tear down + remove volumes
make migrate         # Run migrations via tools/migrate.sh

# Quality
make lint            # Lint OpenAPI contracts (npx @redocly/cli lint contracts/openapi/*.yaml)
make test            # Run conformance tests (node tools/conformance/run.mjs)
make reset           # down + up + migrate

# Individual service
cd services/<name> && pnpm dev
```

## Architecture

**Monorepo layout**:
```
services/
├── gateway/      # API gateway — routes all external traffic
├── claim/        # Claim submission and tracking service
├── evidence/     # Evidence attachment service
├── story/        # Story composition service
├── verify/       # Verification and audit service
apps/
└── public-web/   # Next.js 16 frontend (static export)
db/               # PostgreSQL migrations
contracts/
└── openapi/      # OpenAPI specs (source of truth — lint with Redocly)
infra/            # Docker Compose, infrastructure config
tools/
└── conformance/  # Conformance test runner
```

**Contract-first**: `contracts/openapi/*.yaml` are the canonical API definitions. Run `make lint` after editing them.

**Database**: PostgreSQL via Docker Compose locally. `POSTGRES_URI` env var required for migrations.

**Frontend** (`apps/public-web`): Next.js 16 with static export (`output: 'export'`). Deployed to Cloudflare Pages.

**Environment**: Set `PLATFORM_ID` and `POSTGRES_URI` before running make targets that need them.

## Deployment

Live at **https://the-actual-news.pages.dev** (Cloudflare Pages). Next.js static export; React aligned to v19 for CF Pages compatibility.

<!-- ORGANVM:AUTO:START -->
## System Context (auto-generated — do not edit)

**Organ:** ORGAN-III (Commerce) | **Tier:** standard | **Status:** CANDIDATE
**Org:** `unknown` | **Repo:** `the-actual-news`

### Edges
- **Produces** → `unknown`: unknown

### Siblings in Commerce
`classroom-rpg-aetheria`, `gamified-coach-interface`, `trade-perpetual-future`, `fetch-familiar-friends`, `sovereign-ecosystem--real-estate-luxury`, `public-record-data-scrapper`, `search-local--happy-hour`, `multi-camera--livestream--framework`, `universal-mail--automation`, `mirror-mirror`, `the-invisible-ledger`, `enterprise-plugin`, `virgil-training-overlay`, `tab-bookmark-manager`, `a-i-chat--exporter` ... and 11 more

### Governance
- Strictly unidirectional flow: I→II→III. No dependencies on Theory (I).

*Last synced: 2026-02-24T12:41:28Z*
<!-- ORGANVM:AUTO:END -->

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

**Organ:** ORGAN-III (Commerce) | **Tier:** standard | **Status:** PUBLIC_PROCESS
**Org:** `organvm-iii-ergon` | **Repo:** `the-actual-news`

### Edges
- **Produces** → `unspecified`: product
- **Produces** → `organvm-vi-koinonia/community-hub`: community_signal
- **Produces** → `organvm-vii-kerygma/social-automation`: distribution_signal

### Siblings in Commerce
`classroom-rpg-aetheria`, `gamified-coach-interface`, `trade-perpetual-future`, `fetch-familiar-friends`, `sovereign-ecosystem--real-estate-luxury`, `public-record-data-scrapper`, `search-local--happy-hour`, `multi-camera--livestream--framework`, `universal-mail--automation`, `mirror-mirror`, `the-invisible-ledger`, `enterprise-plugin`, `virgil-training-overlay`, `tab-bookmark-manager`, `a-i-chat--exporter` ... and 12 more

### Governance
- Strictly unidirectional flow: I→II→III. No dependencies on Theory (I).

*Last synced: 2026-03-08T20:11:34Z*

## Session Review Protocol

At the end of each session that produces or modifies files:
1. Run `organvm session review --latest` to get a session summary
2. Check for unimplemented plans: `organvm session plans --project .`
3. Export significant sessions: `organvm session export <id> --slug <slug>`
4. Run `organvm prompts distill --dry-run` to detect uncovered operational patterns

Transcripts are on-demand (never committed):
- `organvm session transcript <id>` — conversation summary
- `organvm session transcript <id> --unabridged` — full audit trail
- `organvm session prompts <id>` — human prompts only


## Active Directives

| Scope | Phase | Name | Description |
|-------|-------|------|-------------|
| system | any | prompting-standards | Prompting Standards |
| system | any | research-standards-bibliography | APPENDIX: Research Standards Bibliography |
| system | any | research-standards | METADOC: Architectural Typology & Research Standards |
| system | any | sop-ecosystem | METADOC: SOP Ecosystem — Taxonomy, Inventory & Coverage |
| system | any | autopoietic-systems-diagnostics | SOP: Autopoietic Systems Diagnostics (The Mirror of Eternity) |
| system | any | cicd-resilience-and-recovery | SOP: CI/CD Pipeline Resilience & Recovery |
| system | any | cross-agent-handoff | SOP: Cross-Agent Session Handoff |
| system | any | document-audit-feature-extraction | SOP: Document Audit & Feature Extraction |
| system | any | essay-publishing-and-distribution | SOP: Essay Publishing & Distribution |
| system | any | market-gap-analysis | SOP: Full-Breath Market-Gap Analysis & Defensive Parrying |
| system | any | pitch-deck-rollout | SOP: Pitch Deck Generation & Rollout |
| system | any | promotion-and-state-transitions | SOP: Promotion & State Transitions |
| system | any | repo-onboarding-and-habitat-creation | SOP: Repo Onboarding & Habitat Creation |
| system | any | research-to-implementation-pipeline | SOP: Research-to-Implementation Pipeline (The Gold Path) |
| system | any | security-and-accessibility-audit | SOP: Security & Accessibility Audit |
| system | any | session-self-critique | session-self-critique |
| system | any | source-evaluation-and-bibliography | SOP: Source Evaluation & Annotated Bibliography (The Refinery) |
| system | any | stranger-test-protocol | SOP: Stranger Test Protocol |
| system | any | strategic-foresight-and-futures | SOP: Strategic Foresight & Futures (The Telescope) |
| system | any | typological-hermeneutic-analysis | SOP: Typological & Hermeneutic Analysis (The Archaeology) |
| unknown | any | gpt-to-os | SOP_GPT_TO_OS.md |
| unknown | any | index | SOP_INDEX.md |
| unknown | any | obsidian-sync | SOP_OBSIDIAN_SYNC.md |

Linked skills: evaluation-to-growth


**Prompting (Anthropic)**: context 200K tokens, format: XML tags, thinking: extended thinking (budget_tokens)

<!-- ORGANVM:AUTO:END -->


## ⚡ Conductor OS Integration
This repository is a managed component of the ORGANVM meta-workspace.
- **Orchestration:** Use `conductor patch` for system status and work queue.
- **Lifecycle:** Follow the `FRAME -> SHAPE -> BUILD -> PROVE` workflow.
- **Governance:** Promotions are managed via `conductor wip promote`.
- **Intelligence:** Conductor MCP tools are available for routing and mission synthesis.

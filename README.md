# Records Watch

Face: public

[![CI](https://github.com/4444J99/the-actual-news/actions/workflows/ci.yml/badge.svg)](https://github.com/4444J99/the-actual-news/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-pending-lightgrey)](https://github.com/4444J99/the-actual-news)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/4444J99/the-actual-news/blob/main/LICENSE)
[![Organ III](https://img.shields.io/badge/Organ-III%20Ergon-F59E0B)](https://github.com/organvm-iii-ergon)
[![Status](https://img.shields.io/badge/status-active-brightgreen)](https://github.com/4444J99/the-actual-news)
[![TypeScript](https://img.shields.io/badge/lang-TypeScript-informational)](https://github.com/4444J99/the-actual-news)

**Verifiable civic record platform — news as a public service.**

Records Watch is a platform that rebuilds journalism as a public utility by making truthfulness and accountability the product and making attention economically irrelevant. Every published story ships with a machine-readable verification spine: atomic claims, content-addressed evidence graphs, and append-only correction history. Publication is gated by deterministic quality policies — not engagement metrics, not editorial discretion, not advertising revenue targets. If a story does not meet the evidence threshold defined in a versioned policy pack, it does not publish. Period.

This is not a news aggregator. It is not a fact-checking overlay. It is a full-stack platform that produces verifiable reporting artifacts — stories where every factual claim is traceable to primary evidence, where contradictions are structural objects rather than vibes, and where corrections are first-class immutable events with reason codes rather than quiet edits that vanish from the record.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [The Three-Layer Model](#the-three-layer-model)
- [Technical Architecture](#technical-architecture)
- [Database Design](#database-design)
- [The Publish Gate](#the-publish-gate)
- [Core Protocol Spec](#core-protocol-spec)
- [Conformance Test Suite](#conformance-test-suite)
- [Project Structure](#project-structure)
- [Installation and Quick Start](#installation-and-quick-start)
- [Environment Configuration](#environment-configuration)
- [API Reference](#api-reference)
- [Roadmap](#roadmap)
- [Cross-Organ Context](#cross-organ-context)
- [Design Principles](#design-principles)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

---

## Why This Exists

There was a time when news was the news. Before privatization and the attention economy, journalism operated as a public service without intentional bias — or at least, with structural incentives that did not actively reward bias. The advertising-funded, engagement-optimized model that replaced it has produced a media environment where outrage is more profitable than accuracy, where corrections are buried rather than celebrated, and where readers have no way to distinguish a well-sourced investigation from a thinly-sourced opinion piece dressed in the language of reporting.

Records Watch starts from a different premise: **what if the platform itself made truthfulness the product?** Not as a layer on top of existing media (fact-checking is reactive and always too late), but as the native architecture of how stories are composed, verified, published, and corrected.

The core insight is that bias disputes become tractable when they are about specific, inspectable objects. Instead of arguing about whether a publication is "biased," readers, verifiers, and publishers all operate on the same structured objects: claims with time bounds and confidence scores, evidence with provenance chains, and edges that link one to the other with typed relations and strength values. Disagreement moves from the realm of vibes into the realm of data.

The economic model follows from the architecture: if the platform's value is the verification spine (not the narrative), then funding can be decoupled from attention. Membership, bounties, and quality-weighted compensation replace advertising. Revenue accrues from the reliability of the record, not from how many people clicked.

---

## The Three-Layer Model

Every story on Records Watch ships with three publicly accessible layers:

### Layer A: Narrative

The human-readable piece, written for comprehension. This is what readers see first — a well-crafted story that communicates what happened, why it matters, and what remains uncertain. The narrative is authored by journalists and stored as immutable story versions (Markdown snapshots). Once published, a version cannot be altered; changes produce a new version.

### Layer B: Claims Ledger

A machine-readable set of atomic claims extracted from the narrative. Each claim is typed (`factual`, `statistical`, `attribution`, or `interpretation`), carries time bounds, jurisdiction scope, entity references, and two confidence scores — one from the extraction model (`confidence_model`) and one from human review (`confidence_review`). Claims have a support status that progresses through a lifecycle: `unsupported` at extraction, `partially_supported` as evidence accumulates, `supported` when sufficient primary evidence exists, or `contradicted` when evidence refutes the claim.

### Layer C: Evidence Graph

A directed graph linking claims to primary evidence objects. Evidence is content-addressed using `sha256` hashes, ensuring tamper-evidence — if anyone modifies the underlying document, the hash breaks. Each evidence object carries full provenance metadata: source class (primary record, primary media, primary dataset, secondary, commentary, or unknown), publisher, URL, collection timestamp, license, and a provenance chain for derived artifacts. The edges connecting claims to evidence are typed (`supports`, `contradicts`, or `context`) and carry a strength value between 0 and 1.

This three-layer model turns "is this article trustworthy?" into a question with a structured, inspectable answer.

---

## Technical Architecture

The platform is a TypeScript monorepo managed with pnpm workspaces, organized into five backend microservices, a Next.js frontend application, and a shared contracts layer.

```
┌──────────────────────────────────────────────────────────────┐
│                     User Surfaces                            │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────┐    │
│  │  Reader   │    │   Verifier   │    │   Publisher      │    │
│  │  (Web)    │    │   (Web)      │    │   (Web)          │    │
│  └────┬──────┘    └──────┬───────┘    └───────┬──────────┘    │
│       │                  │                    │               │
└───────┼──────────────────┼────────────────────┼───────────────┘
        │                  │                    │
        ▼                  ▼                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Gateway    │   │    Verify    │   │    Story     │
│  BFF :8080   │   │    :8084     │   │    :8081     │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                   │
       ├──────────────────┼───────────────────┤
       │                  │                   │
       ▼                  ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│    Claim     │   │   Evidence   │   │  PostgreSQL  │
│    :8082     │   │    :8083     │   │    :5432     │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Services

| Service | Port | Responsibility |
|---------|------|----------------|
| **Gateway** | 8080 | Public-facing BFF (Backend for Frontend). Serves the feed, individual story bundles, and the publish endpoint. Implements the full publish gate algorithm in a single transactional SQL query. |
| **Story** | 8081 | Story CRUD operations — create, update, version management. Handles the draft/review/published state machine. |
| **Claim** | 8082 | Claim extraction from narrative text. Interfaces with the model gateway for automated claim identification. |
| **Evidence** | 8083 | Evidence object registration. Computes content hashes, validates provenance metadata, and stores content-addressed objects. |
| **Verify** | 8084 | Verification task management. Generates review tasks for evidence gaps, collects structured verdicts from reviewers. |

### Frontend Application

The `apps/public-web/` directory contains a Next.js application providing three user-facing surfaces:

- **Reader** (`/`) — Public product homepage, story feed, audience capture, membership/sponsor calls to action, and a quality-ranked ledger rather than an engagement-ranked feed.
- **Verifier** (`/verify`) — Internal claim review queues, evidence gap alerts, and structured review submission forms. This workspace is disabled by default in the public container.
- **Story Detail** (`/story/[story_id]`) — Full story bundle display with claims, evidence edges, and corrections timeline.
- **Distribution Kit** (`/distribution`) — Public share copy, atom share packets, offer packets, conversion steps, feeds, conversion routes, and boundary notes for launch distribution.
- **Public Principles** (`/principles`) — Reader-facing editorial firewall, funding boundary, and public/internal separation.
- **Launch Status** (`/launch`, `/launch.json`, `/share-kit.json`) — Public-safe readiness ledger and machine-readable sharing packet for audience, revenue, analytics, growth capabilities, share packets, offer packets, conversion steps, distribution routes, and deployment-boundary setup.

### Productized Public Surface

Docker is not required for the public website. The required local launch path is:

```bash
pnpm launch:local
```

After deployment, verify the live public origin with:

```bash
PUBLIC_ENV_FILE=.env.public PUBLIC_WEB_BASE_URL=https://recordswatch.org pnpm launch:deployed
```

The public app can also be packaged separately from internal services when Docker is useful:

```bash
make up-public
```

Reader-safe configuration lives in `.env.public.example` and uses `NEXT_PUBLIC_*` values only. Internal service configuration lives in `.env.internal.example` and should be supplied from a secret manager in real deployments.

The public revenue and audience loops are configured by URL, not by browser-side credentials:

- `NEXT_PUBLIC_NEWSLETTER_URL`
- `NEXT_PUBLIC_MEMBERSHIP_URL`
- `NEXT_PUBLIC_SPONSOR_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_ANALYTICS_DOMAIN`

Public CTAs and atom-share links emit keyless, Plausible-compatible browser events when `NEXT_PUBLIC_ANALYTICS_DOMAIN` is configured. The default domain is the public site host; provider-side analytics setup remains external and must not put API keys in the public app. `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` must remain the CSP-allowed Plausible browser script URL.

`/launch.json` exposes the same public-safe launch state for POSSE/distribution automation: ready counts, growth capability flags, public routes, feeds, atom share packets, public offer packets, conversion steps, conversion route status, public event names, and internal-boundary warnings. `/share-kit.json` exposes the narrower public sharing packet: launch copy, tracked public routes, atoms, social-card paths, share packets, public offers, conversion steps, and internal-boundary warnings. Neither route may include credentials, internal hostnames, reviewer queues, or user data.

`/launch` is the human operator index for those artifacts. It links to `/launch.json`, `/share-kit.json`, `/distribution`, and feed endpoints while showing only public readiness status and boundary guidance.

`/distribution` includes copy-ready controls for launch copy, public route URLs, atom URLs, atom text, and offer packets so social posts, newsletters, and partner handoffs do not require scraping rendered pages.

Every public clip and story page also carries its own share panel: X, LinkedIn, email, social-card, copy URL, and copy text controls.

`/principles` is the public trust page for the editorial firewall, funding boundary, correction visibility, and internal systems boundary.

`/site.webmanifest` and `/icon.svg` provide branded install/bookmark metadata, public shortcuts, and share-target metadata without adding private configuration.

Stable public conversion routes live at `/go/briefing`, `/go/membership`, and `/go/sponsor`. They preserve UTM parameters, redirect to hosted provider URLs when configured, and fall back to the matching public offer page while providers are pending.

Set the provider env URLs to hosted signup, checkout, membership, or intake destinations; do not point them back to `/go/*`, `/briefing`, `/membership`, `/sponsor`, `/api/*`, or `/v1/*` on the public app.

The public web app also serves a reader-safe same-origin API at `/v1/feed` and `/v1/story/:story_id`, so an initial public launch can use the web origin as `NEXT_PUBLIC_PUBLIC_API_URI` before a separate gateway is deployed.

The public smoke gate also verifies response hardening headers and scans launch-critical responses for credential-like values or internal configuration names.

The conversion boundary gate verifies that same-origin fake provider URLs stay pending, hosted provider URLs mark launch health ready, and `/go/*` redirects preserve UTM attribution.

`pnpm launch:report` writes `docs/public-launch-report.md`, a current public launch handoff covering blockers, public routes, audience/revenue links, and internal-only values.

See `docs/deployment-boundaries.md` for the public/internal split.
See `docs/public-launch-checklist.md` for the public launch gate and revenue/audience readiness checks.

Generate the public-only launch env template with:

```bash
pnpm public-env:template > .env.public
pnpm launch:local
pnpm launch:report
PUBLIC_ENV_FILE=.env.public PUBLIC_WEB_BASE_URL=https://recordswatch.org pnpm launch:deployed
```

The `.github/workflows/public-launch.yml` workflow runs the required public launch gates and database-backed conformance checks on pull requests and pushes. It also has a non-blocking container build job for packaging validation.
The workflow uploads public launch report artifacts for both the default example env and the strict generated public env template.

### Event-Driven Pipeline

State changes flow through a PostgreSQL-backed event outbox pattern:

1. **Ingest** — Evidence objects registered with content hashing (`sha256`)
2. **Extract** — Claims auto-extracted from narrative by model gateway
3. **Verify** — Tasks assigned to reviewers, structured verdicts collected
4. **Gate** — Policy-based publish gate evaluation (deterministic)
5. **Publish** — Story state updated + `story.published.v1` event emitted to outbox
6. **Correct** — Append-only corrections to the ledger (never delete, only add context)

---

## Database Design

The PostgreSQL schema consists of 10 domain tables plus an event outbox, organized around the verification spine:

```sql
-- Identity
actors              -- Platform participants with roles
coi_disclosures     -- Conflict-of-interest declarations with validity windows

-- Content
stories             -- Topic containers with draft/review/published state
story_versions      -- Immutable narrative snapshots (Markdown)

-- Evidence
evidence_objects    -- Content-addressed objects with provenance (sha256 hashes)

-- Claims
claims              -- Typed atomic statements with support status and confidence
claim_evidence_edges -- Directed relations (claim → evidence) with strength

-- Verification
verification_tasks  -- Review assignments for evidence gaps
reviews             -- Structured verdicts with evidence edges

-- Corrections
corrections         -- Append-only events referencing existing claims

-- Events
event_outbox        -- Reliable event emission for publish events
```

Migrations are applied sequentially via `tools/migrate.sh`:

| Migration | Purpose |
|-----------|---------|
| `001_init.sql` | Core schema — all 10 domain tables with foreign key constraints |
| `002_outbox.sql` | Event outbox table for reliable event emission |
| `003_indexes.sql` | Performance indexes for feed queries and gate computation |

All objects are scoped by `platform_id`, enabling multi-tenant deployment from the same schema. Foreign key constraints enforce referential integrity: claims reference story versions, edges reference both claims and evidence objects, corrections reference existing claims.

---

## The Publish Gate

The publish gate is the platform's most important mechanism. It is a deterministic algorithm that evaluates whether a story meets quality thresholds before it can reach `published` state. The gate is implemented as a single transactional SQL query in the gateway service, ensuring atomicity — either the story publishes and the event emits, or the entire operation rolls back.

### Gate Metrics

For a given `(story_id, story_version_id)`, the gate computes:

| Metric | Formula | Purpose |
|--------|---------|---------|
| `primary_evidence_ratio` | primary-supported claims / total claims | Ensures sufficient primary sourcing |
| `unsupported_claim_share` | unsupported claims / total claims | Limits unverified assertions |
| `contradicted_claims` | count of contradicted claims | Hard-blocks contradicted content |
| `corroboration_ok` | all high-impact claims independently corroborated | Requires multiple sources for serious claims |

### Gate Decision

A story publishes if and only if **all** conditions hold:

```
total_claims > 0
AND contradicted_claims <= max_contradicted_claims (default: 0)
AND primary_evidence_ratio >= min_primary_evidence_ratio (default: 0.50)
AND unsupported_claim_share <= max_unsupported_claim_share (default: 0.10)
AND (require_high_impact_corroboration = false OR corroboration_ok = true)
```

### High-Impact Detection

Claims are flagged as high-impact when they are `statistical` type or when their text matches patterns indicating serious allegations (accusations, fraud, crime, arrests, terrorism, abuse) or significant quantities (dollar amounts, millions, billions, percentages). High-impact claims require corroboration from at least two independent sources, where independence is determined by the `independence_key` algorithm that deduplicates by source, publisher, URL, or blob URI.

### Transactional Safety

The publish operation follows a strict protocol:

1. Lock the story row with `SELECT ... FOR UPDATE` scoped by platform
2. Compute all gate metrics within the same transaction
3. If gate fails, roll back and return metrics explaining why
4. If gate passes, update story state to `published` and append a `story.published.v1` event to the outbox — all in the same transaction
5. Release the lock

This ensures that no story can publish without meeting the evidence threshold, and that the publish event is guaranteed to emit if and only if the state change commits.

---

## Core Protocol Spec

The project includes a full RFC-style protocol specification (`specs/protocol/core-protocol-spec-v1.md`) that defines the minimum interoperable core for a verifiable news ledger system. The spec is normative — implementations may vary internally but must satisfy conformance tests and invariants to claim compliance.

### Ten Invariants

The protocol enforces ten invariants that form the project's constitution:

1. **I1:** Published story versions are immutable
2. **I2:** Evidence objects are immutable and content-addressed
3. **I3:** Corrections are append-only (history is never erased)
4. **I4:** Claim text is stable once published (changes require supersession)
5. **I5:** Publication gating is deterministic for a given ledger state
6. **I6:** Conformance tests pass independent of ingestion ordering
7. **I7:** All objects share the same platform scope
8. **I8:** Claims reference exactly one story version
9. **I9:** Evidence edges reference existing objects (no dangling refs)
10. **I10:** Corrections reference existing claims

### Canonical Schemas

The spec defines JSON schemas for all core objects: `Story`, `StoryVersion`, `Claim`, `EvidenceObject`, `Edge`, `CorrectionEvent`, `PolicyPack`, and a required event envelope. These schemas are the source of truth; the OpenAPI contracts in `contracts/openapi/` are derived from them.

### Policy Packs

All operational thresholds are externalized into versioned policy packs rather than hardcoded. The default policy pack (`v1.0.0`) ships with:

```json
{
  "publish_gates": {
    "min_primary_evidence_ratio": 0.50,
    "max_unsupported_claim_share": 0.10,
    "max_contradicted_claims": 0,
    "require_high_impact_corroboration": true,
    "high_impact_min_independent_sources": 2
  }
}
```

Policy packs are versioned, and the active pack version is recorded in publish events for full auditability. Different deployments (local civic newsroom vs. national investigative platform) can tune thresholds without modifying code.

---

## Conformance Test Suite

The platform ships with seven conformance tests (`CT-01` through `CT-07`) that validate publish gate behavior against the Core Protocol Spec. These tests use JSON fixtures loaded against the gate algorithm, and a conforming implementation must pass all seven.

| Test | Scenario | Expected |
|------|----------|----------|
| **CT-01** | Minimal publish — 2 claims, both primary-supported, no high-impact | `pass = true` |
| **CT-02** | Third claim is unsupported — unsupported share exceeds 10% | `pass = false` |
| **CT-03A** | Primary evidence ratio at exactly 0.50 — boundary condition | `pass = true` |
| **CT-03B** | Primary evidence ratio below 0.60 threshold — stricter policy | `pass = false` |
| **CT-04** | High-impact statistical claim with two independent sources | `pass = true` (corroboration ok) |
| **CT-05** | Same claim, but both sources share independence key | `pass = false` (corroboration fails) |
| **CT-06** | Contradicted claim present — hard fail regardless of other metrics | `pass = false` |
| **CT-07** | Missing provenance source_class — treated conservatively as non-primary | Gate fails if ratio depends on it |

Run the conformance suite:

```bash
pnpm conformance:doctor
bash tools/migrate.sh
make test
# Or directly:
pnpm conformance:test
```

`pnpm conformance:doctor` verifies that `psql` is on `PATH` and `POSTGRES_URI` points at a reachable database before local migrations and DB-backed tests. The CI pipeline runs these tests against a live PostgreSQL 16 instance on every push and pull request.

---

## Project Structure

```
the-actual-news/
├── apps/
│   └── public-web/              # Next.js reader + verifier UI
│       ├── src/pages/           # Feed, story detail, verification views
│       ├── src/lib/             # API client, environment config
│       └── next.config.js
├── contracts/
│   ├── events/                  # Event envelope and story.published schemas
│   ├── openapi/                 # OpenAPI 3.0 specs (gateway, story, claim, evidence, verify)
│   └── policy-packs/           # Versioned quality threshold configurations
│       └── v1.0.0.json
├── db/
│   └── migrations/             # Sequential PostgreSQL migrations (001-003)
├── docs/
│   ├── architecture.md         # Platform design and service topology
│   ├── design/                 # Original design provenance document
│   ├── glossary.md             # Protocol terminology reference
│   └── roadmap.md              # 10-phase program plan
├── infra/
│   ├── docker-compose.yml      # Local development infrastructure
│   └── postgres/init.sql       # Database initialization
├── memory/
│   └── constitution.md         # 10 invariants + design principles
├── services/
│   ├── gateway/                # Public BFF — feed, story bundles, publish gate
│   ├── story/                  # Story CRUD and state machine
│   ├── claim/                  # Claim extraction service
│   ├── evidence/               # Evidence registration with content hashing
│   └── verify/                 # Verification task management
├── specs/
│   ├── protocol/               # Core Protocol Spec v1 (RFC-style)
│   └── verifiable-news-platform/ # Feature spec, plan, and task breakdown
├── tools/
│   ├── conformance/            # CT-01..CT-07 test fixtures and runner
│   ├── gen-ulid.ts             # ULID generator utility
│   └── migrate.sh              # Migration runner script
├── .env.example                # Environment variable template
├── Makefile                    # Development commands (up, migrate, test, dev)
├── package.json                # Root monorepo config
└── pnpm-workspace.yaml         # Workspace configuration
```

---

## Installation and Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- Optional: **Docker** and **Docker Compose** if you want local containerized PostgreSQL or to reproduce image packaging checks. Docker is not required for the public website launch gate.

### Setup

```bash
# Clone the repository
git clone https://github.com/4444J99/the-actual-news.git
cd the-actual-news

# Install dependencies across all workspaces
pnpm install

# Copy environment template and configure
cp .env.example .env
# Edit .env if needed (defaults work for local development)

# Optional: start Docker-managed infrastructure (PostgreSQL), or use any hosted/local Postgres and set POSTGRES_URI
make up

# Apply database migrations after POSTGRES_URI points at a reachable database
make migrate

# Run conformance tests to verify setup
make test

# Start the gateway service only
make dev-minimal

# Or start the full stack (all services + web app)
make dev
```

### Verification

After `make dev-minimal`, the gateway health endpoint should respond:

```bash
curl http://localhost:8080/v1/health
# {"ok":true,"platform_id":"plf_local_01"}
```

The feed endpoint (empty initially):

```bash
curl http://localhost:8080/v1/feed?scope=local
# {"scope":"local","items":[]}
```

### Public Activation

Live URL: <https://the-actual-news-public.ivixivi.workers.dev>

> **Current state (2026-11-20): the live URL is dead.** It returns 404 on
> every route because no worker is deployed there yet. Deployment is gated on
> a Cloudflare deploy credential (Anthony's provisioning) — see
> `docs/activation-ledger.md` for the full activation record, including the
> three open revenue-provider decisions.

Prove the worker locally in one step — build it, preview it, and run the
public smoke gate against the preview origin:

```bash
pnpm cloudflare:build
pnpm cloudflare:preview   # serves the worker at http://127.0.0.1:8787
PUBLIC_WEB_BASE_URL=http://127.0.0.1:8787 pnpm smoke:public
# expected: 34/34 checks [OK], ending with
# "Public web smoke checks passed for http://127.0.0.1:8787"
```

The local launch gate (`pnpm launch:local`) is the pre-deployment check: 58
service tests plus the public-app and conversion smokes. After a real deploy,
prove the live origin with `pnpm cloudflare:smoke` (currently 0/51 — every route 404 — the
live URL serves nothing) or `pnpm launch:deployed`.

### Available Make Targets

| Target | Description |
|--------|-------------|
| `make up` | Optional: start Docker infrastructure (PostgreSQL) |
| `make down` | Stop and remove Docker volumes |
| `make migrate` | Apply database migrations |
| `make reset` | Full reset: down + up + migrate |
| `make lint` | Lint OpenAPI contracts with Redocly CLI |
| `make test` | Run conformance test suite (CT-01..CT-07) |
| `make dev` | Start all services in parallel |
| `make dev-minimal` | Start gateway service only |

---

## Environment Configuration

The platform is configured entirely through environment variables. The `.env.example` file provides local development defaults:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLATFORM_ID` | `plf_local_01` | Deployment namespace — all objects scoped to this ID |
| `POSTGRES_URI` | `postgres://news:news@localhost:5432/news_ledger` | PostgreSQL connection string |
| `EVIDENCE_BLOB_STORE_URI` | `s3://evidence` | Object storage for evidence blobs |
| `MODEL_GATEWAY_URI` | `http://localhost:8099` | AI model gateway for claim extraction |
| `PUBLIC_APP_URI` | `http://localhost:3000` | Public web application URL |
| `PUBLIC_API_URI` | `http://localhost:8080` | Public API URL |
| `GATEWAY_PORT` through `VERIFY_PORT` | 8080–8084 | Service port assignments |
| `MIN_PRIMARY_EVIDENCE_RATIO` | `0.50` | Publish gate threshold |
| `HIGH_IMPACT_CORROBORATION_REQUIRED` | `true` | Require independent corroboration for serious claims |
| `MIN_REVIEWER_QUORUM` | `2` | Minimum reviewers for verification tasks |

---

## API Reference

The gateway exposes a RESTful API documented in OpenAPI 3.0 specs (`contracts/openapi/`).

### `GET /v1/health`

Health check. Returns platform ID and status.

### `GET /v1/feed`

Returns a quality-ranked feed of stories.

**Parameters:**
- `scope` (query, optional): `local | regional | national | global` (default: `local`)
- `limit` (query, optional): 1–200 (default: 50)
- `state` (query, optional): `draft | review | published`

**Response:** Array of story items with `story_id`, `title`, `state`, `updated_at`.

### `GET /v1/story/:story_id`

Returns a full story bundle: story with all versions, claims, evidence edges, and corrections.

**Response:** `{ story, claims, evidence_edges, corrections }`

### `POST /v1/story/:story_id/publish`

Attempts to publish a story version through the quality gate.

**Body:** `{ story_version_id?: string }` (defaults to latest version)

**Success (200):** Story published with gate metrics.

**Failure (409):** Gate failed — response includes `thresholds` and `metrics` explaining exactly which conditions were not met.

Additional service-specific APIs (story CRUD, claim extraction, evidence registration, verification tasks) are documented in their respective OpenAPI specs under `contracts/openapi/`.

---

## Roadmap

The project follows a 10-phase roadmap from prototype to archival permanence, with the north star metric of **verified-information-throughput** — verified claim throughput per unit cost, with corrections as a first-class improvement signal.

| Phase | Focus | Done Gate |
|-------|-------|-----------|
| **0: Foundations** | Contracts, ledger discipline, local run | OpenAPI mocks pass, gateway integration tests pass |
| **1: MVP Local Civic Beat** | Complete loop: ingest → verify → publish → correct | End-to-end story with primary evidence + one correction |
| **2: Trust Engine** | Verification spine becomes the product | Reader traverses narrative → claim → evidence → corrections |
| **3: Operations and Safety** | Production posture: auth, rate limits, tamper-evidence | Repeatable deploy from empty infra, audit logs queryable |
| **4: Economics Without Clicks** | Funding decoupled from attention | Story funded as bounty, deterministic payout independent of views |
| **5: Federation** | Multi-node, shared protocols | Two deployments exchange bundles with verifiable consistency |
| **6: Public Institution Interface** | Libraries, cities, schools | Institution runs platform under own governance |
| **7: Scale and Specialization** | Investigations, datasets, media provenance | Investigation with reproducible dataset slices |
| **8: Governance Hardening** | Cooperative/endowment readiness | Stewardship changes hands without breaking trust |
| **9: Back Again** | Archival permanence, exit strategy | Third party reconstructs full archive from exports |

Current status: **Phase 0** (Foundations) — contracts frozen, database schema stable, gateway operational, conformance tests passing.

---

## Cross-Organ Context

Records Watch is part of **ORGAN-III (Ergon)** — the Commerce organ of the [organvm](https://github.com/organvm-iii-ergon) system. ORGAN-III houses products, platforms, and tools that generate value through direct utility.

### Upstream Dependencies

- **ORGAN-I (Theoria)** — Epistemological and ontological foundations. The verification spine's three-layer model (narrative, claims, evidence) draws on ORGAN-I's work on recursive knowledge structures and truth-claim formalization. The [`recursive-engine`](https://github.com/organvm-i-theoria/recursive-engine--generative-entity) project's approach to self-referential systems informs how claims can reference and supersede each other.

### Lateral Connections

- **ORGAN-IV (Taxis)** — The orchestration organ governs cross-organ routing and governance. Records Watch's policy-as-code approach (versioned policy packs, deterministic gating) aligns with ORGAN-IV's governance model. The [`agentic-titan`](https://github.com/organvm-iv-taxis/agentic-titan) project explores similar patterns of structured decision-making under constraints.

### Downstream Surfaces

- **ORGAN-V (Logos)** — Public process essays may reference Records Watch as a case study in building verification-first infrastructure.
- **ORGAN-VII (Kerygma)** — Distribution and announcement of platform milestones through the POSSE network.

---

## Design Principles

Five principles govern all design decisions in this project:

1. **Truth over traffic.** Revenue and ranking are decoupled from engagement metrics. The platform's value comes from the reliability of its record, not from how many people clicked.

2. **Inspectable disagreement.** Disputes are about specific claims and evidence edges, not vibes. When two people disagree about a story, they can point to a specific claim node and its evidence graph rather than arguing about whether the publication is "biased."

3. **Separation of powers.** Editorial (story composition), Verification (claim review), and Distribution (publication and feed ranking) are separate roles with separate interfaces. No single actor controls the full pipeline.

4. **Corrections are first-class.** Not quiet edits. Not "updates." Corrections are immutable events with reason codes, appended to the ledger. The original claim remains readable with correction context. History is never erased.

5. **Policy-as-code.** All quality thresholds are externalized into versioned policy packs. Different deployments (a local civic newsroom, a national investigative platform, a university teaching lab) can tune thresholds to their needs without modifying source code. The active policy pack version is recorded in every publish event for full auditability.

---

## CI/CD

The CI pipeline runs three jobs on every push to `main` and every pull request:

| Job | What It Does |
|-----|-------------|
| **lint-contracts** | Validates all OpenAPI specs in `contracts/openapi/` with Redocly CLI |
| **typecheck** | Runs TypeScript strict-mode type checking across all workspaces |
| **conformance** | Spins up PostgreSQL 16, applies migrations, runs CT-01..CT-07 against live database |

---

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for contribution guidelines, code of conduct reference, and pull request process.

The project follows the Core Protocol Spec's invariants as hard constraints. Contributions that violate any of the ten invariants (I1–I10) will not be accepted regardless of other merits. The conformance test suite (CT-01..CT-07) must pass on all pull requests.

---

## License

[AGPL-3.0](LICENSE) — Because the public record should remain public.

The AGPL license ensures that any deployment of Records Watch must share its source code, including modifications. This is a deliberate choice: a platform whose value proposition is transparency and verifiability should itself be transparent and verifiable. Network use triggers the same obligations as distribution.

---

## Author

**[@4444j99](https://github.com/4444j99)**

Part of the [ORGAN-III: Ergon](https://github.com/organvm-iii-ergon) organization within the eight-organ [organvm](https://github.com/meta-organvm) system.

<!-- SYSTEM-NAV-START -->

---

<sub>[Case Study](https://4444j99.github.io/portfolio/projects/the-actual-news/) · [Portfolio](https://4444j99.github.io/portfolio/) · [System Directory](https://4444j99.github.io/portfolio/directory/) · [ORGAN III · Ergon](https://organvm-iii-ergon.github.io/) · Part of the <a href="https://4444j99.github.io/portfolio/directory/">ORGANVM eight-organ system</a></sub>

<!-- SYSTEM-NAV-END -->

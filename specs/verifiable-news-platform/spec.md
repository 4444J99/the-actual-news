# Verifiable News Platform — Feature Specification

**Status:** Draft
**Version:** 0.1.0

## Overview

A platform that publishes news stories with a verification spine: every narrative ships with machine-readable claims, evidence graphs, and correction history. Publication is gated by deterministic quality policies.

## User Stories

### US-01 (P1): Reader views story with verification spine
**As a** reader, **I want to** view a story alongside its claims, evidence, and corrections, **so that** I can inspect the basis for reported facts.

**Acceptance Criteria:**
- Story page displays narrative text from latest version
- Claims are listed with type and support status
- Evidence edges show linked evidence per claim
- Corrections timeline is visible when corrections exist

### US-02 (P1): Reader browses quality-ranked feed
**As a** reader, **I want to** browse stories ranked by quality signals, **so that** I see verified content rather than engagement-optimized content.

**Acceptance Criteria:**
- Feed page lists published stories ordered by `updated_at`
- Each item shows title, state, and last update date
- Feed is scoped by locality (local/regional/national/global)

### US-03 (P1): Verifier reviews claims and submits verdicts
**As a** verifier, **I want to** review open verification tasks and submit structured verdicts, **so that** claims reach verified status through independent review.

**Acceptance Criteria:**
- Task queue shows open tasks with claim and story context
- Review form accepts verdict (supports/contradicts/context_only/cannot_determine)
- Submitted reviews are persisted with actor ID and notes

### US-04 (P2): Publisher drafts with evidence-first editor
**As a** publisher, **I want to** attach evidence before drafting narrative, **so that** the system can auto-extract claims and flag unsupported statements.

**Acceptance Criteria:**
- Evidence upload with content hashing and provenance metadata
- Claim extraction via model gateway
- Unsupported claim warnings before publish attempt

### US-05 (P2): Publisher publishes with quality gates
**As a** publisher, **I want to** publish a story only when quality gates pass, **so that** published content meets platform standards.

**Acceptance Criteria:**
- Publish gate evaluates: primary evidence ratio, unsupported claim share, contradicted claims, high-impact corroboration
- Gate is deterministic given policy pack version
- Failed gate returns metrics explaining why

### US-06 (P2): Third party queries public API
**As a** third-party developer, **I want to** query the public API for stories, claims, and evidence, **so that** I can build alternative front pages without changing the underlying record.

**Acceptance Criteria:**
- GET /v1/feed returns paginated story list
- GET /v1/story/:id returns full story bundle
- All responses follow OpenAPI contracts

### US-07 (P3): System detects claim contradictions
**As the** platform, **I want to** detect when claims contradict each other, **so that** verification tasks are automatically raised.

**Acceptance Criteria:**
- Contradicting claims on same entity+time-window trigger verification tasks
- Contradicted status blocks publication

### US-08 (P3): Corrections append to ledger
**As a** publisher, **I want to** issue corrections that append to the ledger, **so that** the public record reflects evolving understanding without erasing history.

**Acceptance Criteria:**
- Corrections reference specific claim IDs
- Corrections include reason codes
- Original claims remain readable with correction context

## Functional Requirements

- FR-01: Stories have draft/review/published state machine
- FR-02: Story versions are immutable snapshots
- FR-03: Claims are typed (factual/statistical/attribution/interpretation)
- FR-04: Evidence is content-addressed with provenance
- FR-05: Edges link claims to evidence with relation and strength
- FR-06: Verification tasks are generated for evidence gaps
- FR-07: Reviews persist verdicts with evidence edges
- FR-08: Corrections are append-only events
- FR-09: Publication requires policy gate pass
- FR-10: Event outbox ensures reliable event emission
- FR-11: All objects scoped by platform_id
- FR-12: Feed supports scope filtering and pagination

## Non-Functional Requirements

- NFR-01: Conformance tests CT-01 through CT-07 pass
- NFR-02: Migrations are idempotent
- NFR-03: Gateway responds to health check within 100ms
- NFR-04: All services deployable via Docker Compose

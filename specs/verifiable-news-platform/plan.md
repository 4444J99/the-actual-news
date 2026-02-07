# Verifiable News Platform — Technical Plan

**Status:** Draft
**Version:** 0.1.0

## Architecture

### Service Decomposition

| Service | Port | Responsibility |
|---------|------|---------------|
| Gateway | 8080 | Public BFF: feed, story bundle, publish |
| Story | 8081 | Story CRUD, versions |
| Claim | 8082 | Claim extraction, listing |
| Evidence | 8083 | Evidence upload, registration |
| Verify | 8084 | Verification tasks, reviews |

### Data Model

PostgreSQL with 10 tables:
- `actors` — platform members with roles
- `coi_disclosures` — conflict of interest records
- `stories` — topic containers with state
- `story_versions` — immutable narrative snapshots
- `evidence_objects` — content-addressed evidence
- `claims` — atomic verifiable statements
- `claim_evidence_edges` — claim-to-evidence relations
- `verification_tasks` — review assignments
- `reviews` — structured verdicts
- `corrections` — append-only corrections

Plus `event_outbox` for reliable event emission.

### Policy Packs

Publication gates are parameterized by versioned policy packs:
- `min_primary_evidence_ratio` — minimum fraction of claims with primary evidence
- `max_unsupported_claim_share` — maximum fraction of unsupported claims
- `max_contradicted_claims` — hard cap on contradicted claims (typically 0)
- `require_high_impact_corroboration` — whether high-impact claims need independent sources
- `high_impact_min_independent_sources` — minimum distinct sources for corroboration

### Technology Stack

- **Runtime:** Node.js + TypeScript (ES2022, strict)
- **HTTP:** Express
- **Database:** PostgreSQL 16
- **UI:** Next.js (Pages Router)
- **Package Manager:** pnpm workspaces
- **Contracts:** OpenAPI 3.0.3
- **Events:** CloudEvents-style envelope
- **Testing:** SQL-based conformance harness

## Implementation Strategy

1. Contracts-first: OpenAPI specs define all service interfaces
2. Prism mocks: UI development against mock servers
3. Gateway-first: Single service reads all tables initially
4. Incremental decomposition: Extract story/claim/evidence/verify as load requires

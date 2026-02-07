# Verifiable News Platform — Task List

**Status:** Draft
**Version:** 0.1.0

## Phase 0: Foundations

- [x] Initialize repository with AGPL-3.0, pnpm workspaces
- [x] Create OpenAPI contracts for all services
- [x] Create database migrations (001-003)
- [x] Set up Docker Compose with Postgres + Prism mocks
- [x] Implement gateway service (health, feed, story, publish)
- [x] Create service stubs (story, claim, evidence, verify)
- [x] Build conformance test suite (CT-01 through CT-07)
- [x] Create Next.js UI skeleton (feed, story, verify queue, review form)
- [x] Set up CI pipeline
- [x] Write protocol specification

## Phase 1: MVP Local Civic Beat (US-04, US-05)

- [ ] Implement evidence service (presign upload, register, content hashing)
- [ ] Implement claim extraction service (model gateway integration)
- [ ] Implement verification task creation (on claim extraction)
- [ ] Implement review persistence in verify service
- [ ] Wire publish gate to real service (not just gateway SQL)
- [ ] End-to-end test: ingest → extract → verify → publish → correct

## Phase 2: Trust Engine (US-01, US-07)

- [ ] Evidence graph UX in public-web (claim → evidence viewer)
- [ ] Contradiction detection (same entity + time window)
- [ ] COI registry integration and display
- [ ] Correction timeline diff view

## Phase 3: Operations and Safety (US-03, US-08)

- [ ] AuthN/AuthZ with role separation
- [ ] Rate limits and request signing
- [ ] Outbox-driven event emission
- [ ] Tamper-evidence guarantees
- [ ] Abuse controls for verification tasks

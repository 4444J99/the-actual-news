# Architecture

## Platform Design

The Actual News platform rebuilds news as a public service by making truthfulness and accountability the product, and making attention economically irrelevant.

### Core Idea: Publish Reports Plus a Verification Spine

Every story ships with three layers, all publicly accessible:

**Layer A: Narrative**
Human-readable piece, written for comprehension.

**Layer B: Claims Ledger**
Machine-readable set of atomic claims extracted from the narrative, each with scope, time bounds, and confidence.

**Layer C: Evidence Graph**
Links from each claim to primary evidence objects (documents, transcripts, datasets, raw media), plus counterevidence and known uncertainties.

### User-Facing Surfaces

| Surface | Purpose |
|---------|---------|
| Reader (`$PUBLIC_APP_URI`) | Story view with expandable verification spine |
| Verifier (`$VERIFIER_APP_URI`) | Claim queues, evidence gaps, review tasks |
| Publisher (`$NEWSROOM_APP_URI`) | Evidence-first editor with claim extraction |
| Public API (`$PUBLIC_API_URI`) | Queryable claims/evidence/corrections |

### Service Architecture

```
┌──────────┐    ┌──────────┐    ┌───────────┐
│  Reader  │    │ Verifier │    │ Publisher │
│   (Web)  │    │  (Web)   │    │   (Web)   │
└────┬─────┘    └────┬─────┘    └─────┬─────┘
     │               │                │
     └───────┬───────┘                │
             ▼                        ▼
      ┌─────────────┐         ┌─────────────┐
      │   Gateway   │         │    Story    │
      │  (BFF:8080) │         │   (:8081)   │
      └──────┬──────┘         └──────┬──────┘
             │                       │
     ┌───────┼───────┐              │
     ▼       ▼       ▼              ▼
┌────────┐┌───────┐┌────────┐ ┌──────────┐
│ Claim  ││ Evid. ││ Verify │ │ Postgres │
│(:8082) ││(:8083)││(:8084) │ │  (:5432) │
└────────┘└───────┘└────────┘ └──────────┘
```

### Event-Driven Pipeline

All state changes produce events via an outbox pattern:
1. **Ingest** — Evidence objects registered with content hashing
2. **Extract** — Claims auto-extracted from narrative by model
3. **Verify** — Tasks assigned, reviews collected
4. **Gate** — Policy-based publication decision
5. **Publish** — Story state updated + event emitted
6. **Correct** — Append-only corrections to the ledger

### Database Schema

10 tables + 1 outbox, organized around the verification spine:
- Identity: `actors`, `coi_disclosures`
- Content: `stories`, `story_versions`
- Evidence: `evidence_objects`
- Claims: `claims`, `claim_evidence_edges`
- Verification: `verification_tasks`, `reviews`
- Corrections: `corrections`
- Events: `event_outbox`

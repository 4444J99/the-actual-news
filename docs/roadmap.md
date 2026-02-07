# Roadmap

## North Star

**Metric:** Verified-information-throughput — verified claim throughput per unit cost, with corrections as a first-class improvement signal.

## Phases

### Phase 0: Foundations
Contracts, ledger discipline, local run. A running system that produces a Story Bundle and exposes it via the public API.

**Deliverables:** Frozen contracts, DB migrations, gateway service, minimal UI, Prism mocks.
**Done gate:** OpenAPI mocks pass, gateway passes integration tests, migrations idempotent.

### Phase 1: MVP Local Civic Beat
Complete loop for civic reporting: ingest → evidence → draft → extraction → verification → publish → corrections.

**Done gate:** A single story produced end-to-end with primary evidence per critical claim, plus one correction replayable from ledger.

### Phase 2: Trust Engine
Verification spine becomes the product. Evidence graph UX, contradiction detection, COI registry.

**Done gate:** Reader can traverse narrative → claim → evidence → reviewer notes → corrections without leaving the platform.

### Phase 3: Operations and Safety
Production-grade posture. AuthN/AuthZ, rate limits, outbox events, tamper-evidence, abuse controls.

**Done gate:** Deploy repeatable from empty infra, audit logs queryable, graceful degradation.

### Phase 4: Economics Without Clicks
Funding decoupled from attention. Membership ledger, bounties, quality-weighted compensation.

**Done gate:** Story funded as bounty, completed, verified, deterministic payout independent of views.

### Phase 5: Federation
Multiple nodes, shared protocols. Cross-node story bundles with provenance.

**Done gate:** Two independent deployments exchange published bundles with verifiable consistency.

### Phase 6: Public Institution Interface
Libraries, cities, schools. Offline bundles, curriculum packs, procurement packaging.

**Done gate:** Institution runs platform under own governance while interoperating with federation.

### Phase 7: Scale and Specialization
Investigations, datasets, media provenance. Multi-story arcs with shared evidence graphs.

**Done gate:** Investigation published with reproducible dataset slices and media clips linked to claims.

### Phase 8: Governance Hardening
Cooperative/endowment readiness. Legal separation, transparent governance, policy-as-code.

**Done gate:** Stewardship changes hands without breaking trust, data integrity, or federation.

### Phase 9: Back Again
Archival permanence, exit strategy. Immutable exports, cold storage readers, sunset plan.

**Done gate:** Third party reconstructs full archive from exported bundles and verifies integrity.

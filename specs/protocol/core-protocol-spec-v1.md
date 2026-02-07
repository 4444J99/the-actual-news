# `$CORE_PROTOCOL_SPEC_V1` — Core Protocol RFC (Draft)

`$RFC_ID = core-protocol-spec-v1`
`$PROTOCOL_FAMILY = news-ledger`
`$PROTOCOL_VERSION = v1`
`$POLICY_PACK_VERSION = $ENV($POLICY_PACK_VERSION)`
`$PLATFORM_ID = $ENV($PLATFORM_ID)`

This document defines the **minimum interoperable core** for a verifiable news ledger system: terminology, invariants, canonical schemas, normative algorithms, and conformance tests. All operational thresholds are specified via **Policy Packs**, not hardcoded constants.

* * *

## 0. Status, goals, non-goals

### 0.1 Status

This RFC is a normative draft. Implementations MAY deviate internally, but MUST satisfy conformance tests and invariants to claim compliance with `$PROTOCOL_VERSION=v1`.

### 0.2 Goals

A compliant implementation MUST:
A. Represent stories as immutable versions plus append-only correction events.
B. Represent claims as atomic, typed statements with time bounds.
C. Represent evidence as content-addressed objects with provenance.
D. Represent support relations as edges from claims to evidence.
E. Provide deterministic policy-gated publication.
F. Support replay from events to reconstruct public state.

### 0.3 Non-goals

This RFC does not specify: federation, economics, identity/auth, UI, or dispute governance mechanics beyond required data fields.

* * *

## 1. Terminology (normative)

`MUST`, `SHOULD`, `MAY` are as in RFC 2119.

### 1.1 Core identifiers

`$ULID`
A 26-char ULID string. Used for all mutable-entity identifiers.

`$EVIDENCE_ID_HASH`
A content hash identifier, `sha256:<hex>`. Used to identify evidence immutably.

`$PLATFORM_ID`
Deployment namespace boundary. All public objects MUST be scoped to a single platform.

### 1.2 Objects

`$STORY`
A topic container with publication state and metadata.

`$STORY_VERSION`
An immutable narrative snapshot. A story MAY have many versions.

`$CLAIM`
An atomic, independently verifiable statement extracted from a story version.

`$EVIDENCE_OBJECT`
A content-addressed object (document/media/dataset) plus provenance.

`$EDGE`
A directed relation `(claim → evidence)` with a relation type and strength.

`$CORRECTION_EVENT`
An append-only event that supersedes/qualifies prior claims.

`$POLICY_PACK`
A versioned configuration that supplies thresholds and rule toggles.

* * *

## 2. Invariants (normative)

### 2.1 Immutability and append-only rules

I1. Published story versions MUST be immutable.
I2. Evidence objects MUST be immutable and identified by `$EVIDENCE_ID_HASH`.
I3. Corrections MUST be append-only events; they MUST NOT delete prior public history.
I4. A claim's text MUST remain stable once published; changes require a new claim ID (supersession).

### 2.2 Determinism

I5. Publication gating for a given `(story_id, story_version_id, policy_pack_version)` MUST be deterministic given the ledger state.
I6. Conformance tests MUST pass independent of local ordering of evidence ingestion, provided object hashes and ledger contents are identical.

### 2.3 Scope

I7. A story, its versions, claims, edges, and corrections MUST share the same `$PLATFORM_ID`.
I8. A claim MUST reference exactly one `story_version_id`.

### 2.4 Referencing constraints

I9. Evidence edges MUST reference existing `claim_id` and existing `evidence_id_hash`.
I10. Corrections MUST reference existing `claim_id` (or a list of claim IDs).

* * *

## 3. Canonical schemas (normative)

Schemas are defined as canonical JSON objects; storage MAY differ but MUST serialize equivalently.

### 3.1 `$POLICY_PACK`

`$POLICY_PACK` MUST be retrievable by `$POLICY_PACK_VERSION` and provide:

```json
{
  "policy_pack_version": "v1.0.0",
  "publish_gates": {
    "min_primary_evidence_ratio": 0.50,
    "max_unsupported_claim_share": 0.10,
    "max_contradicted_claims": 0,
    "require_high_impact_corroboration": true,
    "high_impact_min_independent_sources": 2
  },
  "evidence": {
    "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
    "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
  },
  "claim": {
    "high_impact_claim_types": ["statistical"],
    "high_impact_regexes": [
      "(accus|illegal|fraud|crime|charged|indict|lawsuit|killed|injur|shoot|arrest|explos|terror|abuse)",
      "(\\$|usd|million|billion|percent|%)"
    ]
  }
}
```

Implementations MUST treat absent fields conservatively (deny publication if a required comparator cannot be computed without them).

### 3.2 `$STORY`

```json
{
  "story_id": "01J...",
  "platform_id": "plf_...",
  "title": "string",
  "state": "draft|review|published",
  "created_at": "RFC3339",
  "updated_at": "RFC3339"
}
```

### 3.3 `$STORY_VERSION`

```json
{
  "story_version_id": "01J...",
  "story_id": "01J...",
  "body_markdown": "string",
  "disclosure_markdown": "string|null",
  "created_at": "RFC3339"
}
```

### 3.4 `$CLAIM`

```json
{
  "claim_id": "01J...",
  "story_id": "01J...",
  "story_version_id": "01J...",
  "claim_type": "factual|statistical|attribution|interpretation",
  "text": "string",
  "entities": ["string"],
  "time_window": { "start": "RFC3339|null", "end": "RFC3339|null" },
  "jurisdiction": "string|null",
  "support_status": "unsupported|partially_supported|supported|contradicted",
  "confidence_model": 0.0,
  "confidence_review": 0.0,
  "created_at": "RFC3339"
}
```

### 3.5 `$EVIDENCE_OBJECT`

Evidence MUST include `provenance.source_class` when feasible.

```json
{
  "evidence_id_hash": "sha256:...",
  "platform_id": "plf_...",
  "blob_uri": "string",
  "media_type": "string",
  "extracted_text": "string|null",
  "provenance": {
    "source_class": "primary_record|primary_media|primary_dataset|secondary|commentary|unknown",
    "source": "string|null",
    "publisher": "string|null",
    "url": "string|null",
    "collected_at": "RFC3339",
    "license": "string|null",
    "chain": ["string"]
  },
  "created_at": "RFC3339"
}
```

### 3.6 `$EDGE`

```json
{
  "edge_id": "01J...",
  "claim_id": "01J...",
  "evidence_id_hash": "sha256:...",
  "relation": "supports|contradicts|context",
  "strength": 0.0,
  "reviewer_actor_id": "01J...|null",
  "notes": "string|null",
  "created_at": "RFC3339"
}
```

### 3.7 `$CORRECTION_EVENT`

```json
{
  "correction_id": "01J...",
  "platform_id": "plf_...",
  "claim_id": "01J...",
  "reason": "string",
  "details": { "supersedes_claim_id": "01J...|null", "note": "string|null" },
  "created_at": "RFC3339"
}
```

### 3.8 Event envelope (required)

All events MUST use this envelope.

```json
{
  "event_id": "01J...",
  "platform_id": "plf_...",
  "type": "string",
  "time": "RFC3339",
  "specversion": "1.0",
  "trace_id": "string|null",
  "actor_id": "01J...|null",
  "data": {}
}
```

* * *

## 4. Normative algorithms

### 4.1 Evidence independence key

Given an evidence object `E` and policy pack `P`, compute:

`independence_key(E,P) = first_non_empty(E.provenance[field]) for field in P.evidence.independence_key_fields`

If none exist, use `E.blob_uri`. Implementations SHOULD normalize URLs/domains if present; conformance tests use exact string match.

### 4.2 Primary evidence classification

Evidence is primary iff:

`E.provenance.source_class ∈ P.evidence.primary_source_classes`

Absent `source_class` MUST be treated as non-primary.

### 4.3 High-impact claim detection

A claim `C` is high-impact iff:
A. `C.claim_type ∈ P.claim.high_impact_claim_types` OR
B. any regex in `P.claim.high_impact_regexes` matches `C.text` case-insensitively.

Regex evaluation MUST use a PCRE-like engine semantics; if unavailable, implementations MUST document equivalent behavior and MUST still pass conformance fixtures.

### 4.4 Publish gate metrics

For a given `(story_id, story_version_id)`:

Let `Claims = { C | C.story_id=story_id AND C.story_version_id=story_version_id }`

Let `Edges(C) = { e | e.claim_id=C.claim_id AND e.relation='supports' }`

Let `PrimarySupportedClaims = { C | ∃e∈Edges(C): Evidence(e).is_primary=true }`

Metrics:

`total_claims = |Claims|`
`unsupported_claims = |{C∈Claims | C.support_status='unsupported'}|`
`contradicted_claims = |{C∈Claims | C.support_status='contradicted'}|`
`primary_supported_claims = |PrimarySupportedClaims|`

`primary_evidence_ratio = primary_supported_claims / total_claims` (if `total_claims=0`, ratio = 0)

`unsupported_claim_share = unsupported_claims / total_claims` (if `total_claims=0`, share = 1)

High-impact corroboration:

For each high-impact claim `H`, compute:

`independent_support_sources(H) = |{ independence_key(E,P) | ∃e∈Edges(H): e.evidence_id_hash=E.hash }|`

`H` is corroborated iff `independent_support_sources(H) >= P.publish_gates.high_impact_min_independent_sources`

`corroboration_ok = true` if no high-impact claims exist, else all high-impact claims corroborated.

### 4.5 Publish gate decision

Given policy pack `P`:

`pass = (total_claims > 0)`
AND `(contradicted_claims <= P.publish_gates.max_contradicted_claims)`
AND `(primary_evidence_ratio >= P.publish_gates.min_primary_evidence_ratio)`
AND `(unsupported_claim_share <= P.publish_gates.max_unsupported_claim_share)`
AND `(P.publish_gates.require_high_impact_corroboration = false OR corroboration_ok = true)`

If any required field to compute `pass` is missing, implementations MUST set `pass=false`.

### 4.6 Transactional publication

To publish a story version, implementations MUST:
A. Lock the story row (`FOR UPDATE`) scoped by platform.
B. Compute metrics for the chosen version within the same transaction.
C. If gate fails, roll back with metrics.
D. If gate passes, set story state to `published` and append an event `story.published.v1` in an outbox within the same transaction.

* * *

## 5. Conformance tests (normative)

A conforming implementation MUST provide a test runner that loads fixtures, executes the gate algorithm, and matches expected outputs exactly.

### 5.1 Fixture format

Each fixture consists of:
A. `$POLICY_PACK` JSON
B. Ledger snapshot: arrays of `stories`, `story_versions`, `claims`, `evidence_objects`, `claim_evidence_edges`, `corrections`
C. Gate evaluation request: `{ platform_id, story_id, story_version_id }`
D. Expected result: metrics + pass boolean.

### 5.2 Required test cases

#### `CT-01` minimal publish passes

Policy:
`min_primary_evidence_ratio=0.50`, `max_unsupported_claim_share=0.10`, `require_high_impact_corroboration=true`, `high_impact_min_independent_sources=2`

Ledger:
One story version, `total_claims=2`.
Claim A supported by one primary evidence.
Claim B supported by one primary evidence.
No unsupported, no contradicted.
No high-impact claims.

Expected:
`primary_evidence_ratio=1.0`, `unsupported_claim_share=0.0`, `corroboration_ok=true`, `pass=true`.

#### `CT-02` fails unsupported claim share

Same as CT-01 but add a third claim with `support_status='unsupported'`.

Expected:
`unsupported_claim_share=1/3`, `pass=false`.

#### `CT-03` fails primary evidence ratio

Two claims, only one has primary support; other has no primary support.

Expected:
`primary_evidence_ratio=0.5` passes iff policy is `>=0.50`.
Provide two subcases:
A. threshold 0.50 → pass true if other gates satisfied
B. threshold 0.60 → pass false

#### `CT-04` high-impact corroboration required

One high-impact statistical claim supported by **two** evidence objects with distinct independence keys.

Expected:
`high_impact_claims=1`, `high_impact_corroborated=1`, `corroboration_ok=true`, `pass depends on other gates`.

#### `CT-05` high-impact corroboration fails

Same as CT-04 but both evidence objects share the same independence key.

Expected:
`high_impact_corroborated=0`, `corroboration_ok=false`, `pass=false` when requirement is true.

#### `CT-06` contradicted claims hard fail

Any claim in the version has `support_status='contradicted'`.

Expected:
`contradicted_claims>=1`, `pass=false` when `max_contradicted_claims=0`.

#### `CT-07` missing provenance treated conservatively

High-impact claim supported by evidence with missing `provenance.source_class`.

Expected:
Primary evidence ratio computed without counting that evidence as primary; gate likely fails if ratio depends on it.

### 5.3 Output normalization rules

Conformance outputs MUST normalize:
A. timestamps ignored unless explicitly asserted in fixture
B. ordering of lists irrelevant; counts and booleans matter
C. ratios compared as exact decimals in fixtures; implementations SHOULD compute in double precision and format with a deterministic rounding rule specified by the runner (e.g., 6 decimals).

* * *

## 6. Compliance statement

An implementation MAY claim compliance with `$CORE_PROTOCOL_SPEC_V1` only if:
A. It enforces invariants I1–I10,
B. It implements algorithms 4.1–4.6, and
C. It passes all required conformance tests CT-01..CT-07 under at least one policy pack version.

* * *

## Appendix A: Minimal SQL mapping guidance (non-normative)

A relational schema equivalent to this RFC includes tables: `stories`, `story_versions`, `claims`, `evidence_objects`, `claim_evidence_edges`, `corrections`, and `event_outbox`.

## Appendix B: Policy pack distribution (non-normative)

Policy packs SHOULD be versioned, signed, and deployed alongside releases; `$POLICY_PACK_VERSION` SHOULD be recorded in publish events.

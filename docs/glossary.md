# Glossary

Terms defined in the Core Protocol Spec v1, section 1 (Terminology).

## Core Identifiers

| Term | Definition |
|------|-----------|
| **ULID** | 26-character Universally Unique Lexicographically Sortable Identifier. Used for all mutable-entity IDs. |
| **Evidence ID Hash** | Content hash identifier (`sha256:<hex>`). Used to identify evidence immutably. |
| **Platform ID** | Deployment namespace boundary. All public objects are scoped to a single platform. |

## Objects

| Term | Definition |
|------|-----------|
| **Story** | A topic container with publication state and metadata. |
| **Story Version** | An immutable narrative snapshot. A story may have many versions. |
| **Claim** | An atomic, independently verifiable statement extracted from a story version. |
| **Evidence Object** | A content-addressed object (document/media/dataset) plus provenance. |
| **Edge** | A directed relation (claim → evidence) with a relation type and strength. |
| **Correction Event** | An append-only event that supersedes or qualifies prior claims. |
| **Policy Pack** | A versioned configuration that supplies thresholds and rule toggles. |

## Claim Types

| Type | Description |
|------|------------|
| **factual** | A statement of fact that can be verified against evidence. |
| **statistical** | A numeric or quantitative claim. |
| **attribution** | A statement attributed to a specific source. |
| **interpretation** | An analytical or opinion-based statement. |

## Support Statuses

| Status | Description |
|--------|------------|
| **unsupported** | No evidence linked to the claim. |
| **partially_supported** | Some evidence exists but is incomplete. |
| **supported** | Sufficient evidence confirms the claim. |
| **contradicted** | Evidence contradicts the claim. |

## Edge Relations

| Relation | Description |
|----------|------------|
| **supports** | Evidence supports the linked claim. |
| **contradicts** | Evidence contradicts the linked claim. |
| **context** | Evidence provides context but neither supports nor contradicts. |

## Publish Gate Metrics

| Metric | Description |
|--------|------------|
| **primary_evidence_ratio** | Fraction of claims backed by primary evidence. |
| **unsupported_claim_share** | Fraction of claims with no evidence. |
| **contradicted_claims** | Count of claims with contradicting evidence. |
| **corroboration_ok** | Whether all high-impact claims have independent corroboration. |

## RFC 2119 Keywords

`MUST`, `SHOULD`, `MAY` — used as defined in RFC 2119.

# Project Constitution

The Actual News platform operates under these 10 invariants, derived from the Core Protocol Spec v1.

## Invariants

1. **I1: Published story versions MUST be immutable.** Once a story version reaches `published` state, its content cannot be altered.

2. **I2: Evidence objects MUST be immutable and content-addressed.** Evidence is identified by `sha256:<hash>`, ensuring tamper-evidence.

3. **I3: Corrections MUST be append-only.** Corrections never delete prior history; they add context to the ledger.

4. **I4: Claim text MUST remain stable once published.** Changes require a new claim ID (supersession), preserving auditability.

5. **I5: Publication gating MUST be deterministic.** For a given `(story_id, story_version_id, policy_pack_version)`, the gate decision is reproducible.

6. **I6: Conformance tests MUST pass independent of ordering.** Evidence ingestion order does not affect gate outcomes given identical ledger state.

7. **I7: Platform scope MUST be enforced.** All objects (stories, claims, evidence, corrections) share the same `$PLATFORM_ID`.

8. **I8: Claims MUST reference exactly one story version.** Each claim belongs to a specific snapshot of the narrative.

9. **I9: Evidence edges MUST reference existing objects.** No dangling references in the claim-to-evidence graph.

10. **I10: Corrections MUST reference existing claims.** Every correction is anchored to verifiable prior state.

## Design Principles

- **Truth over traffic:** Revenue and ranking are decoupled from engagement metrics.
- **Inspectable disagreement:** Disputes are about specific claims and evidence, not vibes.
- **Separation of powers:** Editorial, Verification, and Distribution are separate roles.
- **Corrections are first-class:** Not "updates" — immutable events with reason codes.
- **Policy-as-code:** All thresholds are env-controlled and versioned as policy packs.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const POSTGRES_URI = process.env.POSTGRES_URI;
if (!POSTGRES_URI) {
  console.error("Missing $POSTGRES_URI");
  process.exit(2);
}

// Resolve from this file so `pnpm -r test` (cwd = tools/conformance) and
// `node tools/conformance/run.mjs` (cwd = repo root) both work.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES_DIR = path.join(ROOT, "tools", "conformance", "fixtures");
const SQL_DIR = path.join(ROOT, "tools", "conformance", "sql");
const SCHEMA_SQL = fs.readFileSync(path.join(SQL_DIR, "schema.sql"), "utf8");
const GATE_SQL = fs.readFileSync(path.join(SQL_DIR, "publish_gate.sql"), "utf8");
const PUBLISH_TXN_SQL = fs.readFileSync(path.join(SQL_DIR, "publish_txn.sql"), "utf8");

const FIXTURE_FILES = [
  "CT-01.json",
  "CT-02.json",
  "CT-03A.json",
  "CT-03B.json",
  "CT-04.json",
  "CT-05.json",
  "CT-06.json",
  "CT-07.json",
  "CT-08.json"
];

const BUNDLE_FIXTURE_DIR = path.join(ROOT, "fixtures", "civic-record-node");

function normalizeJson(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = normalizeJson(child);
    return out;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  return String(value);
}

function stringifyCanonical(value) {
  const normalized = normalizeJson(value);
  if (normalized === null) return "null";
  if (typeof normalized === "boolean") return normalized ? "true" : "false";
  if (typeof normalized === "number") return JSON.stringify(normalized);
  if (typeof normalized === "string") return JSON.stringify(normalized);
  if (Array.isArray(normalized)) {
    return `[${normalized.map((item) => stringifyCanonical(item)).join(",")}]`;
  }

  return `{${Object.entries(normalized)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stringifyCanonical(child)}`)
    .join(",")}}`;
}

function sha256Hex(value) {
  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function hashCanonical(value) {
  return sha256Hex(stringifyCanonical(value));
}

function merkleLeafHash(value) {
  return sha256Hex(`leaf:${stringifyCanonical(value)}`);
}

function merkleParentHash(left, right) {
  return sha256Hex(`node:${left}:${right}`);
}

function merkleRoot(leafHashes) {
  if (leafHashes.length === 0) return sha256Hex("empty:");
  let level = [...leafHashes];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(merkleParentHash(left, right));
    }
    level = next;
  }
  return level[0] ?? sha256Hex("empty:");
}

function schemaName() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `tmp_conformance_${t}_${r}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function round6(n) {
  if (n === null || n === undefined) return null;
  return Number(Number(n).toFixed(6));
}

function assertEq(label, got, exp) {
  if (typeof exp === "number") {
    const g = round6(got);
    const e = round6(exp);
    if (g !== e) throw new Error(`${label}: expected ${e} got ${g}`);
    return;
  }
  if (got !== exp) throw new Error(`${label}: expected ${exp} got ${got}`);
}

function byCreatedAsc(a, b) {
  return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
}

function byCreatedDesc(a, b) {
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
}

function buildStoryBundle(ledger, storyId) {
  const story = (ledger.stories ?? []).find((s) => s.story_id === storyId);
  if (!story) throw new Error(`bundle_hash: story not found ${storyId}`);

  const versions = (ledger.story_versions ?? [])
    .filter((v) => v.story_id === storyId)
    .sort(byCreatedDesc);
  const claims = (ledger.claims ?? [])
    .filter((c) => c.story_id === storyId)
    .sort(byCreatedAsc);
  const claimIds = new Set(claims.map((c) => c.claim_id));
  const evidence_edges = (ledger.claim_evidence_edges ?? [])
    .filter((edge) => claimIds.has(edge.claim_id))
    .sort(byCreatedAsc)
    .map((edge) => ({
      claim_id: edge.claim_id,
      evidence_id_hash: edge.evidence_id_hash,
      relation: edge.relation === "context_only" ? "context" : edge.relation,
      strength: Number(edge.strength ?? 0.5)
    }));
  const corrections = (ledger.corrections ?? [])
    .filter((correction) => claimIds.has(correction.claim_id))
    .sort(byCreatedAsc)
    .map((correction) => ({
      correction_id: correction.correction_id,
      claim_id: correction.claim_id,
      reason: correction.reason,
      created_at: correction.created_at
    }));

  return {
    story: { ...story, versions },
    claims,
    evidence_edges,
    corrections
  };
}

async function execInSchema(client, schema, sql) {
  await client.query(`SET search_path TO ${schema}, public;`);
  return client.query(sql);
}

async function insertRows(client, table, rows) {
  if (!rows || rows.length === 0) return;

  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");

  for (const row of rows) {
    const vals = cols.map((c) => row[c]);
    const params = vals.map((_, i) => `$${i + 1}`).join(", ");
    const q = `INSERT INTO ${table} (${colList}) VALUES (${params})`;
    await client.query(q, vals);
  }
}

async function runFixture(pool, fixturePath) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const schema = schemaName();

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema};`);
    await execInSchema(client, schema, SCHEMA_SQL);

    const ledger = fixture.ledger;

    await insertRows(client, "stories", ledger.stories ?? []);
    await insertRows(client, "story_versions", ledger.story_versions ?? []);
    await insertRows(client, "claims", (ledger.claims ?? []).map((c) => ({
      jurisdiction: null,
      confidence_model: null,
      confidence_review: null,
      ...c,
      // Stringify AFTER the spread: pg sends a raw JS array as a Postgres array
      // literal, which a jsonb column rejects ("invalid input syntax for type json").
      entities: JSON.stringify(c.entities ?? []),
      time_window: JSON.stringify(c.time_window ?? {})
    })));
    await insertRows(client, "evidence_objects", (ledger.evidence_objects ?? []).map((e) => ({
      extracted_text: null,
      ...e,
      provenance: JSON.stringify(e.provenance ?? {})
    })));
    await insertRows(client, "claim_evidence_edges", (ledger.claim_evidence_edges ?? []).map((e) => ({
      reviewer_actor_id: e.reviewer_actor_id ?? null,
      notes: e.notes ?? null,
      ...e
    })));
    await insertRows(client, "corrections", (ledger.corrections ?? []).map((c) => ({
      ...c,
      details: JSON.stringify(c.details ?? {})
    })));

    const P = fixture.policy_pack;
    const req = fixture.request;

    const gateArgs = [
      req.platform_id,
      req.story_id,
      req.story_version_id,
      P.evidence.primary_source_classes,
      P.evidence.independence_key_fields,
      P.claim.high_impact_claim_types,
      P.claim.high_impact_regexes,
      P.publish_gates.min_primary_evidence_ratio,
      P.publish_gates.max_unsupported_claim_share,
      P.publish_gates.max_contradicted_claims,
      P.publish_gates.require_high_impact_corroboration,
      P.publish_gates.high_impact_min_independent_sources
    ];

    const gateRes = await execInSchema(client, schema, { text: GATE_SQL, values: gateArgs });
    if (gateRes.rowCount !== 1) throw new Error(`Gate query returned ${gateRes.rowCount} rows`);

    const row = gateRes.rows[0];
    const exp = fixture.expected;

    assertEq("total_claims", Number(row.total_claims), exp.total_claims);
    assertEq("unsupported_claims", Number(row.unsupported_claims), exp.unsupported_claims);
    assertEq("contradicted_claims", Number(row.contradicted_claims), exp.contradicted_claims);
    assertEq("primary_supported_claims", Number(row.primary_supported_claims), exp.primary_supported_claims);

    assertEq("primary_evidence_ratio", Number(row.primary_evidence_ratio), exp.primary_evidence_ratio);
    assertEq("unsupported_claim_share", Number(row.unsupported_claim_share), exp.unsupported_claim_share);

    assertEq("high_impact_claims", Number(row.high_impact_claims), exp.high_impact_claims);
    assertEq("high_impact_corroborated", Number(row.high_impact_corroborated), exp.high_impact_corroborated);

    assertEq("corroboration_ok", Boolean(row.corroboration_ok), exp.corroboration_ok);
    assertEq("publish_gate_pass", Boolean(row.publish_gate_pass), exp.publish_gate_pass);

    if (exp.bundle_hash) {
      const bundleHash = hashCanonical(buildStoryBundle(ledger, req.story_id));
      assertEq("bundle_hash", bundleHash, exp.bundle_hash);
    }

    if (exp.checkpoint_merkle_root) {
      const leafHashes = (fixture.checkpoint_events ?? []).map((event) => merkleLeafHash(event));
      assertEq("checkpoint_merkle_root", merkleRoot(leafHashes), exp.checkpoint_merkle_root);
    }

    // transactional publish assertions
    const publishArgs = [...gateArgs, P.policy_pack_version];

    if (exp.publish_gate_pass === true) {
      await client.query("BEGIN");
      const pubRes = await execInSchema(client, schema, { text: PUBLISH_TXN_SQL, values: publishArgs });
      await client.query("COMMIT");

      const st = String(pubRes.rows?.[0]?.story_state ?? "");
      const oc = Number(pubRes.rows?.[0]?.outbox_count ?? -1);
      assertEq("publish_txn.story_state", st, "published");
      assertEq("publish_txn.outbox_count", oc, 1);
    } else {
      // Contract: publish_txn.sql is NON-RAISING. A failed gate is a refusal:
      // it returns publish_gate_pass=false and writes no outbox row. An
      // exception here is a real defect, not an expected failure.
      await client.query("BEGIN");
      let refusal;
      try {
        refusal = await execInSchema(client, schema, { text: PUBLISH_TXN_SQL, values: publishArgs });
      } finally {
        await client.query("ROLLBACK");
      }
      const refusalRow = refusal?.rows?.[0];
      if (!refusalRow) throw new Error("publish_txn: refusal returned no row");
      assertEq("publish_txn.publish_gate_pass", Boolean(refusalRow.publish_gate_pass), false);
      assertEq("publish_txn.refusal_outbox_count", Number(refusalRow.outbox_count), 0);

      const check = await execInSchema(
        client,
        schema,
        {
          text: `
            SELECT
              (SELECT state FROM stories WHERE platform_id=$1 AND story_id=$2) AS story_state,
              (SELECT COUNT(*)::int FROM event_outbox WHERE platform_id=$1 AND event_type='story.published.v1') AS outbox_count
          `,
          values: [req.platform_id, req.story_id]
        }
      );

      const st = String(check.rows?.[0]?.story_state ?? "");
      const oc = Number(check.rows?.[0]?.outbox_count ?? -1);

      const expectedInitialState = String((ledger.stories?.[0]?.state ?? "review"));
      assertEq("publish_txn.story_state", st, expectedInitialState);
      assertEq("publish_txn.outbox_count", oc, 0);
    }

    await client.query(`DROP SCHEMA ${schema} CASCADE;`);
    return { fixture_id: fixture.fixture_id, ok: true };
  } catch (err) {
    try { await client.query(`DROP SCHEMA ${schema} CASCADE;`); } catch {}
    return { fixture_id: fixture.fixture_id, ok: false, error: String(err?.message ?? err) };
  } finally {
    client.release();
  }
}

async function runBundleReplayTest(pool) {
  const fixtureId = "CT-BUNDLE-01";
  const bundlePath = path.join(BUNDLE_FIXTURE_DIR, "civic-council-budget-amendment.json");

  if (!fs.existsSync(bundlePath)) {
    return { fixture_id: fixtureId, ok: false, error: "Bundle fixture not found" };
  }

  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
  const schema = schemaName();

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema};`);
    await client.query(`SET search_path TO ${schema}, public;`);
    await client.query(SCHEMA_SQL);

    // Seed all bundle objects
    if (bundle.actors) await insertRows(client, "actors", bundle.actors);
    if (bundle.coi_disclosures) await insertRows(client, "coi_disclosures", bundle.coi_disclosures);

    await insertRows(client, "stories", bundle.ledger.stories);
    await insertRows(client, "story_versions", bundle.ledger.story_versions);
    await insertRows(client, "evidence_objects", bundle.ledger.evidence_objects.map((e) => ({
      ...e,
      provenance: JSON.stringify(e.provenance)
    })));
    await insertRows(client, "claims", bundle.ledger.claims.map((c) => ({
      ...c,
      entities: JSON.stringify(c.entities ?? []),
      time_window: JSON.stringify(c.time_window ?? {})
    })));
    await insertRows(client, "claim_evidence_edges", bundle.ledger.claim_evidence_edges);
    if (bundle.ledger.corrections) {
      await insertRows(client, "corrections", bundle.ledger.corrections.map((c) => ({
        ...c,
        details: JSON.stringify(c.details ?? {})
      })));
    }

    // Validate invariants
    // I8: Claims reference exactly one story version
    const claimsQ = await client.query(`SELECT claim_id, story_version_id FROM claims`);
    for (const claim of claimsQ.rows) {
      const versionExists = await client.query(
        `SELECT 1 FROM story_versions WHERE story_version_id = $1`,
        [claim.story_version_id]
      );
      if (versionExists.rowCount === 0) {
        throw new Error(`I8 violated: Claim ${claim.claim_id} references non-existent version ${claim.story_version_id}`);
      }
    }

    // I9: Evidence edges reference existing objects
    const edgesQ = await client.query(`SELECT edge_id, evidence_id_hash FROM claim_evidence_edges`);
    for (const edge of edgesQ.rows) {
      const evidenceExists = await client.query(
        `SELECT 1 FROM evidence_objects WHERE evidence_id_hash = $1`,
        [edge.evidence_id_hash]
      );
      if (evidenceExists.rowCount === 0) {
        throw new Error(`I9 violated: Edge ${edge.edge_id} references non-existent evidence ${edge.evidence_id_hash}`);
      }
    }

    // I10: Corrections reference existing claims
    const correctionsQ = await client.query(`SELECT correction_id, claim_id FROM corrections`);
    for (const corr of correctionsQ.rows) {
      const claimExists = await client.query(
        `SELECT 1 FROM claims WHERE claim_id = $1`,
        [corr.claim_id]
      );
      if (claimExists.rowCount === 0) {
        throw new Error(`I10 violated: Correction ${corr.correction_id} references non-existent claim ${corr.claim_id}`);
      }
    }

    // Run gate and verify expected metrics
    const story = bundle.ledger.stories[0];
    const storyVersion = bundle.ledger.story_versions[0];
    const P = bundle.policy_pack;

    const gateArgs = [
      bundle.platform_id,
      story.story_id,
      storyVersion.story_version_id,
      P.evidence.primary_source_classes,
      P.evidence.independence_key_fields,
      P.claim.high_impact_claim_types,
      P.claim.high_impact_regexes,
      P.publish_gates.min_primary_evidence_ratio,
      P.publish_gates.max_unsupported_claim_share,
      P.publish_gates.max_contradicted_claims,
      P.publish_gates.require_high_impact_corroboration,
      P.publish_gates.high_impact_min_independent_sources
    ];

    const gateRes = await execInSchema(client, schema, { text: GATE_SQL, values: gateArgs });
    if (gateRes.rowCount !== 1) throw new Error(`Gate query returned ${gateRes.rowCount} rows`);

    const gateRow = gateRes.rows[0];
    const expected = bundle.expected_gate;

    assertEq("total_claims", Number(gateRow.total_claims), expected.total_claims);
    assertEq("unsupported_claims", Number(gateRow.unsupported_claims), expected.unsupported_claims);
    assertEq("contradicted_claims", Number(gateRow.contradicted_claims), expected.contradicted_claims);
    assertEq("primary_supported_claims", Number(gateRow.primary_supported_claims), expected.primary_supported_claims);
    assertEq("primary_evidence_ratio", Number(gateRow.primary_evidence_ratio), expected.primary_evidence_ratio);
    assertEq("unsupported_claim_share", Number(gateRow.unsupported_claim_share), expected.unsupported_claim_share);
    assertEq("high_impact_claims", Number(gateRow.high_impact_claims), expected.high_impact_claims);
    assertEq("high_impact_corroborated", Number(gateRow.high_impact_corroborated), expected.high_impact_corroborated);
    assertEq("corroboration_ok", Boolean(gateRow.corroboration_ok), expected.corroboration_ok);
    assertEq("publish_gate_pass", Boolean(gateRow.publish_gate_pass), expected.publish_gate_pass);

    // Test publish transaction
    if (expected.publish_gate_pass) {
      const publishArgs = [...gateArgs, P.policy_pack_version];
      await client.query("BEGIN");
      const pubRes = await execInSchema(client, schema, { text: PUBLISH_TXN_SQL, values: publishArgs });
      await client.query("COMMIT");

      const pubRow = pubRes.rows[0];
      assertEq("publish.story_state", String(pubRow.story_state), "published");
      assertEq("publish.outbox_count", Number(pubRow.outbox_count), 1);
    }

    await client.query(`DROP SCHEMA ${schema} CASCADE;`);
    return { fixture_id: fixtureId, ok: true };
  } catch (err) {
    try { await client.query(`DROP SCHEMA ${schema} CASCADE;`); } catch {}
    return { fixture_id: fixtureId, ok: false, error: String(err?.message ?? err) };
  } finally {
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString: POSTGRES_URI });

  let failed = 0;
  for (const f of FIXTURE_FILES) {
    const fp = path.join(FIXTURES_DIR, f);
    const r = await runFixture(pool, fp);
    if (!r.ok) {
      failed += 1;
      console.error(`[FAIL] ${r.fixture_id}: ${r.error}`);
    } else {
      console.log(`[OK] ${r.fixture_id}`);
    }
  }

  // Bundle replay conformance test (CT-BUNDLE-01)
  const bundleReplayResult = await runBundleReplayTest(pool);
  if (!bundleReplayResult.ok) {
    failed += 1;
    console.error(`[FAIL] ${bundleReplayResult.fixture_id}: ${bundleReplayResult.error}`);
  } else {
    console.log(`[OK] ${bundleReplayResult.fixture_id}`);
  }

  await pool.end();

  if (failed > 0) process.exit(1);
  console.log("All conformance tests passed.");
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});

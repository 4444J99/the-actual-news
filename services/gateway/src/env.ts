import fs from "node:fs";
import path from "node:path";

export type PolicyPack = {
  policy_pack_version: string;
  publish_gates: {
    min_primary_evidence_ratio: number;
    max_unsupported_claim_share: number;
    max_contradicted_claims: number;
    require_high_impact_corroboration: boolean;
    high_impact_min_independent_sources: number;
  };
  evidence: {
    primary_source_classes: string[];
    independence_key_fields: string[];
  };
  claim: {
    high_impact_claim_types: string[];
    high_impact_regexes: string[];
  };
};

export type Env = {
  PLATFORM_ID: string;
  POSTGRES_URI: string;
  POLICY_PACK: PolicyPack;
};

export function loadEnv(): Env {
  const PLATFORM_ID = process.env.PLATFORM_ID ?? "";
  const POSTGRES_URI = process.env.POSTGRES_URI ?? "";

  if (!PLATFORM_ID) throw new Error("Missing $PLATFORM_ID");
  if (!POSTGRES_URI) throw new Error("Missing $POSTGRES_URI");

  const policyPath =
    process.env.POLICY_PACK_PATH ??
    path.resolve(process.cwd(), "..", "..", "contracts", "policy-packs", "v1.0.0.json");

  let POLICY_PACK: PolicyPack;
  try {
    const raw = fs.readFileSync(policyPath, "utf8");
    POLICY_PACK = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Failed to load policy pack from ${policyPath}: ${err?.message ?? err}`, { cause: err });
  }

  return { PLATFORM_ID, POSTGRES_URI, POLICY_PACK };
}

export const DEFAULT_PORT = 8080;

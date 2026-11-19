import { createHash } from "node:crypto";
import { monotonicFactory, decodeTime } from "ulid";

// Shared identity helpers (the-actual-news#111).
//
// Before this module, nine per-service copies of a home-grown generator
// (`Date.now()` base36 + random hex, sliced to 26 chars) minted entity ids,
// plus two weaker `Math.random()` variants in the gateway. That generator is
// NOT a ULID: it is not Crockford base32, not time-ordered, and not
// monotonic within a millisecond — while the spec (§43, `$ULID`) requires a
// 26-char ULID string for all mutable-entity identifiers. Every service now
// imports newId() from here, so there is exactly one id generator to audit.
//
// newId() uses the `ulid` package's monotonic factory (the plain ulid()
// export is NOT monotonic within a millisecond): ids sort in creation order,
// and two ids minted in the same millisecond are distinct and ordered.
const monotonicUlid = monotonicFactory();

export function newId(): string {
  return monotonicUlid();
}

// True only for a well-formed Crockford-base32 ULID (26 chars, no I/L/O/U).
export function isUlid(value: unknown): boolean {
  if (typeof value !== "string" || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value)) {
    return false;
  }
  try {
    decodeTime(value);
    return true;
  } catch {
    return false;
  }
}

// Content addressing, in the same `sha256:<hex>` form the ingestion fetcher
// has always used: evidence_id_hash, source capture content_hash, and claim
// text_hash all go through here so the forms cannot drift apart again.
export function contentHash(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}

// The bare hex behind a `sha256:<hex>` hash: the form blob URIs and blob
// filenames share (blob://local/<hex> <-> <hex>.blob).
export function hashHex(hash: string): string {
  return hash.replace(/^sha256:/, "");
}

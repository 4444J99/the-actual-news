import { describe, it, expect } from "vitest";
import { newId, isUlid, contentHash, hashHex } from "../index.js";

describe("newId (shared ULID)", () => {
  it("mints 26-char Crockford ULIDs", () => {
    for (let i = 0; i < 100; i++) {
      const id = newId();
      expect(id).toHaveLength(26);
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(isUlid(id)).toBe(true);
    }
  });

  it("is monotonic and unique across 10k ids", () => {
    const ids = Array.from({ length: 10000 }, () => newId());
    expect(new Set(ids).size).toBe(10000);
    // Monotonic factory: the sequence never decreases, within one
    // millisecond (random part increments) or across milliseconds
    // (timestamp part increases).
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i] >= ids[i - 1]).toBe(true);
    }
  });

  it("rejects the old home-grown format", () => {
    // Date.now() base36 + random hex can contain I/L/O/U and is not
    // Crockford base32; the old generator's output must not validate.
    const good = newId();
    expect(isUlid(good)).toBe(true);
    expect(isUlid(good.slice(0, 25) + "I")).toBe(false);
    expect(isUlid("not-an-id")).toBe(false);
    expect(isUlid(42)).toBe(false);
  });
});

describe("contentHash", () => {
  it("is a stable sha256:<hex> hash", () => {
    expect(contentHash("hello")).toBe(
      "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    expect(contentHash("hello")).toBe(contentHash("hello"));
    expect(hashHex(contentHash("hello"))).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });
});

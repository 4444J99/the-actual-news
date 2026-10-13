import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PORT, loadEnv } from "./env.js";

const KEYS = ["PLATFORM_ID", "POSTGRES_URI"] as const;
type Key = (typeof KEYS)[number];

// Capture the pre-test environment so every synthetic value is restored after
// every test — both originally-absent and originally-present entries.
const ORIGINAL: Record<Key, string | undefined> = {
  PLATFORM_ID: process.env.PLATFORM_ID,
  POSTGRES_URI: process.env.POSTGRES_URI,
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of KEYS) {
    if (ORIGINAL[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = ORIGINAL[k];
    }
  }
});

function stubBoth(
  platformId: string | undefined,
  postgresUri: string | undefined,
) {
  if (platformId === undefined) {
    delete process.env.PLATFORM_ID;
  } else {
    vi.stubEnv("PLATFORM_ID", platformId);
  }
  if (postgresUri === undefined) {
    delete process.env.POSTGRES_URI;
  } else {
    vi.stubEnv("POSTGRES_URI", postgresUri);
  }
}

describe("loadEnv required-variable guard", () => {
  it("throws for a missing PLATFORM_ID", () => {
    stubBoth(undefined, "postgres://db:5432/news");
    expect(() => loadEnv()).toThrow("Missing $PLATFORM_ID");
  });

  it("throws for a missing POSTGRES_URI", () => {
    stubBoth("records-watch", undefined);
    expect(() => loadEnv()).toThrow("Missing $POSTGRES_URI");
  });

  it("throws for empty values", () => {
    stubBoth("", "");
    expect(() => loadEnv()).toThrow();
  });

  it("rejects whitespace-only PLATFORM_ID", () => {
    stubBoth("   ", "postgres://db:5432/news");
    expect(() => loadEnv()).toThrow("Missing $PLATFORM_ID");
  });

  it("rejects whitespace-only POSTGRES_URI", () => {
    stubBoth("records-watch", " \t\n ");
    expect(() => loadEnv()).toThrow("Missing $POSTGRES_URI");
  });

  it("rejects whitespace-only values for both keys", () => {
    stubBoth("\t", "\n\n");
    expect(() => loadEnv()).toThrow();
  });

  it("returns valid values unchanged (exact bytes, no silent normalization)", () => {
    stubBoth("  records-watch  ", "postgres://db:5432/news");
    expect(loadEnv()).toEqual({
      PLATFORM_ID: "  records-watch  ",
      POSTGRES_URI: "postgres://db:5432/news",
    });
  });

  it("accepts both valid keys", () => {
    stubBoth("records-watch", "postgres://db:5432/news");
    expect(loadEnv()).toEqual({
      PLATFORM_ID: "records-watch",
      POSTGRES_URI: "postgres://db:5432/news",
    });
  });

  it("restores originally-absent and originally-present entries after every test", () => {
    expect(ORIGINAL.PLATFORM_ID).toBeUndefined();
    stubBoth(" ", " ");
    expect(() => loadEnv()).toThrow();
  });

  it("keeps DEFAULT_PORT and the public interface unchanged", () => {
    expect(DEFAULT_PORT).toBe(8080);
    stubBoth("records-watch", "postgres://db:5432/news");
    const env = loadEnv();
    expect(Object.keys(env).sort()).toEqual(["PLATFORM_ID", "POSTGRES_URI"]);
  });
});

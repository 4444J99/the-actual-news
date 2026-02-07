export type Env = {
  PLATFORM_ID: string;
  POSTGRES_URI: string;
};

export function loadEnv(): Env {
  const PLATFORM_ID = process.env.PLATFORM_ID ?? "";
  const POSTGRES_URI = process.env.POSTGRES_URI ?? "";

  if (!PLATFORM_ID) throw new Error("Missing $PLATFORM_ID");
  if (!POSTGRES_URI) throw new Error("Missing $POSTGRES_URI");

  return { PLATFORM_ID, POSTGRES_URI };
}

export const DEFAULT_PORT = 8080;

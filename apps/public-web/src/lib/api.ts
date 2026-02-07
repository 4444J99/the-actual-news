import { PUBLIC_API_URI } from "./env";

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${PUBLIC_API_URI}${path}`, { method: "GET" });
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return (await r.json()) as T;
}

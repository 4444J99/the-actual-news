export const PLATFORM_ID = process.env.NEXT_PUBLIC_PLATFORM_ID as string;
export const PUBLIC_API_URI = process.env.NEXT_PUBLIC_PUBLIC_API_URI as string;

if (!PLATFORM_ID || !PUBLIC_API_URI) {
  throw new Error("Missing NEXT_PUBLIC_PLATFORM_ID or NEXT_PUBLIC_PUBLIC_API_URI");
}

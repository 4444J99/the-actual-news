import crypto from "node:crypto";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 30000,
  headers: { "User-Agent": "RecordsWatch-Ingestion/1.0" },
});

export type FetchedArticle = {
  title: string;
  url: string;
  content: string;
  published_at: string | null;
  source_id: string;
  source_class: string;
};

// SSRF protection: block private IPs, localhost, link-local
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  /^\[::1\]$/,
  /^\[fc00:/i,
  /^\[fe80:/i,
];

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    if (BLOCKED_IP_PATTERNS.some((p) => p.test(hostname))) return true;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
    return false;
  } catch {
    return true;
  }
}

export async function fetchFeed(feedUrl: string): Promise<FetchedArticle[]> {
  if (isBlockedUrl(feedUrl)) {
    throw new Error(`Blocked URL: ${feedUrl}`);
  }

  const feed = await parser.parseURL(feedUrl);
  const articles: FetchedArticle[] = [];

  for (const item of feed.items ?? []) {
    const url = item.link || item.guid || "";
    if (!url) continue;

    const content =
      item["content:encoded"] ||
      item.content ||
      item.contentSnippet ||
      item.summary ||
      item.description ||
      "";

    articles.push({
      title: item.title || "Untitled",
      url,
      content: String(content).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      published_at: item.pubDate || item.isoDate || null,
      source_id: "", // filled by caller
      source_class: "", // filled by caller
    });
  }

  return articles;
}

export function contentHash(text: string): string {
  return "sha256:" + crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export { isBlockedUrl };
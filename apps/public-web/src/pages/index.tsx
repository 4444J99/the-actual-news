import { useEffect, useState } from "react";

type FeedItem = {
  story_id: string;
  title: string;
  state: string;
  updated_at: string;
};

const API_URI = process.env.NEXT_PUBLIC_PUBLIC_API_URI ?? "http://localhost:8080";

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URI}/v1/feed?scope=local`)
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>The Actual News</h1>
      <p style={{ color: "#666" }}>Verifiable news feed — quality-ranked, not engagement-ranked.</p>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {items.length === 0 && !error && <p>No stories yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((item) => (
          <li key={item.story_id} style={{ borderBottom: "1px solid #eee", padding: "1rem 0" }}>
            <a href={`/story/${item.story_id}`} style={{ fontSize: "1.2rem", color: "#1a1a1a", textDecoration: "none" }}>
              {item.title}
            </a>
            <div style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.25rem" }}>
              {item.state} &middot; {new Date(item.updated_at).toLocaleDateString()}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

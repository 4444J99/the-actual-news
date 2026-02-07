import { useRouter } from "next/router";
import { useEffect, useState } from "react";

type StoryBundle = {
  story: {
    story_id: string;
    title: string;
    state: string;
    versions: { story_version_id: string; body_markdown: string; created_at: string }[];
  };
  claims: {
    claim_id: string;
    text: string;
    claim_type: string;
    support_status: string;
  }[];
  evidence_edges: {
    claim_id: string;
    evidence_id_hash: string;
    relation: string;
    strength: number;
  }[];
  corrections: {
    correction_id: string;
    claim_id: string;
    reason: string;
    created_at: string;
  }[];
};

const API_URI = process.env.NEXT_PUBLIC_PUBLIC_API_URI ?? "http://localhost:8080";

export default function StoryPage() {
  const router = useRouter();
  const { story_id } = router.query;
  const [bundle, setBundle] = useState<StoryBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!story_id) return;
    fetch(`${API_URI}/v1/story/${story_id}`)
      .then((r) => r.json())
      .then((data) => setBundle(data))
      .catch((e) => setError(String(e)));
  }, [story_id]);

  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!bundle) return <p>Loading...</p>;

  const latestVersion = bundle.story.versions[0];

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <a href="/" style={{ color: "#666", textDecoration: "none" }}>&larr; Feed</a>
      <h1>{bundle.story.title}</h1>
      <span style={{ background: bundle.story.state === "published" ? "#e6f4ea" : "#fff3e0", padding: "2px 8px", borderRadius: 4, fontSize: "0.85rem" }}>
        {bundle.story.state}
      </span>

      {latestVersion && (
        <section style={{ marginTop: "2rem" }}>
          <h2>Narrative</h2>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{latestVersion.body_markdown}</div>
        </section>
      )}

      <section style={{ marginTop: "2rem" }}>
        <h2>Verification Spine</h2>
        <h3>Claims ({bundle.claims.length})</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Claim</th>
              <th style={{ padding: "0.5rem" }}>Type</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {bundle.claims.map((c) => {
              const edges = bundle.evidence_edges.filter((e) => e.claim_id === c.claim_id);
              return (
                <tr key={c.claim_id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem" }}>{c.text}</td>
                  <td style={{ padding: "0.5rem" }}>{c.claim_type}</td>
                  <td style={{ padding: "0.5rem" }}>{c.support_status}</td>
                  <td style={{ padding: "0.5rem" }}>{edges.length} edge(s)</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {bundle.corrections.length > 0 && (
          <>
            <h3>Corrections ({bundle.corrections.length})</h3>
            <ul>
              {bundle.corrections.map((cor) => (
                <li key={cor.correction_id}>
                  <strong>{cor.reason}</strong> — {new Date(cor.created_at).toLocaleDateString()}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

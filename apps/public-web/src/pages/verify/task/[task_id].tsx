import { useRouter } from "next/router";
import { useState } from "react";

const VERIFY_URI = process.env.NEXT_PUBLIC_VERIFY_URI ?? "http://localhost:8084";

export default function TaskReviewPage() {
  const router = useRouter();
  const { task_id } = router.query;

  const [verdict, setVerdict] = useState("supports");
  const [notes, setNotes] = useState("");
  const [actorId, setActorId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    try {
      const r = await fetch(`${VERIFY_URI}/v1/tasks/${task_id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_id: actorId,
          verdict,
          notes,
          evidence_edges: []
        })
      });

      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${r.status}`);
      }

      setResult("Review submitted successfully.");
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <a href="/verify" style={{ color: "#666", textDecoration: "none" }}>&larr; Queue</a>
      <h1>Review Task</h1>
      <p>Task ID: <code>{task_id}</code></p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label>
          Actor ID
          <input
            type="text"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
        </label>

        <label>
          Verdict
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          >
            <option value="supports">Supports</option>
            <option value="contradicts">Contradicts</option>
            <option value="context_only">Context Only</option>
            <option value="cannot_determine">Cannot Determine</option>
          </select>
        </label>

        <label>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
            rows={4}
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
        </label>

        <button type="submit" style={{ padding: "0.75rem", background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer" }}>
          Submit Review
        </button>
      </form>

      {result && <p style={{ color: "green", marginTop: "1rem" }}>{result}</p>}
      {error && <p style={{ color: "red", marginTop: "1rem" }}>Error: {error}</p>}
    </main>
  );
}

import { useEffect, useState } from "react";

type VerificationTask = {
  task_id: string;
  story_id: string;
  claim_id: string;
  task_type: string;
  status: string;
  created_at: string;
};

const VERIFY_URI = process.env.NEXT_PUBLIC_VERIFY_URI ?? "http://localhost:8084";

export default function VerifyQueuePage() {
  const [tasks, setTasks] = useState<VerificationTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${VERIFY_URI}/v1/tasks?status=open`)
      .then((r) => r.json())
      .then((data) => setTasks(data.items ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Verification Queue</h1>
      <p style={{ color: "#666" }}>Open tasks awaiting review.</p>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {tasks.length === 0 && !error && <p>No open tasks.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {tasks.map((t) => (
          <li key={t.task_id} style={{ borderBottom: "1px solid #eee", padding: "1rem 0" }}>
            <a href={`/verify/task/${t.task_id}`} style={{ fontSize: "1.1rem", color: "#1a1a1a", textDecoration: "none" }}>
              {t.task_type}: {t.claim_id}
            </a>
            <div style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.25rem" }}>
              Story: {t.story_id} &middot; {t.status} &middot; {new Date(t.created_at).toLocaleDateString()}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

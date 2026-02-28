import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.STORY_PORT ?? 8081);
const PLATFORM_ID = process.env.PLATFORM_ID ?? "unknown";

type Story = {
  story_id: string;
  platform_id: string;
  title: string;
  state: "draft" | "review" | "published";
  created_at: string;
  updated_at: string;
};

type StoryVersion = {
  story_version_id: string;
  story_id: string;
  body_markdown: string;
  disclosure_markdown?: string;
  created_at: string;
};

// In-memory store
const stories = new Map<string, Story>();
const versions = new Map<string, StoryVersion[]>();

function ulid(): string {
  return (
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    crypto.randomBytes(10).toString("hex").toUpperCase()
  ).slice(0, 26);
}

export const app = express();
app.use(express.json());

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "story", platform_id: PLATFORM_ID });
});

// POST /v1/stories — create a story
app.post("/v1/stories", (req, res) => {
  const { title, initial_body_markdown } = req.body ?? {};

  if (!title || typeof title !== "string") {
    return res.status(400).json({ code: "bad_request", message: "title is required" });
  }

  const now = new Date().toISOString();
  const story_id = ulid();

  const story: Story = {
    story_id,
    platform_id: PLATFORM_ID,
    title,
    state: "draft",
    created_at: now,
    updated_at: now,
  };

  stories.set(story_id, story);
  versions.set(story_id, []);

  if (initial_body_markdown) {
    const version: StoryVersion = {
      story_version_id: ulid(),
      story_id,
      body_markdown: initial_body_markdown,
      created_at: now,
    };
    versions.get(story_id)!.push(version);
  }

  return res.status(201).json(story);
});

// GET /v1/stories — list stories
app.get("/v1/stories", (req, res) => {
  const stateFilter = req.query.state ? String(req.query.state) : null;
  const limitRaw = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

  let items = Array.from(stories.values()).filter(
    (s) => s.platform_id === PLATFORM_ID
  );

  const allowedStates = new Set(["draft", "review", "published"]);
  if (stateFilter && allowedStates.has(stateFilter)) {
    items = items.filter((s) => s.state === stateFilter);
  }

  items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  items = items.slice(0, limit);

  return res.status(200).json({ items });
});

// GET /v1/stories/:story_id — get story with versions
app.get("/v1/stories/:story_id", (req, res) => {
  const story = stories.get(req.params.story_id);

  if (!story || story.platform_id !== PLATFORM_ID) {
    return res.status(404).json({ code: "not_found", message: "story not found" });
  }

  const storyVersions = versions.get(story.story_id) ?? [];

  return res.status(200).json({
    ...story,
    versions: storyVersions,
  });
});

// POST /v1/stories/:story_id/versions — add a version
app.post("/v1/stories/:story_id/versions", (req, res) => {
  const story = stories.get(req.params.story_id);

  if (!story || story.platform_id !== PLATFORM_ID) {
    return res.status(404).json({ code: "not_found", message: "story not found" });
  }

  const { body_markdown, disclosure_markdown } = req.body ?? {};

  if (!body_markdown || typeof body_markdown !== "string") {
    return res.status(400).json({ code: "bad_request", message: "body_markdown is required" });
  }

  const now = new Date().toISOString();
  const version: StoryVersion = {
    story_version_id: ulid(),
    story_id: story.story_id,
    body_markdown,
    disclosure_markdown,
    created_at: now,
  };

  const list = versions.get(story.story_id) ?? [];
  list.push(version);
  versions.set(story.story_id, list);

  story.updated_at = now;

  return res.status(201).json(version);
});

export { stories, versions };

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(JSON.stringify({ service: "story", port: PORT, platform_id: PLATFORM_ID }));
  });

  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
